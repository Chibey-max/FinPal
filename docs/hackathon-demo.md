# Hackathon demo (judges)

Live web: https://finpal-web-3bmw.onrender.com  
Web is the submission. Mobile is a companion without Agent or Send.

## 90-second video (record on live, not mock)

| Time      | Shot                               | Say                                                                                                                                                                                                              |
| --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:10 | Landing hero                       | Give FinPal a shopping list. It finds offers, your rules decide, PayPal moves money only after you approve. An AI shopper that cannot overspend.                                                                 |
| 0:10–0:35 | Demo path Auto-approve, then Block | The model may pick the offer. It cannot pick the outcome. Block never creates a PayPal order. Merchant check is pass, fail, or not checked — not a score. If KERNEL is off, say so: GOOD can still auto-approve. |
| 0:35–0:55 | Real Sandbox Checkout              | Approve in PayPal Sandbox. FinPal rechecks caps, authorizes, captures. Not “Simulated checkout.”                                                                                                                 |
| 0:55–1:15 | Purchase evidence + Activity       | Copy evidence. Audit log cannot be edited. Skip Calendar (Bryntum trial watermark).                                                                                                                              |
| 1:15–1:30 | Send → Demo (unclaimed)            | Ledger funded by Checkout. Payouts leave the Sandbox merchant. Unclaimed means PayPal accepted the payout.                                                                                                       |

Do not record loca.lt, localhost Connect, or a Business sandbox recipient.

## Devpost (public)

- Live URL: https://finpal-web-3bmw.onrender.com
- Video: the recording above
- Built with: PayPal Orders, Payouts, Log in with PayPal, Channel3, Groq, KERNEL (optional), Supabase

## Devpost (private testing instructions)

Paste this only in Devpost’s testing field — not in the public README:

1. First load: wait 12–60 seconds if Render is asleep.
2. Sign up with email/password (auto-confirm if enabled).
3. Top bar **Demo path**: Auto-approve, Needs review, Block (Block must not create a PayPal order).
4. PayPal Checkout: use this Sandbox **Personal** buyer (email + password). Business accounts often fail Payouts.
5. Send: click **Demo (unclaimed)** → Review send → Approve & pay. Expect Sent · unclaimed. Do not use `*@business.example.com`.
6. Connect PayPal only on this HTTPS origin: `https://finpal-web-3bmw.onrender.com/api/v1/paypal/connect/callback` must be the Dashboard return URL.

Sandbox buyer email/password: fill in before submit; never commit them.
