# 活状态（示例）

这个文件演示**活状态文档**该怎么写：正文只写「现在是什么」，**数字一律引用台账键**，
不手抄。机器维护的块在文件末尾。

- 本仓的脚本数：[[py_files]]（引用，不是手抄）。
- 本仓的文档数：[[md_files]]。
- 本仓 Python 代码行数：[[py_lines]]。
- 本仓 TypeScript 文件数：[[ts_files]]。
- 本仓 Svelte 5 组件与 Islands 数：[[svelte_files]]。
- 本仓 Astro 页面与布局数：[[astro_files]]。
- 本仓 Vitest 测试套件数：[[test_files]]。

> ⚠️ 上面三行就是正确写法。若把最后一行写成「本仓有 486 行 Python」，
> `check_facts.py` 会报**正文裸数字** —— 因为那个数字从写下的那一刻起就开始腐烂：
> 代码一增减，它就成了假话，而没人会记得回来改它。引用键名则永远不会过期。
> （判据默认查 ≥ 100 的整数，`REFLECT_NAKED_MIN` 可调 —— `1`/`2` 这类小数字
> 遍地都是，查了全是噪音；围栏代码块 / 行内代码内的数字豁免，复跑命令天然带数字。）

## 现在是什么

- **两道守卫生效中**：重测时掉条（键没了）与改口（值换了）都会拒绝写盘，除非显式
  `--allow-drop` / `--accept-changes`（后者支持逐条：`--accept-changes=k1,k2`
  只放行列出的键，其余照旧拒绝）。
- **六道闸门在线**：`check_facts`（块一致性 / 裸数字 / 坏引用）、`check_facts_replay`
  （台账 `cmd` 逐字复跑，stdout 必须等于值；贵事实可挂 witness
  见证来源 —— 每提交真跑，issue #5）、`check_retractions`（翻案重现；
  扫描面 = `REFLECT_DOCS` 清单）、`check_questions`（悬案必须挂结算件）、
  `check_readme_sync`（三语 README 同批：结构互链 + 推送集必须含全部名单）、
  `check_stale`（sha 出处 / 退役名 / 测龄：`REFLECT_STALE_DAYS` 开启）。
- **一条悬案**：见 `questions/01-example.md`。
- **CI 正面执行同一判据**：`gates` workflow 每推跑 `facts.py --check`
  + 六道闸门（每条 `cmd` 真的逐字复跑）；`readme-sync` 查三语同批。
  本地 hook 只约束跑过 install.sh 的机器（issue #4 ②）。
- **包管理器错误呈现链已落地**（wayfinder #14）：DX1 banner + code 双呈现
  （错误同时 toast 一条带 code 的短消息，`errors.*` 键表三语补齐 7 码全 +
  assets-loader 码子集）；DX2 loading/error 互斥（有 error ⇒ spinner 必停）+
  模态内重试按钮复用 `loadCatalog()`；R1 终端错误通道过 ErrorSanitizer
  （bridge 硬编码中文在消费端拦，locale 由组合根随语言切换下发）。
  判据锚点见 `[[pkg_error_toast_chain]]`；sync-lanes.sh 的 forge 族复制行
  （DX3）在 `wayfinder_gates.json` 的形状断言里。
- **假 seam 已清理**（wayfinder #10）：`src/lib/engine` 双壳物理删除
  （modules/ 为真产地）；DownloadStore 死接口核销走「生产零消费者 grep」
  逐个判（`unit()` 实锤删除，getRecord/index/checkQuota/download 族均有
  真实消费者保留）；ProjectWorkspace 的 downloadStore 零逻辑透传拆除
  （调用点直连 appContext 单例）+ `syncFilesToEngine` 走 `supervisor.fsWrite`
  （同一概念一条路径）；引擎 ref 构造收单进 `engineRef` 工厂
  （omc version 如实 `-rust`——Q6C）。判据锚点见 `[[fake_seams_purged]]`；
  `src/lib/engine` 不存在与版本字面量形状在 `wayfinder_gates.json` 断言里。

## 那条示例翻案

活状态里提到被推翻的断言时，**必须带更正标记**，否则 `check_retractions.py` 会报。
下面这行的写法是合法的（它记录了 R-001，并标明了它已被推翻）：

> ZCODE_REFLECT_TYPO 这条是**已翻案的示例**，见 `retractions.json` 的 R-001。

<!-- AUTO:FACTS -->
> 本区块由 `zreflect/facts.py --render-doc` 从 `FACTS.json` 渲染，**不要手改**（pre-commit 会重算并 `git add`）。
> 正文里的「测出来的数字」只在这里生产：要引用就写 `[[键名]]`，不要手抄数字。

