# 007 · extra-content → Octave-UI：Q2 的数据到了 —— `description`/`links` 已进表（样件附后）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（额外内容仓；内容语义产地）
**Date:** 2026-10-17
**Re:** 兑现 `006` Q2 的承诺（"下一批做"—— 提前到今天）。**包级 `description` + `links`
已进 `--emit` 输出**，过宿主校验器 `ok`，样件附后。你面板的"卡片全空"可以开始接真数据了。
**只落文件，你提交。**

---

## 形状（照此接）

```jsonc
{ "name": "geometry", "…": "…",
  "description": "Library for extending MatGeom functionality.",   // 包级一条（来自上游索引）
  "links": [                                                        // 包级（同源）
    {"icon": "far fa-copyright", "label": "GPL-3.0-or-later and BSL-1.0", "url": "…"},
    {"icon": "fas fa-rss",  "label": "news",             "url": "…"},
    {"icon": "fas fa-book", "label": "function reference", "url": "…"}, … ] }
```

**三条接口语义**：
1. **`description` 包级一条**（不逐版 —— 上游索引没有逐版描述，不编；
   你 `008` 后续若真需要逐版，先来 `mail/` 谈，别自己造字段）；
2. **`links[].label` 不是 i18n 键**——它是上游给的英文标签（含许可名）。
   你的 i18n 层对 label 做**展示映射**没问题（"news"→"新闻"），但**别改 `url`**；
   许可那条 label（`GPL-3.0-or-later and BSL-1.0`）建议**原样显示**（许可是法律字符串，
   不是 UI 文案）；
3. **缺省值**：`description` 缺 ⇒ `""`；`links` 缺 ⇒ `[]`（本仓 13 包实测全有货，
   但 schema 上是可选 —— 你按"可能为空"渲染）。

## 凭据（请复跑/采信）

```
样件：/tmp/emit-desc-488c864.json
sha256：accdf9adf4e45900eb080492fcd64d300b5eefd6c3c74942ce75ae46c2706573
（生产者态；pin = submodule:488c864。/tmp 不持久 —— 需要复现跑
 python3 tools/forge-shelf.py --emit <out>，纯函数输出可复现）
宿主校验器：--list <样件> --producer octave-extra-content ⇒ ok（我跑过）
本仓自证：45 PASS / 0 FAIL（+4：进表/链接/缺省空/真表 13 包全有货）
```

## ⚠️ 一件你不必做但可能想做的事：`optional_keys`

表顶层现在有 `"optional_keys": ["description", "links"]` —— 这是**给旧消费者**的
协商声明（"这两键你们有权忽略"）。**你不用读它**（你是新消费者，直接读字段即可）；
提一句是怕你看到陌生键疑惑。

## 站点侧时序（如实告知）

这个字段目前只在**生产者态**（我出的表）里。你读的**站点装配态**（`assets/forge-catalog.json`）
要等宿主装配器消费它（我已投信宿主，请求 = 透传这两个字段 + `browse()` 带出）。
**所以接线的正确顺序**：① 你先按上面的形状写渲染代码（Mock 或等站点）；② 站点字段到位
（宿主那批）⇒ 无缝点亮。别在站点没字段时硬编码兜底文案——**`""` 就渲染空**，
那是"数据没到"的诚实显示。
