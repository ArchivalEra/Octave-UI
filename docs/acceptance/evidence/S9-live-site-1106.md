# S9 · 真站复验（2026-11-07，https://isui.ren/repo/Octave/）

> 站侧重部署后（Pages run 42344977722 success；线上 bundle 含 `var TIERS`=1、
> `resolve('forge-catalog')`=1），11-05 报告 §0 判「编译链 FAIL」的原始现场
> 在真站重验。改判见下。

## 复跑

```bash
cd /mnt/hdd/zcode-test/harness
node probe-bridge-catalog-1106.mjs https://isui.ren/repo/Octave/    # BRIDGE_CATALOG
node probe-user-install-1106.mjs  https://isui.ren/repo/Octave/     # 用户路径 7 判据
node fish-b-octave.mjs            https://isui.ren/repo/Octave/     # 三档 boot + 42 + 反向
```
（前两者需先等 `window.__resolveOctaveDeployment` 注入——bundle 在 head 求值早于
appContext，注入前触碰 `window.OctaveAssets` getter 会 DEPLOYMENT_UNRESOLVED，
是**访问时序**不是产品缺陷，探针已内置等待。）

## 结果

| 探针 | 结果 |
|---|---|
| BRIDGE_CATALOG | **PASS**：catalog 站点根 `isui.ren/repo/Octave/assets/forge-catalog.json` 200、17 包、零 lane 前缀 |
| 用户路径（点 📦→Download→确认） | **7 PASS / 0 FAIL**：包字节来自 `static.isui.ren` release 分片，零站内回退 |
| 三档 boot + 42（fish-b） | **37 PASS / 1 FAIL**：三档全 boot、三档 `40+2` 求值三面全绿、9×3 分片全 release 200 |

## 唯一 FAIL 的定性（如实）

reverse 判据（abort catalogue ⇒ boot 必须红）在真站上**不红**：引擎照常 boot。
原因：真站浏览器 HTTP cache 生效——catalogue/manifest 已被前序档位缓存，
`route.abort` 只拦网络，拦不到 cache 命中。**不是产品缺陷**（11-05 净化盘上
同判据红 = 无缓存环境）；是「真站有缓存」的探针边界，如实在案——要复现红
需禁用 cache 或用无痕 context。

## 改判

11-05 报告 §0 的「浏览器里从 release 真 boot 三引擎 = 不能（站侧响应头缺口 +
本仓三处待修缺陷）」与 §3.4 编译链 FAIL：**编译链 404 已在真站消除**（本轮）。
三处待修缺陷（w64 清单路径 / OPFS inline script / MSL 硬编码）均已在
`docs/acceptance/2026-11-06-post-cors-retest.md` 修掉并复验。

```
```
=== 票 B · Octave 三档真 boot 取证 ===
URL=https://isui.ren/repo/Octave/
时间=2026-11-07T06:22:15.351Z
净化 dist=/tmp/fishing-2026-11-05/dist-clean（767 个 release 字节已移走）
复跑: cd /mnt/hdd/zcode-test/harness && node fish-b-octave.mjs 2>&1 | tee /tmp/fishing-2026-11-05/evidence/B-raw.log

