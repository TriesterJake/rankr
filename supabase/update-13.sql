-- ---------- Update 13: Ideas page (list titles you could make) ----------

-- RankR update 13: the Ideas tab.
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Every person gets their own random set of list titles each day. Nothing is stored and no cron job is needed:
-- the order comes from a hash of (your id + today's date + the title), so it stays the same all day
-- and changes on its own at midnight.
--
-- Privacy:
--   * only lists shared with friends are used (never "Only me" lists)
--   * a list can be left out (lists.show_in_ideas), or all of someone's lists (profiles.show_in_ideas)
--   * for people who aren't your friends, only the title and a head count come back: no names, ids or list ids

alter table public.lists    add column if not exists show_in_ideas boolean not null default true;
alter table public.profiles add column if not exists show_in_ideas boolean not null default true;

-- "Favorite Songs!" and "favorite   songs" count as the same idea.
create or replace function public.idea_key(t text)
returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(trim(regexp_replace(lower(t), '[^[:alnum:]]+', ' ', 'g')), ''), lower(trim(t)));
$$;

-- p_day is the person's own local date (so the page changes at their midnight, not the server's).
-- It can only be yesterday, today or tomorrow in server time; anything else falls back to today,
-- so nobody can page through other days to see every title in the app.
create or replace function public.list_ideas(p_day date default null, p_limit integer default 20)
returns table (title text, friends jsonb, others integer)
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as id,
           case when p_day between current_date - 1 and current_date + 1 then p_day else current_date end as day
  ), my_friends as (
    select case when f.requester_id = me.id then f.addressee_id else f.requester_id end as fid
      from public.friendships f, me
     where f.status = 'accepted' and (f.requester_id = me.id or f.addressee_id = me.id)
  ), mine as (
    -- titles you already have are not suggested to you
    select distinct public.idea_key(l.title) as k from public.lists l, me where l.owner_id = me.id
  ), pool as (
    select public.idea_key(l.title) as k, l.title, l.id as list_id, l.owner_id, l.updated_at,
           l.owner_id in (select fid from my_friends) as is_friend
      from public.lists l
      join public.profiles p on p.id = l.owner_id
      cross join me
     where me.id is not null
       and l.owner_id <> me.id
       and l.visibility = 'friends'
       and l.show_in_ideas
       and p.show_in_ideas
  ), ideas as (
    select k, md5(me.id::text || me.day::text || k) as shuffle
      from pool cross join me
     where k not in (select k from mine)
     group by k, me.id, me.day
     order by 2
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ), friend_lists as (
    -- one list per friend per idea (their most recently changed one)
    select distinct on (pl.k, pl.owner_id) pl.k, pl.owner_id, pl.list_id
      from pool pl
      join ideas i on i.k = pl.k
     where pl.is_friend
     order by pl.k, pl.owner_id, pl.updated_at desc
  )
  select
    (select mode() within group (order by pl.title) from pool pl where pl.k = i.k) as title,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'username', p.username, 'display_name', p.display_name,
               'avatar_path', p.avatar_path, 'list_id', fl.list_id)
             order by coalesce(nullif(p.display_name, ''), p.username))
        from friend_lists fl join public.profiles p on p.id = fl.owner_id
       where fl.k = i.k), '[]'::jsonb) as friends,
    (select count(distinct pl.owner_id)::integer from pool pl where pl.k = i.k and not pl.is_friend) as others
  from ideas i
  order by i.shuffle;
$$;

revoke execute on function public.list_ideas(date, integer) from public, anon;
grant execute on function public.list_ideas(date, integer) to authenticated;
