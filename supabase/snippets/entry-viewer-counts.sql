-- Besucher-Zähler für Einträge.
--
-- Problem: Die Row-Level-Security auf public.visited_entries gibt jedem Nutzer
-- nur seine eigenen Zeilen frei. Ein eingebettetes visited_entries(count) in der
-- entries-Abfrage zählt deshalb immer nur 0 oder 1 (die eigene Zeile), statt
-- "wie viele Nutzer haben den Eintrag gesehen".
--
-- Lösung: Eine SECURITY DEFINER Funktion, die ausschließlich aggregierte Zahlen
-- zurückgibt (keine user_ids, keine Zeitpunkte) und dadurch die RLS umgeht.
-- (user_id, entry_id) ist in visited_entries eindeutig, daher entspricht
-- count(distinct user_id) der Anzahl unterschiedlicher Betrachter.

create or replace function public.entry_viewer_counts()
returns table (entry_id uuid, viewer_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select entry_id, count(distinct user_id)::bigint as viewer_count
  from public.visited_entries
  group by entry_id;
$$;

revoke all on function public.entry_viewer_counts() from public;
grant execute on function public.entry_viewer_counts() to anon, authenticated;
