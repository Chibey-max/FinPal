# API outline

All product APIs use `/api/v1`. Payload schemas belong in `@finpal/contracts`. Every `/api/v1` route requires a signed-in Supabase session and only ever sees the caller's own data.

| Method | Path                                    | Purpose                                                                            |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET`  | `/api/health`                           | Deployment health check                                                            |
| `POST` | `/api/v1/proposals`                     | Create a manual or calendar-prefilled proposal                                     |
| `POST` | `/api/v1/evaluations`                   | Run constraints, quality, trust, and decision rules                                |
| `POST` | `/api/v1/payments`                      | Create the PayPal order for an `AUTO_APPROVE` decision                             |
| `GET`  | `/api/v1/payments/:paymentId`           | Read a payment attempt                                                             |
| `POST` | `/api/v1/payments/:paymentId/authorize` | Confirm buyer approval with PayPal and authorize (retry)                           |
| `GET`  | `/api/v1/payments/return`               | PayPal return URL; confirms approval and authorizes                                |
| `POST` | `/api/v1/payments/:paymentId/capture`   | Capture an authorized payment                                                      |
| `POST` | `/api/v1/payments/:paymentId/void`      | Void an authorization before capture                                               |
| `GET`  | `/api/v1/activity`                      | The user's audit trail, newest first, paginated                                    |
| `GET`  | `/api/v1/decisions`                     | Dashboard rows: decision + proposal + score + payment                              |
| `GET`  | `/api/v1/decisions/:decisionId`         | Full detail for one decision, with its audit trail                                 |
| `POST` | `/api/v1/decisions/:decisionId/review`  | Approve or reject a `MANUAL_REVIEW` decision                                       |
| `POST` | `/api/v1/decisions/:decisionId/explain` | Plain-language summary of a decision (Groq or rules)                               |
| `POST` | `/api/v1/proposals/draft`               | Turn a sentence into proposal form fields (no write)                               |
| `POST` | `/api/v1/agent/list`                    | Shopping list: ask about vague items, shop and evaluate the rest                   |
| `POST` | `/api/v1/baskets`                       | One PayPal order for several approved decisions; checks the total against the caps |
| `POST` | `/api/v1/baskets/:basketId/settle`      | After PayPal approval: authorize and capture every item; safe to retry             |
| `POST` | `/api/v1/agent/shop`                    | Shopping agent: search, pick an offer, submit and evaluate                         |
| `GET`  | `/api/v1/agent/suggestions`             | Purchase ideas from upcoming calendar events (no write)                            |
| `POST` | `/api/v1/constraints/draft`             | Turn written rules into Constraints form fields (no write)                         |
| `GET`  | `/api/v1/forecast`                      | Spending pace, headroom and busy days ahead                                        |
| `GET`  | `/api/v1/calendar/events`               | Upcoming Google Calendar events for proposal prefill                               |
| `POST` | `/api/webhooks/paypal`                  | Receive verified, idempotent PayPal events                                         |

## Proposal and decision flow

```text
POST /proposals   { productName, proposedPrice, currency, source: "MANUAL", proposedFor? }
  -> 201 Proposal
POST /evaluations { proposalId }
  -> 201 { proposal, evaluation, decision }
     decision.outcome: AUTO_APPROVE | MANUAL_REVIEW | BLOCK
     decision.reasons: [{ code, source, message }]
POST /payments    { decisionId, idempotencyKey }   (AUTO_APPROVE, or MANUAL_REVIEW after approval)
POST /decisions/:id/review  { action: "APPROVED" | "REJECTED" }
```

`proposedFor` (ISO 8601 with offset) is the planned purchase time; time windows are checked at that time, otherwise at evaluation time. Evaluating the same proposal again records a new evaluation and decision; history is kept. `POST /evaluations` returns `404 PROPOSAL_NOT_FOUND` for another user's proposal.

### Manual review

`POST /api/v1/decisions/:decisionId/review` with `{ "action": "APPROVED" }` or `{ "action": "REJECTED" }` records the reviewer, audits `DECISION_APPROVED` / `DECISION_REJECTED`, and (on approve) makes the decision payable. Only `MANUAL_REVIEW` decisions that have not already been reviewed are accepted (`422 NOT_MANUAL_REVIEW`, `409 ALREADY_REVIEWED`).

### Assistant (Groq)

The LLM only words things. It never chooses or changes a decision category (PRD section 5), and it never creates anything. Both routes work without `GROQ_API_KEY`: they fall back to rule-based text, and `source` says which produced the reply. Each route allows 20 requests a minute per user (`429 RATE_LIMITED`).

```text
POST /decisions/:id/explain
  -> 200 { text, source: "llm" | "rules", model }
