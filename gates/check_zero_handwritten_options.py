#!/usr/bin/env python3
"""市场零手写选项闸门（2026-11-07 市场/OPFS 彻底重写）。

与 `check_asset_tiers.py` 同构：那份对账两份**声明**（bridge TIERS ↔ TS
ASSET_LOGICAL_KEYS），这份对账「一个事实」——**选项值的唯一产地 =
契约投影层 `projectContract().facets`**。手写枚举 / 联合闭集 / pill 字面量 /
`includes('llvm')` 之类的硬编码，全都让市场与契约分叉（用户原话「整个市场
不能有任何手写选项」）。

判据（扫代码行，注释里的解释文字不算）：
  1. 产地声明面：`src/modules/contract/projection.ts` 的 `OPTION_AXES` 非空，
     且每轴 source ∈ {content, distribution, engine}；
  2. 从 `public/assets/forge-catalog.json` 实测派生每轴的**值集合**（distinct）；
  3. 扫发现式目录（glob，不手写清单）的市场消费面代码行：值若以字符串
     字面量出现在「选项位置」（enum / 类型联合 / `===` / `!==` / `includes` /
     data-* pill）⇒ 红；
  4. 正向对账：市场代码里契约字段名只能经 `readProjection()` / `facets`
     消费（产地计数 >= 1）；`src/modules/contract/projection.ts` 自己不许出现
     任何实测值字面量。

反向断言：旧 `enum: ['all','octave','omc']` 回潮、`kind:'runtime'` 回潮、
`name.includes('llvm')` 回潮、删一个 OPTION_AXES 轴、改一个轴 source、
空 OPTION_AXES / 空契约 / 空扫描面 —— 全部必须红。

发现式名录自动吃到（GATE = meta(...)）；`--selftest` 三类用例齐
（正常不报 / 该报的必须报 / 空输入必须报），纯函数安静，机器行收尾。
"""
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import fatal, finish, main_selftest_or, meta, off, repo  # noqa: E402

NAME = "市场零手写选项闸门"

PROJECTION = "src/modules/contract/projection.ts"
CATALOG = "public/assets/forge-catalog.json"
# 市场消费面：发现式 glob，不手写清单（AGENTS：手写名录会漂）。
CONSUMER_GLOBS = (
    "src/components/PackageManagerModal.svelte",
    "src/modules/plugins/package/*.ts",
    "src/modules/plugins/webmcp/tools/*.ts",
    "src/modules/market/*.ts",
)

# 契约字段名 → 投影轴名（与 OPTION_AXES 对账；值不在此硬编码）。
AXIS_FIELD = {
    "consumer": "consumer",
    "form": "form",
    "stage": "stage",
    "role": "role",
    "contentKinds": "content",
    "targetArch": "arch",
}

AXES_RE = re.compile(
    r"OPTION_AXES\s*=\s*\{(.*?)\}\s*as\s*const", re.S)
# source 用 \w+ 捕获（漂移值也要能被看见，不能靠正则把它吞掉 —— 否则
# 「改坏 source」会伪装成「轴消失」，报的就不是那条判据）。
AXIS_PAIR_RE = re.compile(
    r"['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\s*:\s*['\"](\w+)['\"]")

# 「选项位置」= 手写枚举 / 联合 / 比较 / pill。仅这些形状算违规，普通字符串
# 参数不算（否则连错误消息里的词都会误报）。
OPTION_CONTEXT = re.compile(
    r"(?:enum\s*:|['\"][A-Za-z]+\['\"\]\s*\||\btype\s+\w+\s*=\s*['\"]|"
    r"===|!==|\.includes\s*\(|data-(?:consumer|form|stage|role)\s*=|"
    r"\bselected\w*\s*=|\bkind\s*:|\bform\s*:|\bconsumer\s*:|\bstage\s*:)")

# 明确禁止回潮的旧形状（与实存值集无关，凭形状即红）。
BANNED_SHAPES = [
    (re.compile(r"enum\s*:\s*\[[^\]]*['\"]all['\"]"), "手写 enum 含 'all' 缺省"),
    (re.compile(r"['\"](?:octave|omc|pkg|tree|w64|w32)['\"]\s*\|\s*['\"]"), "手写类型联合闭集"),
    (re.compile(r"\bkind\s*:\s*['\"]runtime['\"]"), "手写 kind:'runtime'（DownloadKind 越界形状）"),
    (re.compile(r"\.includes\(\s*['\"]llvm['\"]\s*\)"), "手写 name.includes('llvm')"),
    (re.compile(r"['\"]llvm-wasm['\"]"), "手写工具链名字面量（身份应来自契约）"),
    # 只拦「联合闭集」复活；`type X = string`（零手写值域）是合法迁移，放行。
    (re.compile(r"type\s+(?:ContentKind|DeliveryForm|ConsumerEngine|VersionStage|PackageFilter|DownloadKind)\s*=\s*['\"]"),
     "手写闭集类型复活（应由 AxisName + FacetSelection 取代）"),
]


