-- ---------- Update 25: notifications in the iPhone app ----------

-- RankR update 25. Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- The iPhone app gets its notifications from Apple, not through web push. Each iPhone that turns them on
-- saves its Apple "device token" here. The send-push function sends to these AND to web push subscriptions,
-- so the website (Android, home-screen web app) keeps working exactly as before.

create table if not exists public.apns_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists apns_tokens_user_idx on public.apns_tokens (user_id);

alter table public.apns_tokens enable row level security;

drop policy if exists "see my apns tokens" on public.apns_tokens;
drop policy if exists "delete my apns tokens" on public.apns_tokens;
create policy "see my apns tokens" on public.apns_tokens
  for select to authenticated using (user_id = auth.uid());
create policy "delete my apns tokens" on public.apns_tokens
  for delete to authenticated using (user_id = auth.uid());

grant select, delete on public.apns_tokens to authenticated;

-- Saves this iPhone for the signed-in person (moves it over if someone else was signed in on it before).
create or replace function public.save_apns_token(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{32,200}$' then raise exception 'Bad device token'; end if;
  insert into public.apns_tokens (user_id, token)
  values (auth.uid(), lower(p_token))
  on conflict (token) do update set user_id = auth.uid();
end;
$$;
revoke execute on function public.save_apns_token(text) from public, anon;
grant execute on function public.save_apns_token(text) to authenticated;
