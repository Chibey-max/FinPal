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

## Deployment

CI validates formatting, linting, types, tests, and build. A successful `main` workflow can trigger Render through the protected `production` environment and `RENDER_DEPLOY_HOOK_URL` secret.

## Health and rollback

Render checks `/api/health`. Roll back to the last successful Render deploy if the health check or demo smoke test fails.
