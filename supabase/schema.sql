-- =====================================================================
-- RankR: database schema for Supabase
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run once on a fresh project. Uses its own table names
-- (profiles, lists, list_items, friendships), so if your other project
-- already has a "profiles" table, use a separate Supabase project for this app.
-- =====================================================================

-- ---------- Tables ----------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  icon       text not null default '',
  color      text not null default '#7c5cff',
  visibility text not null default 'friends' check (visibility in ('private', 'friends')),
  position   integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lists_owner_idx on public.lists (owner_id);

create table public.list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists(id) on delete cascade,
  position   integer not null,
  title      text not null check (char_length(title) between 1 and 200),
  note       text not null default '',
  image_path text,
  created_at timestamptz not null default now()
);
create index list_items_list_pos_idx on public.list_items (list_id, position);

create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- only one friendship row per pair of people, regardless of who asked first
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

-- ---------- Helper functions (security definer so RLS policies can call them) ----------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function public.owns_list(l_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lists l where l.id = l_id and l.owner_id = auth.uid());
$$;

create or replace function public.can_view_list(l_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lists l
    where l.id = l_id
      and (l.owner_id = auth.uid()
           or (l.visibility = 'friends' and public.are_friends(l.owner_id, auth.uid())))
  );
$$;

-- ---------- RPCs called by the app ----------

-- Is this username free? Callable before signing up (anon).
create or replace function public.username_available(u text)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles p where p.username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Save a new ranking order in one call: p_item_ids is the full list, best first.
create or replace function public.reorder_list_items(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.list_items li
     set position = t.ord - 1
    from unnest(p_item_ids) with ordinality as t(id, ord)
   where li.id = t.id and li.list_id = p_list_id;

  update public.lists set updated_at = now() where id = p_list_id;
end;
$$;

-- Accept a friend request that was sent to me.
create or replace function public.accept_friend_request(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.friendships
     set status = 'accepted'
   where id = p_id and addressee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Friend request not found';
  end if;
end;
$$;

-- ---------- Triggers ----------

-- Create a profile row whenever someone signs up (username comes from the signup form).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  uname := regexp_replace(
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    '[^a-z0-9_]', '', 'g');
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bump a list's updated_at whenever its items change (so recent lists float to the top).
create or replace function public.touch_list()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.lists
     set updated_at = now()
   where id = coalesce(new.list_id, old.list_id);
  return null;
end;
$$;

create trigger list_items_touch_list
  after insert or update or delete on public.list_items
  for each row execute function public.touch_list();

-- ---------- Row level security ----------

alter table public.profiles    enable row level security;
alter table public.lists       enable row level security;
alter table public.list_items  enable row level security;
alter table public.friendships enable row level security;

-- profiles: any signed-in user can look people up by username; you can only edit your own.
create policy "profiles are readable by signed-in users"
  on public.profiles for select to authenticated using (true);
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- lists: you always see your own; friends see lists marked 'friends'.
create policy "read own or friends' lists"
  on public.lists for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'friends' and public.are_friends(owner_id, auth.uid())));
create policy "create own lists"
  on public.lists for insert to authenticated with check (owner_id = auth.uid());
create policy "update own lists"
  on public.lists for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own lists"
  on public.lists for delete to authenticated using (owner_id = auth.uid());

-- list_items follow the visibility of their list; only the owner can change them.
create policy "read items of visible lists"
  on public.list_items for select to authenticated using (public.can_view_list(list_id));
create policy "add items to own lists"
  on public.list_items for insert to authenticated with check (public.owns_list(list_id));
create policy "update items in own lists"
  on public.list_items for update to authenticated
  using (public.owns_list(list_id)) with check (public.owns_list(list_id));
create policy "delete items from own lists"
  on public.list_items for delete to authenticated using (public.owns_list(list_id));

-- friendships: see requests you're part of; send requests as yourself;
-- accepting goes through accept_friend_request(); either side can remove/decline.
create policy "see my friendships"
  on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "send friend requests"
  on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy "remove or decline friendships"
  on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ---------- API access ----------

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, insert, update, delete on public.list_items to authenticated;
grant select, insert, delete on public.friendships to authenticated;