POST /proposals/draft { text, currency? }
  -> 200 { draft: { productName, proposedPrice, currency, time }, missing, source, model }
```

The explanation is rejected in favour of the rules if it names a different outcome or price score than the decision has. A drafted price is kept only if the sentence states it. Only decision facts and the typed sentence are sent to Groq, never user ids or emails.

### Agent (Groq)

The agent acts on the user's behalf, but only inside the rules. `POST /agent/shop { need, eventId? }` turns the need into a Channel3 search, keeps new, in-stock offers in the user's currency and within any budget the need states, and picks one. It then creates a proposal with `source: "AGENT"`, records `AGENT_PURCHASE_PROPOSED` (need, query, offers compared, pick, reason, model) and runs the normal evaluation. Payment still needs approval in PayPal. `POST /proposals` never accepts `source: "AGENT"`.

```text
POST /agent/shop { need, eventId? }
  -> 200 { status: PROPOSED | NO_OFFERS | OVER_BUDGET | SEARCH_FAILED,
           brief, candidates, offersFound, pick, reason, proposal, evaluation, decision, source, model }
GET  /agent/suggestions      -> 200 { suggestions: [{ eventId | null, eventTitle | null, startsAt | null, need, reason }], calendarConfigured, source, model }
POST /constraints/draft { text } -> 200 { draft: { currency, perPurchase, daily, monthly, timeWindows }, changed, source, model }
GET  /forecast               -> 200 { level: OK | WATCH | WARN, spentToday, spentThisMonth, projectedMonth, dailyLeft, monthlyLeft, busyEvents, signals, advice, source, model }
```

Guardrails: the model may only pick one of the listed offers; budgets and amounts count only if the user wrote them; any prose (pick reason, forecast advice) is rejected if it contains a number that is not in the facts. Without `GROQ_API_KEY`, or on an invalid reply, every feature falls back to rule-based logic. `/agent/shop` allows 6 runs a minute per user; the others 20.

### Shopping list and baskets

`POST /agent/list { list }` splits a list into items (at most 6). An item too vague to choose well comes back as `NEEDS_DETAIL` with a `question` and is not searched; answer it through `POST /agent/shop`. The rest are shopped and evaluated like any proposal. Approved items that don't fit what is left of the caps together get a `hold` reason.

`POST /baskets { decisionIds, idempotencyKey }` creates one PayPal order for all items, with one `payment_attempts` row per item sharing `basketId`, so caps, audit and dashboard stay per item. It refuses the whole basket if any item isn't payable, or with `422 BASKET_OVER_CAP` if the total exceeds what's left of the daily or monthly cap. After the buyer approves, the return URL (or `POST /baskets/:id/settle`) rechecks the caps, then authorizes and captures. Each step is skipped once done, so a retry after a failure resumes. A void applies to the whole basket, because it shares one authorization.

### Google Calendar

Each user connects their own calendar. `GET /api/v1/calendar/connect` sends them to Google for read-only access, `GET /api/v1/calendar/callback` stores the refresh token encrypted, and `POST /api/v1/calendar/disconnect` cancels access at Google and deletes it. `GET /api/v1/calendar/events?limit=20` returns `{ events, configured, needsReconnect }`, with `id`, `title` and `startsAt` only. If Google cancels a token, `needsReconnect` is true and the app offers Reconnect. A Google outage returns no events rather than an error.

## Payment flow

```text
POST /payments {decisionId, idempotencyKey}
  -> 201 { status: "CREATED", approveUrl, ... }
Browser opens approveUrl, buyer approves in PayPal Sandbox checkout
PayPal redirects to GET /payments/return?token=<orderId>
  -> server re-checks the order with PayPal: CREATED -> APPROVED -> AUTHORIZED
  -> redirect /dashboard?payment=<id>&status=AUTHORIZED
