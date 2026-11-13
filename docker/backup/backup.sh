#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-/data/storage}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( BACKUP_RETENTION_DAYS < 1 )); then
  log "BACKUP_RETENTION_DAYS must be a positive integer, got '$BACKUP_RETENTION_DAYS'"
  exit 1
fi
if [[ ! -d "$STORAGE_DIR" ]]; then
  log "storage directory $STORAGE_DIR does not exist"
  exit 1
fi
mkdir -p "$BACKUP_DIR"

ts="$(date '+%Y%m%d-%H%M%S')"
db_file="$BACKUP_DIR/db-$ts.dump"
uploads_file="$BACKUP_DIR/uploads-$ts.tar.gz"
db_tmp="$BACKUP_DIR/.db-$ts.dump.tmp"
uploads_tmp="$BACKUP_DIR/.uploads-$ts.tar.gz.tmp"

cleanup() {
  rm -f "$db_tmp" "$uploads_tmp"
}
trap cleanup EXIT

pg_target

log "dumping database to $db_file"
pg_dump -Fc --dbname="$PG_TARGET" --file="$db_tmp"
mv "$db_tmp" "$db_file"

log "archiving $STORAGE_DIR to $uploads_file"
tar czf "$uploads_tmp" -C "$STORAGE_DIR" .
mv "$uploads_tmp" "$uploads_file"

# -mmin instead of -mtime: -mtime +N rounds down and would keep files for N+1 days.
retention_minutes=$(( BACKUP_RETENTION_DAYS * 24 * 60 ))
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' -o -name '.*.tmp' \) \
  -mmin "+$retention_minutes" -print -delete | while read -r pruned; do
  log "pruned $pruned"
done

log "backup $ts done"
