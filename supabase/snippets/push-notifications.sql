-- Browser-Benachrichtigungen (Web Push)
--
-- Ablauf: Die Datenbank entscheidet, WER benachrichtigt wird (Trigger bzw.
-- RPC unten), und schickt die Empfängerliste per pg_net an die Edge Function
-- "send-push". Die verschickt die eigentlichen Push-Nachrichten an alle
-- registrierten Browser der Empfänger. pg_net sendet erst nach dem Commit,
-- ein abgebrochener Insert löst also nie eine Benachrichtigung aus.
--
-- Benachrichtigungsarten (jeweils pro Person abschaltbar):
--   new_entry        an alle, sobald ein Upload komplett fertig ist
--                    (außer an den Autor selbst)
--   new_comment      an Administratoren und Superuser bei jedem neuen
--                    Kommentar (außer an den Kommentarautor)
--   comment_reply    an alle, die dasselbe Foto schon kommentiert haben
--                    ("Antwort auf deinen Kommentar")
--   comment_reaction an den Kommentarautor bei einer neuen Emoji-Reaktion
-- Wer für einen Kommentar schon als comment_reply benachrichtigt wird,
-- bekommt dafür nicht zusätzlich new_comment.
--
-- Einmalige Einrichtung (nach dem Ausführen dieses Snippets):
--   1. VAPID-Schlüssel erzeugen:  npx web-push generate-vapid-keys
--   2. Secrets der Edge Function setzen:
--        npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
--          VAPID_SUBJECT=mailto:deine@adresse.de PUSH_WEBHOOK_SECRET=<zufällig>
--   3. Edge Function deployen:  npx supabase functions deploy send-push
--   4. Projekt-URL und dasselbe Webhook-Secret im Vault hinterlegen:
--        select vault.create_secret('https://<projekt-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<zufällig, wie oben>', 'push_webhook_secret');
--   5. Im Frontend VITE_VAPID_PUBLIC_KEY=<öffentlicher Schlüssel> in .env setzen.
-- Fehlen die Vault-Secrets, passiert einfach nichts (Kommentare usw.
-- funktionieren weiter, es werden nur keine Benachrichtigungen verschickt).

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Ein Eintrag pro Browser/Gerät, auf dem Benachrichtigungen aktiviert sind.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  language     text not null default 'german',
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- Welche Benachrichtigungsarten eine Person möchte (gilt für alle Geräte).
-- Fehlt die Zeile, gelten alle Arten als eingeschaltet.
create table if not exists public.notification_settings (
  user_id          uuid primary key default auth.uid()
                   references auth.users (id) on delete cascade,
  new_entry        boolean not null default true,
  new_comment      boolean not null default true,
  comment_reply    boolean not null default true,
  comment_reaction boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- Merkt sich, für welche Einträge schon benachrichtigt wurde, damit ein
-- Upload nie doppelt gemeldet wird.
create table if not exists public.push_entry_notified (
  entry_id    text primary key,
  notified_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());
-- Anlegen/Ändern nur über register_push_subscription() (siehe unten), weil
-- ein Gerät nach einem User-Wechsel neu zugeordnet werden muss.

alter table public.notification_settings enable row level security;

drop policy if exists "notification_settings_select_own" on public.notification_settings;
create policy "notification_settings_select_own" on public.notification_settings
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_settings_insert_own" on public.notification_settings;
create policy "notification_settings_insert_own" on public.notification_settings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_settings_update_own" on public.notification_settings;
create policy "notification_settings_update_own" on public.notification_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nur für Funktionen dieses Snippets, nicht für Clients.
alter table public.push_entry_notified enable row level security;

-- ---------------------------------------------------------------------------
-- Geräte an- und abmelden
-- ---------------------------------------------------------------------------

create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_language   text default 'german',
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.push_subscriptions
    (user_id, endpoint, p256dh, auth, language, user_agent)
  values
    (auth.uid(), p_endpoint, p_p256dh, p_auth,
     case when p_language = 'spanish' then 'spanish' else 'german' end,
     left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        language   = excluded.language,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and user_id = auth.uid();
$$;

revoke execute on function public.register_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated;
revoke execute on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Hat die Person mindestens ein Gerät angemeldet und die Art nicht
-- abgeschaltet?
create or replace function public.push_wants(p_user_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.push_subscriptions s where s.user_id = p_user_id)
     and coalesce((
       select case p_kind
                when 'new_entry'        then ns.new_entry
                when 'new_comment'      then ns.new_comment
                when 'comment_reply'    then ns.comment_reply
                when 'comment_reaction' then ns.comment_reaction
              end
         from public.notification_settings ns
        where ns.user_id = p_user_id
     ), true)
$$;

-- Übergibt eine Benachrichtigung an die Edge Function. Darf niemals den
-- auslösenden Insert scheitern lassen.
create or replace function public.push_dispatch(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Nichts zu verschicken?
  if not exists (
    select 1
      from jsonb_array_elements(coalesce(p_payload -> 'groups', '[]'::jsonb)) g
     where jsonb_array_length(coalesce(g -> 'user_ids', '[]'::jsonb)) > 0
  ) then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';

  if v_url is null or v_secret is null then
    raise notice 'push_dispatch: Vault-Secrets project_url/push_webhook_secret fehlen';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-secret', v_secret),
    body    := p_payload
  );
exception when others then
  raise warning 'push_dispatch fehlgeschlagen: %', sqlerrm;
end;
$$;

revoke execute on function public.push_wants(uuid, text) from public, anon, authenticated;
revoke execute on function public.push_dispatch(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Neuer Eintrag – wird vom Client aufgerufen, sobald alle Fotos hoch-
--    geladen sind (ein Trigger auf entries käme zu früh: da sind noch keine
--    Fotos da, und ein fehlgeschlagener Upload wird wieder gelöscht).
-- ---------------------------------------------------------------------------

create or replace function public.notify_entry_published(p_entry_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry  record;
  v_actor  text;
  v_users  jsonb;
begin
  select e.id::text as id, e.user_id, e.title, e.title_es
    into v_entry
    from public.entries e
   where e.id::text = p_entry_id;

  if v_entry.id is null then
    raise exception 'entry % not found', p_entry_id;
  end if;

  if v_entry.user_id is distinct from auth.uid()
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'administrator' then
    raise exception 'not allowed';
  end if;

  -- Jeder Eintrag wird nur einmal gemeldet
  insert into public.push_entry_notified (entry_id) values (v_entry.id)
  on conflict do nothing;
  if not found then
    return;
  end if;

  select coalesce(u.raw_user_meta_data ->> 'display_name',
                  u.raw_user_meta_data ->> 'first_name',
                  split_part(u.email, '@', 1))
    into v_actor
    from auth.users u
   where u.id = v_entry.user_id;

  select coalesce(jsonb_agg(distinct s.user_id), '[]'::jsonb)
    into v_users
    from public.push_subscriptions s
   where s.user_id is distinct from v_entry.user_id
     and public.push_wants(s.user_id, 'new_entry');

  perform public.push_dispatch(jsonb_build_object(
    'entry_id',       v_entry.id,
    'entry_title',    v_entry.title,
    'entry_title_es', v_entry.title_es,
    'actor_name',     v_actor,
    'groups', jsonb_build_array(
      jsonb_build_object('kind', 'new_entry', 'user_ids', v_users))
  ));
end;
$$;

revoke execute on function public.notify_entry_published(text) from public, anon;
grant execute on function public.notify_entry_published(text) to authenticated;

-- Bereits vorhandene Einträge als "gemeldet" markieren, damit ein späterer
-- Aufruf für einen alten Eintrag nichts verschickt.
insert into public.push_entry_notified (entry_id)
select id::text from public.entries
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2) + 4) Neuer Kommentar: Admins/Superuser und frühere Kommentatoren
-- ---------------------------------------------------------------------------

create or replace function public.comments_notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   record;
  v_replies jsonb;
  v_admins  jsonb;
begin
  select e.id::text as id, e.title, e.title_es
    into v_entry
    from public.photos p
    join public.entries e on e.id = p.entry_id
   where p.id = new.photo_id;

  -- Alle, die dieses Foto schon kommentiert haben
  select coalesce(jsonb_agg(distinct c.user_id), '[]'::jsonb)
    into v_replies
    from public.comments c
   where c.photo_id = new.photo_id
     and c.id <> new.id
     and c.user_id is not null
     and c.user_id is distinct from new.user_id
     and public.push_wants(c.user_id, 'comment_reply');

  -- Administratoren und Superuser, die nicht schon als Antwort benachrichtigt
  -- werden
  select coalesce(jsonb_agg(u.id), '[]'::jsonb)
    into v_admins
    from auth.users u
   where u.raw_app_meta_data ->> 'role' in ('administrator', 'superuser')
     and u.id is distinct from new.user_id
     and not (v_replies ? u.id::text)
     and public.push_wants(u.id, 'new_comment');

  perform public.push_dispatch(jsonb_build_object(
    'entry_id',        v_entry.id,
    'entry_title',     v_entry.title,
    'entry_title_es',  v_entry.title_es,
    'photo_id',        new.photo_id::text,
    'comment_id',      new.id::text,
    'actor_name',      new.author_name,
    'comment_excerpt', left(new.content, 140),
    'groups', jsonb_build_array(
      jsonb_build_object('kind', 'comment_reply', 'user_ids', v_replies),
      jsonb_build_object('kind', 'new_comment',   'user_ids', v_admins))
  ));

  return null;
exception when others then
  raise warning 'comments_notify_push fehlgeschlagen: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists comments_notify_push on public.comments;
create trigger comments_notify_push
  after insert on public.comments
  for each row execute function public.comments_notify_push();

-- ---------------------------------------------------------------------------
-- 3) Neue Emoji-Reaktion an den Kommentarautor
--    (nur beim ersten Reagieren; ein Wechsel des Emojis meldet sich nicht
--    erneut, sonst würde jedes Durchprobieren eine Nachricht auslösen)
-- ---------------------------------------------------------------------------

create or replace function public.comment_reactions_notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment record;
  v_users   jsonb := '[]'::jsonb;
begin
  select c.user_id, c.photo_id::text as photo_id, c.content,
         e.id::text as entry_id, e.title, e.title_es
    into v_comment
    from public.comments c
    join public.photos p on p.id = c.photo_id
    join public.entries e on e.id = p.entry_id
   where c.id = new.comment_id;

  if v_comment.user_id is not null
     and v_comment.user_id is distinct from new.user_id
     and public.push_wants(v_comment.user_id, 'comment_reaction') then
    v_users := jsonb_build_array(v_comment.user_id);
  end if;

  perform public.push_dispatch(jsonb_build_object(
    'entry_id',        v_comment.entry_id,
    'entry_title',     v_comment.title,
    'entry_title_es',  v_comment.title_es,
    'photo_id',        v_comment.photo_id,
    'comment_id',      new.comment_id::text,
    'actor_name',      new.author_name,
    'emoji',           new.emoji,
    'comment_excerpt', left(v_comment.content, 80),
    'groups', jsonb_build_array(
      jsonb_build_object('kind', 'comment_reaction', 'user_ids', v_users))
  ));

  return null;
exception when others then
  raise warning 'comment_reactions_notify_push fehlgeschlagen: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists comment_reactions_notify_push on public.comment_reactions;
create trigger comment_reactions_notify_push
  after insert on public.comment_reactions
  for each row execute function public.comment_reactions_notify_push();