POST /payments/:id/capture  -> CAPTURED      (or)
POST /payments/:id/void     -> VOIDED
```

- **Idempotency.** `idempotencyKey` (8-64 chars, `[A-Za-z0-9_-]`) is generated by the client once per purchase and reused on retries; repeating the request returns the same payment. Every PayPal call sends a deterministic `PayPal-Request-Id`, so a retried capture or void cannot double-charge.
- **Statuses.** `status` is FinPal's state machine. `paypalOrderStatus`, `paypalAuthorizationStatus` and `paypalCaptureStatus` are PayPal's own values, stored exactly as returned.
- **Void vs refund.** Void is only valid from `AUTHORIZED`. A captured payment can never be voided; reversing it would be a refund, which is out of scope.

### PayPal webhooks

`POST /api/webhooks/paypal` verifies the transmission with PayPal (`PAYPAL_WEBHOOK_ID` required), stores the event id for idempotency, and may advance a matching payment (`CHECKOUT.ORDER.APPROVED` → `APPROVED`, `PAYMENT.AUTHORIZATION.VOIDED` → `VOIDED`). Duplicate deliveries return `{ "status": "duplicate" }`. Without `PAYPAL_WEBHOOK_ID` the route responds `503 NOT_CONFIGURED`.

## Errors

Errors use `{ "error": { "code", "message", "details" } }`.

| HTTP | Code                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `INVALID_REQUEST`                                                                                                                            |
| 401  | `UNAUTHORIZED`                                                                                                                               |
| 404  | `PAYMENT_NOT_FOUND`, `DECISION_NOT_FOUND`                                                                                                    |
| 409  | `IDEMPOTENCY_KEY_REUSED`, `DECISION_ALREADY_PAID`, `ORDER_NOT_APPROVED`, `INVALID_TRANSITION`, `CONCURRENT_MODIFICATION`, `ALREADY_REVIEWED` |
| 422  | `DECISION_NOT_PAYABLE`, `PAYPAL_DECLINED`, `NOT_MANUAL_REVIEW`                                                                               |
| 502  | `PAYPAL_AUTH_FAILED` (PayPal rejected FinPal's merchant credentials; fix configuration)                                                      |
| 503  | `PAYPAL_UNAVAILABLE` (timeouts, network, PayPal 5xx/429; safe to retry)                                                                      |

PayPal failures are also written to `audit_events` as `PAYPAL_CALL_FAILED` with PayPal's `debug_id`.

## Activity

`GET /api/v1/activity?limit=50&before=<id>&entityType=<type>&entityId=<id>`

| Param        | Default | Notes                                                                    |
| ------------ | ------- | ------------------------------------------------------------------------ |
| `limit`      | 50      | 1-100                                                                    |
| `before`     | -       | Event id; pass the previous page's `nextBefore`                          |
| `entityType` | -       | `constraints`, `proposal`, `evaluation`, `decision` or `payment_attempt` |
| `entityId`   | -       | e.g. a payment id, to get one payment's full history                     |

```json
{
  "events": [
    {
      "id": 42,
      "entityType": "payment_attempt",
      "entityId": "6f1c…",
      "type": "PAYMENT_AUTHORIZED",
      "payload": {
        "paypalAuthorizationId": "8AB…",
        "amount": 49.5,
        "currency": "USD"
      },
      "createdAt": "2026-10-18T10:00:00.000Z"
    }
  ],
  "nextBefore": null
}
```

Event types are listed in `packages/contracts/src/audit.ts`.

## Decisions (dashboard)

`GET /api/v1/decisions?limit=200` (1-500, default 200) returns `{ "rows": DecisionRow[] }`, newest decision first. Each row joins the decision to its proposal, evaluation and the most recently updated payment attempt; see `decisionRowSchema` in `packages/contracts/src/dashboard.ts`. `paymentStatus` is the exact uppercase state (`CREATED`, `APPROVED`, `AUTHORIZED`, `CAPTURED`, `VOIDED`) or `null` if no payment was started. Reads go through the user's own session, so RLS applies.

`GET /api/v1/decisions/:decisionId` returns `{ proposal, evaluation, decision, payment, events }` (`decisionDetailSchema`): the full Quality Score with reference offers, the constraint check, the structured reasons, the most recent payment attempt (without internal fields) and the audit events of the proposal, evaluation, decision and payment, newest first. `404 DECISION_NOT_FOUND` for another user's decision.
