# Deploying DriveBook

Production runs on one Hetzner Cloud server with `docker-compose.prod.yml`:

| Service | What it does |
| --- | --- |
| `db` | Postgres 17 (`db-data` volume) |
| `migrate` | one-shot `npm run db:migrate`; `web` and `worker` start only after it succeeds |
| `web` | the Next.js server (`storage` volume for uploads) |
| `worker` | the notification worker (`npm run worker`, pg-boss e-mail / SMS jobs) |
| `backup` | nightly `pg_dump` + uploads archive into the `backups` volume (`docker/backup`) |
| `caddy` | TLS + reverse proxy (`docker/caddy`); the only service that publishes ports (80, 443, 443/udp) |

Caddy gets one wildcard certificate for `drivebook.si` and `*.drivebook.si` via the Cloudflare DNS-01 challenge, so the DNS records stay DNS-only.

All commands below run on the server from the checkout directory. Clone into a directory named `drivebook` (e.g. under `/opt`) so the compose project — and with it the volume and network names used in the backup section (`drivebook_backups`, `drivebook_storage`, `drivebook_default`) — is `drivebook`.

## 1. Hetzner Cloud server

1. Create a server in the Hetzner Cloud Console: the current **Ubuntu LTS** image, x86 or Arm, at least 2 vCPU / 4 GB RAM (the image build runs `next build` on the server). Add your **SSH public key** while creating it, so no root password is set.
2. Log in as root with your key and allow SSH-key login only. Create `/etc/ssh/sshd_config.d/10-hardening.conf` with:

   ```
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   PermitRootLogin prohibit-password
   ```

   then `systemctl restart ssh`. Check from a second terminal that key login still works before closing the first one.
3. Update the system and install Docker Engine with the compose plugin from Docker's apt repository:

   ```bash
   apt-get update && apt-get -y upgrade
   apt-get install -y ca-certificates curl git
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
     > /etc/apt/sources.list.d/docker.list
   apt-get update
   apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   docker compose version
   ```

4. Firewall — allow only **22/tcp, 80/tcp, 443/tcp and 443/udp** (HTTP/3):
   - **Hetzner Cloud Firewall** (recommended; filters before traffic reaches the server): Console → Firewalls → create one with inbound rules TCP 22, TCP 80, TCP 443, UDP 443 (source any IPv4/IPv6), and apply it to the server.
   - and/or **ufw** on the server:

     ```bash
     ufw default deny incoming
     ufw default allow outgoing
     ufw allow 22/tcp
     ufw allow 80/tcp
     ufw allow 443/tcp
     ufw allow 443/udp
     ufw enable
     ```

     Docker-published ports bypass ufw's rules, which is why only `caddy` publishes any ports and the Hetzner Cloud Firewall is the primary filter.

## 2. Cloudflare DNS

In the Cloudflare dashboard for the `drivebook.si` zone, create these records, both **DNS only (grey cloud)** — Caddy terminates TLS itself:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| A | `drivebook.si` | server IPv4 | DNS only |
| A | `*.drivebook.si` | server IPv4 | DNS only |
| AAAA (optional) | `drivebook.si` | server IPv6 | DNS only |
| AAAA (optional) | `*.drivebook.si` | server IPv6 | DNS only |

The wildcard covers the dealer subdomains and the `app.` / `admin.` surfaces.

Create the API token for Caddy's certificate challenge: My Profile → API Tokens → Create Token → "Edit zone DNS" template, permission **Zone · DNS · Edit**, zone resources **Include · Specific zone · drivebook.si**. Put it in `.env` as `CLOUDFLARE_DNS_API_TOKEN`. It is separate from `CLOUDFLARE_API_TOKEN` (the app's dealer custom-domain token), so each token has only the rights it needs.

## 3. Configure `.env`

```bash
git clone <repository URL> drivebook
cd drivebook
cp .env.example .env
chmod 600 .env
```

`.env.example` holds the dev defaults; change these for production:

| Variable | Production value |
| --- | --- |
| `APP_ENV` | `production` (the prod compose file forces it anyway) |
| `BASE_DOMAIN` | `drivebook.si` |
| `AUTH_SECRET` | a strong random value, e.g. `openssl rand -hex 32` |
| `POSTGRES_USER` / `POSTGRES_DB` | keep `drivebook` or choose your own |
| `POSTGRES_PASSWORD` | a strong random value, e.g. `openssl rand -hex 32` (hex needs no URL-encoding) |
| `DATABASE_URL`, `TEST_DATABASE_URL` | delete both lines — compose builds `DATABASE_URL` from the `POSTGRES_*` values; a `DATABASE_URL` left in `.env` overrides that and must match them |
| `SEED_ON_START` | `0` — otherwise the demo dealer is seeded into production |
| `SEED_SUPERADMIN_EMAIL` | empty (the first Superadmin is created in step 5) |
| `PUBLIC_URL_SCHEME` / `PUBLIC_URL_PORT` | not used by the prod stack (links are always `https`, no port) |
| `ACME_EMAIL` | your contact e-mail for Let's Encrypt |
| `CLOUDFLARE_DNS_API_TOKEN` | the token from step 2 |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | real Twilio credentials and sender (E.164) |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | real Brevo key and a verified sender |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | for dealer custom domains (optional) |
| `NOTIFY_FAKE`, `ALLOW_FAKE_PROVIDERS`, `FARM_TEST_AUTH`, `DEV_INBOX_ENABLED` | empty |
| `BACKUP_RETENTION_DAYS` | `14` (default) |

