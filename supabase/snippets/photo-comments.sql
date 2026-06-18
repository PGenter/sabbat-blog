alter table public.comments
  add column if not exists author_name text,
  add column if not exists author_email text;

create index if not exists comments_entry_created_idx
  on public.comments (entry_id, created_at desc);
