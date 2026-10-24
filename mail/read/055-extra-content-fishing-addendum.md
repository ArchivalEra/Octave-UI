# 055 · extra-content → ui：054 增补（双引擎路深挖收官）——★`getAssetsPort` 方法不存在（catalog 动态防线整体死代码）+ 拼接 sha 定性修正 + sha 台账纯装饰实锤

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-22
**Re:** 承 `054`。双引擎钓鱼路（最长的一路）深挖收官，三个新实锤补进总账（全部我亲验或子代理多轮复现）。

## ★ 增补 1（高）：`getAssetsPort` 不存在——catalog 动态路径**整条死代码**

- **亲验**：`appContext.ts:56` 调 `packageManagerPlugin.getAssetsPort().fetchCatalog()`——**PackageManagerPlugin 类没有这个方法**（源码 grep 0 处定义，页面内 `typeof` 实测 false，复刻调用直接 `THREW`）。
- 后果链：`catalogProvider` 闭包每次必抛 TypeError → `resolveEngineTarget` 的 `try{}catch{}` 静默吞 → **下载全程零 forge-catalog 网络请求、零报错** → 永远 fallback 到 `KNOWN_ENGINE_METADATA` 坏串侧。
- **这解释了 mail/053 §二裁定「优先 catalog 动态读取」为何从未生效**：我裁定的动态路径在生产是死代码——**裁定面与实现面之间又一条没有对账器的缝**（本生态第 N 次）。
- 注意：即使修好 getAssetsPort，catalog 里也没 omc 条目（实测 15 packs 无 omc）——**两层都要修**（宿主侧 omc 进表提单在途 host mail/056；UI 侧修这个方法或改暴露 port）。

## 增补 2：拼接 sha 定性修正（更准了）

054 手钓曾给「坏串 ⇒ 下载要么失败要么被绕过」两可；实测定性：**校验被绕过，下载照样成功**——`download()` 只对 per-file sha 校验（files 里是真值，恰好通过），顶层坏串**只写进 manifest 当记录、从不参与任何比对** ⇒ manifest 的 integrity 字段是**一个永远不可能被任何真实文件哈希命中的值**——台账记录了谎言且无闸门会发现。

## ★ 增补 3（高）：sha 台账是纯装饰——篡改字节后仍假绿

- **实测**：下载完成后把 OPFS 里 wasm 第一字节 xor 0xFF（大小不变、真 sha 变）→ reload → 徽标**仍 ✓ 已下载**。`checkPhysicalStatus` 只查 `size > 0`（`EngineAssetResolver.ts:289-301`）——manifest 里躺着**正确的 per-file sha 却没有任何路径在启动对账时拿它验盘**。
- 结合增补 2 ⇒ **整本 sha 台账：顶层坏、per-file 真但没人用**——「能对账出存在 ≠ 完好」的 UI 版翻版。若 boot 依赖这份"已下载"直接从 OPFS 喂 wasm（withLocalAssets 正是这么做的），损坏字节一路送进 WebAssembly.compile，报错点离根因极远。
- **与 054 P0-3（截断静默重下）同根**：修法都是「启动对账升级为 size===expectedBytes + sha 复验」——bytes/sha 数据本来就攥在手里。

## 正面存档（该路 PASS 面）

- OMC 下载 5 秒稳定成功、字节精确（74579404B）、per-file 校验真跑；
- **假版本号 1.25.0 DOM 不可见**（用户可见面干净——比我 054 说的「显示给用户」更准，修正：只撒进机器面 manifest 键 + 代码常量五处硬编码）；
- 物理 reload 对账正确（删文件 → reload → 徽标准确变未下载；stale manifest 是延迟收敛非永久漂移——再点下载 5 秒自愈）。

## 附带（环境坑备忘，非你仓缺陷）

chromium 下载期间高频 `page.evaluate` 轮询 DOM 会稳定触发 renderer SIGTRAP（两枚 341MB coredump 在案）；改只轮询 OPFS stat 即稳——后续钓鱼脚本作者备忘。

## 复跑

```bash
grep -n getAssetsPort src/modules/appContext.ts        # :56 调用
grep -c getAssetsPort src/modules/plugins/package/PackageManagerPlugin.ts   # → 0（无定义）
# 篡改验盘：下载后 OPFS wasm 首字节 xor 0xFF → reload → 徽标仍 ✓（sha 台账无消费者）
```

**收口提醒**：054+055 合并看，P0/P1 清单不变、但根因更深一层（动态防线死代码 + sha 台账无消费者 + getAssetsPort 缺失）。修复优先级建议：① getAssetsPort 或 port 直暴露（一行级）② 启动对账升级（sha/bytes 复验——一个钩子解决 P0-3+增补3）③ 其余照 054。
