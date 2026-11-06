#!/usr/bin/env bash
# GravMix: first install on a clean Ubuntu 22.04 / 24.04 or Debian 12 VPS.
# Usage (as root, from this folder):
#   ./install.sh gravmix.ru admin@gravmix.ru
# Image source, first found wins:
#   1. postiz-ru-image.tar.gz next to this script (copied from the build machine)
#   2. POSTIZ_IMAGE from .env pulled from a registry
#   3. build from the fork (needs 8 GB RAM + swap, 20-40 min)
set -euo pipefail

DOMAIN="${1:-}"
ACME_EMAIL="${2:-}"
REPO="${REPO:-https://github.com/MinorTermite/postiz-app.git}"
BRANCH="${BRANCH:-gravmix}"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [[ -z "$DOMAIN" || -z "$ACME_EMAIL" ]]; then
  echo "Usage: $0 <domain> <email for Let's Encrypt>" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

echo "== Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "== Firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

echo "== Swap (Temporal + Next.js need memory)"
if [[ "$(swapon --show | wc -l)" -eq 0 ]]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Settings"
if [[ ! -f .env ]]; then
  cp .env.production.example .env
  chmod 600 .env
  set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_env DOMAIN "$DOMAIN"
  set_env ACME_EMAIL "$ACME_EMAIL"
  set_env JWT_SECRET "$(openssl rand -hex 48)"
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  echo "   .env created. Keys of channels, mail and YooKassa: edit .env, then docker compose up -d"
else
  echo "   .env exists, kept as is"
fi

echo "== Image"
IMAGE="$(grep -E '^POSTIZ_IMAGE=' .env | cut -d= -f2-)"
IMAGE="${IMAGE:-postiz-ru:latest}"
if [[ -f postiz-ru-image.tar.gz ]]; then
  gunzip -c postiz-ru-image.tar.gz | docker load
elif docker pull "$IMAGE" 2>/dev/null; then
  :
else
  echo "   building $IMAGE from $REPO ($BRANCH)"
  rm -rf /opt/gravmix-src
  git clone --depth 1 -b "$BRANCH" "$REPO" /opt/gravmix-src
  docker build -f /opt/gravmix-src/Dockerfile.dev -t "$IMAGE" /opt/gravmix-src
fi

echo "== Start"
docker compose up -d

echo "== Daily backup at 03:30"
chmod +x backup.sh restore.sh update.sh
CRON="30 3 * * * $DIR/backup.sh >> /var/log/gravmix-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "$DIR/backup.sh" ; echo "$CRON" ) | crontab -

echo
echo "Done. First start takes 2-4 minutes: https://$DOMAIN"
echo "The first account registered becomes the service owner."
echo "Status: docker compose ps     Logs: docker compose logs -f postiz"
