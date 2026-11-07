# 票 C · 最终解耦版在真 OMC 引擎上的验收（2026-11-06，权威）

> 这一份取代 `C-2026-11-06-retest.md` 的 `19 PASS / 0 FAIL`：
> 后者采自**回退前**的「装载时现场从 release 装分片」耦合版
> （返回体 `source:"catalogue-release"`），已被 11-06 报告 §3.4 判定为破坏
> 「下载/装载解耦」并回退。本份用**最终代码**在真 UI 双引擎 boot 后重跑。
>
> 复跑：`cd /mnt/hdd/zcode-test/harness && node fish-c-final-1106.mjs main`
> 原始输出：`/tmp/msl-verify-2026-11-06/evidence/C-final-real-omc.log`
> 结果：`=== 24 PASS / 0 FAIL ===`

## 关键判据

- `0.5` 真 UI 先独立下载 MSL：4 个 `msl__...identity.NNN` 分片 → OPFS 落盘。
- `2a` 真 UI 双引擎 boot：`__omc=object, readyMs=3002`，不是手动装配。
- `4a` `omc_load_msl isError=false`，`source:"opfs-download"`、
  `opfsPath` 与下载落盘逐字一致、`bytes=19482938`。
- `4a-4` 装载阶段零网络请求（下载/装载解耦可证伪判据）。
- `4b` 装后 `omc_eval('loadModel(Modelica)') === 'true'`；`3b` 假包 false。
- `4c` 同类肯定：4 个真 release 分片 200，运行时能真装 MSL。

```
=== MODE=main：正常网络（不拦截任何请求），净化 dist 默认结果 ===
PASS | 0a 页面加载 200（同类肯定探针：页面在） :: HTTP 200, 504ms
PASS | 0b window.modelContext 就绪（同类肯定探针：探针能测到"存在"） :: mcOk=true
PASS | 0c listTools 含 omc_load_msl（工具面可达） :: ["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages","octave_install_package","octave_get_system_state","omc_load_msl"]
PASS | 0d Octave 主引擎从 release 下载完成（OMC 附加 flavor 的前置，同类肯定用例） :: clicked={"clicked":true,"text":"⬇ Download"}, dl={"downloaded":true,"downloading":false,"damaged":false,"txt":"● wasm32-final General compatibility · 32-bit baseline ~38.0 MB ✓ Downloaded ✕"}
[0.5] 真 UI 下载 MSL（下载/装载解耦：下载先独立完成）
PASS | 0.5 ★ 下载动作独立成功（MSL 落 OPFS） :: {"dlClicked":true,"dlOk":true}
PASS | 0.5-2 ★ 下载阶段 4 个 MSL release 分片 :: ["-maint.om/msl__msl-4.1.0-maint.om.zip.identity.000","-maint.om/msl__msl-4.1.0-maint.om.zip.identity.001","-maint.om/msl__msl-4.1.0-maint.om.zip.identity.002","-maint.om/msl__msl-4.1.0-maint.om.zip.identity.003"]
PASS | 1a 勾选 UI 面存在且点到了（先证"点到了"） :: {"found":true,"text":"OpenModelica wasm32 Modelica physical system modeling & simulation · 74.6MB ~71."}
PASS | 1b OMC 引擎下载 UI 显示 downloaded（若 release 供给正常工作） :: downloaded=true, dlUiLast={"downloaded":true,"statusText":"✓ Downloaded","cls":"dl-status downloaded svelte-1v09by2"}
PASS | 1c Start Computing 按钮存在且点到了 :: {"found":true,"text":"Start Computing"}
PASS | 1d BootModal 打开（Start Computing 的结果） :: {"modalOpen":true,"title":"Boot GNU Octave Engine","h3Text":"Boot GNU Octave Engine","buttons":[{"t":"×","cls":"btn-close svelte-5ud48x","disabled":false},{"t":"Cancel","cls":"btn","disabled":false},{"t":"Start Engine Now","cls":"btn btn-primary svelte-5ud48x","disabled":false}],"fullText":"Boot GNU
PASS | 1e 点到真按钮 .modal-footer .btn-primary 且文案为 Start Engine Now（模态标题是 h3，不点标题） :: {"found":true,"text":"Start Engine Now","hadDisabled":false}
PASS | 2a window.__omc 存在（UI 真 boot 路径） :: omc=object, readyMs=3002, octave=object, hosts=1, octaveReady=boolean
PASS | 2b window.__omc.omc_eval 是 function :: omcEval=function
PASS | 3a 默认态 MSL 未挂载（按需装载语义，装前 false 才对） :: {"v":"false"}
PASS | 3b ★反向：loadModel(NoSuchPackageXYZ) === "false"（正确失败） :: {"v":"false"}
PASS | 3c getVersion() 有返回值 :: {"v":"\"-rust\""}
PASS | 3-pos ★同类肯定：同一真 __omc 上探针能读到 "true"（排除探针缺陷） :: [{"expr":"1+1==2","v":"true"},{"expr":"true","v":"true"},{"expr":"loadModel(Modelica)","v":"false"}]
PASS | 4a omc_load_msl isError=false（真 OMC 引擎上读 OPFS 已下载字节成功装载） :: ms=1565, data={"name":"modelica-standard-library","version":"4.1.0+maint.om","mountPath":"/.openmodelica/libraries","bytes":19482938,"source":"opfs-download","opfsPath":"downloads/src/modelica-standard-library/4.1.0+maint.om/modelica-standard-library-4.1.0+maint.om.tar.gz","sha256":"a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535","selfCheck":{"loadModel":true,"version":"4.1.0","n
PASS | 4a-2 ★ 证据面 source=opfs-download（最终解耦版） :: "opfs-download"
PASS | 4a-3 opfsPath 与下载落盘一致 :: downloads/src/modelica-standard-library/4.1.0+maint.om/modelica-standard-library-4.1.0+maint.om.tar.gz
PASS | 4a-4 ★ 装载阶段零网络请求（下载/装载解耦） :: []
PASS | 4b ★装后：omc_eval(loadModel(Modelica)) === "true" :: {"v":"true"}
PASS | 4c ★受控肯定：真 release MSL 字节挂载后 loadModel(Modelica) === "true"（证明 4a 的 FAIL 是工具站内路径 404，非运行时/探针缺陷） :: {"step":"ok","total":19482938,"statuses":[{"f":"msl__msl-4.1.0-maint.om.zip.identity.000","status":200},{"f":"msl__msl-4.1.0-maint.om.zip.identity.001","status":200},{"f":"msl__msl-4.1.0-maint.om.zip.identity.002","status":200},{"f":"msl__msl-4.1.0-maint.om.zip.identity.003","status":200}],"lm":"true","neg":"false","ver":"\"4.1.0\""}
PASS | 4c-neg ★受控肯定：挂载后 loadModel(NoSuchPackageXYZ) 仍 === "false"（假包正反判据成立） :: {"step":"ok","total":19482938,"statuses":[{"f":"msl__msl-4.1.0-maint.om.zip.identity.000","status":200},{"f":"msl__msl-4.1.0-maint.om.zip.identity.001","status":200},{"f":"msl__msl-4.1.0-maint.om.zip.identity.002","status":200},{"f":"msl__msl-4.1.0-maint.om.zip.identity.003","status":200}],"lm":"tru
=== MODE=main: 24 PASS / 0 FAIL ===
```
