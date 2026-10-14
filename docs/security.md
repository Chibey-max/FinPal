# Security baseline

- Never commit `.env` files, access tokens, API keys, or PayPal credentials.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_SECRET`, or sponsor keys to client bundles.
- Validate every external payload at the boundary.
- Verify PayPal webhook signatures if webhooks are enabled.
- Redact authorization headers and secrets from logs.
- Use idempotency for all payment mutations.
- Treat audit events as immutable; corrections are subsequent events.
- Use Sandbox accounts and simulated funds only.

## Secrets in code

Server secrets are read only through `getServerEnv()` in `apps/web/src/lib/env.server.ts`, which imports `server-only` so any client import fails the build. `PAYPAL_API_BASE_URL` is rejected unless it is a Sandbox host.

## Row-level security plan

RLS is enabled on every table. Every user-facing table has a direct `user_id` column, so policies are a single `auth.uid() = user_id` check with no joins.

| Table              | Authenticated user | Written by                          |
| ------------------ | ------------------ | ----------------------------------- |
| `users`            | read, update own   | `on_auth_user_created` trigger      |
| `constraints`      | full CRUD on own   | user (settings form)                |
| `proposals`        | full CRUD on own   | user (manual or calendar prefill)   |
| `evaluations`      | read own           | backend, service role               |
| `decisions`        | read own           | backend, service role               |
| `payment_attempts` | read own           | backend, service role               |
| `audit_events`     | read own           | backend, service role (insert only) |

Users can never insert evaluations, decisions, or payment attempts directly; those come only from the orchestrator, so a client cannot forge an `AUTO_APPROVE`. The service role bypasses RLS, so backend code must always scope queries by the authenticated user's id. Audit immutability against the service role (an UPDATE/DELETE-rejecting trigger) is planned for Day 4.