**Production refuses to start with fake providers.** With `APP_ENV=production`, `web` and `worker` exit at startup when any Twilio or Brevo key is missing or `NOTIFY_FAKE=1` is set, with `Production requires real providers: …` in the log. Only `ALLOW_FAKE_PROVIDERS=1` lifts this, and it is meant for staging only (section 6).

## 4. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. Then check the logs:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs migrate
docker compose -f docker-compose.prod.yml logs -f web worker caddy
```

Expect `migrate` to have exited with code 0, `web` to become `healthy`, `worker` running, and Caddy to log that it obtained the certificate for `drivebook.si` and `*.drivebook.si`. Then `curl -I https://admin.drivebook.si` should answer over valid TLS.

## 5. First Superadmin

```bash
docker compose -f docker-compose.prod.yml run --rm web npm run create-superadmin -- --email you@example.com
```

It prints `Set-password link: <url>`. Open that link (it points at `admin.drivebook.si`, valid 7 days), set the password, then sign in on `https://admin.drivebook.si`. The invitation e-mail is also queued and sent by the `worker`. Running the command again invalidates the previous link.

## 6. Staging

Staging is a separate server (or at least a separate checkout and compose project) set up exactly like production, with these differences:

- `.env`: `BASE_DOMAIN=staging.drivebook.si`. `ALLOW_FAKE_PROVIDERS=1` is allowed here, so staging can run without Twilio/Brevo keys (messages go to the console adapters; `DEV_INBOX_ENABLED=1` additionally serves the dev inbox to read them). Use its own `AUTH_SECRET` and `POSTGRES_PASSWORD`.
- Cloudflare (same `drivebook.si` zone), DNS only (grey cloud):

  | Type | Name | Content |
  | --- | --- | --- |
  | A | `staging.drivebook.si` | staging server IPv4 |
  | A | `*.staging.drivebook.si` | staging server IPv4 |

  The same kind of Zone:DNS:Edit token for `drivebook.si` works for the staging certificate (`staging.drivebook.si` + `*.staging.drivebook.si`); create a separate token for staging so it can be revoked independently.
- Start it and create the Superadmin with the same commands as in sections 4 and 5; the surfaces are `admin.staging.drivebook.si`, `app.staging.drivebook.si` and `{slug}.staging.drivebook.si`.

Never set `ALLOW_FAKE_PROVIDERS=1` on production.

## 7. Backups

The `backup` service runs every night at **03:00 Europe/Ljubljana** and writes `db-YYYYmmdd-HHMMSS.dump` (`pg_dump -Fc`) and `uploads-YYYYmmdd-HHMMSS.tar.gz` into the `backups` volume. Files older than `BACKUP_RETENTION_DAYS` (**14**) days are deleted after each run. Details: `docker/backup/README.md`.

List backups:

```bash
docker compose -f docker-compose.prod.yml exec backup ls -l /backups
```

Run one now (e.g. before an update):

```bash
docker compose -f docker-compose.prod.yml exec backup backup.sh
```

Copy them offsite — the volume lives on the same disk as the database, so this is what protects against losing the server:

```bash
docker compose -f docker-compose.prod.yml cp backup:/backups ./backups-copy
rsync -av ./backups-copy/ user@offsite-host:drivebook-backups/
```

(or `rclone` to object storage in another provider/region). Keep at least one offsite copy older than the retention window.

### Restore

`docker/backup/restore.sh <timestamp>` restores the database dump (`pg_restore --clean --if-exists --single-transaction`) and unpacks the uploads archive over the storage volume. The `backup` service mounts storage read-only, so run the restore in a one-off container with storage mounted read-write:

```bash
docker compose -f docker-compose.prod.yml stop web worker
docker run --rm --network drivebook_default --env-file .env \
  -v drivebook_storage:/data/storage -v drivebook_backups:/backups \
  drivebook-backup restore.sh 20261021-030000
docker compose -f docker-compose.prod.yml start web worker
```

`drivebook-backup` is the image compose built for the `backup` service. Without a timestamp, `restore.sh` lists the available ones. To restore from an offsite copy, first copy the two files back into the volume (`docker compose -f docker-compose.prod.yml cp ./db-….dump backup:/backups/`, same for the uploads archive).

### Verify locally

`docker/backup/test-restore.sh` (needs only Docker) builds the backup image, starts a throwaway Postgres with volumes, seeds rows and a file, runs a backup, checks the retention pruning, wipes everything, restores and compares row counts and the file checksum. It cleans up after itself:

```bash
docker/backup/test-restore.sh
```

It ends with `OK: …` on success. Run it after changing anything in `docker/backup`, and periodically test a real restore on staging from an offsite copy.

## 8. Updating

```bash
cd drivebook
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs migrate
```

Compose rebuilds the image, runs `migrate` first, and only starts the new `web` and `worker` once it has exited successfully. If a migration fails, `up` stops with an error instead of starting them — check the `migrate` log and fix the cause before retrying. Take a backup first (`exec backup backup.sh`, section 7) when an update contains migrations.

## Trying the production stack locally

`docker-compose.prod.local.yml` overrides the prod stack for a local run (`drivebook.localhost`, Caddy internal TLS, fake providers, demo seed):

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml up -d --build
curl -k --resolve demo.drivebook.localhost:443:127.0.0.1 https://demo.drivebook.localhost/
```
