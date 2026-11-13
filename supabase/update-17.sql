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
