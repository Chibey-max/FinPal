-- Spending constraints, plus the evaluation/decision fields the PRD requires
-- the orchestrator to persist.

-- Constraints: one row per user, evaluated in the user's own timezone.
-- JSON shapes are validated by spendingConstraintsSchema in @finpal/contracts;
-- the database only guards the top-level types.
alter table public.constraints
  add column timezone text not null default 'UTC',
  add constraint constraints_one_per_user unique (user_id),
  add constraint constraints_time_windows_is_array
    check (jsonb_typeof(time_windows) = 'array'),
  add constraint constraints_amount_caps_is_object
    check (jsonb_typeof(amount_caps) = 'object'),
  add constraint constraints_currency_uppercase
    check (currency = upper(currency));

-- Evaluations: Quality Score inputs and outputs, and the constraint result.
alter table public.evaluations
  add column offer_count integer not null default 0 check (offer_count >= 0),
  add column median_price numeric(14, 2),
  add column lowest_price numeric(14, 2),
  add column offer_currency text check (char_length(offer_currency) = 3),
  add column constraint_check jsonb not null default '{}'::jsonb;

-- Decisions: machine-readable reasons alongside the human-readable summary.
alter table public.decisions
  add column reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reasons) = 'array');
