create extension if not exists pgcrypto;

create type public.proposal_source as enum ('MANUAL', 'CALENDAR');
create type public.quality_score as enum ('GOOD', 'FAIR', 'POOR', 'INSUFFICIENT_DATA');
create type public.decision_outcome as enum ('AUTO_APPROVE', 'MANUAL_REVIEW', 'BLOCK');
create type public.payment_status as enum ('CREATED', 'APPROVED', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  time_windows jsonb not null default '[]'::jsonb,
  amount_caps jsonb not null default '{}'::jsonb,
  currency text not null check (char_length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_name text not null,
  proposed_price numeric(14, 2) not null check (proposed_price > 0),
  currency text not null check (char_length(currency) = 3),
  source public.proposal_source not null default 'MANUAL',
  source_event_id text,
  proposed_for timestamptz,
  created_at timestamptz not null default now()
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  quality_score public.quality_score not null,
  explanation text not null,
  channel3_refs jsonb not null default '[]'::jsonb,
  trust_signal text not null check (trust_signal in ('PASS', 'FAIL', 'UNAVAILABLE')),
  created_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  outcome public.decision_outcome not null,
  reason text not null,
  reviewer_id uuid references public.users(id),
  decided_at timestamptz not null default now()
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete restrict,
  paypal_order_id text unique,
  paypal_authorization_id text unique,
  paypal_capture_id text unique,
  status public.payment_status not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (char_length(currency) = 3),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete restrict,
  entity_type text not null,
  entity_id text not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.constraints enable row level security;
alter table public.proposals enable row level security;
alter table public.evaluations enable row level security;
alter table public.decisions enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.audit_events enable row level security;

create policy "users_read_own" on public.users for select using (auth.uid() = id);
create policy "constraints_own" on public.constraints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "proposals_own" on public.proposals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update, delete on public.audit_events from authenticated;

create index proposals_user_created_idx on public.proposals(user_id, created_at desc);
create index evaluations_proposal_idx on public.evaluations(proposal_id);
create index decisions_evaluation_idx on public.decisions(evaluation_id);
create index payment_attempts_decision_idx on public.payment_attempts(decision_id);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at);

