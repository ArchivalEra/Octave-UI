#!/usr/bin/env python3
"""wayfinder × Einfacht 联动闸门（map 票 #13）：锚点核对 + 形状断言收编。

wayfinder 决策票（map #4）关票时在 resolution 末行写 `gate: <锚点>`——
锚点指向台账键或闸门文件。本闸门做**本地对账**（决议 Q13.3：不做 gh api
网络对账——网络依赖进闸门违背「每提交真跑」的便宜性；零值守卫、
纯函数安静等硬坑照 zreflect 全套规矩）：

  · **A 面 · 锚点核对（格式面）**：锚点名录在本地登记表
    `zreflect/wayfinder_gates.json`（本仓维护——GitHub map #4 评论区里
    勾选的「wayfinder #N · gate: <锚点>」的本地对账副本）。kind=ledger 的
    key 必须在事实台账（`REFLECT_FACTS`，默认 FACTS.json）里真实存在；
    kind=gate 的 check 路径必须存在。锚点指向不存在的东西 ⇒ 红——
    「resolution 声称的判据锚点」与「实现面」不许脱钩。
  · **B 面 · 形状断言收编**（用户裁定修订：不造 check_fishing，单一闸门）：
    各票已落地的静态形状断言登记在同一张表的 `assertions` 里，全部
    **Python open/read 与 `in` 判**（不 spawn grep——GNU grep -L 的 rc
    歧义坑不进本闸门）。**断言的增删改都在 JSON 里做**（#10/#12 执行时
    把 pending 翻成生效即可），闸门代码不感知具体票号。
    `pending: true` = 票未执行、断言先登记不生效——闸门跳过执行并在
    输出里**如实注明**（pending 不是通过也不是失败：它是「已声明未落地」
    的诚实状态；但它要能红——自证里有「pending 翻生效后该报的必须报」
    的反向用例，证明跳过不是永久豁免）。

零值守卫：anchors 为空 / 台账为空 / assertions 登记为空 / 生效断言数为 0
（全 pending）⇒ 都报（空不是通过）。登记表跟**被检查仓库**走
（`repo(zreflect/wayfinder_gates.json)`）：GATE_REPO 指向别的仓库且无此表
⇒ 明说未启用退 0（可插拔，同 pins/locks 体例——跨仓夹具自证靠这个口子）。

与 `check_invariants`（#7）正交：那边守任意仓库文件的声明式不变量；
这边守 **wayfinder 决策票的判据锚点与形状**。锚点指向的台账键，其 value
是实测叙述（语义归复钓/测试）；本闸门只验「锚点存在、形状还在」。
与 `check_facts`（#7 同批）正交：那边对账文档块与台账；这边对账**决策票
与台账**——票是台账键的另一个上游出处。

用法（cwd=仓库根）：python3 zreflect/check_wayfinder.py
退出码：0=绿或未启用 / 1=发现问题 / 2=配置坏。自证：--selftest。
"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gate import fatal, finish, load_spec, main_selftest_or, meta, off  # noqa: E402
from gate import repo                                     # noqa: E402
from ledger import facts_of                               # noqa: E402

# 登记表名（相对被检查仓库根解析：它是**被检查仓库**的判据数据，不是工具自带件）。
REGISTRY_NAME = os.path.join("zreflect", "wayfinder_gates.json")


def _read_text(path):
    """读一个文本文件；读不到 ⇒ None（调用方按「读不到就明说」报，不静默）。"""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return None


def _dir_files(root, reldir, ext):
    """目录下所有指定后缀文件（相对 root 的路径，字典序）。目录不在 ⇒ None。"""
    d = os.path.join(root, reldir)
    if not os.path.isdir(d):
        return None
    out = []
    for base, _dirs, files in os.walk(d):
        for n in files:
            if n.endswith(ext):
                out.append(os.path.relpath(os.path.join(base, n), root))
    return sorted(out)


def _check_anchor(anc, facts, root):
    """A 面：一条锚点的核对（纯函数）。返回问题串（None=过）。

    kind=ledger ⇒ key 必须在台账键集里；kind=gate ⇒ check 路径必须存在
    （路径相对被检查仓库根；只验「指向的文件在」——文件在 zreflect/ 里
    即被发现式名录收编，能不能红由它的 --selftest 证明：叙述与执行各归各）。
    """
    kind = anc.get("kind")
    key = anc.get("key")
    if kind == "ledger":
        if not key:
            return "锚点缺 key：%r（ledger 锚点必须指向一个台账键）" % (anc,)
        if key not in facts:
            return ("锚点 #%s 指向台账键 `%s`，但台账里没有这个键 —— "
                    "决议声称的判据锚点不存在（先补台账，再改锚点）"
                    % (anc.get("ticket"), key))
        return None
    if kind == "gate":
        chk = anc.get("check")
        if not chk:
            return "锚点缺 check：%r（gate 锚点必须指向一个闸门文件）" % (anc,)
        if not os.path.isfile(os.path.join(root, chk)):
            return ("锚点 #%s 指向闸门 `%s`，但该文件不存在 —— "
                    "声明了判据却没有实现面" % (anc.get("ticket"), chk))
        return None
    return "锚点 #%s 的 kind=%r 不是已知种类（ledger | gate）" % (
        anc.get("ticket"), kind)


def _check_assertion(a, root):
    """B 面：一条形状断言的核对（纯函数，文件读取经 root）。返回问题串或 None。

    断言形状（声明式，全在 JSON 里）：
      file + must_contain / must_not_contain / must_not_contain_re
      dir + ext + must_not_contain（目录下所有该后缀文件逐个查）
      path_must_not_exist
    没有任何判据字段的条目 ⇒ 报（登记了却不查 = 装饰）。
    """
    where = a.get("file") or a.get("dir") or a.get("path_must_not_exist") or ""
    tag = "#%s %s" % (a.get("ticket"), where or a.get("desc") or "?")
    has_pred = any(a.get(k) for k in
                   ("must_contain", "must_not_contain", "must_not_contain_re",
                    "path_must_not_exist"))
    if not has_pred:
        return ("%s：断言没有任何判据字段（must_contain / must_not_contain / "
                "must_not_contain_re / path_must_not_exist 至少给一个）" % tag)
    if a.get("path_must_not_exist"):
        p = a["path_must_not_exist"]
        if os.path.exists(os.path.join(root, p)):
            return "DRIFT: %s：路径 %s 仍存在（断言要求它不存在）" % (tag, p)
        return None
    if a.get("file"):
        text = _read_text(os.path.join(root, a["file"]))
        if text is None:
            return ("%s：文件读不到（在吗？路径相对仓库根）—— 读不到就明说，"
                    "不许静默通过" % tag)
        frag = a.get("must_contain")
        if frag and frag not in text:
            return "DRIFT: %s：缺少应有片段 %r（%s）" % (tag, frag, a.get("desc", ""))
        frag = a.get("must_not_contain")
        if frag and frag in text:
            return "DRIFT: %s：出现被禁片段 %r（%s）" % (tag, frag, a.get("desc", ""))
        pat = a.get("must_not_contain_re")
        if pat and re.search(pat, text):
            return "DRIFT: %s：出现被禁模式 /%s/（%s）" % (tag, pat, a.get("desc", ""))
        return None
    if a.get("dir"):
        files = _dir_files(root, a["dir"], a.get("ext") or ".ts")
        if files is None:
            return "%s：目录 %s 不存在或不是目录 —— 读不到就明说" % (tag, a["dir"])
        if not files:
            return ("%s：目录 %s 下没有任何 %s 文件（零值守卫：空扫描面不是通过）"
                    % (tag, a["dir"], a.get("ext") or ".ts"))
        for rel in files:
            text = _read_text(os.path.join(root, rel))
            if text is None:
                return "%s：%s 读不到 —— 读不到就明说" % (tag, rel)
            frag = a.get("must_not_contain")
            if frag and frag in text:
                return "DRIFT: %s：%s 出现被禁片段 %r（%s）" % (
                    tag, rel, frag, a.get("desc", ""))
            frag_re = a.get("must_not_contain_re")
            if frag_re and re.search(frag_re, text):
                return "DRIFT: %s：%s 出现被禁模式 /%s/（%s）" % (
                    tag, rel, frag_re, a.get("desc", ""))
        need = a.get("must_contain")
        if need:
            hit = [rel for rel in files
                   if need in (_read_text(os.path.join(root, rel)) or "")]
            if not hit:
                return ("DRIFT: %s：目录 %s 下没有任何文件含应有片段 %r（%s）"
                        % (tag, a["dir"], need, a.get("desc", "")))
        return None
    return "%s：断言形状不认识（file / dir / path_must_not_exist 之一）" % tag


def problems(registry, root=None, facts=None):
    """纯函数：返回 (问题清单, pending 注记清单)。空问题清单 = 绿。自证期间不许 print。

    `registry` = 已读入的登记表 dict；`root` = 被检查仓库根（默认 repo()，
    自证传夹具目录）；`facts` = 台账键集（None ⇒ 现读真台账）。
    """
    root = repo() if root is None else root
    if facts is None:
        p = repo(os.environ.get("REFLECT_FACTS", "FACTS.json"))
        led, err = load_spec(p)
        if err is not None or led is None:
            return (["台账 %s 读不了 —— 配置坏，先修输入（FATAL 语义由 run() 落地）"
                     % p], [])
        facts = set(facts_of(led))
    out, notes = [], []
    anchors = registry.get("anchors") or []
    if not anchors:
        out.append("锚点登记为空 —— 空不是通过（零值守卫）：wayfinder 工单索引"
                   "断供了，还是登记表路径给错了？")
    if not facts:
        out.append("事实台账为空 —— 空不是通过（零值守卫）：锚点没有一个能对上")
    for anc in anchors:
        msg = _check_anchor(anc, facts, root)
        if msg:
            out.append("锚点问题：%s" % msg)
    active = 0
    for a in registry.get("assertions") or []:
        if a.get("pending"):
            # pending = 票未执行、断言先登记不生效：跳过执行、如实注明。
            # 不是永久豁免——自证里「pending 翻生效后该报的必须报」证明它能红。
            notes.append("pending: #%s 未执行（断言已登记不生效）：%s"
                         % (a.get("ticket"), a.get("desc", "")))
            continue
        active += 1
        msg = _check_assertion(a, root)
        if msg:
            out.append("形状断言问题：%s" % msg)
    if not (registry.get("assertions") or []):
        out.append("形状断言登记为空 —— 空不是通过（零值守卫）：收编面断供了")
    elif active == 0:
        out.append("生效断言数为 0 —— 全部 pending 不是通过（零值守卫）："
                   "收编面只剩「已声明未落地」")
    return out, notes


def run(argv):
    path = repo(REGISTRY_NAME)
    if not os.path.isfile(path):
        # 可插拔（同 pins/locks 体例）：登记表是被检查仓库的数据，不在 ⇒ 未启用。
        return off("未启用（%s 不在 ⇒ 明说未启用退 0，可插拔）" % REGISTRY_NAME)
    registry, err = load_spec(path)
    if err:
        return fatal("登记表 %s 坏：%s" % (REGISTRY_NAME, err))
    if not isinstance(registry, dict) or registry.get("schema") != 1:
        return fatal("登记表 %s 形状坏：需要 {\"schema\": 1, \"anchors\": [...], "
                     "\"assertions\": [...]}" % REGISTRY_NAME)
    probs, notes = problems(registry)
    for n in notes:
        print(n)                                   # pending 注记走 stdout：不是问题
    anc_n = len(registry.get("anchors") or [])
    act_n = sum(1 for a in registry.get("assertions") or [] if not a.get("pending"))
    return finish("wayfinder 闸门", probs,
                  "wayfinder 闸门：OK（%d 个锚点在册对上，%d 条形状断言全绿，"
                  "%d 条 pending 如实注明）" % (anc_n, act_n, len(notes)))


GATE = meta("wayfinder 闸门", "决策票 gate: 锚点对账（台账键/闸门文件存在性）+ 形状断言收编（零网络）",
            knobs=("REFLECT_FACTS",))


def _cases():
    import atexit                                        # noqa: PLC041
    import shutil                                        # noqa: PLC041
    import tempfile                                      # noqa: PLC041
    d = tempfile.mkdtemp()
    atexit.register(shutil.rmtree, d, True)
    # 夹具源码树：生效断言的目标全造好（形状与真仓一致）。
    # ⚠️ 这是**干净基底**——用例②的坏形状全部在各自 lambda 内就地改写、
    # 查完即恢复（装载期改共享文件 = 用例执行序依赖，重排即红，那种
    # 「正好绿」不是证据）。
    os.makedirs(os.path.join(d, "src/modules/engine"))
    os.makedirs(os.path.join(d, "src/modules/plugins/package"))
    os.makedirs(os.path.join(d, "src/modules/figure"))
    os.makedirs(os.path.join(d, "src/modules/storage"))
    os.makedirs(os.path.join(d, "src/modules/terminal"))
    os.makedirs(os.path.join(d, "src/components"))
    os.makedirs(os.path.join(d, "scripts"))
    SUPERVISOR = os.path.join(d, "src/modules/engine/EngineSupervisor.ts")
    PACKAGE = os.path.join(d, "src/modules/plugins/package/PackageManagerPlugin.ts")
    APPCTX = os.path.join(d, "src/modules/appContext.ts")
    DOWNLOAD = os.path.join(d, "src/modules/storage/DownloadStore.ts")
    BADLANE = os.path.join(d, "src/modules/engine/BadLane.ts")
    LIBDIR = os.path.join(d, "src/lib/engine")
    MODAL = os.path.join(d, "src/components/PackageManagerModal.svelte")
    TERMC = os.path.join(d, "src/modules/terminal/TerminalController.ts")
    SYNCLANES = os.path.join(d, "scripts/sync-lanes.sh")

    def _w(path, text):
        open(path, "w", encoding="utf-8").write(text)

    _w(SUPERVISOR, "export class EngineSupervisor {}\n")
    _w(PACKAGE, "export function getAssetsPort() { return 1; }\n")
    _w(os.path.join(d, "src/modules/figure/GraphicsSink.ts"),
       "export function onFigure() {}\n")
    _w(os.path.join(d, "src/modules/engine/OmcBridge.ts"),
       "export function onOmcFlavorError(cb) {}\n")
    _w(APPCTX, "import { onOmcFlavorError } from './engine/OmcBridge';\n"
               "onOmcFlavorError((err) => {});\n")
    _w(DOWNLOAD, "const meta = { sha256: 'ab'.repeat(8) };\n")
    # #6 五件套断言的夹具目标（形状与真仓一致：两拦截键 + boot 前置对账 + 平铺存储名）
    RESOLVER = os.path.join(d, "src/modules/engine/EngineAssetResolver.ts")
    EMBED = os.path.join(d, "src/modules/engine/WasmEmbedAdapter.ts")
    _w(RESOLVER, "const STORAGE_NAME = 'assets-manifest.json';"
                 " const INTERCEPT = 'octave.build.json';\n")
    _w(EMBED, "const gate = 'assertBootable';\n")
    # #12 去装饰化断言的夹具目标（形状与真仓一致：平铺存储名 + 瘦身后的
    # KNOWN_ENGINE_METADATA 键 omc——combinedSha / 128hex 都不在，断言该绿）
    _w(DOWNLOAD, DOWNLOAD and open(DOWNLOAD, encoding="utf-8").read()
       + "const FLAT = 'assets-manifest.json';\n"
         "let omcMeta = KNOWN_ENGINE_METADATA['omc'];\n")
    # #15 通知通道统一断言的夹具目标（形状与真仓一致：finally 零广播锚点注释 +
    # 失效挂点字面量——两条 must_contain 断言在夹具上可判，反向用例就地改写）
    _w(DOWNLOAD, DOWNLOAD and open(DOWNLOAD, encoding="utf-8").read()
       + "// download() 内 finally 零 broadcastChange\n"
         "EngineAssetResolver.getInstance().invalidateCache(lane as any);\n")
    # #14 包管理器错误呈现链断言的夹具目标（形状与真仓一致：DX3 forge 复制行 +
    # DX1 toast 双呈现 + DX2 互斥/重试 + R1 终端净化接线）
    _w(SYNCLANES, "# 夹具 sync-lanes.sh\n"
                  "cp -f forge-catalog.json lane/assets/forge-catalog.json\n"
                  "cp -rf assets/forge/ lane/assets/forge/\n"
                  "cp -rf assets/pkg/ lane/assets/pkg/\n")
    _w(MODAL, "toastService.error(short, code);\n"
              "await packageManagerPlugin.loadCatalog();\n"
              "{#if !catalogLoaded && catalogLoading && !errorMsg}\n")
    _w(TERMC, "import { ErrorSanitizer } from '../semantic/ErrorSanitizer';\n"
              "const sanitized = ErrorSanitizer.sanitize(String(err), this._locale);\n")
    # 夹具台账键集（A 面）。gate 锚点在夹具里指向不存在的文件（zreflect/ 不在
    # 夹具根）⇒ 良好用例须先把该锚点换成夹具内在册的路径。
    keys = {"integrity_check_physical", "get_assets_port_alive",
            "supervisor_no_mock_fallback", "plot_panel_figure_chain",
            "engine_layer_no_ui_import", "offline_boot_five_piece",
            "sha_ledger_no_decoration", "download_event_two_shot",
            "pkg_error_toast_chain", "fake_seams_purged"}
    # 基底登记表 = 真登记表（#10/#12 已执行 ⇒ 断言全生效、无 pending 原文）；
    # pending 语义的用例用合成 pending 断言的变体表考（真表里不再有 pending 条目，
    # 不能拿它考「pending 跳过执行」）。gate 锚点的 check 指向夹具里
    # 真实存在的文件（闸门自己），保持 A/B 两面在夹具上完整可判。
    good_reg = json.load(open(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "wayfinder_gates.json"),
        encoding="utf-8"))
    good_reg = json.loads(json.dumps(good_reg))
    for anc in good_reg["anchors"]:
        if anc.get("kind") == "gate":
            anc["check"] = "zreflect/check_wayfinder.py"
    # 夹具里的 gate 锚点文件必须真的存在（否则良好用例被它误伤）：
    os.makedirs(os.path.join(d, "zreflect"), exist_ok=True)
    _w(os.path.join(d, "zreflect/check_wayfinder.py"), "# 夹具闸门\n")

    def _clone():
        return json.loads(json.dumps(good_reg))

    def _assertion(reg, ticket, key=None):
        """按票号（可选再按判据字段）挑一条断言的引用。"""
        for a in reg["assertions"]:
            if a.get("ticket") == ticket and (key is None or key in a):
                return a
        return None

    def _mutate(path, text, reg, word):
        """就地改写一个夹具文件 → 跑 problems() → 恢复原状（原本不存在 ⇒ 查完删除）。"""
        backup = None
        if os.path.exists(path):
            backup = open(path, encoding="utf-8").read()
        _w(path, text)
        try:
            return any(word in x for x in problems(reg, root=d, facts=keys)[0])
        finally:
            if backup is not None:
                _w(path, backup)
            else:
                os.remove(path)

    # 各坏用例的登记表变体（纯 dict 改写，无文件副作用）
    miss_key_reg = _clone()
    for anc in miss_key_reg["anchors"]:             # 第一条 ledger 锚点（不靠下标，
        if anc.get("kind") == "ledger":             # 未来表头插入别的锚点不会错位）
            anc["key"] = "no_such_key"
            break
    hex_reg = _clone()
    _assertion(hex_reg, 12).pop("pending", None)          # 保险：#12 已生效，无 pending 可翻
    lib_reg = _clone()
    _assertion(lib_reg, 10).pop("pending", None)          # 保险：#10 已生效，无 pending 可翻
    # pending 语义夹具（#10/#12 执行后真表无 pending 原文 ⇒ 合成一条考「跳过执行
    # 并如实注明」——防的是 pending 机制被无声拆掉后没人发现）
    pending_reg = _clone()
    pending_reg["assertions"].append(
        {"ticket": 99, "desc": "合成 pending 断言（自证夹具）",
         "path_must_not_exist": "src/lib/engine", "pending": True})
    empty_anc = {"schema": 1, "anchors": [],
                 "assertions": good_reg["assertions"]}
    empty_assert = {"schema": 1, "anchors": good_reg["anchors"], "assertions": []}
    all_pending = {"schema": 1, "anchors": good_reg["anchors"],
                   "assertions": [dict(a, pending=True) for a in good_reg["assertions"]]}
    no_pred = {"schema": 1, "anchors": good_reg["anchors"],
               "assertions": [{"ticket": 1, "desc": "x",
                               "file": "src/modules/appContext.ts"}]}
    bad_kind = {"schema": 1, "assertions": good_reg["assertions"],
                "anchors": [{"ticket": 1, "key": "x", "kind": "spooky"}]}

    def _one(reg, word):
        return any(word in x for x in problems(reg, root=d, facts=keys)[0])

    def _lib_case():
        """#10 断言已生效（2026-10-23 壳物理删除后 pending 翻生效）：
        建 src/lib/engine 壳 ⇒ 查 ⇒ 拆干净。lib_reg 与 good_reg 同形（保险
        pop pending 是空操作），这条证明生效断言真的会红。"""
        os.makedirs(LIBDIR, exist_ok=True)
        p = os.path.join(LIBDIR, "EngineAssetResolver.ts")
        _w(p, "// 旧壳\n")
        try:
            return any("仍存在" in x for x in problems(lib_reg, root=d, facts=keys)[0])
        finally:
            os.remove(p)
            os.removedirs(LIBDIR)          # 壳拆干净，不给后续用例留副作用

    return [
        # ① 正常不报
        ("完整良好输入（真登记表 + 夹具源树 + 夹具台账键）⇒ 问题清单空",
         lambda: problems(good_reg, root=d, facts=keys)[0] == []),
        ("pending 断言跳过执行并如实注明（合成 pending 变体——#10/#12 执行后真表无 pending 原文）",
         lambda: [n for n in problems(pending_reg, root=d, facts=keys)[1]
                  if "未执行" in n] != []),
        ("pending 跳过不是永久豁免：夹具不建 src/lib/engine ⇒ 良好用例不因它红",
         lambda: not os.path.exists(os.path.join(d, "src/lib"))
         and problems(good_reg, root=d, facts=keys)[0] == []),
        # ② 该报的必须报
        ("★ 台账缺锚点键 ⇒ 必须报（锚点指向不存在的判据）",
         lambda: _one(miss_key_reg, "no_such_key")),
        ("★ supervisor 源含 MockEmbedAdapter ⇒ 必须报（DRIFT）",
         lambda: _mutate(SUPERVISOR,
                         "import { MockEmbedAdapter } from './MockEmbedAdapter';\n",
                         good_reg, "MockEmbedAdapter")),
        ("★ getAssetsPort 没了 ⇒ 必须报（缺应有片段）",
         lambda: _mutate(PACKAGE, "export function somethingElse() {}\n",
                         good_reg, "getAssetsPort")),
        ("★ engine 层有 toastService ⇒ 必须报（坏 Lane 文件被扫到）",
         lambda: _mutate(BADLANE, "toastService.error('x');\n",
                         good_reg, "toastService")),
        ("★ appContext 缺订阅 ⇒ 必须报（已知缝收编面）",
         lambda: _mutate(APPCTX, "export function boot() {}\n",
                         good_reg, "onOmcFlavorError")),
        ("★ 128hex 字面量 ⇒ 必须报（#12 已生效：真的会红）",
         lambda: _mutate(DOWNLOAD,
                         "const KNOWN_ENGINE_METADATA = '%s';\n" % ("ab" * 64),
                         hex_reg, "被禁模式")),
        ("★ combinedSha 拼接产地回潮 ⇒ 必须报（#12 已生效：三产地归一断言）",
         lambda: _mutate(DOWNLOAD,
                         DOWNLOAD and open(DOWNLOAD, encoding="utf-8").read()
                         + "let combinedSha = '';\n",
                         good_reg, "combinedSha")),
        ("★ KNOWN_ENGINE_METADATA 键改形（omc 键没了）⇒ 必须报（#12 已生效：瘦身形状断言）",
         lambda: _mutate(DOWNLOAD,
                         "const meta = { sha256: 'ab'.repeat(8) };\n"
                         "const FLAT = 'assets-manifest.json';\n",
                         good_reg, "KNOWN_ENGINE_METADATA")),
        ("★ #15 两发定档锚点注释没了 ⇒ 必须报（缺应有片段）",
         lambda: _mutate(DOWNLOAD,
                         "const meta = { sha256: 'ab'.repeat(8) };\n"
                         "const FLAT = 'assets-manifest.json';\n"
                         "let omcMeta = KNOWN_ENGINE_METADATA['omc'];\n"
                         "EngineAssetResolver.getInstance().invalidateCache(lane as any);\n",
                         good_reg, "finally 零 broadcastChange")),
        ("★ #15 失效挂点字面量没了 ⇒ 必须报（缺应有片段）",
         lambda: _mutate(DOWNLOAD,
                         "const meta = { sha256: 'ab'.repeat(8) };\n"
                         "const FLAT = 'assets-manifest.json';\n"
                         "let omcMeta = KNOWN_ENGINE_METADATA['omc'];\n"
                         "// download() 内 finally 零 broadcastChange\n",
                         good_reg, "invalidateCache(lane as any)")),
        ("★ #14 DX3 forge 复制行没了 ⇒ 必须报（缺 forge-catalog.json 片段）",
         lambda: _mutate(SYNCLANES,
                         "# 夹具 sync-lanes.sh（forge 行被拔掉）\n"
                         "cp -rf other/ lane/other/\n",
                         good_reg, "forge-catalog.json")),
        ("★ #14 DX1 toast 双呈现接线没了 ⇒ 必须报（缺 toastService.error 片段）",
         lambda: _mutate(MODAL,
                         "toastService.info('nothing');\n"
                         "await packageManagerPlugin.loadCatalog();\n"
                         "{#if !catalogLoaded && catalogLoading && !errorMsg}\n",
                         good_reg, "toastService.error")),
        ("★ #14 DX2 互斥双保险没了 ⇒ 必须报（缺 !errorMsg 模板片段）",
         lambda: _mutate(MODAL,
                         "toastService.error(short, code);\n"
                         "await packageManagerPlugin.loadCatalog();\n"
                         "{#if !catalogLoaded && catalogLoading}\n",
                         good_reg, "!catalogLoaded && catalogLoading && !errorMsg")),
        ("★ #14 DX2 重试路径没了 ⇒ 必须报（缺 loadCatalog() 调用）",
         lambda: _mutate(MODAL,
                         "toastService.error(short, code);\n"
                         "await somethingElse();\n"
                         "{#if !catalogLoaded && catalogLoading && !errorMsg}\n",
                         good_reg, "packageManagerPlugin.loadCatalog()")),
        ("★ #14 R1 终端净化接线没了 ⇒ 必须报（缺 ErrorSanitizer.sanitize）",
         lambda: _mutate(TERMC,
                         "const text = String(err);\n",
                         good_reg, "ErrorSanitizer.sanitize")),
        ("★ src/lib/engine 壳存在 ⇒ 必须报（#10 已生效：壳回潮真的会红）",
         lambda: _lib_case()),
        ("★ 断言无判据字段 ⇒ 必须报（登记了却不查 = 装饰）",
         lambda: _one(no_pred, "没有任何判据字段")),
        ("★ 锚点 kind 不认识 ⇒ 必须报",
         lambda: _one(bad_kind, "不是已知种类")),
        ("★ 生效断言数为 0（全 pending）⇒ 必须报（零值守卫）",
         lambda: _one(all_pending, "生效断言数为 0")),
        # ③ 空输入必须报
        ("★ 锚点登记为空 ⇒ 必须报（零值守卫）",
         lambda: _one(empty_anc, "锚点登记为空")),
        ("★ 台账为空 ⇒ 必须报（零值守卫）",
         lambda: problems(good_reg, root=d, facts=set())[0] != []),
        ("★ 断言登记为空 ⇒ 必须报（零值守卫）",
         lambda: _one(empty_assert, "形状断言登记为空")),
        # ④ 形状边界（读不到就明说的面）
        ("★ 断言目标文件缺席 ⇒ 必须报（读不到就明说）",
         lambda: any("读不到" in x for x in problems(
             {"schema": 1, "anchors": good_reg["anchors"],
              "assertions": [{"ticket": 1, "desc": "x", "file": "src/nope.ts",
                              "must_contain": "y"}]},
             root=d, facts=keys)[0])),
        ("★ gate 锚点指向不存在的闸门文件 ⇒ 必须报（声明了判据却没有实现面）",
         lambda: any("没有实现面" in x for x in problems(
             {"schema": 1, "anchors": [{"ticket": 1, "key": "x",
                                        "kind": "gate",
                                        "check": "zreflect/nope.py"}],
              "assertions": good_reg["assertions"]},
             root=d, facts=keys)[0])),
        ("★ ledger 锚点缺 key / gate 锚点缺 check ⇒ 必须报",
         lambda: any("缺 key" in x for x in problems(
             {"schema": 1, "anchors": [{"ticket": 1, "kind": "ledger"}],
              "assertions": good_reg["assertions"]},
             root=d, facts=keys)[0])
         or any("缺 check" in x for x in problems(
             {"schema": 1, "anchors": [{"ticket": 1, "kind": "gate"}],
              "assertions": good_reg["assertions"]},
             root=d, facts=keys)[0])),
        ("★ 断言目标目录缺席 ⇒ 必须报（目录读不到就明说）",
         lambda: any("目录" in x and ("不存在" in x or "读不到" in x)
                     for x in problems(
             {"schema": 1, "anchors": good_reg["anchors"],
              "assertions": [{"ticket": 1, "desc": "x", "dir": "src/nope_dir",
                              "ext": ".ts", "must_not_contain": "z"}]},
             root=d, facts=keys)[0])),
    ]


if __name__ == "__main__":
    sys.exit(main_selftest_or(sys.argv[1:], "check_wayfinder（锚点核对 + 形状断言收编）",
                              _cases, run))
