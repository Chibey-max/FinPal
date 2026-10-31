-- FinPal schema for plain PostgreSQL (Render Postgres).
--
-- Equivalent to the final state of the nine earlier Supabase migrations (see
-- git history for supabase/migrations), without the Supabase-only parts: the auth
-- schema, the sign-up trigger and row-level-security policies. FinPal now
-- owns sign-in (users.email/password_hash and sessions), and the backend
-- scopes every query by the signed-in user's id.

-- Enums --------------------------------------------------------------------

create type public.decision_outcome as enum ('AUTO_APPROVE', 'MANUAL_REVIEW', 'BLOCK');
create type public.payment_status as enum ('CREATED', 'APPROVED', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED');
create type public.proposal_source as enum ('MANUAL', 'CALENDAR', 'AGENT');
create type public.quality_score as enum ('GOOD', 'FAIR', 'POOR', 'INSUFFICIENT_DATA');
create type public.review_status as enum ('APPROVED', 'REJECTED');

-- Users and sessions -------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  -- Stored lower-cased so sign-in is case-insensitive.
  email text not null unique check (email = lower(email)),
  -- scrypt hash; null for accounts imported from Supabase until a password
  -- is set (Supabase password hashes cannot be carried over).
  password_hash text,
  display_name text,
  created_at timestamptz not null default now()
);

-- One row per signed-in browser. The cookie holds a random token; only its
-- SHA-256 is stored, so a database leak does not leak usable sessions.
create table public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_idx on public.sessions (user_id);
create index sessions_expires_idx on public.sessions (expires_at);

-- Spending constraints -----------------------------------------------------

create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  time_windows jsonb not null default '[]'::jsonb,
  amount_caps jsonb not null default '{}'::jsonb,
  currency text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint constraints_one_per_user unique (user_id),
  constraint constraints_amount_caps_is_object check (jsonb_typeof(amount_caps) = 'object'),
  constraint constraints_currency_check check (char_length(currency) = 3),
  constraint constraints_currency_uppercase check (currency = upper(currency)),
  constraint constraints_time_windows_is_array check (jsonb_typeof(time_windows) = 'array')
);

-- Proposals, evaluations, decisions ----------------------------------------

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

create index proposals_user_created_idx on public.proposals (user_id, created_at desc);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  quality_score public.quality_score not null,
  explanation text not null,
  channel3_refs jsonb not null default '[]'::jsonb,
  trust_signal text not null,
  trust_evidence jsonb not null default '{}'::jsonb,
  offer_count integer not null default 0,
  median_price numeric(14, 2),
  lowest_price numeric(14, 2),
  offer_currency text,
  constraint_check jsonb,
  quality_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint evaluations_offer_count_check check (offer_count >= 0),
  constraint evaluations_offer_currency_check check (char_length(offer_currency) = 3),
  constraint evaluations_quality_result_check check (jsonb_typeof(quality_result) = 'object'),
  constraint evaluations_trust_evidence_check check (jsonb_typeof(trust_evidence) = 'object'),
  constraint evaluations_trust_signal_check
    check (trust_signal in ('PASS', 'FAIL', 'UNAVAILABLE', 'NOT_CHECKED'))
);

create index evaluations_proposal_idx on public.evaluations (proposal_id);
create index evaluations_user_created_idx on public.evaluations (user_id, created_at desc);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  outcome public.decision_outcome not null,
  reason text not null,
  reasons jsonb not null default '[]'::jsonb,
  decided_at timestamptz not null default now(),
  reviewer_id uuid references public.users(id),
  review_status public.review_status,
  reviewed_at timestamptz,
  constraint decisions_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint decisions_review_consistency check (
    (review_status is null and reviewed_at is null and reviewer_id is null)
    or (review_status is not null and reviewed_at is not null and reviewer_id is not null)
  )
);

create index decisions_evaluation_idx on public.decisions (evaluation_id);
create index decisions_user_decided_idx on public.decisions (user_id, decided_at desc);
create index decisions_user_outcome_idx on public.decisions (user_id, outcome, decided_at desc);
create index decisions_review_status_idx
  on public.decisions (user_id, review_status, decided_at desc)
  where review_status is not null;

