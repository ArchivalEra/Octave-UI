#!/usr/bin/env python3
"""验收脚本不许自造渔具（docs/spec/unified-assets-seam.md §2.4 / S4）。

2026-11-06 code-review 双轴 + codebase-design 清点发现：验收路径、用户真实路径、
MCP 端点三者正交，验收脚本自己 `createOctaveAssets(null, laneBase)` 造实例、
用 `__catalogSource` 喂合成货架、把 `/repo/Octave/lanes/` 写死在脚本里
⇒ 验的是工厂函数，不是产品路径，于是「验收全绿而真站编译链 FAIL」。

本闸门扫 `HARNESS_DIR`（默认 /mnt/hdd/zcode-test/harness）下**未标退役**的
`*.mjs`，禁止四类手搓形状。退役/历史脚本以文件头 `// ⚠️ 退役` 显式豁免
（保留 11-05 探索留痕，但不作为验收证据）。

反向断言：故意塞一行手搓 base 必须报；空输入（目录不存在/无 mjs）必须报。
"""
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import finish, main_selftest_or, meta, selftest  # noqa: E402

NAME = "验收脚本无手搓 base / 自造实例闸门"

# 禁止形状（只扫代码行；注释里的解释文字不算）
BANNED = [
    (re.compile(r"\bcreateOctaveAssets\s*\("), "手工构造 createOctaveAssets 实例"),
    (re.compile(r"__catalogSource"), "使用已移除的内部注入面 __catalogSource"),
    (re.compile(r"__siteBase\s*=(?!=)"), "写 __siteBase 覆盖部署产地"),
    (re.compile(r"__resolveOctaveDeployment\s*=(?!=)"), "写组合根注入函数 __resolveOctaveDeployment"),
    (re.compile(r"\.OctaveAssets\.resolve\s*\("), "调只读对账面 OctaveAssets.resolve（验收只能点按钮/调 callTool）"),
    (re.compile(r"['\"]/repo/Octave/lanes/"), "硬编码 /repo/Octave/lanes/ 字面量"),
]
RETIRED_RE = re.compile(r"^\s*//\s*⚠️\s*退役")


def problems_of(files):
    """纯函数：返回问题行清单。空清单 = 干净（由调用方做零值守卫）。"""
    out = []
    for path in files:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()
        if lines and RETIRED_RE.match(lines[0]):
            continue  # 显式退役的历史脚本
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue  # 注释里的解释（例如本闸门的说明）不算代码
            for rx, why in BANNED:
                if rx.search(line):
                    out.append("%s:%d %s：%s" % (
                        os.path.basename(path), i, why, stripped[:100]))
    return out


def collect(harness_dir):
    return sorted(glob.glob(os.path.join(harness_dir, "*.mjs")))


def run(args):
    harness = os.environ.get("REFLECT_HARNESS_DIR") or "/mnt/hdd/zcode-test/harness"
    files = collect(harness)
    if not files:
        # 零值守卫：目录不存在 / 无 mjs ⇒ 不许当「干净」
        return finish(NAME, ["REFLECT_HARNESS_DIR=%s 下没有 *.mjs —— 空输入不是通过" % harness], "OK")
    problems = problems_of(files)
    return finish(NAME, problems, "验收脚本闸门：OK（%d 个脚本，无手搓 base / 自造实例）" % len(files))


def run_quiet(harness):
    """自证用：与 run() 同判据但不打印（AGENTS 纪律：纯函数/自证期间安静）。"""
    files = collect(harness)
    return bool(files) and not problems_of(files)


def selftest_cases():
    import tempfile

    def make(files):
        d = tempfile.mkdtemp(prefix="handbase-selftest-")
        for name, body in files.items():
            with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                f.write(body)
        return d

    clean = make({"probe-clean.mjs": "await page.click('[data-action=\"install\"]');\n"})
    dirty = make({"probe-dirty.mjs": "const a = window.createOctaveAssets(null, '/repo/Octave/lanes/wasm32-final/', ()=>false);\n"})
    retired = make({"probe-retired.mjs": "// ⚠️ 退役/历史诊断脚本\nconst a = window.createOctaveAssets(null, 'x', ()=>false);\n"})
    empty = tempfile.mkdtemp(prefix="handbase-empty-")

    return [
        ("正常不报：干净脚本", lambda: problems_of(collect(clean)) == [] and run_quiet(clean) is True),
        ("该报的必须报：手搓实例 + 硬编码 lane 字面量", lambda: len(problems_of(collect(dirty))) >= 2),
        ("该报的必须报：__catalogSource 内部注入", lambda: any(
            "__catalogSource" in p for p in problems_of(
                collect(make({"x.mjs": "a.__catalogSource(() => market);\n"}))))),
        ("显式退役脚本豁免", lambda: problems_of(collect(retired)) == []),
        ("该报的必须报：调只读对账面 / 写组合根注入函数", lambda: len(problems_of(collect(
            make({"x.mjs": "window.OctaveAssets.resolve('forge-catalog');\nwindow.__resolveOctaveDeployment = () => 1;\n"})))) >= 2),
        ("空输入必须报：无 mjs 目录 ⇒ 不绿", lambda: run_quiet(empty) is False),
        ("空输入必须报：目录不存在 ⇒ 不绿", lambda: run_quiet("/nonexistent/harness/xyz") is False),
    ]


GATE = meta("验收脚本无手搓 base / 自造实例闸门", "验收脚本不得自造 createOctaveAssets / __catalogSource / 手搓 lane base",
         knobs=("REFLECT_HARNESS_DIR",))


if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], NAME, selftest_cases, run))
