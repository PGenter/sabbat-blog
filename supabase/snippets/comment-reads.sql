-- Neue Kommentare für Administratoren und Superuser
--
-- comment_reads merkt sich, welche Kommentare eine Person schon gesehen hat
-- (ein Kommentar gilt als gesehen, sobald er in der Galerie beim Foto
-- angezeigt wurde). new_comment_counts() liefert pro Eintrag die Anzahl
-- der Kommentare, die die aufrufende Person noch nicht gesehen hat. Eigene
-- Kommentare zählen nie als neu. Für alle anderen Rollen ist das Ergebnis
-- leer.

-- Spaltentyp von comments.id übernehmen (uuid oder bigint)
do $$
declare
  comment_id_type text;
begin
  select format_type(atttypid, atttypmod) into comment_id_type
    from pg_attribute
   where attrelid = 'public.comments'::regclass and attname = 'id';

  execute format($ddl$
    create table if not exists public.comment_reads (
      comment_id %s not null references public.comments (id) on delete cascade,
      user_id    uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
      read_at    timestamptz not null default now(),
      constraint comment_reads_pkey primary key (comment_id, user_id)
    )
  $ddl$, comment_id_type);
end
$$;

create index if not exists comment_reads_user_idx
  on public.comment_reads (user_id);

-- Row Level Security: jede Person sieht und setzt nur ihre eigenen Einträge
alter table public.comment_reads enable row level security;

drop policy if exists "comment_reads_select_own" on public.comment_reads;
create policy "comment_reads_select_own" on public.comment_reads
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "comment_reads_insert_own" on public.comment_reads;
create policy "comment_reads_insert_own" on public.comment_reads
  for insert to authenticated
  with check (user_id = auth.uid());

-- Anzahl ungelesener Kommentare je Eintrag (nur Administrator/Superuser)
create or replace function public.new_comment_counts()
returns table (entry_id text, new_count bigint)
language sql
stable
set search_path = public
as $$
  select p.entry_id::text, count(*)
    from public.comments c
    join public.photos p on p.id = c.photo_id
   where coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
           in ('administrator', 'superuser')
     and c.user_id is distinct from auth.uid()
     and not exists (
       select 1
         from public.comment_reads r
        where r.comment_id = c.id
          and r.user_id = auth.uid()
     )
   group by p.entry_id
$$;

revoke execute on function public.new_comment_counts() from public, anon;
grant execute on function public.new_comment_counts() to authenticated;

-- Optional, einmalig: alle bereits vorhandenen Kommentare für alle
-- Administratoren und Superuser als gelesen markieren. Ohne diesen Schritt
-- gelten beim ersten Start alle bisherigen Kommentare als neu.
--
-- insert into public.comment_reads (comment_id, user_id)
-- select c.id, u.id
--   from public.comments c
--  cross join auth.users u
--  where u.raw_app_meta_data ->> 'role' in ('administrator', 'superuser')
-- on conflict do nothing;
