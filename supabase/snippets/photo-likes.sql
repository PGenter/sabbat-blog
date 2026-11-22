-- Likes ("Herzchen") für Fotos
--
-- Jede Person kann jedes Foto genau einmal liken (Primärschlüssel
-- photo_id + user_id) und den Like wieder zurücknehmen.
-- entry_id wird per Trigger aus dem Foto übernommen; darüber zählt die
-- Stationsliste die Likes pro Eintrag (entries -> photo_likes(count)).
-- Wird ein Foto, ein Eintrag oder ein User gelöscht, verschwinden die
-- zugehörigen Likes automatisch (on delete cascade).

-- Spaltentypen von photos.id und entries.id übernehmen (uuid oder bigint),
-- damit die Fremdschlüssel in jedem Fall passen.
do $$
declare
  photo_id_type text;
  entry_id_type text;
begin
  select format_type(atttypid, atttypmod) into photo_id_type
    from pg_attribute
   where attrelid = 'public.photos'::regclass and attname = 'id';

  select format_type(atttypid, atttypmod) into entry_id_type
    from pg_attribute
   where attrelid = 'public.entries'::regclass and attname = 'id';

  execute format($ddl$
    create table if not exists public.photo_likes (
      photo_id   %s not null references public.photos (id) on delete cascade,
      user_id    uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
      entry_id   %s not null references public.entries (id) on delete cascade,
      created_at timestamptz not null default now(),
      constraint photo_likes_pkey primary key (photo_id, user_id)
    )
  $ddl$, photo_id_type, entry_id_type);
end
$$;

create index if not exists photo_likes_entry_idx
  on public.photo_likes (entry_id);

-- entry_id immer aus dem Foto ableiten (der Client schickt nur photo_id)
create or replace function public.photo_likes_set_entry_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select p.entry_id into new.entry_id
    from public.photos p
   where p.id = new.photo_id;

  if new.entry_id is null then
    raise exception 'photo % not found', new.photo_id;
  end if;

  return new;
end;
$$;

drop trigger if exists photo_likes_set_entry_id on public.photo_likes;
create trigger photo_likes_set_entry_id
  before insert on public.photo_likes
  for each row execute function public.photo_likes_set_entry_id();

-- Row Level Security: alle eingeloggten User sehen alle Likes,
-- setzen und entfernen können sie nur ihre eigenen.
alter table public.photo_likes enable row level security;

drop policy if exists "photo_likes_select" on public.photo_likes;
create policy "photo_likes_select" on public.photo_likes
  for select to authenticated
  using (true);

drop policy if exists "photo_likes_insert_own" on public.photo_likes;
create policy "photo_likes_insert_own" on public.photo_likes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "photo_likes_delete_own" on public.photo_likes;
create policy "photo_likes_delete_own" on public.photo_likes
  for delete to authenticated
  using (user_id = auth.uid());
