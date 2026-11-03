-- One-time announcement: tell everyone about the Ideas tab.
-- Run this ONCE, AFTER update-15.sql and AFTER the new app version is live
-- (older versions of the app don't know how to show an announcement).
--
-- Also redeploy the send-push Edge Function first, so phone notifications show the announcement properly.
--
-- It shows up in everyone's Activity tab with the red badge, and as a phone notification for everyone
-- who turned those on. Tapping it opens the Ideas tab.

insert into public.notifications (recipient_id, actor_id, type, list_title, item_title, link)
select p.id, null, 'announcement',
       'New: the Ideas tab!',
       'Get fresh list ideas every day. The titles of your shared lists can now show up there for your friends '
       || 'and for people you don''t know. People you don''t know only ever see the title, never your name or your items. '
       || '"Only me" lists are never included. To turn this off for all your lists, go to the Me tab. '
       || 'For just one list, open that list''s settings.',
       '/ideas'
  from public.profiles p;
