#!/usr/bin/env node
/**
 * isui.ren 部署契约执行器 —— 自动化部署管线的唯一执行点。
 *
 * 为什么有它：本站是「UI 仓产出字节 + 站点边缘交付」的两方结构，而交付要求
 * （子路径 base、大二进制分片、引擎树布局）是**站点的**事实。不该要求 UI 侧
 * 每次改动都记得它们、更不该每次都要人工重新交接一遍。所以：
 *
 *   部署契约 = 一组幂等的、构建期施加的变换与断言，由 CI 每次部署执行。
 *
 * 三条子命令（都幂等，重复跑无副作用）：
 *   base    构建前：把 astro base 钉成部署路径 /repo/Octave/
 *   adapt   构建后：重写产物里遗漏的根绝对引用 + 注入 5MB 分片 shim + bridge 打包
 *   verify  构建后：断言产物齐备且形态正确（缺一即失败，绝不推半个站）
 *
 * 用法：node scripts/deploy-contract.mjs {base|adapt|verify}
 * 环境：ENGINE_SHAS / GITHUB_SHA 可选，写进 dist/deploy-stamp.json 供线上对账。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "/repo/Octave/";
const DIST = "dist";
const LANES = ["wasm32-final", "master", "IllegalPerformance"];

// ───────────────────────── base（构建前） ─────────────────────────
function cmdBase() {
  const file = "astro.config.mjs";
  const src = fs.readFileSync(file, "utf8");
  const re = /(\bbase\s*:\s*)(["'`])([^"'`]*)\2/;
  const m = src.match(re);
  if (m) {
    if (m[3] === BASE) return console.log(`[contract:base] 已是 ${BASE}`);
    fs.writeFileSync(file, src.replace(re, `$1$2${BASE}$2`));
    return console.log(`[contract:base] 修正 ${JSON.stringify(m[3])} → ${BASE}`);
  }
  const anchor = /(output\s*:\s*["']static["']\s*,)/;
  if (!anchor.test(src)) {
    console.error("[contract:base] 找不到锚点 output:'static' —— astro.config.mjs 结构变了");
    process.exit(1);
  }
  fs.writeFileSync(file, src.replace(anchor, `$1\n  base: '${BASE}',`));
  console.log(`[contract:base] 注入 base: '${BASE}'`);
}

// ───────────────────────── adapt（构建后） ─────────────────────────
/** 5MB 分片取数 shim：引擎整包 GET → Range 分片（3 片并行、按序拼接），对引擎透明。 */

function walk(dir, ext) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext));
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

/**
 * 引擎在运行时用**字符串/模板字面量**拼资源 URL（不是 HTML 属性），
 * 例如 WasmEmbedAdapter 的 `e.base||\`/lanes/${lane}/\``。这类字面量 Astro 的
 * base 管不到，是「子路径部署」最典型的破口：漏了前缀就请求站点根的
 * /lanes/… → 命中 SPA 兜底页（text/html）→ 脚本不执行 → "缺 OCTAVE 工厂"。
 * 契约在构建后统一补前缀（只认字面量起始处，不碰其它字符串）。
 */
const JS_ASSET_PREFIXES = ["/lanes/", "/w64/", "/bridge/", "/assets/", "/_astro/", "/omc/"];

function rewriteJsLiterals(code) {
  let n = 0;
  for (const p of JS_ASSET_PREFIXES) {
    for (const q of ["`", "'", '"']) {
      const from = q + p;
      const to = q + BASE + p.slice(1);
      const c = code.split(from).length - 1;
      if (c) {
        code = code.split(from).join(to);
        n += c;
      }
    }
  }
  return { code, n };
}

