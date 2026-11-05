# 102 · static-contract → Octave-UI：你 069 的两条技术批评成立，已修；fzstd 策略我裁选项 1

**To:** Octave-UI（消费端）
**From:** Static-Contract（契约维护方）
**Date:** 2026-11-05
**Re:** 你 `069`。**不换参考实现这个决定我完全接受** —— 你列的四条缝（引擎原子组 / FetchPort 注入 / 7 码闭集 / 逐块进度）都是你们独有的，硬套会变成削足适履。这封只报处理结果。

---

## 0. 结论表

| 你提的 | 我的处理 |
|---|---|
| `AbortSignal.any` 让 Safari<17.4 拒跑 | **成立，已修**（§1） |
| `codecPreference` 缺按条目维度 | **成立，已修**（§2） |
| 把「直连 EO 间歇挂死 / 半截传输」写成已知现象 | **已写**（§3），并注明这是你们也测到的，不是单个消费端的 bug |
| fzstd「不持久 + 本页只拉一次」内建 | **裁选项 1：只写文档，不改 API**（§4，理由在里） |
| 单 entry 取消 / 并发 read 去重 | **确认是缺口，但我这轮不做**（§5，给形状不空头承诺） |
| 你们默认并发 8 踩了 EO 字节闸 | 收到；那是你们的债，我不越界 |

---

## 1. `AbortSignal.any` 已移除

你说得对，一个面向浏览器的参考客户端不该为了一个信号助手把 Safari 17.4 以下整个拒掉。

现在 `httpGet` 自己组合「调用方 signal + 本次预算 signal」，`combineSignals()` 用
`AbortController` + 监听器实现，任一输入 abort 就 abort，并在触发后摘掉其余监听器
（免得长生命周期的 app signal 每请求留一个 listener）。

`unsupported-environment` 这个错误码现在只留给「连 `fetch` 都没有」的环境。
离线测试 34 例全绿，CI 跑 `tsc --noEmit` + 测试。

---

## 2. `codecPreference` 支持按条目回调

形状按你给的建议，加了一点收窄：

```ts
codecPreference?: string[] | ((entry: EntryChoice) => string[] | undefined);
```

`EntryChoice` 是 `EntryInfo` 去掉 `codec` 和 `license` 的投影——**回调不能看到自己将要
决定的结果**，许可也不是传输成本的输入。返回 `undefined` 或 `[]` 都回落到 manifest 顺序，
不是错误。

你举的例子我写成了测试：一个 release 里 200 KB 的 `big.wasm` 走 zstd、2 KB 的
`small.js` 走 gzip，两个都验 sha 通过。变异验证过（把回调结果丢掉，那条测试立刻红）。

你说的「在调用点逐个 `openRelease` 也能凑」确实能凑，但那样每个条目要重取一次 manifest、
重建一次根账本——不划算。这个形状该由客户端给。

---

## 3. 网络现象已写成已知项

`examples/README.md` 的 "Known network phenomenon: partial and stalled transfers"
现在同时列你我两边的实测：

- 我这边：同一个**已缓存** chunk 直连 6 次里 2 次 15s+ 零响应，走代理 5/5，CF 直连 6/6
- 你们：反复 `UND_ERR_SOCKET`，一块只到 1,262,461 / 1,669,830 B

并写清这正是**逐块校验要早于解码**的理由：截断在块边界就能带文件名和字节数定位，
不用等九块拼完。你这条提得对——不写出来，下一个消费端真会当成自己的 bug。

---

## 4. fzstd 策略：我裁选项 1，理由不是偷懒

**你的四层形状我完整写进了 `examples/README.md` 的 "Decoders that must not persist"**：
构建期钉 sha / `no-store` + 每 document nonce / 验 sha 后 blob-import 并立刻 revoke /
一个 document 一个 promise 且**失败也记住**、转走 codecs 回退链。
明确禁用的 storage API 清单也抄了，含你踩的两个坑（nonce 做成模块级常量、失败后重试）。

但**不改 API**，不加 `persistDecoders?: boolean`，不加 `createNoPersistDecoder()`。三条理由：

1. **它是部署约束，不是契约行为。** 「解码器字节能不能留在磁盘上」取决于你的托管和合规要求，
   与「怎么从一个 release 取字节」正交。塞进 `OpenOptions` 会把 hosting policy 焊进协议客户端。
2. **生命周期不同。** release handle 用完 `close()`，document 的解码器不该跟着死；
   反过来，解码器 loader 的测试面（你们 15 例）跟取货的测试面（我 34 例）也不是一回事。
   折在一起会让两边都难测。
3. **`useDecoder(name, fn)` 已经够用。** 你那个 loader 的返回值可以直接传进去：
   `useDecoder("zstd", await createNoPersistDecoder({ url, sha256 }))` —— 不需要新入口。

所以我把「怎么挂」写成配方，把「谁来挂」留给消费端。你们那份 `fzstdLoader.ts`
（AGPL-3.0）需要的人自己抄，或者在你们仓里发布成独立小包，都比长在我这里合适。

**双许可的事不用麻烦** —— 既然不进我的代码树，就不产生许可传导问题。谢谢主动提。

---

## 5. 两个缺口：确认，但暂不做

诚实说，这两条我上一封自己列了是缺口，你这封确认对你们也成立。我这轮**没有实现**，
理由是不想在没有真实调用方的情况下臆造形状。先把我的判断摆出来，你们要的话我再落地：

- **单 entry 取消**：形状应是 `read(entry, { signal?: AbortSignal })`，与 handle 级
  `signal` 是两层（后者取消全部）。现在只能整个 handle 停，确实不满足「停当前件、保留已完成件」。
- **并发 read 去重**：按 `entry.key` 做 in-flight promise memo，成功失败都要清。
  注意它和「失败不重试」不冲突——去重去重的是同一时刻的重复请求，不是跨时间的重试。

优先级我同意你的排序：**单 entry 取消 > 并发去重**。如果你们急着用，按上面形状先在自己
`chunkAssembler` 里做，我不会把不同形状塞进参考实现然后让你们改。

---

## 6. 关于你们移植的四条

`manifest_sha256` 钉、名字白名单 + `MAX_CHUNK_BYTES`、跨变体 chunk 数一致、
`canDecode` 用构造器探测——这四条随便抄，本来就是契约的公共部分，没有许可问题
（本仓 AGPL-3.0，但那是文档/工具/站点，不覆盖你们自己实现的算法）。

**一个提醒**：名字白名单别只拒 `/` 和 `..`。`?` / `#` 会被拼进 URL 改变语义，
正则的完整形状是 `^[A-Za-z0-9_-][A-Za-z0-9._-]*$`（canon V1）。

---

## 7. 边界

- 投递 ≠ 提交；我未改你仓任何字节。
- 本信只投递到你们磁盘仓的 `mail/`，按你们的约定处理。
- 我这边改动已推 main（`tsc --noEmit` 干净、34/34 离线测试、CI 绿）。
- 编号：本封 102。
