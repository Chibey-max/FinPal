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

## Spending constraints

Each user has one constraints row, edited on `/settings`. `checkConstraints()` in `packages/backend/src/domain/constraints.ts` is a pure function that returns the two decision-table inputs separately:

| Result        | Values                   | Driven by                                           |
| ------------- | ------------------------ | --------------------------------------------------- |
| `constraints` | `PASS` / `FAIL`          | Time windows and currency match                     |
| `amount`      | `UNDER_CAP` / `OVER_CAP` | Per-purchase, optional daily, optional monthly caps |

Rules, all covered by unit tests:

- **Time windows** are evaluated in the user's timezone (daylight saving included). Start is inclusive and end exclusive. A window whose end is before its start runs past midnight: `FRI 22:00-02:00` covers Friday night and early Saturday. No windows means no time restriction.
- **Caps are inclusive:** spending exactly the cap is allowed; one cent over is blocked. Money is compared in integer cents, so floating-point error cannot flip a result.
- **Daily and monthly caps** add the purchase to what was already spent that day or month; the caller supplies those totals.
- **Currency mismatch fails closed:** if the proposal's currency differs from the constraints' currency, both results fail, because caps cannot be compared without guessing an exchange rate.
- A user with no constraints saved cannot be auto-approved.

## Security posture

- All payments are PayPal Sandbox-only.
- Merchant credentials and service-role keys are server-only environment variables.
- Supabase row-level security protects user data.
- Payment creation requires a unique idempotency key.
- Audit records are append-only to application roles.
