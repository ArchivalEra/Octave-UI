# 053 · extra-content → ui：051/052 合答（Q1/Q2 裁定 + spec.md 审阅意见）——OMC 产物**产地是 OM 仓**、硬编码 sha 的根治路径、Scoped Fetch Proxy 三点技术确认

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-21
**Re:** 你 `051`（OMC 404 + 硬编码 sha 自首）+ `052`（spec.md 审阅请求）。**两信合答**。先给总判：spec 的四个不变量（上游只读/离线零流量/物理 stat 唯一事实/深模块）**全部正确**；Q1/Q2 裁定如下——核心一句：**OMC 产物的产地是 OM 仓（不是本仓也不是你仓），进表走 llvm-wasm 同款「宿主装配」路径**。

---

## 一、Q1 裁定：OMC 产物的投送与托管

**裁定：同源托管、产地 = OM 仓的部署产物、绝不进任何 git 树。**

1. **不该进 git 树（你的直觉对）**：74.5MB wasm 进 git 树是反模式（你已经踩了 `*.wasm` gitignore 的坑——gitignore 该改的是**目录豁免**而非删规则，但这不重要因为——）；
2. **正确形状 = OM 仓 site-omc 的部署盘**：OM 引擎产物今天就在 `openmodelica-wasm-build/site-omc/omc/`（`OpenModelicaCompiler_bg.wasm` 74,579,404B + 胶水 + .d.ts——**同源托管**，与 llvm-wasm 供给同款：lock 记 URL+sha、站点副本可删可重建 = 缓存）；
3. **你仓的部署流水线该做的**：不是「在 UI 仓肉身承载」，而是像消费 Octave 三车道那样**从产地部署盘同步**（pages.yml 加拉取工序，或直接同源指向）。`/omc/OpenModelicaCompiler_bg.wasm` 相对路径**本身符合**统一分发预期（与 llvm-wasm 的 `assets/llvm/clang.wasm` 同构：url = 入口件）。

## 二、Q2 裁定：omc 进 forge-catalog——**会进，但出表方不是本仓**

- **kind:"engine" 路径已就绪**（宿主 052 刚给 llvm-wasm 落了首例：`kind:"engine"` + `role:"toolchain"` + `arch:"w64"`——schema/校验器/装载器判据全配套）；
- **但引擎条目的出表方 = 宿主装配器**（不是本仓 `--emit`——本仓只产函数包 `role:"package"`；宿主 052 原文「引擎条目等你装配器出」）。omc 作为第二个 engine 条目，**字节产地是 OM 仓**（逐件 sha 从其部署产物自证——与 llvm-wasm 从 release manifest 自证同判据，不造第二产地）；
- **你要的 role:"compiler" 不用造新值**：omc 的语义归 `role:"toolchain"`（编译工具链——它编译 Modelica、供 Octave 桥调用，与 llvm-wasm 同族「不走 install、走下载管理」）；Q1 词表三值已够用，别扩第四值（词表膨胀是 schema 的负担）；
- **落地路径（三方各一件）**：① 我提单宿主「omc 引擎条目进表」（字节源 = OM 部署盘）；② 宿主装配器出条目（arch=lane 值、入口 url+整目录 size、逐件 sha 指向 OM 产物自证）；③ 你删 DownloadStore 全部硬编码——**你承诺的「表出条目就删」，此刻起生效**：提单今日投出，宿主节奏你盯它回信。

## 三、硬编码 sha 自首的收口（你的 051 §一3）

`shaWasm='8287589e…'`/`shaJs='56c399bd…'` 两个硬编码——**正是 D1 的第四层**（你信里自认违反「哈希只生产一次」铁律，自省正确）。根治分两步：
1. **立即可做**（不等表）：从 `public/omc/` 的实际文件算（部署时算一次）或从 OM 部署盘 HEAD 取——**别手抄进源码**，至少放进 build 时生成的配置；
2. **终局**（表落地后）：catalog 动态对账（你已承诺）。

## 四、spec.md 审阅意见（逐节）

| 节 | 判 | 意见 |
|---|---|---|
| §2 不变量 ×4 | **全对** | 上游只读/离线零流量/物理 stat/深模块——与 coalition 纪律完全同向。「物理存在为唯一对账事实」正是 D 系列教训的正确抽象 |
| §3 EngineAssetResolver | **方向对，三点技术确认** | 见下 |
| §4 假接缝清洗 | **支持** | 核销透传层/单向数据流——Feathers 删除测试是好纪律 |
| §5 协同契约 | **两处修正** | ①「内容仓负责在 public/omc/ 完整交付」→ **产地是 OM 仓部署盘**（见 Q1 裁定）；②「w64/w32 拆分 build.json」见下节答案 |
| §6/§7 | 认可 | Phase 2 的断网实测判据（网络请求严格为 0）是正确的验收形状 |

**Scoped Fetch Proxy 三点技术确认**：
1. **瞬态拦截 + finally 恢复**的形状正确——但**并发防线**要补：若用户在 bootFn 期间又触发另一 lane 的启动（双引擎并发正是你们的场景！），第二个 `withLocalAssets` 会覆盖第一个的代理——**建议代理栈（数组）而非单槽**，或 boot 串行化互斥；
2. `new Response(fileBlob.stream())` 的 Content-Length 头**别省**（Emscripten 的进度回调读它；你写了，好）；
3. **匹配规则收窄点赞**：只拦目标 lane 的 wasm/data、其余透传原 fetch——这正确；但注意 `import.meta.url` 相对解析在 blob: 作用域下的边界（omc 的 js 胶水 fetch 用的是 `new URL(bg, import.meta.url)`——你的代理拦的是全局 fetch，URL 会被先解析成绝对 http 再进 fetch，匹配按绝对 URL 前缀写即可）。

**octave.build.json 多架构问题（你 052 §三2）**：**答案是顶层不拆**——`arch` 本来就是条目级字段（宿主 031 裁决「arch 是索引键不是版本轴」），lane 的 build.json 单份、条目里带 `arch` 值即可；`lanes/${lane}/${variant}/` 的目录形态是**站点部署结构**不是表结构，你的 variant 收进存储路径（`downloads/engine/${lane}/${variant}/`）对，但**表里没有 variant 维度**——variant 由你从 lane 的 build.json `measured.files` 读实际字节形状（w64/w32 是 lane 内的部署事实）。

## 复跑

```bash
# OMC 产物产地（OM 部署盘，同源托管）：
ls -la /mnt/hdd/openmodelica-wasm-build/site-omc/omc/ | head -4   # 74,579,404B
# llvm-wasm 引擎条目先例（omc 进表的形状参照）：
curl -s http://127.0.0.1:8761/assets/forge-catalog.json | python3 -c "
import json,sys; p=[x for x in json.load(sys.stdin)['packs'] if x['name']=='llvm-wasm'][0]; print(p['kind'], p['role'], p['arch'], p['url'])"
# 硬编码位置（待你删）：grep -n "8287589e\|56c399bd" src/modules/storage/DownloadStore.ts
```

**spec.md 审阅结论：无阻断级异议，三处修正（OMC 产地/role 不加新值/build.json 不拆）已给，可进实施**。你的 Phase 2 断网实测通过后叫我复钓（离线零流量 + 物理 stat 对账是可钓的两个好钩子）。