-- Make sure signed-in users can run the helper functions the security rules and app rely on.
-- (Usually already allowed by default; explicit here in case "automatically expose" is turned off.)
grant execute on function
  public.are_friends(uuid, uuid),
  public.owns_list(uuid),
  public.can_view_list(uuid),
  public.reorder_list_items(uuid, uuid[]),
  public.accept_friend_request(uuid)
to authenticated;

-- ---------- Item photos (storage) ----------

insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

create policy "owners read their item images"
  on storage.objects for select to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners upload item images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners update item images"
  on storage.objects for update to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owners delete item images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Likes ----------

create table if not exists public.list_likes (
  list_id    uuid not null references public.lists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists list_likes_user_idx on public.list_likes (user_id);

alter table public.list_likes enable row level security;


-- Anyone who can see a list can see its likes.
create policy "see likes on visible lists"
  on public.list_likes for select to authenticated
  using (public.can_view_list(list_id));
-- You can like a list you can see (a friend's), as yourself, but not your own list.
create policy "like lists you can see"
  on public.list_likes for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_list(list_id) and not public.owns_list(list_id));
-- You can only take back your own like.
create policy "remove my own like"
  on public.list_likes for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.list_likes to authenticated;

-- ---------- Profile pictures and list icon pictures ----------

alter table public.profiles add column if not exists avatar_path text;
alter table public.lists    add column if not exists icon_path   text;


-- ---------- Update 5: favorites, reactions, notifications ----------

-- RankR update 5: Favorites (one per friend), emoji reactions on items, and the notification center.
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- (Run update-2, update-3 and update-4 first if you haven't.)

-- =====================================================================
-- Tables
-- =====================================================================

-- Favorites: each person can pick ONE favorite list per friend (the primary key enforces it).
create table if not exists public.list_favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  list_id    uuid not null references public.lists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, owner_id)
);
create index if not exists list_favorites_list_idx on public.list_favorites (list_id);

