#!/usr/bin/env bash
# One-off copy of FinPal's data from the old Supabase project into the new
# Postgres database (e.g. Render). Run once, after the target is migrated
# (deploy the app, or `pnpm db:migrate` with DATABASE_URL=<target>).
#
#   SOURCE_DATABASE_URL='postgresql://...supabase...' \
#   TARGET_DATABASE_URL='postgresql://...render.com/finpal' \
#   db/import-from-supabase.sh
#
# Emails come from Supabase's auth.users. Password hashes are not copied:
# each person sets a new one with `pnpm db:set-password <email>`.
# Uses psql from the postgres:17-alpine Docker image; nothing is installed.
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL to the Supabase connection string}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL to the new database (external URL)}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

psql() {
  docker run --rm -i --network host -v "$work:/work" -e PGCONNECT_TIMEOUT=15 \
    postgres:17-alpine psql -v ON_ERROR_STOP=1 -X -q "$@"
}

existing="$(psql "$TARGET_DATABASE_URL" -tAc \
  "select count(*) from public.users" 2>/dev/null)" || {
  echo "The target has no FinPal schema yet. Deploy the app or run pnpm db:migrate first." >&2
  exit 1
}
if [ "$existing" != "0" ]; then
  echo "The target already has $existing users; refusing to import twice." >&2
  exit 1
fi

# Source -> CSV, parents before children. Explicit column lists, so column
# order differences between the two schemas do not matter.
export_table() {
  local name="$1" query="$2"
  psql "$SOURCE_DATABASE_URL" -c "\\copy ($query) to '/work/$name.csv' with (format csv)"
  echo "exported $name: $(wc -l < "$work/$name.csv") rows"
}

export_table users "select u.id, coalesce(lower(a.email), u.id || '@imported.invalid'), u.display_name, u.created_at from public.users u left join auth.users a on a.id = u.id"
export_table constraints "select id, user_id, time_windows, amount_caps, currency, timezone, created_at, updated_at from public.constraints"
export_table proposals "select id, user_id, product_name, proposed_price, currency, source, source_event_id, proposed_for, created_at from public.proposals"
export_table evaluations "select id, proposal_id, user_id, quality_score, explanation, channel3_refs, trust_signal, trust_evidence, offer_count, median_price, lowest_price, offer_currency, constraint_check, quality_result, created_at from public.evaluations"
export_table decisions "select id, evaluation_id, user_id, outcome, reason, reasons, decided_at, reviewer_id, review_status, reviewed_at from public.decisions"
export_table payment_attempts "select id, decision_id, user_id, status, amount, currency, idempotency_key, paypal_order_id, paypal_order_status, paypal_authorization_id, paypal_authorization_status, paypal_capture_id, paypal_capture_status, approve_url, created_at, updated_at from public.payment_attempts"
export_table paypal_webhook_events "select id, event_type, resource_type, resource_id, payload, processed_at from public.paypal_webhook_events"
export_table audit_events "select id, user_id, entity_type, entity_id, type, payload, created_at from public.audit_events order by id"

# CSV -> target in one transaction: all of it lands, or none of it.
cat > "$work/import.sql" <<'SQL'
begin;
-- Keep the original updated_at values instead of stamping now().
alter table public.constraints disable trigger constraints_set_updated_at;
alter table public.payment_attempts disable trigger payment_attempts_set_updated_at;
\copy public.users (id, email, display_name, created_at) from '/work/users.csv' with (format csv)
\copy public.constraints (id, user_id, time_windows, amount_caps, currency, timezone, created_at, updated_at) from '/work/constraints.csv' with (format csv)
\copy public.proposals (id, user_id, product_name, proposed_price, currency, source, source_event_id, proposed_for, created_at) from '/work/proposals.csv' with (format csv)
\copy public.evaluations (id, proposal_id, user_id, quality_score, explanation, channel3_refs, trust_signal, trust_evidence, offer_count, median_price, lowest_price, offer_currency, constraint_check, quality_result, created_at) from '/work/evaluations.csv' with (format csv)
\copy public.decisions (id, evaluation_id, user_id, outcome, reason, reasons, decided_at, reviewer_id, review_status, reviewed_at) from '/work/decisions.csv' with (format csv)
\copy public.payment_attempts (id, decision_id, user_id, status, amount, currency, idempotency_key, paypal_order_id, paypal_order_status, paypal_authorization_id, paypal_authorization_status, paypal_capture_id, paypal_capture_status, approve_url, created_at, updated_at) from '/work/payment_attempts.csv' with (format csv)
\copy public.paypal_webhook_events (id, event_type, resource_type, resource_id, payload, processed_at) from '/work/paypal_webhook_events.csv' with (format csv)
\copy public.audit_events (id, user_id, entity_type, entity_id, type, payload, created_at) from '/work/audit_events.csv' with (format csv)
alter table public.constraints enable trigger constraints_set_updated_at;
alter table public.payment_attempts enable trigger payment_attempts_set_updated_at;
-- New audit events continue after the imported ids.
do $$ begin
  perform setval(pg_get_serial_sequence('public.audit_events', 'id'),
                 coalesce((select max(id) from public.audit_events), 0) + 1, false);
end $$;
commit;
SQL
psql "$TARGET_DATABASE_URL" -f /work/import.sql

psql "$TARGET_DATABASE_URL" -c "
  select 'users' as table_name, count(*) from public.users
  union all select 'constraints', count(*) from public.constraints
  union all select 'proposals', count(*) from public.proposals
  union all select 'evaluations', count(*) from public.evaluations
  union all select 'decisions', count(*) from public.decisions
  union all select 'payment_attempts', count(*) from public.payment_attempts
  union all select 'paypal_webhook_events', count(*) from public.paypal_webhook_events
  union all select 'audit_events', count(*) from public.audit_events"
echo "Done. Set passwords with: pnpm db:set-password <email>"
