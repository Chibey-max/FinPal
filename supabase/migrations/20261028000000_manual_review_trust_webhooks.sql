-- Day 13–14 + optional webhooks: trust evidence, manual review, webhook idempotency.

-- KERNEL trust check evidence (reference URL, HTTP status, browser session id, etc.).
alter table public.evaluations
  add column if not exists trust_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(trust_evidence) = 'object');

-- Manual approval (Day 14): reviewer action on MANUAL_REVIEW decisions.
create type public.review_status as enum ('APPROVED', 'REJECTED');

alter table public.decisions
  add column if not exists review_status public.review_status,
  add column if not exists reviewed_at timestamptz;

alter table public.decisions
  add constraint decisions_review_consistency check (
    (review_status is null and reviewed_at is null and reviewer_id is null)
    or (
      review_status is not null
      and reviewed_at is not null
      and reviewer_id is not null
    )
  );

create index if not exists decisions_review_status_idx
  on public.decisions(user_id, review_status, decided_at desc)
  where review_status is not null;

-- PayPal webhook deliveries (idempotent by PayPal event id).
create table if not exists public.paypal_webhook_events (
  id text primary key,
  event_type text not null,
  resource_type text,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists paypal_webhook_events_resource_idx
  on public.paypal_webhook_events(resource_id, processed_at desc)
  where resource_id is not null;

-- Service role only; no authenticated access.
alter table public.paypal_webhook_events enable row level security;
revoke all on public.paypal_webhook_events from authenticated, anon;