def parse_axes(text):
    """纯函数：返回 {axis: source}；解析不到 ⇒ None。"""
    m = AXES_RE.search(text)
    if not m:
        return None
    return dict(AXIS_PAIR_RE.findall(m.group(1)))


def load_catalog_values(path):
    """纯函数：从实测契约派生 {axis: set(values)}。"""
    import json
    with open(path, encoding="utf-8") as f:
        cat = json.load(f)
    packs = cat.get("packs") or []
    axes = {k: set() for k in AXIS_FIELD}
    for p in packs:
        for axis, field in AXIS_FIELD.items():
            v = p.get(field)
            if isinstance(v, list):
                for x in v:
                    if isinstance(x, str):
                        axes[axis].add(x)
            elif isinstance(v, str):
                axes[axis].add(v)
        for cand in p.get("versions") or []:
            for axis, field in AXIS_FIELD.items():
                v = cand.get(field)
                if isinstance(v, list):
                    for x in v:
                        if isinstance(x, str):
                            axes[axis].add(x)
                elif isinstance(v, str):
                    axes[axis].add(v)
    return axes


def code_lines(text):
    """去掉注释行（//、*、/*）与围栏块外的纯说明文字。"""
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if not s or s.startswith("//") or s.startswith("*") or s.startswith("/*") or s.startswith("#"):
            continue
        out.append((i, line))
    return out


def problems_of(proj_text, catalog_values, consumer_texts, projection_text=None):
    """纯函数：返回问题行清单。空清单 = 干净（调用方做零值守卫）。"""
    out = []
    axes = parse_axes(proj_text)
    if axes is None:
        return ["找不到 OPTION_AXES = {...} as const —— 产地声明面消失"]
    if not axes:
        return ["OPTION_AXES 为空 —— 空表不是通过（零值守卫）"]
    for axis, source in axes.items():
        if source not in ("content", "distribution", "engine"):
            out.append("轴 %r 的 source=%r 不合法（漂移）" % (axis, source))
    if not any(catalog_values[k] for k in catalog_values):
        return ["契约实测值集全空 —— 空输入不是通过（零值守卫）"]
    if not consumer_texts:
        return ["市场消费面扫描为空 —— 空输入不是通过（零值守卫）"]
    # 对账（与 check_asset_tiers 的 set(b)==set(t) 同形）：契约里有实测值的
    # 每个轴都必须在 OPTION_AXES 登记 —— 删一个轴（或把它的 source 改坏）即红。
    for axis, vals in catalog_values.items():
        if vals and axis not in axes:
            out.append("契约轴 %r 有 %d 个实测值，但 OPTION_AXES 未登记 —— 产地声明面缺件" % (axis, len(vals)))

    # 产地自身不许出现实测值字面量（值只能来自输入 JSON）。
    # 豁免：`'toolchain' in p` / `'recipe' in x` 这类**契约字段名**的形状判断，
    # 不是把值当选项写死（字段名由契约 schema 给，值仍从 packs 实测）。
    if projection_text is not None:
        for i, line in code_lines(projection_text):
            if re.search(r"['\"][a-zA-Z_]+['\"]\s+in\s+\w+", line):
                continue
            for axis, values in catalog_values.items():
                for v in values:
                    if re.search(r"['\"]%s['\"]" % re.escape(v), line):
                        out.append("projection.ts:%d 出现契约实测值字面量 %r（值只能从输入投影）" % (i, v))

    # 消费面：手写形状 + 实测值出现在选项位置。
    for path, text in consumer_texts:
        for i, line in code_lines(text):
            for rx, why in BANNED_SHAPES:
                if rx.search(line):
                    out.append("%s:%d %s：%s" % (os.path.basename(path), i, why, line.strip()[:100]))
            if OPTION_CONTEXT.search(line):
                for axis, values in catalog_values.items():
                    for v in values:
                        if re.search(r"['\"]%s['\"]" % re.escape(v), line):
                            out.append("%s:%d 手写选项值 %r（轴 %s，应来自 facets）" % (
                                os.path.basename(path), i, v, axis))
    # 正向对账：至少一处市场代码真的经 readProjection()/facets 消费投影。
    joined = "\n".join(t for _, t in consumer_texts)
    if "readProjection()" not in joined and "facets" not in joined:
        out.append("市场消费面没有任何 readProjection()/facets 消费 —— 投影未接线（只声明不接线 = 能编过不能用）")
    return out


def collect(repo_root):
    """发现式：按 glob 收市场消费面代码文本。"""
    texts = []
    for g in CONSUMER_GLOBS:
        for path in sorted(glob.glob(os.path.join(repo_root, g))):
            with open(path, encoding="utf-8", errors="replace") as f:
                texts.append((path, f.read()))
    return texts


