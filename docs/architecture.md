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

## Comparable offers (Channel3)

`createComparableOffersService().lookup({ query, currency })` in `packages/backend/src/use-cases/comparable-offers.ts` searches Channel3 (`POST /v1/search`, new and in-stock, market chosen from the currency) and normalizes the result into comparable offers, cheapest first.

| Status                 | Meaning                                                     | Quality Score     |
| ---------------------- | ----------------------------------------------------------- | ----------------- |
| `OK`                   | At least 3 usable offers                                    | Scored            |
| `INSUFFICIENT_OFFERS`  | Channel3 answered, but fewer than 3 usable offers           | Insufficient data |
| `UNSUPPORTED_CURRENCY` | Channel3 cannot price the currency (e.g. JPY); not called   | Insufficient data |
| `UNAVAILABLE`          | Timeout, network, auth, quota, rate limit or provider error | Insufficient data |

Normalization rules:

- **No currency conversion.** Offers in another currency, or with no currency, are excluded and counted, so the score never depends on an exchange rate.
- Out-of-stock and used listings, missing or non-positive prices, non-http(s) links and repeat listings of the same product by the same merchant are excluded and counted.
- Prices are rounded to cents.
- Provider failures never throw: the lookup returns `UNAVAILABLE` with the error code, so an outage routes the purchase to manual review instead of failing it. Timeouts, network and 5xx errors are retried once; auth, quota and validation errors are not.

`/dev/offers` is a signed-in test page that shows the raw reference offers, exclusion counts and status for any query.

## Security posture

- All payments are PayPal Sandbox-only.
- Merchant credentials and service-role keys are server-only environment variables.
- Supabase row-level security protects user data.
- Payment creation requires a unique idempotency key.
- Audit records are append-only to application roles.