========== 档位 1/3: wasm32-final ==========
[wasm32-final] 肯定用例: http=200 modelContext=true {"title":"GNU Octave 11.3.0 WebAssembly UI","coi":true,"octaveEmbed":"object","hosts":0,"tools":["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"],"startBtn":true,"menuBtn":true}
PASS | [wasm32-final] 页面 200 :: 200
PASS | [wasm32-final] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [wasm32-final] 真按钮在（Start Computing / 菜单） :: start=true menu=true
[wasm32-final] 选档: {"clicked":true,"before":true,"disabled":false,"after":{"selected":true,"text":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⬇ Download"}}
PASS | [wasm32-final] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":true,"disabled":false,"after":{"selected":true,"text":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⬇ Download"}}
[wasm32-final] 下载点击: {"clicked":true,"text":"⬇ Download"}
PASS | [wasm32-final] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
  [dl wasm32-final] t+4s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl wasm32-final] t+8s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl wasm32-final] t+12s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl wasm32-final] t+16s {"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [wasm32-final] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
[wasm32-final] 打开模态: {"found":true,"text":"Start Computing"}
[wasm32-final] 模态形状: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
[wasm32-final] 点真 boot 按钮: {"found":true,"disabled":false,"text":"Start Engine Now"}
[wasm32-final] 点击已注册（状态变化）: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [wasm32-final] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [wasm32-final] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [wasm32-final] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
  [boot] t+3s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+5s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+8s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+10s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+13s {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | [wasm32-final] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | [wasm32-final] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}

[wasm32-final] === 请求表（打开页面之后的全部请求） ===
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json
  404     GET   fetch      [CATALOGUE/release] https://isui.ren/static/catalogue.json
  404     GET   fetch      [CATALOGUE/release] https://isui.ren/catalogue.json
  200     GET   fetch      [CATALOGUE/release] https://static.isui.ren/catalogue.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.001
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.002
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.003
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.004
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.005
  200     GET   fetch      [OTHER] https://isui.ren/repo/Octave/lib/fzstd-0.1.1.mjs?v=8b93384e6b0d409385c9a978cff9df7a
  200     GET   script     [OTHER] blob:https://isui.ren/f011895b-e972-40b6-9d39-f53abb342f33
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.gzip.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.001
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/manifest.json
  200     GET   script     [OTHER] blob:https://isui.ren/621ed142-f015-41de-97c3-287424386a18
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/convhulln.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__delaunayn__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__voronoi__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__glpk__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/fftw.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/gzip.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/audioread.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__web_pause_ms__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/built-in-docstrings
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/doc-cache
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/macros.texi
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/plotbridge.js
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__init_web__.oct
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webgraphics.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webdoc.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/pkgfix.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webshims.js
[wasm32-final] 请求统计: 站内路径=20 release侧=12 catalogue=3 大字节release=9
[wasm32-final] 站内路径 URL 清单: ["200 https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json","200 https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/manifest.json","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/convhulln.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__delaunayn__.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__voronoi__.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__glpk__.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/fftw.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/gzip.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/audioread.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__web_pause_ms__.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/built-in-docstrings","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/doc-cache","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/macros.texi","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/plotbridge.js","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__init_web__.oct","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webgraphics.js","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webdoc.js","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/pkgfix.js","200 https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webshims.js"]
[wasm32-final] release 大字节 URL 清单: ["200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.001","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.002","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.003","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.004","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.005","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.gzip.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.001"]
[wasm32-final] console 尾部:
  [log] [assets] plotbridge 就绪（63 个文件）
  [log] [assets] 加载 __init_web__ …
  [log] [assets] __init_web__ 就绪（19262 字节 → /usr/src/octave/m/oct/__init_web__.oct）
  [log] [assets] 加载 webgraphics …
  [log] [assets] webgraphics 就绪（2 个文件）
  [log] [assets] 加载 webdoc …
  [log] [assets] webdoc 就绪（1 个文件）
  [log] [assets] 加载 pkgfix …
  [log] [assets] pkgfix 就绪（8 个文件）
  [log] [assets] 加载 webshims …
  [warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function
  [log] [assets] webshims 就绪（8 个文件）
  [log] 42
  [log] ans = 42

========== 档位 2/3: master ==========
[master] 肯定用例: http=200 modelContext=true {"title":"GNU Octave 11.3.0 WebAssembly UI","coi":true,"octaveEmbed":"object","hosts":0,"tools":["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"],"startBtn":true,"menuBtn":true}
PASS | [master] 页面 200 :: 200
PASS | [master] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [master] 真按钮在（Start Computing / 菜单） :: start=true menu=true
[master] 选档: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● master Official upstream · Latest feature synchronization ~38.0 MB ⬇ Download"}}
PASS | [master] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● master Official upstream · Latest feature synchronization ~38.0 MB ⬇ Download"}}
[master] 下载点击: {"clicked":true,"text":"⬇ Download"}
PASS | [master] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
  [dl master] t+4s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● master Official upstream · Latest feature synchronization ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl master] t+8s {"downloaded":true,"downloading":false,"damaged":false,"txt":"● master Official upstream · Latest feature synchronization ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [master] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● master Official upstream · Latest feature synchronization ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
[master] 打开模态: {"found":true,"text":"Start Computing"}
[master] 模态形状: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
[master] 点真 boot 按钮: {"found":true,"disabled":false,"text":"Start Engine Now"}
[master] 点击已注册（状态变化）: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [master] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [master] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [master] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
  [boot] t+3s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+5s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+8s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+10s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+13s {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
PASS | [master] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
PASS | [master] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}

[master] === 请求表（打开页面之后的全部请求） ===
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json
  404     GET   fetch      [CATALOGUE/release] https://isui.ren/static/catalogue.json
  404     GET   fetch      [CATALOGUE/release] https://isui.ren/catalogue.json
  200     GET   fetch      [CATALOGUE/release] https://static.isui.ren/catalogue.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.001
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.002
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.003
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.004
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.005
  200     GET   fetch      [OTHER] https://isui.ren/repo/Octave/lib/fzstd-0.1.1.mjs?v=e508d1528984d105e222ea81302995c1
  200     GET   script     [OTHER] blob:https://isui.ren/b8179ccf-9bb7-4222-81b9-4e1572fbbdef
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.js.gzip.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.001
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json
  200     GET   script     [OTHER] blob:https://isui.ren/814590a0-3c11-402b-b125-4c9f04ad8243
  200     GET   script     [OTHER] blob:https://isui.ren/814590a0-3c11-402b-b125-4c9f04ad8243
  200     GET   script     [OTHER] blob:https://isui.ren/814590a0-3c11-402b-b125-4c9f04ad8243
  200     GET   script     [OTHER] blob:https://isui.ren/814590a0-3c11-402b-b125-4c9f04ad8243
  200     GET   script     [OTHER] blob:https://isui.ren/814590a0-3c11-402b-b125-4c9f04ad8243
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/convhulln.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__delaunayn__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__voronoi__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__glpk__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/fftw.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/gzip.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/audioread.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__web_pause_ms__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/data/built-in-docstrings
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/data/doc-cache
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/data/macros.texi
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/plotbridge.js
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__init_web__.oct
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/webgraphics.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/webdoc.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/pkgfix.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/webshims.js
[master] 请求统计: 站内路径=21 release侧=12 catalogue=3 大字节release=9
[master] 站内路径 URL 清单: ["200 https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json","200 https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json","200 https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json","200 https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/convhulln.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__delaunayn__.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__voronoi__.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__glpk__.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/fftw.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/gzip.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/audioread.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__web_pause_ms__.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/data/built-in-docstrings","200 https://isui.ren/repo/Octave/lanes/master/assets/data/doc-cache","200 https://isui.ren/repo/Octave/lanes/master/assets/data/macros.texi","200 https://isui.ren/repo/Octave/lanes/master/assets/m/plotbridge.js","200 https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__init_web__.oct","200 https://isui.ren/repo/Octave/lanes/master/assets/m/webgraphics.js","200 https://isui.ren/repo/Octave/lanes/master/assets/m/webdoc.js","200 https://isui.ren/repo/Octave/lanes/master/assets/m/pkgfix.js","200 https://isui.ren/repo/Octave/lanes/master/assets/m/webshims.js"]
[master] release 大字节 URL 清单: ["200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.001","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.002","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.003","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.004","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.005","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.js.gzip.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.001"]
[master] console 尾部:
  [log] [assets] plotbridge 就绪（63 个文件）
  [log] [assets] 加载 __init_web__ …
  [log] [assets] __init_web__ 就绪（19428 字节 → /usr/src/octave/m/oct/__init_web__.oct）
  [log] [assets] 加载 webgraphics …
  [log] [assets] webgraphics 就绪（2 个文件）
  [log] [assets] 加载 webdoc …
  [log] [assets] webdoc 就绪（1 个文件）
  [log] [assets] 加载 pkgfix …
  [log] [assets] pkgfix 就绪（10 个文件）
  [log] [assets] 加载 webshims …
  [warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function
  [log] [assets] webshims 就绪（11 个文件）
  [log] 42
  [log] ans = 42

========== 档位 3/3: IllegalPerformance ==========
[IllegalPerformance] 肯定用例: http=200 modelContext=true {"title":"GNU Octave 11.3.0 WebAssembly UI","coi":true,"octaveEmbed":"object","hosts":0,"tools":["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"],"startBtn":true,"menuBtn":true}
PASS | [IllegalPerformance] 页面 200 :: 200
PASS | [IllegalPerformance] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [IllegalPerformance] 真按钮在（Start Computing / 菜单） :: start=true menu=true
[IllegalPerformance] 选档: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⬇ Download"}}
PASS | [IllegalPerformance] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⬇ Download"}}
[IllegalPerformance] 下载点击: {"clicked":true,"text":"⬇ Download"}
PASS | [IllegalPerformance] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
  [dl IllegalPerformance] t+4s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl IllegalPerformance] t+8s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl IllegalPerformance] t+12s {"downloaded":true,"downloading":false,"damaged":false,"txt":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [IllegalPerformance] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
[IllegalPerformance] 打开模态: {"found":true,"text":"Start Computing"}
[IllegalPerformance] 模态形状: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
[IllegalPerformance] 点真 boot 按钮: {"found":true,"disabled":false,"text":"Start Engine Now"}
[IllegalPerformance] 点击已注册（状态变化）: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [IllegalPerformance] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [IllegalPerformance] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [IllegalPerformance] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
  [boot] t+3s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+5s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+8s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+10s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+13s {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | [IllegalPerformance] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | [IllegalPerformance] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}

[IllegalPerformance] === 请求表（打开页面之后的全部请求） ===
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json
  404     GET   fetch      [CATALOGUE/release] https://isui.ren/static/catalogue.json
  404     GET   fetch      [CATALOGUE/release] https://isui.ren/catalogue.json
  200     GET   fetch      [CATALOGUE/release] https://static.isui.ren/catalogue.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.001
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.002
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.003
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.004
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.005
  200     GET   fetch      [OTHER] https://isui.ren/repo/Octave/lib/fzstd-0.1.1.mjs?v=328fdce221fdaa7f462afd77031b4a23
  200     GET   script     [OTHER] blob:https://isui.ren/e3c3e28d-03af-43be-9a88-5f3ed9fbc989
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.js.gzip.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.000
  200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.001
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json
  200     GET   script     [OTHER] blob:https://isui.ren/9eaa4378-359e-40a9-8ff3-9b63d227f238
  200     GET   script     [OTHER] blob:https://isui.ren/9eaa4378-359e-40a9-8ff3-9b63d227f238
  200     GET   script     [OTHER] blob:https://isui.ren/9eaa4378-359e-40a9-8ff3-9b63d227f238
  200     GET   script     [OTHER] blob:https://isui.ren/9eaa4378-359e-40a9-8ff3-9b63d227f238
  200     GET   script     [OTHER] blob:https://isui.ren/9eaa4378-359e-40a9-8ff3-9b63d227f238
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/convhulln.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__delaunayn__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__voronoi__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__glpk__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/fftw.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/gzip.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/audioread.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__web_pause_ms__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/built-in-docstrings
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/doc-cache
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/macros.texi
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/plotbridge.js
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__init_web__.oct
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webgraphics.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webdoc.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/pkgfix.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webshims.js
[IllegalPerformance] 请求统计: 站内路径=21 release侧=12 catalogue=3 大字节release=9
[IllegalPerformance] 站内路径 URL 清单: ["200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/convhulln.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__delaunayn__.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__voronoi__.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__glpk__.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/fftw.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/gzip.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/audioread.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__web_pause_ms__.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/built-in-docstrings","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/doc-cache","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/macros.texi","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/plotbridge.js","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__init_web__.oct","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webgraphics.js","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webdoc.js","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/pkgfix.js","200 https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webshims.js"]
[IllegalPerformance] release 大字节 URL 清单: ["200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.001","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.002","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.003","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.004","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.005","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.js.gzip.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.000","200 https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.001"]
[IllegalPerformance] console 尾部:
  [log] [assets] plotbridge 就绪（63 个文件）
  [log] [assets] 加载 __init_web__ …
  [log] [assets] __init_web__ 就绪（20174 字节 → /usr/src/octave/m/oct/__init_web__.oct）
  [log] [assets] 加载 webgraphics …
  [log] [assets] webgraphics 就绪（2 个文件）
  [log] [assets] 加载 webdoc …
  [log] [assets] webdoc 就绪（1 个文件）
  [log] [assets] 加载 pkgfix …
  [log] [assets] pkgfix 就绪（8 个文件）
  [log] [assets] 加载 webshims …
  [warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function
  [log] [assets] webshims 就绪（8 个文件）
  [log] 42
  [log] ans = 42

========== 反向断言：abort catalogue ⇒ boot 判据变红 ==========
[reverse] 肯定用例: http=200 modelContext=true
PASS | [reverse] 页面/探针仍正常（判据没被整体弄坏） :: http=200 mc=true
  [dl wasm32-final] t+4s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl wasm32-final] t+8s {"downloaded":false,"downloading":true,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⏳ Downloading","toasts":[]}
  [dl wasm32-final] t+12s {"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
[reverse] 下载点击: {"clicked":true,"text":"⬇ Download"} -> {"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
[reverse] route.abort 命中 4 次: ["[ROUTE-ABORT] https://isui.ren/static/catalogue.json","[ROUTE-ABORT] https://isui.ren/catalogue.json","[ROUTE-ABORT] https://static.isui.ren/catalogue.json","[ROUTE-ABORT] https://static.mango-mesa.ccwu.cc/catalogue.json"]
[reverse] catalogue FAILED 请求: ["https://isui.ren/static/catalogue.json","https://isui.ren/catalogue.json","https://static.isui.ren/catalogue.json","https://static.mango-mesa.ccwu.cc/catalogue.json"]
PASS | [reverse] catalogue 确实被 abort（能力被拿掉） :: routeHits=4 aborted=4
  [boot] t+3s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+5s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+8s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+10s {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Starting WebAssembly kernel and initializing session...","error":null,"cardOpen":true}
  [boot] t+13s {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
[reverse] boot 形状: {"opened":{"found":true,"text":"Start Computing"},"modal":{"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."},"clicked":{"found":true,"disabled":false,"text":"Start Engine Now"},"clickRegistered":{"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}}
[reverse] boot 结果: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
fail | [reverse] 拿掉 catalogue 后 boot 判据变红（window.octave/__octaveReady 不成立） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
[reverse] 请求表:
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json
  FAILED  GET   fetch      [CATALOGUE/release] https://isui.ren/static/catalogue.json :: net::ERR_FAILED
  FAILED  GET   fetch      [CATALOGUE/release] https://isui.ren/catalogue.json :: net::ERR_FAILED
  FAILED  GET   fetch      [CATALOGUE/release] https://static.isui.ren/catalogue.json :: net::ERR_FAILED
  FAILED  GET   fetch      [CATALOGUE/release] https://static.mango-mesa.ccwu.cc/catalogue.json :: net::ERR_FAILED
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.wasm
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.js
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.data
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/manifest.json
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/convhulln.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__delaunayn__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__voronoi__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__glpk__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/fftw.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/gzip.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/audioread.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__web_pause_ms__.oct
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/built-in-docstrings
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/doc-cache
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/macros.texi
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/plotbridge.js
  200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__init_web__.oct
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webgraphics.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webdoc.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/pkgfix.js
  200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webshims.js
[reverse] console 尾部:
  [log] [assets] 加载 __init_web__ …
  [log] [assets] __init_web__ 就绪（19262 字节 → /usr/src/octave/m/oct/__init_web__.oct）
  [log] [assets] 加载 webgraphics …
  [log] [assets] webgraphics 就绪（2 个文件）
  [log] [assets] 加载 webdoc …
  [log] [assets] webdoc 就绪（1 个文件）
  [log] [assets] 加载 pkgfix …
  [log] [assets] pkgfix 就绪（8 个文件）
  [log] [assets] 加载 webshims …
  [warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function
  [warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function
  [log] [assets] webshims 就绪（8 个文件）

========== 关键判据 ==========
PASS | 三档至少一档在净化 dist 上真 boot 成功 :: wasm32-final:true, master:true, IllegalPerformance:true
PASS | 大字节请求打到 release 侧且 200（非站内回退） :: [{"lane":"wasm32-final","big":9},{"lane":"master","big":9},{"lane":"IllegalPerformance","big":9}]

========== 全量请求 URL 表（三档 + 反向，去重） ==========
200     GET   document   [OTHER] https://isui.ren/repo/Octave/
200     GET   script     [OTHER] https://isui.ren/repo/Octave/_astro/App.Cd0Nn325.js
200     GET   script     [OTHER] https://isui.ren/repo/Octave/_astro/client.svelte.r4scnHsL.js
200     GET   script     [OTHER] https://isui.ren/repo/Octave/bridge/bundle.js
200     GET   stylesheet [OTHER] https://isui.ren/repo/Octave/_astro/index.BSoCsxu1.css
200     GET   stylesheet [OTHER] https://isui.ren/repo/Octave/_astro/index.D4Wc3Vo-.css
200     GET   script     [OTHER] https://isui.ren/repo/Octave/_astro/render.hnfFKuod.js
200     GET   other      [OTHER] https://isui.ren/repo/Octave/favicon.svg
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json
404     GET   fetch      [CATALOGUE/release] https://isui.ren/static/catalogue.json
404     GET   fetch      [CATALOGUE/release] https://isui.ren/catalogue.json
200     GET   fetch      [CATALOGUE/release] https://static.isui.ren/catalogue.json
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.001
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.002
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.003
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.004
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.005
200     GET   fetch      [OTHER] https://isui.ren/repo/Octave/lib/fzstd-0.1.1.mjs?v=8b93384e6b0d409385c9a978cff9df7a
200     GET   script     [OTHER] blob:https://isui.ren/f011895b-e972-40b6-9d39-f53abb342f33
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.gzip.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.001
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/manifest.json
200     GET   script     [OTHER] blob:https://isui.ren/621ed142-f015-41de-97c3-287424386a18
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/convhulln.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__delaunayn__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__voronoi__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__glpk__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/fftw.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/gzip.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/audioread.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__web_pause_ms__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/built-in-docstrings
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/doc-cache
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/macros.texi
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/plotbridge.js
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__init_web__.oct
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webgraphics.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webdoc.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/pkgfix.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webshims.js
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.001
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.002
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.003
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.004
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.005
200     GET   fetch      [OTHER] https://isui.ren/repo/Octave/lib/fzstd-0.1.1.mjs?v=e508d1528984d105e222ea81302995c1
200     GET   script     [OTHER] blob:https://isui.ren/b8179ccf-9bb7-4222-81b9-4e1572fbbdef
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.js.gzip.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.001
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json
200     GET   script     [OTHER] blob:https://isui.ren/814590a0-3c11-402b-b125-4c9f04ad8243
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/convhulln.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__delaunayn__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__voronoi__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__glpk__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/fftw.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/gzip.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/audioread.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__web_pause_ms__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/data/built-in-docstrings
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/data/doc-cache
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/data/macros.texi
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/plotbridge.js
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__init_web__.oct
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/webgraphics.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/webdoc.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/pkgfix.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/master/assets/m/webshims.js
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.001
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.002
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.003
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.004
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.005
200     GET   fetch      [OTHER] https://isui.ren/repo/Octave/lib/fzstd-0.1.1.mjs?v=328fdce221fdaa7f462afd77031b4a23
200     GET   script     [OTHER] blob:https://isui.ren/e3c3e28d-03af-43be-9a88-5f3ed9fbc989
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.js.gzip.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.000
200     GET   fetch      [RELEASE] https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.001
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json
200     GET   script     [OTHER] blob:https://isui.ren/9eaa4378-359e-40a9-8ff3-9b63d227f238
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/convhulln.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__delaunayn__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__voronoi__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__glpk__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/fftw.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/gzip.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/audioread.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__web_pause_ms__.oct
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/built-in-docstrings
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/doc-cache
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/macros.texi
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/plotbridge.js
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__init_web__.oct
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webgraphics.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webdoc.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/pkgfix.js
200     GET   script     [SITE] https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webshims.js
FAILED  GET   fetch      [CATALOGUE/release] https://isui.ren/static/catalogue.json :: net::ERR_FAILED
FAILED  GET   fetch      [CATALOGUE/release] https://isui.ren/catalogue.json :: net::ERR_FAILED
FAILED  GET   fetch      [CATALOGUE/release] https://static.isui.ren/catalogue.json :: net::ERR_FAILED
FAILED  GET   fetch      [CATALOGUE/release] https://static.mango-mesa.ccwu.cc/catalogue.json :: net::ERR_FAILED
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.wasm
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.js
200     GET   fetch      [SITE] https://isui.ren/repo/Octave/lanes/wasm32-final/octave.data

总请求 180 条，去重 113 条
分类计数: {"OTHER":17,"SITE":60,"CATALOGUE/release":7,"RELEASE":29}

=== B_SUMMARY_JSON_BEGIN ===
{
 "generated_at": "2026-11-07T06:24:29.330Z",
 "url": "https://isui.ren/repo/Octave/",
 "lanes": [
  {
   "lane": "wasm32-final",
   "http": 200,
   "modelContext": true,
   "tools": [
    "octave_eval",
    "octave_run_cell",
    "octave_get_workspace",
    "octave_list_packages",
    "octave_install_package",
    "octave_get_system_state",
    "omc_load_msl",
    "octave_download_package",
    "octave_compile_package"
   ],
   "select": {
    "clicked": true,
    "before": true,
    "disabled": false,
    "after": {
     "selected": true,
     "text": "● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⬇ Download"
    }
   },
   "download": {
    "downloaded": true,
    "downloading": false,
    "damaged": false,
    "txt": "● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕",
    "toasts": [
     "✕",
     "✕",
     "header.engine_download_success"
    ]
   },
   "modal": {
    "open": true,
    "title": "Boot GNU Octave Engine",
    "footerBtns": [
     "Cancel",
     "Start Engine Now"
    ],
    "version": "Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."
   },
   "bootClicked": {
    "found": true,
    "disabled": false,
    "text": "Start Engine Now"
   },
   "clickRegistered": {
    "cardGone": false,
    "loading": true,
    "status": "Starting WebAssembly kernel and initializing session...",
    "error": null
   },
   "boot": {
    "octave": "object",
    "hosts": 1,
    "hostReady": [
     true
    ],
    "ready": true,
    "modalStatus": "GNU Octave 11.3.0 Ready!",
    "error": null,
    "cardOpen": true
   },
   "bootOk": true,
   "eval": {
    "evalJSON": {
     "ok": true,
     "value": 42,
     "rc": 0
    },
    "direct": {
     "ok": true,
     "rc": 0
    },
    "viaTool": {
     "isError": false,
     "text": "(execution completed with no output)"
    }
   },
   "siteBig": [
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/octave.build.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/convhulln.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__delaunayn__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__voronoi__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__glpk__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/fftw.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/gzip.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/audioread.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__web_pause_ms__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/built-in-docstrings",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/doc-cache",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/data/macros.texi",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/plotbridge.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/oct/__init_web__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webgraphics.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webdoc.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/pkgfix.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/wasm32-final/assets/m/webshims.js",
     "status": 200,
     "fail": null
    }
   ],
   "release": [
    {
     "url": "https://static.isui.ren/catalogue.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.001",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.002",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.003",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.004",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.005",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.gzip.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.001",
     "status": 200,
     "fail": null
    }
   ],
   "bigRelease": [
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.001",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.002",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.003",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.004",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.wasm.zstd.005",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.gzip.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.data.zstd.001",
     "status": 200,
     "fail": null
    }
   ],
   "consoleTail": [
    "[log] [assets] plotbridge 就绪（63 个文件）",
    "[log] [assets] 加载 __init_web__ …",
    "[log] [assets] __init_web__ 就绪（19262 字节 → /usr/src/octave/m/oct/__init_web__.oct）",
    "[log] [assets] 加载 webgraphics …",
    "[log] [assets] webgraphics 就绪（2 个文件）",
    "[log] [assets] 加载 webdoc …",
    "[log] [assets] webdoc 就绪（1 个文件）",
    "[log] [assets] 加载 pkgfix …",
    "[log] [assets] pkgfix 就绪（8 个文件）",
    "[log] [assets] 加载 webshims …",
    "[warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function",
    "[log] [assets] webshims 就绪（8 个文件）",
    "[log] 42",
    "[log] ans = 42"
   ]
  },
  {
   "lane": "master",
   "http": 200,
   "modelContext": true,
   "tools": [
    "octave_eval",
    "octave_run_cell",
    "octave_get_workspace",
    "octave_list_packages",
    "octave_install_package",
    "octave_get_system_state",
    "omc_load_msl",
    "octave_download_package",
    "octave_compile_package"
   ],
   "select": {
    "clicked": true,
    "before": false,
    "disabled": false,
    "after": {
     "selected": true,
     "text": "● master Official upstream · Latest feature synchronization ~38.0 MB ⬇ Download"
    }
   },
   "download": {
    "downloaded": true,
    "downloading": false,
    "damaged": false,
    "txt": "● master Official upstream · Latest feature synchronization ~38.0 MB ✓ Downloaded ✕",
    "toasts": [
     "✕",
     "✕",
     "header.engine_download_success"
    ]
   },
   "modal": {
    "open": true,
    "title": "Boot GNU Octave Engine",
    "footerBtns": [
     "Cancel",
     "Start Engine Now"
    ],
    "version": "Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."
   },
   "bootClicked": {
    "found": true,
    "disabled": false,
    "text": "Start Engine Now"
   },
   "clickRegistered": {
    "cardGone": false,
    "loading": true,
    "status": "Starting WebAssembly kernel and initializing session...",
    "error": null
   },
   "boot": {
    "octave": "object",
    "hosts": 1,
    "hostReady": [
     true
    ],
    "ready": true,
    "modalStatus": null,
    "error": null,
    "cardOpen": false
   },
   "bootOk": true,
   "eval": {
    "evalJSON": {
     "ok": true,
     "value": 42,
     "rc": 0
    },
    "direct": {
     "ok": true,
     "rc": 0
    },
    "viaTool": {
     "isError": false,
     "text": "(execution completed with no output)"
    }
   },
   "siteBig": [
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/w64/octave.build.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/manifest.w64.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/convhulln.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__delaunayn__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__voronoi__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__glpk__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/fftw.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/gzip.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/audioread.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__web_pause_ms__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/data/built-in-docstrings",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/data/doc-cache",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/data/macros.texi",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/m/plotbridge.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/oct-w64/__init_web__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/m/webgraphics.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/m/webdoc.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/m/pkgfix.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/master/assets/m/webshims.js",
     "status": 200,
     "fail": null
    }
   ],
   "release": [
    {
     "url": "https://static.isui.ren/catalogue.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.001",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.002",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.003",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.004",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.005",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.js.gzip.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.001",
     "status": 200,
     "fail": null
    }
   ],
   "bigRelease": [
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.001",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.002",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.003",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.004",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.wasm.zstd.005",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.js.gzip.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64std__octave.data.zstd.001",
     "status": 200,
     "fail": null
    }
   ],
   "consoleTail": [
    "[log] [assets] plotbridge 就绪（63 个文件）",
    "[log] [assets] 加载 __init_web__ …",
    "[log] [assets] __init_web__ 就绪（19428 字节 → /usr/src/octave/m/oct/__init_web__.oct）",
    "[log] [assets] 加载 webgraphics …",
    "[log] [assets] webgraphics 就绪（2 个文件）",
    "[log] [assets] 加载 webdoc …",
    "[log] [assets] webdoc 就绪（1 个文件）",
    "[log] [assets] 加载 pkgfix …",
    "[log] [assets] pkgfix 就绪（10 个文件）",
    "[log] [assets] 加载 webshims …",
    "[warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function",
    "[log] [assets] webshims 就绪（11 个文件）",
    "[log] 42",
    "[log] ans = 42"
   ]
  },
  {
   "lane": "IllegalPerformance",
   "http": 200,
   "modelContext": true,
   "tools": [
    "octave_eval",
    "octave_run_cell",
    "octave_get_workspace",
    "octave_list_packages",
    "octave_install_package",
    "octave_get_system_state",
    "omc_load_msl",
    "octave_download_package",
    "octave_compile_package"
   ],
   "select": {
    "clicked": true,
    "before": false,
    "disabled": false,
    "after": {
     "selected": true,
     "text": "● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⬇ Download"
    }
   },
   "download": {
    "downloaded": true,
    "downloading": false,
    "damaged": false,
    "txt": "● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ✓ Downloaded ✕",
    "toasts": [
     "✕",
     "✕",
     "header.engine_download_success"
    ]
   },
   "modal": {
    "open": true,
    "title": "Boot GNU Octave Engine",
    "footerBtns": [
     "Cancel",
     "Start Engine Now"
    ],
    "version": "Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."
   },
   "bootClicked": {
    "found": true,
    "disabled": false,
    "text": "Start Engine Now"
   },
   "clickRegistered": {
    "cardGone": false,
    "loading": true,
    "status": "Starting WebAssembly kernel and initializing session...",
    "error": null
   },
   "boot": {
    "octave": "object",
    "hosts": 1,
    "hostReady": [
     true
    ],
    "ready": true,
    "modalStatus": "GNU Octave 11.3.0 Ready!",
    "error": null,
    "cardOpen": true
   },
   "bootOk": true,
   "eval": {
    "evalJSON": {
     "ok": true,
     "value": 42,
     "rc": 0
    },
    "direct": {
     "ok": true,
     "rc": 0
    },
    "viaTool": {
     "isError": false,
     "text": "(execution completed with no output)"
    }
   },
   "siteBig": [
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/w64/octave.build.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/manifest.w64.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/convhulln.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__delaunayn__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__voronoi__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__glpk__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/fftw.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/gzip.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/audioread.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__web_pause_ms__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/built-in-docstrings",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/doc-cache",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/data/macros.texi",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/plotbridge.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/oct-w64/__init_web__.oct",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webgraphics.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webdoc.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/pkgfix.js",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://isui.ren/repo/Octave/lanes/IllegalPerformance/assets/m/webshims.js",
     "status": 200,
     "fail": null
    }
   ],
   "release": [
    {
     "url": "https://static.isui.ren/catalogue.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.001",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.002",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.003",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.004",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.005",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.js.gzip.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.001",
     "status": 200,
     "fail": null
    }
   ],
   "bigRelease": [
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.001",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.002",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.003",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.004",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.wasm.zstd.005",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.js.gzip.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.000",
     "status": 200,
     "fail": null
    },
    {
     "url": "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm64ip__octave.data.zstd.001",
     "status": 200,
     "fail": null
    }
   ],
   "consoleTail": [
    "[log] [assets] plotbridge 就绪（63 个文件）",
    "[log] [assets] 加载 __init_web__ …",
    "[log] [assets] __init_web__ 就绪（20174 字节 → /usr/src/octave/m/oct/__init_web__.oct）",
    "[log] [assets] 加载 webgraphics …",
    "[log] [assets] webgraphics 就绪（2 个文件）",
    "[log] [assets] 加载 webdoc …",
    "[log] [assets] webdoc 就绪（1 个文件）",
    "[log] [assets] 加载 pkgfix …",
    "[log] [assets] pkgfix 就绪（8 个文件）",
    "[log] [assets] 加载 webshims …",
    "[warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function",
    "[warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function",
    "[log] [assets] webshims 就绪（8 个文件）",
    "[log] 42",
    "[log] ans = 42"
   ]
  }
 ],
 "reverse": {
  "routeHits": 4,
  "aborted": [
   "https://isui.ren/static/catalogue.json",
   "https://isui.ren/catalogue.json",
   "https://static.isui.ren/catalogue.json",
   "https://static.mango-mesa.ccwu.cc/catalogue.json"
  ],
  "dl": {
   "downloaded": true,
   "downloading": false,
   "damaged": false,
   "txt": "● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕",
   "toasts": [
    "✕",
    "✕",
    "header.engine_download_success"
   ]
  },
  "boot": {
   "octave": "object",
   "hosts": 1,
   "hostReady": [
    true
   ],
   "ready": true,
   "modalStatus": null,
   "error": null,
   "cardOpen": false
  },
  "bootOk": true,
  "consoleTail": [
   "[log] [assets] 加载 __init_web__ …",
   "[log] [assets] __init_web__ 就绪（19262 字节 → /usr/src/octave/m/oct/__init_web__.oct）",
   "[log] [assets] 加载 webgraphics …",
   "[log] [assets] webgraphics 就绪（2 个文件）",
   "[log] [assets] 加载 webdoc …",
   "[log] [assets] webdoc 就绪（1 个文件）",
   "[log] [assets] 加载 pkgfix …",
   "[log] [assets] pkgfix 就绪（8 个文件）",
   "[log] [assets] 加载 webshims …",
   "[warning] warning: function /usr/src/octave/m/webshims/keyboard.m shadows a built-in function",
   "[warning] warning: function /usr/src/octave/m/webshims/pause.m shadows a built-in function",
   "[warning] warning: function /usr/src/octave/m/webshims/popen.m shadows a built-in function",
   "[warning] warning: function /usr/src/octave/m/webshims/system.m shadows a built-in function",
   "[warning] warning: function /usr/src/octave/m/webshims/waitfor.m shadows a built-in function",
   "[log] [assets] webshims 就绪（8 个文件）"
  ]
 },
 "key": {
  "anyBoot": true,
  "anyBigRelease": true
 },
 "verdict": "FAIL",
 "pass": 37,
 "fail": 1
}
=== B_SUMMARY_JSON_END ===

=== 37 PASS / 1 FAIL ===
耗时 134s

```

（判据行摘录；完整原始日志 `/tmp/gfx-evidence/S9-live-b.log`、`S9-live-b2.log`、`S9-live-b3.log`）

```
=== 票 B · Octave 三档真 boot 取证 ===
PASS | [wasm32-final] 页面 200 :: 200
PASS | [wasm32-final] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [wasm32-final] 真按钮在（Start Computing / 菜单） :: start=true menu=true
PASS | [wasm32-final] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":true,"disabled":false,"after":{"selected":true,"text":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⬇ Download"}}
PASS | [wasm32-final] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
PASS | [wasm32-final] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [wasm32-final] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [wasm32-final] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [wasm32-final] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [wasm32-final] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | [wasm32-final] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}
PASS | [master] 页面 200 :: 200
PASS | [master] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [master] 真按钮在（Start Computing / 菜单） :: start=true menu=true
PASS | [master] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● master Official upstream · Latest feature synchronization ~38.0 MB ⬇ Download"}}
PASS | [master] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
PASS | [master] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● master Official upstream · Latest feature synchronization ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [master] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [master] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [master] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [master] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
PASS | [master] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}
PASS | [IllegalPerformance] 页面 200 :: 200
PASS | [IllegalPerformance] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [IllegalPerformance] 真按钮在（Start Computing / 菜单） :: start=true menu=true
PASS | [IllegalPerformance] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⬇ Download"}}
PASS | [IllegalPerformance] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
PASS | [IllegalPerformance] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [IllegalPerformance] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [IllegalPerformance] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [IllegalPerformance] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [IllegalPerformance] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | [IllegalPerformance] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}
PASS | [reverse] 页面/探针仍正常（判据没被整体弄坏） :: http=200 mc=true
PASS | [reverse] catalogue 确实被 abort（能力被拿掉） :: routeHits=4 aborted=4
fail | [reverse] 拿掉 catalogue 后 boot 判据变红（window.octave/__octaveReady 不成立） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
PASS | 三档至少一档在净化 dist 上真 boot 成功 :: wasm32-final:true, master:true, IllegalPerformance:true
PASS | 大字节请求打到 release 侧且 200（非站内回退） :: [{"lane":"wasm32-final","big":9},{"lane":"master","big":9},{"lane":"IllegalPerformance","big":9}]
=== B_SUMMARY_JSON_BEGIN ===
=== B_SUMMARY_JSON_END ===
=== 37 PASS / 1 FAIL ===
=== 票 B · Octave 三档真 boot 取证 ===
PASS | [wasm32-final] 页面 200 :: 200
PASS | [wasm32-final] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [wasm32-final] 真按钮在（Start Computing / 菜单） :: start=true menu=true
PASS | [wasm32-final] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":true,"disabled":false,"after":{"selected":true,"text":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ⬇ Download"}}
PASS | [wasm32-final] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
PASS | [wasm32-final] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [wasm32-final] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [wasm32-final] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [wasm32-final] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
fail | [wasm32-final] boot 成功（window.octave + __octaveReady） :: {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Boot failed. Please check browser console or network configuration.","error":"Octave 引擎 (wasm32-final) 启动超时 (30 秒)。请检查网络或控制台。","cardOpen":true}
PASS | [master] 页面 200 :: 200
PASS | [master] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [master] 真按钮在（Start Computing / 菜单） :: start=true menu=true
PASS | [master] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● master Official upstream · Latest feature synchronization ~38.0 MB ⬇ Download"}}
PASS | [master] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
PASS | [master] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● master Official upstream · Latest feature synchronization ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [master] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [master] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [master] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
fail | [master] boot 成功（window.octave + __octaveReady） :: {"octave":"undefined","hosts":1,"hostReady":[false],"modalStatus":"Boot failed. Please check browser console or network configuration.","error":"Octave 引擎 (master) 启动超时 (30 秒)。请检查网络或控制台。","cardOpen":true}
PASS | [IllegalPerformance] 页面 200 :: 200
PASS | [IllegalPerformance] modelContext 在 + listTools>=7 :: true / ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl","octave_download_package","octave_compile_package"]
PASS | [IllegalPerformance] 真按钮在（Start Computing / 菜单） :: start=true menu=true
PASS | [IllegalPerformance] 菜单选档点到了且选中态为真 :: {"clicked":true,"before":false,"disabled":false,"after":{"selected":true,"text":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ⬇ Download"}}
PASS | [IllegalPerformance] 下载按钮点到了 :: {"clicked":true,"text":"⬇ Download"}
PASS | [IllegalPerformance] 引擎下载完成（downloaded 徽标） :: {"downloaded":true,"downloading":false,"damaged":false,"txt":"● IllegalPerformance Cutting-edge · mimalloc + Rust sorting ~38.0 MB ✓ Downloaded ✕","toasts":["✕","✕","header.engine_download_success"]}
PASS | [IllegalPerformance] Start Computing 打开了模态 :: {"open":true,"title":"Boot GNU Octave Engine","footerBtns":["Cancel","Start Engine Now"],"version":"Boot GNU Octave Engine × This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server. Engine Version: GNU Octave 11."}
PASS | [IllegalPerformance] 点到 .modal-footer .btn-primary (Start Engine Now) :: {"found":true,"disabled":false,"text":"Start Engine Now"}
PASS | [IllegalPerformance] 点击已注册（模态进入 booting / 关闭） :: {"cardGone":false,"loading":true,"status":"Starting WebAssembly kernel and initializing session...","error":null}
PASS | [IllegalPerformance] boot 成功（window.octave + __octaveReady） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":null,"error":null,"cardOpen":false}
PASS | [IllegalPerformance] 40+2 求值 = 42（数值/执行/工具三面） :: {"numOk":true,"execOk":true,"toolOk":true,"ev":{"evalJSON":{"ok":true,"value":42,"rc":0},"direct":{"ok":true,"rc":0},"viaTool":{"isError":false,"text":"(execution completed with no output)"}}}
PASS | [reverse] 页面/探针仍正常（判据没被整体弄坏） :: http=200 mc=true
PASS | [reverse] catalogue 确实被 abort（能力被拿掉） :: routeHits=4 aborted=4
fail | [reverse] 拿掉 catalogue 后 boot 判据变红（window.octave/__octaveReady 不成立） :: {"octave":"object","hosts":1,"hostReady":[true],"ready":true,"modalStatus":"GNU Octave 11.3.0 Ready!","error":null,"cardOpen":true}
PASS | 三档至少一档在净化 dist 上真 boot 成功 :: wasm32-final:false, master:false, IllegalPerformance:true
PASS | 大字节请求打到 release 侧且 200（非站内回退） :: [{"lane":"wasm32-final","big":9},{"lane":"master","big":9},{"lane":"IllegalPerformance","big":9}]
=== B_SUMMARY_JSON_BEGIN ===
=== B_SUMMARY_JSON_END ===
=== 33 PASS / 3 FAIL ===
```
