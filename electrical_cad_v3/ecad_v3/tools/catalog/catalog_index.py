#!/usr/bin/env python3
"""
catalog_index.py
------------------
カタログPDFの各ページのテキストをSQLiteに1回だけ抽出・保存しておき、
型式検索のたびに毎回全PDFを開き直さずに済むようにするための索引モジュール。

設計方針（重要）:
  - 索引に保存するのは「各ページの全文テキスト」のみ。
    型式が載っていそうなページ(候補)の絞り込みを高速化するのが目的。
  - 実際の値(電圧・電流・接点構成等)の抽出は、索引を使わず今まで通り
    その場でPDFを開いて表解析する(find_spec.py / find_spec_list.py の
    既存ロジックは一切変更しない)。索引は「どのファイルを見ればいいか」の
    絞り込みにのみ使い、値の抽出精度・安全性は今までと変わらない。
  - ファイルの更新日時(mtime)を保存しておき、次回インデックス作成時は
    変更のないファイルをスキップする(差分更新)。フォルダが大きくても、
    2回目以降のインデックス更新は新規・更新分だけで済む。

索引ファイルの保存場所:
  対象フォルダの直下に ".catalog_index.sqlite3" という名前で保存する
  (カタログフォルダごとに1つ。フォルダを消せば索引も一緒に消える)。

使い方(単体実行時):
    python3 catalog_index.py build <カタログフォルダ>   # 指定フォルダのインデックス作成/更新
    python3 catalog_index.py build-all                  # catalog_config.json登録済みの全カタログをまとめて処理
    python3 catalog_index.py stats <カタログフォルダ>   # 索引の状態を表示

※ CADの画面(server.py)からインデックスを作成する機能は用意していない。
   CADとインデックス作成を別プロセスとして切り離すため、作成・更新は
   このスクリプト(またはecad_v3直下の「インデックス作成.bat」)から行う。
   CAD側はできあがった索引を読んで検索・状態表示・検証をするだけ。
"""
import os
import sqlite3
import sys
import time

import pdfplumber
from normalize import contains as fuzzy_contains

DB_FILENAME = '.catalog_index.sqlite3'


def _db_path(catalog_path):
    return os.path.join(catalog_path, DB_FILENAME)


def _connect(catalog_path):
    conn = sqlite3.connect(_db_path(catalog_path))
    conn.execute('''
        CREATE TABLE IF NOT EXISTS pages (
            file TEXT NOT NULL,
            page INTEGER NOT NULL,
            mtime REAL NOT NULL,
            text TEXT,
            PRIMARY KEY (file, page)
        )
    ''')
    return conn


def index_exists(catalog_path):
    return os.path.exists(_db_path(catalog_path))


def index_stats(catalog_path):
    """索引の状態(ファイル数・ページ数)を返す。索引が無ければNone。"""
    if not index_exists(catalog_path):
        return None
    conn = _connect(catalog_path)
    n_pages = conn.execute('SELECT COUNT(*) FROM pages').fetchone()[0]
    n_files = conn.execute('SELECT COUNT(DISTINCT file) FROM pages').fetchone()[0]
    conn.close()
    return {"files": n_files, "pages": n_pages}


def stale_files(catalog_path):
    """フォルダ内のPDFのうち、索引が古い(または未索引の)ファイル名一覧を返す。
    索引が一度も作られていない場合はNoneを返す(呼び出し側で「未作成」と区別するため)。"""
    if not index_exists(catalog_path):
        return None
    conn = _connect(catalog_path)
    pdf_files = sorted(f for f in os.listdir(catalog_path) if f.lower().endswith('.pdf'))
    stale = []
    for fname in pdf_files:
        full = os.path.join(catalog_path, fname)
        try:
            mtime = os.path.getmtime(full)
        except OSError:
            continue
        row = conn.execute('SELECT mtime FROM pages WHERE file=? LIMIT 1', (fname,)).fetchone()
        if row is None or abs(row[0] - mtime) >= 1e-6:
            stale.append(fname)
    conn.close()
    return stale


