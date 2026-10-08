# HANDOFF.md · 网站管理员运维交接手册

> **交接日期**：2026-10-08  
> **系统版本**：Octave-UI v0.1.0 (GNU Octave 11.3.0 Wasm 纯客户端前端)  
> **质量基线**：16/16 测试套件通过，119/119 自动化用例 100% 通过，全站零后端依赖  

---

## 一、 系统架构与部署定性

1. **100% 纯客户端科学计算**：
   - 所有 Octave 语法解析、线性代数矩阵运算、绘图数据生成均由用户浏览器端 WebAssembly (memory64 + pthreads 多线程) 本地执行；
   - **服务器端 0 计算进程、0 数据库、0 后端 API**，无论访问量多大，服务器只有静态文件流量消耗，无算力账单。
2. **纯静态与预压缩交付**：
   - 构建产物锁死在本仓 `./dist/`；
   - 生产环境除生成标准静态资源（HTML/JS/CSS）外，全量附带 `gzip -9` 预生成的 `.gz` 压缩文件。
3. **上游引擎依赖**：
   - 引擎仓库 `ArchivalEra/Octave-Full-Wasm` 保持绝对只读，交互严格受 14/14 Embed API 契约保护。

---

## 二、 Web 服务器 / CDN 生产配置规范（⚠️ 核心运维硬要求）

由于 WebAssembly 多线程（pthreads）必须使用浏览器的 `SharedArrayBuffer`，**Web 服务器或 CDN 必须正确配置以下两项安全响应头**，否则浏览器会拒绝启动计算引擎：

### 1. 跨域隔离标头 (COOP & COEP)
在 Nginx / Caddy / Cloudflare / EdgeOne 中必须为所有页面请求配置：
```nginx
# Nginx 配置示例
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
```

### 2. 静态预压缩 (Gzip Static)
产物目录 `dist/` 中预置了所有资产的 `.gz` 高压缩包（包括 `octave.wasm.gz`、`octave.data.gz`），开启静态预压缩可节省 70%+ 带宽并提升首屏加载速度：
```nginx
# Nginx 配置示例
gzip_static on;
gzip_http_version 1.0;
gzip_proxied any;
```

### 3. HTTP Range 请求支持 (分块断点续传)
前端引擎采用 5MB 分块切片加载大型二进制（`octave.wasm` / `octave.data`），CDN 与 Web 服务器必须支持 HTTP 206 Partial Content（现代 Nginx 默认支持）。

### 4. 推荐 Nginx 完整配置参考
```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name octave.example.com;
    root /var/www/octave-ui/dist;
    index index.html;

    # 1. 必须的跨域隔离头
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    # 2. 启用预压缩静态加速
    gzip_static on;

    # 3. 单页静态路由兜底
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 4. 静态资产长期缓存
    location ~* \.(wasm|data|js|css|png|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
    }
}
```

---

## 二·五、 部署契约与自动化管线（2026-10-08 起）

**结论：本仓的改动不再需要人工交接给网站管理员。** 交付要求（子路径挂载、大二进制分片、引擎树布局）
由流水线在构建期自动施加与断言；UI 侧只管写 UI，写对了不被改、写漏了被兜底、写坏了流水线直接红。

### 契约执行器 `scripts/deploy-contract.mjs`（一个执行器，三个幂等子命令）

| 子命令 | 时机 | 做什么 |
| :--- | :--- | :--- |
| `base` | 构建前 | 把 `astro.config.mjs` 的 `base` 钉成 `/repo/Octave/`（缺失即注入、写错即修正） |
| `adapt` | 构建后 | ① HTML 里遗漏的根绝对引用补前缀；② **JS 字符串/模板字面量里的根绝对资源前缀补前缀**（引擎车道加载路径就在这里，漏了会打到 SPA 兜底页 → 报「缺 OCTAVE 工厂」）；③ 注入 `<meta name="site-base">` + `window.__siteBase`；④ 注入 5MB 分片取数 shim |
| `verify` | 构建后 | 断言产物齐备（根 `w64/octave.wasm`、`bridge/octave-core.js`、三条车道树…）与形态正确（无残留根绝对引用、base 信号在、分片 shim 在）。**任一条不满足即失败，绝不推半个站** |

### 为什么大二进制要分片

`octave.wasm` ≈ 31MB、`octave.data` ≈ 10MB。本站的边缘（EdgeOne）对客户端传大块很慢，
**约 5MB/片是实测甜点**；边缘中间件已支持 `Range → 206`。分片因此是**交付要求**，但
**不在本仓源码里实现**（避免两份实现漂移）——由 `deploy-contract.mjs adapt` 在构建期注入，
源码里只留一句说明。想本地验证分片：`pnpm preview` 后用浏览器看 `octave.wasm` 的多条 206。

### 两条硬约束（改源码时别踩）

1. **不要写死根绝对资源路径**：`/lanes/…`、`/bridge/…`、`/w64/…`、`/assets/…`、`/_astro/…`
   必须以 `import.meta.env.BASE_URL`（页面）或部署契约注入的 base 信号
   （`meta[name=site-base]` / `window.__siteBase`）为前缀。契约会兜底，但源头写对最省事。
