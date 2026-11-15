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

-- ---------- Update 15: Ideas shows 10, and announcements in Activity ----------

-- RankR update 15. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- * Ideas: about 30% of the page is saved for friends' titles (3 of 10), instead of a fixed 6.
-- * Notifications can be an "announcement" from RankR itself (no friend behind it), with a link to open.

alter table public.notifications alter column actor_id drop not null;
alter table public.notifications add column if not exists link text;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('new_list', 'edited_list', 'liked', 'favorited', 'reacted', 'friend_request', 'friend_accepted', 'announcement'));
-- friend notifications still always have a friend behind them
alter table public.notifications drop constraint if exists notifications_actor_check;
alter table public.notifications
  add constraint notifications_actor_check check (actor_id is not null or type = 'announcement');

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
    -- first up to 30% (3 of 10) random friend titles, then the rest filled at random from everything
    select r.*
      from ranked r cross join me
     order by (r.has_friend and r.nth <= ceil(me.n * 0.3)) desc, r.shuffle
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


-- ---------- Update 17: App Store safety (report, block, word filter, terms, 13+) ----------

-- RankR update 17. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it BEFORE deploying the matching app version.
--
-- * Report: people can report a list, a profile (name or picture) or an idea. Reports land in the
--   "reports" table, and anyone in "app_admins" gets an Activity notification (and phone push) for each one.
-- * Block: blocking someone unfriends you, stops their friend requests, hides them from friend suggestions
--   and search, and keeps their list titles out of your Ideas.
-- * Word filter: a list of words in "blocked_words". Usernames and display names that contain one are refused,
--   and list titles that contain one never show up on the Ideas tab. Add words any time in the Table Editor.
-- * Ideas: you can hide an idea (just for you) or report it. An idea reported by 2+ different people
--   disappears from everyone's Ideas.
-- * Terms: profiles remember when the person agreed to the Terms and Privacy Policy and confirmed they are 13+.
--
-- After running it, make yourself the admin (put in YOUR username):
--   insert into public.app_admins (user_id) select id from public.profiles where username = 'your_username'
--   on conflict do nothing;

-- =====================================================================
-- Word filter
-- =====================================================================

-- mode 'word': matches a whole word (plus simple endings: s, es, y, ing, ed, er, ers), so "ass" catches
--              "ass" and "asses" but not "class" or "bass".
-- mode 'part': matches anywhere inside a word, for words that are never innocent, so "fuck" catches "fuckboy".
-- mode 'phrase': a few words in a row (the last one can have an ending), so "curse word" catches "Fav curse words".
create table if not exists public.blocked_words (
  word text primary key check (word ~ '^[a-z]+( [a-z]+)*$'),
  mode text not null default 'word' check (mode in ('word', 'part', 'phrase'))
);
alter table public.blocked_words enable row level security;
-- no policies on purpose: only the functions below (and you, in the dashboard) can read it
revoke all on public.blocked_words from anon, authenticated;

