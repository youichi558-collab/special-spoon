#!/usr/bin/env python3
# ================================================================
# server.py — ecad_v3 ローカルサーバー
# 静的ファイル配信(index.html等)に加え、/api/pending_csv で
# catalog_pending/ 配下の「登録待ちCSV」一覧を返す。
#
# 起動: py server.py  (start.bat から呼ばれる)
# 停止: Ctrl+C
#
# 【2026-08-17】カタログPDF全文検索(/api/search, pdfplumber, catalog_config.json,
# フォルダブラウザ)は実務で使われず撤去した。カタログの読み取りは
# Claudeとの会話で行い、結果のCSVを catalog_pending/ に置いて
# 「部品登録」パネルの「保留CSVを読み込む」で取り込む運用に一本化。
# 外部ライブラリへの依存は無くなり、標準ライブラリのみで動く。
# ================================================================
import json
import os
import sys
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080

# 待ち受けるアドレス。
# 既定は 127.0.0.1(このPCからのみ)。以前は '' (= 全インターフェース)だったため、
# 同一LAN上の別PCから図面・部品データ・カタログDBが読める状態になっていた。
# このCADは1台のPCでローカルに使う道具なので、外に出す理由が無い。
# どうしてもLANの別PCから開きたい場合だけ、環境変数で明示的に広げる:
#   set ECAD_HOST=0.0.0.0  &&  py server.py
HOST = os.environ.get('ECAD_HOST', '127.0.0.1')

# ----------------------------------------------------------------------------
# カタログDB(任意機能・2026-08-20)
#
# tools/catalog_db/catalog_db.py があれば読み込んで /api/catalog/* を有効にする。
# 無くても・壊れていてもCADは通常通り動く(検索UIが無効になるだけ)。
# フォルダごと削除すれば元の状態に完全に戻せる、という前提で書いてある。
#
# catalog_db.py はサーバーではなくライブラリなので、ここでimportして直接使う。
# → 盛田さんは今まで通り server.py を起動するだけでよく、常駐サーバーは増えない。
# → 他ソフトから使いたいときだけ tools/catalog_db/catalog_server.py を別途起動する。
# ----------------------------------------------------------------------------
catalog_db = None
try:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools', 'catalog_db'))
    import catalog_db as _catalog_db_mod
    catalog_db = _catalog_db_mod
except Exception as _e:  # ImportError/構文エラー等、何が起きてもCADは動かす
    print(f'(カタログDB機能は無効: {_e})')

# ----------------------------------------------------------------------------
# 部品DBの外部公開(任意機能・2026-09-02)
#
# tools/parts_db/parts_db.py があれば読み込んで /api/parts/* を有効にする。
# 無くても・壊れていてもCADは通常通り動く(部品DBはブラウザ側のFile System
# Access APIで読み書きしており、この機能はそこに一切関与しない)。
#
# 目的は「他ソフトからも部品DBを引けるようにする」こと。CADが部品DBを保存する
# たびに、その中身の控えを %LOCALAPPDATA%\ecad\parts_db_mirror.json へ写す。
# これにより、CADを起動していない時間帯でも他ツールが部品DBを読める。
#
# 【重要】ここから parts_db.json 本体には絶対に書かない。書き手はCAD1つに保つ。
# ----------------------------------------------------------------------------
parts_db = None
try:
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools', 'parts_db'))
    import parts_db as _parts_db_mod
    parts_db = _parts_db_mod
