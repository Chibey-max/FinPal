# Operations

## Environments

- Local: Next.js plus local Supabase CLI.
- Preview: pull-request build; external integrations may use test doubles.
- Production demo: Render-hosted Next.js service connected only to sandbox/test services.

## First-time setup

1. **Supabase project:** create the project, then `supabase link --project-ref <ref>` and `supabase db push`. In Auth settings, enable the Email provider, set Site URL to the app URL, and add `<app-url>/auth/callback` to the redirect URLs.
2. **Render service:** create a Blueprint from `render.yaml` and fill every `sync: false` variable. `NEXT_PUBLIC_*` values are inlined at Docker build time, so redeploy after changing them.
3. **GitHub:** add a `production` environment containing the `RENDER_DEPLOY_HOOK_URL` secret.
4. **Smoke test:** `/api/health` returns `ok`, sign-up creates a `public.users` row, and `/dashboard` redirects to `/login` when signed out.

## End-to-end slice

**Automated** (`pnpm test`): `packages/backend/tests/integration/end-to-end.test.ts` wires the real use cases and the real PayPal and Channel3 HTTP clients, with only the network (simulated PayPal Sandbox and Channel3) and database (in memory) replaced. It covers the happy path through capture, void, over cap, Poor price, Insufficient data, a Channel3 timeout, the daily cap across two purchases, authorizing before buyer approval, and a PayPal outage with a safe retry.

**Manual, against real Sandbox services.** Needs Supabase, `CHANNEL3_API_KEY`, PayPal Sandbox merchant credentials and a [Sandbox buyer account](https://developer.paypal.com/dashboard/accounts).

1. Sign up, then on `/settings` set USD, a $100 per-purchase cap, a $150 daily cap, and a window covering the current time.
2. On `/proposals/new`, check a common product (e.g. `Sony WH-1000XM5`) at its typical price. Expect **Approved** with 3+ reference offers.
3. Click **Continue to PayPal (Sandbox)**, log in as the Sandbox buyer and approve. Expect to land on `/dashboard` with "Payment authorized".
4. Capture with `POST /api/v1/payments/<id>/capture`, or void with `/void`. In the Sandbox merchant account, confirm the authorization was captured or voided.
5. Repeat step 2 with a price over $100 (**Blocked**, cap), about 30% above the median (**Blocked**, Poor price) and an obscure product (**Needs review**, Insufficient data).
6. On `/dashboard`, confirm every step appears in order, newest first.

Stop and fix any blocker found here before starting P1 work.

## Deployment

CI validates formatting, linting, types, tests, and build. A successful `main` workflow can trigger Render through the protected `production` environment and `RENDER_DEPLOY_HOOK_URL` secret.

## Health and rollback

Render checks `/api/health`. Roll back to the last successful Render deploy if the health check or demo smoke test fails.
