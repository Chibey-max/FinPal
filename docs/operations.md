# Operations

## Environments

- **Local, mock:** `FINPAL_DATA_SOURCE=mock` (the default in development until `NEXT_PUBLIC_SUPABASE_URL` is set) runs the real use cases on in-memory data with simulated PayPal Sandbox, Channel3, KERNEL and calendar. No keys needed.
- **Local, live:** Next.js against a Supabase project (local CLI or hosted) and real Sandbox services.
- **Production demo:** the Render-hosted Next.js service, `FINPAL_DATA_SOURCE=live`, connected only to sandbox and test services.

## Going live

Do these in order: the PayPal webhook needs the public Render URL, and Render needs the Supabase keys at build time.

### 1. Supabase

1. Create a project, then from the repository root run `supabase link --project-ref <ref>` and `supabase db push`. This applies the 8 migrations in `supabase/migrations/`.
2. Check: in the SQL editor, `select version from supabase_migrations.schema_migrations order by version;` lists all 8.
3. **Authentication → Providers:** enable Email.
4. **Authentication → URL configuration:** set the Site URL to the Render URL and add `<app-url>/auth/callback` and `<app-url>/reset-password` to the redirect URLs. Until Render exists, use `http://localhost:3000` and update it after step 5.
5. **Project settings → API:** copy the project URL, the anon key and the service role key.

### 2. PayPal Sandbox

1. In the [developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox), under **Apps & Credentials → Sandbox**, create an app and copy its client ID and secret.
2. Under **Sandbox accounts**, note a personal (buyer) account and its password, for approving checkouts.
3. The webhook is registered after the first deploy (step 6).

### 3. Provider keys

| Variable                     | Where                                      | Required                                       |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `CHANNEL3_API_KEY`           | Channel3 dashboard                         | Yes                                            |
| `KERNEL_API_KEY`             | KERNEL dashboard                           | No; without it merchant trust is `NOT_CHECKED` |
| `GROQ_API_KEY`, `GROQ_MODEL` | Groq console; `render.yaml` sets the model | No; without it explanations are rule-based     |

### 4. Google Calendar (optional)

Each user connects their own calendar from the Rules screen, so the server only needs a Google OAuth client.

1. In Google Cloud, create a project and enable the **Google Calendar API**.
2. **OAuth consent screen:** choose External and add the scope `https://www.googleapis.com/auth/calendar.readonly`.
3. **Publish the app** (Publishing status → **In production**). While it's in "Testing", Google cancels tokens after **7 days**. Once published, tokens don't expire on a timer. Until Google verifies the app, users see an "unverified app" warning and there's a limit of 100 users.
4. **Credentials → Create OAuth client ID:** choose Web application and add `<app-url>/api/v1/calendar/callback` as an authorized redirect URI (add one for each environment).
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then redeploy. Changing the secret makes stored tokens unreadable, so users would need to reconnect.

Tokens can still end if a user removes access in their Google account, doesn't use it for six months, or changes their password in some cases. FinPal then shows **Reconnect** instead of an error.

### Password reset emails

The reset template must link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`, so the token is only used when the person submits the form. Otherwise email scanners that open links use it up. Add `<app-url>/reset-password` to the Supabase redirect URLs. Supabase's built-in email service sends only a few emails an hour and always shows its own sender name; set up custom SMTP in Supabase to change that.

### 5. Render

1. Create a **Blueprint** from `render.yaml` and fill every `sync: false` variable. Set `NEXT_PUBLIC_APP_URL` to the service's `https://….onrender.com` URL.
2. `NEXT_PUBLIC_*` values are built into the browser bundle, so set them **before** the first deploy, and redeploy after changing them.
3. Auto-deploy is off. Deploy with **Manual Deploy → Deploy latest commit**. To deploy from CI instead, copy the service's deploy hook URL into a GitHub environment named `production` as the `RENDER_DEPLOY_HOOK_URL` secret; the Deploy workflow then deploys after every green CI run on `main`. Until that secret exists, the workflow's `render` job fails.
4. Go back to Supabase step 4 and set the real URLs.

### 6. PayPal webhook (optional)

1. In the Sandbox app, under **Webhooks → Add webhook**, use the URL `https://<render-url>/api/webhooks/paypal` and subscribe to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED` and `PAYMENT.AUTHORIZATION.VOIDED`.
2. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` on Render. A runtime variable needs a restart, not a rebuild.

Signatures are verified with PayPal. Each event is applied once, keyed by PayPal's event id. Without `PAYPAL_WEBHOOK_ID` the endpoint refuses deliveries, and payment state still advances through the return URL and API calls.