insert into public.blocked_words (word, mode) values
  -- swearing
  ('fuck', 'part'), ('fuk', 'word'), ('fck', 'word'), ('fcking', 'word'), ('phuck', 'part'), ('motherf', 'part'),
  ('shit', 'part'), ('sht', 'word'), ('bitch', 'part'), ('btch', 'word'), ('cunt', 'part'), ('asshole', 'part'),
  ('dumbass', 'part'), ('jackass', 'part'), ('badass', 'part'), ('ass', 'word'), ('arse', 'word'), ('bastard', 'part'),
  ('damn', 'word'), ('goddamn', 'part'), ('piss', 'word'), ('pissed', 'word'), ('dick', 'word'), ('dickhead', 'part'),
  ('cock', 'word'), ('prick', 'word'), ('twat', 'word'), ('wanker', 'part'), ('bollocks', 'word'), ('bullshit', 'part'),
  ('wtf', 'word'), ('stfu', 'word'), ('gtfo', 'word'), ('cuss', 'word'), ('cursewor', 'part'), ('swearwor', 'part'),
  ('cussword', 'part'), ('badword', 'part'), ('curse word', 'phrase'), ('swear word', 'phrase'), ('cuss word', 'phrase'),
  ('bad word', 'phrase'), ('dirty word', 'phrase'), ('naughty word', 'phrase'),
  -- sexual
  ('sex', 'word'), ('sexy', 'word'), ('sexual', 'word'), ('sexting', 'word'), ('sext', 'word'), ('porn', 'part'),
  ('pornhub', 'part'), ('onlyfans', 'part'), ('xxx', 'word'), ('nsfw', 'part'), ('nude', 'word'), ('naked', 'word'),
  ('penis', 'part'), ('vagina', 'part'), ('pussy', 'part'), ('clit', 'part'), ('dildo', 'part'), ('vibrator', 'part'),
  ('blowjob', 'part'), ('handjob', 'part'), ('rimjob', 'part'), ('masturb', 'part'), ('jerkoff', 'part'),
  ('jackoff', 'part'), ('orgasm', 'part'), ('ejacul', 'part'), ('erection', 'word'), ('boner', 'word'),
  ('horny', 'word'), ('hentai', 'part'), ('milf', 'part'), ('cum', 'word'), ('cumshot', 'part'), ('creampie', 'part'),
  ('bukkake', 'part'), ('deepthroat', 'part'), ('threesome', 'part'), ('foursome', 'word'), ('orgy', 'word'),
  ('orgies', 'word'), ('kink', 'word'), ('kinky', 'word'), ('fetish', 'part'), ('bdsm', 'part'), ('bondage', 'word'),
  ('stripper', 'word'), ('hooker', 'word'), ('whore', 'part'), ('slut', 'part'), ('thot', 'word'), ('hoe', 'word'),
  ('tit', 'word'), ('tits', 'word'), ('titties', 'part'), ('boob', 'word'), ('boobs', 'word'), ('booty', 'word'),
  ('anal', 'word'), ('anus', 'word'), ('condom', 'word'), ('viagra', 'part'), ('genital', 'part'), ('testicle', 'part'),
  ('scrotum', 'part'), ('semen', 'word'), ('sperm', 'word'), ('incest', 'part'), ('pedo', 'word'), ('pedophil', 'part'),
  ('loli', 'word'), ('rape', 'word'), ('rapist', 'word'), ('molest', 'part'), ('hookup', 'word'),
  ('in bed', 'phrase'), ('turn ons', 'phrase'), ('body count', 'phrase'), ('one night stand', 'phrase'),
  ('make out', 'phrase'), ('friends with benefits', 'phrase'),
  -- hate
  ('nigg', 'part'), ('faggot', 'part'), ('fag', 'word'), ('retard', 'part'), ('tranny', 'word'), ('chink', 'word'),
  ('spic', 'word'), ('kike', 'word'), ('dyke', 'word'), ('wetback', 'part'), ('nazi', 'word'), ('kkk', 'word'),
  -- drugs and self-harm
  ('cocaine', 'part'), ('heroin', 'word'), ('meth', 'word'), ('weed', 'word'), ('drug', 'word'), ('stoner', 'word'),
  ('suicide', 'word'), ('killmyself', 'part'), ('selfharm', 'part'), ('kms', 'word')
on conflict (word) do nothing;

-- Is this text free of blocked words? Sees through simple tricks: "s3x", "@ss", "f*ck", "f u c k", "fuuuck".
create or replace function public.is_clean(t text)
returns boolean
language sql stable security definer set search_path = public as $$
  with a as (
    -- lower case, look-alike symbols to letters, drop censor marks, long repeats to one letter
    select regexp_replace(
             regexp_replace(translate(lower(coalesce(t, '')), '013457@$!', 'oieastasi'), '[*#]', '', 'g'),
             '([a-z])\1\1+', '\1', 'g') as s
  ), b as (
    -- glue spaced-out single letters back together: "f u c k" / "f.u.c.k" -> "fuck"
    select regexp_replace(s, '\m([a-z])[^a-z]+(?=[a-z]\M)', '\1', 'g') as s from a
  ), c as (
    select ' ' || trim(regexp_replace(s, '[^a-z]+', ' ', 'g')) || ' ' as s from b   -- " fav curse words "
  ), toks as (
    select tok from c, regexp_split_to_table(trim(c.s), ' ') as tok where tok <> ''
  )
  select not exists (
    select 1
      from toks, public.blocked_words w
     where (w.mode = 'part' and position(w.word in toks.tok) > 0)
        or (w.mode = 'word' and toks.tok in (w.word, w.word || 's', w.word || 'es', w.word || 'y',
                                             w.word || 'ing', w.word || 'ed', w.word || 'er', w.word || 'ers'))
  ) and not exists (
    select 1
      from c, public.blocked_words w
     where w.mode = 'phrase' and c.s ~ (' ' || w.word || '(s|es|ing|ed)? ')
  );