def run(args):
    pp, cp = repo(PROJECTION), repo(CATALOG)
    if not os.path.isfile(pp) or not os.path.isfile(cp):
        return off("未启用（%s 或 %s 不存在 ⇒ 明说未启用）" % (PROJECTION, CATALOG))
    try:
        with open(pp, encoding="utf-8") as f:
            proj = f.read()
        import json
        with open(cp, encoding="utf-8") as f:
            json.load(f)  # 形状校验
        values = load_catalog_values(cp)
    except (OSError, ValueError) as e:
        return fatal("读不到 %s / %s：%s" % (PROJECTION, CATALOG, e))
    texts = collect(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return finish(NAME, problems_of(proj, values, texts, proj),
                  "市场零手写选项：OK（%d 轴 / %d 消费面文件，选项全来自契约投影）" % (
                      len(parse_axes(proj) or {}), len(texts)))


def selftest_cases():
    good_axes = """export const OPTION_AXES = {
  consumer: 'content', form: 'content', stage: 'content', role: 'content',
  contentKinds: 'content', targetArch: 'content', assetClass: 'distribution',
  engineLane: 'engine', engineVariant: 'engine', codec: 'distribution',
} as const;"""
    values = {"consumer": {"octave", "omc"}, "form": {"pkg", "tree"},
              "stage": {"staged", "withheld"}, "role": {"package", "toolchain"},
              "contentKinds": {"m", "src"}, "targetArch": {"wasm32", "wasm64"}}
    good_consumer = [("market.ts", "const facets = readProjection().facets;\nfor (const f of facets) ui.pill(f.axis, f.values);\n")]
    clean_proj = "export function projectContract(facts, caps) { return Object.freeze({}); }\n"

    def with_value(line):
        return [("market.ts", line)]

    return [
        ("正常不报：投影化后的市场代码", lambda: problems_of(good_axes, values, good_consumer, clean_proj) == []),
        ("该报的必须报：旧 enum 回潮", lambda: any("手写 enum" in p for p in problems_of(
            good_axes, values, with_value("const e = args().prop('consumer','string',{enum:['all','octave','omc']});\n"), clean_proj))),
        ("该报的必须报：手写类型联合闭集", lambda: any("类型联合" in p for p in problems_of(
            good_axes, values, with_value("let x: 'octave' | 'omc' = 'octave';\n"), clean_proj))),
        ("该报的必须报：kind:'runtime' 回潮", lambda: any("runtime" in p for p in problems_of(
            good_axes, values, with_value("const ref = { kind: 'runtime', arch: null };\n"), clean_proj))),
        ("该报的必须报：name.includes('llvm') 回潮", lambda: any("includes" in p for p in problems_of(
            good_axes, values, with_value("if (name.includes('llvm')) return;\n"), clean_proj))),
        ("该报的必须报：删一个 OPTION_AXES 轴（解析器能测到存在 ⇒ 删了会红）", lambda: (
            # 自指同类肯定：先证解析器能数到 10 个轴
            parse_axes(good_axes) is not None and len(parse_axes(good_axes)) == 10 and
            # 再证删掉「契约里有实测值」的轴必红
            any("未登记" in p for p in problems_of(
                good_axes.replace("form: 'content', ", ""), values, good_consumer, clean_proj)))),
        ("该报的必须报：改一个轴 source（漂移）", lambda: any("source" in p for p in problems_of(
            good_axes.replace("form: 'content',", "form: 'bogus',"), values, good_consumer, clean_proj))),
        ("该报的必须报：投影层自己出现实测值字面量", lambda: any("实测值字面量" in p for p in problems_of(
            good_axes, values, good_consumer, "const x = 'octave';\n"))),
        ("该报的必须报：投影未接线", lambda: any("未接线" in p for p in problems_of(
            good_axes, values, [("market.ts", "const x = 1;\n")], clean_proj))),
        ("空输入必须报：OPTION_AXES 消失", lambda: problems_of("export const X = 1;", values, good_consumer, clean_proj) != []),
        ("空输入必须报：OPTION_AXES 空表", lambda: problems_of("export const OPTION_AXES = {} as const;", values, good_consumer, clean_proj) != []),
        ("空输入必须报：契约实测值全空", lambda: problems_of(
            good_axes, {k: set() for k in values}, good_consumer, clean_proj) != []),
        ("空输入必须报：消费面为空", lambda: problems_of(good_axes, values, [], clean_proj) != []),
    ]


GATE = meta("市场零手写选项闸门", "选项值唯一产地 = 契约投影层 facets（防手写枚举/联合/pill 与契约分叉）")


if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], NAME, selftest_cases, run))
