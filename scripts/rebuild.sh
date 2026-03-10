#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Stopping existing container..."
docker compose down

echo "Rebuilding image (no cache, Tencent mirror)..."
docker compose build --no-cache \
  --build-arg APT_MIRROR=mirrors.cloud.tencent.com \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com

echo "Starting container..."
docker compose up -d

echo "Done. Logs:"
docker compose logs -f
