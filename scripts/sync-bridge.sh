#!/usr/bin/env bash
# scripts/sync-bridge.sh — 同步上游 Embed API 胶水与 Wasm 产物至 public/
set -euo pipefail

SRC_DIR="${1:-/mnt/hdd/octave-wasm-build/site-w64-embed}"
UPSTREAM_BRIDGE="/mnt/hdd/zcode-projects/Octave-Full-Wasm/bridge"
DEST_BRIDGE="public/bridge"

echo "==> Syncing bridge assets from ${SRC_DIR}..."

mkdir -p "${DEST_BRIDGE}"
mkdir -p "public"

# 1. 同步公共胶水 JS
if [ -d "${SRC_DIR}" ]; then
  for f in assets-loader.js queue.js p5canvas.js webaudio.js webaudiorec.js webfilepick.js webnet.js octave-core.js octave-page.js octave-embed.js lane.js lanes.js octave-worker.js; do
    if [ -f "${SRC_DIR}/${f}" ]; then
      cp -f "${SRC_DIR}/${f}" "${DEST_BRIDGE}/"
    elif [ -f "${UPSTREAM_BRIDGE}/${f}" ]; then
      cp -f "${UPSTREAM_BRIDGE}/${f}" "${DEST_BRIDGE}/"
    fi
  done
elif [ -d "${UPSTREAM_BRIDGE}" ]; then
  cp -f "${UPSTREAM_BRIDGE}"/*.js "${DEST_BRIDGE}/"
fi

# 2. 同步 w64 档产物
if [ -d "${SRC_DIR}/w64" ]; then
  mkdir -p "${DEST_BRIDGE}/w64"
  cp -rf "${SRC_DIR}/w64/"* "${DEST_BRIDGE}/w64/"
fi

# 3. 同步 assets 目录（若有清单）
if [ -d "${SRC_DIR}/assets" ]; then
  mkdir -p "${DEST_BRIDGE}/assets"
  cp -rf "${SRC_DIR}/assets/"* "${DEST_BRIDGE}/assets/"
fi

# 4. 同步 embed-demo.html 及根目录平级快捷访问（适配 probe-embed-inventory 验收探针）
if [ -f "${SRC_DIR}/embed-demo.html" ]; then
  cp -f "${SRC_DIR}/embed-demo.html" "${DEST_BRIDGE}/embed-demo.html"
  cp -f "${SRC_DIR}/embed-demo.html" "public/embed-demo.html"
elif [ -f "${UPSTREAM_BRIDGE}/embed-demo.html" ]; then
  cp -f "${UPSTREAM_BRIDGE}/embed-demo.html" "${DEST_BRIDGE}/embed-demo.html"
  cp -f "${UPSTREAM_BRIDGE}/embed-demo.html" "public/embed-demo.html"
fi

# 根目录平级链接，使 embed-demo.html 与根路径直接命中资源
for js in "${DEST_BRIDGE}"/*.js; do
  [ -f "${js}" ] || continue
  base_name="$(basename "${js}")"
  ln -sf "bridge/${base_name}" "public/${base_name}"
done

if [ -d "${DEST_BRIDGE}/w64" ]; then
  ln -sfn "bridge/w64" "public/w64"
fi

if [ -d "${DEST_BRIDGE}/assets" ]; then
  ln -sfn "bridge/assets" "public/assets"
fi

echo "==> Bridge assets synced successfully to ${DEST_BRIDGE} and public/."
