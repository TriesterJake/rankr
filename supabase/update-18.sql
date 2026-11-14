-- ---------- Update 18: spoiler warnings ----------

-- RankR update 18. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it BEFORE deploying the matching app version.
--
-- * A list can warn that the whole list has spoilers ("Spoilers for Attack on Titan").
-- * Single items can be marked as spoilers for something.
-- * Each person keeps a private list of things they've seen ("spoilers_seen"), so those spoilers aren't hidden for them.
-- Marking spoilers doesn't send friends an "updated" notification.

alter table public.lists add column if not exists spoiler text not null default '';
alter table public.list_items add column if not exists spoiler text not null default '';
alter table public.lists drop constraint if exists lists_spoiler_len;
alter table public.lists add constraint lists_spoiler_len check (char_length(spoiler) <= 80);
alter table public.list_items drop constraint if exists list_items_spoiler_len;
alter table public.list_items add constraint list_items_spoiler_len check (char_length(spoiler) <= 80);

-- Things you've seen, stored as idea_key(topic) so "Attack on Titan" and "attack on titan!" match.
create table if not exists public.spoilers_seen (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  k          text not null check (char_length(k) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (user_id, k)
);
alter table public.spoilers_seen enable row level security;
drop policy if exists "see my seen spoilers" on public.spoilers_seen;
create policy "see my seen spoilers" on public.spoilers_seen for select to authenticated using (user_id = auth.uid());
drop policy if exists "add my seen spoilers" on public.spoilers_seen;
create policy "add my seen spoilers" on public.spoilers_seen for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "remove my seen spoilers" on public.spoilers_seen;
create policy "remove my seen spoilers" on public.spoilers_seen for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.spoilers_seen to authenticated;
-- the name as it was shown ("Attack on Titan"), for the list on the Me tab
alter table public.spoilers_seen add column if not exists label text not null default '';
alter table public.spoilers_seen drop constraint if exists spoilers_seen_label_len;
alter table public.spoilers_seen add constraint spoilers_seen_label_len check (char_length(label) <= 80);
