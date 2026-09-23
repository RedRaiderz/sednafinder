#!/usr/bin/env python3
"""SednaFinder telemetry collector (runs on Solace, behind `tailscale serve`, tailnet only).

POST /t  body: {"session": str, "frames": [...]}  -> appended to ~/sednafinder-telemetry/YYYY-MM-DD.jsonl
GET  /ping -> "ok"   (the app uses this to show the connection state)
"""
import json, os, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUT = os.path.expanduser('~/sednafinder-telemetry')
ORIGINS = {'https://redraiderz.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'}
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        o = self.headers.get('Origin', '')
        if o in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        self.send_response(200 if self.path.startswith('/ping') else 404); self._cors()
        self.send_header('Content-Type', 'text/plain'); self.end_headers(); self.wfile.write(b'ok')

    def do_POST(self):
        if not self.path.startswith('/t'):
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get('Content-Length', 0))
        if n > 2_000_000:
            self.send_response(413); self._cors(); self.end_headers(); return
        try:
            body = json.loads(self.rfile.read(n))
            sess = str(body.get('session', '?'))[:40]
            rx = time.time()
            path = os.path.join(OUT, time.strftime('%Y-%m-%d') + '.jsonl')
            with open(path, 'a') as f:
                for fr in body.get('frames', []):
                    fr['session'] = sess; fr['rx'] = rx
                    f.write(json.dumps(fr, separators=(',', ':')) + '\n')
            self.send_response(204)
        except Exception:
            self.send_response(400)
        self._cors(); self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8096), H).serve_forever()