def build_index(catalog_path, progress_cb=None):
    """catalog_path配下の全PDFをスキャンし、更新のあったファイルだけ再抽出してインデックスを更新する。

    progress_cb(done, total, filename, skipped) があれば進捗を通知する。
    戻り値: {"scanned": 更新したファイル数, "skipped": スキップしたファイル数,
             "pages": 索引全体の総ページ数, "elapsed": 秒}
    """
    t0 = time.time()
    conn = _connect(catalog_path)
    pdf_files = sorted(f for f in os.listdir(catalog_path) if f.lower().endswith('.pdf'))
    scanned = skipped = 0
    total = len(pdf_files)
    for i, fname in enumerate(pdf_files):
        full = os.path.join(catalog_path, fname)
        try:
            mtime = os.path.getmtime(full)
        except OSError:
            continue
        row = conn.execute('SELECT mtime FROM pages WHERE file=? LIMIT 1', (fname,)).fetchone()
        if row is not None and abs(row[0] - mtime) < 1e-6:
            skipped += 1
            if progress_cb:
                progress_cb(i + 1, total, fname, True)
            continue
        # 未索引、または更新があったファイルは全ページ再抽出する
        conn.execute('DELETE FROM pages WHERE file=?', (fname,))
        try:
            with pdfplumber.open(full) as pdf:
                for page_idx, page in enumerate(pdf.pages, start=1):
                    text = page.extract_text() or ''
                    conn.execute(
                        'INSERT INTO pages(file, page, mtime, text) VALUES (?,?,?,?)',
                        (fname, page_idx, mtime, text)
                    )
        except Exception as e:
            print(f"警告: {fname} の索引作成中にエラー: {e}")
            continue
        conn.commit()
        scanned += 1
        if progress_cb:
            progress_cb(i + 1, total, fname, False)
    total_pages = conn.execute('SELECT COUNT(*) FROM pages').fetchone()[0]
    conn.close()
    return {"scanned": scanned, "skipped": skipped, "pages": total_pages, "elapsed": round(time.time() - t0, 1)}


def find_candidate_files(catalog_path, model_query):
    """索引から、model_queryを含む可能性のあるページを持つファイル名の一覧を返す(高速)。
    索引が存在しない場合はNoneを返す(呼び出し側はフォールバックで全件スキャンする)。"""
    if not index_exists(catalog_path):
        return None
    conn = _connect(catalog_path)
    files = set()
    for file, text in conn.execute('SELECT file, text FROM pages'):
        if fuzzy_contains(text or '', model_query):
            files.add(file)
    conn.close()
    return sorted(files)


def build_all_from_config(config_path, progress_cb=None):
    """catalog_config.jsonに登録されている全カタログをまとめてインデックス化する。
    戻り値: {カタログ名: build_indexの結果dict または {"error": ...}}"""
    import json
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    results = {}
    for name, path in cfg.get('catalog_paths', {}).items():
        if progress_cb:
            progress_cb(name, path)
        if not path or not os.path.isdir(path):
            results[name] = {"error": f"フォルダが見つかりません: {path}"}
            continue
        results[name] = build_index(path)
    return results


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('build', 'stats', 'build-all'):
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'build-all':
        # catalog_config.json (tools/catalog の2つ上、ecad_v3直下)を読んで、
        # 登録されている全カタログをまとめてインデックス化する
        config_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
            os.path.dirname(__file__), '..', '..', 'catalog_config.json')
        config_path = os.path.abspath(config_path)
        print(f"設定ファイル: {config_path}\n")

        def cb(name, path):
            print(f"=== {name} ({path}) ===")
        results = build_all_from_config(config_path, progress_cb=cb)
        if not results:
            print("catalog_config.jsonにカタログが登録されていません。")
            print("先にCADの部品登録パネルで「フォルダを選択して追加」からカタログを登録してください。")
            return
        for name, r in results.items():
            if "error" in r:
                print(f"  → エラー: {r['error']}")
            else:
                print(f"  → 更新{r['scanned']}件・スキップ{r['skipped']}件・総{r['pages']}ページ ({r['elapsed']}秒)")
        return

    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[2]
    if cmd == 'build':
        def cb(done, total, fname, skipped):
            mark = 'skip' if skipped else 'done'
            print(f"[{done}/{total}] {mark}: {fname}")
        result = build_index(path, progress_cb=cb)
        print(f"\n完了: 更新{result['scanned']}件・スキップ{result['skipped']}件・"
              f"総ページ数{result['pages']} ({result['elapsed']}秒)")
    else:
        stats = index_stats(path)
        if stats is None:
            print("索引がまだ作成されていません。")
        else:
            print(f"ファイル数: {stats['files']} / ページ数: {stats['pages']}")


if __name__ == '__main__':
    main()
