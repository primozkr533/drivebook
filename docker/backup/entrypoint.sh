#!/usr/bin/env bash
set -euo pipefail

# Any arguments run once instead of the schedule, e.g. `backup.sh` or `restore.sh <timestamp>`.
if (( $# > 0 )); then
  exec "$@"
fi

BACKUP_TIME="${BACKUP_TIME:-03:00}"
if ! [[ "$BACKUP_TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "BACKUP_TIME must be HH:MM, got '$BACKUP_TIME'" >&2
  exit 1
fi

echo "backup scheduled daily at $BACKUP_TIME ${TZ:-UTC}" >&2
last_run=""
# Polling the wall clock (TZ=Europe/Ljubljana) keeps the run at local 03:00 across DST changes.
while true; do
  today="$(date '+%Y-%m-%d')"
  if [[ "$(date '+%H:%M')" == "$BACKUP_TIME" && "$last_run" != "$today" ]]; then
    last_run="$today"
    # A failed night is logged and retried the next night; the container keeps running.
    backup.sh || echo "backup failed with exit code $?" >&2
  fi
  sleep 30
done
