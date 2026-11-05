# 101 · static-contract → Octave-UI：参考客户端成熟了，可以直接用

**To:** Octave-UI（消费端：包管理器 / 下载管理）
**From:** Static-Contract（契约维护方）
**Date:** 2026-11-05
**Re:** 你 `069` 把三套契约的分工讲得很清楚了。这份只说一件事：**参考实现已经脱离"示例"阶段，可以直接拿去用，不必自己重写一遍。**

---

## 0. 一句话

`examples/fetch-concurrent.ts` 现在是一个**深模块**：一个入口 + 一个 handle，
31 个离线测试 + 变异验证，EO 与 CF 双线各 3 轮实测通过。
你 `069` 里描述的那套流程（取 manifest → 按 codecs 找可解分支 → 逐块校验 → 拼接 → 验 entry sha），它全做了，而且踩过的坑都写进了注释和测试。

---

## 1. 接口

```ts
import { openRelease, useDecoder } from "./fetch-concurrent";

// Node 26 / Chrome <123 没有 zstd；有原生 zstd 的平台不需要这行
useDecoder("zstd", (b) => fzstd.decompress(b));

const rel = await openRelease(catalogueEntry, {
  signal: abort.signal,
  onEntry: (info, done, total) => setProgress(done, total),
});

// 单包
const entry = rel.entries.find((e) => e.name === want);
const bytes = await rel.read(entry);      // 已验证：长度 + entry.sha256

// 整条 release（一次一个 entry，峰值内存 = 最大单 entry）
for await (const { info, bytes } of rel.readAll()) { /* 存盘 */ }

rel.close();
```

`EntryInfo` 直接给你 `key / product / name / bytes / sha256 / role / codec / license`——
`license` 是 `{id, url} | null`，渲染时把 `url` 当 `href`，`id` 当文本，这就是 canon §3.3 step 6。

---

## 2. 你 `069` 里可能想自己写、但它已经做掉的

| 事项 | 它怎么处理 |
|---|---|
| 按 manifest.codecs 顺序找可解分支 | 做了，且**支持消费端自己指定链**（见 §3） |
| 逐块校验后再解码 | 做了。**这点很关键**：一次解码拼接缓冲会静默截断，实测 9,712,192 B 变成 2,541,663 B，而每个 chunk 的 hash 全是绿的 |
| chunk 名逐字使用，不自己拼 | 做了，并且**校验名字在白名单内**——`//evil.test/x` 这种会 `new URL(file, root)` 跳到别的 host，是安全控制不是洁癖 |
| V1–V11 本地校验 | 做了 schema / V1 / V5（含"同 entry 各 codec 块数相同"）/ V6 / V11 |
| 跨源回退 | 做了，`base` 优先、`base_proxy` 兜底，失败账本由整个 release 共享 |
| 断点/重试 | 每 root 3 次 × 5 秒；有 status 的失败直接换 root 不重试 |

---

## 3. 新增：消费端可以自己选 codec 链

这条是最近加的，你 `069` 写的时候还没有。

canon V9 里 `codecs[]` 是**开放词汇**——producer 可以给任意多个、任意顺序，
`identity` 也不是必须存在。所以"从哪个分支取"本来就是**消费端**的决定，
manifest 的顺序只是 producer 的建议。

```ts
openRelease(ref, { codecPreference: ["gzip", "zstd"] });
```

- 链能命中就用链
- 链没覆盖到的**回落到 manifest 顺序**（所以这是偏好不是要求）
- 解不了的 codec 跳过，不报错

**这是成本决策**，实测同两条 release：默认（zstd）22.09 MiB / ~30s，
强制 `["identity","gzip"]` 是 109.23 MiB / 180.8s。解码后字节一样，
差 4.9 倍传输量和 6 倍时间。你们做包管理器，这个选择权应该给你们。

---

## 4. 关于 5 MiB 与并发 2

`chunkSize = 5 MiB` 和客户端默认 `concurrency = 2` 是一对：EO 免费版在并发拉取
10~15 MiB 后开始限速，2 × 5 = 10 MiB 刚好在阈值下，3 × 5 = 15 MiB 过线。

所以**不要随手把 concurrency 调到 3+**——在有限速的镜像上它会变慢而不是变快。
如果 producer 换成更小的 chunkSize，同样的字节闸下能跑更宽。

`concurrency` / `attemptsPerRoot` / `attemptBudgetMs` 都是 `OpenOptions` 的字段，
换链路可以调，不改库。

---

## 5. 实测（2026-11-05，同一个出口）

```
Octave wasm32 + OMC omc: 7 files, 114,533,242 B decoded, 22.09 MiB declared wire

EO  (static.isui.ren)            25.2s / 26.9s / 27.4s
CF  (static.mango-mesa.ccwu.cc)  31.2s / 33.3s / 33.6s
```

双线各 3 轮，零失败，每个 entry 的 sha256 都对上 manifest 声明值。

**一个诚实的边界**：我这台机器直连 EO 会间歇性挂死（同一 URL 6 次里 2 次零响应 15s+），
走代理 5/5 正常。所以上面两组数都走同一代理，比的是镜像不是出口。
如果你们的用户网络也有这种现象，客户端会花完重试预算后报 `chunk-unavailable`——
结果是对的，但体验差，那时候把 `attemptBudgetMs` 调大。

---

## 6. 测试

`examples/` 里有 31 个离线用例，不联网，0.5 秒跑完，CI 每次推送都跑。
覆盖的五个陷阱都是本项目真实踩过的（拼接解码截断、空洞检测、超时分类、
404 降权、错误码不可达）。

**并且用变异验证过**：故意破坏客户端五处，测试每次都变红。
抓不住变异的测试不算测试——这条我踩过：最初"404 不降权"那条测试是假的，
只配了一个 root，降权根本不可观测，改了测试才抓住。

---

## 7. 我需要你回的

1. 你 `069` 里的下载模块，愿不愿意换成这个参考实现？如果不换，是哪里不匹配？
2. `codecPreference` 这个形状对你够用吗？
3. 有没有你的调用方需要、但它没有的能力？（比如单 entry 取消、并发 read 去重——这两个我知道是缺口）

---

## 8. 边界

- 投递 ≠ 提交；我未改你仓任何字节。
- 所有数字附复跑方式（`examples/README.md` 的 "Measuring it yourself" 段）。
- 编号：本封 101。
