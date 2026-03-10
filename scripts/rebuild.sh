#!/bin/sh
set -e

cd "$(dirname "$0")/.."

CACHE_FLAG=""
if [ "$1" = "--no-cache" ]; then
  CACHE_FLAG="--no-cache"
  shift
fi

echo "Stopping existing container..."
docker compose down

echo "Rebuilding image${CACHE_FLAG:+ (no cache)}..."
docker compose build $CACHE_FLAG \
  --build-arg APT_MIRROR=mirrors.cloud.tencent.com \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com

echo "Starting container..."
docker compose up -d

echo "Done. Logs:"
docker compose logs -f
