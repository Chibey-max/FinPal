# Security baseline

- Never commit `.env` files, access tokens, API keys, or PayPal credentials.
- Never expose `DATABASE_URL`, `PAYPAL_CLIENT_SECRET`, or sponsor keys to client bundles.
- Validate every external payload at the boundary.
- Verify PayPal webhook signatures if webhooks are enabled.
- Redact authorization headers and secrets from logs.
- Use idempotency for all payment mutations.
- Treat audit events as immutable; corrections are subsequent events.
- Use Sandbox accounts and simulated funds only.
- Treat LLM output as untrusted text: validate it, never let it change a decision, and send Groq only decision facts or the user's typed request (no ids, emails or secrets).

## Secrets in code

Server secrets are read only through `getServerEnv()` in `apps/web/src/lib/env.server.ts`, which imports `server-only` so any client import fails the build. `PAYPAL_API_BASE_URL` is rejected unless it is a Sandbox host.

## Accounts and sessions

FinPal runs its own email-and-password sign-in (`packages/backend/src/services/auth.ts`):

- Passwords are hashed with scrypt (N=2^15, r=8, p=3, a random 16-byte salt) and compared in constant time. Sign-in for an unknown email still runs a hash, so response time does not reveal which emails have accounts.
- A session is 32 random bytes, sent as the `finpal_session` cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production, 30 days). The database stores only its SHA-256, so a leaked `sessions` table contains no usable tokens.
- Signing out deletes the session row. Setting a password (`pnpm db:set-password`) deletes all of that user's sessions.
- Sign-in is limited to 10 attempts per email per 15 minutes, and sign-up to 30 per hour, per server process.
- There are no emails, so there is no self-service password reset; an operator sets a new password.

The proxy only checks that the cookie exists, to redirect early. Every page (`requireUser`) and API route (`getApiUser`) looks the session up in the database, so an expired, signed-out or forged cookie is rejected.

## Data access

The app connects to Postgres as one database user; there is no row-level security. Ownership is enforced in the repositories instead:

- Every user-facing table has a direct `user_id` column, and every repository query filters by the signed-in user's id. Integration tests (`packages/backend/tests/integration/postgres-repositories.test.ts`) check that another user's proposals, decisions and payments come back as not found.
- Users can never write evaluations, decisions or payment attempts directly; those come only from the use cases, so a client cannot forge an `AUTO_APPROVE`.
- The orchestrator stores each evaluation and its decision in one transaction through `record_evaluation_with_decision`, which also re-checks that the proposal belongs to the user.
- The only lookups without a user filter are the PayPal webhook's, by globally unique PayPal order and authorization ids, after the webhook signature is verified.

## Audit log

`audit_events` is append-only for every role:

- A trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`, including from the table owner, which bypasses grants. Corrections are recorded as new events.
- Users cannot insert audit events; only backend use cases write them, through `AuditLog.record()`. The service exposes no edit or delete method.
- Users read only their own events (`GET /api/v1/activity`, the dashboard); every query filters by their user id.
- Payloads are sanitized before storage: keys such as `Authorization`, `*Token`, `*Secret`, `*Password`, `*ApiKey` and `*Cookie` are replaced with `[REDACTED]` at any depth, and sizes are bounded. Audit facts such as `paypalAuthorizationId` are kept.
- Entity types are a closed set enforced by a database check; event names must be `UPPER_SNAKE_CASE`. The full taxonomy lives in `packages/contracts/src/audit.ts`.

Because audit events reference `users` with `on delete restrict`, a user with audit history cannot be hard-deleted. That is intentional for a financial record.
