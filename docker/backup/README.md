# Backup service

Image based on `postgres:17-alpine` (same major as the `db` image) that backs up the app database and the uploads volume.

- Default command: loops and runs `backup.sh` daily at `BACKUP_TIME` (default `03:00`, `TZ=Europe/Ljubljana`, DST-safe). A failed night is logged; the container keeps running.
- Any command given to the container runs once instead (e.g. `backup.sh`, `restore.sh <timestamp>`).

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection URI; used when set |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `db` / `5432` / — | used when `DATABASE_URL` is empty |
| `BACKUP_RETENTION_DAYS` | `14` | files older than this many days are deleted after each backup |
| `BACKUP_DIR` | `/backups` | backup target (mount the named volume `backups` here) |
| `STORAGE_DIR` | `/data/storage` | uploads volume (mount read-only for backups, read-write for restores) |
| `BACKUP_TIME` | `03:00` | daily run time (local) |

Secrets are read only from the environment; nothing is baked into the image.

## Output

Each run writes `db-YYYYmmdd-HHMMSS.dump` (`pg_dump -Fc`) and `uploads-YYYYmmdd-HHMMSS.tar.gz` to `BACKUP_DIR`. Both are written to a temp file and renamed, so a half-written backup never carries a final name. Any failure exits non-zero.

## Run once against the dev stack

```bash
docker build -t drivebook-backup docker/backup
docker run --rm --network drivebook_default \
  -e DATABASE_URL=postgres://drivebook:drivebook@db:5432/drivebook \
  -v drivebook_storage:/data/storage:ro -v backups:/backups \
  drivebook-backup backup.sh
docker run --rm -v backups:/backups drivebook-backup ls -l /backups
```

(The network and volume names follow the compose project name — `drivebook` when the checkout directory is `drivebook`.)

## Restore

Stop `web` and `worker` first, then:

```bash
docker run --rm --network <network> -e DATABASE_URL=... \
  -v <storage-volume>:/data/storage -v backups:/backups \
  drivebook-backup restore.sh 20261021-030000
```

`restore.sh` runs `pg_restore --clean --if-exists --no-owner --single-transaction` and unpacks the uploads archive over the storage volume (files not in the archive are kept). Without an argument it lists the available timestamps.

## Round-trip test

`docker/backup/test-restore.sh` (needs Docker) builds the image, starts a throwaway Postgres and volumes, seeds rows and a file, creates old dummy backups, runs a backup, checks the retention pruning, wipes the data, restores and compares row counts and the file checksum. It cleans up after itself.

## Offsite copy (manual, not automated)

The `backups` volume lives on the same host as the database. Copy it offsite regularly, e.g. nightly from the host:

```bash
docker run --rm -v backups:/backups:ro -v "$PWD":/out alpine \
  tar czf /out/drivebook-backups-$(date +%F).tar.gz -C /backups .
# then rsync/rclone the archive to a different provider/region
```

Keep at least one offsite copy older than the retention window, and test a restore from it periodically.
