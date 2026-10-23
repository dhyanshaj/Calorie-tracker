# Development notes

React/TypeScript + Vite renders the responsive app. Express serves the API and
Vite middleware in development, and the built `dist` assets in production.
Node 24 provides SQLite directly; `sharp` decodes and sanitizes uploaded images.
Zod validates API inputs and structured provider output. Keys stay on the server.

## API

- `GET /api/auth/me`: current account and calculated profile plan, or no account.
- `POST /api/auth/signup`, `/login`, `/logout`: session lifecycle.
- `PUT /api/profile`: validated complete profile; returns the updated plan.
- `GET /api/status`: provider availability booleans, no credential values.
- `GET /api/foods`: bundled foods, household weights, sources and densities.
- `GET /api/foods/search?q=...`: local matches plus optional live USDA records.
- `POST /api/analyze`: multipart `photo` (optional) and `description` (optional).
  At least one input is required. JSON description-only input is also supported.
  Returns food rows, computed totals, questions, material assumptions, method,
  and an incomplete flag. Photo processing fails explicitly without a key.
- `POST /api/recalculate`: food IDs and quantities/weights; optionally a saved
  `mealId` to reuse historical USDA snapshots. Returns server-computed totals.
- `GET /api/meals?start=<ISO>&end=<ISO>`: half-open range up to 32 days, scoped
  to the current user. The browser sends local midnight boundaries converted
  to UTC, including 23/25-hour DST days.
- `POST /api/meals`: explicit confirmation; includes a UUID `saveToken` for
  idempotency. Never accepts browser-supplied nutrient totals as authoritative.
- `PUT /api/meals/:id`: replaces the user's original entry, requires its current
  `version`. Concurrent stale changes return 409.
- `DELETE /api/meals/:id?version=...`: removes that entry; stale versions fail.

Every route except the auth lifecycle requires a valid session. SQLite meal
bodies snapshot nutrient references. The browser only previews calculations;
saving recomputes every total from server-side records. Totals are derived from
saved entries, not incremented counters, so edits/deletes cannot double-count.
Numerical calculations retain precision and are rounded only for display.

## Checks

`npm test` tests genuine calculations against the extracted nutrient data,
explicit-quantity precedence, unknown-food questions, oil recipe handling,
provider request/response contracts, target/menu calculations, allergy filtering,
age/timeline guards, 30-day variety, whole-unit portions, and actual HTTP requests against a real temporary SQLite
database. The API lifecycle covers confirmation, duplicate-save protection,
account isolation, stale-edit rejection, persistence, edits, deletion and totals.
Photos test decoding, missing-key behavior and absence of on-disk image files.
Provider fixtures are clearly test-only; no external recognition is asserted.

`npm run test:e2e` opens real Chromium desktop and phone viewports. It covers
account creation, the five-step profile, weekly activity, calculated menu,
image preview, honest missing-key error, description fallback, quantity change,
recalculation, confirmation, page refresh, editing, day navigation and deletion.
It also checks browser errors and horizontal overflow. The test database is
isolated under ignored `.data/browser-*.sqlite`. Uploaded test images are
synthetic upload fixtures, never presented as recognized foods.

To verify live integration after configuring a key, use an actual meal photo,
check that provider recognition is reported, compare identities and portions,
and correct explicit quantities (e.g. two to three rotis) before saving. Test
service failures by removing the key or using an invalid key. USDA live search
should return FDC source links and different results for distinct queries. These
live checks require real credentials, egress and, for OpenAI, billing/quotas.

## Boundaries

There is no universal offline NLP model: the local parser handles documented
food names/aliases and supported portions, then asks about unknown words. Vision
is limited to good matches to the nutrient catalog; unsupported mixed dishes
are not silently assigned unrelated calories. Users can expand food choices via
USDA search, but still need to choose the correct cooked/uncooked record.

The 30-day meal plan is a transparent menu optimizer in `server/menu.ts`, using real nutrient references and practical portion increments. It is not an AI-invented meal plan.
It cannot model every cuisine, allergy, health condition or individual energy
need. It reports each day’s actual menu totals, comparison with the targets, preparation notes, approximate household portions, and mismatch warnings. The plan page exposes Day 1–30 selection and completion checkboxes, four meals per day, and an ingredient checklist. Noneligible profiles see an explicit explanation rather than a missing menu. Tracking and targets
remain distinct: reviewing a suggested meal never automatically logs it.

## Interface palette

