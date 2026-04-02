"""Minimal HTTP server for testing without network dependencies."""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs
from humanizer import humanize
from multi_detector import get_detector

_detector = get_detector()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'''<!DOCTYPE html>
<html><head><title>Humanizer Test</title></head>
<body>
<h1>Humanizer Engine Test</h1>
<form method="POST" action="/api/humanize">
<textarea name="text" rows="10" cols="80">Enter AI text here...</textarea><br>
<select name="engine">
<option value="ghost_mini">Ghost Mini</option>
<option value="ghost_pro">Ghost Pro</option>
</select>
<select name="strength">
<option value="light">Light</option>
<option value="medium" selected>Medium</option>
<option value="strong">Strong</option>
</select><br>
<button type="submit">Humanize</button>
</form>
</body></html>''')
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/api/humanize':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            params = parse_qs(body)
            
            text = params.get('text', [''])[0]
            engine = params.get('engine', ['ghost_mini'])[0]
            strength = params.get('strength', ['medium'])[0]
            
            mode = engine if engine in ('ghost_mini', 'ghost_pro') else 'ghost_mini'
            result = humanize(text, mode=mode, strength=strength)
            
            detection = _detector.analyze(result)
            
            response = {
                'humanized': result,
                'word_count': len(result.split()),
                'avg_ai_score': 100 - detection['summary']['overall_human_score']
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_error(404)

if __name__ == '__main__':
    print("Starting simple server on http://localhost:8000")
    print("This is a fallback server (no FastAPI/uvicorn due to _socket module missing)")
    server = HTTPServer(('localhost', 8000), Handler)
    server.serve_forever()
