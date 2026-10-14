# Operations

## Environments

- Local: Next.js plus local Supabase CLI.
- Preview: pull-request build; external integrations may use test doubles.
- Production demo: Render-hosted Next.js service connected only to sandbox/test services.

## Deployment

CI validates formatting, linting, types, tests, and build. A successful `main` workflow can trigger Render through the protected `production` environment and `RENDER_DEPLOY_HOOK_URL` secret.

## Health and rollback

Render checks `/api/health`. Roll back to the last successful Render deploy if the health check or demo smoke test fails.
