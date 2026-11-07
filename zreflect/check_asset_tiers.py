#!/usr/bin/env python3
"""跨语言资产逻辑键对账器（docs/spec/unified-assets-seam.md §4 / CONTEXT.md 对账器）。

bridge 是 JS（`public/bridge/assets-loader.js` 的 TIERS 表），组合根是 TS。
设计 A（code-review）指出：两份语言各写一份判据必然漂移 —— 2026-11-06
真站 404 就是「base 两种语义」漂出来的。本闸门不替任一边生成代码，
只做**存在性核对**：TS 侧声明的键集合必须与 bridge TIERS 的键集合逐字相等，
且 tier 值一致。声称与实存对不上即报，不因工单关闭而豁免。

反向断言：删一个键 / 改一个 tier / 空输入，三样都必须红。
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import fatal, finish, main_selftest_or, meta, off, repo  # noqa: E402

NAME = "资产逻辑键跨语言对账闸门"

BRIDGE = "public/bridge/assets-loader.js"
TS_DECL = "src/modules/engine/deployment.ts"

# bridge TIERS 里的形如  'forge-catalog': { tier: 'site', path: '...' }
TIER_RE = re.compile(r"['\"]([a-z0-9-]+)['\"]\s*:\s*\{\s*tier:\s*['\"](site|lane)['\"]", re.M)
# TS 侧的声明：export const ASSET_LOGICAL_KEYS = { 'forge-catalog': 'site', ... }
TS_KEY_RE = re.compile(r"['\"]([a-z0-9-]+)['\"]\s*:\s*['\"](site|lane)['\"]", re.M)
TS_BLOCK_RE = re.compile(r"ASSET_LOGICAL_KEYS\s*=\s*\{(.*?)\}", re.S)


def parse_bridge(text):
    # 只取 TIERS 对象体，避免误匹配别处的 {tier:...}
    m = re.search(r"var\s+TIERS\s*=\s*Object\.freeze\(\{(.*?)\}\);", text, re.S)
    if not m:
        return None
    return dict(TIER_RE.findall(m.group(1)))


def parse_ts(text):
    m = TS_BLOCK_RE.search(text)
    if not m:
        return None
    return dict(TS_KEY_RE.findall(m.group(1)))


def problems_of(bridge_text, ts_text):
    b, t = parse_bridge(bridge_text), parse_ts(ts_text)
    if b is None:
        return ["bridge 侧找不到 TIERS = Object.freeze({...}) —— 判据产地消失"]
    if t is None:
        return ["TS 侧找不到 ASSET_LOGICAL_KEYS = {...} —— 判据产地消失"]
    if not b or not t:
        return ["TIERS / ASSET_LOGICAL_KEYS 为空 —— 空表不是通过（零值守卫）"]
    out = []
    for k in sorted(set(b) | set(t)):
        if k not in b:
            out.append("TS 侧多出键 %r（bridge TIERS 没有）" % k)
        elif k not in t:
            out.append("bridge TIERS 多出键 %r（TS 侧没声明）" % k)
        elif b[k] != t[k]:
            out.append("键 %r 的 tier 漂移：bridge=%s / TS=%s" % (k, b[k], t[k]))
    return out


def run(args):
    bp, tp = repo(BRIDGE), repo(TS_DECL)
    if not os.path.isfile(bp) or not os.path.isfile(tp):
        # 可拔插件：别的仓（或跨仓库夹具）没有这两份源码 ⇒ 明说未启用退 0，
        # 不把「输入不在」误报成「判据不一致」。
        return off("未启用（%s 或 %s 不存在 ⇒ 明说未启用）" % (BRIDGE, TS_DECL))
    try:
        with open(bp, encoding="utf-8") as f:
            bridge = f.read()
        with open(tp, encoding="utf-8") as f:
            ts = f.read()
    except OSError as e:
        return fatal("读不到 %s 或 %s：%s" % (BRIDGE, TS_DECL, e))
    return finish(NAME, problems_of(bridge, ts), "资产逻辑键对账：OK（%d 键逐字一致）" % len(parse_bridge(bridge) or {}))


def selftest_cases():
    good_b = """var TIERS = Object.freeze({
      'forge-catalog': { tier: 'site', path: 'assets/forge-catalog.json' },
      'engine-manifest': { tier: 'lane', path: 'assets/manifest.json' }
    });"""
    good_t = """export const ASSET_LOGICAL_KEYS = {
  'forge-catalog': 'site',
  'engine-manifest': 'lane'
} as const;"""
    return [
        ("正常不报：两边逐字一致", lambda: problems_of(good_b, good_t) == []),
        ("该报的必须报：TS 少一个键", lambda: any(
            "多出键" in p for p in problems_of(good_b, good_t.replace("  'engine-manifest': 'lane'\n", "")))),
        ("该报的必须报：tier 漂移", lambda: any(
            "tier 漂移" in p for p in problems_of(good_b, good_t.replace("'site'", "'lane'")))),
        ("该报的必须报：bridge TIERS 消失", lambda: problems_of("var x = 1;", good_t) != []),
        ("空输入必须报：空表", lambda: problems_of(
            "var TIERS = Object.freeze({});", "export const ASSET_LOGICAL_KEYS = {} as const;") != []),
        ("空输入必须报：TS 声明消失", lambda: problems_of(good_b, "export const X = 1;") != []),
    ]


GATE = meta("资产逻辑键跨语言对账闸门", "bridge TIERS 与 TS ASSET_LOGICAL_KEYS 逐字对账（防两份判据漂移）")


if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], NAME, selftest_cases, run))