$$;
revoke execute on function public.is_clean(text) from public;
-- the sign-up screen checks a username before the account exists, so signed-out visitors may call it too
grant execute on function public.is_clean(text) to anon, authenticated;

-- Refuse names with blocked words (the app checks first and shows a friendly message; this is the backstop).
-- Only checks a name when it is set or changed, so nobody gets locked out of saving something else.
create or replace function public.profiles_check_names()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.username is distinct from old.username)
     and not public.is_clean(replace(new.username, '_', ' ')) then
    raise exception 'inappropriate_name' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and not public.is_clean(new.display_name) then
    raise exception 'inappropriate_name' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_check_names() from public, anon, authenticated;

drop trigger if exists profiles_check_names on public.profiles;
create trigger profiles_check_names before insert or update of username, display_name on public.profiles
  for each row execute function public.profiles_check_names();

-- =====================================================================
-- Terms and age
-- =====================================================================

-- When the person agreed to the Terms of Use and Privacy Policy and confirmed they are 13 or older.
-- (The birthday itself is checked in the app and never stored.)
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- New accounts: the sign-up form sends terms_accepted = true.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  uname := regexp_replace(
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    '[^a-z0-9_]', '', 'g');
  insert into public.profiles (id, username, display_name, terms_accepted_at)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname),
    case when (new.raw_user_meta_data->>'terms_accepted') = 'true' then now() end
  );
  return new;
end;
$$;

-- Existing accounts agree once, from a screen in the app.
create or replace function public.accept_terms()
returns void
language sql security definer set search_path = public as $$
  update public.profiles set terms_accepted_at = now() where id = auth.uid() and terms_accepted_at is null;
$$;
revoke execute on function public.accept_terms() from public, anon;
grant execute on function public.accept_terms() to authenticated;

-- =====================================================================
-- Blocking
-- =====================================================================

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;

drop policy if exists "see who I blocked" on public.blocks;
create policy "see who I blocked" on public.blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "unblock people" on public.blocks;
create policy "unblock people" on public.blocks for delete to authenticated using (blocker_id = auth.uid());
grant select, delete on public.blocks to authenticated;  -- blocking itself goes through block_user()

-- Has either person blocked the other?
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
                  where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke execute on function public.is_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- Everyone you blocked plus everyone who blocked you (the app leaves them out of search).
create or replace function public.blocked_people()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select blocked_id from public.blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.blocks where blocked_id = auth.uid();
$$;
revoke execute on function public.blocked_people() from public, anon;
grant execute on function public.blocked_people() to authenticated;

-- Block someone: also ends the friendship (or pending request) and removes them from your private ranking.
create or replace function public.block_user(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_id is null or p_id = me then raise exception 'You can''t block yourself'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_id) on conflict do nothing;
  delete from public.friendships
   where (requester_id = me and addressee_id = p_id) or (requester_id = p_id and addressee_id = me);
  delete from public.friend_ranks
   where (user_id = me and friend_id = p_id) or (user_id = p_id and friend_id = me);
end;
$$;
revoke execute on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- No friend requests between blocked people (either direction).
drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests"
  on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending'
              and not public.is_blocked_pair(requester_id, addressee_id));

-- Friend suggestions leave out blocked people (same as update 8, plus the block check).
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
     and not public.is_blocked_pair(auth.uid(), fof.person)
   group by p.id
   order by count(*) desc, p.username
   limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.friend_suggestions(integer) from public, anon;
grant execute on function public.friend_suggestions(integer) to authenticated;

-- =====================================================================
-- Reports
-- =====================================================================

