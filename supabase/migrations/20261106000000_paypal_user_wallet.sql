-- Per-user PayPal Log in with PayPal + personal FinPal ledger.
-- Tokens are encrypted by the app. RLS on with no policies: service role only.

create table public.paypal_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  refresh_token_encrypted text not null,
  payer_id text not null,
  email text not null,
  needs_reconnect boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paypal_connections enable row level security;

create trigger paypal_connections_set_updated_at
  before update on public.paypal_connections
  for each row execute function public.set_updated_at();

create table public.user_wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  currency text not null default 'USD',
  available numeric(14, 2) not null default 0
    check (available >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_wallets enable row level security;

create trigger user_wallets_set_updated_at
  before update on public.user_wallets
  for each row execute function public.set_updated_at();

create table public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null
    check (kind in (
      'TOP_UP',
      'SEND_HOLD',
      'SEND_CAPTURE',
      'SEND_RELEASE',
      'ADJUSTMENT'
    )),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'USD',
  paypal_order_id text,
  send_draft_id uuid,
  created_at timestamptz not null default now()
);

create unique index wallet_ledger_top_up_order_uidx
  on public.wallet_ledger_entries (paypal_order_id)
  where kind = 'TOP_UP' and paypal_order_id is not null;

create unique index wallet_ledger_send_hold_uidx
  on public.wallet_ledger_entries (send_draft_id)
  where kind = 'SEND_HOLD' and send_draft_id is not null;

create index wallet_ledger_user_created_idx
  on public.wallet_ledger_entries (user_id, created_at desc);

alter table public.wallet_ledger_entries enable row level security;

-- Pending top-ups waiting for PayPal Checkout approval + capture.
create table public.wallet_top_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'USD',
  paypal_order_id text not null unique,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_top_ups enable row level security;

create trigger wallet_top_ups_set_updated_at
  before update on public.wallet_top_ups
  for each row execute function public.set_updated_at();