| 键 | 值 | 测于 | 复跑命令 |
|---|---|---|---|
| `astro_files` | **2** | 2026-10-25T18:02:50+0800 | `find . -path './src/*' -name '*.astro' | wc -l` |
| `download_event_two_shot` | **DownloadStore.download() 通知通道统一：三发收敛两发（start null 进 downloading 态 + 终态一次——成功 record / 失败 catch 里 null 后 rethrow，finally 中间那次删除）；终态后显式调 EngineAssetResolver.getInstance().invalidateCache(lane)（#7 显式方法，engine ref 才挂，lane 推法与 removeEngine 同款）⇒ 成功与失败两路单例缓存都失效（tests/storage/DownloadStore.test.ts 3 新用例：事件数===2×2 + 失效挂点 spy 双路，2026-10-23 实测 336/336 绿）** | 2026-10-25T18:02:50+0800 | `pnpm test -- tests/storage/DownloadStore.test.ts` |
| `engine_layer_no_ui_import` | **engine 层 6 个 ts 文件中含 toastService 的文件数 = 0（应为 0；（OmcBridge 抽离 + 三条 UI 旁路拔除；tests/engine/OmcBridge.test.ts 11 用例，2026-10-22 实测 322/322 绿）** | 2026-10-25T18:02:50+0800 | `python3 -c "import os, glob; fs=glob.glob('src/modules/engine/*.ts'); print(sum(open(f).read().count('toastService') for f in fs) if fs else 'absent')"` |
| `fake_seams_purged` | **假 seam 清理（wayfinder #10）：src/lib/engine 双壳物理删除（modules/ 为真产地，壳的自证用例同步删）；DownloadStore unit() 死接口核销（生产零消费者）+ 其余公开接口逐一grep 核销（getRecord/index/checkQuota/download/downloadEngine/removeEngine/isEngineDownloading 均有真实消费者，保留）；ProjectWorkspace 7 个 downloadStore 零逻辑透传拆除（HeaderBar 直连appContext downloadStore 单例）+ syncFilesToEngine 直取 adapter.fs.write 改走 supervisor.fsWrite；engineRef 工厂收 7 产地（omc version 如实 '-rust'，Q6C）（tests/engine/ 两文件 + tests/storage/DownloadStore.test.ts + tests/workspace/ProjectWorkspace.test.ts，2026-10-23 实测 346/346 绿）** | 2026-10-25T18:02:50+0800 | `pnpm test` |
| `get_assets_port_alive` | **getAssetsPort() 定义存在且被 appContext catalogProvider 闭包真实调用（tests/plugins/PackageManagerPlugin.test.ts 5 用例，2026-10-22 实测 296/296 绿；tsc 死缝错误消失 61→60）** | 2026-10-25T18:02:50+0800 | `python3 -c "import os; p='src/modules/plugins/package/PackageManagerPlugin.ts'; print(open(p).read().count('getAssetsPort') if os.path.exists(p) else 'absent')"` |
| `header_integrity_badge` | **HeaderBar 徽标三态消费引擎层 integrity（12 处引用）；corrupted ⇒ ⚠ 已损坏、verified/unchecked ⇒ ✓、未下载 ⇒ 下载按钮；三语 header.corrupted_badge（tests/ui/HeaderBar.svelte.test.ts 6 用例，2026-10-23 实测 362/362 绿）** | 2026-10-25T18:02:50+0800 | `python3 -c "import os; p='src/components/HeaderBar.svelte'; print(open(p).read().count('integrity') if os.path.exists(p) else 'absent')"` |
| `integrity_check_physical` | **integrity: 完整盘面与记账逐项对上 ⇒ verified / 截断 ⇒ corrupted / 篡改(XOR) ⇒ corrupted / 缓存零重算 / 失效重读 / 无记账 ⇒ unchecked / evict ⇒ false（tests/engine/EngineAssetResolver.test.ts，2026-10-22 实测 291/291 绿）** | 2026-10-25T18:02:50+0800 | `pnpm test -- tests/engine/EngineAssetResolver.test.ts` |
| `md_files` | **73** | 2026-10-25T18:02:50+0800 | `find . -name '*.md' -not -path './.git/*' -not -path './node_modules/*' | wc -l` |
| `md_lines` | **5235** | 2026-10-25T18:02:50+0800 | `find . -name '*.md' -not -path './.git/*' -not -path './node_modules/*' -exec awk 'FNR==1{b=0} /<!-- AUTO:FACTS -->/{b=1} !b' {} + | wc -l` |
| `offline_boot_five_piece` | **boot OPFS 优先（verified ⇒ getBlob 读 octave.js 注入，未下载走网络，corrupted ⇒ throw ENGINE_CORRUPTED）+ matchRequest 两拦截键（assets/manifest.json 映射平铺名 assets-manifest.json、octave.build.json；w64 档 manifest.w64.json 不拦）+ 五件指纹（删 assets-manifest 后缓存不命中 ⇒ corrupted）（tests/engine/ 两文件 + DownloadStore 五件套记账，2026-10-23 实测 326/326 绿）** | 2026-10-25T18:02:50+0800 | `pnpm test -- tests/engine/EngineAssetResolver.test.ts tests/engine/WasmEmbedAdapter.test.ts` |
| `pkg_error_toast_chain` | **包管理器错误呈现链（wayfinder #14）：DX1 banner+code 双呈现（错误同时 toastService.error(短消息, code)——toast-code-badge 消费 code；errors.* 键表三语补齐 7 码全 + assets-loader 14 码子集）；DX2 loading/error 互斥（有 error ⇒ spinner 零命中）+ 重试按钮调 loadCatalog()（#8 已救活）re-fetch 计数+1；R1 终端 onError 通道接 ErrorSanitizer（bridge 硬编码中文在消费端拦，三语各测）（tests/ui/PackageManagerModal.svelte.test.ts 7 用例 + tests/terminal/TerminalController.test.ts R1 扩展 4 用例，2026-10-23 实测 347/347 绿）** | 2026-10-25T18:02:50+0800 | `pnpm test -- tests/ui/PackageManagerModal.svelte.test.ts tests/terminal/TerminalController.test.ts` |
| `plot_event_bus` | **页面级图表事件总线（wireFigureBusToSink 1 处）解耦装钩与收事件；钩子重赋值安全 + 空 URL 丢弃 + lastFigure 回放（tests/figure/P5FigureChain.test.ts 10 用例，其中 6 条对修复前代码全红）** | 2026-10-25T18:02:50+0800 | `python3 -c "import os; p='src/modules/figure/GraphicsSink.ts'; print(open(p).read().count('wireFigureBusToSink') if os.path.exists(p) else 'absent')"` |
| `plot_panel_figure_chain` | **GraphicsSink.onFigure 事件面 + wireFigureSource 转发单一出口 + P5 插件 Blob URL revoke（tests/figure/ 两文件 14 用例，2026-10-22 实测 311/311 绿）** | 2026-10-25T18:02:50+0800 | `python3 -c "import os; p='src/modules/figure/GraphicsSink.ts'; print(open(p).read().count('onFigure') if os.path.exists(p) else 'absent')"` |
| `py_files` | **31** | 2026-10-25T18:02:50+0800 | `find . -name '*.py' -not -path './.git/*' -not -path './node_modules/*' | wc -l` |
| `py_lines` | **7277** | 2026-10-25T18:02:50+0800 | `find . -name '*.py' -not -path './.git/*' -not -path './node_modules/*' -exec cat {} + | wc -l` |
| `sha_ledger_no_decoration` | **DownloadStore sha 台账去装饰化：源内 128hex 字面量 = 0 + combinedSha 拼接产地 = 0（三产地归一）；幂等比对换逐文件三元组（path/sha/bytes，undefined sha 跳 sha 维）⇒ 五件套重下 fetchPort 调用 = 0；intake 出口 64hex 断言（128hex/空串/大写 ⇒ INDEX_UNREADABLE）；KNOWN_ENGINE_METADATA 瘦身（键 omc、无顶层 bytes/sha256，bytes 从 files 累加）+ 多文件 record 顶层 sha = undefined（tests/storage/DownloadStore.test.ts + tests/plugins/PackageManagerPlugin.test.ts，2026-10-23 实测 333/333 绿）** | 2026-10-25T18:02:50+0800 | `pnpm test -- tests/storage/DownloadStore.test.ts tests/plugins/PackageManagerPlugin.test.ts` |
| `supervisor_no_mock_fallback` | **EngineSupervisor 生产路径零 MockEmbedAdapter 引用；无桥 ⇒ boot/recover throw BOOT_UNAVAILABLE + failed 态（tests/engine/EngineSupervisor.test.ts 18 用例含反向断言，2026-10-22 实测 297/297 绿）** | 2026-10-25T18:02:50+0800 | `python3 -c "import os; p='src/modules/engine/EngineSupervisor.ts'; print(open(p).read().count('MockEmbedAdapter') if os.path.exists(p) else 'absent')"` |
| `svelte_files` | **20** | 2026-10-25T18:02:50+0800 | `find . -path './src/*' -name '*.svelte' | wc -l` |
| `test_files` | **45** | 2026-10-25T18:02:50+0800 | `find . -path './tests/*' -name '*.test.ts' | wc -l` |
| `ts_files` | **123** | 2026-10-25T18:02:49+0800 | `find . \( -path './src/*' -o -path './tests/*' \) -name '*.ts' | wc -l` |

