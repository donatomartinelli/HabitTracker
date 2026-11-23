-- Cortex: one private row of app data per user (run in the Supabase SQL editor)
create table if not exists public.cortex_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Row Level Security: each user can only see and change their own row
alter table public.cortex_state enable row level security;

drop policy if exists "cortex_state_select_own" on public.cortex_state;
drop policy if exists "cortex_state_insert_own" on public.cortex_state;
drop policy if exists "cortex_state_update_own" on public.cortex_state;
drop policy if exists "cortex_state_delete_own" on public.cortex_state;

create policy "cortex_state_select_own" on public.cortex_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "cortex_state_insert_own" on public.cortex_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cortex_state_update_own" on public.cortex_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "cortex_state_delete_own" on public.cortex_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- No access at all for anonymous visitors
revoke all on public.cortex_state from anon;
grant select, insert, update, delete on public.cortex_state to authenticated;

-- Auth settings (dashboard): Site URL = https://donatomartinelli.github.io/HabitTracker/
-- Redirect URLs: https://donatomartinelli.github.io/HabitTracker/**  and  http://localhost:5173/**

-- Lets a signed-in user delete their own account (and, by cascade, their data row)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Calendar feed: a secret address that Google / Apple Calendar can subscribe to.
-- Only the function below (and the "calendar" Edge Function, server side) can
-- read this table; the token is the only thing that unlocks a user's feed.
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;

-- Returns the signed-in user's feed secret, creating it the first time.
-- reset => true makes a new secret (the old address stops working).
create or replace function public.calendar_feed_token(reset boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if reset then
    update public.calendar_feeds
       set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
     where user_id = auth.uid();
  end if;
  select token into t from public.calendar_feeds where user_id = auth.uid();
  if t is null then
    t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.calendar_feeds (user_id, token) values (auth.uid(), t);
  end if;
  return t;
end;
$$;

revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

-- The "calendar" Edge Function reads feeds and synced data with the server role
grant usage on schema public to service_role;
grant select on public.calendar_feeds to service_role;
grant select on public.cortex_state to service_role;
