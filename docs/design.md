# FinPal — Product and System Design

## 1. Document Purpose

This document explains what FinPal is, why it exists, how it works, and how its major parts fit together. It is a product and system design document, not a visual design guide. It does not prescribe colors, typography, page styling, or animation.

The intended audience is the FinPal engineering team, hackathon reviewers, future contributors, and anyone who needs one complete description of the product before working on it.

## 2. Product Summary

FinPal is a sandbox-only, agent-assisted purchasing system. It helps a user decide whether a proposed purchase is allowed, fairly priced, and safe enough to continue before initiating a PayPal payment.

The system combines:

- User-defined spending and time constraints.
- Comparable product offers from Channel3.
- A deterministic price-quality evaluation.
- An optional merchant trust signal from KERNEL.
- A rule-based approval decision.
- PayPal Sandbox authorization and capture.
- A permanent audit trail of every important action.

FinPal is not intended to act as an unrestricted autonomous buyer. Its purpose is controlled financial delegation: the system can assist with a purchase, but only inside explicit rules and with a clear explanation of every decision.

## 3. The Problem FinPal Solves

Giving an AI agent permission to spend money is not enough to make the purchase responsible. A useful purchasing agent must also answer several questions:

1. Is the purchase permitted by the user's rules?
2. Is the proposed price reasonable compared with the market?
3. Is the merchant trustworthy enough to proceed?
4. Does the purchase require human review?
5. Can the payment be stopped before capture?
6. Can the user later understand exactly what happened?

FinPal places a policy and evidence layer between a purchase proposal and a payment. The system evaluates first, decides second, and pays only when the decision permits it.

## 4. Product Goals

FinPal's primary goals are to:

- Give users explicit control over when and how much the system may spend.
- Compare a proposed price with current market evidence.
- Produce deterministic, explainable approval decisions.
- Prevent blocked proposals from reaching PayPal.
- Support manual review when available evidence is incomplete or ambiguous.
- Keep payment states precise and auditable.
- Demonstrate a safe end-to-end purchasing workflow using sponsor technologies.

For the hackathon, the core success path is:

> Create proposal → evaluate constraints and price → make decision → create PayPal Sandbox order → authorize → capture or void → display the audit history.

## 5. Non-Goals

The current product does not attempt to provide:

- Live production payments.
- User-connected PayPal accounts or PayPal OAuth.
- Fully autonomous product discovery and purchasing.
- Automatic extraction of a product from every calendar event.
- Multiple calendar-provider integrations.
- Refund processing as part of the required demonstration.
- Financial, legal, or investment advice.
- A general-purpose accounting or business-intelligence platform.
- Biometric, duress, cryptocurrency, or complex multi-agent payment controls.

These features may be considered later, but they are not part of the version-one core loop.

## 6. Users and Actors

### 6.1 End User

The end user signs in, defines purchasing constraints, creates proposals, reviews decisions, completes required PayPal approval steps, and inspects their transaction history.

### 6.2 FinPal Decision Engine

The decision engine combines constraints, price quality, merchant trust, and spending-cap information. It returns one of three outcomes: `AUTO_APPROVE`, `MANUAL_REVIEW`, or `BLOCK`.

### 6.3 FinPal Backend

The backend owns business rules, external integrations, payment orchestration, idempotency, authorization checks, and audit-event creation. The browser never receives privileged service credentials.

### 6.4 External Providers

- **PostgreSQL** (Render Postgres) stores accounts, sessions and every workflow record.
- **Channel3** provides comparable product offers used for price evaluation.
- **PayPal Sandbox** provides the payment order, authorization, capture, and void workflow.
- **KERNEL** provides a basic merchant trust signal.
- **Bryntum Calendar** and **Google Calendar** support calendar-assisted proposal creation.
- **Groq** optionally rewords explanations and drafts proposals; it never decides.
- **AG Grid** presents structured decision and activity data.

## 7. Core Product Concepts

### 7.1 Constraint

A constraint expresses when or how much FinPal may spend for a user. Version-one constraints include allowed time windows and amount caps.

### 7.2 Proposal

A proposal is a request to consider buying a named product at a proposed price and currency. It records the source of the request, such as manual entry or a calendar-assisted action. Creating a proposal does not create a payment.