-- Who should hear about new reports (you). See the note at the top for how to add yourself.
create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references public.profiles(id) on delete set null,
  target_type    text not null check (target_type in ('list', 'profile', 'idea')),
  target_id      uuid,            -- the list or profile reported (empty for ideas)
  target_user_id uuid,            -- whose content it is (empty for ideas)
  title          text not null default '',  -- list title, @username, or the idea's title
  reason         text not null check (reason in ('sexual', 'bullying', 'hate', 'violence', 'spam', 'other')),
  details        text not null default '' check (char_length(details) <= 500),
  snapshot       jsonb,           -- a copy of what was reported, in case it is changed or deleted later
  status         text not null default 'open' check (status in ('open', 'done')),
  created_at     timestamptz not null default now()
);
create index if not exists reports_open_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;  -- reports are made through report_content()

-- Make a report. It saves a copy of the list (title, items, photos) or profile (names, picture) as it is right now.
create or replace function public.report_content(p_type text, p_id uuid, p_title text, p_reason text, p_details text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner uuid;
  label text := left(coalesce(p_title, ''), 200);
  snap jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_type = 'list' then
    if not public.can_view_list(p_id) then raise exception 'List not found'; end if;
    select l.owner_id, l.title,
           jsonb_build_object(
             'title', l.title, 'icon_path', l.icon_path,
             'items', coalesce((select jsonb_agg(jsonb_build_object('rank', i.position + 1, 'title', i.title,
                                                                    'note', i.note, 'image_path', i.image_path)
                                                 order by i.position)
                                  from public.list_items i where i.list_id = l.id), '[]'::jsonb))
      into owner, label, snap
      from public.lists l where l.id = p_id;
  elsif p_type = 'profile' then
    select p.id, '@' || p.username,
           jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
      into owner, label, snap
      from public.profiles p where p.id = p_id;
    if owner is null then raise exception 'Person not found'; end if;
  elsif p_type = 'idea' then
    p_id := null;
    if label = '' then raise exception 'Missing idea'; end if;
    -- reporting an idea also hides it for you
    insert into public.hidden_ideas (user_id, k) values (me, public.idea_key(label)) on conflict do nothing;
  else
    raise exception 'Unknown report type';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_user_id, title, reason, details, snapshot)
  values (me, p_type, p_id, owner, coalesce(label, ''), p_reason, left(coalesce(p_details, ''), 500), snap);

  -- tell the admins (shows in their Activity tab, and as a phone notification if they turned those on)
  insert into public.notifications (recipient_id, actor_id, type, list_title, item_title, link)
  select a.user_id, null, 'announcement', 'New report: ' || left(coalesce(label, ''), 60),
         'Someone reported a ' || p_type || ' for "' || p_reason || '". Review it in Supabase: Table Editor -> reports.',
         null
    from public.app_admins a
   where a.user_id <> me;
end;
$$;
revoke execute on function public.report_content(text, uuid, text, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text, text) to authenticated;

-- Easier reading in the dashboard: open reports with names filled in, newest first.
-- (SQL Editor: select * from public.open_reports;)
create or replace view public.open_reports as
  select r.created_at, r.target_type, r.title, r.reason, r.details,
         rp.username as reported_by, tp.username as content_by, r.target_id, r.target_user_id, r.snapshot, r.id
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles tp on tp.id = r.target_user_id
   where r.status = 'open'
   order by r.created_at desc;
revoke all on public.open_reports from anon, authenticated;

-- =====================================================================
-- Ideas: hide, report, word filter, blocks
-- =====================================================================

create table if not exists public.hidden_ideas (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  k          text not null,   -- idea_key(title)
  created_at timestamptz not null default now(),
  primary key (user_id, k)
);
alter table public.hidden_ideas enable row level security;
drop policy if exists "see my hidden ideas" on public.hidden_ideas;
create policy "see my hidden ideas" on public.hidden_ideas for select to authenticated using (user_id = auth.uid());
drop policy if exists "hide ideas" on public.hidden_ideas;
create policy "hide ideas" on public.hidden_ideas for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "unhide ideas" on public.hidden_ideas;
create policy "unhide ideas" on public.hidden_ideas for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.hidden_ideas to authenticated;

