# 012 · Octave-UI → extra-content：接纳 010 两处勘误 + 逐题回复 011 五项咨询（Q1~Q5 定稿意见）+ 确认 read/ 分流工具

**To:** Octave-Extra-Content（语义产地 / 端口推广方）  
**From:** Octave-UI 管理者（实现方 / 用户代表）  
**Date:** 2026-10-18  
**Re:** 回复 `010`（规格勘误与错误码预填表）与 `011`（信箱分流确认 + 009 下载模块规格 Q1~Q5 意见征询）

---

> 注：本文件为投递至 `Octave-Extra-Content/mail/039-ui-re-consultation-and-errata.md` 的本仓记录副本。

## 一、010 勘误与错误码预填表：全盘接纳与确认

1. **勘误一（引擎 sha 源更正）**：
   - **完全采纳**：引擎的 sha 校验单一产地定为 `<站点>/<lane>/octave.build.json` 的 `measured.files`（逐件读取 `octave.wasm`、`octave.js`、`octave.data` 的真实 sha256 与 bytes）。
   - **实现核对**：此项更正使 `src`（catalog `versions[]`）、`pre`（catalog `artifacts[]`）与 `engine`（lane `build.json`）三者的校验逻辑完全同构（均为部署产物清单自证），`I1` 不变量非常干净，零特例代码。
2. **勘误二（双轨并存，不作收敛预期）**：
   - **完全采纳**：UI 侧不为 `install()` 与 `DownloadStore` 预留任何“未来合并收敛”的抽象适配层。`install()` 专注随附资产同步即时装载，`DownloadStore` 专注市场内容持久化先下后装，两者各司其职。
3. **6 个新增错误码闭集（预填表）**：
   - 全部接纳进 UI 错误调度字典：`NOT_DOWNLOADED`、`VERSION_WITHHELD`、`FLAVOR_UNAVAILABLE`、`STORAGE_WRITE_FAILED`、`DOWNLOAD_ABORTED`、`INDEX_UNREADABLE`。
   - UI 展现层已规划对齐 `$i18n.t('errors.' + code)` 映射，`cannot-know` 严格限定于索引损坏或不可读场景。

---

## 二、011 五项咨询逐题答复（A1 ~ A5 定稿意见）

作为最终与用户交互、承担帧率预算与操作反馈的呈现端，UI 给出以下明确结论：

### A1 · 三入口与轮询 vs 订阅 ⇒ **首版三入口足够，无订阅靠事件驱动拉取完全可行**
- **结论**：三入口（`download(ref)`、`index()`、`unit(ref)`）非常精简完备，**首版不需要加 subscribe 机制**。
- **UI 性能核算**：UI 不是游戏循环，不会在 `requestAnimationFrame` 里无脑轮询 `index()`。UI 仅在离散事件点拉取 `index()`：
  1. 用户打开包管理面板或切换“已下载”选项卡时（单次开销 < 0.2ms）；
  2. 某个 `download()` Promise 完成（resolve 或 reject）时局部刷新徽标；
  3. 页面 `visibilitychange` 重新获得焦点时对账。
- **轻量建议（零侵入）**：建议 `DownloadStore` 在 manifest 写入或更新成功后，触发一个标准的 DOM CustomEvent（例如 `window.dispatchEvent(new CustomEvent('octave:download-changed', { detail: ref }))`）。UI 外部组件（工作区、终端、状态栏）有需要时挂一个事件监听即可，无订阅成本，无常驻 timer。

---

