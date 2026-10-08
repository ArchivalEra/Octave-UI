/* 部署侧分片取数 + 解压（由 scripts/deploy-contract.mjs 构建后注入；勿在源码手改）。
 *
 * 为什么：octave.wasm ≈ 31MB、octave.data ≈ 10MB。边缘回源也要省、客户端到边缘
 * 传大块也慢。实测可行方案：边缘按 **gzip 分片** 取（每片 5MB 压缩字节，回源 ~7.4MB），
 * 本 shim 在浏览器里顺序拼成一条 gzip 流并 DecompressionStream('gzip') 解压为原文件，
 * 对引擎完全透明（它只看到一次 fetch，拿到的是原始字节）。
 *
 * 结束判定用 Content-Range 的“总数”（gzip 表示下总数即压缩后大小）。顺序拉取是
 * 拼接 gzip 流的前提。边缘不支持 Range 时自动退回整包。
 */
(function () {
  if (window.__octaveChunkShim) return;
  window.__octaveChunkShim = 1;
  var CHUNK = 5 * 1024 * 1024;
  var of = window.fetch.bind(window);

  function big(u) {
    try { return /\.(wasm|data)(?:[?#]|$)/i.test(String(u)); } catch (e) { return false; }
  }
  function mh(base, extra) {
    var h = {};
    try {
      if (base instanceof Headers) base.forEach(function (v, k) { h[k] = v; });
      else if (base) for (var k in base) h[k] = base[k];
    } catch (e) {}
    for (var k2 in extra) h[k2] = extra[k2];
    return h;
  }
  function totalOf(cr) {
    if (!cr) return null;
    var m = /\/(\d+)\s*$/.exec(cr);
    return m ? parseInt(m[1], 10) : null;
  }

  async function ticketed(url, base) {
    var r0 = await of(url, { headers: mh(base, { Range: "bytes=0-" + (CHUNK - 1), "Accept-Encoding": "gzip" }) });
    if (r0.status !== 206) {
      var full = await of(url, { headers: base });
      return new Response(await full.arrayBuffer(), {
        status: 200,
        headers: { "Content-Type": "application/wasm" },
      });
    }
    var gz = r0.headers.get("content-encoding") === "gzip";
    var total = totalOf(r0.headers.get("content-range"));
    var pos = 0;
    var src = new ReadableStream({
      async start(ct) {
        var buf = await r0.arrayBuffer();
        if (buf.byteLength) { ct.enqueue(new Uint8Array(buf)); pos += buf.byteLength; }
        while (buf.byteLength === CHUNK && (total === null || pos < total)) {
          var r = await of(url, { headers: mh(base, { Range: "bytes=" + pos + "-" + (pos + CHUNK - 1), "Accept-Encoding": "gzip" }) });
          if (r.status !== 206) break;
          buf = await r.arrayBuffer();
          if (!buf.byteLength) break;
          ct.enqueue(new Uint8Array(buf));
          pos += buf.byteLength;
        }
        ct.close();
      },
    });
    var body = gz && typeof DecompressionStream === "function"
      ? src.pipeThrough(new DecompressionStream("gzip"))
      : src;
    return new Response(body, { status: 200, headers: { "Content-Type": "application/wasm" } });
  }

  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url);
    var me = (init && init.method) || "GET";
    var hasRange = init && init.headers && /range/i.test(String(init.headers));
    if (!u || me !== "GET" || hasRange || !big(u)) return of(input, init);
    return ticketed(u, (init && init.headers) || {}).catch(function () { return of(input, init); });
  };
})();
