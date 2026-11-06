#!/usr/bin/env bash
# Database dump + uploaded media + .env into ./backups, keeps KEEP_DAYS days.
# Copy ./backups off the server (rclone / Yandex Disk / S3) for real safety.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/backups/$STAMP"
mkdir -p "$OUT"
chmod 700 "$DIR/backups"

docker compose exec -T postiz-postgres pg_dumpall -U postiz | gzip > "$OUT/postgres.sql.gz"
docker compose exec -T postiz tar -C /uploads -czf - . > "$OUT/uploads.tar.gz"
cp .env "$OUT/env"
chmod 600 "$OUT/env"

find "$DIR/backups" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "$(date -Is) backup ok: $OUT ($(du -sh "$OUT" | cut -f1))"
