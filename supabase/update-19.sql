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

