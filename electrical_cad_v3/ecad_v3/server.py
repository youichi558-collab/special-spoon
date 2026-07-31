#!/usr/bin/env python3
# ================================================================
# server.py — ecad_v3 ローカルサーバー
# 通常の静的ファイル配信(index.html等)に加え、
# /api/search でカタログPDF内の型式検索ができるAPIを提供する。
#
# 起動: py server.py  (start.bat から呼ばれる)
# 停止: Ctrl+C
#
# 必要ライブラリ: pdfplumber (コマンドプロンプトで: py -m pip install pdfplumber)
#   ※ 未インストールでも通常のCAD機能（静的ファイル配信）は動く。
#      検索APIを使うときだけ pdfplumber が必要。
# ================================================================
import json
import os
import re
import string
import sys
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

# UNCパスの共有ルート(例: \\server\share)を検出する正規表現。
# これより上(\\serverだけ等)はos.listdirできないため、親フォルダとして扱わない。
_UNC_SHARE_ROOT_RE = re.compile(r'^\\\\[^\\]+\\[^\\]+$')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools', 'catalog'))

PORT = 8080
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'catalog_config.json')


def load_config():
    default = {"catalog_paths": {}}
    if not os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(default, f, ensure_ascii=False, indent=2)
        return default
    try:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_config(cfg):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def list_drives():
    """Windowsのドライブ一覧（C:\\, D:\\ など）を返す。Windows以外ならルートのみ。"""
    if os.name == 'nt':
        drives = []
        for letter in string.ascii_uppercase:
            d = f"{letter}:\\"
            if os.path.exists(d):
                drives.append(d)
        return drives
    return ['/']


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/search':
            self.handle_search(parsed)
            return
        if parsed.path == '/api/catalogs':
            self.handle_catalogs()
            return
        if parsed.path == '/api/browse':
            self.handle_browse(parsed)
            return
        if parsed.path == '/api/index_stats':
            self.handle_index_stats(parsed)
            return
        if parsed.path == '/api/verify_search':
            self.handle_verify_search(parsed)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/save_catalog':
            self.handle_save_catalog()
            return
        self.send_error(404)

    def handle_browse(self, parsed):
        """指定パス配下のサブフォルダ一覧とPDF件数を返す（フォルダピッカー用）"""
        qs = urllib.parse.parse_qs(parsed.query)
        path = (qs.get('path') or [''])[0]

        if not path:
            self._send_json({"path": "", "is_root": True, "dirs": list_drives(), "pdf_count": 0})
            return

        if not os.path.isdir(path):
            self._send_json({"error": f"フォルダが見つかりません: {path}"}, status=400)
            return

        try:
            entries = os.listdir(path)
        except Exception as e:
            self._send_json({"error": f"読み取りエラー: {e}"}, status=500)
            return

        dirs = []
        pdf_count = 0
        for name in sorted(entries):
            full = os.path.join(path, name)
            try:
                if os.path.isdir(full):
                    dirs.append(name)
                elif name.lower().endswith('.pdf'):
                    pdf_count += 1
            except Exception:
                continue

        parent = os.path.dirname(path.rstrip('\\/'))
        # ドライブ直下(例 C:\)ではこれ以上上に行けないようにする
        if os.name == 'nt' and len(path.rstrip('\\/')) <= 2:
            parent = ''
        # UNC共有ルート(例 \\server\share)ではこれ以上上(\\serverだけ等)に行けないようにする
        elif _UNC_SHARE_ROOT_RE.match(path.rstrip('\\/')):
            parent = ''

        self._send_json({
            "path": path,
            "is_root": False,
            "parent": parent,
            "dirs": dirs,
            "pdf_count": pdf_count,
        })

    def handle_save_catalog(self):
        """フォルダピッカーで選んだパスに名前を付けてcatalog_config.jsonへ保存"""
        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            body = {}
        name = (body.get('name') or '').strip()
        path = (body.get('path') or '').strip()
        if not name or not path:
            self._send_json({"error": "nameとpathの両方が必要です"}, status=400)
            return
        cfg = load_config()
        cfg.setdefault('catalog_paths', {})[name] = path
        save_config(cfg)
        self._send_json({"ok": True, "catalogs": list(cfg['catalog_paths'].keys())})

    def handle_catalogs(self):
        """設定済みのカタログ名一覧を返す（プルダウン用）"""
        cfg = load_config()
        self._send_json({"catalogs": list(cfg.get("catalog_paths", {}).keys())})

    def _resolve_catalog_path(self, qs):
        """クエリの catalog(登録名) または path(生パス) からカタログフォルダの実パスを解決する。
        見つからない場合は None を返す(呼び出し側でエラーレスポンスを組み立てる)。"""
        catalog = (qs.get('catalog') or [''])[0]
        raw_path = (qs.get('path') or [''])[0]
        if raw_path:
            path = raw_path
        else:
            cfg = load_config()
            path = cfg.get("catalog_paths", {}).get(catalog)
        if not path or not os.path.exists(path):
            return None, catalog
        return path, catalog

    def handle_search(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        model = (qs.get('model') or [''])[0]
        mode = (qs.get('mode') or ['pivot'])[0]
        header_rows = int((qs.get('header_rows') or ['3'])[0])
        stop_first = (qs.get('stop_first') or ['0'])[0] == '1'

        if not model:
            self._send_json({"error": "modelパラメータが必要です"}, status=400)
            return

        path, catalog = self._resolve_catalog_path(qs)
        if not path:
            self._send_json({
                "error": f"カタログ「{catalog}」のパスが未設定、または見つかりません（catalog_config.jsonを確認してください）",
            }, status=400)
            return

        try:
            import pdfplumber  # noqa: F401  (存在確認)
        except ImportError:
            self._send_json({"error": "pdfplumberが未インストールです。コマンドプロンプトで 'py -m pip install pdfplumber' を実行してください"}, status=500)
            return

        try:
            if mode == 'list':
                import find_spec_list
                rows = find_spec_list.search_model(path, model, header_rows, stop_at_first=stop_first)
            else:
                import find_spec
                rows = find_spec.search_model(path, model, stop_at_first=stop_first)
        except Exception as e:
            self._send_json({"error": f"検索中にエラーが発生しました: {e}"}, status=500)
            return

        result = [{"source": r[0], "page": r[1], "label": r[2], "value": r[3]} for r in rows]
        self._send_json({"rows": result, "stop_first": stop_first})

    def handle_index_stats(self, parsed):
        """索引の有無・件数・古いファイルの有無を返す(検索前の状態確認・警告表示用)"""
        qs = urllib.parse.parse_qs(parsed.query)
        path, catalog = self._resolve_catalog_path(qs)
        if not path:
            self._send_json({"error": f"カタログ「{catalog}」のパスが未設定、または見つかりません"}, status=400)
            return
        import catalog_index
        stats = catalog_index.index_stats(path)
        if stats is None:
            self._send_json({"exists": False})
            return
        stale = catalog_index.stale_files(path)
        self._send_json({"exists": True, "files": stats["files"], "pages": stats["pages"], "stale_count": len(stale or [])})

    def handle_verify_search(self, parsed):
        """索引あり(通常の検索)と索引なし(強制全件スキャン)で同じ条件で検索し、
        結果が完全に一致するか比較する(索引を信用してよいかの検証用)。"""
        qs = urllib.parse.parse_qs(parsed.query)
        model = (qs.get('model') or [''])[0]
        mode = (qs.get('mode') or ['pivot'])[0]
        header_rows = int((qs.get('header_rows') or ['3'])[0])
        if not model:
            self._send_json({"error": "modelパラメータが必要です"}, status=400)
            return
        path, catalog = self._resolve_catalog_path(qs)
        if not path:
            self._send_json({"error": f"カタログ「{catalog}」のパスが未設定、または見つかりません"}, status=400)
            return
        try:
            import pdfplumber  # noqa: F401
        except ImportError:
            self._send_json({"error": "pdfplumberが未インストールです。コマンドプロンプトで 'py -m pip install pdfplumber' を実行してください"}, status=500)
            return
        try:
            if mode == 'list':
                import find_spec_list as finder
                rows_indexed = finder.search_model(path, model, header_rows, use_index=True)
                rows_full = finder.search_model(path, model, header_rows, use_index=False)
            else:
                import find_spec as finder
                rows_indexed = finder.search_model(path, model, use_index=True)
                rows_full = finder.search_model(path, model, use_index=False)
        except Exception as e:
            self._send_json({"error": f"検証中にエラーが発生しました: {e}"}, status=500)
            return
        # 順序に依存しない比較(ファイル列挙順が索引経由と全件スキャンで一致するとは限らないため)
        match = sorted(rows_indexed) == sorted(rows_full)
        self._send_json({
            "match": match,
            "indexed_count": len(rows_indexed),
            "full_count": len(rows_full),
            "indexed_rows": [{"source": r[0], "page": r[1], "label": r[2], "value": r[3]} for r in rows_indexed],
            "full_rows": [{"source": r[0], "page": r[1], "label": r[2], "value": r[3]} for r in rows_full],
        })

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # 通常のアクセスログは抑制（重要なものだけ表示）
        if '/api/' in fmt % args:
            super().log_message(fmt, *args)


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    load_config()  # 初回起動時にcatalog_config.jsonを自動生成
    print(f"電気回路図エディタ サーバー起動: http://localhost:{PORT}")
    print(f"カタログ検索設定ファイル: {CONFIG_PATH}")
    httpd = HTTPServer(('', PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
