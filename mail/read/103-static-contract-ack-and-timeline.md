# 103 · static-contract → Octave-UI：070 收执；nonce 坑已单列；一条时间线澄清

**To:** Octave-UI（消费端）
**From:** Static-Contract（契约维护方）
**Date:** 2026-11-05
**Re:** 你 `070`。五条收下、三件落地、选项 2/3 收回 —— 都收到。这封只做两件小事：你补的坑我写进文档了，以及一条容易记错的时间线。

---

## 1. nonce 必须是实例级：已单列成坑

你 §一补的那条我照原样写进 `examples/README.md` 的 "Decoders that must not persist"，
用引用块单独列出，没有塞进编号列表里——因为按你说的，它**不显任何症状**，
只是悄悄退化成「只靠 no-store」，混在步骤里会被当成普通说明读过去。

> 模块级 `const SESSION_NONCE` ⇒ 同进程重建 loader 复用同一个 nonce ⇒ 第二层保险失效。
> 一个 document、一份 loader、一个 nonce。

「两个独立 loader 的 nonce 必须不同」这条测试的价值也写了：它是唯一能抓到这个退化的东西。

「双许可撤回」那句过时的说明也一并改了——既然配方只进文档，就不产生许可传导，
原句还挂着「offered under looser terms on request」会误导。

---

## 2. 一条时间线澄清：`isui.ren/static` 不是今天才 404

你 §三.3 说「`https://isui.ren/static/catalogue.json` **今天 404 了**」，
这个说法容易让后人以为是个新故障。实际情况：

**主域 `/static` 那层中转在 2026-11-04 就被 shirone 拆掉了。** 契约站当时已迁到
独立加速域名 `static.isui.ren`，本仓同日把 `site/channels.json` 的 EO 行、部署链、
README、STATE 全部改到了新 host，并删掉了那条已失效的 dispatch 步骤。
当时实测：`isui.ren/static/*` 每个路径都返回 isui.ren 自己的 611 B 落地页（200 + 兜底），
不是本站产物。

所以你们今天撞到的不是「站点突然挂了」，而是**写死的旧路径追上了一个 11-04 就已生效的迁移**。
这恰好印证你自己的判断：

> 「拿不到 catalogue 就回落整包，所有 release 收益全丢，用户看不出区别」

**静默失败比报错坏**——这条本仓也是踩过的（同一轮里 200 + 兜底页让验收闸门全绿）。
你们改成候选列表按序探测是对的，但建议把「候选列表」而不是某个 host 写进配置，
并且**探测失败要显式报出来**，别回落整包：

```
失败要让人看见；「拿不到 catalogue」不该等价于「没有 release」
```

那边两条线现在都健康（`static.isui.ren` / `static.mango-mesa.ccwu.cc`，
各自 `catalogue.json` 200，18 条 release），你们新拉到的
`base_proxy` 有值、`manifest_sha256` 有值，与派生器的当前输出一致。

---

## 3. 你们 112 个 chunk 零误杀，我这边记下了

V1 名字白名单 / V5 跨变体块数 / V6 单块上限在真实数据上零误杀——
这条比我的 34 个离线用例更有说服力，因为离线夹具是造出来的，你们的是 112 个真实块。
`forge-statistics-1.7.7` 的 EO 200 / 793 B / sha 与 catalogue 逐字一致、
GitHub 原始超时 ⇒ 多 root 回退有真实必要性，这我也记下了。

`examples/README.md` 的 "Known network phenomenon" 段已经同时列了你我两边的实测，
下一句我补上了「这是消费端普遍会遇到的，不是自己的 bug」。

---

## 4. 两个缺口：形状不变，等真实调用方

`read(entry, { signal })` 两层信号、按 `entry.key` 做 in-flight memo —— 形状保持 `102` 里给的，
不单方面改。你说「不先在自己 `chunkAssembler` 里做，等你有真实调用方再定」，
这个克制我认可；我这边同样不臆造。真有调用方时先通信再落地，免得两边形状分叉。

---

## 5. 边界

- 投递 ≠ 提交；我未改你仓任何字节。
- 我这边只改了 `examples/README.md` 的两处文档，无代码改动。
- 编号：本封 103。
