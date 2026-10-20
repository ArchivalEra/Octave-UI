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

  if [ -f "${UPSTREAM_REPO}/site/assets/m/plotbridge.js" ]; then
    mkdir -p "${LANE_DIR}/assets/m"
    cp -f "${UPSTREAM_REPO}/site/assets/m/plotbridge.js" "${LANE_DIR}/assets/m/plotbridge.js"
  fi
done

# 同步 w64 最新多线程二进制
if [ -d "${BUILD_DIR}/site/w64" ]; then
  echo "    --> 同步 w64 多线程二进制至 master/w64 与 IllegalPerformance/w64"
  mkdir -p "${REPO_ROOT}/public/lanes/master/w64" "${REPO_ROOT}/public/lanes/IllegalPerformance/w64"
  cp -rf "${BUILD_DIR}/site/w64/"* "${REPO_ROOT}/public/lanes/master/w64/"
  cp -rf "${BUILD_DIR}/site/w64/"* "${REPO_ROOT}/public/lanes/IllegalPerformance/w64/"
fi

# 同步 OpenModelica 引擎二进制
if [ -d "/mnt/hdd/openmodelica-wasm-build/site-omc/omc" ]; then
  echo "    --> 同步 OpenModelica 二进制至 public/omc"
  mkdir -p "${REPO_ROOT}/public/omc"
  cp -rf "/mnt/hdd/openmodelica-wasm-build/site-omc/omc/"* "${REPO_ROOT}/public/omc/"
fi

# 同步包管理器 catalog 与 forge tarball
if [ -f "${BUILD_DIR}/site/assets/forge-catalog.json" ]; then
  echo "    --> 同步 forge-catalog.json 与 tarballs"
  mkdir -p "${REPO_ROOT}/public/assets/forge"
  cp -f "${BUILD_DIR}/site/assets/forge-catalog.json" "${REPO_ROOT}/public/assets/forge-catalog.json"
  if [ -d "${BUILD_DIR}/site/assets/forge" ]; then
    cp -rf "${BUILD_DIR}/site/assets/forge/"* "${REPO_ROOT}/public/assets/forge/"
  fi
fi

# 同步 pyodide 与 runtimes 能力层资产
if [ -d "${BUILD_DIR}/site/assets/pyodide" ]; then
  echo "    --> 同步 pyodide 能力层资产"
  mkdir -p "${REPO_ROOT}/public/assets/pyodide"
  cp -rf "${BUILD_DIR}/site/assets/pyodide/"* "${REPO_ROOT}/public/assets/pyodide/"
fi
if [ -d "${BUILD_DIR}/site/assets/llvm" ]; then
  echo "    --> 同步 llvm 编译器能力层资产"
  mkdir -p "${REPO_ROOT}/public/assets/llvm"
  cp -rf "${BUILD_DIR}/site/assets/llvm/"* "${REPO_ROOT}/public/assets/llvm/"
fi
if [ -d "${BUILD_DIR}/site/assets/octinc" ]; then
  echo "    --> 同步 octinc 编译器头文件资产"
  mkdir -p "${REPO_ROOT}/public/assets/octinc"
  cp -rf "${BUILD_DIR}/site/assets/octinc/"* "${REPO_ROOT}/public/assets/octinc/"
fi
if [ -f "${BUILD_DIR}/site/assets/pkg-module-table.json" ]; then
  echo "    --> 同步 pkg-module-table.json"
  cp -f "${BUILD_DIR}/site/assets/pkg-module-table.json" "${REPO_ROOT}/public/assets/"
fi

# 同步上游 bridge 最新胶水与编译 worker
bash "${REPO_ROOT}/scripts/sync-bridge.sh" "${BUILD_DIR}/site"

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
