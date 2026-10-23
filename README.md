# Platewise

A working calorie tracker with a charcoal-and-gray interface, amber and violet accents, meal-photo input,
editable nutrition estimates, personal accounts, and a persistent daily diary.
A guided profile builds an adjustable nutrition starting point and a calculated
30-day meal plan from goals, barriers, preferences, and weekly activity.

[Preview the meal-plan screen](docs/screenshots/meal-plan.png). The screenshot uses an automated test account; it is not your personal nutrition plan.

## Run locally

**Using a Chromebook?** Follow the [step-by-step Chromebook guide](docs/CHROMEBOOK.md).

Requires **Node.js 24** and npm. Node's built-in SQLite is used; no separate
database service is needed.

Open a terminal in the extracted project folder (the folder containing
`package.json`), then run:

```sh
npm ci
cp .env.example .env  # optional; leave provider keys empty for local estimates
npm run dev
```

Open the app on port **3000** in your local development setup. Create an account,
complete the profile, then choose Overview to analyze or enter a meal. Use any
email address, including Gmail. Authentication is email/password for this app;
it is not Google OAuth and does not access Gmail.

```sh
npm run build        # type check + production frontend
npm start            # production server, default port 3000
npm test             # API, storage, calculation, provider-contract, and plan tests
npm run test:e2e     # real Chromium desktop + mobile workflows
```

Browser tests use system Chromium when available, otherwise install Chromium
with `npx playwright install chromium`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
can point to an existing browser. Tests run an isolated app on port 3101 with
an isolated SQLite database and **no external-service credentials**. Test
fixtures do not represent live image recognition.

## What works without API keys

- Account creation, sign in/out, a hashed password, expiring server sessions,
  and account-isolated profiles and diaries.
- Guided goals, past barriers, DOB, country, gender, calculation basis, height
  in cm, weight in kg, timeline, target weight, weekly exercise, food
  preferences, and allergy-category exclusions. Profile editing persists.
- A documented starting calorie/protein/fat plan and a 30-day menu whose
  quantities and actual nutrition are calculated, not demo values.
- Description parsing for the bundled foods, numerical/word counts, grams,
  household portions, and explicit oil exclusions. Unsupported foods produce
  clarification prompts; the parser does not claim to understand every dish.
- Manual food entry, editable quantities and edible portion weights, live
  estimate previews, server recalculation, date/time selection, confirmation,
  editing, deletion, local-day totals, and persistence after refresh/restart.
- JPEG/PNG/WebP upload, drag/drop, camera capture where supported, and preview.
  Real photo recognition requires the service below. No key means an explicit
  error with a description-only alternative, never fabricated photo analysis.

## Free tracking, with optional Plus

The plan page contains 30 daily menus and a persistent, account-specific checklist.
Start the free plan explicitly to begin its 30-calendar-day period. Tick or untick
days you followed; the remaining count updates and survives refresh/sign-in.
Checklist ticks never create diary entries or change nutrition totals. Completed
meal snapshots are preserved when profile changes refresh pending days.

Basic manual/description tracking, diary totals, favourites and repeated meals stay
**free**. Try Plus for **30 calendar days**, with no card and no automatic trial-end
charge. Afterward choose **₹199/month** or **₹1,499 upfront per year** (about
₹125/month). Plus adds 30-day meal plans, meal swaps, weekly shopping lists, and
**100 successful photo analyses per billing month**. The trial has 100 in total;
annual subscriptions also reset monthly rather than granting a full year at once.

Use the plan page or **Plus membership** to manage access and renewal. Cancelling
renewal retains the verified paid period. Failed renewals expire locally. The diary
remains accessible. Razorpay verifies exact owned paid invoices and captured
payments, not just a successful mandate callback. Existing fulfilled lifetime
purchases and existing subscription prices are preserved on upgrade; no one is
silently enrolled or switched to a new mandate. See [payment setup](docs/PAYMENTS.md).

## Less setup, more useful daily tools

