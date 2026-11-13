# DriveBook — test / demo server

One server running the whole stack with Docker Compose: Caddy (HTTPS) → `web` (Next.js) + `worker` (SMS / e-mail queue) + Postgres.
Meant for internal testing and demos, not for production customers. SMS and e-mail are fake by default and show up in a password-protected inbox.

## 1. Server

- Linux VPS with ~2 GB RAM, Docker Engine and the Compose plugin (`docker compose version`).
- Open ports 80 and 443 (HTTP is needed for the Let's Encrypt certificate check).

## 2. DNS

`DOMAIN` below is a placeholder (`drivebook-test.example.com`). Use your real test domain. Point these at the server's IP:

| Record | Name | Value |
| --- | --- | --- |
| A | `DOMAIN` | server IP |
| A | `*.DOMAIN` | server IP |

The wildcard covers `app.` (dealer admin), `admin.` (backoffice) and every dealer subdomain (`demo.` …).

## 3. Configure

```bash
git clone https://github.com/primozkr533/drivebook.git
cd drivebook/deploy
cp .env.example .env
```

Edit `deploy/.env`:

- `DOMAIN`: the test domain. `DEALER_HOSTS`: `demo.<DOMAIN>`, plus any dealer you create later, comma-separated.
- `POSTGRES_PASSWORD`, `AUTH_SECRET`: `openssl rand -hex 32` for each.
- `SEED_SUPERADMIN_EMAIL`: your e-mail. The backoffice superadmin account is created on first start.
- `INBOX_PASSWORD_HASH`: `docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-password'`. Paste the result inside single quotes.

## 4. Start

```bash
cd deploy
docker compose up -d --build
docker compose logs -f web      # wait for "[startup] Migrations applied" and "Seed applied"
```

Database migrations and the demo data (demo dealer with four cars, opening hours) are applied automatically on every start. They are idempotent.

## 5. First login

| URL | What |
| --- | --- |
| `https://demo.<DOMAIN>` | public page of the demo dealer: book a test drive here |
| `https://app.<DOMAIN>` | dealer admin: cars, bookings, settings |
| `https://admin.<DOMAIN>` | backoffice: dealers, plans, operators |
| `https://<DOMAIN>/_dev/inbox` | fake SMS codes and e-mails (user `INBOX_USER`, your inbox password) |

The seeded users have no password yet:

- **Backoffice superadmin**: run the command below. It prints a link to set the password.
  ```bash
  docker compose exec worker npm run create-superadmin -- --email you@example.com
  ```
- **Demo dealer Owner** (`owner@demo.drivebook.si`): on `https://app.<DOMAIN>`, use *Pozabljeno geslo* with that e-mail. Then open the reset e-mail in the inbox and set a password.
- **Demo Salesperson**: same as the Owner, with `prodaja@demo.drivebook.localhost`.

When a customer books, the SMS confirmation code appears in the inbox. To skip SMS confirmation for demos, turn off *Potrditev s SMS kodo* in the dealer admin under *Nastavitve → Pravila rezervacij*.

## New dealers

After creating a dealer in the backoffice, add `<slug>.<DOMAIN>` to `DEALER_HOSTS` and run `docker compose up -d caddy`, so Caddy issues its certificate.

## Update to a newer version

```bash
git pull
cd deploy
docker compose up -d --build
```

## Notes

- Data lives in Docker volumes (`db-data`, `storage`). `docker compose down` keeps them; `down -v` deletes everything.
- Backup: `docker compose exec db pg_dump -U drivebook drivebook > backup.sql`.
- Real SMS / e-mail: set `NOTIFY_FAKE=0` and fill in the Twilio and Brevo keys in `.env`. The inbox can then be turned off with `DEV_INBOX_ENABLED=0`.
