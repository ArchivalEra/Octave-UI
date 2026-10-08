#!/usr/bin/env python3
"""scripts/serve.py — 纯客户端单端口静态文件服务，支持跨源隔离 (COOP/COEP) 与 gzip_static 加速。"""
import argparse
import functools
import http.server
import os
import socketserver
import sys

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

    def translate_path(self, path):
        # 兼容 Astro base: '/repo/Octave/'
        prefix = "/repo/Octave"
        clean_path = path
        if clean_path.startswith(prefix):
            clean_path = clean_path[len(prefix):]
            if not clean_path.startswith("/"):
                clean_path = "/" + clean_path
        return super().translate_path(clean_path)

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


def serve_port(directory, port, bind="127.0.0.1"):
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(GzipStaticHTTPHandler, directory=directory)
    with socketserver.ThreadingTCPServer((bind, port), handler) as srv:
        print(f"Serving {directory} on http://{bind}:{port}/ with COOP/COEP", file=sys.stderr)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description="Octave-UI 静态文件交付服务器")
    ap.add_argument("--dir", default="dist", help="静态文件目录 (默认: dist)")
    ap.add_argument("--port", type=int, default=8868, help="服务端口 (默认: 8868)")
    ap.add_argument("--bind", default="127.0.0.1", help="绑定地址 (默认: 127.0.0.1)")
    args = ap.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    target_dir = os.path.join(repo_root, args.dir) if not os.path.isabs(args.dir) else args.dir

    if not os.path.isdir(target_dir):
        print(f"Error: Directory {target_dir} not found. Please run 'pnpm build' first.", file=sys.stderr)
        return 1

    serve_port(target_dir, args.port, bind=args.bind)
    return 0


if __name__ == "__main__":
    sys.exit(main())
