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
age/timeline guards, seven-day variety, whole-unit portions, and actual HTTP requests against a real temporary SQLite
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

The seven-day meal plan is a transparent menu optimizer in `server/menu.ts`, using real nutrient references and practical portion increments. It is not an AI-invented meal plan.
It cannot model every cuisine, allergy, health condition or individual energy
need. It reports each day’s actual menu totals, comparison with the targets, preparation notes, approximate household portions, and mismatch warnings. The plan page exposes Monday–Sunday tabs, four meals per day, and an ingredient checklist. Noneligible profiles see an explicit explanation rather than a missing menu. Tracking and targets
remain distinct: reviewing a suggested meal never automatically logs it.

## Interface palette

The app uses charcoal `#101115`, raised gray cards `#1b1d23`, off-white text, warm amber `#ddb783` for primary actions and calories, muted violet `#c0a9e4` for protein, and pale blue `#9dbedc` for fat. Shared palette variables are in `src/styles.css`. Green/olive interface backgrounds have been replaced; the food illustration keeps natural ingredient colors.
