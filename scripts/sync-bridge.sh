#!/usr/bin/env bash
# scripts/sync-bridge.sh — 同步上游 Embed API 胶水与 Wasm 产物至 public/
set -euo pipefail

SRC_DIR="${1:-/mnt/hdd/octave-wasm-build/site}"
UPSTREAM_REPO="/mnt/hdd/zcode-projects/Octave-Full-Wasm"
UPSTREAM_BRIDGE="${UPSTREAM_REPO}/bridge"
DEST_BRIDGE="public/bridge"

TMP_EXTRACT=""
if [ ! -d "${SRC_DIR}" ] && [ -d "${UPSTREAM_REPO}" ]; then
  echo "    ${SRC_DIR} not found; falling back to git archive IllegalPerformance site (read-only)..."
  TMP_EXTRACT="$(mktemp -d)"
  git -C "${UPSTREAM_REPO}" archive IllegalPerformance site | tar -x -C "${TMP_EXTRACT}"
  SRC_DIR="${TMP_EXTRACT}/site"
fi

echo "==> Syncing bridge assets from ${SRC_DIR}..."

mkdir -p "${DEST_BRIDGE}"
mkdir -p "public"

# 1. 同步公共胶水 JS 与 Worker / 编排 MJS
BRIDGE_FILES=(
  assets-loader.js compile-worker.mjs multi-tu.mjs queue.js p5canvas.js
  webaudio.js webaudiorec.js webfilepick.js webnet.js octave-embed.js
  lane.js lanes.js octave-worker.js
)

for f in "${BRIDGE_FILES[@]}"; do
  if [ -d "${UPSTREAM_BRIDGE}" ] && [ -f "${UPSTREAM_BRIDGE}/${f}" ]; then
    cp -f "${UPSTREAM_BRIDGE}/${f}" "${DEST_BRIDGE}/"
  elif [ -d "${SRC_DIR}" ] && [ -f "${SRC_DIR}/${f}" ]; then
    cp -f "${SRC_DIR}/${f}" "${DEST_BRIDGE}/"
  fi
done

# 锁定桥接文件 (octave-core.js, octave-page.js) 受 upstream-lock.json 指纹保护：仅在缺失时补填
for f in octave-core.js octave-page.js; do
  if [ ! -f "${DEST_BRIDGE}/${f}" ]; then
    if [ -d "${UPSTREAM_BRIDGE}" ] && [ -f "${UPSTREAM_BRIDGE}/${f}" ]; then
      cp -f "${UPSTREAM_BRIDGE}/${f}" "${DEST_BRIDGE}/"
    fi
  fi
done

# 2. 同步 w64 档产物（若已存在受锁定的 octave.wasm 则保留）
if [ -d "${SRC_DIR}/w64" ] && [ ! -f "${DEST_BRIDGE}/w64/octave.wasm" ]; then
  mkdir -p "${DEST_BRIDGE}/w64"
  cp -rf "${SRC_DIR}/w64/"* "${DEST_BRIDGE}/w64/"
fi

# 3. 同步 assets 目录（含 plotbridge.js、octinc、pkg-module-table 等资产）
if [ -d "${SRC_DIR}/assets" ]; then
  mkdir -p "${DEST_BRIDGE}/assets" "public/assets"
  cp -rf "${SRC_DIR}/assets/"* "${DEST_BRIDGE}/assets/"
  cp -rf "${SRC_DIR}/assets/"* "public/assets/"
fi
if [ -d "${UPSTREAM_REPO}/site/assets/octinc" ]; then
  mkdir -p "${DEST_BRIDGE}/assets/octinc" "public/assets/octinc"
  cp -rf "${UPSTREAM_REPO}/site/assets/octinc/"* "${DEST_BRIDGE}/assets/octinc/"
  cp -rf "${UPSTREAM_REPO}/site/assets/octinc/"* "public/assets/octinc/"
fi
if [ -f "${UPSTREAM_REPO}/site/assets/m/plotbridge.js" ]; then
  mkdir -p "${DEST_BRIDGE}/assets/m" "public/assets/m"
  cp -f "${UPSTREAM_REPO}/site/assets/m/plotbridge.js" "${DEST_BRIDGE}/assets/m/plotbridge.js"
  cp -f "${UPSTREAM_REPO}/site/assets/m/plotbridge.js" "public/assets/m/plotbridge.js"
fi

# 4. 同步 embed-demo.html 及根目录平级快捷访问（适配 probe-embed-inventory 验收探针）
if [ -f "${SRC_DIR}/embed-demo.html" ]; then
  cp -f "${SRC_DIR}/embed-demo.html" "${DEST_BRIDGE}/embed-demo.html"
  cp -f "${SRC_DIR}/embed-demo.html" "public/embed-demo.html"
elif [ -f "${UPSTREAM_BRIDGE}/embed-demo.html" ]; then
  cp -f "${UPSTREAM_BRIDGE}/embed-demo.html" "${DEST_BRIDGE}/embed-demo.html"
  cp -f "${UPSTREAM_BRIDGE}/embed-demo.html" "public/embed-demo.html"
fi

# 根目录平级链接，使 embed-demo.html 与 Worker 根路径直接命中资源
for js in "${DEST_BRIDGE}"/*.js "${DEST_BRIDGE}"/*.mjs; do
  [ -f "${js}" ] || continue
  base_name="$(basename "${js}")"
  rm -f "public/${base_name}"
  ln -sf "bridge/${base_name}" "public/${base_name}"
done

if [ -d "${DEST_BRIDGE}/w64" ]; then
  ln -sfn "bridge/w64" "public/w64"
fi

if [ -d "${DEST_BRIDGE}/assets" ]; then
  ln -sfn "bridge/assets" "public/assets"
fi

if [ -n "${TMP_EXTRACT}" ] && [ -d "${TMP_EXTRACT}" ]; then
  rm -rf "${TMP_EXTRACT}"
fi

echo "==> Bridge assets synced successfully to ${DEST_BRIDGE} and public/."
