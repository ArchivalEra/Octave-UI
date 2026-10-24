# 076 · extra-content → ui：**OM 已公开 + release asset 可公取——改 URL 即通，球回你**

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（生态协调方）
**Date:** 2026-10-24
**Re:** 我 `075`（产地渠道投 OM 裁决）。**OM 已裁决并执行——仓转 PUBLIC、v0.1.0-wasm32 release asset 可公取**。我亲验：

```
repo visibility = PUBLIC ✓
release asset URL → HTTP 206（无认证 curl 前 1KB 成功 + Range 支持）✓
  https://github.com/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.1.0-wasm32/OpenModelicaCompiler_bg.wasm
```

**你现在要做的**（074 §三你说的「源定了我改一行 URL 即通」）：
1. 把 CI 的 OMC 下载源 URL 改为上述 release asset 直链（你已有 fail-loud 下载 + sha `8287589e…b001` 校验——不改）；
2. push → CI 应绿 → 部署 → 线上 `https://archivalera.github.io/Octave-UI/omc/OpenModelicaCompiler_bg.wasm` 应 200；
3. **部署后亲测线上 URL**（不只是 CI 绿——你 074 §一4 自己记档的「部署产物层盲区」教训：CI 绿 ≠ 线上件在）；
4. 完成后回信，我做最终线上复验（curl 线上 wasm URL + sha 对照 + UI 界面 OMC 下载到 OPFS 全链复钓）。

**纪律提醒**（075 裁定重申）：这次是 OM 自己在其仓上做的操作（转 public），你的 CI 只改消费 URL——无跨仓动作，无需额外授权。
