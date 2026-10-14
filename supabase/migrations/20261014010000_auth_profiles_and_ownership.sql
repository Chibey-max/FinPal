-- Day 1: link Supabase Auth to public.users and give every user-facing table a
-- direct owner column so RLS policies never depend on multi-table joins.
-- See docs/security.md for the full RLS plan.

-- 1. Create a public.users profile whenever an auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill any auth users created before this migration.
insert into public.users (id, display_name)
select id, raw_user_meta_data ->> 'display_name'
from auth.users
on conflict (id) do nothing;

-- 2. Direct ownership columns. Tables are empty at this point in the build.
alter table public.evaluations
  add column user_id uuid not null references public.users(id) on delete cascade;
alter table public.decisions
  add column user_id uuid not null references public.users(id) on delete cascade;
alter table public.payment_attempts
  add column user_id uuid not null references public.users(id) on delete restrict;

create index evaluations_user_created_idx on public.evaluations(user_id, created_at desc);
create index decisions_user_decided_idx on public.decisions(user_id, decided_at desc);
create index payment_attempts_user_created_idx on public.payment_attempts(user_id, created_at desc);
create index audit_events_user_created_idx on public.audit_events(user_id, created_at desc);

-- 3. RLS policies. Users write only their own inputs (profile, constraints,
-- proposals). Evaluations, decisions, payments, and audit events are written by
-- the backend with the service role, so users can read but never forge them.
create policy "users_update_own" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "evaluations_read_own" on public.evaluations
  for select using (auth.uid() = user_id);
create policy "decisions_read_own" on public.decisions
  for select using (auth.uid() = user_id);
create policy "payment_attempts_read_own" on public.payment_attempts
  for select using (auth.uid() = user_id);
create policy "audit_events_read_own" on public.audit_events
  for select using (auth.uid() = user_id);
