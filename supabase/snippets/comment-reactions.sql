-- Emoji-Reaktionen auf Kommentare
--
-- Jede Person kann auf jeden Kommentar genau eine Reaktion vergeben
-- (Primärschlüssel comment_id + user_id). Eine neue Auswahl ersetzt die
-- bisherige (upsert), ein erneuter Klick auf dieselbe Reaktion nimmt sie
-- zurück (delete). author_name wird wie bei den Kommentaren mitgespeichert,
-- damit die Galerie anzeigen kann, wer reagiert hat.
-- Wird ein Kommentar oder ein User gelöscht, verschwinden die zugehörigen
-- Reaktionen automatisch (on delete cascade).

-- Spaltentyp von comments.id übernehmen (uuid oder bigint)
do $$
declare
  comment_id_type text;
begin
  select format_type(atttypid, atttypmod) into comment_id_type
    from pg_attribute
   where attrelid = 'public.comments'::regclass and attname = 'id';

  execute format($ddl$
    create table if not exists public.comment_reactions (
      comment_id  %s not null references public.comments (id) on delete cascade,
      user_id     uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
      emoji       text not null,
      author_name text,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now(),
      constraint comment_reactions_pkey primary key (comment_id, user_id),
      constraint comment_reactions_emoji_check
        check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥'))
    )
  $ddl$, comment_id_type);
end
$$;

create index if not exists comment_reactions_comment_idx
  on public.comment_reactions (comment_id);

-- updated_at bei einer geänderten Auswahl mitziehen
create or replace function public.comment_reactions_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists comment_reactions_touch on public.comment_reactions;
create trigger comment_reactions_touch
  before update on public.comment_reactions
  for each row execute function public.comment_reactions_touch();

-- Row Level Security: alle eingeloggten User sehen alle Reaktionen,
-- setzen, ändern und entfernen können sie nur ihre eigenen.
alter table public.comment_reactions enable row level security;

drop policy if exists "comment_reactions_select" on public.comment_reactions;
create policy "comment_reactions_select" on public.comment_reactions
  for select to authenticated
  using (true);

drop policy if exists "comment_reactions_insert_own" on public.comment_reactions;
create policy "comment_reactions_insert_own" on public.comment_reactions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "comment_reactions_update_own" on public.comment_reactions;
create policy "comment_reactions_update_own" on public.comment_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "comment_reactions_delete_own" on public.comment_reactions;
create policy "comment_reactions_delete_own" on public.comment_reactions
  for delete to authenticated
  using (user_id = auth.uid());
