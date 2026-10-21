#!/usr/bin/env bash
# Local round-trip check: backup → wipe → restore against a throwaway Postgres and volumes.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
id="drivebook-backup-test-$$"
image="drivebook-backup:test"
net="$id-net"
db="$id-db"
storage="$id-storage"
backups="$id-backups"
db_image="$(sed -n 's/^FROM \(postgres:[^ ]*\).*/\1/p' "$here/Dockerfile")"

export POSTGRES_USER=drivebook
export POSTGRES_DB=drivebook
export POSTGRES_PASSWORD="test-$RANDOM$RANDOM$RANDOM"
export POSTGRES_HOST="$db"
export DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@$db:5432/$POSTGRES_DB"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

cleanup() {
  docker rm -f "$db" >/dev/null 2>&1 || true
  docker volume rm -f "$storage" "$backups" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_db() {
  docker exec -i "$db" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qAt "$@" </dev/null
}

counts() {
  psql_db -c "SELECT (SELECT count(*) FROM dealers) || ',' || (SELECT count(*) FROM cars)"
}

in_backup() {
  docker run --rm --network "$net" -v "$backups:/backups" "$@"
}

echo "building $image"
docker build -q -t "$image" "$here" >/dev/null

docker network create "$net" >/dev/null
docker volume create "$storage" >/dev/null
docker volume create "$backups" >/dev/null
docker run -d --name "$db" --network "$net" \
  -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB "$db_image" >/dev/null

# Probing over TCP skips the init-phase server, which only listens on the unix socket.
for _ in $(seq 1 60); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$db" pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null || fail "postgres did not start"

psql_db -c "
  CREATE TABLE dealers (id serial PRIMARY KEY, name text NOT NULL);
  CREATE TABLE cars (id serial PRIMARY KEY, dealer_id int NOT NULL REFERENCES dealers(id), title text NOT NULL);
  INSERT INTO dealers (name) SELECT 'Dealer ' || g FROM generate_series(1, 3) g;
  INSERT INTO cars (dealer_id, title) SELECT 1 + g % 3, 'Car ' || g FROM generate_series(1, 25) g;
"
before="$(counts)"

in_backup -v "$storage:/data/storage" "$image" bash -c '
  set -euo pipefail
  mkdir -p /data/storage/logos
  head -c 65536 /dev/urandom > /data/storage/logos/test-logo.png
  touch -d "20 days ago" /backups/db-20000101-000000.dump /backups/uploads-20000101-000000.tar.gz
  touch -d "2 days ago" /backups/db-20000102-000000.dump /backups/uploads-20000102-000000.tar.gz
'
file_sum="$(in_backup -v "$storage:/data/storage:ro" "$image" sha256sum /data/storage/logos/test-logo.png | cut -d' ' -f1)"

echo "backing up"
in_backup -e DATABASE_URL -v "$storage:/data/storage:ro" "$image" backup.sh

listing="$(in_backup "$image" ls -1 /backups)"
grep -qx 'db-20000101-000000.dump' <<<"$listing" && fail "old dump was not pruned"
grep -qx 'uploads-20000101-000000.tar.gz' <<<"$listing" && fail "old uploads archive was not pruned"
grep -qx 'db-20000102-000000.dump' <<<"$listing" || fail "recent dump was pruned"
grep -q '\.tmp$' <<<"$listing" && fail "temp file left behind"
ts="$(sed -n 's/^db-\([0-9]\{8\}-[0-9]\{6\}\)\.dump$/\1/p' <<<"$listing" | grep -v '^2000' | tail -n 1)"
[[ -n "$ts" ]] || fail "no new dump created"
grep -qx "uploads-$ts.tar.gz" <<<"$listing" || fail "no uploads archive for $ts"

echo "wiping"
psql_db -c "DROP TABLE cars; DROP TABLE dealers;"
in_backup -v "$storage:/data/storage" "$image" bash -c 'find /data/storage -mindepth 1 -delete'
in_backup -v "$storage:/data/storage:ro" "$image" test -e /data/storage/logos/test-logo.png && fail "storage was not wiped"

echo "restoring $ts"
# Restore via POSTGRES_* to cover the non-DATABASE_URL path too.
in_backup -e POSTGRES_HOST -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB \
  -v "$storage:/data/storage" "$image" restore.sh "$ts"

after="$(counts)"
[[ "$after" == "$before" ]] || fail "row counts differ: before $before, after $after"
restored_sum="$(in_backup -v "$storage:/data/storage:ro" "$image" sha256sum /data/storage/logos/test-logo.png | cut -d' ' -f1)"
[[ "$restored_sum" == "$file_sum" ]] || fail "restored file differs"

echo "OK: rows (dealers,cars) $after, file restored, retention pruned old backups"
