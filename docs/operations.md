# Operations

## Environments

- **Local, mock:** `FINPAL_DATA_SOURCE=mock` (the default in development until `DATABASE_URL` is set) runs the real use cases on in-memory data with simulated PayPal Sandbox, Channel3, KERNEL and calendar. No keys needed.
- **Local, live:** Next.js against any Postgres 15+ (for example `docker run -p 5432:5432 -e POSTGRES_PASSWORD=pw postgres:17-alpine`) and real Sandbox services.
- **Production demo:** the Render-hosted Next.js service and Render Postgres, `FINPAL_DATA_SOURCE=live`, connected only to sandbox and test services.

## Database

Postgres holds every record, including accounts and sessions. The schema lives in `db/migrations/*.sql`, applied in name order and recorded in `public.schema_migrations`.

- The server applies pending migrations when it starts (`apps/web/src/instrumentation.ts`), before taking requests, so a Render deploy migrates itself. A failed migration stops the server.
- `pnpm db:migrate` applies them by hand, using `DATABASE_URL` from the environment or `.env.local`.
- To change the schema, add a new numbered file (`0002_….sql`). Never edit a migration that has been applied.

Accounts are email and password only; there are no confirmation or reset emails. Passwords are hashed with scrypt, and a session is a random token in an httpOnly cookie whose SHA-256 is stored in `public.sessions` (30 days). To set or reset someone's password:

```bash
DATABASE_URL='<external database URL>' pnpm db:set-password person@example.com
```

It prompts for the password without echoing it and signs that account out everywhere.

## Going live

Do these in order: the PayPal webhook needs the public Render URL.

### 1. PayPal Sandbox

1. In the [developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox), under **Apps & Credentials → Sandbox**, create an app and copy its client ID and secret.
2. Under **Sandbox accounts**, note a personal (buyer) account and its password, for approving checkouts.
3. The webhook is registered after the first deploy (step 5).

### 2. Provider keys

| Variable                     | Where                                      | Required                                       |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `CHANNEL3_API_KEY`           | Channel3 dashboard                         | Yes                                            |
| `KERNEL_API_KEY`             | KERNEL dashboard                           | No; without it merchant trust is `NOT_CHECKED` |
| `GROQ_API_KEY`, `GROQ_MODEL` | Groq console; `render.yaml` sets the model | No; without it explanations are rule-based     |

### 3. Google Calendar (optional)

FinPal needs a **refresh token**: a fixed access token stops working after about an hour.

1. In Google Cloud, create a project and enable the **Google Calendar API**.
2. **OAuth consent screen:** choose External, add the scope `https://www.googleapis.com/auth/calendar.readonly`, and add the demo Google account as a test user.
3. **Credentials → Create OAuth client ID:** choose Web application and add `https://developers.google.com/oauthplayground` as an authorized redirect URI. Copy the client ID and secret.
4. In the [OAuth Playground](https://developers.google.com/oauthplayground), open the settings (gear), tick **Use your own OAuth credentials**, and paste the client ID and secret. Authorize `https://www.googleapis.com/auth/calendar.readonly` as the demo account, then click **Exchange authorization code for tokens** and copy the **refresh token**.
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` and `GOOGLE_CALENDAR_ID` (`primary`, or a calendar's id).

While the consent screen's publishing status is **Testing**, Google expires refresh tokens after **7 days**. Either publish the app (Google shows an "unverified app" warning, which is fine for one demo account), or repeat step 4 within 7 days of the demo.

### 4. Render

1. In the Render dashboard, **New → Blueprint**, and pick this repository. `render.yaml` creates the `finpal-db` Postgres database and the `finpal-web` service in Frankfurt, and wires `DATABASE_URL` to the database's internal URL.
2. Fill every `sync: false` variable. Set `NEXT_PUBLIC_APP_URL` to the service's `https://….onrender.com` URL. It is built into the browser bundle, so redeploy after changing it.
3. Auto-deploy is off. Deploy with **Manual Deploy → Deploy latest commit**. To deploy from CI instead, copy the service's deploy hook URL into a GitHub environment named `production` as the `RENDER_DEPLOY_HOOK_URL` secret; the Deploy workflow then deploys after every green CI run on `main`. Until that secret exists, the workflow's `render` job fails.
4. The first start creates the schema. The logs show `Applied migration 0001_initial_schema.sql`.

Free-tier limits: the web service sleeps after 15 minutes without traffic and takes about a minute to wake (PayPal retries webhooks that time out), and a free database expires 30 days after creation. Upgrade the database before then to keep the data.

**Copying data from the old Supabase project (one-off).** After the first deploy, with Docker running:

```bash
SOURCE_DATABASE_URL='<Supabase session-pooler connection string>' \
TARGET_DATABASE_URL='<Render external database URL>' \
db/import-from-supabase.sh
```

It copies every FinPal table in one transaction, takes emails from Supabase's `auth.users`, and refuses to run if the target already has users. Passwords cannot be copied, so set each one with `pnpm db:set-password`. The connection strings are under Supabase **Connect** and Render **finpal-db → Connect → External**.

### 5. PayPal webhook (optional)

1. In the Sandbox app, under **Webhooks → Add webhook**, use the URL `https://<render-url>/api/webhooks/paypal` and subscribe to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED` and `PAYMENT.AUTHORIZATION.VOIDED`.
2. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` on Render. A runtime variable needs a restart, not a rebuild.

Signatures are verified with PayPal. Each event is applied once, keyed by PayPal's event id. Without `PAYPAL_WEBHOOK_ID` the endpoint refuses deliveries, and payment state still advances through the return URL and API calls.

### 6. Smoke test

1. `GET /api/health` returns `ok`.
2. Signing up creates a `public.users` row and signs you in; signing out returns to `/login`, and `/app` redirects there when signed out.
3. On **Constraints**, save limits, reload, then switch to "Not configured" and save. The row is deleted, and the activity log shows two `CONSTRAINTS_UPDATED` events.
4. If Google is configured, **Calendar** shows upcoming events.

## Live integration run

**Automated, with simulated providers** (`pnpm test`): `packages/backend/tests/integration/end-to-end.test.ts` wires the real use cases and the real PayPal and Channel3 HTTP clients, with only the network and the database simulated. It covers capture, void, cap and Poor-price blocks, Insufficient data, the daily cap across purchases, concurrent duplicate requests, provider outages and rejected credentials.

**Live, against Render Postgres, PayPal Sandbox, Channel3 and KERNEL.** Run every row on the deployed app, then record the result and any decision or payment ids. Use constraints of USD, a $100 per-purchase cap, a $150 daily cap, and a time window covering the current time.

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
