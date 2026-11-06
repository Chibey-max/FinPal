# Per-user PayPal wallet — manual test checklist

Branch: `feat/paypal-user-wallet`

## Mock (`FINPAL_DATA_SOURCE=mock`)

1. Open `/app/send` — demo user is connected with ~$1,240 FinPal balance.
2. Top up $50 — balance increases immediately (no PayPal redirect).
3. Send $25 to `friend@example.com` → Review → Approve & pay → Sent / Unclaimed.
4. Settings → PayPal → Disconnect → Send blocked with Connect CTA.
5. Connect again (mock instant) → top up → send works.
6. Agent: “what's my balance?” mentions FinPal balance / connected email.
7. Shop purchase path still works (unchanged Orders flow).

## Live Sandbox

1. Apply wallet migrations including `20261107000000_wallet_atomic_balance.sql` (`supabase db push --remote`).
2. Developer Dashboard → Sandbox app → enable **Log in with PayPal** + **Payouts**.
3. Return URL (https only): `{APP}/api/v1/paypal/connect/callback` (+ privacy/terms). Manage attributes: Email, Account verification status, PayPal account ID.
4. Settings → Connect PayPal with a **Personal** sandbox user.
5. Send → Top up → approve in Sandbox Checkout → ledger credits.
6. Send **Demo (unclaimed)** or a Personal **US** sandbox email → Approve & pay. Do not use Business sandbox emails.
7. Disconnect → create send fails with PAYPAL_NOT_CONNECTED.

## Automated

```bash
pnpm --filter @finpal/backend exec vitest run tests/unit/send-funds.test.ts tests/unit/wallet-topup.test.ts
```
