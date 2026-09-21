"""Static dev server that refuses to let the browser cache anything.

python -m http.server sends Last-Modified but no Cache-Control, so browsers
apply heuristic caching and happily serve a stale .js after an edit. That has
bitten this project twice. This sends no-store on every response.

Usage:  python tools/devserver.py [port]
"""
import http.server
import functools
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8161


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print("serving %s on http://127.0.0.1:%d/ (no-store)" % (ROOT, PORT))
        httpd.serve_forever()
