# DriveBook

Test-drive and viewing bookings for Slovenian car dealers — `{slug}.drivebook.si`.

## Run

```bash
docker compose up --build
# → http://localhost:3000/design  (design foundation showcase)
```

Or locally: `npm install && npm run dev`.

The design system (tokens, primitives, signature components, rules) is documented in `CLAUDE.md → Design system`.

## Local setup

On a fresh clone the only step is:

```bash
docker compose up --build
```

This starts `db` (Postgres 17) and `web`. Database migrations and the demo seed (default plan, superadmin, demo dealer) run automatically when the server starts.

Then open:

| URL | What |
| --- | --- |
| http://localhost:3000 | redirects to `/design` (design showcase) |
| http://demo.drivebook.localhost:3000 | public page of the demo dealer |
| http://app.drivebook.localhost:3000 | dealer admin (login) |
| http://admin.drivebook.localhost:3000 | backoffice (login) |
| http://avtohisa-demo.drivebook.localhost:3000 | old slug demo — 301-redirects to `demo.drivebook.localhost` |

`*.localhost` resolves to 127.0.0.1 in Chrome, Firefox and Edge with no hosts-file edits. curl does not do this, so send the Host header yourself:

```bash
curl -H 'Host: demo.drivebook.localhost' http://localhost:3000/
```

Dev aliases (no subdomains needed, disabled in production):

- http://localhost:3000/_dev/site/demo — demo dealer page
- http://localhost:3000/_dev/app/login — dealer admin login
- http://localhost:3000/_dev/admin/login — backoffice login

### Commands

```bash
npm run db:migrate          # apply pending migrations
npm run db:seed             # run the idempotent seed
npm run worker              # notification worker (sends queued e-mail / SMS)
npm run create-superadmin -- --email ops@example.com
```

`create-superadmin` finds or creates a backoffice superadmin with that (lowercased) e-mail and prints `Set-password link: <url>`. A new or not-yet-active user gets an invitation link (valid 7 days); an already active user gets a fresh password-reset link instead. Running it again invalidates the previous link. The CLI only enqueues the e-mail and then stops pg-boss; the `worker` sends it — if no worker is running, the message stays `queued` in `message_log` until one starts. With Compose, run it in the `worker` service (it has the full source and `tsx`): `docker compose exec worker npm run create-superadmin -- --email ops@example.com`.

### Tests

```bash
# Unit / integration (Vitest) on the real `drivebook_test` database via TEST_DATABASE_URL
docker compose up -d db
npm run test

# End-to-end (Playwright) against the running stack (`docker compose up --build`)
npx playwright install chromium
npm run test:e2e
```

### Environment variables

All variables and their defaults are listed in [`.env.example`](.env.example); copying it to `.env` is optional. Provider keys (Twilio, Brevo, Cloudflare) are optional — when they are absent the app uses console mocks for SMS, email and DNS.
