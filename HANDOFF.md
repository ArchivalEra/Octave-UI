# Octave-UI 网站部署与运维交接手册 (Handoff Guide)

本手册专为负责网站运维与部署的管理员编写，包含 Octave-UI 前端项目的构建规范、静态托管要求、Web 服务器/CDN 规则配置以及 GitHub Actions 自动化部署建议。

---

## 1. 架构定位与交付特性

- **100% 纯客户端计算**：没有后端 API、数据库或服务端计算代理。所有 Octave 科学计算均在用户浏览器内的 WebAssembly 引擎中运行。
- **纯静态交付产物**：Astro 构建产物为纯静态文件（HTML / JS / CSS / WASM / DATA），锁死输出于仓库内的 `./dist/` 目录。
- **预压缩交付支持**：构建后附带全量 `gzip -k -9 --force` 产物（生成对应的 `.gz` 伴随文件），支持 CDN 或 Web 服务器的 `gzip_static` 零开销高并发交付。
- **双模与三引擎车道支持**：
  - 界面提供 **交互式笔记本 (Notebook)** 与 **全功能纯终端 (Terminal)** 两种模式。
  - 支持免重载切换三款引擎：`wasm32-final` (通用兼容 32 位)、`master` (稳健 64 位)、`IllegalPerformance` (性能先锋 64 位)。相关引擎驱动与固件均已打包在静态包内的 `lanes/` 与 `bridge/` 路径。

---

## 2. 构建环境与命令规范

### 2.1 环境要求
- **Node.js**: `>= 18.0.0` (推荐 Node 20 LTS 或 Node 22 LTS)
- **pnpm**: `>= 8.0.0` (推荐 pnpm 9)
- **gzip**: 标准 Linux/Unix `gzip` 命令（用于执行预压缩脚本）

### 2.2 构建与打包步骤

在项目根目录下依次执行：

```bash
# 1. 安装依赖
pnpm install --frozen-lockfile

# 2. 运行单元测试（可选，建议在 CI 中执行）
pnpm test

# 3. 构建静态产物（输出到 dist/ 目录）
pnpm build

# 4. 对 dist/ 下所有静态文件生成 .gz 预压缩包
bash scripts/compress-static.sh dist
```

执行完毕后，`./dist/` 目录即为可直接对外交付的最终静态站点根目录。

---

## 3. 服务器与 CDN 配置核心规范 (至关重要)

> [!CAUTION]
> **强隔离响应头（COOP / COEP）是本站点正常运行的前提**。
> WebAssembly 引擎依赖多线程并发与 `SharedArrayBuffer`，若缺少跨域隔离响应头，浏览器会出于安全策略禁用 `SharedArrayBuffer`，导致引擎在启动时崩溃。

### 3.1 必需的 HTTP 响应头 (Cross-Origin Isolation)
所有 HTML 页面以及静态资源请求的响应头中，**必须**包含以下两个头部：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 3.2 静态预压缩与 MIME 类型配置
- 推荐启用 `gzip_static on;`，优先发送现成的 `.gz` 文件，显著降低服务器 CPU 负载并极大提升大型 WASM 固件（~30MB 压缩至 ~8MB）的加载速度。
- 确保正确配置 `.wasm` 文件的 MIME 类型为 `application/wasm`。

---

## 4. 常见 Web 服务器 / CDN 详细配置示例

### 4.1 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/octave-ui/dist;
    index index.html;

    # 1. 核心强隔离响应头（SharedArrayBuffer 必需）
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;

    # 2. 启用 gzip 预压缩交付
    gzip_static on;

    # 3. 静态页面路由兜底
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 4. WASM 与二进制数据文件静态缓存策略
    location ~* \.(wasm|data)$ {
        types {
            application/wasm wasm;
            application/octet-stream data;
        }
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # 5. JS/CSS 静态资源长期缓存
    location ~* \.(js|css|svg|png|jpg|ico)$ {
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Cross-Origin-Embedder-Policy "require-corp" always;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

### 4.2 腾讯云 EdgeOne / 阿里云 DCDN / Cloudflare 配置指南

若将静态产物上传至对象存储 (COS/OSS/S3) 并经由 CDN 分发：
1. **边缘规则 / 自定义响应头**：
   在 CDN 控制台的「响应头配置」中添加：
   - 响应头名称：`Cross-Origin-Opener-Policy`，值：`same-origin`
   - 响应头名称：`Cross-Origin-Embedder-Policy`，值：`require-corp`
2. **预压缩支持**：
   开启 CDN 控制台中的「Brotli / Gzip 智能压缩」或「静态预压缩跟随 (Content-Encoding: gzip)」。
3. **MIME 类型映射**：
   对象存储中确保 `.wasm` 对象的 `Content-Type` 为 `application/wasm`。

### 4.3 二级子路径部署说明（如 `xxx.com/repo/Octave/`）
若计划将站点挂载在域名的子路径下：
1. 修改 `astro.config.mjs`，增加 `base: '/repo/Octave/'`：
   ```javascript
   export default defineConfig({
     base: '/repo/Octave/',
     // ... 其他现有配置保持不变
   });
   ```
2. 重新执行 `pnpm build && bash scripts/compress-static.sh dist` 即可。

---

## 5. GitHub Actions 自动化 CI/CD 配置模板

若希望利用 GitHub 仓库自动构建并发布至 GitHub Pages 或静态服务器，管理员可将以下工作流保存至 `.github/workflows/deploy.yml`：

```yaml
name: Deploy Octave-UI

on:
  push:
    branches: [ master, main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Tests
        run: pnpm test

      - name: Build Static Site
        run: pnpm build

      - name: Compress Static Assets (Gzip -9)
        run: bash scripts/compress-static.sh dist

      - name: Upload Pages Artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'dist'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> [!NOTE]
> 如果直接部署到 GitHub Pages，请在 `public/` 目录下放置一个带有 COOP/COEP Service Worker（如 `coi-serviceworker.js`）或通过 Cloudflare / EdgeOne 开启反向代理注入响应头，因为原生 GitHub Pages 默认不允许自定义 HTTP 响应头。

---

## 6. 常见问题排查 (Troubleshooting)

1. **页面报 `SharedArrayBuffer is not defined` 或引擎卡在启动阶段**：
   - **排查手段**：打开浏览器开发者工具 Console，查看 `window.crossOriginIsolated` 是否为 `true`。
   - **解决办法**：若为 `false`，说明服务器响应缺少 `Cross-Origin-Opener-Policy: same-origin` 或 `Cross-Origin-Embedder-Policy: require-corp` 头。请核对第 3、4 节配置。
2. **WASM 下载耗时过长或报 404**：
   - 检查 Web 服务器或 CDN 是否拦截了大于 20MB 的静态请求，确认 `dist/lanes/` 与 `dist/bridge/` 下的相关文件已被完整拷贝。
3. **本地开发验证**：
   - 仓库内附带了内置正确 COOP/COEP 响应头的预览服务器脚本：
     ```bash
     pnpm preview
     ```
     浏览器访问 `http://127.0.0.1:8868/` 即可直接验证完整功能与各项响应头。
