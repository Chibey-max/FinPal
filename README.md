# FinPal

FinPal is a sandbox-only agentic purchasing assistant for the PayPal AI Hackathon. It evaluates spending constraints, purchase quality, and merchant trust before authorizing a PayPal Sandbox payment.

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
cp .env.example .env.local
pnpm install
pnpm db:start
pnpm dev
```

Open `http://localhost:3000`. All PayPal operations must use Sandbox credentials.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See `CONTRIBUTING.md` and `docs/architecture.md` before adding features.
