#!/usr/bin/env python3
"""统一站点资产接缝的静态锁（docs/spec/unified-assets-seam.md S1/S2/S3）。

三条判据都是「事实只有一个产地」，用静态计数 + 反向断言钉住：
  S1: src/ 里读 <meta name="site-base"> 的运行时代码点 == 1（deployment.ts）
  S2: forge-catalog.json 的 fetch 读取点 == 1（bridge assets-loader.js 的 catalog）
  S3: siteLevel / siteRoot() / withSiteBase() 在 public/bridge 代码里为 0

为什么静态锁而非只靠行为用例：2026-11-06 真站 404 就是「多一个产地」
长出来的；行为用例跑的是当前实例，静态锁防的是「下一个人又加一处」。
反向断言：故意塞第二个 meta 读取 / 塞一个 siteLevel 布尔 / 空输入，都必须红。
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import finish, main_selftest_or, meta, off, repo  # noqa: E402

NAME = "统一站点资产接缝静态锁"

SRC = "src"
BRIDGE = "public/bridge"

META_READ_RE = re.compile(r"querySelector\(['\"]meta\[name=[\"']?site-base")
CATALOG_FETCH_RE = re.compile(r"fetchJSON\(resolve\(['\"]forge-catalog['\"]\)\)")
BANNED_RE = re.compile(r"\bsiteLevel\b|\bsiteRoot\s*\(|\bwithSiteBase\s*\(")


def code_lines(text):
    """只扫代码行：注释里的解释文字（含本闸门说明）不算产地。"""
    return [l for l in text.splitlines()
            if not l.lstrip().startswith(("//", "*", "/*", "#"))]


def problems_of(files):
    """纯函数。files = {相对路径: 正文}。空字典由调用方零值守卫。"""
    out = []
    if not files:
        return ["扫描面为空 —— 不是通过（零值守卫）"]
    src_files = {p: t for p, t in files.items() if p.startswith(SRC + "/")}
    bridge_files = {p: t for p, t in files.items() if p.startswith(BRIDGE + "/")}
    if not src_files or not bridge_files:
        return ["src/ 或 public/bridge/ 扫描面缺失 —— 不是通过"]

    meta_reads = []
    for p, t in src_files.items():
        for i, l in enumerate(code_lines(t), 1):
            if META_READ_RE.search(l):
                meta_reads.append("%s:%d" % (p, i))
    if len(meta_reads) != 1:
        out.append("S1：site-base 运行时读取点 = %d（应为 1，仅 deployment.ts）：%s"
                   % (len(meta_reads), ", ".join(meta_reads) or "无"))

    catalog_reads = []
    for p, t in bridge_files.items():
        for i, l in enumerate(code_lines(t), 1):
            if CATALOG_FETCH_RE.search(l):
                catalog_reads.append("%s:%d" % (p, i))
    if len(catalog_reads) != 1:
        out.append("S2：forge-catalog 的 fetch 读取点 = %d（应为 1）：%s"
                   % (len(catalog_reads), ", ".join(catalog_reads) or "无"))

    for p, t in bridge_files.items():
        for i, l in enumerate(code_lines(t), 1):
            if BANNED_RE.search(l):
                out.append("S3：%s:%d 出现已废弃的 siteLevel/siteRoot/withSiteBase：%s"
                           % (p, i, l.strip()[:90]))
    return out


def collect():
    out = {}
    for root in (SRC, BRIDGE):
        for dirpath, _, names in os.walk(repo(root)):
            for n in names:
                if not n.endswith((".ts", ".js", ".mjs", ".svelte")):
                    continue
                p = os.path.join(dirpath, n)
                with open(p, encoding="utf-8", errors="replace") as f:
                    out[os.path.relpath(p, repo())] = f.read()
    return out


def run(args):
    files = collect()
    if not files:
        # 可拔插件：别的仓（或跨仓库夹具）没有 src/ + public/bridge/ ⇒
        # 明说未启用退 0，不把「输入不在」误报成「判据不一致」。
        return off("未启用（src/ 或 public/bridge/ 扫描面为空 ⇒ 明说未启用）")
    return finish(NAME, problems_of(files), "统一接缝静态锁：OK（S1/S2/S3 三个产地各 1）")


def selftest_cases():
    def base_files():
        return {
            "src/modules/engine/deployment.ts":
                "const c = document.querySelector('meta[name=\"site-base\"]');\n",
            "src/other.ts": "export const x = 1;\n",
            "public/bridge/assets-loader.js":
                "return fetchJSON(resolve('forge-catalog'));\n",
            "public/bridge/other.js": "var x = 1;\n",
        }
    good = base_files()

    dirty_meta = base_files()
    dirty_meta["src/other.ts"] += "document.querySelector('meta[name=\"site-base\"]');\n"

    dirty_banned = base_files()
    dirty_banned["public/bridge/other.js"] += "function f(url, siteLevel) { return withSiteBase(url); }\n"

    no_catalog = base_files()
    no_catalog["public/bridge/assets-loader.js"] = "var x = 1;\n"

    return [
        ("正常不报：三个产地各 1", lambda: problems_of(good) == []),
        ("该报的必须报：加第二处 meta 读取", lambda: any("S1" in p for p in problems_of(dirty_meta))),
        ("该报的必须报：siteLevel 回潮", lambda: any("S3" in p for p in problems_of(dirty_banned))),
        ("该报的必须报：catalog 读者消失", lambda: any("S2" in p for p in problems_of(no_catalog))),
        ("空输入必须报：空扫描面", lambda: problems_of({}) != []),
        ("空输入必须报：缺 bridge 扫描面", lambda: problems_of({"src/a.ts": "x=1;\n"}) != []),
    ]


GATE = meta("统一站点资产接缝静态锁", "S1/S2/S3：site-base、forge-catalog、tier 判据各只有一个产地")

if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], NAME, selftest_cases, run))
