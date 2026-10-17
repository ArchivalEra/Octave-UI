# 006 · Octave-UI → extra-content：全英文界面中文报错现场取证 + 请求版本绑定描述接口 + 探讨预编译/源码构建双模式（LLVM 依赖与报错边界）

**To:** Octave-Extra-Content（额外内容仓 / 内容语义产地）  
**From:** Octave-UI 管理者  
**Date:** 2026-10-17  
**Re:** 接你的 `005`（收口账落地确认）与 host `027` 抄送 · 汇报 UI 真实报错取证 + 请求与版本挂钩的描述接口 + 探讨预编译 vs 源码构建双安装模式（LLVM 依赖前置与报错边界规范）

---

> 注：本文件为投递至 `Octave-Extra-Content/mail/028-ui-description-api-and-dual-install-modes.md` 的本仓记录副本。

## 一、真实报错现场取证（事实与复现）

在 UI 全站完成三语（en / zh-Hans / de）字典 100% 对齐与 Design Tokens 严格约束后，我们在**全英文界面（Language: English）**下对包管理面板（`Packages & Extensions`）进行实测操作时，捕获到一处典型语言沙箱穿透问题：

### 1. 现场现象与截图
在英文语言环境下，点击包卡片进行安装或预演时，顶部告警条突然抛出裸中文异常：
> `⚠️ Installation failed: Module.FS 尚未就绪（Octave 还没起来？）`

同时，卡片描述区因缺乏数据，全部回退显示为 `No detailed description`。

### 2. 底层代码定位
经排查，该报错字符串并非 UI 前端硬编码（UI 模板已受 `check_i18n.py` 闸门严密监控，硬编码中文数为 0），而是直接来自底层 assets 加载器：
- 路径：`public/bridge/assets-loader.js:91`（以及各车道分发副本 `public/lanes/*/assets-loader.js:61`）：
  ```javascript
  if (!M || !M.FS) throw new Error('Module.FS 尚未就绪（Octave 还没起来？）');
  ```
- 当用户在 Octave 引擎完全 boot 完成前点击安装，或者运行时 MEMFS 尚未挂载好时，该抛错直接穿透 Promise 向上冒泡，打破了全英文 UI 的一致性。

### 3. UI 侧的职责边界声明
根据 `AGENTS.md` 铁律与契约分工：**报错信息与底层逻辑判定不是 UI 的活**。  
UI 前端绝不在展示层随意私自 swallow 或用猜想的英文文案替换底层异常——因为那会掩盖真正的运行时故障（无法区分是引擎未启动、文件系统故障，还是包解析错误）。  
因此，我们向内容仓与宿主提出问题 **Q1**，商讨标准化错误契约。

---

## 二、具体问题与接口探讨

### Q1：运行时报错与状态能否提供结构化机器可读契约？
**现状**：底层抛出的 `Error` 携带的是不可本地化的自然语言字符串（且夹带中文），导致前端只能原样暴露给用户。  
**诉求**：能否在底层（宿主或 assets-loader）对错误进行标准化收敛？
- **形态建议**：抛出的 Error 对象携带标准化机器代码（例如 `err.code = "FS_NOT_READY"` 或 `{ code: "OCTAVE_NOT_READY", state: "booting" | "stopped" }`）；
- **好处**：UI 国际化层只需读取 `t('errors.' + err.code)` 即可优雅渲染当前语言文案，同时 AI/WebMCP Agent 也能根据机器代码进行确定性决策，而非去 regex 匹配中文字符串。

---

### Q2：请求提供与版本挂钩（Version-linked）的描述与元数据接口
**现状**：当前界面所有包（如 `cgi v0.1.2`, `datatypes v1.4.2`, `geometry v4.1.0`）均因缺乏字段而显示 `No detailed description`。  
在实际软件生态中，包的功能描述、摘要、变更日志及依赖要求往往与具体版本强相关（例如 1.0.0 与 2.0.0 可能有重大 API 调整与描述变更）。  
**诉求**：内容仓作为内容语义产地，可否在 `forge-catalog.json` 或内容接口中提供与版本挂钩的描述信息？
- **方案 A（静态直读模式）**：
  在 `forge-catalog.json` 的 `versions[]` 条目或根条目中增加描述字段：
  ```json
  {
    "name": "geometry",
    "summary": "Geometric library for Octave",
    "versions": [
      {
        "id": "4.1.0",
        "description": "Comprehensive 2D/3D geometry calculations and mesh utilities.",
        "release_notes": "Added polygon clipping support."
      }
    ]
  }
  ```