- **Start tracking first** skips the full profile until you want a plan. The guided
  profile retains important health/preference questions and an optional barrier step.
- Recent meals/foods, searchable favourites, and repeat meals open editable estimates;
  repeats still require explicit confirmation and cannot double-count a retried save.
- Planner preferences include Indian, Mediterranean or mixed menus, everyday/flexible
  budgets and 15/30/45-minute active preparation. Recipes use real USDA ingredient
  records and documented yields. Pre-cooked grains/beans are assumed for quick meals.
- View one week at a time, expand all 30 days, swap an unticked day's meal with
  recalculated totals, and download a weekly ingredient list. Completed snapshots
  remain frozen; concurrent swaps reject stale versions.
- **Account & privacy** supports email verification, private JSON export and
  password-confirmed account deletion. Real verification/reset email uses Resend;
  without email configuration, the app shows an honest setup error. Reset links are
  hashed at rest, expire after 15 minutes, are single-use and revoke old sessions.
  Production Plus operations require verified email.

See [launch and email setup](docs/LAUNCH.md) for HTTPS hosting, monitoring,
account deletion/retention, and backup/restore instructions. A non-root Docker image,
Caddy/Compose example and CI checks are included. Provider delivery, real payments,
and real-photo accuracy still require configuration and live validation.

## Optional integrations

Set keys **on the server** using environment variables or an untracked `.env`.
Never prefix them with `VITE_`, commit them, or put them in browser code.
The status API exposes only whether a service is configured, never its key.

| Variable              | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `MEAL_VISION_API_KEY` | OpenAI API key for image recognition and richer text interpretation      |
| `MEAL_VISION_MODEL`   | Vision-capable model with structured outputs; defaults to `gpt-4.1-mini` |
| `USDA_API_KEY`        | Optional USDA FoodData Central API key for broader food search           |
| `PORT`                | Server port, defaults to `3000`                                          |
| `DATABASE_PATH`       | Persistent SQLite file, defaults to `.data/platewise.sqlite`             |

For cloud proxy secrets use `MEAL_VISION_API_KEY`, rather than reserved platform
variable names. HTTPS egress is needed to `api.openai.com` and optionally
`api.nal.usda.gov`. Package installation uses `registry.npmjs.org`.
Restart the server after changing its environment.

OpenAI receives the photo and meal description and returns **food identities,
portions, assumptions, and questions** through a strict JSON schema. The model
does not supply nutrient totals. Explicit supported quantities in the user's
description override the model's visual guesses. Unknown foods remain gaps
until the user selects a reference or clarifies them. Provider errors, rate
limits, refusals, malformed results, and timeouts are surfaced with retry paths.

USDA search uses its real FoodData Central API and only records that include
energy, protein, and fat. Results show their FDC source. Nutrients and sources
are snapshotted with a saved meal so the diary survives later service outages.
New USDA searches or unsaved remote foods still require working USDA access.

For step-by-step Chromebook instructions, see [photo-recognition setup](docs/PHOTO-SETUP.md).

