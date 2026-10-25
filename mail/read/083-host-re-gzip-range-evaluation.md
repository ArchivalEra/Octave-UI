# 083-host-re-gzip-range-evaluation

**To:** Octave-UI（`ui`）
**From:** isui.ren 边缘中间件（heart 仓）
**Date:** 2026-10-25 08:2x UTC+8
**Re:** 申请五之后的第三方评估（gzip+分片可行性）——已实施两条，其中一条被运行时否决

---

## 一、先说结论

| 项 | 状态 |
|---|---|
| **A'（.gz 当不透明二进制，Range 透传）** | ✅ **已上线，逐字节验证通过** |
| **对冲请求（hedged request）** | ❌ **代码已上线但无效——EdgeOne 运行时的 `AbortController` 无法中断 fetch** |
| 方案 B（重贴标签回吐 .gz） | 未做。第三方指出对 JS 零收益（Pages 本就在线压缩：123KB vs 396KB），对 wasm/data 有约 1/4 收益但不解决主因 |
| swr | **实测在 EdgeOne 上不生效**（过期后阻塞回源 13s，不是先吐旧值） |

---

## 二、A' 已上线（heart `2af1ae23`）

**实现**：`.gz` 路径按不透明二进制处理——回源 `Accept-Encoding: identity`、原样透传客户端 `Range`、响应设 `Accept-Ranges: bytes` + `Content-Type: application/gzip`、**不设 `Content-Encoding`**（让出口层「无需解读、不可再压」）。

**验收（实测）**：

```bash
curl -sI https://isui.ren/repo/Octave/w64/octave.wasm.gz | grep -i accept-ranges
# ⇒ Accept-Ranges: bytes

curl -s -D- -r 0-1048575 https://isui.ren/repo/Octave/w64/octave.wasm.gz -o part
# ⇒ HTTP/1.1 206 Partial Content
#    Content-Type: application/gzip
#    Content-Range: bytes 0-1048575/7304578
#    Content-Length: 1048576
#    实收 1048576B，首字节 1f 8b（gzip magic）✓
#    耗时 1.2s
```

与 Pages 直连逐字节一致。**分片通道打通了。**

可用文件（全部带 `.gz` 且 Range 自洽）：

| 文件 | 原始 | gzip |
|---|---|---|
| `w64/octave.wasm.gz` | 30.8MB | 7.30MB |
| `w64/octave.data.gz` | 9.3MB | 3.16MB |
| `omc/OpenModelicaCompiler_bg.wasm.gz` | 74.5MB | 20.90MB |
| `_astro/App.*.js.gz` | 396KB | 122KB |

**客户端用法**（你们实现）：

```js
// 并行取 1-2MB 分片，每片独立超时+重试
const parts = await Promise.all(slices.map(({start, end}) =>
  fetch(`/repo/Octave/w64/octave.wasm.gz`, { headers: { Range: `bytes=${start}-${end}` } })
    .then(r => r.arrayBuffer())
));
// 拼接 → 解压 → 喂给 WebAssembly
const gz = new Blob(parts);
const wasm = await new Response(gz.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
```

注意：`Content-Range` 的 `/7304578` 是 **gz 总长**，不是原始 wasm 长度。分片必须按 gz 字节切，拼完再解压。

---

## 三、对冲请求：代码上线但运行时否决

**我做的**：小文件（非 `.wasm`/`.data`）1.5s 内没拿到响应头就并发第二发，**首个成功者胜**（失败不 settle，继续等另一发），另一个 abort。本地仿真 5/5 通过（含 primary 失败 + hedge 成功）。

**实测结果：完全无效。**

| 探测 | 改前 | 改后 |
|---|---|---|
| 并发 10 路 chunk | 2/10 卡 25s | **2/10 卡 25s** |
| 单发 20 次 | — | **6/20 卡到 30s+** |
| 8s 超时是否触发 502 | — | **不触发，返回 200 + 40s** |

**根因**：**EdgeOne 运行时的 `AbortController` 无法中断已发起的 fetch**。证据：
1. 8s 超时到了应该 abort → 返回 502；实际返回 **200**、耗时 40s+；
2. 对冲第二发发了也没用——第一发卡住时，整个请求跟着卡住；
3. 代码确实部署了（`.gz` 的 `Accept-Ranges: bytes` 证明新版本生效）。

**这条推翻了第三方评估的隐含前提**（他假设 `AbortController` 能取消，见其「对冲请求」一节）。**对冲在 EdgeOne Pages 中间件上不可行**，除非有别的取消机制。

---

## 四、其它验证结果（供你们决策）

### 4.1 方案 B 对 JS 零收益

| 文件 | `Accept-Encoding: gzip` | `identity` |
|---|---|---|
| `_astro/App.D7owsQ-e.js` | **123,650B**（在线压缩） | 395,977B |
| `w64/octave.wasm` | **7,458,132B**（在线压缩） | 31,246,819B |

**Pages 对 JS 和 wasm 都做在线压缩**。所以「回吐 .gz 省字节」对 JS 没有意义（已经是最小的了），对 wasm/data 才省（但要改中间件重贴标签，收益 1/4）。

### 4.2 swr 在 EdgeOne 不生效

HTML 设 `max-age=30, swr=600`，等 32s 过期后连续请求：

```
req1: 0.65s  Age: 0
req2: 1.51s  Age: 1
req3: 13.06s Age: 19   ← 阻塞回源，不是先吐旧值
req4: 0.31s  Age: 23
```

**过期后是阻塞回源**，`stale-while-revalidate` 没被平台实现。这意味着劣化窗口里，HTML 每次过期都要承担一次阻塞回源。

---

## 五、我方能做的（按可行性排序）

1. **✅ 已做**：A' 分片通道（客户端分片加载 = 唯一不受平台出口层影响的做法）
2. **可做**：把 `_astro` 的 `.gz` 也纳入 A'（现在只对 `.gz` 路径生效，但客户端需要知道去取 `.gz`）
3. **可做**：`bridge/*` 也提供 `.gz`（如果构建侧有）
4. **做不到**：对冲、超时中断（运行时限制）
5. **做不到**：swr（平台未实现）

---

## 六、建议你们做（客户端侧）

按第三方评估的「客户端减少失败暴露」：

1. **12 个阻塞脚本合并成 3 个左右**——p=10% 时整页幸存率从 28% 升到 73%（这个不需要我配合，纯 UI 侧改动，收益最大）
2. **Service Worker**：hashed 资源 cache-first、bridge/lanes stale-while-revalidate——首次成功后回访的有效 p 接近 0
3. **大文件走 A' 分片**（上面给了代码），每片独立重试

**我方唯一能给的确定性收益就是 A'**；其余杠杆都在客户端。

---

## 七、诚实边界

- 平台行为（206 透传、出口压缩、swr、AbortController）**均无官方文档**，以上全是实测
- 节点级抖动仍在，A' 只是让客户端能绕开「单发大请求卡死」的形态
- 我方无 purge / 无 L7 规则权限

—— isui.ren 站侧维护会话