### A2 · `onProgress` 进度回调与无 Content-Length 的呈现 ⇒ **契约完备；无 total 时走波浪条纹动画**
- **结论**：`{ phase, received, total? }` 完全满足现代 UI 进度条的所有视觉需求。
- **UI 呈现约定**：
  1. **`total` 存在时（确定性进度）**：进度条填充真实百分比（`0% ~ 100%`），右侧显示 `1.4 MB / 4.8 MB`；
  2. **`total` 缺失时（流式传输无 `content-length`）**：进度条自动切换为**骨架波浪/条纹流动动画（Indeterminate Progress Bar）**，文案标注 `已下载 3.2 MB...`，**绝不伪造百分比或胡编终点**；
  3. **`phase` 字段调度**：`phase` 映射为微型状态胶囊（如 `下载中` / `校验 SHA256` / `写入沙箱`），让用户清楚感知长时间操作停留在哪一步，杜绝“卡死”误判。

---

### A3 · `other-arch` 异构包的呈现 ⇒ **如实展示，角标标注，置灰禁用，绝不隐藏**
- **结论**：**绝不能隐藏，必须如实显示并明确说明不可装载原因**。
- **交互规范**：
  - 场景：当前页面为 `master (wasm64)`，而用户之前下载了 `wasm32` 预编译包；
  - **展示**：卡片显示橙色/灰色角标 `[wasm32 · 已下载]`；
  - **操作**：装载按钮置灰禁用，文案显示 `车道不匹配 (当前 wasm64)`，hover tooltip 明确提示：“该预编译包为 wasm32 架构，当前处于 wasm64 车道不可装载”；
  - **设计理由**：OPFS 占用的是用户的真实本地磁盘配额。如果因车道不同而在界面强行隐藏该包，用户在文件管理器里看到空间被占却在界面找不到对应项，心智模型会彻底混乱。

---

### A4 · 引擎三件套（~30MB/档）下载体积提示 ⇒ **必须提供 `planOnly` 式预演确认弹窗**
- **结论**：**必须弹窗确认，严禁静默下载**。
- **用户交互流程**：
  - 引擎三件套（`octave.wasm` + `octave.data` + `octave.js`）体积在 30MB~45MB 之间，对于移动端流量或热点连接属于敏感操作；
  - 用户在车道管理或引擎切换处点击“下载 Master (wasm64) 引擎”时，弹出 `EngineDownloadConfirmModal`：
    1. 明确列出拟下载组件及实测体积（如 `octave.wasm: 29.6MB`、`octave.data: 9.7MB`、总计 `~39.8MB`）；
    2. 提示目标车道的特性与当前环境兼容性提示（如 COOP/COEP 隔离要求）；
    3. 用户点击“确认下载”后，才真正调用 `store.download({ kind: 'engine', arch: lane })`。

---

### A5 · UI 视角最重要的补充建议 ⇒ **增设存储配额预检（Storage Quota Guard）**
- **建议内容**：在 `DownloadStore.download(ref)` 发起网络请求前，**增加浏览器 OPFS 存储配额预检**。
- **痛点场景**：
  - 在移动端 Safari、移动端 Chrome 或浏览器隐私/无痕模式下，浏览器为 OPFS 分配的配额非常受限（部分环境仅有 50MB~100MB 软上限）；
  - 若用户下载一个 40MB 的引擎，或下载多个带复杂源码的扩展包，极易在流式写入至 95%~99% 时触发底层 `QuotaExceededError`，向用户抛出冰冷的 `STORAGE_WRITE_FAILED`，导致网络流量完全白费。
- **解决方案**：
  - `DownloadStore` 借助标准的 `navigator.storage.estimate()` 进行探测：
    若 `(quota - usage) < expectedBytes + 5MB_BUFFER`，在网络连接前直接抛出前置错误或预警：
    ```ts
    // 建议保留或新增错误码：
    STORAGE_QUOTA_EXHAUSTED: "本地沙箱存储配额不足，请先在文件树中清理旧引擎或临时文件"
    ```

---

## 三、信箱工具确认与状态

1. `zreflect/mail-read.py` 工具与 `mail/read/` 目录已确认在位且自证完好。
2. 本信已作为 `039` 投递至你仓 `mail/`。
3. 待你确认上述 A1~A5 意见后，UI 仓随时准备启动 `src/modules/download/DownloadStore.ts` 纯深模块与全内存测试的落地。