The app uses charcoal `#101115`, raised gray cards `#1b1d23`, off-white text, warm amber `#ddb783` for primary actions and calories, muted violet `#c0a9e4` for protein, and pale blue `#9dbedc` for fat. Shared palette variables are in `src/styles.css`. Green/olive interface backgrounds have been replaced; the food illustration keeps natural ingredient colors.

## Program progress and payment API

`GET /api/plan-program` returns the signed-in account’s current snapshot,
completion day numbers, remaining checklist count, separate free-period expiry,
and paid-period/subscription status. `POST /api/plan-program/start` begins the free period once.
`PUT /api/plan-program/:id/days/:day` sets a boolean completion state idempotently;
`POST /api/plan-program/next` requires active paid planning access and preserves prior cycle summaries.
Expiry and ownership are enforced by the server, not browser timestamps. Completed
day snapshots retain their own targets when pending days change with the profile.
An expired account cannot generate a fresh plan through the profile endpoint.

`POST /api/billing/subscriptions` creates or reuses an account-owned Razorpay
subscription only after trial expiry. It validates the provider plan: monthly/yearly,
interval 1, quantity 1, INR 19900 paise monthly or 149900 paise yearly. `POST /api/billing/verify` checks the
subscription-specific HMAC (`payment_id|subscription_id`) using the stored owned
ID. A valid signature/mandate alone grants nothing. Reconciliation fetches the
provider subscription and paginated invoices, then verifies each relevant paid
invoice's matching order/payment, captured status, exact amount/currency, and
finite billing period before writing an immutable payment ledger.

`POST /api/billing/status` recovers missed callbacks. `POST
/api/billing/subscriptions/:id/cancel` verifies ownership, requests cancellation
at the paid cycle end (or immediately for an uncharged mandate), and retains all
verified paid time. `POST /api/billing/webhook` verifies raw bytes with a separate
secret and handles subscription state/renewals and full-refund revocation.
Per-account queues serialize provider mutations. Idempotent ledger writes and
monotonic refund flags prevent replayed events from extending or restoring access.
Unpaid renewals expire locally at the verified invoice end even during provider
outages; the food diary is unaffected. Paid billing months are calendar months,
while the checklist contains 30 days and the free period lasts 30 calendar days.

New subscription/payment tables are additive. Existing profiles, meals, trial
clocks, completed days, old payment records, and fulfilled legacy lifetime grants
remain intact. Old one-time order checkout is retired. Production rejects test
keys for checkout and webhook fulfillment. See [PAYMENTS.md](PAYMENTS.md) and
[PHOTO-SETUP.md](PHOTO-SETUP.md). Tests use explicit fixtures; no live recurring
charge, mandate, settlement, cancellation or refund has been verified.

## Account lifecycle, shortcuts and usage

Resend email is optional in development and required for production Plus account
verification. Email/reset requests are rate limited. Action tokens are random,
hashed at rest, purpose-bound, expiring and consumed transactionally. A password
reset revokes existing sessions. Link tokens use URL fragments and are cleared
by the client; they are never included in access-log URL queries.

Account exports omit password/session/token secrets. Deletion reauthenticates,
marks the account as deleting so new operations stop, drains existing per-user
billing tasks, cancels renewals, and removes personal app tables transactionally.
Billing references receive an unlinked random deleted-account identifier.
An email/provider failure is surfaced rather than simulated as success.

Favourites store account-owned food/meal snapshots. Repeating creates an editable
draft with a fresh save token. The server validates any source snapshot against
that same account; confirmation retains ordinary idempotency/version rules.

Photo usage is reserved transactionally before live image analysis, capped at
100 successful nonempty results per trial/month. Failures release reservations.
Annual periods use calendar-month anchors with month-end clamping. Description
requests at the HTTP boundary use the local parser, without unmetered AI calls.
No image or image hash is retained in the usage ledger.

Menus now include regional recipe pools, pantry-budget and active-time filters,
plus allergen/diet checks. Swaps optimize the chosen meal while keeping the other
three fixed. Server ownership, active access, completed-day checks and a revision
number prevent stale or forbidden changes. Profile signatures retain saved swaps
until preferences/targets change. Weekly lists aggregate snapshotted ingredient
weights and disclose cooked/raw reference differences.

The runtime exposes a minimal database health check, restrictive production
headers and redacted request logs. Online SQLite backups and isolated restore
checks are executable scripts with regression coverage. Deployment examples
use a non-root Node image, persistent volumes and a single trusted Caddy proxy.
See [LAUNCH.md](LAUNCH.md) for remaining operational and provider validation.
