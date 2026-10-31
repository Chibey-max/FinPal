# FinPal

FinPal is a sandbox-only agentic purchasing assistant for the PayPal AI Hackathon. Before any PayPal Sandbox payment is authorized, it checks the purchase against the user's spending rules, compares the price with real market offers, and checks the merchant. Every step is written to an append-only audit log.

Decisions come from fixed, deterministic rules. An LLM may explain a decision in plain words, but it never chooses or changes the outcome.

> **Sandbox only.** Every payment is simulated in PayPal Sandbox: no real money is charged, authorized or transferred, and FinPal refuses any PayPal host that is not `*.sandbox.paypal.com`. Prices come from Channel3 and may be incomplete; decisions are for demonstration, not financial advice. See [Known limitations](docs/design.md#21a-known-limitations).

## How it works

1. **Propose.** The user drops a shopping list. The agent asks about anything too vague, searches Channel3, weighs offers across the price range against the need and the user's purchase history, and submits its picks. One item can also be entered by hand.
2. **Evaluate.**
   - **Spending rules:** time windows, per-purchase, daily and monthly caps, and currency. Currencies are never converted.
   - **Price check:** Quality Score v1 compares the price with the median of comparable Channel3 offers.
   - **Merchant trust:** a KERNEL check.
3. **Decide.** The rules return one of three outcomes:
   - `AUTO_APPROVE`
   - `MANUAL_REVIEW`: a person approves or rejects it.
   - `BLOCK`

   The evaluation and its decision are saved together in one database transaction.

4. **Pay.** Approved items go into one basket and one PayPal Sandbox order. The buyer approves once; FinPal rechecks the total against the caps, then authorizes and captures. Each step follows a guarded state machine and uses idempotency keys.

See [`docs/architecture.md`](docs/architecture.md) for the decision table, Quality Score thresholds and payment state machine.

## The app

| Route            | What it shows                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | Landing page with an interactive walkthrough                                                                                              |
| `/login`         | Sign in or create an account; password reset at `/forgot-password` and `/reset-password`                                                  |
| `/app`           | **Agent**: drop a shopping list, answer any questions, approve the basket once. Personal suggestions, spend and outlook alongside         |
| `/app/purchases` | **Purchases**: everything found and bought, filtered by Needs you, In progress and Done, with each item's evidence and the full audit log |
| `/app/rules`     | **Rules**: caps, spending windows, presets or plain-language entry, and the Bryntum Calendar                                              |

A companion **mobile app** (Expo, in `apps/mobile`) shows the Overview, Decisions and decision detail from the same API. See [`apps/mobile/README.md`](apps/mobile/README.md).

### Integrations

| Service          | Used for                                                                            | Required                       |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| PayPal Sandbox   | Orders v2: create, authorize, capture, void, and webhooks                           | Yes (live mode)                |
| Supabase         | Auth, Postgres, row-level security                                                  | Yes (live mode)                |
| Channel3         | Comparable offers for the price check                                               | Yes (live mode)                |
| KERNEL           | Merchant trust check                                                                | No; `NOT_CHECKED` without it   |
| Google Calendar  | Events for proposal prefill (OAuth refresh token)                                   | No                             |
| Groq             | Shopping agent, calendar ideas, written rules, spending outlook, decision summaries | No; rule-based text without it |
| AG Grid, Bryntum | Decisions and Activity grids; Calendar                                              | Bundled                        |

## Repository layout

- `apps/web`: Next.js 16 app (App Router) and the `/api/v1` route adapters.
- `apps/mobile`: Expo (React Native) app that reads `/api/v1`.
- `packages/backend`: server-only use cases, the decision table, the payment state machine, repositories and integrations.
- `packages/contracts`: shared zod schemas, enums and API contracts.
- `packages/ui`: design tokens and shared presentation pieces.
- `packages/config`: shared TypeScript and test configuration.
- `supabase`: SQL migrations, seed data and local Supabase configuration.
- `tests`: placeholders for cross-package suites. Unit and integration tests live inside each package.
- `infra`: Dockerfile; `render.yaml` holds the Render blueprint.
- `docs`: product, architecture, API, security and operations documentation.

## Getting started

Requirements: Node.js 22+ and pnpm 11+. A local database also needs Docker and the Supabase CLI.

### Quick start (mock data, no keys)

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. With no Supabase URL set, FinPal runs in **mock mode**: the real decision and payment logic on in-memory data, with simulated PayPal Sandbox, Channel3, KERNEL and calendar, and you are signed in as a demo user. The **Demo path** menu in the app walks through approve, review and block.

### Live mode

```bash
cp .env.example apps/web/.env.local   # Next.js only reads env files from apps/web
pnpm db:start                         # local Supabase in Docker, or use a hosted project
pnpm dev
```

Fill `apps/web/.env.local` with the Supabase URL and keys, PayPal Sandbox credentials, and `CHANNEL3_API_KEY`. KERNEL, Google Calendar and Groq are optional; each feature falls back safely without its keys. `FINPAL_DATA_SOURCE=mock|live` overrides the default. Production always runs live unless this is set explicitly.

Server secrets are only read on the server. Never commit `.env` files. See [`docs/security.md`](docs/security.md).

## Quality gates

CI runs the same checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CodeQL runs on every pull request.

## Deployment

Render deploys the Docker image from `render.yaml` with `FINPAL_DATA_SOURCE=live`. Supabase project setup, auth redirect URLs, the Google OAuth token and the live integration checklist are in [`docs/operations.md`](docs/operations.md).

## Known limitations

The full list is in [`docs/design.md`](docs/design.md#21a-known-limitations). The main points:

- **Refunds:** captured payments can't be refunded.
- **Shared Google Calendar:** one calendar is shared at the server level; there's no per-user Google connection.
- **Single instance:** one Render instance is assumed, so there's no shared rate limiter.
- **Bryntum trial:** the calendar runs on the Bryntum trial, which shows a watermark. Switch the `@bryntum/calendar` alias to the licensed package before a public launch.

## Docs

- [`docs/architecture.md`](docs/architecture.md): system design, decision table, Quality Score, state machine
- [`docs/design.md`](docs/design.md): product design, known limitations, Sandbox disclosure
- [`docs/api.md`](docs/api.md): `/api/v1` endpoints and payloads
- [`docs/security.md`](docs/security.md): secrets, RLS, audit log, LLM rules
- [`docs/operations.md`](docs/operations.md): environments, setup, live integration checklist
- [`CONTRIBUTING.md`](CONTRIBUTING.md): read before adding features
