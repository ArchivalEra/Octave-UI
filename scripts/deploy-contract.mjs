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
 *   adapt   构建后：重写产物里遗漏的根绝对引用 + 注入 5MB 分片 shim
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
const SHIM = `(function(){if(window.__octaveChunkShim)return;window.__octaveChunkShim=1;
try{var C=5*1024*1024,F=3,of=window.fetch.bind(window);
function big(u){try{return/\\.(wasm|data)(?:[?#]|$)/i.test(String(u))}catch(e){return!1}}
function mh(a,b){var h={};try{if(a instanceof Headers)a.forEach(function(v,k){h[k]=v});else if(a)for(var k in a)h[k]=a[k]}catch(e){}
for(var k2 in b)h[k2]=b[k2];return h}
window.fetch=function(i,init){var u=typeof i=="string"?i:(i&&i.url),me=(init&&init.method)||"GET",
hr=init&&init.headers&&/range/i.test(String(init.headers));
if(!u||me!=="GET"||hr||!big(u))return of(i,init);
var bh=(init&&init.headers)||{},st=new ReadableStream({start:function(ct){
var pos=0,total=null,done=!1;
function sl(o){var e=o+C-1;return of(u,{headers:mh(bh,{Range:"bytes="+o+"-"+e})}).then(function(r){
if(r.status!==206)return{fb:1,r:r};var cr=r.headers.get("content-range");
if(cr){var m=/\\/(\\d+)\\s*$/.exec(cr);if(m)total=parseInt(m[1],10)}
return r.arrayBuffer().then(function(b){return{o:o,b:b}})})}
function pump(){if(done){ct.close();return}var ps=[];
for(var i=0;i<F;i++){var o=pos+i*C;if(total!==null&&o>=total)break;ps.push(sl(o))}
if(!ps.length){done=!0;ct.close();return}
Promise.all(ps).then(function(rr){for(var j=0;j<rr.length;j++){var p=rr[j];
if(p.fb){done=!0;return of(u,{headers:bh}).then(function(r){return r.arrayBuffer()})
.then(function(b){ct.enqueue(new Uint8Array(b));ct.close()})["catch"](function(e){ct.error(e)})}
ct.enqueue(new Uint8Array(p.b));pos=Math.max(pos,p.o+p.b.byteLength);
if(p.b.byteLength<C||(total!==null&&pos>=total))done=!0}
if(!done)pump();else ct.close()})["catch"](function(e){ct.error(e)})}
pump()}});
return Promise.resolve(new Response(st,{status:200,headers:{"Content-Type":"application/wasm"}}))}
}catch(e){}})();`;

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
const JS_ASSET_PREFIXES = ["/lanes/", "/w64/", "/bridge/", "/assets/", "/_astro/"];

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

function cmdAdapt() {
  const names = fs
    .readdirSync(DIST, { withFileTypes: true })
    .filter((e) => !["repo", "index.html", "404.html"].includes(e.name))
    .map((e) => e.name);
  const re = /(\b(?:href|src|poster)\s*=\s*)(["'])\/(?!repo\/Octave\/)([^"']+)\2/g;

  // HTML：属性前缀 + base 信号 + 分片 shim
  let rewrote = 0;
  let injected = 0;
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
    if (!html.includes("__octaveChunkShim")) {
      const idx = html.indexOf("</head>");
      if (idx === -1) {
        console.error(`[contract:adapt] ${file} 缺 </head>，无法注入 shim`);
        process.exit(1);
      }
      html = `${html.slice(0, idx)}<script>${SHIM}</script>\n${html.slice(idx)}`;
      injected += 1;
    }
    if (html !== before) fs.writeFileSync(file, html);
  }

  // JS bundle：字符串/模板字面量里的根绝对资源前缀（引擎车道加载路径就在这里）
  let jsFixed = 0;
  for (const file of walk(DIST, ".js")) {
    const code = fs.readFileSync(file, "utf8");
    const { code: fixed, n } = rewriteJsLiterals(code);
    if (n) {
      fs.writeFileSync(file, fixed);
      jsFixed += n;
    }
  }
  console.log(
    `[contract:adapt] HTML 属性 ${rewrote} 处；JS 字面量 ${jsFixed} 处；base 信号 ${baseSignals} 页；shim ${injected} 页`,
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
  const missing = must.filter((rel) => !fs.existsSync(path.join(DIST, rel)));
  if (missing.length) {
    console.error(`[contract:verify] 产物缺件：${missing.join(", ")}`);
    process.exit(1);
  }
  const idx = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const problems = [];
  if (!idx.includes(`${BASE}bridge/`)) problems.push("index.html 未见部署前缀引用");
  if (!idx.includes("__octaveChunkShim")) problems.push("index.html 缺分片 shim");
  const stale = walk(DIST, ".html").filter((f) =>
    /(?:href|src)=["']\/(?:w64|bridge|lanes|assets|_astro)\//.test(fs.readFileSync(f, "utf8")),
  );
  if (stale.length) problems.push(`HTML 仍有根绝对引用：${stale.slice(0, 3).join(", ")}`);
  if (!/<meta\s+name=["']site-base["']/i.test(idx)) problems.push("缺 <meta name=\"site-base\">");
  // 部署 bundle 里任何 JS 字面量都不得以根绝对资源前缀开头（车道加载路径曾在此踩坑）
  const jsStale = walk(DIST, ".js").filter((f) => {
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
