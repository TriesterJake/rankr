# Moderation: handling reports

Apple requires you to act on reports quickly. The Terms promise **within 24 hours**, so check once a day.

## Get notified about new reports (do once)

After running `update-17.sql`, run this in the SQL Editor with **your** username:

```sql
insert into public.app_admins (user_id)
select id from public.profiles where username = 'your_username'
on conflict do nothing;
```

Every new report then shows up in your **Activity** tab, and as a phone notification if you have those turned on.

## See open reports

SQL Editor:

```sql
select * from public.open_reports;
```

Each row shows what was reported (`list`, `profile` or `idea`), the reason, who sent it (`reported_by`), whose content it is
(`content_by`) and a `snapshot`, which is a copy of the list or profile at the time of the report. The copy stays even if the
person deletes or edits the content later.

To view a reported photo, take its `image_path` (or `avatar_path`) from the snapshot and open:
`https://YOUR-PROJECT-REF.supabase.co/storage/v1/object/public/item-images/THE_PATH`

## Take action

Pick what fits. Put in the real ids and usernames.

```sql
-- delete a list and its items (photo files stay in Storage -> item-images; delete them there if needed)
delete from public.lists where id = 'LIST_ID';

-- remove a profile picture
update public.profiles set avatar_path = null where username = 'their_username';

-- replace a bad display name or username (usernames: 3-20 letters, numbers or _)
update public.profiles set display_name = 'RankR user' where username = 'their_username';
update public.profiles set username = 'user_4821' where username = 'their_username';

-- ban someone (they can't sign in again; they're signed out within about an hour)
update auth.users set banned_until = '3000-01-01'
 where id = (select id from public.profiles where username = 'their_username');

-- or delete the account entirely
delete from auth.users where id = (select id from public.profiles where username = 'their_username');

-- mark a report handled (it leaves open_reports)
update public.reports set status = 'done' where id = 'REPORT_ID';
```

An **idea** that 2 or more different people report disappears from everyone's Ideas tab on its own.

## The word filter

The words are in the `blocked_words` table (Table Editor). Add more at any time:

```sql
insert into public.blocked_words (word, mode) values ('newword', 'word') on conflict do nothing;
```

- `word` matches the whole word plus simple endings (`s`, `es`, `y`, `ing`, `ed`, `er`, `ers`). `ass` blocks "asses" but not "class".
- `part` matches inside any word. Use it only for words that are never innocent: `fuck` blocks "fuckboy".
- `phrase` matches words in a row: `curse word` blocks "fav curse words".

Test any text: `select public.is_clean('fav things in sex');` returns `false` when the text would be blocked.

The filter applies to new or changed usernames and display names, and to every title shown on the Ideas tab. Lists themselves
are never filtered, so people can still write what they want in their own lists. To find existing names that would be blocked:

```sql
select username, display_name from public.profiles
 where not public.is_clean(replace(username, '_', ' ')) or not public.is_clean(display_name);
```