20 条事实。
<!-- /AUTO:FACTS -->

<!-- AUTO:GATES -->
> 本区块由 `zreflect/facts.py --render-doc` 从发现式名录（zreflect/registry.py 的声明行）渲染，**不要手改**。
> 执行面（hooks / CI）读 `registry --run <相位>` —— 相位是声明字段（`runs_at`），不是文件名。

| 闸门 | 相位 | 它挡住什么 | 消费的旋钮 |
|---|---|---|---|
| `check_ab.py`（A/B 闸门） | commit | A/B 同旗标不变式（非 allow 轴差异 = 混淆变量，A/B 作废） | `REFLECT_AB` |
| `check_envfile.py`（env 文件闸门） | commit | 守钩子的 REFLECT_* 载体（旋钮 typo / 指向缺失 / 空值） | `REFLECT_ENV_FILE` |
| `check_facts.py`（事实闸门） | commit | 块一致性 / 裸数字 / 坏引用 | `REFLECT_FACTS`, `REFLECT_DOC`, `REFLECT_NAKED_MIN` |
| `check_facts_replay.py`（复跑闸门） | commit | 台账 cmd 逐字复跑（裸值契约：stdout 必须等于值） | `REFLECT_FACTS`, `REFLECT_REPLAY`, `REFLECT_REPLAY_TIMEOUT` |
| `check_i18n.py`（i18n 硬编码闸门） | commit | 检查 Svelte 组件中未国际化的硬编码中文字符串 | — |
| `check_instruments.py`（仪器生命周期闸门） | commit | 恒常检测（first_seen）+ 被证伪量法登记 | `REFLECT_INSTRUMENTS`, `REFLECT_INSTRUMENT_DAYS`, `REFLECT_FACTS` |
| `check_invariants.py`（不变量闸门） | commit | 声明式不变量：仓库文件必须/不得含某片段（grep 级） | `REFLECT_INVARIANTS` |
| `check_locks.py`（锁定源闸门） | commit | 锁定源清单（URL + 文件 + sha256 的内容指纹） | `REFLECT_LOCKS` |
| `check_pins.py`（pin 闸门） | commit | 派生树 pin 一致性（stamp commit / dirty / 版本串对读） | `REFLECT_PINS` |
| `check_questions.py`（悬案闸门） | commit | 未结案的问题必须挂一个能跑的结算件 | `REFLECT_QUESTIONS` |
| `check_readme_sync.py`（三语 README 闸门） | commit | 语言版本是同一条断言的三份拷贝：结构互链 + 每次推送同批 | `REFLECT_READMES` |
| `check_retractions.py`（翻案重现检测） | commit | 被推翻的断言不许悄悄回来当现状 | `REFLECT_RETRACTIONS`, `REFLECT_DOCS`, `REFLECT_HISTORY_SECS` |
| `check_stale.py`（陈旧断言检测） | commit | sha 出处 / 退役名 / 测龄 | `REFLECT_DOCS`, `REFLECT_FACTS`, `REFLECT_HISTORY_SECS`, `REFLECT_RETIRED`, `REFLECT_STALE_DAYS` |
| `check_theme_tokens.py`（主题变量与硬编码颜色闸门） | commit | 检查 Svelte 组件中的 CSS 变量合法性与禁止硬编码十六进制颜色 | — |
| `check_wayfinder.py`（wayfinder 闸门） | commit | 决策票 gate: 锚点对账（台账键/闸门文件存在性）+ 形状断言收编（零网络） | `REFLECT_FACTS` |
| `check_world.py`（world 闸门） | commit | 声明式验证对象：多线仓库共享验证环境的世界对账 | `REFLECT_WORLD`, `REFLECT_WORLD_LINE` |
| `doctor.py`（开工预检 doctor） | start-of-work | 进程 / 端口活性（查会死的东西 ⇒ runs_at=start-of-work，不进 pre-commit） | `REFLECT_DOCTOR`, `REFLECT_DOCTOR_TIMEOUT` |

17 道闸门（发现式名录派生 —— 手写清单会漂，加闸门 = 落一个声明行，这里自动长出来）。
<!-- /AUTO:GATES -->
