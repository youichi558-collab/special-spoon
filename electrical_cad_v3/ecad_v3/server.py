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
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/pending_csv':
            self.handle_pending_csv_list()
            return
        super().do_GET()

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
    httpd = HTTPServer(('', PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