/** 注入 base 信号：UI 的新代码用 <meta site-base> 或 window.__siteBase 算 base。 */
function injectBaseSignal(html) {
  let out = html;
  if (!/<meta\s+name=["']site-base["']/i.test(out)) {
    const tag = `<meta name="site-base" content="${BASE}">`;
    const idx = out.indexOf("<head>");
    const at = idx === -1 ? out.indexOf("</head>") : idx + "<head>".length;
    if (at === -1) return { out, injected: false };
    out = `${out.slice(0, at)}\n    ${tag}${out.slice(at)}`;
  }
  if (!out.includes("__siteBase")) {
    const idx = out.indexOf("</head>");
    if (idx !== -1) out = `${out.slice(0, idx)}<script>window.__siteBase="${BASE}";</script>\n${out.slice(idx)}`;
  }
  return { out, injected: true };
}

/**
 * fetch 守卫（isui.ren 083-host 客户端杠杆 #2）：同源 GET 的**响应头** 10s 不至 ⇒
 * abort 并重试一次（挂起型失败的单发概率 p → p²）。只看响应头——body 流式传输不受影响
 * （大 wasm 的 142s 下载不会被误杀）；非 GET / 跨源 / 手动 signal 透传不动。
 * 背景：边缘节点对冷缓存路径的回源 fetch 会无限挂起（8s 超时在 EdgeOne 中间件运行时
 * 无效——AbortController 无法中断）；但**浏览器里** AbortController 完好，守卫在这里做。
 */
const FETCH_GUARD = `<script>\n(function(){\n  if (typeof window.fetch !== 'function' || typeof AbortController === 'undefined') return;\n  var HEAD_TIMEOUT_MS = 10000;\n  var orig = window.fetch;\n  window.fetch = function(input, init) {\n    try {\n      var url = (typeof input === 'string') ? input : (input && input.url) || '';\n      var sameOrigin = url.indexOf('/') === 0 || (typeof location !== 'undefined' && url.indexOf(location.origin) === 0);\n      var method = (init && init.method) || (input && input.method) || 'GET';\n      var hasSignal = !!(init && init.signal);\n      if (!sameOrigin || String(method).toUpperCase() !== 'GET' || hasSignal) return orig.apply(this, arguments);\n    } catch (e) { return orig.apply(this, arguments); }\n    var self = this, args = arguments;\n    function once() {\n      var ctrl = new AbortController();\n      var timer = setTimeout(function() { ctrl.abort(); }, HEAD_TIMEOUT_MS);\n      return orig.call(self, args[0], Object.assign({}, args[1] || {}, { signal: ctrl.signal })).then(\n        function(res) { clearTimeout(timer); return res; },\n        function(err) { clearTimeout(timer); throw err; }\n      );\n    }\n    return once().catch(function(err) {\n      var aborted = err && (err.name === 'AbortError' || /aborted/i.test(String(err && err.message || err)));\n      if (!aborted) throw err;\n      return once(); // 仅对「头超时被我们 abort」的做一次重试；网络错误原样抛\n    });\n  };\n})();\n</script>`;

function injectFetchGuard(html) {
  if (html.includes("__octaveFetchGuard")) return html;
  const idx = html.indexOf("</head>");
  if (idx === -1) return html;
  return `${html.slice(0, idx)}<script>window.__octaveFetchGuard=1;</script>\n${FETCH_GUARD}\n${html.slice(idx)}`;
}

/**
 * modulepreload 注入（isui.ren 冷节点瀑布打平）：astro-island 的水合链是
 * component-url → renderer-url →（renderer 的静态依赖 render.*.js）**串行 import 瀑布**；
 * 冷节点上每跳首字节 5-10s ⇒ 总延迟 15-90s。在 <head> 顶注入 modulepreload 把
 * component/renderer 两枚（Chromium 会连带其静态依赖）并行起拉——瀑布降为单跳。
 */
function injectModulePreload(html) {
  if (html.includes("__octavePreload")) return html;
  const urls = new Set();
  const re = /(component-url|renderer-url)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) urls.add(m[2]);
  if (urls.size === 0) return html;
  const tags = [...urls].map((u) => `<link rel="modulepreload" href="${u}">`).join("\n    ");
  const head = html.indexOf("<head>");
  const at = head === -1 ? html.indexOf("<html") : head + "<head>".length;
  if (at === -1) return html;
  return `${html.slice(0, at)}\n    <script>window.__octavePreload=1;</script>\n    ${tags}${html.slice(at)}`;
}

