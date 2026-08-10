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
