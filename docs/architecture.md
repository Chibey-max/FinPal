# Architecture

## Boundaries

```text
Browser
  -> apps/web UI
  -> apps/web API route adapters
  -> packages/backend use cases and domain rules
  -> PostgreSQL / PayPal Sandbox / Channel3 / KERNEL / Google Calendar
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
- **Stored result:** score, explanation, proposed price, currency, offer count, median, lowest offer, ratio to median, the thresholds used, the lookup status and the Channel3 offers used as references. The decision orchestrator persists it on `evaluations` (`quality_score`, `explanation`, `offer_count`, `median_price`, `lowest_price`, `offer_currency`, `channel3_refs`, and the full result in `quality_result`).

## Decision orchestrator

`createEvaluationService().evaluateProposal()` in `packages/backend/src/use-cases/evaluate-proposal.ts`:

1. Loads the proposal (owned by the user) and the user's constraints.
2. Sums money already committed (`AUTHORIZED` or `CAPTURED`) today and this month **in the user's timezone**, for the daily and monthly caps.
3. Runs `checkConstraints()` at the planned purchase time and the Quality Score in parallel, then the merchant trust check (KERNEL visits the cheapest Channel3 offer URL when `KERNEL_API_KEY` is set; otherwise `NOT_CHECKED`).
4. Applies `decide()` (`packages/backend/src/domain/decision-table.ts`).
5. Stores the evaluation and decision in one transaction (users cannot insert them) and appends `EVALUATION_COMPLETED` and `DECISION_RECORDED` audit events. Trust evidence is persisted on `evaluations.trust_evidence`.

`MANUAL_REVIEW` decisions become payable after `POST /api/v1/decisions/:id/review` with `APPROVED` (Day 14). Rejection is audited and never payable.

### Decision table v1

| Constraints | Quality      | Trust       | Amount    | Result          |
| ----------- | ------------ | ----------- | --------- | --------------- |
| Pass        | Good         | Pass or N/A | Under cap | `AUTO_APPROVE`  |
| Pass        | Fair         | Pass        | Under cap | `MANUAL_REVIEW` |
| Fail        | any          | any         | any       | `BLOCK`         |
| any         | Poor         | any         | any       | `BLOCK`         |
| any         | any          | any         | Over cap  | `BLOCK`         |
| any         | Insufficient | any         | any       | `MANUAL_REVIEW` |

Precedence: any block condition wins and every block reason is reported; otherwise anything short of every auto-approval condition goes to manual review. A test runs all 64 combinations of constraints, amount, quality and trust against these rules.

**Combinations the PRD table does not list** (team to confirm):

- Good with trust `FAIL` or `UNAVAILABLE` → `MANUAL_REVIEW`, never auto-approved.
- Fair with trust not `PASS` → `MANUAL_REVIEW`, with a reason that trust must pass before approval.
- Trust `NOT_CHECKED` (KERNEL not configured) counts as "N/A", so Good can still auto-approve.
- A user with no constraints saved → `MANUAL_REVIEW` (Poor quality still blocks).
- A currency mismatch between the proposal and the constraints → `BLOCK` (fails both constraints and amount).

Each decision has structured `reasons` (`code`, `source`: constraints, amount, quality, trust or decision, and a readable `message`) plus a one-line `reason` summary.

## Security posture

- All payments are PayPal Sandbox-only.
- Merchant credentials and the database URL are server-only environment variables.
- Every repository query is scoped to the signed-in user; sessions are verified against the database on each request.
- Payment creation requires a unique idempotency key.
- Audit records are append-only to application roles.