2. **`.wasm` / `.data` 不要自己 fetch 整包**：交给契约注入的分片 shim（它透明接管
   `window.fetch`）。若你确实要自己取，记得用 `Range`。

### 流水线

`.github/workflows/pages.yml`：push main → `base` → 同步引擎三车道（公开仓
`Octave-Full-Wasm` 的 `wasm32-final`/`master`/`IllegalPerformance` 分支 `site/` 树）→ `pnpm install`
→ **`pnpm test`（闸门）** → `pnpm build` → `adapt` → `verify` → 发 GitHub Pages。
产物根会写 `deploy-stamp.json`（车道清单、base、构建源 SHA、引擎三分支 SHA）供线上对账。

> 站点侧（`isui.ren` 边缘中间件）负责：反代 Pages、补 COOP/COEP、`Range → 206`、统一 10 分钟缓存。
> 这些不在本仓；本仓只需保证产物形态正确，而形态由 `verify` 保证。

---

## 三、 日常运维与常用指令

| 任务 | 执行命令 | 说明 |
| :--- | :--- | :--- |
| **安装依赖** | `pnpm install` | 纯前端开发依赖（Astro 5 + Svelte 5 + Vitest） |
| **编译生产包** | `pnpm build` | 编译纯静态产物至 `./dist/` |
| **生成 Gzip 包** | `pnpm compress` | 批量生成 `dist/**/*.gz`（gzip -9） |
| **一键编译+压缩** | `pnpm build && pnpm compress` | 生产发布标准两步走 |
| **本地带头预览** | `pnpm preview` | 启动本地服务（默认 8868 端口，内置 COOP/COEP） |
| **单元测试** | `pnpm test` | 运行 Vitest 全量 16 个测试套件 |
| **同步上游车道** | `pnpm sync:lanes` | 拉取并生成三车道独立静态包 |

---

## 四、 核心功能台账（交接验收确认）

- [x] **双视图模态**：
  - **笔记本模式 (Notebook)**：Colab / Jupyter 式分节交互执行（`%%` 语法原生双向解析），支持即时编辑、运行单节、批量运行与数据表格/折线图展示；
  - **工作台模式 (Workbench)**：经典 xterm 终端 + 变量检视器（双击查看矩阵）+ 历史记录面板。
- [x] **三车道引擎支持**：
  - 支持 `wasm32-final`（归档稳定）、`master`（wasm64 正式）、`IllegalPerformance`（极速先锋）；
  - 运算未启动前可在顶栏 ⋮ 菜单中任意选择切换；计算启动后自动锁定防止状态撕裂。
- [x] **本地工程目录挂载与自由更换**：
  - 桌面端：基于原生 File System Access API（`window.showDirectoryPicker`）直接读写本地磁盘 `.m` 脚本与数据，支持随时重新选择/更换目录；
  - 移动端（iOS / Android）及非 Chromium：自动降级为文件多选挂载模式，完全避免平台假死。
- [x] **全功能多语言 (i18n)**：
  - 完整支持 **中文 (zh-Hans)**、**英文 (en)**、**德文 (de)** 运行时无缝切换；
  - 笔记本默认迎新脚本与示例代码随界面语言自动对齐。
- [x] **主题与字号微调 (Theme & Font Size)**：
  - Material 3 风格动态强调色（Hue 滑块 + 预设色彩）；
  - 12px ~ 20px 全站字号自由缩放，全站 `rem` 响应式自适应，首屏防闪烁本地持久化。

---

## 五、 故障排查与应急预案 (Troubleshooting)

### 1. 用户反馈：打开控制台报 `SharedArrayBuffer is not defined` 或引擎卡在加载中？
- **排查原因**：Web 服务器或 CDN 缺失了 COOP / COEP 标头，或者用户使用了不支持 `SharedArrayBuffer` 的非安全上下文（非 HTTPS / 非 localhost 域名）。
- **处理方案**：
  1. 确保生产站点使用 **HTTPS** 协议；
  2. 检查 Nginx / CDN 响应头，确认存在 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp`。

### 2. 用户反馈：计算陷入死循环或计算卡住？
- **排查原因**：用户执行了长耗时 Octave 脚本（如 `while true; end`）。
- **处理方案**：
  - 告知用户点击顶栏或工作区的「🛑 停止计算」按钮；
  - 若已严重无响应，点击「自愈恢复」按钮，前端会优雅重启 WebAssembly Worker 线程，**无需管理员干预任何后端服务器**。

### 3. 如何更新上游 WebAssembly 引擎？
- **处理方案**：
  1. 运行 `bash scripts/sync-lanes.sh`；
  2. 运行 `pnpm test` 确认 16 项测试通过；
  3. 运行 `pnpm build && pnpm compress` 生成新静态包；
  4. 将新 `./dist/` 推送至静态托管服务器即可。
