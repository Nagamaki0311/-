"""Serve the dependency-free app; accepts common preview host/port flags."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--host', default='0.0.0.0')
parser.add_argument('--port', type=int, default=3000)
parser.add_argument('--strictPort', action='store_true')
args = parser.parse_args()
handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).parent))
with ThreadingHTTPServer((args.host, args.port), handler) as server:
    print(f'Life timeline ready at http://{args.host}:{args.port}', flush=True)
    server.serve_forever()