### 7.3 Evaluation

An evaluation contains the evidence and calculated results used to judge a proposal. It includes constraint results, comparable Channel3 offers, a quality score, its explanation, and any merchant trust signal.

### 7.4 Decision

A decision is the policy outcome produced from an evaluation. It determines whether the purchase may continue automatically, requires a person to review it, or must be blocked.

### 7.5 Payment Attempt

A payment attempt represents FinPal's interaction with PayPal for an approved decision. It stores the PayPal order identifier, the amount, idempotency information, and the latest payment state.

### 7.6 Audit Event

An audit event is an append-only record of an important system action. Audit events make the full proposal-to-payment history explainable and reviewable.

## 8. End-to-End Workflow

### 8.1 Authentication

The user signs in with an email and password. FinPal hashes passwords with scrypt and keeps a server-side session, identified by an httpOnly cookie, that every page and API request checks against the database. Backend ownership checks on every query ensure that one user cannot access another user's records.

### 8.2 Configure Constraints

The user defines one or more allowed time windows and spending caps. These rules are saved before evaluation and are applied to later proposals.

An absence of configured constraints is not treated as unrestricted permission. It prevents automatic approval and routes the proposal to manual review.

### 8.3 Create a Proposal

The user supplies:

- Product name.
- Proposed price.
- Currency.
- Source.

A calendar event may prefill the title or date through a “Create proposal from event” action. Calendar events do not automatically create products or payments. The product name and proposed price still require explicit input.

### 8.4 Gather Market Evidence

FinPal asks Channel3 for comparable offers. The backend removes unusable offers, including:

- Offers in a different currency.
- Out-of-stock items.
- Used items when they are not comparable.
- Invalid product links.
- Duplicate results.

At least three usable offers are required for a price-quality result. Provider failures, unsupported currencies, or fewer than three offers produce insufficient evidence instead of an invented score.

### 8.5 Calculate the Quality Score

FinPal compares the proposed price with the median of the usable Channel3 offers.

| Condition                                                     | Score               |
| ------------------------------------------------------------- | ------------------- |
| Proposed price is at most 105% of the median                  | `GOOD`              |
| Proposed price is above 105% and at most 120% of the median   | `FAIR`              |
| Proposed price is above 120% of the median                    | `POOR`              |
| Fewer than three valid offers or provider data cannot be used | `INSUFFICIENT_DATA` |

Money is handled in integer minor units, such as cents. Boundary calculations use deterministic arithmetic so that the same evidence always produces the same score.

Each evaluation stores the explanation, reference prices, median, and relevant provider evidence. An insufficient-data result never becomes an automatic approval.

### 8.6 Evaluate Constraints

FinPal evaluates the proposal against:

- The user's configured timezone.
- Allowed time windows.
- The proposed amount.
- Daily and monthly caps.
- Previously counted spending.
- Currency compatibility.

Time windows use an inclusive start and exclusive end and may cross midnight. Amount limits are inclusive. A currency mismatch fails closed because FinPal does not silently perform foreign-exchange conversion.

### 8.7 Evaluate Merchant Trust

KERNEL provides a basic merchant trust result. The model supports `PASS`, `FAIL`, `UNAVAILABLE`, and `NOT_CHECKED`-style outcomes so missing trust data can be handled explicitly.

KERNEL is connected. When `KERNEL_API_KEY` is set, the evaluation opens a short-lived KERNEL browser session and loads the merchant page of the cheapest Channel3 reference offer:

- HTTP 2xx or 3xx gives `PASS`; 4xx or 5xx gives `FAIL`.
- A timeout, provider error or missing merchant URL gives `UNAVAILABLE`, which can never auto-approve.
- Without `KERNEL_API_KEY` the result is `NOT_CHECKED`, which the decision table treats as "N/A".

The URL, HTTP status, duration and KERNEL session id are stored as `trust_evidence` on the evaluation. The decision engine never invents a positive trust result.

### 8.8 Make the Decision

The version-one policy is:

