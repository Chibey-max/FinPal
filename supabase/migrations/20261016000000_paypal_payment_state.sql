-- PayPal payment state model: CREATED -> APPROVED -> AUTHORIZED -> CAPTURED,
-- AUTHORIZED -> VOIDED. `status` is FinPal's state machine; the paypal_*_status
-- columns hold PayPal's own status strings exactly as returned (uppercase).

alter table public.payment_attempts
  alter column paypal_order_id set not null,
  add column paypal_order_status text,
  add column paypal_authorization_status text,
  add column paypal_capture_status text,
  add column approve_url text,
  add constraint payment_attempts_paypal_status_uppercase check (
    paypal_order_status = upper(paypal_order_status)
    and paypal_authorization_status = upper(paypal_authorization_status)
    and paypal_capture_status = upper(paypal_capture_status)
  ),
  -- PayPal ids must exist for every state that depends on them.
  add constraint payment_attempts_ids_match_status check (
    (status not in ('AUTHORIZED', 'CAPTURED', 'VOIDED') or paypal_authorization_id is not null)
    and (status not in ('CAPTURED', 'REFUNDED') or paypal_capture_id is not null)
  );

-- One live payment per decision; a voided attempt may be retried.
create unique index payment_attempts_one_active_per_decision
  on public.payment_attempts(decision_id)
  where status <> 'VOIDED';

-- Keep updated_at current on every update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payment_attempts_set_updated_at
  before update on public.payment_attempts
  for each row execute function public.set_updated_at();

create trigger constraints_set_updated_at
  before update on public.constraints
  for each row execute function public.set_updated_at();
