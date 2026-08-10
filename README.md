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

## Implementation choices and booking rules

- Database access: raw `pg`, kept close to the SQL constraints and transaction boundaries used by the booking rules.
- Email: Nodemailer over SMTP. Mailpit is the local catch-all transport described above.
- Scheduler: a self-rescheduling timer recalculates the next midnight in `America/New_York`, so daylight-saving transitions do not use a fixed UTC hour.
- Assistant: deterministic server-side tools are used for local development and tests; each tool receives the signed-in caller and applies permissions in its query.
- Validation and testing: TypeScript compiler checks plus Node's built-in test runner.

Credits are integers. The fee schedule is: `short` room 30 / seat 15, `standard` room 40 / seat 20, and `intensive` room 120 / seat 60. Intensive sessions teach for 180 minutes and hold the room for 210 minutes.

Coach cancellation refunds the room fee at 100% with 96+ hours notice, 50% at 48-96 hours, 25% at 24-48 hours, and 0% under 24 hours. Coaches must book at least 48 hours ahead.

Participant cancellation refunds 100% at 96+ hours, 75% at 48-96 hours, 50% at 24-48 hours, and 0% under 24 hours. Partial refunds round down to whole credits. This policy is more forgiving because a participant cancellation releases a seat back to the catalogue without releasing the coach's room cost. If a coach cancels, every affected participant receives a full seat-fee refund regardless of notice.