| Constraints | Quality           | Merchant trust      | Amount versus cap | Result          |
| ----------- | ----------------- | ------------------- | ----------------- | --------------- |
| Pass        | Good              | Pass or not checked | Under or equal    | `AUTO_APPROVE`  |
| Pass        | Fair              | Pass                | Under or equal    | `MANUAL_REVIEW` |
| Fail        | Any               | Any                 | Any               | `BLOCK`         |
| Any         | Poor              | Any                 | Any               | `BLOCK`         |
| Any         | Any               | Any                 | Over              | `BLOCK`         |
| Any         | Insufficient data | Any                 | Any               | `MANUAL_REVIEW` |

Additional conservative cases, such as a failed or unavailable trust signal, are routed to manual review unless another rule already blocks the proposal.

Every decision includes structured reason codes and a human-readable explanation. The outcome is not produced by a generative model; it is the deterministic result of explicit rules.

### 8.9 Create and Complete the Payment

Only a payable decision may create a PayPal order: an `AUTO_APPROVE` decision, or a `MANUAL_REVIEW` decision that a reviewer has approved. A reviewer acts once, and rejected or blocked decisions can never be paid. Approvals and rejections are audited.

FinPal uses centrally configured PayPal Sandbox merchant credentials. Users do not connect their own PayPal accounts.

The normal payment sequence is:

1. FinPal creates a PayPal Sandbox order.
2. The user approves the order through PayPal.
3. FinPal authorizes the approved order.
4. FinPal captures the authorization, or voids it before capture.
5. FinPal records each state change as an audit event.

## 9. Payment State Model

The exact payment states are:

```text
CREATED → APPROVED → AUTHORIZED → CAPTURED
                            └──→ VOIDED
CAPTURED → REFUNDED (future/optional)
```

The system uses these terms consistently in the API, database, user interface, and audit history.

- A payment may be voided only after authorization and before capture.
- A captured payment cannot be voided; it would require a refund.
- Refund support is optional and outside the required version-one flow.

## 10. Decision Safety Properties

The system is designed around several invariants:

- A proposal is not a payment.
- An evaluation is based on stored evidence.
- A blocked decision can never create a payment attempt.
- Insufficient evidence can never cause automatic approval.
- A currency mismatch never triggers silent conversion.
- Repeating a payment-creation request with the same idempotency key does not create another order.
- Capture and void compete through guarded state transitions, preventing both from succeeding for the same authorization.
- Audit records cannot be modified or deleted through normal application behavior.

## 11. System Architecture

FinPal is a TypeScript monorepo built around Next.js API routes and shared packages.

```text
Browser
  │
  ▼
apps/web
  ├── App Router pages and components
  └── API route adapters
          │
          ▼
packages/backend
  ├── Domain rules
  ├── Application use cases
  ├── Payment orchestration
  ├── Persistence adapters
  └── External-provider clients
          │
          ├── PostgreSQL (accounts, sessions, records)
          ├── Channel3
          ├── PayPal Sandbox
          ├── KERNEL (merchant trust, when KERNEL_API_KEY is set)
          ├── Google Calendar (proposal prefill, optional)
          └── Groq (plain-language wording only, optional)

packages/contracts
  └── Shared request, response, and domain schemas

packages/ui
  └── Shared interface components
```

### 11.1 Frontend Responsibilities

The frontend is responsible for:

- Authentication screens and session-aware navigation.
- Constraint entry and management.
- Proposal creation.
- Decision, evidence, and payment-status presentation.
- Manual-review interfaces when the backend transition is added.
- PayPal approval redirects and return handling.
- Activity and decision tables using AG Grid.
- Calendar-assisted proposal entry when Bryntum is connected.

The frontend must not duplicate the authoritative decision logic or expose server secrets.

### 11.2 API Route Responsibilities

Next.js API routes are thin adapters. They validate requests, resolve the authenticated user, invoke backend use cases, and translate results into HTTP responses.

### 11.3 Backend Responsibilities

The backend owns:

- Constraint evaluation.
- Channel3 offer normalization.
- Quality scoring.
- Trust-signal handling.
- Decision policy.
- Record ownership and authorization checks.
- PayPal state transitions.
- Idempotency and concurrency protection.
- Audit-event creation.

### 11.4 Shared Contracts

Shared schemas define the vocabulary used across the UI, API, and backend. They reduce drift in status values, money formats, identifiers, and response structures.

