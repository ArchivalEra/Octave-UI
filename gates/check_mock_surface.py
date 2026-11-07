#!/usr/bin/env python3
"""mock 面收敛闸门（内容仓 097 §3 建议 → 本仓纪律）。

**纪律**：mock 只能收紧，不能放宽 —— 测试 mock 提供的 `omc_*` API 面必须是
**产物导出面（`.d.ts`）的子集**。

为什么立这条（本仓踩过两次，同一病灶）：
  · D11：WebMCP 三服务在产物里恒 undefined，但测试**每例都注入 mock** ⇒ 单测全绿产线全废；
  · D12：`omc_load_msl` 自检调 `omc_loadModel`/`omc_getVersion`，**产物里没有这两个函数**，
    但测试 mock **提供了它们** ⇒ 单测全绿、工具装成功也报失败。
两次都是「mock 比产物更宽松」⇒ 缺陷被测试面掩盖。可机器判据 = 本闸门。

**判据**：扫 `tests/**/*.ts` 里出现的 `omc_<name>` 标识符；凡在 `.d.ts` 导出清单里
**不存在**的（排除允许的非 API 出现：工具名 `omc_load_msl`、注释里的历史说明），即红。

**豁免面（写明的，不是静默）**：
  · `omc_load_msl` —— 本仓的**工具名**，不是 OM 运行时 API；
  · 行内注释 / 块注释里出现的名字**不豁免**（同 AGENTS.md：grep 型不变式的已知边界是
    分不清注释与代码；这里反过来，注释里写错名字也该改，所以照判）。
    唯一例外是本文件的「期望缺口清单」，见 `KNOWN_NON_API`。

用法：
  python3 zreflect/check_mock_surface.py            # 跑判据
  python3 zreflect/check_mock_surface.py --selftest # 自证三类用例
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import fatal, finish, main_selftest_or, meta, off, repo, selftest  # noqa: E402

GATE = meta(
    "check_mock_surface.py",
    "mock 面收敛闸门：测试 mock 的 omc_* API 必须是产物导出面的子集",
    knobs=(),
    name_dependent=False,
)

# 允许出现在测试里的非 API 名字（工具名，不是 OM 运行时导出）
KNOWN_NON_API = {"omc_load_msl"}

# .d.ts 路径：产物导出面的权威来源。**仓相对解析**（`repo()`）——跨仓夹具里
# 这些文件不存在是本闸门的正常状态（off，明说未查），不是红：
#   · public/omc/…：构建期镜像（CI 与本地 dist 都有）；
#   · $REFLECT_OMC_DTS：绝对路径旋钮（已登记 knobs.py），给「本机产物在别处」
#     或「夹具里想喂合成导出面」用。
DTS_CANDIDATES = ("public/omc/OpenModelicaCompiler.d.ts",)

API_REF = re.compile(r"\bomc_[A-Za-z_][A-Za-z0-9_]*\b")


def load_export_surface(dts_path):
    """从 .d.ts 抽 `export function omc_*` 名单（纯函数，自证要用）。"""
    names = set()
    try:
        with open(dts_path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                m = re.search(r"export\s+function\s+(omc_[A-Za-z_][A-Za-z0-9_]*)", line)
                if m:
                    names.add(m.group(1))
    except FileNotFoundError:
        return None
    return names


def scan_test_refs(tests_dir):
    """扫 tests/ 下所有 .ts 的 omc_* 标识符（纯函数）。返回 {名字: [文件:行]}。"""
    hits = {}
    for root, _dirs, files in os.walk(tests_dir):
        for fn in files:
            if not fn.endswith(".ts"):
                continue
            path = os.path.join(root, fn)
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    for lineno, line in enumerate(fh, 1):
                        for name in API_REF.findall(line):
                            hits.setdefault(name, []).append(f"{path}:{lineno}")
            except OSError:
                continue
    return hits


def problems(export_surface, refs, known_non_api=None):
    """判据（纯函数）：mock 引用面 ⊄ 产物导出面 ⇒ 问题清单。"""
    out = []
    if export_surface is None:
        return ["读不到产物导出面（.d.ts）—— 读不到就明说，不假装查过"]
    if not export_surface:
        return ["产物导出面是空的 —— 零值守卫：空清单下『子集』判据是空话"]
    if not refs:
        return ["测试里一个 omc_* 引用都没有 —— 零值守卫：这不是通过，是扫错了目录"]
    exempt = set(known_non_api or set())
    unknown = sorted(set(refs) - export_surface - exempt)
    for name in unknown:
        where = refs[name][0]
        out.append(
            f"测试引用了产物里不存在的 OM API `{name}`（{where}）—— "
            "mock 只能收紧不能放宽：mock 面必须是 .d.ts 导出面的子集"
        )
    return out


def run(argv):
    dts = os.environ.get("REFLECT_OMC_DTS", "")
    candidates = (dts,) if dts else DTS_CANDIDATES
    dts_path = None
    for cand in candidates:
        full = cand if os.path.isabs(cand) else repo(cand)
        if os.path.exists(full):
            dts_path = full
            break
    if not dts_path:
        # 可插拔体例（同 pins/locks）：产物导出面不在 ⇒ 本闸门**明说未查**，退 0。
        # 真仓里 public/omc/ 由 CI 镜像，所以日常这条路是通的；夹具/别的仓没有
        # OM 产物是常态，不该因此红。
        return off("mock 面收敛闸门：未找到 OM 产物 .d.ts（public/omc/ 与 $REFLECT_OMC_DTS 都没有）"
                   " ⇒ 本闸门未启用（明说未查，不假装通过）")
    export_surface = load_export_surface(dts_path)
    tests_dir = repo("tests/plugins")
    refs = scan_test_refs(tests_dir)
    probs = problems(export_surface, refs, KNOWN_NON_API)
    tail = ""
    if dts_path and export_surface:
        tail = f"；产物导出面 {len(export_surface)} 个 omc_* 函数（{os.path.basename(dts_path)}）"
    return finish(GATE, probs, f"mock 面收敛闸门：OK（测试引用 {len(refs)} 个名字全在产物面内{tail}）")


def _cases():
    """自证三类用例：正常不报 / 该报的必须报 / 空输入必须报。"""
    surface = {"omc_eval", "omc_vfs_load_zip", "omc_init"}
    return [
        # ① 正常不报：引用面是子集
        ("正常：mock 引用全在产物面内",
         lambda: problems(surface, {"omc_eval": ["a:1"], "omc_vfs_load_zip": ["b:2"]}, {"omc_load_msl"}) == []),
        # ①b 正常：工具名豁免
        ("正常：工具名 omc_load_msl 豁免",
         lambda: problems(surface, {"omc_load_msl": ["a:1"]}, {"omc_load_msl"}) == []),
        # ② 该报的必须报：引用了产物里没有的 API（D12 现场）
        ("★ 该报：引用 omc_loadModel（产物无此导出）",
         lambda: any("omc_loadModel" in p for p in problems(surface, {"omc_loadModel": ["a:1"]}, {"omc_load_msl"}))),
        # ②b 该报：omc_getVersion
        ("★ 该报：引用 omc_getVersion（产物无此导出）",
         lambda: any("omc_getVersion" in p for p in problems(surface, {"omc_getVersion": ["a:1"]}, set()))),
        # ③ 空输入必须报：导出面读不到
        ("零值守卫：导出面读不到 ⇒ 必报",
         lambda: len(problems(None, {"omc_eval": ["a:1"]}, set())) > 0),
        # ③b 空导出面
        ("零值守卫：导出面为空 ⇒ 必报",
         lambda: len(problems(set(), {"omc_eval": ["a:1"]}, set())) > 0),
        # ③c 空引用面（扫错目录）
        ("零值守卫：测试一个引用都没有 ⇒ 必报（扫描面可疑）",
         lambda: len(problems(surface, {}, set())) > 0),
    ]


if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], GATE, _cases, run))
