#!/usr/bin/env python3
"""scripts/serve.py — 为 dist/ 目录提供带 COOP/COEP 隔离头的静态服务。"""
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


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in COI_HEADERS:
            self.send_header(k, v)
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME:
            return MIME[ext]
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="dist")
    ap.add_argument("--port", type=int, default=8868)
    ap.add_argument("--bind", default="127.0.0.1")
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        print(f"Error: Directory {args.dir} not found. Run 'pnpm build' first.", file=sys.stderr)
        return 1

    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(Handler, directory=args.dir)
    with socketserver.ThreadingTCPServer((args.bind, args.port), handler) as srv:
        print(f"Serving {args.dir} on http://{args.bind}:{args.port}/ with COOP/COEP", file=sys.stderr)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
