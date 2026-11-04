-- One PayPal order can now pay for several decisions (a shopping basket).
-- Each item keeps its own payment_attempts row, so caps, the audit trail and
-- the dashboard stay per item; rows of one basket share basket_id and the
-- PayPal order, authorization and capture ids. Payments outside a basket keep
-- the old one-to-one uniqueness.
alter table public.payment_attempts
  add column basket_id uuid,
  drop constraint payment_attempts_paypal_order_id_key,
  drop constraint payment_attempts_paypal_authorization_id_key,
  drop constraint payment_attempts_paypal_capture_id_key;

create unique index payment_attempts_order_unique
  on public.payment_attempts(paypal_order_id) where basket_id is null;
create unique index payment_attempts_authorization_unique
  on public.payment_attempts(paypal_authorization_id) where basket_id is null;
create unique index payment_attempts_capture_unique
  on public.payment_attempts(paypal_capture_id) where basket_id is null;

create index payment_attempts_paypal_order_idx
  on public.payment_attempts(paypal_order_id);
create index payment_attempts_paypal_authorization_idx
  on public.payment_attempts(paypal_authorization_id);
create index payment_attempts_basket_idx
  on public.payment_attempts(basket_id) where basket_id is not null;
