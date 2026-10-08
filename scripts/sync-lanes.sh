#!/usr/bin/env bash
# scripts/sync-lanes.sh — 同步上游三大车道 Wasm 资源并构建单页面静态交付产物
# 车道包括：wasm32-final, master, IllegalPerformance
# 绝对守则：纯客户端交付、单页面应用 (dist/)、静态 gzip -9 预压缩、不向仓外写入任何文件
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="/mnt/hdd/zcode-projects/Octave-Full-Wasm"
BUILD_DIR="/mnt/hdd/octave-wasm-build"

echo "=========================================================="
echo "==> [1/4] 同步公共 Embed 胶水至 public/bridge..."
echo "=========================================================="
bash "${REPO_ROOT}/scripts/sync-bridge.sh" "${BUILD_DIR}/site-illegalperf"

echo "=========================================================="
echo "==> [2/4] 同步三大车道二进制至 public/lanes/<lane>..."
echo "=========================================================="
LANES=("wasm32-final" "master" "IllegalPerformance")

for LANE in "${LANES[@]}"; do
  LANE_DIR="${REPO_ROOT}/public/lanes/${LANE}"
  echo "    --> 同步车道: ${LANE} -> ${LANE_DIR}"
  mkdir -p "${LANE_DIR}"

  if [ "${LANE}" = "IllegalPerformance" ] && [ -d "${BUILD_DIR}/site-illegalperf" ]; then
    # 从预编译目录同步
    cp -rf "${BUILD_DIR}/site-illegalperf/"* "${LANE_DIR}/"
  elif [ -d "${UPSTREAM_REPO}" ]; then
    # 从只读上游 Git 分支提取 (git archive)
    TMP_EXTRACT="$(mktemp -d)"
    if git -C "${UPSTREAM_REPO}" rev-parse --verify "${LANE}" >/dev/null 2>&1; then
      git -C "${UPSTREAM_REPO}" archive "${LANE}" site | tar -x -C "${TMP_EXTRACT}" || true
      if [ -d "${TMP_EXTRACT}/site" ]; then
        cp -rf "${TMP_EXTRACT}/site/"* "${LANE_DIR}/"
      fi
    fi
    rm -rf "${TMP_EXTRACT}"
  fi
done

echo "=========================================================="
echo "==> [3/4] 编译前端单页面应用至 dist/..."
echo "=========================================================="
cd "${REPO_ROOT}"
pnpm build

echo "=========================================================="
echo "==> [4/4] 生成纯静态 gzip -9 预压缩伴侣包..."
echo "=========================================================="
bash "${REPO_ROOT}/scripts/compress-static.sh" dist

echo "=========================================================="
echo "==> 单页面交付产物已生成完毕 (dist/)！"
echo "    可使用 'python3 scripts/serve.py --port 8868' 启动验证。"
echo "=========================================================="