-- Payments -------------------------------------------------------------------

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  status public.payment_status not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (char_length(currency) = 3),
  idempotency_key text not null unique,
  paypal_order_id text not null unique,
  paypal_order_status text,
  paypal_authorization_id text unique,
  paypal_authorization_status text,
  paypal_capture_id text unique,
  paypal_capture_status text,
  approve_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- PayPal ids must exist for every state that depends on them.
  constraint payment_attempts_ids_match_status check (
    (status not in ('AUTHORIZED', 'CAPTURED', 'VOIDED') or paypal_authorization_id is not null)
    and (status not in ('CAPTURED', 'REFUNDED') or paypal_capture_id is not null)
  ),
  -- PayPal statuses are stored exactly as PayPal returns them.
  constraint payment_attempts_paypal_status_uppercase check (
    paypal_order_status = upper(paypal_order_status)
    and paypal_authorization_status = upper(paypal_authorization_status)
    and paypal_capture_status = upper(paypal_capture_status)
  )
);

create index payment_attempts_decision_idx on public.payment_attempts (decision_id);
create index payment_attempts_user_created_idx on public.payment_attempts (user_id, created_at desc);
-- One live payment per decision; a voided attempt may be retried.
create unique index payment_attempts_one_active_per_decision
  on public.payment_attempts (decision_id)
  where status <> 'VOIDED';

-- PayPal webhook deliveries, idempotent by PayPal's event id.
create table public.paypal_webhook_events (
  id text primary key,
  event_type text not null,
  resource_type text,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index paypal_webhook_events_resource_idx
  on public.paypal_webhook_events (resource_id, processed_at desc)
  where resource_id is not null;

-- Audit log (append-only) ---------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete restrict,
  entity_type text not null,
  entity_id text not null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_entity_type_known check (
    entity_type in ('constraints', 'proposal', 'evaluation', 'decision', 'payment_attempt')
  ),
  constraint audit_events_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint audit_events_type_format check (type ~ '^[A-Z][A-Z0-9_]*$')
);

create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at);
create index audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

-- Append-only for every role, including the table owner: corrections are new
-- events, never edits.
create function public.reject_audit_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only: % is not allowed; record a new event instead', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_no_update_or_delete
  before update or delete on public.audit_events
  for each row execute function public.reject_audit_event_change();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function public.reject_audit_event_change();

-- updated_at ---------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger constraints_set_updated_at
  before update on public.constraints
  for each row execute function public.set_updated_at();

create trigger payment_attempts_set_updated_at
  before update on public.payment_attempts
  for each row execute function public.set_updated_at();

-- Evaluation + decision in one transaction ---------------------------------

-- A failed decision insert rolls back the evaluation, so an evaluation can
-- never exist without its decision.
create function public.record_evaluation_with_decision(
  p_user_id uuid,
  p_proposal_id uuid,
  p_quality jsonb,
  p_constraint_check jsonb,
  p_trust_signal text,
  p_trust_evidence jsonb,
  p_outcome public.decision_outcome,
  p_reason text,
  p_reasons jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_evaluation public.evaluations;
  v_decision public.decisions;
begin
  -- Defence in depth: the proposal must belong to the user.
  if not exists (
    select 1 from public.proposals
    where id = p_proposal_id and user_id = p_user_id
  ) then
    raise exception 'proposal % not found for user', p_proposal_id
      using errcode = 'no_data_found';
  end if;

  insert into public.evaluations (
    user_id, proposal_id, quality_score, explanation, channel3_refs,
    trust_signal, trust_evidence, offer_count, median_price, lowest_price,
    offer_currency, constraint_check, quality_result
  ) values (
    p_user_id,
    p_proposal_id,
    (p_quality ->> 'score')::public.quality_score,
    p_quality ->> 'explanation',
    coalesce(p_quality -> 'references', '[]'::jsonb),
    p_trust_signal,
    coalesce(p_trust_evidence, '{}'::jsonb),
    (p_quality ->> 'offerCount')::integer,
    (p_quality ->> 'medianPrice')::numeric,
    (p_quality ->> 'lowestPrice')::numeric,
    p_quality ->> 'currency',
    p_constraint_check,
    p_quality
  )
  returning * into v_evaluation;

  insert into public.decisions (user_id, evaluation_id, outcome, reason, reasons)
  values (p_user_id, v_evaluation.id, p_outcome, p_reason, p_reasons)
  returning * into v_decision;

  return jsonb_build_object(
    'evaluation', to_jsonb(v_evaluation),
    'decision', to_jsonb(v_decision)
  );
end;
$$;
