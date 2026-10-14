# Security baseline

- Never commit `.env` files, access tokens, API keys, or PayPal credentials.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_SECRET`, or sponsor keys to client bundles.
- Validate every external payload at the boundary.
- Verify PayPal webhook signatures if webhooks are enabled.
- Redact authorization headers and secrets from logs.
- Use idempotency for all payment mutations.
- Treat audit events as immutable; corrections are subsequent events.
- Use Sandbox accounts and simulated funds only.