### 7. Smoke test

1. `GET /api/health` returns `ok`.
2. Signing up creates a `public.users` row, and `/app` redirects to `/login` when signed out.
3. On **Constraints**, save limits, reload, then switch to "Not configured" and save. The row is deleted, and the activity log shows two `CONSTRAINTS_UPDATED` events.
4. If Google is configured, **Calendar** shows upcoming events.

## Live integration run

**Automated, with simulated providers** (`pnpm test`): `packages/backend/tests/integration/end-to-end.test.ts` wires the real use cases and the real PayPal and Channel3 HTTP clients, with only the network and the database simulated. It covers capture, void, cap and Poor-price blocks, Insufficient data, the daily cap across purchases, concurrent duplicate requests, provider outages and rejected credentials.

**Live, against real Supabase, PayPal Sandbox, Channel3 and KERNEL.** Run every row on the deployed app, then record the result and any decision or payment ids. Use constraints of USD, a $100 per-purchase cap, a $150 daily cap, and a time window covering the current time.

| #   | Case                        | Steps                                                                                                                       | Expected                                                                                                                     | Result |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Happy path to capture       | New proposal for a common product (e.g. `Sony WH-1000XM5`) at its typical price; pay, approve as the Sandbox buyer, capture | `AUTO_APPROVE` with 3+ offers; `CREATED → APPROVED → AUTHORIZED → CAPTURED`; capture visible in the Sandbox merchant account |        |
| 2   | Void after authorize        | As row 1, but **Void** instead of capture                                                                                   | `VOIDED`; capture afterwards is refused                                                                                      |        |
| 3   | Exactly at the cap          | Constraints cap $100; propose a product priced near $100 at exactly $100.00                                                 | Not blocked for the cap                                                                                                      |        |
| 4   | One cent over the cap       | The same product at $100.01                                                                                                 | `BLOCK`, per-purchase cap reason                                                                                             |        |
| 5   | Daily cap across purchases  | After row 1, propose a second item that takes today's total over $150                                                       | `BLOCK`, daily cap reason                                                                                                    |        |
| 6   | Currency mismatch           | Constraints in USD; propose in EUR                                                                                          | `BLOCK`, currency mismatch                                                                                                   |        |
| 7   | Outside the time window     | Set a window that excludes now; propose                                                                                     | `BLOCK`, time window reason                                                                                                  |        |
| 8   | Poor price                  | About 30% above the median                                                                                                  | `BLOCK`, Poor price                                                                                                          |        |
| 9   | Fair price, approved        | About 10% above the median; approve in **Review**; pay                                                                      | `MANUAL_REVIEW`, then `DECISION_APPROVED`, then payable                                                                      |        |
| 10  | Insufficient data, rejected | An obscure product; reject in **Review**                                                                                    | `MANUAL_REVIEW`, then `DECISION_REJECTED`; payment refused                                                                   |        |
| 11  | Duplicate requests          | Double-click **Continue to PayPal**; capture twice quickly                                                                  | One PayPal order, one capture, one audit event each                                                                          |        |
| 12  | Buyer cancels               | Start checkout, then cancel in PayPal                                                                                       | Cancelled notice; nothing authorized                                                                                         |        |
| 13  | Channel3 failure            | On a test deployment, set a wrong `CHANNEL3_API_KEY`                                                                        | `MANUAL_REVIEW` (Insufficient data), no error page                                                                           |        |
| 14  | PayPal credentials rejected | On a test deployment, set a wrong `PAYPAL_CLIENT_SECRET`                                                                    | `PAYPAL_AUTH_FAILED`, not a decline                                                                                          |        |
| 15  | KERNEL unavailable          | A product whose cheapest merchant page fails to load, or a wrong `KERNEL_API_KEY`                                           | Trust `UNAVAILABLE` or `FAIL`, never `AUTO_APPROVE`                                                                          |        |
| 16  | Webhook delivery            | After row 1, open the webhook's events in the PayPal dashboard                                                              | Delivered with a 2xx; a row in `paypal_webhook_events`                                                                       |        |
| 17  | Audit trail                 | Open each decision above                                                                                                    | Every step present, in order                                                                                                 |        |

Stop and fix any failure before the demo rehearsal.

## Deployment

CI validates formatting, linting, types, tests and the build. With `RENDER_DEPLOY_HOOK_URL` set, a green CI run on `main` deploys to Render through the protected `production` environment.

## Health and rollback

Render checks `/api/health`. If the health check or the smoke test fails, roll back to the last successful Render deploy.
