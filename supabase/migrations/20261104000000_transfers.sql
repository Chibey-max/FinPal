-- Sending money to a person. A transfer is a proposal with a recipient, and its
-- payment records who PayPal pays. PayPal only pays someone else's account with
-- an immediate capture, so a captured transfer never had an authorization: that
-- id is now required only for the states that use it. CAPTURED still needs a
-- capture id.
alter table public.proposals
  add column recipient_email text,
  add constraint proposals_recipient_email_lowercase
    check (recipient_email = lower(recipient_email));

alter table public.payment_attempts
  add column payee_email text,
  drop constraint payment_attempts_ids_match_status,
  add constraint payment_attempts_ids_match_status check (
    (status not in ('AUTHORIZED', 'VOIDED') or paypal_authorization_id is not null)
    and (status <> 'CAPTURED' or payee_email is not null or paypal_authorization_id is not null)
    and (status not in ('CAPTURED', 'REFUNDED') or paypal_capture_id is not null)
  );
