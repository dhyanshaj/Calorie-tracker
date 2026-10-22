# 30 calendar days free, then ₹499 per month

## Customer terms implemented

- A 30-day meal plan with a personal, persistent completion checklist.
- 30 consecutive calendar days free, beginning only when the user presses
  **Start my free plan**. Server timestamps determine expiry. Refreshing,
  signing out, or unticking days never restarts the free period.
- No payment details during the trial and no automatic charge when it ends.
  After expiry, the user may explicitly authorize **₹499 INR per month**.
- A subscribed user is billed every calendar month by Razorpay until renewal
  is cancelled or the provider ends the subscription. A monthly billing period
  is not necessarily 30 days. Razorpay requires a finite cycle count; this
  integration uses its documented maximum of 1,200 monthly cycles (100 years).
- **Cancel renewal** is available on the plan page, with a confirmation step.
  Paid access continues through the verified paid period. Uncharged mandates
  are cancelled immediately. Cancellation does not automatically request a refund.
- A failed renewal does not extend access. After free/paid access expires, the
  saved plan/checklist becomes read-only; the food diary remains available.
- Checklist progress is self-reported and separate from the diary. A tick does
  not create food entries, change nutrition totals, or verify what was eaten.
- Subscribers can start another 30-day plan after completing the current
  checklist or reaching its 30-day end. Older checklist summaries remain saved.
  Profile edits refresh pending days and retain completed meal/target snapshots.
- The old ₹999 lifetime offer is retired for new purchases. Any already fulfilled
  legacy lifetime purchases remain honored, without adding recurring charges.

## Configure Razorpay Subscriptions

Create a merchant account at https://dashboard.razorpay.com/signup. Complete its
business/bank activation and recurring-payment requirements. Use test mode first.

Create a provider **Plan** with these exact settings:

| Setting        | Value              |
| -------------- | ------------------ |
| Billing period | Monthly            |
| Interval       | 1                  |
| Amount         | ₹499 = 49900 paise |
| Currency       | INR                |
| Quantity       | 1                  |

Do not attach add-ons, discounts, or tax rules that change the captured total.
The server rejects a different amount, currency, period, interval or quantity.
It does not calculate extra tax or generate its own tax invoices. Finalize the
applicable GST/invoicing treatment and the customer-facing total before launch.

Set these values only on the actual Node host, in an untracked `.env` locally or
the deployment host’s encrypted server environment/secret manager:

```dotenv
RAZORPAY_KEY_ID=YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
RAZORPAY_PLAN_ID=YOUR_MONTHLY_PLAN_ID
```

Use a plan ID from the same merchant account and test/live mode as the keys.
The key secret and webhook secret never go to the browser. HMAC verification
requires actual server-side secret values; proxy-only placeholders are not
sufficient. Do not put secrets in chat, GitHub, VITE\_ variables or setup scripts.

Configure a webhook for your actual **hosted HTTPS address** at
`/api/billing/webhook`, with the matching webhook secret. Enable subscription
events supported by your account, including `subscription.authenticated`,
`subscription.activated`, `subscription.charged`, `subscription.pending`,
`subscription.halted`, `subscription.cancelled`, `subscription.completed`,
`subscription.paused` and `subscription.resumed`, plus `refund.processed` and
`payment.refunded` where available. Lifecycle callbacks reconcile current
provider state instead of trusting event ordering. A Chromebook localhost URL
is not a public webhook destination.

Allow HTTPS from the server to `api.razorpay.com`. The browser loads Checkout
from `checkout.razorpay.com` only when opening a subscription. Name/email are
prefilled with the signed-in account’s details at that point. Card/bank details
are handled by the provider and are not stored by this app.

Restart the server after changing configuration. Missing configuration keeps
checkout disabled. Production mode requires `rzp_live_` credentials and rejects
test webhook fulfillment. Development test checkout is clearly labeled.

## Verification and renewal behavior

The server creates/reuses one account-owned subscription after trial expiry;
concurrent requests cannot create duplicate subscriptions in this single-process
deployment. The Checkout signature uses `payment_id|subscription_id` with the
stored owned subscription ID. Authorization alone never unlocks a paid month.

The server fetches the provider subscription, its exact monthly plan, paginated
invoices and matching captured payments. An invoice must be paid in full, belong
to that subscription, match its payment/order, have a finite billing period,
and total exactly INR 499. Only verified invoice periods grant time-limited
access. Renewal webhooks extend access to the new paid period. **Check subscription
status** recovers missed callbacks without requesting another subscription.

Access expires locally at the verified period end even if webhooks are delayed
or the provider is unreachable. Existing paid time is retained on network errors.
Cancellation at the paid cycle end stops future renewals and preserves that
time. An uncharged mandate is cancelled immediately. Signed full refunds revoke
only the matching paid period; partial refunds leave it active. A refund does
not itself cancel the recurring mandate. Refunded ledger entries cannot be
restored by replayed or stale events. Old accounts, trial dates, checklists and
meal records are preserved by additive database migrations.

## What remains to verify before taking money

Automated tests use explicitly labeled provider fixtures, real SQLite and local
HTTP, plus a simulated browser Checkout. They exercise trial boundaries, monthly
expiry, owned checkout, bad signatures, wrong price/plan/quantity, captured versus
authorized payments, renewals, cancellation, full refunds, retries and account
isolation. They do not make actual provider charges.

With a configured merchant account, validate authorization and the first ₹499
charge, a second renewal, declined/retried payments, pre-debit communications,
signed webhook delivery, cancellation and refunds. Confirm supported recurring
payment methods, any customer mandate limits, and settlement in Razorpay.

Host the backend and persistent database on a server you control. Customer-owned
copies of this open-source local app cannot enforce a paid hosted service.
Complete email verification/recovery, account deletion, privacy/terms/refund
policies, database backups and monitoring before a general public launch.
Define any photo-analysis allowance explicitly: a ₹499 meal-planning subscription
does not silently promise unlimited paid third-party AI processing.

Provider references inspected for this integration:

- [Subscription Checkout and signature verification](https://razorpay.com/docs/payments/subscriptions/integration-guide/)
- [Create a subscription](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/)
- [Fetch subscription invoices](https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/)
- [Cancel a subscription](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/)
