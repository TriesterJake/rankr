-- ---------- Update 24: fix update 23 (extra unread count, replays of old moves, missing phone buzz) ----------

-- RankR update 24. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Update 23 bumped EVERY matching notification from the last 30 minutes, not just the newest. Left-over
-- notifications from before it all turned unread again (the number on the Activity tab) and all collected the
-- same moves (so the replay played old moves too). It also never buzzed the phone for a change made after you
-- had read the notification. Now:
--   * only the newest matching notification is bumped;
--   * if you had already read it, it's sent again as new (one buzz) when you've opened the list since then,
--     or when its last buzz was over 10 minutes ago;
--   * otherwise it's bumped quietly, so a burst of moves still buzzes only once.

alter table public.notifications add column if not exists buzzed_at timestamptz; -- when it last buzzed the phone

create or replace function public.rankr_notify_edit(p_list uuid, p_kind text, p_count integer default 1, p_old_title text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; r record; n record; flag text; old_ids uuid[]; steps jsonb; base uuid[]; cnt integer;
begin
  -- the order before this change, saved by reorder_list_items() (reorders only)
  if p_kind = 'reordered' then
    old_ids := nullif(current_setting('rankr.o' || replace(p_list::text, '-', ''), true), '')::uuid[];
  end if;
  -- re-ranking changes many rows at once: one "reordered" per transaction is plenty
  if p_kind = 'reordered' then
    flag := 'rankr.r' || replace(p_list::text, '-', '');
    if current_setting(flag, true) = '1' then return; end if;
    perform set_config(flag, '1', true);
  end if;

  select id, owner_id, title, visibility into l from public.lists where id = p_list;
  if not found or l.visibility <> 'friends' then return; end if;

  for r in
    select case when f.requester_id = l.owner_id then f.addressee_id else f.requester_id end as friend_id
      from public.friendships f
     where f.status = 'accepted' and (f.requester_id = l.owner_id or f.addressee_id = l.owner_id)
  loop
    -- a brand-new list that was just announced already covers its first edits
    if exists (select 1 from public.notifications x
                where x.recipient_id = r.friend_id and x.actor_id = l.owner_id and x.list_id = l.id
                  and x.type = 'new_list' and x.read_at is null and x.created_at > now() - interval '30 minutes') then
      continue;
    end if;
    -- removing/adding an item is usually followed by a re-number: don't call that "reordered"
    if p_kind = 'reordered' and exists (select 1 from public.notifications x
                where x.recipient_id = r.friend_id and x.actor_id = l.owner_id and x.list_id = l.id
                  and x.type = 'edited_list' and x.edit_kind in ('items_added', 'items_removed')
                  and x.created_at > now() - interval '2 minutes') then
      continue;
    end if;

    -- the newest notification of the same kind from the last 30 minutes, if any
    select x.id, x.read_at, x.item_count, x.old_order, x.order_steps, coalesce(x.buzzed_at, x.created_at) as buzzed
      into n
      from public.notifications x
     where x.recipient_id = r.friend_id and x.actor_id = l.owner_id and x.list_id = l.id
       and x.type = 'edited_list' and x.edit_kind = p_kind
       and x.created_at > now() - interval '30 minutes'
     order by x.created_at desc
     limit 1;

    if not found then
      insert into public.notifications (recipient_id, actor_id, type, list_id, list_title, item_title, edit_kind, item_count, old_order, order_steps, buzzed_at)
      values (r.friend_id, l.owner_id, 'edited_list', l.id, l.title, coalesce(p_old_title, ''), p_kind, greatest(p_count, 1), old_ids,
              case when old_ids is null then null else jsonb_build_array(to_jsonb(old_ids)) end, now());
      continue;
    end if;

    -- the order from before the first move they haven't looked at (cleared when they open the list),
    -- and the order before each move since then (up to 30 moves; after that the replay jumps to the end)
    base := coalesce(n.old_order, old_ids);
    steps := case
      when old_ids is null then n.order_steps
      when n.old_order is null or n.order_steps is null then jsonb_build_array(to_jsonb(old_ids))
      when jsonb_array_length(n.order_steps) >= 30 then n.order_steps
      else n.order_steps || jsonb_build_array(to_jsonb(old_ids)) end;
    -- counts: add up while unread; once read, start counting again
    cnt := case
      when p_kind not in ('items_added', 'items_removed', 'items_edited') then 1
      when n.read_at is null then n.item_count + p_count
      else greatest(p_count, 1) end;

    -- buzz again when they already read it, and either opened the list since (so this move is all new to them)
    -- or the last buzz was a while ago. Otherwise a burst of moves would buzz once per move.
    if n.read_at is not null
       and (n.buzzed < now() - interval '10 minutes' or (n.old_order is null and n.buzzed < now() - interval '1 minute')) then
      -- send it again as new, so the phone buzzes (only new rows buzz)
      delete from public.notifications where id = n.id;
      insert into public.notifications (recipient_id, actor_id, type, list_id, list_title, item_title, edit_kind, item_count, old_order, order_steps, buzzed_at)
      values (r.friend_id, l.owner_id, 'edited_list', l.id, l.title, coalesce(p_old_title, ''), p_kind, cnt, base, steps, now());
    else
      -- still unread, or it buzzed only moments ago: bump it quietly
      update public.notifications
         set created_at = now(), read_at = null, list_title = l.title, old_order = base, order_steps = steps, item_count = cnt
       where id = n.id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.rankr_notify_edit(uuid, text, integer, text) from public, anon, authenticated;

-- Clean up after update 23: of the duplicate notifications it kept bumping, keep only the newest for each list.
delete from public.notifications x
 using public.notifications y
 where x.type = 'edited_list' and y.type = 'edited_list'
   and x.recipient_id = y.recipient_id and x.actor_id = y.actor_id and x.list_id = y.list_id and x.edit_kind = y.edit_kind
   and x.created_at > now() - interval '2 hours' and y.created_at > now() - interval '2 hours'
   and (x.created_at, x.id) < (y.created_at, y.id)
   and y.created_at - x.created_at < interval '30 minutes';
