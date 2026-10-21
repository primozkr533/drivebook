#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-/data/storage}"

ts="${1:-}"
if ! [[ "$ts" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
  echo "usage: restore.sh <timestamp>   (YYYYmmdd-HHMMSS, e.g. 20261021-030000)" >&2
  echo "available backups:" >&2
  ls -1 "$BACKUP_DIR" 2>/dev/null | sed -n 's/^db-\(.*\)\.dump$/  \1/p' >&2 || true
  exit 2
fi

db_file="$BACKUP_DIR/db-$ts.dump"
uploads_file="$BACKUP_DIR/uploads-$ts.tar.gz"
for f in "$db_file" "$uploads_file"; do
  if [[ ! -f "$f" ]]; then
    log "missing $f"
    exit 1
  fi
done
mkdir -p "$STORAGE_DIR"

pg_target

log "restoring database from $db_file"
pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
  --dbname="$PG_TARGET" "$db_file"

log "unpacking $uploads_file into $STORAGE_DIR"
tar xzf "$uploads_file" -C "$STORAGE_DIR"

log "restore $ts done"
