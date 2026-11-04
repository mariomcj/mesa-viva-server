#!/usr/bin/env python3
"""Proxy HTTP: escuta na 8000, encaminha tudo para a 3062 (Mesa Viva)."""
import http.server, urllib.request, urllib.error, os

TARGET = "http://localhost:3062"

class Proxy(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.proxy()
    def do_POST(self):
        self.proxy()
    def proxy(self):
        body = None
        cl = self.headers.get("Content-Length")
        if cl:
            body = self.rfile.read(int(cl))
        url = TARGET + self.path
        hdrs = {k: v for k, v in self.headers.items()
                if k.lower() not in ("host", "content-length", "transfer-encoding", "connection")}
        try:
            resp = urllib.request.urlopen(
                urllib.request.Request(url, data=body, headers=hdrs, method=self.command),
                timeout=30)
            self.send_response(resp.status)
            for k, v in resp.headers.items():
                if k.lower() not in ("transfer-encoding", "content-encoding", "content-length", "connection"):
                    self.send_header(k, v)
            data = resp.read()
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            self.wfile.flush()
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    srv = http.server.HTTPServer(("0.0.0.0", port), Proxy)
    print(f"Proxy rodando :{port} -> {TARGET}")
    srv.serve_forever()