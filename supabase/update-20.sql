-- ---------- Update 20: locations on items ----------

-- RankR update 20. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it BEFORE deploying the matching app version.
--
-- An item can have a place: a name ("Mount Tamalpais") and a map point. Tapping it opens directions
-- in Apple Maps, Google Maps or Waze. Friends who can see the list can see the place.

alter table public.list_items add column if not exists place_name text;
alter table public.list_items add column if not exists place_lat double precision;
alter table public.list_items add column if not exists place_lng double precision;
alter table public.list_items drop constraint if exists list_items_place_check;
alter table public.list_items add constraint list_items_place_check check (
  (place_name is null or char_length(place_name) between 1 and 200)
  and (place_lat is null or place_lat between -90 and 90)
  and (place_lng is null or place_lng between -180 and 180)
  and ((place_lat is null) = (place_lng is null))
);
