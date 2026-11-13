#!/usr/bin/env bash
# Sourced by backup.sh and restore.sh. Connection settings come only from the environment.

# Sets PG_TARGET; not called via $(...) so the PG* exports reach pg_dump/pg_restore.
pg_target() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    PG_TARGET="$DATABASE_URL"
    return
  fi
  : "${POSTGRES_USER:?set DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB}"
  : "${POSTGRES_DB:?set DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB}"
  export PGHOST="${POSTGRES_HOST:-db}"
  export PGPORT="${POSTGRES_PORT:-5432}"
  export PGUSER="$POSTGRES_USER"
  if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
    export PGPASSWORD="$POSTGRES_PASSWORD"
  fi
  PG_TARGET="$POSTGRES_DB"
}

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >&2
}