Obtain service keys through [OpenAI](https://platform.openai.com/) and
[USDA FoodData Central](https://fdc.nal.usda.gov/api-key-signup). Provider billing
and quotas apply. Live recognition and live USDA search need valid keys and
allowed network access; local tests alone cannot validate their accuracy.

## Nutrition sources and assumptions

The bundled data contains **44 actual USDA SR28 records**, extracted from a
pinned copy of the published database. It is an intentionally small historical
reference, not a comprehensive live nutrition database. See
[data/SOURCES.md](data/SOURCES.md) for IDs, provenance, and recipe formulas.

Portions are transparent assumptions. For example, a medium roti is modeled as
30 g whole-wheat flour plus water, with no ghee. A chicken-curry piece defaults
to 55 g edible curry and gravy, excluding bone, from an explicit recipe with a
5% oil baseline. Oil-free recipe variants replace that oil with water. Stating
a separate oil amount removes the recipe's oil baseline, while **extra** oil
is added on top. Adjust the edible grams when real pieces differ. Hidden fats,
raw/cooked differences, preparation, and portion uncertainty affect accuracy.
A photograph cannot measure true weight or prove ingredient/allergen content.

The plan uses Mifflin–St Jeor resting energy and broad activity multipliers:
0–1 workouts/week (1.2), 2–3 (1.375), 4–5 (1.55), and 6–7 (1.725). Gender
identity is stored separately from the optional physiological calculation
basis. The midpoint is explicitly labeled as less specific. Protein starts at
1.2–1.6 g/kg depending on goal (capped at 30% of energy), fat at 30% of energy.
Timeline/target-weight adjustments are bounded; aggressive requests are flagged,
not promised. Each of 30 days has breakfast, lunch, dinner, and a snack. Menu portions are optimized against all three targets with food
portion bounds, whole eggs/slices/rotis, and practical gram increments. Each day shows actual totals against targets when they cannot be matched exactly. Preparation notes and an ingredient checklist are included. Reviewing a planned meal opens an editable estimate and never automatically saves it. Country is recorded for context, not used as a biological multiplier.
Barrier choices produce practical suggestions.

Automated plans are for adults aged 18–80 and are educational starting points,
not clinical prescriptions. Plans pause for pregnancy/breastfeeding or a
clinician-prescribed diet. Underweight current/target BMI does not produce a
weight-loss reduction. These checks do not replace professional assessment.
Meal tracking remains available when an automated plan is unavailable.

## Privacy, accounts, and deployment

Images are decoded in memory, limited to 8 MB/24 MP, resized to at most 1536 px,
and stripped of metadata before sending to OpenAI. Uploads are not written to
disk, saved in SQLite, or included in logs. The browser releases photo object
URLs when changed or removed. OpenAI requests set `store: false`; this does
**not** guarantee zero provider retention. See
[OpenAI's API data policy](https://platform.openai.com/docs/guides/your-data).
Descriptions submitted for analysis also go to OpenAI when configured.

SQLite saves profile details, meal descriptions, names, times, source snapshots,
and calculated nutrition. Passwords use unique salted scrypt hashes. Opaque
session tokens are hashed in SQLite, expire after 30 days, and travel only in
HttpOnly, SameSite=Strict cookies. Production cookies are Secure and require
HTTPS. Diary queries, edits, and deletions are scoped to the signed-in account.
Origin checks protect browser mutations; login and analysis have rate limits.
Save tokens prevent duplicate creates, and version checks reject stale edits.

Before public deployment:

- Run behind **HTTPS**, preserve a persistent `DATABASE_PATH`, restrict database
  and backup access, and use encrypted storage/backups for personal data.
- Configure trusted reverse-proxy behavior and shared rate-limit/session/storage
  infrastructure if scaling beyond this single-process SQLite app. No proxy
  headers are trusted by default.
- Configure the implemented verification/password-reset email service, validate
  recovery/deletion, and connect host monitoring before offering public accounts.
- The backend requires a Node server; this is not a static-only deployment.

No public deployment or live email delivery has been performed. Existing pre-account diary entries
in an upgraded database are preserved under a private legacy owner; they are
never reassigned to a newly registered user automatically.

## Reference and implementation

MyFitnessPal's public site returned a proxy access denial in the development
environment, and its private backend is not accessible. The final warm dark
palette and profile flow follow the user's subsequent design direction. This
app implements its own Express API, SQLite persistence, and provider
integrations; it does not claim to use MyFitnessPal's backend or nutrition data.

See [docs/architecture.md](docs/architecture.md) for API behavior and validation.

## Operations and validation

`npm run backup` creates a private verified online SQLite snapshot.
`npm run restore:check -- /path/to/backup.sqlite` tests a temporary restored copy
without altering the live diary. Schedule and encrypt off-site backups on your host.

`npm run benchmark:photos -- /path/to/private-manifest.json` runs a real, paid
photo benchmark only when you supply consented photos, measured comparison values
and a working key. See [photo validation](docs/PHOTO-VALIDATION.md). No fixture
result is presented as real vision accuracy.