-- Same as update 15, plus: titles with blocked words, titles you hid, titles reported by 2+ people,
-- and lists from people blocked either way are never suggested.
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
  ), blocked as (
    select blocked_id as pid from public.blocks, me where blocker_id = me.id
    union
    select blocker_id from public.blocks, me where blocked_id = me.id
  ), mine as (
    -- titles you already have, or hid, are not suggested to you
    select distinct public.idea_key(l.title) as k from public.lists l, me where l.owner_id = me.id
    union
    select h.k from public.hidden_ideas h, me where h.user_id = me.id
  ), reported as (
    select public.idea_key(r.title) as k
      from public.reports r
     where r.target_type = 'idea'
     group by 1
    having count(distinct r.reporter_id) >= 2
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
       and l.owner_id not in (select pid from blocked)
       and public.is_clean(l.title)
  ), groups as (
    -- one row per title: this is what makes every title equally likely
    select pl.k,
           count(distinct pl.owner_id)::integer as owners,
           bool_or(pl.is_friend) as has_friend,
           md5(me.id::text || me.day::text || pl.k) as shuffle
      from pool pl cross join me
     where pl.k not in (select k from mine)
       and pl.k not in (select k from reported)
     group by pl.k, me.id, me.day
  ), ranked as (
    select g.*,
           cume_dist() over (order by g.owners) as share,                          -- 0.9+ = top 10% by people
           row_number() over (partition by g.has_friend order by g.shuffle) as nth  -- random order within friends / others
      from groups g
  ), ideas as (
    -- first up to 30% (3 of 10) random friend titles, then the rest filled at random from everything
    select r.*
      from ranked r cross join me
     order by (r.has_friend and r.nth <= ceil(me.n * 0.3)) desc, r.shuffle
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


-- ---------- Update 19: voice memos on items ----------

-- RankR update 19. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it BEFORE deploying the matching app version.
--
-- * An item can have a short voice memo (up to 60 seconds). The sound file is stored next to item photos,
--   in the item-images storage bucket, inside the owner's own folder.
-- * Reports keep a copy of an item's voice memo too, so you can listen to what was reported.

alter table public.list_items add column if not exists audio_path text;
alter table public.list_items add column if not exists audio_seconds smallint;
alter table public.list_items drop constraint if exists list_items_audio_seconds_check;
alter table public.list_items add constraint list_items_audio_seconds_check
  check (audio_seconds is null or audio_seconds between 0 and 120);

-- Make a report (same as update 17; the saved copy now includes voice memos). It saves a copy of the list (title, items, photos) or profile (names, picture) as it is right now.
create or replace function public.report_content(p_type text, p_id uuid, p_title text, p_reason text, p_details text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  owner uuid;
  label text := left(coalesce(p_title, ''), 200);
  snap jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_type = 'list' then
    if not public.can_view_list(p_id) then raise exception 'List not found'; end if;
    select l.owner_id, l.title,
           jsonb_build_object(
             'title', l.title, 'icon_path', l.icon_path,
             'items', coalesce((select jsonb_agg(jsonb_build_object('rank', i.position + 1, 'title', i.title,
                                                                    'note', i.note, 'image_path', i.image_path,
                                                                    'audio_path', i.audio_path)
                                                 order by i.position)
                                  from public.list_items i where i.list_id = l.id), '[]'::jsonb))
      into owner, label, snap
      from public.lists l where l.id = p_id;
  elsif p_type = 'profile' then
    select p.id, '@' || p.username,
           jsonb_build_object('username', p.username, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
      into owner, label, snap
      from public.profiles p where p.id = p_id;
    if owner is null then raise exception 'Person not found'; end if;
  elsif p_type = 'idea' then
    p_id := null;
    if label = '' then raise exception 'Missing idea'; end if;
    -- reporting an idea also hides it for you
    insert into public.hidden_ideas (user_id, k) values (me, public.idea_key(label)) on conflict do nothing;
  else
    raise exception 'Unknown report type';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_user_id, title, reason, details, snapshot)
  values (me, p_type, p_id, owner, coalesce(label, ''), p_reason, left(coalesce(p_details, ''), 500), snap);

  -- tell the admins (shows in their Activity tab, and as a phone notification if they turned those on)
  insert into public.notifications (recipient_id, actor_id, type, list_title, item_title, link)
  select a.user_id, null, 'announcement', 'New report: ' || left(coalesce(label, ''), 60),
         'Someone reported a ' || p_type || ' for "' || p_reason || '". Review it in Supabase: Table Editor -> reports.',
         null
    from public.app_admins a
   where a.user_id <> me;
end;
$$;
revoke execute on function public.report_content(text, uuid, text, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text, text) to authenticated;

