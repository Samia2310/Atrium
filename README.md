# Atrium

## Local setup

Prerequisites: Node 20+, PostgreSQL 15+, and Git.

```bash
createdb atrium
copy env.example .env
npm install
npm run migrate
npm run dev:api
```

In a second terminal, start the web app:

```bash
npm run dev:web
```

## Project Structure

```text
Atrium/
├── api/                         # Backend (Node.js/TypeScript)
│   ├── dist/                    # Compiled backend output
│   ├── src/
│   │   ├── jobs/                # Background and scheduled jobs
│   │   ├── routes/              # API route handlers
│   │   ├── auth.ts              # Authentication and session management
│   │   ├── bookingRules.ts      # Booking, cancellation and refund rules
│   │   ├── credits.ts           # Credit, fee and refund calculations
│   │   ├── db.ts                # PostgreSQL database client
│   │   ├── email.ts             # Nodemailer/SMTP email handling
│   │   ├── events.ts            # Event handling
│   │   ├── index.ts             # API entry point
│   │   └── nodemailer.d.ts      # Nodemailer type declarations
│   ├── test/                    # Backend test suite
│   ├── package.json
│   └── tsconfig.json
│
├── web/                         # Frontend (Next.js/TypeScript)
│   ├── app/                     # Next.js App Router pages
│   ├── calendar/                # Calendar-related components and views
│   ├── components/              # Shared UI components
│   ├── lib/                     # Frontend utilities and helpers
│   ├── middleware.ts            # Route middleware and access control
│   ├── next-env.d.ts
│   ├── next.config.mjs
│   ├── package.json
│   └── tsconfig.json
│
├── assignment/                  # Assignment brief
├── migrations/                  # Database schema, seed and migration files
├── scripts/                    # Development and migration scripts
├── package.json                # Root workspace configuration
├── env.example                  # Example environment configuration
├── README.md
└── INSTRUCTIONS.md

Open http://localhost:3000. The seeded administrator credentials are listed in `env.example`.

## Local email with Mailpit

Atrium uses SMTP by default and `env.example` is already configured for Mailpit on `localhost:1025`.

1. Download the Mailpit binary for your operating system from https://github.com/axllent/mailpit/releases.
2. Run `mailpit` (or `mailpit.exe` on Windows) in a separate terminal. No account or credentials are required.
3. Keep these values in `.env`:

```dotenv
MAIL_TRANSPORT=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
MAIL_FROM=no-reply@atrium.local
```

4. Start Atrium with `npm run dev:api` and register an account at http://localhost:3000.
5. Open http://localhost:8025 to inspect the verification message. Click its password link to finish registration, then sign in with the password you chose.

If Mailpit is not running, a failed registration is rolled back: neither the new account nor its one-time verification token remains in PostgreSQL. An existing unverified account can be retried after Mailpit is started. A verified account must use sign-in or the sign-in-link flow instead of public registration.

## Tests

```bash
npm run build
npm test
```

## Validation notes

### Schema, indexes, and seed data defects

The starter migration used nullable columns, `numeric(10,2)` for credit balances and fees, had no valid-value checks, and did not prevent duplicate active enrolments. Its only session index began with `created_at`, although public schedule and conflict queries are driven by time, room, coach, and status. Migration `003_integrity_and_indexes.sql` fixes these root causes with non-null constraints, integer credit columns, domain checks, a unique lower-case email index, a partial unique active-enrolment index, and partial room/coach time indexes.

The historical seed is useful for validation but contains legacy rows that violate current business rules: fractional credits and fees, sessions outside opening hours, cross-midnight sessions, and sessions on closed days. Migration 003 floors fractional values rather than granting extra credit. Runtime session creation and rescheduling apply centre-local opening-hours and overlap rules; cancelled sessions are excluded from active conflict and catalogue queries. Inactive people and cancelled/completed sessions must not be treated as bookable catalogue rows.

No query was changed solely for a measured performance improvement in this submission, so there is no honest before/after `EXPLAIN (ANALYZE, BUFFERS)` result to report. The indexes above are correctness and access-path repairs; production tuning should capture plans on the target PostgreSQL dataset before and after adding or changing an index.

### Invariants and ownership

The database enforces non-null foreign-key relationships, positive room capacity, valid roles/statuses/session types, ordered timestamps, non-negative integer credits and fees, unique email addresses, and one active enrolment per person/session. These are storage invariants that must remain true regardless of which API or future job writes the row.

Application code enforces centre-local opening hours, Sunday closure, session durations, the intensive 210-minute room hold, room capacity, no self-enrolment, no overlapping commitments, coach booking lead time, refund tiers, and role-filtered visibility. These rules depend on current time, related rows, or a caller's role and are implemented in the owning transaction/query rather than as simple row checks. Booking, cancellation, session creation, and rescheduling use row locks plus serializable transactions so the checks and credit movements commit together.

### Transaction isolation and known anomalies

The default `read committed` level is used for ordinary reads, authentication, catalogue queries, and notification/reporting reads. It does not prevent non-repeatable reads or phantoms: a later statement can see a changed or newly inserted row.

Booking, cancellation, session creation, rescheduling, and the affected-participant movement path use `serializable`. This prevents serialization anomalies by aborting one conflicting transaction, but it does not prevent the transaction from failing with a serialization error; callers must retry or return a conflict. Email delivery is outside the database transaction, so SMTP failure can still require an operational retry after a database commit.

### Assumptions and unfinished work

- Fees are credits, not currency. The brief left amounts open, so the schedule above is an intentionally simple duration-scaled choice; changing it requires updating both displayed policy copy and server-side fee calculation.
- Participant refunds use 100/75/50/0 per cent and floor partial results because a participant cancellation returns a seat to the catalogue but does not release the coach's room cost. A different policy would change both `credits.ts` and the public page.
- Public booking by email is treated as participant registration and uses the password-token flow; without a verified password, the account cannot safely be reused as a signed-in identity.
- The centre timezone is `America/New_York`; changing it affects opening-hour checks, displayed times, deadlines, and scheduled jobs.
- The deterministic assistant stub is the local/test provider. A hosted or Ollama model still needs deployment credentials and operational monitoring, so live model integration is unfinished.
- Automated browser coverage and production SMTP/provider deployment are unfinished because the repository has no browser test harness or provider credentials. API tests, TypeScript builds, and Mailpit provide the current verification boundary.

## Implementation choices and booking rules

- Database access: raw `pg`, kept close to the SQL constraints and transaction boundaries used by the booking rules.
- Email: Nodemailer over SMTP. Mailpit is the local catch-all transport described above.
- Scheduler: a self-rescheduling timer recalculates the next midnight in `America/New_York`, so daylight-saving transitions do not use a fixed UTC hour.
- Assistant: deterministic server-side tools are used for local development and tests; each tool receives the signed-in caller and applies permissions in its query.
- Validation and testing: TypeScript compiler checks plus Node's built-in test runner.

Credits are integers. The fee schedule is: `short` room 30 / seat 15, `standard` room 40 / seat 20, and `intensive` room 120 / seat 60. Intensive sessions teach for 180 minutes and hold the room for 210 minutes.

Coach cancellation refunds the room fee at 100% with 96+ hours notice, 50% at 48-96 hours, 25% at 24-48 hours, and 0% under 24 hours. Coaches must book at least 48 hours ahead.

Participant cancellation refunds 100% at 96+ hours, 75% at 48-96 hours, 50% at 24-48 hours, and 0% under 24 hours. Partial refunds round down to whole credits. This policy is more forgiving because a participant cancellation releases a seat back to the catalogue without releasing the coach's room cost. If a coach cancels, every affected participant receives a full seat-fee refund regardless of notice.
