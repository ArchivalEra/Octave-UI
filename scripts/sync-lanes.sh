#!/usr/bin/env bash
# scripts/sync-lanes.sh — 同步上游三大车道并生成本仓纯静态部署产物
# 车道包括：wasm32-final, master, IllegalPerformance
# 绝对守则：纯客户端交付、静态 gzip -9 预压缩、不向仓外写入任何文件
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="/mnt/hdd/zcode-projects/Octave-Full-Wasm"
BUILD_DIR="/mnt/hdd/octave-wasm-build"

echo "=========================================================="
echo "==> [1/4] Syncing public/bridge with active line (IllegalPerformance)..."
echo "=========================================================="
bash scripts/sync-bridge.sh "${BUILD_DIR}/site-illegalperf"

echo "=========================================================="
echo "==> [2/4] Ensuring frontend build is up to date in dist/..."
echo "=========================================================="
pnpm build
bash scripts/compress-static.sh dist

LANES=("wasm32-final" "master" "IllegalPerformance")

for LANE in "${LANES[@]}"; do
  TARGET="${REPO_ROOT}/${LANE}"
  echo "----------------------------------------------------------"
  echo "==> [3/4] Assembling deployment package for lane: ${LANE} -> ${TARGET}..."
  echo "----------------------------------------------------------"

  rm -rf "${TARGET}"
  mkdir -p "${TARGET}/bridge"
  mkdir -p "${TARGET}/w64"
  mkdir -p "${TARGET}/assets"

  # 1. 复制通用前端 UI 产物并注入车道元数据
  sed -e "s|<title>GNU Octave 11.3.0 WebAssembly UI</title>|<title>GNU Octave 11.3.0 UI [${LANE}]</title><script>window.__octaveLaneName = '${LANE}';</script>|g" \
      "${REPO_ROOT}/dist/index.html" > "${TARGET}/index.html"
  cp -rf "${REPO_ROOT}/dist/_astro" "${TARGET}/"
  cp -f "${REPO_ROOT}/dist/favicon.svg" "${TARGET}/"

  # 2. 按车道提取上游引擎与胶水文件
  TMP_LANE_DIR=$(mktemp -d)
  if [ "${LANE}" = "IllegalPerformance" ] && [ -d "${BUILD_DIR}/site-illegalperf" ]; then
    echo "    Using pre-built site-illegalperf directory..."
    cp -rf "${BUILD_DIR}/site-illegalperf/"* "${TMP_LANE_DIR}/"
  else
    echo "    Extracting site from git ${LANE} (read-only)..."
    git -C "${UPSTREAM_REPO}" archive "${LANE}" site | tar -x -C "${TMP_LANE_DIR}"
    if [ -d "${TMP_LANE_DIR}/site" ]; then
      cp -rf "${TMP_LANE_DIR}/site/"* "${TMP_LANE_DIR}/"
      rm -rf "${TMP_LANE_DIR}/site"
    fi
  fi

  # 3. 部署 w64 / assets / threads / w64-base 等子目录
  if [ -d "${TMP_LANE_DIR}/w64" ]; then
    cp -rf "${TMP_LANE_DIR}/w64/"* "${TARGET}/w64/"
  fi

  if [ -d "${TMP_LANE_DIR}/assets" ]; then
    cp -rf "${TMP_LANE_DIR}/assets/"* "${TARGET}/assets/"
  fi

  if [ -d "${TMP_LANE_DIR}/threads" ]; then
    mkdir -p "${TARGET}/threads"
    cp -rf "${TMP_LANE_DIR}/threads/"* "${TARGET}/threads/"
  fi

  if [ -d "${TMP_LANE_DIR}/w64-base" ]; then
    mkdir -p "${TARGET}/w64-base"
    cp -rf "${TMP_LANE_DIR}/w64-base/"* "${TARGET}/w64-base/"
  fi

  # 基础档 wasm/js/data（若有）
  for basef in octave.wasm octave.js octave.data octave.build.json VERSION; do
    if [ -f "${TMP_LANE_DIR}/${basef}" ]; then
      cp -f "${TMP_LANE_DIR}/${basef}" "${TARGET}/"
    fi
  done

  # 车道专属标记
  if [ -f "${TMP_LANE_DIR}/SITE-ILLEGALPERF.json" ]; then
    cp -f "${TMP_LANE_DIR}/SITE-ILLEGALPERF.json" "${TARGET}/"
  fi
  if [ -f "${TMP_LANE_DIR}/.illegalperf-commit" ]; then
    cp -f "${TMP_LANE_DIR}/.illegalperf-commit" "${TARGET}/"
  fi

  # 4. 组装 bridge 胶水层（公共 JS + Embed API + demo）
  for js in assets-loader.js queue.js p5canvas.js webaudio.js webaudiorec.js webfilepick.js webnet.js octave-core.js octave-worker.js lane.js lanes.js; do
    if [ -f "${TMP_LANE_DIR}/${js}" ]; then
      cp -f "${TMP_LANE_DIR}/${js}" "${TARGET}/bridge/"
      cp -f "${TMP_LANE_DIR}/${js}" "${TARGET}/"
    elif [ -f "${REPO_ROOT}/public/bridge/${js}" ]; then
      cp -f "${REPO_ROOT}/public/bridge/${js}" "${TARGET}/bridge/"
      cp -f "${REPO_ROOT}/public/bridge/${js}" "${TARGET}/"
    fi
  done

  # Embed API 核心胶水（octave-embed.js, octave-page.js, embed-demo.html）
  for embedf in octave-embed.js octave-page.js embed-demo.html; do
    if [ -f "${TMP_LANE_DIR}/${embedf}" ]; then
      cp -f "${TMP_LANE_DIR}/${embedf}" "${TARGET}/bridge/"
      cp -f "${TMP_LANE_DIR}/${embedf}" "${TARGET}/"
    elif [ -f "${REPO_ROOT}/public/bridge/${embedf}" ]; then
      cp -f "${REPO_ROOT}/public/bridge/${embedf}" "${TARGET}/bridge/"
      cp -f "${REPO_ROOT}/public/bridge/${embedf}" "${TARGET}/"
    elif [ -f "${UPSTREAM_REPO}/bridge/${embedf}" ]; then
      cp -f "${UPSTREAM_REPO}/bridge/${embedf}" "${TARGET}/bridge/"
      cp -f "${UPSTREAM_REPO}/bridge/${embedf}" "${TARGET}/"
    fi
  done

  # 5. 在 bridge/ 下建相对链接指向同级子目录，确保无论是 /bridge/w64 还是 /w64 均可直达
  (
    cd "${TARGET}/bridge"
    ln -sfn ../w64 w64
    ln -sfn ../assets assets
    [ -d "../threads" ] && ln -sfn ../threads threads || true
    [ -d "../w64-base" ] && ln -sfn ../w64-base w64-base || true
  )

  rm -rf "${TMP_LANE_DIR}"

  # 6. 执行全量静态 gzip -9 预压缩
  echo "    Pre-compressing all static assets in ${TARGET} with gzip -9..."
  bash "${REPO_ROOT}/scripts/compress-static.sh" "${TARGET}"
  echo "    Lane ${LANE} built successfully in ${TARGET}."
done

echo "=========================================================="
echo "==> [4/4] Verifying lane Wasm artifacts hashes..."
echo "=========================================================="
for LANE in "${LANES[@]}"; do
  WASM_PATH="${REPO_ROOT}/${LANE}/w64/octave.wasm"
  if [ -f "${WASM_PATH}" ]; then
    SHA=$(sha256sum "${WASM_PATH}" | awk '{print $1}')
    echo "    Lane ${LANE} (w64): ${SHA} (${WASM_PATH})"
  else
    echo "    WARNING: ${WASM_PATH} not found!"
  fi

  BASE_WASM="${REPO_ROOT}/${LANE}/octave.wasm"
  if [ -f "${BASE_WASM}" ]; then
    BASE_SHA=$(sha256sum "${BASE_WASM}" | awk '{print $1}')
    echo "    Lane ${LANE} (base wasm32): ${BASE_SHA} (${BASE_WASM})"
  fi
done

echo "==> All 3 lanes built and synchronized successfully within repository!"
