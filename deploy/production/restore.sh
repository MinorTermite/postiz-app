#!/usr/bin/env bash
# Restores a backup made by backup.sh:  ./restore.sh backups/20261106-033000
# Replaces the current database and media. Asks for confirmation.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
SRC="${1:-}"
if [[ -z "$SRC" || ! -f "$SRC/postgres.sql.gz" ]]; then
  echo "Usage: $0 backups/<stamp>" >&2
  exit 1
fi
read -r -p "Current data will be replaced by $SRC. Type YES: " ok
[[ "$ok" == "YES" ]] || exit 1

docker compose stop postiz temporal
docker compose exec -T postiz-postgres psql -U postiz -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('postiz','temporal','temporal_visibility') AND pid <> pg_backend_pid();" >/dev/null
for db in postiz temporal temporal_visibility; do
  docker compose exec -T postiz-postgres psql -U postiz -d postgres -c "DROP DATABASE IF EXISTS $db;" >/dev/null
done
gunzip -c "$SRC/postgres.sql.gz" | docker compose exec -T postiz-postgres psql -U postiz -d postgres >/dev/null

docker compose up -d postiz
if [[ -f "$SRC/uploads.tar.gz" ]]; then
  docker compose exec -T postiz sh -c 'rm -rf /uploads/* && tar -C /uploads -xzf -' < "$SRC/uploads.tar.gz"
fi
docker compose up -d
echo "Restored from $SRC"