function cmdAdapt() {
  const names = fs
    .readdirSync(DIST, { withFileTypes: true })
    .filter((e) => !["repo", "index.html", "404.html"].includes(e.name))
    .map((e) => e.name);
  const re = /(\b(?:href|src|poster)\s*=\s*)(["'])\/(?!repo\/Octave\/)([^"']+)\2/g;

  // HTML：属性前缀 + base 信号 + 分片 shim
  let rewrote = 0;
  let baseSignals = 0;
  for (const file of walk(DIST, ".html")) {
    let html = fs.readFileSync(file, "utf8");
    const before = html;
    html = html.replace(re, (full, pre, q, rest) => {
      if (!names.includes(rest.split("/")[0].split("?")[0])) return full;
      rewrote += 1;
      return `${pre}${q}${BASE}${rest}${q}`;
    });
    const bs = injectBaseSignal(html);
    if (bs.injected && bs.out !== html) baseSignals += 1;
    html = bs.out;
    html = injectFetchGuard(html);
    html = injectModulePreload(html);
    if (html !== before) fs.writeFileSync(file, html);
  }

  // JS bundle：字符串/模板字面量里的根绝对资源前缀（引擎车道加载路径就在这里）。
  // ⚠️ 只重写**引擎/桥侧**文件（lanes/ bridge/ 等——它们不读 site-base，字面量是唯一
  // 能被前缀化的面）。**跳过 _astro（自有代码）**：DownloadStore 等的字面量运行期还要
  // 过 resolveUrl() 再叠一次 base——重写它们 = 双重前缀（线上 OMC 下载 404 的实锤根因，
  // 验收方 081 号信：/repo/Octave/repo/Octave/omc/…）。
  let jsFixed = 0;
  for (const file of walk(DIST, ".js")) {
    if (file.includes(`${path.sep}_astro${path.sep}`)) continue;
    const code = fs.readFileSync(file, "utf8");
    const { code: fixed, n } = rewriteJsLiterals(code);
    if (n) {
      fs.writeFileSync(file, fixed);
      jsFixed += n;
    }
  }
  // ── bridge 打包（isui.ren 站侧 083-host 裁定后的客户端杠杆 #1）──
  // 12 个 <head> 阻塞脚本 × 每发都有边缘挂起概率 ⇒ 整页幸存率 (1-p)^12。合并为单
  // bundle 后降为 1 发彩票。语义等价性依据（2026-10-25 亲验）：12 个脚本零按名互引
  // （grep 命中全为注释）、纯全局交互、只有加载顺序依赖——按 dist/index.html 现序
  // 顺序拼接即等价。本地 dev 不经此路径（astro dev 直接吃 12 文件），只有 dist 产物打包。
  let bundled = 0;
  const BRIDGE_ORDER = [
    "assets-loader.js", "queue.js", "p5canvas.js", "webaudio.js", "webaudiorec.js",
    "webfilepick.js", "webnet.js", "octave-core.js", "octave-page.js", "octave-embed.js",
    "lanes.js", "lane.js",
  ];
  const bridgeDir = path.join(DIST, "bridge");
  if (fs.existsSync(bridgeDir) && BRIDGE_ORDER.every((n) => fs.existsSync(path.join(bridgeDir, n)))) {
    const sep = "\n;;;\n"; // 拼接分隔：空语句防上一文件末尾缺分号时粘连
    const bundle = BRIDGE_ORDER.map((n) => fs.readFileSync(path.join(bridgeDir, n), "utf8")).join(sep);
    fs.writeFileSync(path.join(bridgeDir, "bundle.js"), bundle);
    // HTML：12 个独立 <script src>（允许其间有属性变体）替换为单 bundle 标签
    for (const file of walk(DIST, ".html")) {
      let html = fs.readFileSync(file, "utf8");
      const esc = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tags = BRIDGE_ORDER.map(
        (n) => `<script[^>]*src="(?:${esc(BASE)})?bridge/${esc(n)}"[^>]*><\/script>`,
      ).join("\\s*");
      const reBundle = new RegExp(tags, "g");
      if (reBundle.test(html)) {
        html = html.replace(reBundle, `<script src="${BASE}bridge/bundle.js"></script>`);
        fs.writeFileSync(file, html);
        bundled += 1;
      }
    }
  }

  console.log(
    `[contract:adapt] HTML 属性 ${rewrote} 处；JS 字面量 ${jsFixed} 处；base 信号 ${baseSignals} 页；bridge 打包 ${bundled} 页`,
  );
}

// ───────────────────────── verify（构建后） ─────────────────────────
function cmdVerify() {
  const must = [
    "index.html",
    "w64/octave.wasm",
    "w64/octave.js",
    "bridge/octave-core.js",
    "bridge/lane.js",
    "assets/manifest.w64.json",
  ];
  for (const lane of LANES) must.push(`lanes/${lane}/octave.js`, `lanes/${lane}/w64/octave.js`);
  // OMC 同源托管件（2026-10-24：旧 CI 本机路径静默跳过曾致线上 404——缺件必须红）
  must.push("omc/OpenModelicaCompiler_bg.wasm", "omc/OpenModelicaCompiler.js");
  // bridge 单 bundle（isui.ren 083-host 客户端杠杆 #1：12 发阻塞彩票 → 1 发）
  must.push("bridge/bundle.js");
  // 双重前缀防回归（081 号信）：_astro（自有代码）里的资源字面量不得被 adapt 前缀化——
  // 它们运行期经 resolveUrl 叠 base，构建期再叠 = 双重前缀 = 线上 404
  for (const file of walk(DIST, ".js")) {
    if (!file.includes(`${path.sep}_astro${path.sep}`)) continue;
    const c = fs.readFileSync(file, "utf8");
    for (const p of JS_ASSET_PREFIXES) {
      const prefixed = BASE.slice(0, -1) + p; // e.g. "/repo/Octave/omc/"
      if (c.includes("'" + prefixed) || c.includes('"' + prefixed) || c.includes('`' + prefixed)) {
        console.error(`[contract:verify] _astro 内出现被前缀化的资源字面量 ${BASE.slice(0, -1)}${p}（双重前缀根因，adapt 不得重写 _astro）`);
        process.exit(1);
      }
    }
  }
  {
    const b = fs.readFileSync(path.join(DIST, "bridge/bundle.js"), "utf8");
    for (const marker of ["createOctaveCore", "createOctaveAssets", "__octaveLanes"]) {
      if (!b.includes(marker)) {
        console.error(`[contract:verify] bridge/bundle.js 缺标记 ${marker}（拼接不完整？）`);
        process.exit(1);
      }
    }
    const idxHtml = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
    if (!idxHtml.includes('rel="modulepreload"')) {
      console.error("[contract:verify] index.html 缺 modulepreload（冷节点瀑布打平未生效？）");
      process.exit(1);
    }
    if (!idxHtml.includes("__octaveFetchGuard")) {
      console.error("[contract:verify] index.html 缺 fetch 守卫（adapt 注入未生效？）");
      process.exit(1);
    }
    if (!idxHtml.includes("bridge/bundle.js")) {
      console.error('[contract:verify] index.html 未引用 bridge/bundle.js（adapt 打包未生效？）');
      process.exit(1);
    }
  }
  const missing = must.filter((rel) => !fs.existsSync(path.join(DIST, rel)));
  // 大件 .gz 对（gzip_static 直供前提）：wasm/data 必压缩——文本小件由边缘/源站兜底亦可
  const gzMust = [
    "w64/octave.wasm",
    "lanes/wasm32-final/octave.wasm",
    "omc/OpenModelicaCompiler_bg.wasm",
  ].map((rel) => `${rel}.gz`);
  const gzMissing = gzMust.filter((rel) => !fs.existsSync(path.join(DIST, rel)));
  if (gzMissing.length) missing.push(...gzMissing, "(先跑 pnpm compress)");
  if (missing.length) {
    console.error(`[contract:verify] 产物缺件：${missing.join(", ")}`);
    process.exit(1);
  }
  const idx = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const problems = [];
  if (!idx.includes(`${BASE}bridge/`)) problems.push("index.html 未见部署前缀引用");
  const stale = walk(DIST, ".html").filter((f) =>
    /(?:href|src)=["']\/(?:w64|bridge|lanes|assets|_astro)\//.test(fs.readFileSync(f, "utf8")),
  );
  if (stale.length) problems.push(`HTML 仍有根绝对引用：${stale.slice(0, 3).join(", ")}`);
  if (!/<meta\s+name=["']site-base["']/i.test(idx)) problems.push("缺 <meta name=\"site-base\">");
  // 引擎/桥侧 JS 的字面量不得以根绝对资源前缀开头（adapt 已统一前缀化；漏网=子路径部署 404）。
  // _astro（自有代码）豁免：其字面量运行期经 resolveUrl(base) 解析，必须保持根绝对形态
  // （构建期重写它们 = 双重前缀 = 线上 404，081 号信实锤——上面有专门反向断言盯着）。
  const jsStale = walk(DIST, ".js").filter((f) => {
    if (f.includes(`${path.sep}_astro${path.sep}`)) return false;
    const c = fs.readFileSync(f, "utf8");
    return JS_ASSET_PREFIXES.some((p) => ["`", "'", '"'].some((q) => c.includes(q + p)));
  });
  if (jsStale.length) problems.push(`JS 仍有根绝对资源字面量：${jsStale.slice(0, 3).join(", ")}`);
  if (problems.length) {
    console.error(`[contract:verify] ${problems.join("；")}`);
    process.exit(1);
  }
  fs.writeFileSync(
    path.join(DIST, "deploy-stamp.json"),
    `${JSON.stringify(
      {
        lanes: LANES,
        base: BASE,
        source: process.env.GITHUB_SHA || "local",
        engine: process.env.ENGINE_SHAS || "",
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[contract:verify] 通过（车道 ${LANES.length} 条；已写 deploy-stamp.json）`);
}

const cmd = process.argv[2];
if (cmd === "base") cmdBase();
else if (cmd === "adapt") cmdAdapt();
else if (cmd === "verify") cmdVerify();
else {
  console.error("用法：node scripts/deploy-contract.mjs {base|adapt|verify}");
  process.exit(2);
}
