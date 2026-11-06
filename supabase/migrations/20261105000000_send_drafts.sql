-- Persist Agent/Send payout drafts so history survives server restarts.
create table if not exists public.send_drafts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (char_length(currency) = 3),
  recipient_email text not null,
  memo text,
  rule_outcome text not null check (rule_outcome in ('MANUAL_REVIEW', 'BLOCK')),
  rule_reason text not null,
  available_at_draft numeric(12, 2),
  balance_after_send numeric(12, 2),
  status text not null check (
    status in ('DRAFT', 'APPROVED', 'PAYING', 'SENT', 'FAILED')
  ),
  payout_batch_id text,
  payout_item_id text,
  payout_status text not null check (
    payout_status in (
      'NONE',
      'PENDING',
      'SUCCESS',
      'UNCLAIMED',
      'FAILED',
      'RETURNED'
    )
  ),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists send_drafts_user_idempotency_uidx
  on public.send_drafts (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists send_drafts_user_updated_idx
  on public.send_drafts (user_id, updated_at desc);

alter table public.send_drafts enable row level security;

-- App uses the service role; no direct client writes.
revoke all on public.send_drafts from anon, authenticated;
grant select, insert, update, delete on public.send_drafts to service_role;
