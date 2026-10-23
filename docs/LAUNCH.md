# Run a private beta and prepare for launch

The app has working local flows and automated checks. A production launch still
requires your own domain/host, working provider credentials, live verification
and an operational/privacy review. No hosted public service is created by
downloading this repository or publishing its development environment.

## Configure email and photo services

Use the host's encrypted server settings or an untracked `.env`. Never send
keys in chat, commit them, or prefix them with `VITE_`.

1. Follow [photo setup](PHOTO-SETUP.md) to enable OpenAI API billing and securely
   configure `MEAL_VISION_API_KEY`. Optional broader nutrition search uses a
   [USDA FoodData Central key](https://fdc.nal.usda.gov/api-key-signup).
2. Create a [Resend account](https://resend.com/), verify a sender domain you
   control, and create an API key restricted to sending mail. Set
   `MAIL_API_KEY`, `MAIL_FROM` (for example `Platewise <hello@your-domain>`),
   and `APP_PUBLIC_URL` to your actual HTTPS root URL. The example sender is
   illustrative, not a working mailbox. Resend has its own service limits/costs.
3. Disable click tracking for authentication messages. Reset/verification links
   use token fragments, which must survive email redirects. Never forward these
   links to support or put them in screenshots. Resend processes the destination
   address and link; its retention policy applies.
4. Use a test account you own to request verification, follow the link, sign
   out/in, request a reset, and verify the old password and old sessions stop
   working. Reset links expire in 15 minutes; verification links in 24 hours.
   Both are single-use. Unconfigured or failed email delivery is reported honestly.
5. In production, verified email is required to start a Plus trial, use the photo
   service or authorize a subscription. Basic manual tracking stays available.

Follow [payment setup](PAYMENTS.md) for the separate ₹199 monthly and ₹1,499 yearly
plans, signed webhooks, and real merchant testing. Use test mode before accepting
money. A mandate authorization alone is never proof of a paid period.

## A concrete HTTPS deployment

Use a Linux host you control with Docker/Compose, persistent disks and a domain
pointing to its public address. Allow inbound TCP 80/443. Keep the Node service
private behind the proxy. The repository includes a non-root Node 24 image,
`compose.yml` and `Caddyfile`. Caddy obtains HTTPS certificates for a real domain
with correctly configured DNS; example domains cannot obtain your certificate.

On that host, create a private `.env` with `chmod 600 .env`, preserving any values
already present. Set:

```dotenv
APP_DOMAIN=YOUR_REAL_DOMAIN_HOSTNAME
APP_PUBLIC_URL=https://YOUR_REAL_DOMAIN_HOSTNAME
```

These placeholders must be replaced. Include your provider variables in that
same private file or use an equivalent secret manager. Never print the file.

Run from the repository root:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

`config --quiet` validates without printing expanded credentials. Only Caddy
exposes public ports. The app uses named volumes for the database and backups;
do not run `docker compose down --volumes` against real user data. Compose sets
`TRUST_PROXY_HOPS=1` for the single Caddy hop. For another host/proxy topology,
set the exact trust boundary; do not trust arbitrary forwarded headers.

Use a real browser at your hosted HTTPS address to verify Secure session cookies,
account links, camera/upload, mobile navigation and checkout. `/healthz` checks
the Node/database service; a 200 does not verify OpenAI, email or merchant readiness.
The image also has a health check. Provider endpoints need outbound HTTPS to
`api.openai.com`, optional `api.nal.usda.gov`, `api.resend.com` and
`api.razorpay.com`; browsers load Checkout from `checkout.razorpay.com`.

If your build network uses a trusted HTTPS inspection proxy, provide its verified
public CA bundle as a BuildKit secret:
`docker build --secret id=trusted_ca,src=/absolute/path/to/verified-ca.pem -t platewise .`.
The optional secret adds trust for that build step; it is not copied into the
image. Keep TLS and package-integrity verification enabled. Ordinary public
internet builds need no extra CA. Corporate runtime proxies need their own
properly mounted trust configuration too.

Production responses include CSP, HSTS, frame restrictions and request IDs.
JSON access logs include method, route template, status and duration; they do
not include descriptions, photos, token fragments, email addresses or passwords.
Monitor 5xx errors, repeated payment-pending states, quota failures, disk space
and backup age. Alerting/uptime delivery must be configured on your actual host.

## Backups and recovery

SQLite backups use its online backup API rather than copying a live WAL file.
Backup files are private (mode 0600), validated with `PRAGMA integrity_check`,
and excluded from Git and image builds. For a local installation:

```sh
npm run backup
npm run restore:check -- /absolute/path/to/your/backup.sqlite
```

In Compose, run `docker compose exec app npm run backup`. Schedule it at least
daily using the host's scheduler, verify success, and copy encrypted backups to
a separate access-controlled destination. This repository does not provision
off-site storage or automatically schedule a host cron job. Choose retention
and deletion rules suitable for your service and apply them to backup copies.

`restore:check` writes only an isolated temporary copy, checks schema/integrity
and a write probe, then removes it. It never overwrites the live diary. A real
recovery requires stopping the app, preserving the current database and its
WAL/SHM together, restoring a verified backup into the persistent volume with
the correct ownership, and restarting. Practice this on a staging volume before
a production incident. Do not copy a partial database into a running server.

After a real restore, invalidate sessions and action tokens before reopening
traffic, reconcile provider payment/subscription state, and reapply account
deletions since the backup using your protected erasure records. A restore must
not silently reactivate erased accounts. Encrypt the host disk and off-site
backups, and restrict database/backup access to the app operator.

## Privacy and public release

Publish your own privacy policy, subscription/renewal/refund terms, support
contact, taxes/invoicing treatment and processor disclosures. The example docs
are engineering instructions, not completed legal policies for your business.

Photos are processed in memory and never stored in the diary. OpenAI receives
configured image/description requests under its API data policy. Resend receives
account emails; Razorpay handles mandate/payment details. No card numbers are
stored by this app. JSON exports contain private user data and should be protected.

Account deletion reauthenticates the password, blocks new account operations,
drains in-flight billing work, and cancels active recurring renewals before
deleting profile, meals, plans, favourites, tokens, sessions and usage records.
Minimal payment references are retained with a random deleted-account identifier
for financial reconciliation. Provider records and backups have separate retention
rules; document and enforce those rules on the host. Do not promise immediate
erasure from third-party systems or old backups.

Begin with a small consenting beta. Validate nutrition against weighed meals,
collect feedback on variety and daily effort, test real cancellation/recovery,
and measure service costs before expanding. The current single-process SQLite
design suits a small deployment; scaling to multiple replicas needs shared
transactional storage, durable work queues and shared rate limits first.
