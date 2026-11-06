#!/usr/bin/env bash
# Update to a new image: backup first, then swap the image, schema migrates on start.
#   ./update.sh                      # postiz-ru-image.tar.gz in this folder, or pull POSTIZ_IMAGE
#   ./update.sh build                # rebuild from the fork (branch gravmix)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
REPO="${REPO:-https://github.com/MinorTermite/postiz-app.git}"
BRANCH="${BRANCH:-gravmix}"
IMAGE="$(grep -E '^POSTIZ_IMAGE=' .env | cut -d= -f2-)"
IMAGE="${IMAGE:-postiz-ru:latest}"

./backup.sh

if [[ "${1:-}" == "build" ]]; then
  rm -rf /opt/gravmix-src
  git clone --depth 1 -b "$BRANCH" "$REPO" /opt/gravmix-src
  docker build -f /opt/gravmix-src/Dockerfile.dev -t "$IMAGE" /opt/gravmix-src
elif [[ -f postiz-ru-image.tar.gz ]]; then
  gunzip -c postiz-ru-image.tar.gz | docker load
  mv postiz-ru-image.tar.gz "postiz-ru-image.loaded-$(date +%Y%m%d).tar.gz"
else
  docker compose pull postiz
fi

docker compose up -d
docker image prune -f >/dev/null
echo "Updated. Watch the start: docker compose logs -f postiz"
