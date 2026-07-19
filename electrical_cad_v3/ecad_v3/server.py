#!/usr/bin/env python3
# ================================================================
# server.py — ecad_v3 ローカルサーバー
# 通常の静的ファイル配信(index.html等)に加え、
# /api/search でカタログPDF内の型式検索ができるAPIを提供する。
#
# 起動: py server.py  (start.bat から呼ばれる)
# 停止: Ctrl+C
#
# 必要ライブラリ: pdfplumber (pip install pdfplumber --break-system-packages)
#   ※ 未インストールでも通常のCAD機能（静的ファイル配信）は動く。
#      検索APIを使うときだけ pdfplumber が必要。
# ================================================================
import json
import os
import sys
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

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


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/search':
            self.handle_search(parsed)
            return
        if parsed.path == '/api/catalogs':
            self.handle_catalogs()
            return
        super().do_GET()

    def handle_catalogs(self):
        """設定済みのカタログ名一覧を返す（プルダウン用）"""
        cfg = load_config()
        self._send_json({"catalogs": list(cfg.get("catalog_paths", {}).keys())})

    def handle_search(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        catalog = (qs.get('catalog') or [''])[0]
        model = (qs.get('model') or [''])[0]
        mode = (qs.get('mode') or ['pivot'])[0]
        header_rows = int((qs.get('header_rows') or ['3'])[0])

        if not model:
            self._send_json({"error": "modelパラメータが必要です"}, status=400)
            return

        cfg = load_config()
        path = cfg.get("catalog_paths", {}).get(catalog)
        if not path or not os.path.exists(path):
            self._send_json({
                "error": f"カタログ「{catalog}」のパスが未設定、または見つかりません（catalog_config.jsonを確認してください）",
            }, status=400)
            return

        try:
            import pdfplumber  # noqa: F401  (存在確認)
        except ImportError:
            self._send_json({"error": "pdfplumberが未インストールです。'pip install pdfplumber --break-system-packages' を実行してください"}, status=500)
            return

        try:
            if mode == 'list':
                import find_spec_list
                rows = find_spec_list.search_model(path, model, header_rows)
            else:
                import find_spec
                rows = find_spec.search_model(path, model)
        except Exception as e:
            self._send_json({"error": f"検索中にエラーが発生しました: {e}"}, status=500)
            return

        result = [{"source": r[0], "page": r[1], "label": r[2], "value": r[3]} for r in rows]
        self._send_json({"rows": result})

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