## 12. Data Model

### 12.1 `users`

Represents an account: a unique lower-cased email, a scrypt password hash and an optional display name. Sessions live in `sessions`, keyed by the SHA-256 of the cookie token.

### 12.2 `constraints`

Stores a user's time windows, timezone, amount caps, currency, and related rule configuration.

### 12.3 `proposals`

Stores the requested product, proposed amount, currency, source, owner, and creation time.

### 12.4 `evaluations`

Stores the quality score, explanation, comparable-offer references, constraint result, trust signal, and evidence used during evaluation.

### 12.5 `decisions`

Stores the final outcome and structured reasons associated with an evaluation.

### 12.6 `payment_attempts`

Stores the related decision, PayPal order identifier, amount, currency, idempotency key, and payment status.

### 12.7 `audit_events`

Stores append-only event types, sanitized payloads, ownership information, related entity identifiers, and creation timestamps.

User-facing and backend-generated records include a direct `user_id`, so every repository query can scope to the signed-in user without joins.

## 13. API Surface

The application exposes the following principal endpoints:

| Method and path                       | Purpose                                           |
| ------------------------------------- | ------------------------------------------------- |
| `GET /api/health`                     | Confirm that the application is running           |
| `POST /api/v1/proposals`              | Create a purchase proposal                        |
| `POST /api/v1/evaluations`            | Evaluate a proposal and create its decision       |
| `GET /api/v1/decisions`               | List the user's decisions                         |
| `GET /api/v1/decisions/:id`           | Read one decision and its evidence                |
| `POST /api/v1/payments`               | Create a PayPal order for a payable decision      |
| `GET /api/v1/payments/:id`            | Read the latest payment state                     |
| `POST /api/v1/payments/:id/authorize` | Authorize an approved PayPal order                |
| `POST /api/v1/payments/:id/capture`   | Capture an authorization                          |
| `POST /api/v1/payments/:id/void`      | Void an authorization before capture              |
| `GET /api/v1/payments/return`         | Handle the browser's PayPal return flow           |
| `GET /api/v1/activity`                | List the user's audit activity                    |
| `POST /api/webhooks/paypal`           | Reserved for PayPal webhooks; not yet implemented |

All protected endpoints derive record ownership from the authenticated session rather than trusting a user identifier supplied by the client.

## 14. External Integrations

### 14.1 PostgreSQL

PostgreSQL is the source of truth for identity and application data. The schema is a set of numbered SQL migrations in `db/migrations`, applied by the server on start. Database checks, an append-only audit trigger and the atomic evaluation function back up the application rules.

### 14.2 Channel3

Channel3 supplies product comparison data. FinPal validates and normalizes this data before using it. A temporary provider outage is retried once for appropriate network or server failures; persistent failure becomes insufficient data and therefore manual review.

### 14.3 PayPal Sandbox

PayPal Sandbox is the only payment environment for the prototype. Credentials are centrally managed as server environment variables. FinPal uses stable PayPal request identifiers and internal idempotency keys to make retries safe.

### 14.4 KERNEL

KERNEL is a should-have integration for merchant trust, and it is connected (see 8.7). It is a basic signal: it confirms that the merchant page loads, not the merchant's reputation.

### 14.5 Bryntum Calendar

Bryntum Calendar shows spending windows and upcoming Google Calendar events in a week view. A manual “Create proposal from event” action prefills only the event title and date; the user supplies the product and price. It never authorizes spending or infers a purchasable product.

### 14.6 Google Calendar

