# Upgrade verification and remaining launch checks

This release improves the existing app; it is not a claim of perfect nutrition
accuracy, a completed independent security audit, or a publicly deployed service.

## Verified locally

The final upgrade check passed 46 automated tests and 10 desktop/mobile browser
checks. The production image built successfully and ran the smoke checks below.

- Account-isolated diary creation, corrections, editing/deletion, save idempotency,
  daily totals and SQLite persistence.
- Recent/favourite foods and meals, explicit repeat confirmation and snapshot reuse.
- Regional menu generation, exclusions, budget/time choices, versioned meal swaps,
  completed-day protection, weekly ingredient downloads and keyboard day navigation.
- Trial start/expiry, monthly and annual subscription prices, captured invoices,
  signatures, renewals, cancellation, refund revocation and legacy upgrades, using
  explicit provider fixtures rather than actual charges.
- Photo quota reservation, failure release, empty-image handling and monthly
  resets for annual subscribers, using explicit analysis fixtures.
- Hashed, purpose-bound, single-use, expiring email tokens; password resets and
  session revocation; authenticated exports and password-confirmed deletion.
- Private online backups and temporary restore integrity/schema/write checks.
- Responsive desktop/mobile browser workflows, dialog keyboard use, no horizontal
  overflow and a primary-action contrast check. This is not a full WCAG audit.
- Production build, non-root Docker image build and runtime smoke checks for
  health, static pages, security headers, sessions and account/data operations.
- Production and full npm audits report no known advisories after updating sharp
  to 0.35.5. This reflects the registry audit at testing time, not future guarantees.

The included CI workflow repeats tests, build and desktop/mobile browser checks.
Local success does not establish a successful hosted CI run.

## Owner actions still needed

| Area               | Remaining action                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo service      | Securely bind a working OpenAI key and billing, then test actual meal photos. Current cloud declarations have no saved bindings; read-only checks did not authenticate. |
| Nutrition coverage | Configure optional USDA API access, validate search results and run the measured-meal benchmark in PHOTO-VALIDATION.md.                                                 |
| Email              | Verify your sender domain, configure Resend and the public HTTPS URL, then verify delivery/recovery in real inboxes.                                                    |
| Payments           | Activate Razorpay, create both exact-price plans, configure signed webhooks, and validate real mandate/charge/renewal/cancellation/refund behavior.                     |
| Hosting            | Deploy behind HTTPS on persistent storage, configure DNS/proxy settings, and connect monitoring and scheduled encrypted off-site backups.                               |
| Public policies    | Finalize privacy, retention, processor disclosures, support/refund terms and tax/invoicing treatment.                                                                   |
| Product quality    | Run a small consenting beta and evaluate variety, friction, estimate errors and actual service cost before making accuracy or value claims.                             |

No real payments, live email deliveries or measured real-photo accuracy results
were generated during development. Public HTTPS certificate issuance requires
your actual domain/DNS and remains a deployment check. See LAUNCH.md for steps.
