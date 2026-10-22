# FinPal

FinPal is a sandbox-only agentic purchasing assistant for the PayPal AI Hackathon. It evaluates spending constraints, purchase quality, and merchant trust before authorizing a PayPal Sandbox payment.

> **Sandbox only.** Every payment is simulated in PayPal Sandbox: no real money is charged, authorized or transferred, and FinPal refuses any PayPal host that is not `*.sandbox.paypal.com`. Prices come from Channel3 and may be incomplete; decisions are for demonstration, not financial advice. See [Known limitations](docs/design.md#21a-known-limitations).

## Repository layout

- `apps/web` - Next.js frontend and thin API route adapters.
- `packages/backend` - server-only use cases, payment state machine, repositories, and integrations.
- `packages/contracts` - shared schemas, enums, and API contracts.
- `packages/ui` - reusable presentation components.
- `packages/config` - shared TypeScript and test configuration.
- `supabase` - SQL migrations, seed data, and local Supabase configuration.
- `tests` - cross-package integration, contract, and end-to-end test suites.
- `infra` - container and deployment assets.
- `docs` - product, architecture, API, security, and operations documentation.

## Getting started

Requirements: Node.js 22+, pnpm 11+, and Docker for local Supabase.

```bash
cp .env.example apps/web/.env.local
pnpm install
pnpm dev
```

Open `http://localhost:3000`. With no Supabase URL set, FinPal runs in **mock mode**: the real decision and payment logic on in-memory data with simulated PayPal Sandbox, Channel3, KERNEL and calendar, so no keys are needed.

To run against real services, fill in `apps/web/.env.local` (Next.js only reads env files from the app folder; start a local database with `pnpm db:start`, or use a hosted Supabase project). All PayPal operations must use Sandbox credentials. To deploy and run the live integration checklist, follow [docs/operations.md](docs/operations.md).

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See `CONTRIBUTING.md` and `docs/architecture.md` before adding features.
