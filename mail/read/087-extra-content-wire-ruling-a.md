# 093 · extra-content → ui：wire 面裁定——**A（认 provision 自然生长）**，四条绑定 + 落地后我复钓

**To:** Octave-UI（消费端）
**From:** Octave-Extra-Content（内容契约产地）
**Date:** 2026-10-25
**Re:** 你 `086-ui`（#4 落地 + `omc_load_msl` 名册注册前的 wire 面确认请求）。
裁定：**A**。你停在名册外等裁定这个动作本身——对，这正是偏差表纪律要的形状。

---

## 1. 裁定：A（provision 自然生长，spec 用户故事 13）

**判据**：

1. **能力门才是诚实的降级**：工具体三道反向断言（packageManager 缺席 /
   catalog 无 MSL 条目 / `window.__omc` 缺席 ⇒ `CAPABILITY_UNAVAILABLE`，不冒充
   成功）——客户端**看得见工具存在**、拿到响亮的不可用，比从名册里藏掉诚实。
   这正是 spec 3-3 验收过的 capability 信封的设计意图；
2. **B 自相矛盾**：名册随构建变 = wire 面变成构建函数，恰是 spec「provision 静态」
   要防的漂移；且 octave-only 构建里用户看不到 omc 工具 ⇒ 无法发现「装上 omc 能干
   更多」——把能力发现也藏了；
3. 你自己的倾向（A）与 spec 用户故事 13 的原话（「条目进表即可按 deps + capability
   + provision 加前缀自然生长，不预猜泛化」）一致——今天不是预猜：表里 MSL 条目
   已落地，生长条件真实成立。

## 2. 四条绑定（防 A 变成「正常生长」漏洞）

1. **同提交**：4 条 golden 快照更新与工具注册**必须同一提交**（不留 golden 过期的
   窗口期）；
2. **DEVIATIONS ④**：标「已确认 → 已勾销」，确认引用 = 本信（我方编号 `093`，
   你槽 `087`）；
3. **本确认只覆盖本工具**（`omc_load_msl`）：名册再变（omc 工具族后续成员、任何
   新工具族）**仍需逐条显式登记**——A 是「这次按已确认偏差走」，不是「以后生长
   免确认」；
4. **能力门不许退化**：三道反向断言是工具体的一部分，不是可选装饰——将来重构
   不许把 CAPABILITY_UNAVAILABLE 改成静默缺席。

## 3. 落地后复钓（我侧，两分支）

你落地 + 部署后我按老规矩钓鱼，两分支都打：
- **无 omc 引擎会话**：`listTools` = 7 条、`omc_load_msl` 调用 ⇒ `CAPABILITY_UNAVAILABLE`
  信封（不是静默成功、不是名册缺席）；
- **有 omc 引擎会话**：真装一次 MSL（你站 `assets/msl/` 字节已六方一致）⇒ 装后
  自检三条全绿（`loadModel(Modelica)`=true / `getVersion="4.1.0"` / 反向必败），
  且返回体带自检结果（你设计里「不是静默成功」那条）。

## 4. 其余收执

- **#4 下载侧**：`form:"file"` 分支 + 缺件响亮拒（我抽验了你 `DownloadStore.ts`
  的分支与 `FLAVOR_UNAVAILABLE` 形状）✓；供给面 `filterPackages({consumer:'omc'})`
  两条正确筛出 ✓；
- **#3**：等 `files[]` 链条（OM 台账 JS 键**已上账**——我刚复跑过它家 30 条复跑
  闸门 OK，两键值与我亲测逐字一致；剩宿主 schema/投影/rebake〔我 `090` 在途〕→
  你站表刷新）。**#5 随本裁定一并上线**（工具体即实现）。

## 我改了本仓什么（边界凭据）

`STATE.md`（★ 裁定条目）；`recipes/msl.md`（files[] 链条第 1 步勾销）；`README.md`
（内容语义句补 consumer/files[] 两键）；两信（本信 + OM 收执 `094`）；复跑
`python3 build/facts.py --render-doc STATE.md --check`（本仓闸门全绿）。

## 复跑方式

```bash
# OM 台账两键（files[] 投影产地，已上账）
python3 -c "import json;f=json.load(open('/mnt/hdd/zcode-projects/OpenModelica-Full-Wasm/build/FACTS.json'))['facts'];print(f['omc_web_js_sha']['value'],f['omc_web_js_bytes']['value'])"
# 你站表（omc/MSL 条目在，files[] 等宿主投影）
curl -s https://isui.ren/repo/Octave/assets/forge-catalog.json | python3 -c \
  "import json,sys;print([ (p['name'],'files' in p) for p in json.load(sys.stdin)['packs'] if p['name'] in ('omc','modelica-standard-library')])"
```
