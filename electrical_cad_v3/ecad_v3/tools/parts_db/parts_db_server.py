#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parts_db_server.py — 部品DBをHTTPで公開する独立サーバー。

**普段は起動しなくてよい。** ecad_v3 は parts_db.py を直接importして使うので、
CADを使うだけならサーバーは今まで通り server.py の1つだけで済む。

このサーバーが要るのは次の場合:
- ecad_v3以外のソフト・別言語のツール(見積・部品表・Excelマクロ等)から部品DBを引きたい
- ecad_v3を起動していない状態で部品DBを検索したい

起動:
    py parts_db_server.py               (既定ポート 8091)
    py parts_db_server.py --port 9100

事前に一度だけ、部品DBの場所を教えておく:
    py parts_db.py setpath "G:\\マイドライブ\\...\\parts_db.json"
    (省略した場合は、CADが最後に保存したときの控えを読む)

API(すべてGET・すべて読み取り):
    GET /search?q=S-T21&maker=三菱&type=contactor&limit=50
    GET /get?ref=S-T21
    GET /outline?ref=S-T21          外形図DXFの中身(text/plain)
    GET /stats

**書き込みAPIは無い。** 部品DBを更新できるのはCAD(=盛田さん)だけという前提を
崩さないため。詳しくは parts_db.py の冒頭を参照。

応答はJSON。同じPCのローカルWebアプリ(http://localhost:*)からは直接叩ける。
待ち受けは既定で 127.0.0.1(このPCからのみ)。LANの別PCから使いたい場合だけ
--host 0.0.0.0 を明示的に付ける。
"""
import json
import os
import sys
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import parts_db  # noqa: E402

DEFAULT_PORT = 8091
DEFAULT_HOST = '127.0.0.1'

# CORSを許す送信元。実際の用途は「同じPCの別のローカルツール」なので
# localhost だけで足りる(catalog_server.py と同じ方針)。
ALLOWED_ORIGIN_PREFIXES = ('http://localhost:', 'http://127.0.0.1:',
                           'http://localhost', 'http://127.0.0.1')
_db = parts_db.PartsDB()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get('Origin') or ''
        if origin.startswith(ALLOWED_ORIGIN_PREFIXES):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

    def _send(self, body, ctype, status=200):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, status=200):
        self._send(json.dumps(obj, ensure_ascii=False).encode('utf-8'),
                   'application/json; charset=utf-8', status)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path == '/search':
                rows = _db.search(q.get('q', ''), q.get('maker', ''),
                                  q.get('type', ''), int(q.get('limit', 100)))
                s = _db.stats()
                self._json({'ok': s['ok'], 'results': rows, 'count': len(rows),
                            'error': s['error']})
            elif u.path == '/get':
                row = _db.get(q.get('ref', ''))
                self._json({'ok': True, 'result': row, 'found': row is not None})
            elif u.path == '/outline':
                dxf = _db.outline(q.get('ref', ''))
                if dxf is None:
                    self._json({'ok': False, 'error': 'この型番に外形図はありません'}, 404)
                    return
                self._send(dxf.encode('utf-8'), 'text/plain; charset=utf-8')
            elif u.path == '/stats':
                self._json(_db.stats())
            else:
                self._json({'ok': False, 'error': 'not found'}, 404)
        except Exception as e:
            self._json({'ok': False, 'error': str(e)}, 500)

    # 書き込み経路を持たないことを明示する。404ではなく405で返し、
    # 「実装し忘れ」ではなく「意図的に置いていない」と分かるようにする。
    def do_POST(self):
        self._json({'ok': False,
                    'error': '部品DBは読み取り専用です。更新はCADの「部品登録」'
                             'パネルから行ってください'}, 405)

    do_PUT = do_DELETE = do_PATCH = do_POST

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


def main():
    port = DEFAULT_PORT
    if '--port' in sys.argv:
        port = int(sys.argv[sys.argv.index('--port') + 1])
    host = DEFAULT_HOST
    if '--host' in sys.argv:
        host = sys.argv[sys.argv.index('--host') + 1]

    s = _db.stats()
    if not s['ok']:
        print(f'警告: {s["error"]}', file=sys.stderr)
    else:
        src = {'path': '設定されたファイル', 'mirror': 'CADが最後に保存した控え'}.get(
            s['source'], s['source'])
        print(f'部品DB {s["count"]}件 を読み込みました({src}: {s["path"]})')
        if s['source'] == 'mirror':
            print('  ヒント: py parts_db.py setpath <parts_db.jsonのパス> を設定すると、'
                  'CADを開いていなくても常に最新を読めます')
    print(f'部品DBサーバー起動(読み取り専用): http://localhost:{port}/search?q=...')
    if host not in ('127.0.0.1', 'localhost', '::1'):
        print(f'警告: {host} で待ち受けています。LAN上の別PCから部品DBが'
              f'読める状態です', file=sys.stderr)
    try:
        HTTPServer((host, port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