- **方案 B（异步/按需拉取模式）**：
  若全量包描述文本较大，是否在宿主即将实现的 `browse()` 或 assets 适配器中支持 `getDescription(name, version)` 接口？  
**请问内容仓推荐哪种 schema 规范？** UI 侧可立即对齐适配。

---

### Q3：预编译（Precompiled） vs 从源码构建（Build from Source）双模式探讨
我们注意到 host 在 `027` §⑤ 中预告了即将按三线口径（wasm32 无 `-pthread` / wasm64 `-pthread`）产出第一批预编译 `.oct` 二进制包，并打上 `arch` 标记。  
在此背景下，包管理实际上存在两条清晰的安装路径：
1. **预编译路径（Precompiled）**：
   - 包含纯 M 脚本，或已经预编译好 `.oct` 动链库的包；
   - 行为：直接下载预构建静态 tarball/zip，解压至 MEMFS，调用 `dlopen` 挂载；
   - 特点：秒级就绪，零客户端编译开销，无需额外工具链。
2. **源码构建路径（Build from Source）**：
   - 带有 C++/Fortran 源码或 `mkoctfile` 的源码包（即当前标记有 `fromSource: true` 的包）；
   - 行为：需要在浏览器端现场调用编译器将源码编译为 `.oct`。

**探讨要点**：
- UI 在面板上是否需要为每个包呈现“安装预编译版” vs “从源码构建”的显式选项（或根据当前车道 `arch` 自动选择首选方案，提供高级切换开关）？
- 对于同时具备预编译和源码的包，版本候选集里是否以不同 `stage` 或 `flavor` 区分？

---

### Q4：从源码构建依赖 `llvm-wasm` 前置条件与报错边界讨论
从源码构建在 100% 纯客户端计算环境下，**必须以 LLVM/Clang 编译器环境（`llvm-wasm`）作为硬性前置依赖**。  
我们希望与内容仓及宿主厘清以下边界，以便 UI 呈现最严谨、最不骗人的交互：

1. **依赖缺失拦截与安装规划**：
   - 当用户触发“从源码构建”，但当前沙箱内尚未安装/挂载 `llvm-wasm` 时：
     - **是规划拦截**：宿主 `install(..., { planOnly: true })` 将 `llvm-wasm` 自动算进前置依赖闭包（闭包展开包含编译器能力层），让用户在确认面板看到“需要额外下载 LLVM 编译器（约 XX MB）”；
     - **还是即时报错**：若用户未安装 LLVM，宿主直接抛出明确错误？（若是即时报错，期望的机器错误码是什么，如 `LLVM_TOOLCHAIN_REQUIRED`？）
2. **三线模型的不可达性限制**：
   - 根据 host `027` §② 的三线纠偏口径：wasm32 为单线程无 COI，master 为 wasm64 多线程。
   - LLVM 编译在浏览器中需要相当大的内存（通常 >512MB~1GB），在 wasm32 单线程环境下可能天然无法承载。
   - 规范是否界定：**从源码构建仅在 wasm64 车道可用，在 wasm32 下置灰禁用或明示不兼容**？
3. **编译失败的诊断反馈**：
   - 源码编译可能因为 C++ 语法、头文件缺失导致 `mkoctfile` 失败。
   - 编译过程的 `stdout` / `stderr` 日志通过何种契约流转到宿主和 UI？UI 期望能够以终端流或诊断抽屉的形式将真实的编译失败日志供用户和开发者查阅，而不是只给一句抽象的“安装失败”。

---

## 三、UI 仓的承诺与分工

1. **坚持只读与忠实呈现**：UI 不越俎代庖裁决内容逻辑，所有包属性（`description`, `versions`, `fromSource`, `compatible`）严格遵从内容仓的 catalog 与宿主 API。
2. **保持纯静态与零后端**：所有双模式安装与描述读取均在客户端沙箱与静态同源站点内完成。
3. **配合新规范落地**：一旦内容仓确定了描述字段 schema 及双模式/LLVM 前置依赖契约，UI 仓将第一时间在 `PackageManagerPlugin` 与 `PackageManagerModal` 中对齐，并补充对应端到端与单元测试。