except Exception as _e:
    print(f'(部品DBの外部公開機能は無効: {_e})')


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/pending_csv':
            self.handle_pending_csv_list()
            return
        if parsed.path.startswith('/api/catalog/'):
            q = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
            self.handle_catalog(parsed.path[len('/api/catalog/'):], q)
            return
        if parsed.path.startswith('/api/parts/'):
            q = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
            self.handle_parts(parsed.path[len('/api/parts/'):], q)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/catalog/import':
            self.handle_catalog_import()
            return
        if parsed.path == '/api/parts/mirror':
            self.handle_parts_mirror()
            return
        self.send_error(404)

    def handle_catalog_import(self):
        """ブラウザが読んだカタログCSVの中身を受け取って取り込む。

        File System Access API はフォルダの絶対パスをJSに渡さないため、
        パスではなく中身を受け取る方式にしている(部品DBと同じ操作感)。
        """
        if catalog_db is None:
            self._send_json({'ok': False, 'available': False,
                             'error': 'カタログDB機能が導入されていません'})
            return
        try:
            n = int(self.headers.get('Content-Length') or 0)
            payload = json.loads(self.rfile.read(n).decode('utf-8')) if n else {}
            files = payload.get('files') or []
            if not files:
                self._send_json({'ok': False, 'available': True,
                                 'error': '選んだフォルダにCSVがありませんでした'})
                return
            db = catalog_db.CatalogDB()
            res = db.import_files(files)
            db.set_source_label(payload.get('label') or '')
            self._send_json({'ok': True, 'available': True, **res, **db.stats()})
        except Exception as e:
            self._send_json({'ok': False, 'available': True, 'error': str(e)})

    # ---- カタログDB(任意機能) --------------------------------------------
    def handle_catalog(self, action, q):
        """カタログDBの検索・設定API。

        catalog_db が読めない場合は available:false を返すだけにして、
        CAD本体の動作には影響させない(外部PCでCADだけ動かす場合を想定)。
        """
        if catalog_db is None:
            self._send_json({'ok': False, 'available': False,
                             'error': 'カタログDB機能が導入されていません'})
            return
        try:
            db = catalog_db.CatalogDB()
            if action == 'stats':
                self._send_json({'ok': True, 'available': True, **db.stats()})
            # setdir(カタログCSVフォルダの設定)はHTTPからは受け付けない。
            # サーバー上の任意のフォルダをGET一発で指定できてしまい、
            # 画面からは一度も呼んでいなかった(取り込みは /api/catalog/import が
            # ブラウザで読んだCSVの中身を送る方式)。
            # 設定を変えたいときはコマンドラインから:
            #   py tools/catalog_db/catalog_db.py setdir <フォルダ>
            elif action == 'rebuild':
                if not db.is_configured():
                    self._send_json({'ok': False, 'available': True,
                                     'error': 'カタログCSVフォルダが未設定です'})
                    return
                res = db.build(verbose=True)
                self._send_json({'ok': True, 'available': True, **res, **db.stats()})
            elif action == 'all':
                # カタログDBの全件を返す(部品DBの一括作り直し用)。
                # 数万件になると重いので上限を付けてある。超えた場合は truncated を立てる。
                if not os.path.exists(db.db_path):
                    self._send_json({'ok': False, 'available': True,
                                     'error': 'カタログDBが未取込です'})
                    return
                limit = int(q.get('limit', 20000))
                rows = db.search('', '', '', limit)
                total = db.stats().get('count', 0)
                self._send_json({'ok': True, 'available': True, 'results': rows,
                                 'count': len(rows), 'total': total,
                                 'truncated': total > len(rows)})
            elif action == 'search':
                # Drive未接続(フォルダが見えない)でも、既に構築済みのDBがあれば検索できる。
                # 出先のノートPC等でDriveが同期していない場面を想定。
                # 最新CSVの取り込みだけができない旨を warning で伝える。
                warning = ''
                if db.is_configured():
                    db.ensure_built(verbose=True)
                elif os.path.exists(db.db_path):
                    warning = ('カタログCSVフォルダが見つかりません'
                               '(前回構築したDBで検索しています。最新のCSVは反映されていません)')
                else:
                    self._send_json({'ok': False, 'available': True,
                                     'error': 'カタログCSVフォルダが未設定です'})
                    return
                rows = db.search(q.get('q', ''), q.get('maker', ''),
                                 q.get('type', ''), int(q.get('limit', 100)))
                self._send_json({'ok': True, 'available': True, 'warning': warning,
                                 'results': rows, 'count': len(rows)})
            else:
                self._send_json({'ok': False, 'error': 'unknown action'}, 404)
        except Exception as e:
            self._send_json({'ok': False, 'available': True, 'error': str(e)})

    # ---- 部品DBの外部公開(任意機能) ---------------------------------------
    def handle_parts(self, action, q):
        """部品DBの読み取りAPI。**書き込みは無い。**

        parts_db.json を書けるのはCAD(ブラウザ)だけという前提を崩さないため、
        ここは読むだけにしてある。理由は tools/parts_db/parts_db.py の冒頭を参照。
        """
        if parts_db is None:
            self._send_json({'ok': False, 'available': False,
                             'error': '部品DBの外部公開機能が導入されていません'})
            return
        try:
            db = parts_db.PartsDB()
            if action == 'stats':
                self._send_json({'available': True, **db.stats()})
            elif action == 'search':
                rows = db.search(q.get('q', ''), q.get('maker', ''),
                                 q.get('type', ''), int(q.get('limit', 100)))
                st = db.stats()
                self._send_json({'ok': st['ok'], 'available': True, 'results': rows,
                                 'count': len(rows), 'error': st['error']})
            elif action == 'get':
                row = db.get(q.get('ref', ''))
                self._send_json({'ok': True, 'available': True, 'result': row,
                                 'found': row is not None})
            else:
                self._send_json({'ok': False, 'available': True,
                                 'error': 'unknown action'}, 404)
        except Exception as e:
            self._send_json({'ok': False, 'available': True, 'error': str(e)})

    def handle_parts_mirror(self):
        """CADが保存した部品DBの中身を控えとして受け取る。

        書き先は %LOCALAPPDATA%\\ecad\\parts_db_mirror.json であって、
        盛田さんの parts_db.json ではない。控えが壊れても原本は無傷。

        これがあるおかげで、CADを起動していない時間帯でも他ツールが部品DBを
        読める。CADの保存が成功したときだけ送られてくる(js/parts_db.js)。
        """
        if parts_db is None:
            self._send_json({'ok': False, 'available': False,
                             'error': '部品DBの外部公開機能が導入されていません'})
            return
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if not n:
                self._send_json({'ok': False, 'available': True, 'error': '中身が空です'})
                return
            res = parts_db.write_mirror(self.rfile.read(n).decode('utf-8'))
            self._send_json({'ok': True, 'available': True, **res})
        except Exception as e:
            self._send_json({'ok': False, 'available': True, 'error': str(e)})

    def end_headers(self):
        # JS/CSS/HTML等の静的ファイルにキャッシュ無効化ヘッダーを付与。
        # 以前はAPI(JSON)応答にだけno-storeが付いていて、静的ファイルには
        # 何も付いていなかったため、ブラウザがJSファイルを古いまま
        # 使い続けてしまう(pull後にCtrl+Shift+Rしても反映されない)ことがあった。
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def handle_pending_csv_list(self):
        """catalog_pending/ フォルダ内のCSVファイル一覧を返す。
        Claudeがgit push経由で置いた「登録待ちCSV」を、部品登録パネルから
        ボタン一つで読み込めるようにするため(コピペの手間を省く目的)。
        実ファイルの取得は静的配信(catalog_pending/<name>)をそのまま使う。"""
        base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'catalog_pending')
        files = []
        if os.path.isdir(base):
            for name in sorted(os.listdir(base)):
                if name.lower().endswith('.csv'):
                    files.append(name)
        self._send_json({"files": files})

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # 通常のアクセスログは抑制（重要なものだけ表示）
        if '/api/' in fmt % args:
            super().log_message(fmt, *args)


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"電気回路図エディタ サーバー起動: http://localhost:{PORT}")
    if HOST not in ('127.0.0.1', 'localhost', '::1'):
        print(f"警告: {HOST} で待ち受けています。同一LAN上の別PCから図面・部品データが"
              f"見える状態です(ECAD_HOSTを外すと このPCからのみ になります)")
    httpd = HTTPServer((HOST, PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
