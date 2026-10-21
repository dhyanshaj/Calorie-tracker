# Free plan and ₹999 lifetime access

The selected offer is:

- A 30-day meal plan with a personal completion checklist.
- 30 consecutive calendar days free, beginning only when the user presses
  **Start my free plan**. Server timestamps determine expiry; refreshing,
  signing out, or unticking days does not restart the free period.
- **₹999 INR once for lifetime meal-planning access**, without a subscription
  or automatic renewal.
- Checklist progress is separate from the food diary. Ticking a day is a
  self-reported completion note; it does not create meals or alter nutrition.
- After the free period, the previous plan/checklist is read-only. The existing
  diary stays accessible. Lifetime users can track again and start another
  30-day plan after completing the current checklist or reaching its end date.
- Past checklist summaries remain saved when a new plan begins. Updating a
  profile during active access refreshes pending days and preserves completed
  meal snapshots and the targets that applied to them.

The app does not claim that a tick verifies what a person actually ate or that
following a checklist guarantees weight or muscle changes.

## Razorpay configuration

Create a merchant account at https://dashboard.razorpay.com/signup and complete
Razorpay’s account/bank/business activation requirements. Use test mode to verify
the integration before enabling actual purchases.

Set these variables only on the Node server, in an untracked local `.env` for
development or the deployment host’s encrypted secret/environment manager:

```dotenv
RAZORPAY_KEY_ID=YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
```

These are placeholders, not credentials. The public key ID goes to Checkout;
the key secret and webhook secret never go to the browser. HMAC verification
requires the actual server-side secret values, so a proxy placeholder alone is
not sufficient. Do not put these secrets in chat, source control, VITE_ variables,
or saved setup scripts.

In Razorpay, configure a webhook for your **actual hosted HTTPS address**, at
`/api/billing/webhook`. Subscribe to `payment.captured`, `refund.processed`, and
`payment.refunded` when available, and configure the matching webhook secret.
A Chromebook localhost address is not a publicly reachable webhook destination.
Configure payment auto-capture in the merchant dashboard. Checkout confirmation
and a **Check payment status** recovery action also verify captured payments
server-side if a user closes the browser before a callback completes.

Allow HTTPS access to `api.razorpay.com` from the server. The browser loads
Razorpay Checkout from `checkout.razorpay.com` only when the user opens checkout.

Checkout remains disabled until the required credentials are set. Production
mode also requires a `rzp_live_` key ID; test keys cannot open paid checkout in
production. In development, test mode is visibly labeled and must not be
presented as a real payment. Restart the server after changing configuration.

## What the integration verifies

The server creates a fixed **99900-paise INR** order linked to the signed-in
account. It checks ownership, a timing-safe HMAC signature, and the provider’s
payment record for the exact amount, currency, order, and captured status before
setting lifetime access. A browser “success” callback alone does not grant access.
Repeated callbacks and webhooks are idempotent. Payment-status recovery checks
Razorpay directly. Signed full-refund events revoke the matching lifetime grant;
partial refunds leave it intact. No customer card numbers are stored by this app.

Tests use explicit provider fixtures and real local database/HTTP operations.
They do not perform live payments. Merchant checkout, webhooks, bank settlement,
and live refunds need validation against a real configured Razorpay account
before charging customers.

## Before public launch

Host the backend and persistent database on a server you control; copies of the
open-source app running on customers’ own machines cannot enforce a paid service.
Finalize your privacy policy, terms defining lifetime access, support/refund
process, and applicable GST/invoicing treatment. The integration charges exactly
₹999; it does not calculate extra taxes or generate tax invoices.

Add email verification and password recovery before offering general public
accounts. Decide on a photo-analysis usage allowance: lifetime meal planning is
cheap to compute, but every external AI photo request can incur ongoing costs.
₹999 lifetime access should not silently promise unlimited third-party AI usage.
