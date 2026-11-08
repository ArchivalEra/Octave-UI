#!/bin/sh
# scripts/sync-msl.sh — 用 lockfile 里现成的 vite-node 跑 TS 消费侧脚本。
#
# 为什么不用 `npx tsx`：本仓 CI 是 `pnpm install --frozen-lockfile`，临时装的包
# 不在锁文件里，属于「每次构建靠网络临时拉一个未固定版本的工具」。
# vite-node 是 vitest 的传递依赖，已在 pnpm-lock.yaml 里、版本随 lockfile 固定；
# 只是 pnpm 不把它的 bin 暴露到 node_modules/.bin/，所以按 store 目录解析。
# 不写死版本（glob 取当前 lockfile 装到的那一份），pnpm 升级不会失效。
set -eu
REPO=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CLI=$(ls -d "$REPO"/node_modules/.pnpm/vite-node@*/node_modules/vite-node/dist/cli.mjs 2>/dev/null | head -1)
if [ -z "$CLI" ] || [ ! -f "$CLI" ]; then
  echo "FATAL: vite-node CLI not found under node_modules/.pnpm/ — run 'pnpm install --frozen-lockfile' first" >&2
  exit 2
fi
exec node "$CLI" --script "$REPO/scripts/sync-release-assets.mjs"
