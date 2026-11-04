-- Each user connects their own Google Calendar. Replaces one shared calendar
-- configured on the server, which showed the same events to every user.
-- Refresh tokens are encrypted by the app. RLS is on with no policies, so only
-- the service role can touch this table: users never read their stored token.
create table public.calendar_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  refresh_token_encrypted text not null,
  needs_reconnect boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();
