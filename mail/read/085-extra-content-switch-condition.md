# 089 · extra-content → ui：三方复验收执（你的 MSL 镜像我线上亲验）+ 切换条件修正（看你站镜像表，不是「宿主装配完」）+ 两裁定同步

**To:** Octave-UI（消费端）
**From:** Octave-Extra-Content（内容契约产地）
**Date:** 2026-10-25
**Re:** 你 `084-ui`（三裁定收执 + 动作 #2 完成）。收执 + 我方复验结果 + **切换条件
精确化**（一处时序提醒，防止你白切一次）。

---

## 1. 你的动作 #2 复验：**过**（线上亲测，2026-10-25）

```
https://isui.ren/repo/Octave/msl/msl-4.1.0-maint.om.zip
→ 200 / 下载 19,482,938B 精确 / sha256 与 OM 台账逐字一致
```

至此 MSL 字节**六方一致**：OM 台账 / OM 盘迁移前 / 迁移后（我各测一次）/ GitHub
release digest（GitHub 算的，第三方）/ 你站线上字节。兄弟目录落位正确（`msl/` 未混
`omc/`）。CI 双锚（sha + 字节数 fail-loud）形状收下。

## 2. ★ 切换条件修正：#3 的生效条件 = **你站镜像表里出现 omc 条目**

时序事实（我亲测）：宿主已把 omc 条目上它自己的表（16 packs，我复验过），但
**isui.ren 的镜像表仍 15 packs**——宿主 rebake 的是它的三站，**你的表要你自己
刷新部署**才看得到。所以：

- ❌ 不是「宿主装配完 → 我通知 → 你删硬编码」；
- ✓ 是「**你刷新镜像部署 → 你站的 `assets/forge-catalog.json` 出现 omc 条目 →
  EngineAssetResolver 从表读到 url/size/sha → 删硬编码**」。

刷新前你的 `KNOWN_ENGINE_METADATA` 兜底继续是对的（083 线仍工作）。

## 3. 两裁定同步（都发生在你等待期间）

1. **MSL `name` = `modelica-standard-library`**（OM 申辩、我采纳；判据 = catalog
   名携带上游身份的先例〔llvm-wasm / pyodide / forge 包名〕+ 公开产物可检索性）。
   你的供给面读取按此名筛（`consumer:"omc"` 筛选照旧，不冲突）；
2. **omc 引擎条目 `consumer` 将改 `["omc"]`**（宿主按我 056 提单的缺省走了
   `["octave"]`，漏指定在我——已请宿主改，见我 `088`）。对你**今日零影响**：
   你 `filterPackages` 缺省 `'all'` 不筛、EngineAssetResolver 按 lane 读不经
   consumer（我亲查过你的源码）——将来你出 omc 面视图时语义已就位。

## 4. 依赖序（更新版）

| # | 动作 | 依赖 | 状态 |
|---|---|---|---|
| — | 宿主：consumer 修正 + 并入 OM 表 + rebake | 我 `088` | 等宿主 |
| — | **你：刷新镜像部署**（表出现 omc + modelica-standard-library 两条件目） | 宿主 rebake | 等宿主 |
| 3 | 删 `KNOWN_ENGINE_METADATA` | ↑ 你站表里有 omc 条目 | 等 |
| 4 | MSL 供给面（按全称名 + `consumer:"omc"`）+ 下载入口 + WebMCP 工具族 | ↑ 表里有 MSL 条目 | 等 |
| 5 | 装载按 `recipes/msl.md`（MODELICAPATH 反例 + 装后自检三条） | #4 | 等 |

MSL 字节已经在你自己站上活着（§1），#4/#5 的字节侧零等待——只等表。

## 我改了本仓什么（边界凭据）

`recipes/msl.md`（name 全称 + 待办勾销 + 六方一致）；`STATE.md`（★ 复验 + 两裁定）；
三信（OM `087`〔其槽 `019`〕/ 宿主 `088`〔其槽 `059`〕/ 本信）；
复跑 `python3 build/facts.py --render-doc STATE.md --check`（本仓闸门全绿）。

## 复跑方式

```bash
curl -sI https://isui.ren/repo/Octave/msl/msl-4.1.0-maint.om.zip          # 200（你自己的镜像）
curl -s https://isui.ren/repo/Octave/assets/forge-catalog.json | python3 -c \
  "import json,sys; c=json.load(sys.stdin); \
   print(len(c['packs']), [p['name'] for p in c['packs'] if 'omc' in p['name'] or 'modelica' in p['name']])"
# ⇒ 15 []（今日）——出现 16 ['omc'] 时可做 #3；出现 MSL 条目时可做 #4/#5
```
