# Free tracking and Plus subscriptions

## Customer terms implemented

- A 30-day meal plan with a personal, persistent completion checklist.
- 30 consecutive calendar days free, beginning only when the user presses
  **Start my free plan**. Server timestamps determine expiry. Refreshing,
  signing out, or unticking days never restarts the free period.
- No payment details during the trial and no automatic charge when it ends.
  After expiry, the user may explicitly authorize **₹199 INR per month** or **₹1,499 INR upfront per year**.
- A subscribed user is billed at their selected monthly or yearly interval by Razorpay until renewal
  is cancelled or the provider ends the subscription. A monthly billing period
  is not necessarily 30 days. Razorpay requires a finite cycle count; this
  integration uses 1,200 monthly cycles or 100 yearly cycles (up to 100 years).
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
- The old ₹999 lifetime and ₹499/month offers are retired for new purchases. Any already fulfilled
  legacy lifetime purchases remain honored, without adding recurring charges. Existing ₹499 subscriptions keep their original verified price and do not silently change mandates. To move to a new option, cancel the prior renewal and authorize a new subscription after paid access ends.

## Configure Razorpay Subscriptions

Create a merchant account at https://dashboard.razorpay.com/signup. Complete its
business/bank activation and recurring-payment requirements. Use test mode first.

Create two separate provider **Plans** with these exact settings:

| Setting        | Monthly            | Annual                  |
| -------------- | ------------------ | ----------------------- |
| Billing period | Monthly            | Yearly                  |
| Interval       | 1                  | 1                       |
| Amount         | ₹199 = 19900 paise | ₹1,499 = 149900 paise   |
| Currency       | INR                | INR                     |
| Quantity       | 1                  | 1                       |
| Configuration  | RAZORPAY_PLAN_ID   | RAZORPAY_ANNUAL_PLAN_ID |

Basic manual/description tracking and saved diary access stay free. Plus includes
planning, swaps, weekly shopping lists and 100 successful photo analyses per
billing month. The trial includes 100 in total. Annual access still resets photo
allowance monthly; it does not grant 1,200 analyses upfront. Provider failures
and empty/non-food results do not consume a successful-analysis slot. See
[photo validation and allowance behavior](PHOTO-VALIDATION.md).

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
RAZORPAY_PLAN_ID=YOUR_199_MONTHLY_PLAN_ID
RAZORPAY_ANNUAL_PLAN_ID=YOUR_1499_YEARLY_PLAN_ID
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

The server fetches the provider subscription, its exact selected plan, paginated
invoices and matching captured payments. An invoice must be paid in full, belong
to that subscription, match its payment/order, have a finite billing period,
and total exactly INR 199 monthly or INR 1499 yearly (or the original stored price for a legacy subscription). Only verified invoice periods grant time-limited
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

With a configured merchant account, validate authorization and the first ₹199 monthly or ₹1,499 annual
charge, a renewal at each interval, declined/retried payments, pre-debit communications,
signed webhook delivery, cancellation and refunds. Confirm supported recurring
payment methods, any customer mandate limits, and settlement in Razorpay.

Host the backend and persistent database on a server you control. Customer-owned
copies of this open-source local app cannot enforce a paid hosted service.
Configure the implemented email verification/recovery, validate account deletion,
finalize privacy/terms/refund policies, and schedule database backups and monitoring
before a general public launch. See [launch guide](LAUNCH.md).
The published allowance is 100 successful photo analyses per month. Monitor real
service costs and validate the price with a beta before promising broader usage.

Provider references inspected for this integration:

- [Subscription Checkout and signature verification](https://razorpay.com/docs/payments/subscriptions/integration-guide/)
- [Create a subscription](https://razorpay.com/docs/api/payments/subscriptions/create-subscription/)
- [Fetch subscription invoices](https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/)
- [Cancel a subscription](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/)
