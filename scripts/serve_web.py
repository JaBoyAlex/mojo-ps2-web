#!/usr/bin/env python3
"""Loopback-only static server for the private browser build (never serves discs)."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.wasm':'application/wasm','.mjs':'text/javascript','.js':'text/javascript'}
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()
    def do_GET(self):
        if self.path.split('?',1)[0].lower().endswith(('.iso','.bin','.cue','.elf','.ps2','.log')):
            self.send_error(404);return
        super().do_GET()
    def log_message(self,format,*args):
        # URLs may include private diagnostic options: keep access logs local.
        pass

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',type=Path,default=ROOT/'userdata/web-dist')
    parser.add_argument('--port',type=int,default=8620)
    args=parser.parse_args()
    if not (args.directory/'index.html').is_file(): parser.error('Build first: no index.html in output directory')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(args.directory.resolve())))
    print(f'MOJO! local preview: http://127.0.0.1:{args.port}/',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__=='__main__': main()
