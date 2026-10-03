#!/bin/sh
# scripts/compress-static.sh — 对 dist/ 下所有静态产物执行 gzip -9 预压缩（兼容 POSIX sh / dash）
set -eu

TARGET_DIR="${1:-dist}"

if [ ! -d "${TARGET_DIR}" ]; then
  echo "Error: Directory ${TARGET_DIR} not found. Run 'pnpm build' first." >&2
  exit 1
fi

echo "==> Pre-compressing static files in ${TARGET_DIR} with gzip -9..."

find "${TARGET_DIR}" -type f \( \
  -name "*.html" -o \
  -name "*.js" -o \
  -name "*.mjs" -o \
  -name "*.css" -o \
  -name "*.wasm" -o \
  -name "*.data" -o \
  -name "*.json" -o \
  -name "*.svg" -o \
  -name "*.txt" -o \
  -name "*.map" \
\) | while IFS= read -r file; do
  gzip -k -9 --force "${file}"
done

echo "==> Successfully compressed static assets in ${TARGET_DIR}."
