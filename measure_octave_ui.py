#!/usr/bin/env python3
"""Octave-UI 领域事实采集器（2026-11-07 额叶切除：从 zreflect/facts.py 的
「你的部分」整段搬到仓根）。

新版 Einfacht facts.py 只提供机制，measure_example() 是占位；本仓 22 条事实
（8 条裸值复跑 + 14 条 witness 贵事实）全在这里量。由
REFLECT_MEASURE_MODULE=measure_octave_ui 显式分派，facts 壳负责 PYTHONPATH。

⚠️ 本文件在仓根（不在 zreflect/），因此不受新版 check_i18n 本体零语言制度
扫描，也因 MODULE 声明被 registry 认作使用方数据模块。
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "zreflect"))
from gate import GATE_REPO, module_meta  # noqa: E402
from ledger import fact  # noqa: E402

MODULE = module_meta("Octave-UI 数据层", "本仓 22 条事实的领域采集器", selftest=False)

def _probe(cmd):
    """容错采集（issue #5 采集器契约 3 的落地）：命令跑不成（rc≠0——夹具仓/别的仓里
    目标文件不存在是常态）⇒ 返回 None，调用方跳过该键——读不到就明说，绝不炸、绝不编数。
    注意：本仓（真仓）跑时目标文件都在，None 路径只在跨仓夹具里走到。"""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=GATE_REPO)
    except Exception:
        return None
    if r.returncode != 0:
        return None
    return r.stdout.strip()



def measure():
    """Octave-UI 领域事实采集器。数值只认实测，复跑逐字执行。"""
    facts = {}

    # 1. 前端与组件资产统计
    # 复跑面 = 仓库面（与 md/py 同款修正，先例 5d0f9da / 68e4a12）：git 工作树里
    # cmd 只数**已跟踪**的 ts/svelte/astro/test（git ls-files）——旧 `find` 把未
    # 跟踪的同扩展名文件（探针 / 草稿）也数进去，台账值在含未跟踪文件的 checkout
    # 上复跑永不收敛（复跑判据必须只依赖已入库的面）。pathspec 与原 find 语义逐字
    # 等价、不收窄不放宽：`src/*.ts` 的 `*` 跨目录 ⇒ 递归等价 `-path './src/*'
    # -name '*.ts'`（ts 用 `'src/*.ts' 'tests/*.ts'` 保住原双目录限定——仓里另有
    # 5 个跟踪 .ts 在面外：pyodide/omc 的 .d.ts + vitest.config.ts，裸 '*.ts' 会
    # 放宽 +5）；`tests/*.test.ts` 等价 `-path './tests/*' -name '*.test.ts'`（全部
    # 跟踪的 *.test.ts 都在 tests/ 下，50=50）。非 git 处境（跨仓夹具自证）没有
    # 「已跟踪面」这个概念，退回 find 数全量 —— 仪器随处境选，**选了什么就写在
    # cmd 字段里**（判据强度随环境变化不许静默 —— runner.py 的 bash→/bin/sh 同款
    # 先例）。反向验证：git 仓里造未跟踪 ts/svelte/astro/test 探针后这四条 cmd
    # 输出不变。
    if _probe("git rev-parse --is-inside-work-tree") is not None:
      ts_cmd = "git ls-files -- 'src/*.ts' 'tests/*.ts' | wc -l"
      svelte_cmd = "git ls-files -- 'src/*.svelte' | wc -l"
      astro_cmd = "git ls-files -- 'src/*.astro' | wc -l"
      test_cmd = "git ls-files -- 'tests/*.test.ts' | wc -l"
    else:
      print("⚠ GATE_REPO 不是 git 工作树 ⇒ ts/svelte/astro/test 计数退回 find"
            "（数全量，无「已跟踪面」可依）—— 仪器选择已写进 cmd 字段", file=sys.stderr)
      ts_cmd = "find . \\( -path './src/*' -o -path './tests/*' \\) -name '*.ts' | wc -l"
      svelte_cmd = "find . -path './src/*' -name '*.svelte' | wc -l"
      astro_cmd = "find . -path './src/*' -name '*.astro' | wc -l"
      test_cmd = "find . -path './tests/*' -name '*.test.ts' | wc -l"
    n_ts = int(subprocess.run(ts_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["ts_files"] = fact(n_ts, ts_cmd, "repo", "TypeScript 源码与测试文件数")

    n_svelte = int(subprocess.run(svelte_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["svelte_files"] = fact(n_svelte, svelte_cmd, "repo", "Svelte 5 组件与 Islands 数量")

    n_astro = int(subprocess.run(astro_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["astro_files"] = fact(n_astro, astro_cmd, "repo", "Astro 静态页面与布局数")

    n_test = int(subprocess.run(test_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["test_files"] = fact(n_test, test_cmd, "repo", "Vitest 单元测试套件数")

    # 2. 闸门与文档统计
    # 复跑面 = 仓库面（与 md_files/md_lines 同款修正，先例 5d0f9da）：git 工作树里
    # cmd 只数**已跟踪**的 py（git ls-files）——旧 `find` 把未跟踪的 py（草稿 /
    # 探针脚本）也数进去，台账值在含未跟踪 .py 的 checkout 上复跑永不收敛（复跑
    # 判据必须只依赖已入库的面）。非 git 处境（跨仓夹具自证）没有「已跟踪面」
    # 这个概念，退回 find 数全量 —— 仪器随处境选，**选了什么就写在 cmd 字段里**
    # （判据强度随环境变化不许静默 —— runner.py 的 bash→/bin/sh 同款先例）。
    # 反向验证：git 仓里造未跟踪 py 后这两条 cmd 输出不变。
    if _probe("git rev-parse --is-inside-work-tree") is not None:
      py_files_cmd = "git ls-files -- '*.py' | wc -l"
      py_lines_cmd = "git ls-files -z -- '*.py' | xargs -0 -r sh -c 'for f; do [ -f \"$f\" ] && cat \"$f\"; done' _ | wc -l"
    else:
      print("⚠ GATE_REPO 不是 git 工作树 ⇒ py 计数退回 find（数全量，无「已跟踪面」"
            "可依）—— 仪器选择已写进 cmd 字段", file=sys.stderr)
      py_files_cmd = "find . -name '*.py' -not -path './.git/*' -not -path './node_modules/*' | wc -l"
      py_lines_cmd = "find . -name '*.py' -not -path './.git/*' -not -path './node_modules/*' -exec cat {} + | wc -l"
    n_py = int(subprocess.run(py_files_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["py_files"] = fact(n_py, py_files_cmd, "repo")

    lines_py = int(subprocess.run(py_lines_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["py_lines"] = fact(lines_py, py_lines_cmd, "repo", "刻意 ≥100，用来示范裸数字判据")

    # 复跑面 = 仓库面（「测量输入含未跟踪状态」的修正）：git 工作树里 cmd 只数
    # **已跟踪**的 md（git ls-files）——旧 `find` 把未跟踪的 md（草稿 / scratch /
    # 需求稿）也数进去，台账值在干净 checkout 上复跑永不收敛（复跑判据必须只依赖
    # 已入库的面）。非 git 处境（跨仓夹具自证）没有「已跟踪面」这个概念，退回
    # find 数全量 —— 仪器随处境选，**选了什么就写在 cmd 字段里**（判据强度随环境
    # 变化不许静默 —— runner.py 的 bash→/bin/sh 同款先例）。反向验证：git 仓里
    # 造未跟踪 md 后这两条 cmd 输出不变。
    if _probe("git rev-parse --is-inside-work-tree") is not None:
      md_files_cmd = "git ls-files -- '*.md' | wc -l"
      md_lines_cmd = ("git ls-files -z -- '*.md'"
                      " | xargs -0 -r awk 'FNR==1{b=0} /<!-- AUTO:FACTS -->/{b=1} !b' | wc -l")
    else:
      print("⚠ GATE_REPO 不是 git 工作树 ⇒ md 计数退回 find（数全量，无「已跟踪面」"
            "可依）—— 仪器选择已写进 cmd 字段", file=sys.stderr)
      md_files_cmd = "find . -name '*.md' -not -path './.git/*' -not -path './node_modules/*' | wc -l"
      md_lines_cmd = ("find . -name '*.md' -not -path './.git/*' -not -path './node_modules/*'"
                      " -exec awk 'FNR==1{b=0} /<!-- AUTO:FACTS -->/{b=1} !b' {} + | wc -l")
    n_md = int(subprocess.run(md_files_cmd, shell=True, capture_output=True, text=True, check=True, cwd=GATE_REPO).stdout.strip())
    facts["md_files"] = fact(n_md, md_files_cmd, "repo")
    facts["md_lines"] = fact(
        int(subprocess.run(md_lines_cmd, shell=True, capture_output=True,
                           text=True, check=True,
                           cwd=GATE_REPO).stdout.strip()),
        md_lines_cmd, "repo",
        "不含机器块：块就渲染在文档里，数进去会让渲染一遍值就过期")

    # 3. wayfinder 决策票的 gate: 锚点（贵事实挂便宜见证，issue #5 机制）
    #    值 = 一次实测采样（用例名清单），replay=False（跑 vitest 太贵不逐字复跑）；
    #    witness = 便宜 grep（「integrity/corrupted 已进 resolver 源」），每提交真跑。
    integrity_cmd = "python3 -c \"import os; p='src/modules/engine/EngineAssetResolver.ts'; print(open(p).read().count('corrupted') if os.path.exists(p) else 'absent')\""
    n_integrity = _probe(integrity_cmd)
    if n_integrity is not None:
      facts["integrity_check_physical"] = fact(
        "integrity: 完整盘面与记账逐项对上 ⇒ verified / 截断 ⇒ corrupted / 篡改(XOR) ⇒ corrupted / 缓存零重算 / 失效重读 / 无记账 ⇒ unchecked / evict ⇒ false（tests/engine/EngineAssetResolver.test.ts，2026-10-22 实测 291/291 绿）",
        "pnpm test -- tests/engine/EngineAssetResolver.test.ts",
        "wayfinder #7",
        "票面 gate: 锚点；值是 vitest 用例面的一次采样（跑全测太贵不逐字复跑）",
        replay=False,
        witness=integrity_cmd, witness_expect=str(n_integrity),
    )

    # wayfinder #8 gate: 锚点——getAssetsPort 存在（死代码缝闭合的来源不变式）
    gap_cmd = "python3 -c \"import os; p='src/modules/plugins/package/PackageManagerPlugin.ts'; print(open(p).read().count('getAssetsPort') if os.path.exists(p) else 'absent')\""
    n_gap = _probe(gap_cmd)
    if n_gap is not None:
      facts["get_assets_port_alive"] = fact(
        "getAssetsPort() 定义存在且被 appContext catalogProvider 闭包真实调用（tests/plugins/PackageManagerPlugin.test.ts 5 用例，2026-10-22 实测 296/296 绿；tsc 死缝错误消失 61→60）",
        gap_cmd,
        "wayfinder #8",
        "票面 gate: 锚点；值是vitest+tsc一次采样（贵不逐字复跑）",
        replay=False,
        witness=gap_cmd, witness_expect=str(n_gap),
    )

    # wayfinder #9 gate: 锚点——生产路径无 Mock 回退（supervisor 源零 MockEmbedAdapter 引用）
    nomock_cmd = "python3 -c \"import os; p='src/modules/engine/EngineSupervisor.ts'; print(open(p).read().count('MockEmbedAdapter') if os.path.exists(p) else 'absent')\""
    nomock_out = _probe(nomock_cmd)
    if nomock_out is not None:
      facts["supervisor_no_mock_fallback"] = fact(
        "EngineSupervisor 生产路径零 MockEmbedAdapter 引用；无桥 ⇒ boot/recover throw BOOT_UNAVAILABLE + failed 态（tests/engine/EngineSupervisor.test.ts 18 用例含反向断言，2026-10-22 实测 297/297 绿）",
        nomock_cmd,
        "wayfinder #9",
        "票面 gate: 锚点；值是vitest一次采样（贵不逐字复跑）",
        replay=False,
        witness=nomock_cmd, witness_expect=str(nomock_out),
    )

    # wayfinder #5 gate: 锚点——Plots 面板图表事件链存在（onFigure 事件面 + wireFigureSource 单一出口）
    onfig_cmd = "python3 -c \"import os; p='src/modules/figure/GraphicsSink.ts'; print(open(p).read().count('onFigure') if os.path.exists(p) else 'absent')\""
    n_onfig = _probe(onfig_cmd)
    if n_onfig is not None:
      facts["plot_panel_figure_chain"] = fact(
        "GraphicsSink.onFigure 事件面 + wireFigureSource 转发单一出口 + P5 插件 Blob URL revoke（tests/figure/ 两文件 14 用例，2026-10-22 实测 311/311 绿）",
        onfig_cmd,
        "wayfinder #5",
        "票面 gate: 锚点；值是vitest一次采样（贵不逐字复跑）",
        replay=False,
        witness=onfig_cmd, witness_expect=str(n_onfig),
    )

    # wayfinder #11 gate: 锚点——engine 层零 UI import（OmcBridge 抽离后倒挂纠正）
    # witness 用 grep -c 逐文件计数（GNU grep -L 的退出码有歧义，不能进复跑契约）：
    # engine 层任一文件含 toastService ⇒ 计数非零 ⇒ 红铆钉
    uiimport_cmd = "python3 -c \"import os, glob; fs=glob.glob('src/modules/engine/*.ts'); print(sum(open(f).read().count('toastService') for f in fs) if fs else 'absent')\""
    n_noui = _probe(uiimport_cmd)
    total_engine = _probe("ls src/modules/engine/*.ts | wc -l")
    if n_noui is not None and total_engine is not None:
      facts["engine_layer_no_ui_import"] = fact(
        f"engine 层 {total_engine} 个 ts 文件中含 toastService 的文件数 = {n_noui}（应为 0；（OmcBridge 抽离 + 三条 UI 旁路拔除；tests/engine/OmcBridge.test.ts 11 用例，2026-10-22 实测 322/322 绿）",
        uiimport_cmd,
        "wayfinder #11",
        "票面 gate: 锚点；值是源码形状一次采样（贵不逐字复跑）",
        replay=False,
        witness=uiimport_cmd, witness_expect=str(n_noui),
    )

    # wayfinder #6 gate: 锚点——离线五件套 OPFS 直载（boot 反转 + 两拦截键 + 五件指纹）。
    # 值 = 一次实测采样（用例面叙述），replay=False（跑 vitest 太贵不逐字复跑）；
    # witness = 便宜 grep（matchRequest 拦截键已进 resolver 源），每提交真跑。
    five_cmd = "python3 -c \"import os; p='src/modules/engine/EngineAssetResolver.ts'; print(open(p).read().count('assets-manifest.json') if os.path.exists(p) else 'absent')\""
    n_five = _probe(five_cmd)
    if n_five is not None:
      facts["offline_boot_five_piece"] = fact(
        "boot OPFS 优先（verified ⇒ getBlob 读 octave.js 注入，未下载走网络，corrupted ⇒ throw ENGINE_CORRUPTED）+ matchRequest 两拦截键（assets/manifest.json 映射平铺名 assets-manifest.json、octave.build.json；w64 档 manifest.w64.json 不拦）+ 五件指纹（删 assets-manifest 后缓存不命中 ⇒ corrupted）（tests/engine/ 两文件 + DownloadStore 五件套记账，2026-10-23 实测 326/326 绿）",
        "pnpm test -- tests/engine/EngineAssetResolver.test.ts tests/engine/WasmEmbedAdapter.test.ts",
        "wayfinder #6",
        "票面 gate: 锚点；值是 vitest 用例面的一次采样（跑全测太贵不逐字复跑）",
        replay=False,
        witness=five_cmd, witness_expect=str(n_five),
      )

    # wayfinder #12 gate: 锚点——sha 台账去装饰化（128hex 拼接串产地删除 + 三元组幂等比对）。
    # 值 = 一次实测采样（用例面叙述），replay=False（跑 vitest 太贵不逐字复跑）；
    # witness = 便宜双见证（源内 128hex 连续 hex 字面量数 = 0 且 combinedSha 计数 = 0），
    # 每提交真跑——聚合 sha 拼接串若悄悄回来，见证当场红。
    deco_cmd = ("python3 -c \"import os,re; p='src/modules/storage/DownloadStore.ts'; "
                "t=open(p).read() if os.path.exists(p) else ''; "
                "print('%d,%d' % (len(re.findall(r'[0-9a-f]{128}', t)), t.count('combinedSha')))\"")
    n_deco = _probe(deco_cmd)
    if n_deco is not None:
      facts["sha_ledger_no_decoration"] = fact(
        "DownloadStore sha 台账去装饰化：源内 128hex 字面量 = 0 + combinedSha 拼接产地 = 0（三产地归一）；"
        "幂等比对换逐文件三元组（path/sha/bytes，undefined sha 跳 sha 维）⇒ 五件套重下 fetchPort 调用 = 0；"
        "intake 出口 64hex 断言（128hex/空串/大写 ⇒ INDEX_UNREADABLE）；KNOWN_ENGINE_METADATA 瘦身"
        "（键 omc、无顶层 bytes/sha256，bytes 从 files 累加）+ 多文件 record 顶层 sha = undefined"
        "（tests/storage/DownloadStore.test.ts + tests/plugins/PackageManagerPlugin.test.ts，2026-10-23 实测 333/333 绿）",
        "pnpm test -- tests/storage/DownloadStore.test.ts tests/plugins/PackageManagerPlugin.test.ts",
        "wayfinder #12",
        "票面 gate: 锚点；值是 vitest 用例面的一次采样（跑全测太贵不逐字复跑）",
        replay=False,
        witness=deco_cmd, witness_expect=n_deco,
      )

    # wayfinder #15 gate: 锚点——通知通道统一（download 三发收敛两发 + 失效挂点）。
    # 值 = 一次实测采样（用例面叙述），replay=False（跑 vitest 太贵不逐字复跑）；
    # witness = 便宜计数（download() 方法体内 finally 块的 broadcastChange 调用数 = 0
    # ——决议原文「finally 里那次删除」的机器可判形状；旧三发坏形状回潮 ⇒ finally
    # 里再现调用 ⇒ 见证当场红。方法体内共 3 处调用 = start null + 成功 record +
    # catch null，任何单次执行路径恰好发 2 声——发数判据归 vitest 事件计数用例）。
    twoshot_cmd = ("python3 -c \"import re; p='src/modules/storage/DownloadStore.ts'; "
                   "t=open(p).read(); s=t.index('async download('); e=t.index('async remove(', s); "
                   "b=t[s:e]; f=b[b.index('} finally {'):]; print(f.count('this.broadcastChange('))\"")
    n_twoshot = _probe(twoshot_cmd)
    if n_twoshot is not None:
      facts["download_event_two_shot"] = fact(
        "DownloadStore.download() 通知通道统一：三发收敛两发（start null 进 downloading 态 + 终态一次"
        "——成功 record / 失败 catch 里 null 后 rethrow，finally 中间那次删除）；"
        "终态后显式调 EngineAssetResolver.getInstance().invalidateCache(lane)（#7 显式方法，engine ref 才挂，"
        "lane 推法与 removeEngine 同款）⇒ 成功与失败两路单例缓存都失效（tests/storage/DownloadStore.test.ts "
        "3 新用例：事件数===2×2 + 失效挂点 spy 双路，2026-10-23 实测 336/336 绿）",
        "pnpm test -- tests/storage/DownloadStore.test.ts",
        "wayfinder #15",
        "票面 gate: 锚点；值是 vitest 用例面的一次采样（跑全测太贵不逐字复跑）",
        replay=False,
        witness=twoshot_cmd, witness_expect=str(n_twoshot),
      )

    # wayfinder #14 gate: 锚点——包管理器错误呈现链（DX1 toast 双呈现 + DX2 互斥重试 + R1 终端净化）。
    # 值 = 一次实测采样（用例面叙述），replay=False（跑 vitest 太贵不逐字复跑）；
    # witness = 便宜计数（模态组件源内 toastService 调用计数非零——toast 接线若被
    # 拔掉，计数归零 ⇒ 见证当场红），每提交真跑。
    pkgtoast_cmd = ("python3 -c \"import os; p='src/components/PackageManagerModal.svelte'; "
                    "print(open(p).read().count('toastService') if os.path.exists(p) else 'absent')\"")
    n_pkgtoast = _probe(pkgtoast_cmd)
    if n_pkgtoast is not None:
      facts["pkg_error_toast_chain"] = fact(
        "包管理器错误呈现链（wayfinder #14）：DX1 banner+code 双呈现（错误同时 toastService.error(短消息, code)"
        "——toast-code-badge 消费 code；errors.* 键表三语补齐 7 码全 + assets-loader 14 码子集）；"
        "DX2 loading/error 互斥（有 error ⇒ spinner 零命中）+ 重试按钮调 loadCatalog()（#8 已救活）"
        "re-fetch 计数+1；R1 终端 onError 通道接 ErrorSanitizer（bridge 硬编码中文在消费端拦，三语各测）"
        "（tests/ui/PackageManagerModal.svelte.test.ts 7 用例 + tests/terminal/TerminalController.test.ts "
        "R1 扩展 4 用例，2026-10-23 实测 347/347 绿）",
        "pnpm test -- tests/ui/PackageManagerModal.svelte.test.ts tests/terminal/TerminalController.test.ts",
        "wayfinder #14",
        "票面 gate: 锚点；值是 vitest 用例面的一次采样（跑全测太贵不逐字复跑）",
        replay=False,
        witness=pkgtoast_cmd, witness_expect=str(n_pkgtoast),
      )

    # wayfinder #10 gate: 锚点——假 seam 清理（lib/ 双壳物理删 + 死接口核销 +
    # 透传层拆除 + ref 代数收单）。值 = 一次实测采样（用例面叙述），replay=False
    # （跑 vitest 太贵不逐字复跑）；witness = 便宜双见证合一（一行 python3 判
    # 「src/lib/engine 目录不存在 + DownloadStore.ts 里编造版本号 1.25.0 的
    # **构造性出现**为 0」——注释行 `键 omc@1.25.0 → omc` 是键变更的历史说明
    # 不算编造（票面豁免），故判据取 version 构造形 `version: '1.25.0'` 而非
    # 裸 substring；壳若回潮或编造版本号若复活进构造，见证当场红），每提交真跑。
    seams_cmd = ("python3 -c \"import os; src=open('src/modules/storage/DownloadStore.ts').read(); "
                 "print('%d,%d' % (os.path.exists('src/lib/engine'), src.count(\\\"version: '1.25.0'\\\")))\"")
    n_seams = _probe(seams_cmd)
    if n_seams is not None:
      facts["fake_seams_purged"] = fact(
        "假 seam 清理（wayfinder #10）：src/lib/engine 双壳物理删除（modules/ 为真产地，"
        "壳的自证用例同步删）；DownloadStore unit() 死接口核销（生产零消费者）+ 其余公开接口逐一"
        "grep 核销（getRecord/index/checkQuota/download/downloadEngine/removeEngine/isEngineDownloading "
        "均有真实消费者，保留）；ProjectWorkspace 7 个 downloadStore 零逻辑透传拆除（HeaderBar 直连"
        "appContext downloadStore 单例）+ syncFilesToEngine 直取 adapter.fs.write 改走 supervisor.fsWrite；"
        "engineRef 工厂收 7 产地（omc version 如实 '-rust'，Q6C）（tests/engine/ 两文件 + "
        "tests/storage/DownloadStore.test.ts + tests/workspace/ProjectWorkspace.test.ts，2026-10-23 实测 346/346 绿）",
        "pnpm test",
        "wayfinder #10",
        "票面 gate: 锚点；值是 vitest 用例面的一次采样（跑全测太贵不逐字复跑）",
        replay=False,
        witness=seams_cmd, witness_expect=n_seams,
      )

    # spec #19 红线 2 gate: 锚点——徽标消费 integrity 三态而非布尔
    badge_cmd = ("python3 -c \"import os; p='src/components/HeaderBar.svelte'; "
                 "print(open(p).read().count('integrity') if os.path.exists(p) else 'absent')\"")
    n_badge = _probe(badge_cmd)
    if n_badge is not None:
      facts["header_integrity_badge"] = fact(
          f"HeaderBar 徽标三态消费引擎层 integrity（{n_badge} 处引用）；corrupted ⇒ ⚠ 已损坏、verified/unchecked ⇒ ✓、未下载 ⇒ 下载按钮；三语 header.corrupted_badge（tests/ui/HeaderBar.svelte.test.ts 6 用例，2026-10-23 实测 362/362 绿）",
          badge_cmd,
          "spec #19 红线 2",
          "票面 gate: 锚点；值是vitest一次采样（贵不逐字复跑）",
          replay=False,
          witness=badge_cmd, witness_expect=str(n_badge),
      )

    # spec #19 红线 1 gate: 锚点——事件链有页面级总线（跨实例不失聪）
    bus_cmd = ("python3 -c \"import os; p='src/modules/figure/GraphicsSink.ts'; "
               "print(open(p).read().count('wireFigureBusToSink') if os.path.exists(p) else 'absent')\"")
    n_bus = _probe(bus_cmd)
    if n_bus is not None:
      facts["plot_event_bus"] = fact(
          f"页面级图表事件总线（wireFigureBusToSink {n_bus} 处）解耦装钩与收事件；钩子重赋值安全 + 空 URL 丢弃 + lastFigure 回放（tests/figure/P5FigureChain.test.ts 10 用例，其中 6 条对修复前代码全红）",
          bus_cmd,
          "spec #19 红线 1",
          "票面 gate: 锚点；值是vitest一次采样（贵不逐字复跑）",
          replay=False,
          witness=bus_cmd, witness_expect=str(n_bus),
      )

    # wayfinder/D 线的 gate 锚点（D11 / D13）
    asm_cmd = "python3 -c \"import os; p='src/modules/plugins/webmcp/WebMcpPlugin.ts'; print(open(p).read().count('injectServices') if os.path.exists(p) else 'absent')\""
    n_asm = _probe(asm_cmd)
    if n_asm is not None:
      facts["webmcp_assembly_chain"] = fact(
          "WebMCP 三服务在组合根注入（appContext 调 injectServices；resolveCtx 的 onAssemblyFault 让装配缺陷与设计降级可区分）。D11 修复：七个工具从「五个线上全废」到全可用。反向断言 tests/plugins/webmcp-assembly.test.ts 5 用例（修复前 5/5 全红→修复后全绿，stash 对拍）",
          asm_cmd,
          "内容仓 095 (D11) / 097",
          "票面 gate: 锚点；值是vitest一次采样（贵不逐字复跑）",
          replay=False,
          witness=asm_cmd, witness_expect=str(n_asm),
      )

    loop_cmd = "python3 -c \"import os; p='src/modules/storage/WorkspaceStorageManager.ts'; print(int('_lastAddpathKey' in open(p).read()) + int('_lastNotifiedActiveFile' in open(p).read()))\""
    n_loop = _probe(loop_cmd)
    if n_loop is not None:
      facts["d13_loop_broken"] = fact(
          "两条自我放大环已断（断环不靠节流）：① refresh() 幂等化（_lastNotifiedActiveFile + 条目三元组比对）——环 A subscribe→checkAll→checkPhysical×4→storage.list→refresh→notify 的闭合边；② addpath 按路径指纹去重（_lastAddpathKey）——环 B idle→syncToEngine→eval(addpath)→idle 的闭合边。实测：环 A 39,803 次对账 → RSS +8.9→-0.11 MB/s；环 B 200 次 sync/2s → 2 次 sync/1 次 eval。反向断言 5 条（★ 对旧实现红）",
          loop_cmd,
          "内容仓 098 (D13) / 架构扫描候选 1",
          "票面 gate: 锚点；双计数器都应在（=2）",
          replay=False,
          # 期望跟随探针输出，不写死 "2"：跨仓夹具里源文件不在 ⇒ 探针返回 None
          # ⇒ 整个键不进台账（跳过而非红）。写死等于把本仓形状冒充成普适判据。
          witness=loop_cmd, witness_expect=n_loop,
      )

    return facts


