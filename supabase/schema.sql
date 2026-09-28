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