-- Reactions: one emoji per person per item (tap a different one to change it).
create table if not exists public.item_reactions (
  item_id    uuid not null references public.list_items(id) on delete cascade,
  list_id    uuid not null references public.lists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index if not exists item_reactions_list_idx on public.item_reactions (list_id);

-- Notifications: what your friends did while you were away.
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid not null references public.profiles(id) on delete cascade,
  type         text not null check (type in ('new_list', 'edited_list', 'liked', 'favorited', 'reacted')),
  list_id      uuid references public.lists(id) on delete cascade,
  item_id      uuid references public.list_items(id) on delete set null,
  list_title   text not null default '',
  item_title   text not null default '',
  emoji        text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- =====================================================================
-- Row level security
-- =====================================================================

alter table public.list_favorites enable row level security;
alter table public.item_reactions enable row level security;
alter table public.notifications  enable row level security;

drop policy if exists "see favorites on visible lists" on public.list_favorites;
create policy "see favorites on visible lists"
  on public.list_favorites for select to authenticated
  using (public.can_view_list(list_id));

drop policy if exists "see reactions on visible lists" on public.item_reactions;
create policy "see reactions on visible lists"
  on public.item_reactions for select to authenticated
  using (public.can_view_list(list_id));

drop policy if exists "read my notifications" on public.notifications;
drop policy if exists "mark my notifications read" on public.notifications;
drop policy if exists "clear my notifications" on public.notifications;
create policy "read my notifications"
  on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy "mark my notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "clear my notifications"
  on public.notifications for delete to authenticated using (recipient_id = auth.uid());

-- Favorites and reactions are only written through the functions below; notifications only by the database itself.
grant select on public.list_favorites to authenticated;
grant select on public.item_reactions to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- =====================================================================
-- Notification helpers (internal: the app can not call these directly)
-- =====================================================================

-- Add one notification. Repeats of the same thing replace the older one instead of piling up.
create or replace function public.rankr_notify(
  p_recipient uuid, p_actor uuid, p_type text, p_list uuid, p_item uuid,
  p_list_title text, p_item_title text, p_emoji text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then return; end if;
  delete from public.notifications n
   where n.recipient_id = p_recipient and n.actor_id = p_actor and n.type = p_type
     and n.list_id is not distinct from p_list and n.item_id is not distinct from p_item;
  insert into public.notifications (recipient_id, actor_id, type, list_id, item_id, list_title, item_title, emoji)
  values (p_recipient, p_actor, p_type, p_list, p_item, coalesce(p_list_title, ''), coalesce(p_item_title, ''), p_emoji);
end;
$$;

-- "<owner> made a new list": tell every friend (only for lists friends can see).
create or replace function public.rankr_notify_new_list(p_list uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; r record;
begin
  select id, owner_id, title, visibility into l from public.lists where id = p_list;
  if not found or l.visibility <> 'friends' then return; end if;
  for r in
    select case when f.requester_id = l.owner_id then f.addressee_id else f.requester_id end as friend_id
      from public.friendships f
     where f.status = 'accepted' and (f.requester_id = l.owner_id or f.addressee_id = l.owner_id)
  loop
    perform public.rankr_notify(r.friend_id, l.owner_id, 'new_list', l.id, null, l.title, '', null);
  end loop;
end;
$$;

-- "<owner> updated a list": tell every friend, but keep it to ONE unread notification per list
-- (more edits just move it back to the top), and skip it while the "new list" one is still unread.
create or replace function public.rankr_notify_list_edit(p_list uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; r record; flag text;
begin
  -- one run per transaction is plenty (re-ranking a list changes many rows at once)
  flag := 'rankr.e' || replace(p_list::text, '-', '');
  if current_setting(flag, true) = '1' then return; end if;
  perform set_config(flag, '1', true);

  select id, owner_id, title, visibility into l from public.lists where id = p_list;
  if not found or l.visibility <> 'friends' then return; end if;
  for r in
    select case when f.requester_id = l.owner_id then f.addressee_id else f.requester_id end as friend_id
      from public.friendships f
     where f.status = 'accepted' and (f.requester_id = l.owner_id or f.addressee_id = l.owner_id)
  loop
    if exists (select 1 from public.notifications n
                where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
                  and n.type = 'new_list' and n.read_at is null) then
      continue;
    end if;
    update public.notifications n
       set created_at = now(), list_title = l.title
     where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
       and n.type = 'edited_list' and n.read_at is null;
    if not found then
      perform public.rankr_notify(r.friend_id, l.owner_id, 'edited_list', l.id, null, l.title, '', null);
    end if;
  end loop;
end;
$$;

revoke execute on function public.rankr_notify(uuid, uuid, text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.rankr_notify_new_list(uuid) from public, anon, authenticated;
revoke execute on function public.rankr_notify_list_edit(uuid) from public, anon, authenticated;

-- =====================================================================
-- Triggers: lists, items and likes create the notifications
-- =====================================================================

-- Items changed (added, edited, re-ranked, removed) -> the existing trigger now also tells friends.
create or replace function public.touch_list()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.lists
     set updated_at = now()
   where id = coalesce(new.list_id, old.list_id);
  perform public.rankr_notify_list_edit(coalesce(new.list_id, old.list_id));
  return null;
end;
$$;

create or replace function public.lists_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.rankr_notify_new_list(new.id);
  elsif new.visibility = 'friends' and old.visibility <> 'friends' then
    perform public.rankr_notify_new_list(new.id);   -- a private list was shared
  elsif new.visibility = 'friends'
        and (new.title, new.icon, new.icon_path, new.color) is distinct from (old.title, old.icon, old.icon_path, old.color) then
    perform public.rankr_notify_list_edit(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists lists_notify_insert on public.lists;
drop trigger if exists lists_notify_update on public.lists;
create trigger lists_notify_insert after insert on public.lists
  for each row execute function public.lists_notify();
create trigger lists_notify_update after update on public.lists
  for each row execute function public.lists_notify();

create or replace function public.likes_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if tg_op = 'INSERT' then
    select id, owner_id, title into l from public.lists where id = new.list_id;
    if found then
      perform public.rankr_notify(l.owner_id, new.user_id, 'liked', l.id, null, l.title, '', null);
    end if;
  else
    -- taking a like back also takes the notification back
    delete from public.notifications n
     where n.actor_id = old.user_id and n.type = 'liked' and n.list_id = old.list_id;
  end if;
  return null;
end;
$$;

drop trigger if exists list_likes_notify on public.list_likes;
create trigger list_likes_notify after insert or delete on public.list_likes
  for each row execute function public.likes_notify();

-- =====================================================================
-- Functions the app calls
-- =====================================================================

-- Make a friend's list your favorite (replaces your previous favorite of that same friend).
create or replace function public.set_favorite(p_list_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; prev uuid;
begin
  select id, owner_id, title into l from public.lists where id = p_list_id;
  if not found or l.owner_id = auth.uid() or not public.can_view_list(p_list_id) then
    raise exception 'You can only favorite a friend''s list';
  end if;
  select list_id into prev from public.list_favorites where user_id = auth.uid() and owner_id = l.owner_id;
  if prev = p_list_id then return; end if;
  insert into public.list_favorites (user_id, owner_id, list_id)
  values (auth.uid(), l.owner_id, p_list_id)
  on conflict (user_id, owner_id) do update set list_id = excluded.list_id, created_at = now();
  delete from public.notifications n
   where n.recipient_id = l.owner_id and n.actor_id = auth.uid() and n.type = 'favorited';
  perform public.rankr_notify(l.owner_id, auth.uid(), 'favorited', l.id, null, l.title, '', null);
end;
$$;

create or replace function public.clear_favorite(p_list_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.list_favorites where user_id = auth.uid() and list_id = p_list_id;
  delete from public.notifications n
   where n.actor_id = auth.uid() and n.type = 'favorited' and n.list_id = p_list_id;
end;
$$;

-- React to a friend's item. Same emoji again takes it back; a different one changes it.
-- Returns the emoji now showing (or null if it was removed).
create or replace function public.react_to_item(p_item_id uuid, p_emoji text)
returns text
language plpgsql security definer set search_path = public as $$
declare it record; cur text;
begin
  if p_emoji is null or char_length(p_emoji) not between 1 and 8 then
    raise exception 'Pick an emoji';
  end if;
  select li.id, li.title, li.list_id, l.owner_id, l.title as list_title
    into it
    from public.list_items li join public.lists l on l.id = li.list_id
   where li.id = p_item_id;
  if not found or it.owner_id = auth.uid() or not public.can_view_list(it.list_id) then
    raise exception 'You can only react to a friend''s items';
  end if;
  select emoji into cur from public.item_reactions where item_id = p_item_id and user_id = auth.uid();
  delete from public.notifications n
   where n.actor_id = auth.uid() and n.type = 'reacted' and n.item_id = p_item_id;
  if cur = p_emoji then
    delete from public.item_reactions where item_id = p_item_id and user_id = auth.uid();
    return null;
  end if;
  insert into public.item_reactions (item_id, list_id, user_id, emoji)
  values (p_item_id, it.list_id, auth.uid(), p_emoji)
  on conflict (item_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  perform public.rankr_notify(it.owner_id, auth.uid(), 'reacted', it.list_id, p_item_id, it.list_title, it.title, p_emoji);
  return p_emoji;
end;
$$;

grant execute on function public.set_favorite(uuid), public.clear_favorite(uuid), public.react_to_item(uuid, text) to authenticated;

-- =====================================================================
-- Live updates for the red notification badge
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;


-- ---------- Update 6: friend notifications and phone push ----------

-- RankR update 6: friend-request notifications and phone push notifications.
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- (Run update-5 first.)

-- =====================================================================
-- New notification types: friend_request, friend_accepted
-- =====================================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('new_list', 'edited_list', 'liked', 'favorited', 'reacted', 'friend_request', 'friend_accepted'));

-- Someone sends you a request: notify you. You accept: notify them.
-- Declined / cancelled / accepted requests remove the "friend_request" notification.
create or replace function public.friendships_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.rankr_notify(new.addressee_id, new.requester_id, 'friend_request', null, null, '', '', null);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status = 'accepted' and old.status <> 'accepted' then
      delete from public.notifications
       where type = 'friend_request' and recipient_id = new.addressee_id and actor_id = new.requester_id;
      perform public.rankr_notify(new.requester_id, new.addressee_id, 'friend_accepted', null, null, '', '', null);
    end if;
    return new;
  else
    delete from public.notifications
     where type = 'friend_request'
       and ((recipient_id = old.addressee_id and actor_id = old.requester_id)
         or (recipient_id = old.requester_id and actor_id = old.addressee_id));
    return old;
  end if;
end;
$$;
revoke execute on function public.friendships_notify() from public, anon, authenticated;

drop trigger if exists friendships_notify_insert on public.friendships;
drop trigger if exists friendships_notify_update on public.friendships;
drop trigger if exists friendships_notify_delete on public.friendships;
create trigger friendships_notify_insert after insert on public.friendships
  for each row execute function public.friendships_notify();
create trigger friendships_notify_update after update of status on public.friendships
  for each row execute function public.friendships_notify();
create trigger friendships_notify_delete after delete on public.friendships
  for each row execute function public.friendships_notify();

-- Requests that are already waiting get a notification too (so the red number counts them).
insert into public.notifications (recipient_id, actor_id, type)
select f.addressee_id, f.requester_id, 'friend_request'
  from public.friendships f
 where f.status = 'pending'
   and not exists (select 1 from public.notifications n
                    where n.type = 'friend_request' and n.recipient_id = f.addressee_id and n.actor_id = f.requester_id);

-- =====================================================================
-- Phone push notifications: one row per phone/browser that said "yes, notify me"
-- =====================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "see my push subscriptions" on public.push_subscriptions;
drop policy if exists "add my push subscriptions" on public.push_subscriptions;
drop policy if exists "update my push subscriptions" on public.push_subscriptions;
drop policy if exists "delete my push subscriptions" on public.push_subscriptions;
create policy "see my push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "add my push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "update my push subscriptions" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete my push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Saves this phone's subscription for the signed-in person (moves it over if someone else used it before).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;


-- ---------- Update 7: private friend ranking ----------

-- RankR update 7: rank your friends (private: only you can see your own order).
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.

create table if not exists public.friend_ranks (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  position  integer not null,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friend_ranks enable row level security;

drop policy if exists "see my friend ranks" on public.friend_ranks;
drop policy if exists "add my friend ranks" on public.friend_ranks;
drop policy if exists "change my friend ranks" on public.friend_ranks;
drop policy if exists "delete my friend ranks" on public.friend_ranks;
create policy "see my friend ranks" on public.friend_ranks
  for select to authenticated using (user_id = auth.uid());
-- you can only rank people you are actually friends with
create policy "add my friend ranks" on public.friend_ranks
  for insert to authenticated with check (user_id = auth.uid() and public.are_friends(user_id, friend_id));
create policy "change my friend ranks" on public.friend_ranks
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.are_friends(user_id, friend_id));
create policy "delete my friend ranks" on public.friend_ranks
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.friend_ranks to authenticated;


-- ---------- Update 8: friend suggestions ----------

-- RankR update 8: "People you may know" (friends of your friends).
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.

-- Returns people who are friends with at least one of YOUR friends, that you are not already
-- connected to (no friendship or pending request either way). Most mutual friends first.
-- It only ever shows you: their public profile, how many friends you share, and up to two shared friends' names.
create or replace function public.friend_suggestions(p_limit integer default 20)
returns table (id uuid, username text, display_name text, avatar_path text, mutual_count integer, mutual_names text[])
language sql stable security definer set search_path = public as $$
  with my_friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as fid
      from public.friendships f
     where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  ), fof as (
    select mf.fid as via,
           case when f.requester_id = mf.fid then f.addressee_id else f.requester_id end as person
      from my_friends mf
      join public.friendships f
        on f.status = 'accepted' and (f.requester_id = mf.fid or f.addressee_id = mf.fid)
  ), related as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as pid
      from public.friendships f
     where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  )
  select p.id, p.username, p.display_name, p.avatar_path,
         count(*)::integer as mutual_count,
         (array_agg(coalesce(nullif(v.display_name, ''), v.username) order by v.username))[1:2] as mutual_names
    from fof
    join public.profiles p on p.id = fof.person
    join public.profiles v on v.id = fof.via
   where auth.uid() is not null
     and fof.person <> auth.uid()
     and fof.person not in (select pid from related)
   group by p.id
   order by count(*) desc, p.username
   limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.friend_suggestions(integer) from public, anon;
grant execute on function public.friend_suggestions(integer) to authenticated;


-- ---------- Update 9: reorder lists in one request ----------

-- RankR update 9: save a new order of your lists in ONE request (instead of one request per list).
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.

create or replace function public.reorder_lists(p_ids uuid[])
returns void
language plpgsql security invoker set search_path = public as $$
begin
  -- row level security already limits this to your own lists
  update public.lists l
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where l.id = o.id and l.owner_id = auth.uid();
end;
$$;

revoke execute on function public.reorder_lists(uuid[]) from public, anon;
grant execute on function public.reorder_lists(uuid[]) to authenticated;

-- ===== update 10 (specific edit notifications) =====
alter table public.notifications add column if not exists edit_kind  text;
alter table public.notifications add column if not exists item_count integer not null default 1;
alter table public.notifications drop constraint if exists notifications_edit_kind_check;
alter table public.notifications
  add constraint notifications_edit_kind_check
  check (edit_kind is null or edit_kind in ('title', 'icon', 'color', 'items_added', 'items_removed', 'items_edited', 'reordered'));

grant select on public.notifications to authenticated;

-- One specific "edited" notification per friend, per list, per kind of change.
-- More of the same kind within 30 minutes just bumps the existing unread one (no extra phone buzz).
create or replace function public.rankr_notify_edit(p_list uuid, p_kind text, p_count integer default 1, p_old_title text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare l record; r record; flag text;
begin
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
           item_count = case when p_kind in ('items_added', 'items_removed', 'items_edited') then n.item_count + p_count else 1 end
     where n.recipient_id = r.friend_id and n.actor_id = l.owner_id and n.list_id = l.id
       and n.type = 'edited_list' and n.edit_kind = p_kind
       and n.read_at is null and n.created_at > now() - interval '30 minutes';
    if not found then
      -- an older unread one of this kind (over 30 minutes ago) stays as its own, separate notification
      insert into public.notifications (recipient_id, actor_id, type, list_id, list_title, item_title, edit_kind, item_count)
      values (r.friend_id, l.owner_id, 'edited_list', l.id, l.title, coalesce(p_old_title, ''), p_kind, greatest(p_count, 1));
    end if;
  end loop;
end;
$$;
revoke execute on function public.rankr_notify_edit(uuid, text, integer, text) from public, anon, authenticated;

-- Items: added / removed / edited / moved
create or replace function public.touch_list()
returns trigger
language plpgsql security definer set search_path = public as $$
declare lid uuid := coalesce(new.list_id, old.list_id);
begin
  update public.lists set updated_at = now() where id = lid;
  if tg_op = 'INSERT' then
    perform public.rankr_notify_edit(lid, 'items_added');
  elsif tg_op = 'DELETE' then
    perform public.rankr_notify_edit(lid, 'items_removed');
  elsif (new.title, new.note, new.image_path) is distinct from (old.title, old.note, old.image_path) then
    perform public.rankr_notify_edit(lid, 'items_edited');
  elsif new.position is distinct from old.position then
    perform public.rankr_notify_edit(lid, 'reordered');
  end if;
  return null;
end;
$$;

-- Lists: new / shared / renamed / icon / color
create or replace function public.lists_notify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.rankr_notify_new_list(new.id);
  elsif new.visibility = 'friends' and old.visibility <> 'friends' then
    perform public.rankr_notify_new_list(new.id);   -- a private list was shared
  elsif new.visibility = 'friends' then
    if new.title is distinct from old.title then
      perform public.rankr_notify_edit(new.id, 'title', 1, old.title);
    end if;
    if (new.icon, new.icon_path) is distinct from (old.icon, old.icon_path) then
      perform public.rankr_notify_edit(new.id, 'icon');
    end if;
    if new.color is distinct from old.color then
      perform public.rankr_notify_edit(new.id, 'color');
    end if;
  end if;
  return null;
end;
$$;