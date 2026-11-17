-- ---------- Update 23: one notification (and one phone buzz) per burst of changes ----------

-- RankR update 23. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Before: a change only merged into an UNREAD notification. Reading it (for example with the Activity tab open)
-- made the next change a brand-new notification, with its own phone buzz and its own "order before" for the replay,
-- so the replay only showed the last move.
-- Now: changes within 30 minutes always merge into the same notification. It turns unread again, without another buzz.
-- The replay's starting order is reset only when the friend actually opens the list (saw_list_order below),
-- so it shows every move since they last looked. Each move's order is kept too (order_steps), so the replay can play
-- every drag one after another, not just the difference between before and after.

alter table public.notifications add column if not exists order_steps jsonb; -- [[ids before move 1], [ids before move 2], ...]

create or replace function public.rankr_notify_edit(p_list uuid, p_kind text, p_count integer default 1, p_old_title text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; r record; flag text; old_ids uuid[];
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
    if exists (select 1 from public.notifications n
                where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
                  and n.type = 'new_list' and n.read_at is null and n.created_at > now() - interval '30 minutes') then
      continue;
    end if;
    -- removing/adding an item is usually followed by a re-number: don't call that "reordered"
    if p_kind = 'reordered' and exists (select 1 from public.notifications n
                where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
                  and n.type = 'edited_list' and n.edit_kind in ('items_added', 'items_removed')
                  and n.created_at > now() - interval '2 minutes') then
      continue;
    end if;

    -- more of the same within 30 minutes: bump the same notification, read or not (an update sends no phone buzz)
    update public.notifications n
       set created_at = now(),
           read_at = null,
           list_title = l.title,
           -- the order from before the first change they haven't looked at (cleared when they open the list)
           old_order = coalesce(n.old_order, old_ids),
           -- the order before each move since then (up to 30 moves; after that the replay jumps to the end)
           order_steps = case
             when old_ids is null then n.order_steps
             when n.old_order is null or n.order_steps is null then jsonb_build_array(to_jsonb(old_ids))
             when jsonb_array_length(n.order_steps) >= 30 then n.order_steps
             else n.order_steps || jsonb_build_array(to_jsonb(old_ids)) end,
           -- counts: add up while unread; once read, start counting again
           item_count = case
             when p_kind not in ('items_added', 'items_removed', 'items_edited') then 1
             when n.read_at is null then n.item_count + p_count
             else greatest(p_count, 1) end
     where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
       and n.type = 'edited_list' and n.edit_kind = p_kind
       and n.created_at > now() - interval '30 minutes';
    if not found then
      insert into public.notifications (recipient_id, actor_id, type, list_id, list_title, item_title, edit_kind, item_count, old_order, order_steps)
      values (r.friend_id, l.owner_id, 'edited_list', l.id, l.title, coalesce(p_old_title, ''), p_kind, greatest(p_count, 1), old_ids,
              case when old_ids is null then null else jsonb_build_array(to_jsonb(old_ids)) end);
    end if;
  end loop;
end;
$$;
revoke execute on function public.rankr_notify_edit(uuid, text, integer, text) from public, anon, authenticated;

-- A friend opened the list and saw its current order: the next reorder replay starts from here.
create or replace function public.saw_list_order(p_list uuid)
returns void
language sql security definer set search_path = public as $$
  update public.notifications
     set old_order = null, order_steps = null
   where recipient_id = auth.uid() and list_id = p_list
     and type = 'edited_list' and edit_kind = 'reordered' and (old_order is not null or order_steps is not null);
$$;
revoke execute on function public.saw_list_order(uuid) from public, anon;
grant execute on function public.saw_list_order(uuid) to authenticated;
