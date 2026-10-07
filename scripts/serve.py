#!/usr/bin/env python3
"""scripts/serve.py — 为三大车道 (wasm32-final, master, IllegalPerformance) 提供 COOP/COEP 与 gzip_static 静态服务。"""
import argparse
import functools
import http.server
import os
import socketserver
import sys
import threading
import time

COI_HEADERS = [
    ("Cross-Origin-Opener-Policy", "same-origin"),
    ("Cross-Origin-Embedder-Policy", "require-corp"),
]

MIME = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".js.map": "application/json",
    ".data": "application/octet-stream",
    ".json": "application/json",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".svg": "image/svg+xml",
}

PORTAL_HTML = """<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GNU Octave WebAssembly 多车道工作台</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --accent-green: #3fb950;
      --accent-orange: #d29922;
      --accent-purple: #bc8cff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      max-width: 800px;
      margin-bottom: 36px;
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .subtitle {
      font-size: 15px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      max-width: 1000px;
      width: 100%;
      margin-bottom: 40px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .lane-name {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    .port-badge {
      font-size: 12px;
      font-family: monospace;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(88, 166, 255, 0.15);
      color: var(--accent);
      border: 1px solid rgba(88, 166, 255, 0.3);
    }
    .desc {
      font-size: 13.5px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 20px;
      flex-grow: 1;
    }
    .features {
      list-style: none;
      font-size: 12.5px;
      color: var(--text);
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .features li::before {
      content: "✔";
      color: var(--accent-green);
      margin-right: 6px;
    }
    .btn {
      display: block;
      text-align: center;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      background: #238636;
      color: #fff;
      transition: background 0.15s ease;
    }
    .btn:hover {
      background: #2ea043;
    }
    .footer {
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <svg viewBox="0 0 100 100" width="32" height="32">
        <rect width="100" height="100" rx="20" fill="#005f87"/>
        <circle cx="35" cy="50" r="16" fill="#f57900"/>
        <circle cx="65" cy="50" r="16" fill="#73d216"/>
        <circle cx="50" cy="50" r="10" fill="#ffffff"/>
      </svg>
      GNU Octave 11.3.0 WebAssembly 多车道工作台
    </div>
    <div class="subtitle">
      纯客户端计算与静态 gzip 预压缩交付 · 全部 3 个独立车道已同时拉起并配置跨源隔离 (COOP/COEP)
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div>
        <div class="card-header">
          <span class="lane-name">wasm32-final</span>
          <span class="port-badge">:8881</span>
        </div>
        <p class="desc">Wasm32 终极冻结基线。兼具 32 位与 64 位双内核，适用于绝大多数通用运行环境。</p>
        <ul class="features">
          <li>分支锁定: ac6ac01</li>
          <li>32 位基准与通用兼容性</li>
          <li>完整 Octave-UI 交互体验</li>
        </ul>
      </div>
      <a class="btn" href="http://127.0.0.1:8881/" target="_blank">进入 wasm32-final 站点 ↗</a>
    </div>

    <div class="card">
      <div>
        <div class="card-header">
          <span class="lane-name">master</span>
          <span class="port-badge">:8882</span>
        </div>
        <p class="desc">主线稳定基准车道。搭载成熟的 Wasm64 多线程与 POSIX pthreads 支持。</p>
        <ul class="features">
          <li>分支锁定: 929fc63</li>
          <li>官方基准代码与标准内存模型</li>
          <li>完整 Octave-UI 交互体验</li>
        </ul>
      </div>
      <a class="btn" href="http://127.0.0.1:8882/" target="_blank">进入 master 站点 ↗</a>
    </div>

    <div class="card">
      <div>
        <div class="card-header">
          <span class="lane-name">IllegalPerformance</span>
          <span class="port-badge">:8883</span>
        </div>
        <p class="desc">极限性能优化车道。集成 mimalloc、FMA、大堆与 Rust 加速排序，代表最高运行性能。</p>
        <ul class="features">
          <li>分支锁定: b246a99</li>
          <li>mimalloc + FMA + memory64</li>
          <li>完整 Octave-UI 交互体验</li>
        </ul>
      </div>
      <a class="btn" href="http://127.0.0.1:8883/" target="_blank">进入 IllegalPerformance 站点 ↗</a>
    </div>
  </div>

  <div class="footer">
    提示：每个车道顶部导航栏均已配齐实时车道徽标与一键换档链接。
  </div>
</body>
</html>
"""


class GzipStaticHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """带 COOP/COEP 隔离标头并支持 gzip_static 伴侣透明加速的静态处理器。"""

    def end_headers(self):
        for k, v in COI_HEADERS:
            self.send_header(k, v)
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME:
            return MIME[ext]
        return super().guess_type(path)

    def send_head(self):
        # 检查客户端是否接受 gzip，且是否存在同名 .gz 文件
        req_path = self.translate_path(self.path)
        if os.path.isdir(req_path):
            index_path = os.path.join(req_path, "index.html")
            if os.path.exists(index_path):
                req_path = index_path

        accept_encoding = self.headers.get("Accept-Encoding", "")
        gz_path = req_path + ".gz"

        if "gzip" in accept_encoding and os.path.isfile(gz_path):
            ctype = self.guess_type(req_path)
            try:
                f = open(gz_path, "rb")
            except OSError:
                self.send_error(http.HTTPStatus.NOT_FOUND, "File not found")
                return None
            fs = os.fstat(f.fileno())
            self.send_response(http.HTTPStatus.OK)
            self.send_header("Content-type", ctype)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(fs[6]))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            return f

        return super().send_head()

    def log_message(self, fmt, *args):
        pass


class PortalHandler(http.server.BaseHTTPRequestHandler):
    """车道导航首页处理器 (:8880)。"""

    def do_GET(self):
        content = PORTAL_HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        for k, v in COI_HEADERS:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt, *args):
        pass


def serve_port(directory, port, bind="127.0.0.1", is_portal=False):
    socketserver.TCPServer.allow_reuse_address = True
    if is_portal:
        handler = PortalHandler
    else:
        handler = functools.partial(GzipStaticHTTPHandler, directory=directory)
    with socketserver.ThreadingTCPServer((bind, port), handler) as srv:
        name = "Portal Hub" if is_portal else directory
        print(f"Serving {name} on http://{bind}:{port}/ with COOP/COEP", file=sys.stderr)
        try:
            srv.serve_forever()
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=None, help="单个车道目录 (wasm32-final, master, IllegalPerformance, dist)")
    ap.add_argument("--port", type=int, default=8868, help="服务端口")
    ap.add_argument("--bind", default="127.0.0.1", help="绑定地址")
    ap.add_argument("--all", action="store_true", help="同时启动全部三车道与导航页 (8880, 8881, 8882, 8883)")
    args = ap.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    # 如果显式指定 --dir，则单端口运行
    if args.dir:
        target_dir = os.path.join(repo_root, args.dir) if not os.path.isabs(args.dir) else args.dir
        if not os.path.isdir(target_dir):
            print(f"Error: Directory {target_dir} not found.", file=sys.stderr)
            return 1
        serve_port(target_dir, args.port, bind=args.bind)
        return 0

    # 默认或指定 --all: 并发启动三车道 + 导航页
    servers = [
        {"name": "Portal", "dir": None, "port": 8880, "portal": True},
        {"name": "wasm32-final", "dir": os.path.join(repo_root, "wasm32-final"), "port": 8881, "portal": False},
        {"name": "master", "dir": os.path.join(repo_root, "master"), "port": 8882, "portal": False},
        {"name": "IllegalPerformance", "dir": os.path.join(repo_root, "IllegalPerformance"), "port": 8883, "portal": False},
    ]

    for s in servers:
        if not s["portal"] and not os.path.isdir(s["dir"]):
            print(f"Error: Directory {s['dir']} not found. Run 'bash scripts/sync-lanes.sh' first.", file=sys.stderr)
            return 1

    threads = []
    for s in servers:
        t = threading.Thread(
            target=serve_port,
            args=(s["dir"], s["port"], args.bind, s["portal"]),
            daemon=True
        )
        t.start()
        threads.append(t)

    print("==========================================================", file=sys.stderr)
    print(" 三大车道 UI 静态站点已全部拉起运行中：", file=sys.stderr)
    print("   • 导航总台:        http://127.0.0.1:8880/", file=sys.stderr)
    print("   • wasm32-final:    http://127.0.0.1:8881/", file=sys.stderr)
    print("   • master:          http://127.0.0.1:8882/", file=sys.stderr)
    print("   • IllegalPerf:     http://127.0.0.1:8883/", file=sys.stderr)
    print("==========================================================", file=sys.stderr)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down servers...", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
