-- ---------- Update 22: fix "Could not save the new order" ----------

-- RankR update 22. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- No app update needed: it takes effect as soon as it runs.
--
-- Update 21 stored the old order under a setting name built from the list's id. Postgres refuses names whose
-- last part starts with a digit, so reordering failed for many lists. Same two functions, with a name that always works.

-- Same as before, but first notes the current order for the notification (for this transaction only).
create or replace function public.reorder_list_items(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform set_config(
    'rankr.o' || replace(p_list_id::text, '-', ''),
    coalesce((select array_agg(li.id order by li.position)::text from public.list_items li where li.list_id = p_list_id), ''),
    true);

  update public.list_items li
     set position = t.ord - 1
    from unnest(p_item_ids) with ordinality as t(id, ord)
   where li.id = t.id and li.list_id = p_list_id;

  update public.lists set updated_at = now() where id = p_list_id;
end;
$$;

-- Same as the earlier version, plus the old order on "reordered" notifications.
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

    update public.notifications n
       set created_at = now(),
           list_title = l.title,
           old_order = coalesce(n.old_order, old_ids),  -- keep the order from before the FIRST unseen change
           item_count = case when p_kind in ('items_added', 'items_removed', 'items_edited') then n.item_count + p_count else 1 end
     where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
       and n.type = 'edited_list' and n.edit_kind = p_kind
       and n.read_at is null and n.created_at > now() - interval '30 minutes';
    if not found then
      -- an older unread one of this kind (over 30 minutes ago) stays as its own, separate notification
      insert into public.notifications (recipient_id, actor_id, type, list_id, list_title, item_title, edit_kind, item_count, old_order)
      values (r.friend_id, l.owner_id, 'edited_list', l.id, l.title, coalesce(p_old_title, ''), p_kind, greatest(p_count, 1), old_ids);
    end if;
  end loop;
end;
$$;
revoke execute on function public.rankr_notify_edit(uuid, text, integer, text) from public, anon, authenticated;
