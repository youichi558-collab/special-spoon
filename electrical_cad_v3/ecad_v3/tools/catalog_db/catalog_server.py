#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
catalog_server.py — カタログDBをHTTPで公開する独立サーバー。

**普段は起動しなくてよい。** ecad_v3 は catalog_db.py を直接importして使うので、
CADを使うだけならサーバーは今まで通り server.py の1つだけで済む。

このサーバーが要るのは次の場合:
- ecad_v3以外のソフト・別言語のツールからカタログDBを引きたい
- ecad_v3を起動していない状態で検索したい

起動:
    python catalog_server.py            (既定ポート 8090)
    python catalog_server.py --port 9000

API:
    GET /search?q=MR-J5&maker=三菱電機&type=servo&limit=50
    GET /get?ref=MR-J5-40G
    GET /stats
    GET /rebuild                        CSVを読み直してDBを作り直す

応答はJSON。CORSを許可してあるので、別のローカルWebアプリからも直接叩ける。
"""
import json
import os
import sys
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog_db  # noqa: E402

DEFAULT_PORT = 8090
_db = catalog_db.CatalogDB()


class Handler(BaseHTTPRequestHandler):
    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path == '/search':
                _db.ensure_built()
                rows = _db.search(q.get('q', ''), q.get('maker', ''),
                                  q.get('type', ''), int(q.get('limit', 100)))
                self._json({'ok': True, 'results': rows, 'count': len(rows)})
            elif u.path == '/get':
                _db.ensure_built()
                self._json({'ok': True, 'result': _db.get(q.get('ref', ''))})
            elif u.path == '/stats':
                self._json({'ok': True, **_db.stats()})
            elif u.path == '/rebuild':
                if not _db.is_configured():
                    self._json({'ok': False, 'error': 'カタログCSVフォルダが未設定です'}, 400)
                    return
                self._json({'ok': True, **_db.build(verbose=True)})
            else:
                self._json({'ok': False, 'error': 'not found'}, 404)
        except Exception as e:
            self._json({'ok': False, 'error': str(e)}, 500)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


def main():
    port = DEFAULT_PORT
    if '--port' in sys.argv:
        port = int(sys.argv[sys.argv.index('--port') + 1])
    if not _db.is_configured():
        print('警告: カタログCSVフォルダが未設定です。'
              ' python catalog_db.py setdir <フォルダ> で設定してください', file=sys.stderr)
    else:
        _db.ensure_built(verbose=True)
    print(f'カタログDBサーバー起動: http://localhost:{port}/search?q=...')
    try:
        HTTPServer(('', port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
