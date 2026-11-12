-- ---------- Update 16: delete my account (required by the App Store) ----------

-- RankR update 16. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Lets a signed-in person permanently delete their own account. Deleting the auth user cascades to their
-- profile, lists, items, friendships, likes, reactions and notifications (all foreign keys use ON DELETE CASCADE).
-- Their uploaded photos are removed by the app first (Supabase doesn't delete storage files from SQL).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
