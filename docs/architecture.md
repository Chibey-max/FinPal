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

`/dev/offers` is a signed-in test page that shows the raw reference offers, exclusion counts and status for any query, plus the Quality Score when a proposed price is entered.

## Quality Score v1

`scoreQuality()` in `packages/backend/src/domain/quality-score.ts` is deterministic: the same price and offers always give the same category. An LLM may rephrase the explanation but must never choose or change the category. Thresholds live in `QUALITY_THRESHOLDS` (`packages/contracts/src/quality-score.ts`).

| Score               | Condition (median of comparable offers)                                 | Decision implication              |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| `GOOD`              | At least 3 offers and proposed price ≤ median × 1.05                    | Eligible for auto-approval        |
| `FAIR`              | At least 3 offers and proposed price ≤ median × 1.20                    | Manual review; trust must pass    |
| `POOR`              | At least 3 offers and proposed price > median × 1.20                    | Block                             |
| `INSUFFICIENT_DATA` | Fewer than 3 offers, lookup not `OK`, or offers in a different currency | Manual review; never auto-approve |

- **Both bounds are inclusive:** exactly median × 1.05 is `GOOD`, one cent more is `FAIR`.
- **Exact arithmetic:** comparisons use integer cents, and the median is kept in half-cents so an even count's midpoint (e.g. 100.005) is exact. Plain floating point would misclassify prices sitting exactly on a bound (`10.2 × 1.05 = 10.709999…`); tests cover these cases.
- **Stored result:** score, explanation, proposed price, currency, offer count, median, lowest offer, ratio to median, the thresholds used, the lookup status and the Channel3 offers used as references. The decision orchestrator persists it on `evaluations` (`quality_score`, `explanation`, `offer_count`, `median_price`, `lowest_price`, `offer_currency`, `channel3_refs`).

## Security posture

- All payments are PayPal Sandbox-only.
- Merchant credentials and service-role keys are server-only environment variables.
- Supabase row-level security protects user data.
- Payment creation requires a unique idempotency key.
- Audit records are append-only to application roles.
