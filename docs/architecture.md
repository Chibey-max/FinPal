# Architecture

## Boundaries

```text
Browser
  -> apps/web UI
  -> apps/web API route adapters
  -> packages/backend use cases and domain rules
  -> Supabase / PayPal Sandbox / Channel3 / KERNEL / Google Calendar
```

`apps/web` owns HTTP and rendering. `packages/backend` owns business rules and server-only integrations. `packages/contracts` owns schemas shared across those boundaries. Route handlers must validate input, authenticate the caller, invoke one use case, and map the result to HTTP.

## Core transaction

```text
Proposal -> Evaluation -> Decision -> Payment attempt -> Audit events
```

The payment state machine is `CREATED -> APPROVED -> AUTHORIZED -> CAPTURED`; `AUTHORIZED -> VOIDED`; and optionally `CAPTURED -> REFUNDED`.

## Security posture

- All payments are PayPal Sandbox-only.
- Merchant credentials and service-role keys are server-only environment variables.
- Supabase row-level security protects user data.
- Payment creation requires a unique idempotency key.
- Audit records are append-only to application roles.