FinPal reads upcoming events from one configured Google Calendar with read-only scope. Credentials are an OAuth client plus a long-lived refresh token (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`): access tokens, which expire after about an hour, are renewed automatically and cached until a minute before expiry. If Google rejects a cached token, FinPal refreshes once and retries. A fixed `GOOGLE_CALENDAR_ACCESS_TOKEN` is accepted for quick local testing only. A calendar failure degrades to "no events" and never affects decisions.

### 14.7 Groq

Groq optionally rewords decision explanations in plain language and drafts the proposal form from a typed sentence. It only words things: it never chooses or changes a decision, and FinPal validates its output and falls back to rule-based text without a key or on any error. Only decision facts or the user's typed request are sent, never ids, emails or secrets.

### 14.8 AG Grid

AG Grid is used to present decision and audit information in sortable, structured tables. It is part of the required sponsor scope but does not own any business rules.

## 15. Security Design

The minimum security model includes:

- Session authentication for protected operations, verified against the database on every request.
- Ownership filters on every repository query for user-owned records.
- Backend ownership checks before sensitive operations.
- Database credentials restricted to server-side code.
- PayPal, Channel3, and other provider secrets stored only in environment variables.
- No user PayPal OAuth tokens.
- Request validation through shared schemas.
- Idempotency on payment creation and provider operations.
- Append-only audit storage enforced by database protections.
- Sanitized error messages and audit payloads that exclude secrets and sensitive provider data.
- Sandbox-only payment configuration.

Users may manage their own input records where allowed, but generated financial records such as evaluations, decisions, payment attempts, and audit events are controlled by the backend and exposed to their owner primarily as read-only data.

## 16. Reliability and Failure Handling

FinPal fails conservatively around money:

- Missing market evidence becomes manual review.
- A provider timeout does not become approval.
- Unsupported currency does not trigger conversion.
- Invalid payment state transitions are rejected.
- Repeated requests use idempotency rather than creating duplicates.
- Capture and void operations use guarded updates to avoid race-condition outcomes.
- External provider identifiers and responses are stored only to the degree required for reconciliation and audit.

The evaluation and its decision are stored in one transaction, through the `record_evaluation_with_decision` database function. If the decision insert fails, the evaluation is rolled back too, so an evaluation can never exist without its decision. The function also re-checks that the proposal belongs to the user.

## 17. Auditability and Explainability

Every important stage should generate an audit event, including:

- Proposal creation.
- Evaluation completion.
- Decision creation.
- Payment-order creation.
- PayPal approval return.
- Authorization.
- Capture.
- Void.
- Provider or state-transition failure where operationally relevant.

The audit log is append-only. It records what happened and when without allowing history to be rewritten. Decision explanations include the constraints checked, the price references used, the calculated score, and the policy reasons for the outcome.

## 18. Deployment and Operations

The project uses a monorepo deployment model:

- The Next.js application and API are deployed to Render as the canonical backend deployment target.
- The frontend may remain on the same Render service or be deployed separately to Vercel if the team chooses.
- Render Postgres holds the database; FinPal handles sign-in itself.
- All external service credentials are provided through deployment environment variables.
- CI validates formatting, linting, types, tests, and builds.
- CodeQL provides automated security analysis.

Operational readiness requires a Postgres database, configured Channel3 and PayPal Sandbox projects, and the corresponding callback URLs and environment variables.

## 19. Testing Strategy

Testing is organized around risk:

- Unit tests cover constraint boundaries, time windows, caps, quality thresholds, median calculations, and state transitions.
- Use-case tests cover proposal evaluation, authorization, capture, void, ownership, and idempotency.
- API tests cover authentication, validation, status codes, and response contracts.
- Database tests run the repositories against real Postgres and cover ownership scoping, sessions and append-only audit guarantees.
- Integration smoke tests should exercise real sandbox services before the demo.
- End-to-end tests should cover the complete proposal-to-capture path and the blocked/manual-review paths.

The deterministic decision engine is particularly suited to table-driven tests because every combination of inputs should have a predictable outcome.

## 20. Current Implementation State

The complete core loop and the P1 integrations are implemented and covered by automated tests:

- Email-and-password accounts with database sessions, and the PostgreSQL schema with migrations applied on start.
- Constraints (time windows, per-purchase, daily and monthly caps), including clearing them.
- Channel3 comparable offers and the deterministic Quality Score.
- Decision orchestration with the PRD decision table; the evaluation and decision are stored atomically.
- KERNEL merchant trust, manual-review approve/reject, and verified PayPal webhooks.
- PayPal Sandbox order, authorization, capture and void, with idempotency and guarded transitions.
- Append-only audit log, AG Grid decisions view, Bryntum calendar, Google Calendar prefill, and the optional Groq assistant.
- A mock data source that runs the real use cases on in-memory data with simulated providers, for development without keys.

Automated tests use simulated PayPal and Channel3, an in-memory database for use cases, and real Postgres for the repositories (when `TEST_DATABASE_URL` is set). A live run against Render Postgres, PayPal Sandbox, Channel3 and KERNEL has not yet been recorded.

## 21. Remaining Work

1. Deploy the Render blueprint (web service and Postgres), copy the data from Supabase, and set the environment variables (see `docs/operations.md`).
2. Register the PayPal webhook and set `PAYPAL_WEBHOOK_ID`.
3. Deploy to Render.
4. Run the live integration matrix against real services and record the results.
5. Rehearse the demo and capture backup footage.

## 21a. Known Limitations

- **Sandbox only.** No real money moves; payments need a PayPal Sandbox buyer account.
- **No refunds.** Refunds are out of scope; a captured payment cannot be reversed in FinPal, and the `REFUNDED` state is unused.
- **Caps are checked at evaluation time.** Daily and monthly totals count `AUTHORIZED` and `CAPTURED` payments. An order that is created but not yet authorized does not count until it is authorized.
- **No currency conversion.** Channel3 prices only USD, CAD, AUD, GBP, EUR, SEK, CZK and RON; other currencies give Insufficient data, and a proposal in a different currency from the constraints is blocked.
- **Basic merchant trust.** KERNEL checks that the merchant page loads, not the merchant's reputation.
- **One shared Google Calendar.** Calendar access uses server-level credentials, not a per-user Google connection. Refresh tokens of Google OAuth apps in "Testing" publishing status expire after 7 days; publish the OAuth app, or reissue the token shortly before the demo.
- **Webhooks are optional.** Payment state normally advances through the PayPal return URL and API calls; webhooks apply updates only when `PAYPAL_WEBHOOK_ID` is set.
- **Single instance.** There is no shared rate limiter; one Render instance is assumed.
- **Users with audit history cannot be hard-deleted.** Audit events reference users with `on delete restrict` by design.

## 21b. Sandbox Disclosure

FinPal is a hackathon prototype that uses **PayPal Sandbox only**. Every payment is simulated: no real money is charged, authorized or transferred, and the application refuses any PayPal API host that is not `*.sandbox.paypal.com`. Merchant credentials are a central Sandbox account, not user PayPal accounts. Product prices come from Channel3 and may be incomplete or out of date; decisions are for demonstration and are not financial advice.

## 22. Sponsor Scope and Priority

To protect the core experience, integrations are prioritized as follows:

### Must Have

- PayPal Sandbox payment lifecycle.
- Channel3 product-price evidence.
- AG Grid decision and activity views.

### Should Have

- Bryntum Calendar proposal prefill.
- KERNEL merchant trust check.

### Optional Extras

Other sponsor technologies may be added only after the complete core purchasing loop is reliable and demonstrable.

## 23. Definition of a Successful Version One

Version one is successful when a signed-in user can:

1. Configure clear spending constraints.
2. Create a proposal manually or from a calendar-assisted entry point.
3. Receive a deterministic price-quality evaluation with visible evidence.
4. Receive an explainable automatic, manual-review, or blocked decision.
5. Create a PayPal Sandbox payment only when policy permits it.
6. Authorize and then capture or void the payment using the correct state model.
7. Review the complete activity history afterward.

The central promise of FinPal is not merely that an agent can pay. It is that the agent can demonstrate why a purchase was allowed, stop when evidence or permission is insufficient, and leave an auditable record of the entire decision.

## 24. Glossary

| Term                    | Meaning                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Agent-assisted purchase | A purchase in which software performs evaluation or payment steps within user-defined rules |
| Auto-approve            | The decision permits the payment workflow to begin without an additional FinPal review step |
| Manual review           | A person must explicitly approve or reject the proposal before payment                      |
| Block                   | The proposal is not allowed to create a payment                                             |
| Quality score           | The deterministic comparison between the proposed price and the median comparable price     |
| Authorization           | PayPal reserves the approved amount without completing the transfer                         |
| Capture                 | PayPal completes an authorized payment                                                      |
| Void                    | PayPal cancels an authorization before capture                                              |
| Idempotency             | Repeating the same request safely without creating duplicate effects                        |
| Audit event             | An immutable record of an important system action                                           |
