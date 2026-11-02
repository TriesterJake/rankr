-- ---------- Update 14: Ideas: friends' share and "Popular" badge ----------

-- RankR update 14. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- * At least 6 of the 20 ideas are titles a friend has made (when there are that many to pick from).
-- * Each title is one idea, no matter how many people made it, so every title has the same chance of being picked:
--   popular titles don't show up more often than rare ones.
-- * "popular" marks titles in the top 10% by number of people who made them (and at least 3 people).

drop function if exists public.list_ideas(date, integer);

create or replace function public.list_ideas(p_day date default null, p_limit integer default 20)
returns table (title text, friends jsonb, others integer, owners integer, popular boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as id,
           case when p_day between current_date - 1 and current_date + 1 then p_day else current_date end as day,
           least(greatest(coalesce(p_limit, 20), 1), 50) as n
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
  ), groups as (
    -- one row per title: this is what makes every title equally likely
    select pl.k,
           count(distinct pl.owner_id)::integer as owners,
           bool_or(pl.is_friend) as has_friend,
           md5(me.id::text || me.day::text || pl.k) as shuffle
      from pool pl cross join me
     where pl.k not in (select k from mine)
     group by pl.k, me.id, me.day
  ), ranked as (
    select g.*,
           cume_dist() over (order by g.owners) as share,                          -- 0.9+ = top 10% by people
           row_number() over (partition by g.has_friend order by g.shuffle) as nth  -- random order within friends / others
      from groups g
  ), ideas as (
    -- first up to 6 random friend titles, then the rest filled at random from everything
    select r.*
      from ranked r cross join me
     order by (r.has_friend and r.nth <= least(6, me.n)) desc, r.shuffle
     limit (select n from me)
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
    (select count(distinct pl.owner_id)::integer from pool pl where pl.k = i.k and not pl.is_friend) as others,
    i.owners,
    (i.owners >= 3 and i.share >= 0.9) as popular
  from ideas i
  order by i.shuffle;  -- friend titles end up mixed in, not stuck at the top
$$;

revoke execute on function public.list_ideas(date, integer) from public, anon;
grant execute on function public.list_ideas(date, integer) to authenticated;
