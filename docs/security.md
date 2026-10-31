# Security baseline

- Never commit `.env` files, access tokens, API keys, or PayPal credentials.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_SECRET`, or sponsor keys to client bundles.
- Validate every external payload at the boundary.
- Verify PayPal webhook signatures if webhooks are enabled.
- Redact authorization headers and secrets from logs.
- Use idempotency for all payment mutations.
- Treat audit events as immutable; corrections are subsequent events.
- Use Sandbox accounts and simulated funds only.
- Treat LLM output as untrusted text: validate it, never let it change a decision, and send Groq only decision facts or the user's typed request (no ids, emails or secrets). The agent also sees past purchase titles and prices, and upcoming event titles and dates, to personalize its picks and suggestions.

## Secrets in code

Server secrets are read only through `getServerEnv()` in `apps/web/src/lib/env.server.ts`, which imports `server-only` so any client import fails the build. `PAYPAL_API_BASE_URL` is rejected unless it is a Sandbox host.

## Row-level security plan

RLS is enabled on every table. Every user-facing table has a direct `user_id` column, so policies are a single `auth.uid() = user_id` check with no joins.

| Table                   | Authenticated user | Written by                          |
| ----------------------- | ------------------ | ----------------------------------- |
| `users`                 | read, update own   | `on_auth_user_created` trigger      |
| `constraints`           | full CRUD on own   | user (settings form)                |
| `proposals`             | full CRUD on own   | user (manual or calendar prefill)   |
| `evaluations`           | read own           | backend, service role               |
| `decisions`             | read own           | backend, service role               |
| `payment_attempts`      | read own           | backend, service role               |
| `audit_events`          | read own           | backend, service role (insert only) |
| `paypal_webhook_events` | none               | backend, service role only          |

Users can never insert evaluations, decisions, or payment attempts directly; those come only from the orchestrator, so a client cannot forge an `AUTO_APPROVE`. The orchestrator stores each evaluation and its decision in one transaction through `record_evaluation_with_decision`, which only `service_role` may execute and which runs with the caller's rights (`security invoker`), so it grants nothing RLS would not. The service role bypasses RLS, so backend code must always scope queries by the authenticated user's id.

## Audit log

`audit_events` is append-only for every role:

- A trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`, including from `service_role` and the table owner, which bypass grants. Corrections are recorded as new events.
- Users cannot insert audit events; only backend use cases write them, through `AuditLog.record()`. The service exposes no edit or delete method.
- Users read only their own events (`GET /api/v1/activity`, the dashboard), through their own session so RLS applies.
- Payloads are sanitized before storage: keys such as `Authorization`, `*Token`, `*Secret`, `*Password`, `*ApiKey` and `*Cookie` are replaced with `[REDACTED]` at any depth, and sizes are bounded. Audit facts such as `paypalAuthorizationId` are kept.
- Entity types are a closed set enforced by a database check; event names must be `UPPER_SNAKE_CASE`. The full taxonomy lives in `packages/contracts/src/audit.ts`.

Because audit events reference `users` with `on delete restrict`, a user with audit history cannot be hard-deleted. That is intentional for a financial record.
