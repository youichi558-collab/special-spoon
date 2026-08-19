#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_catalog_db.py — カタログDB(SQLite)を構築する。

カタログCSV（メーカー,型番,種別,定格電圧,定格電流,端子番号,接点構成,備考）を
読み込んで catalog.sqlite3 を作る。CADからは server.py の検索API経由で参照する。

使い方:
    python3 build_catalog_db.py <出力先.sqlite3> <入力CSVファイル...>

設計メモ:
- CADの部品DB(実際に使う数千件)とは別物。こちらはカタログ全数(将来数万件)を
  格納する検索専用DB。CADのリポジトリには置かず、Google Drive上に置いて
  server.py がローカル同期パス経由で読む。
- 全文検索にはFTS5を使う。型番の部分一致・メーカー名・備考のキーワード検索が
  数万件でも一瞬で返る。
- 同じ型番が複数のCSVに現れた場合は、後から読んだ方で上書きする(UPSERT)。
"""
import csv
import os
import sqlite3
import sys

SCHEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS parts (
    ref        TEXT PRIMARY KEY,   -- 型番(一意)
    maker      TEXT NOT NULL,
    type       TEXT,               -- 種別コード(coil/breaker/plc/hmi...)
    volt       TEXT,
    amp        TEXT,
    terminals  TEXT,
    contacts   TEXT,
    note       TEXT,
    source     TEXT                -- 由来(元CSVファイル名。出典追跡用)
);

CREATE INDEX IF NOT EXISTS idx_parts_maker ON parts(maker);
CREATE INDEX IF NOT EXISTS idx_parts_type  ON parts(type);

-- 全文検索用(型番・メーカー・備考をまとめて検索できるようにする)
CREATE VIRTUAL TABLE IF NOT EXISTS parts_fts USING fts5(
    ref, maker, note,
    content='parts',
    content_rowid='rowid',
    tokenize="unicode61"
);
"""

TRIGGERS = """
CREATE TRIGGER IF NOT EXISTS parts_ai AFTER INSERT ON parts BEGIN
  INSERT INTO parts_fts(rowid, ref, maker, note) VALUES (new.rowid, new.ref, new.maker, new.note);
END;
CREATE TRIGGER IF NOT EXISTS parts_ad AFTER DELETE ON parts BEGIN
  INSERT INTO parts_fts(parts_fts, rowid, ref, maker, note) VALUES('delete', old.rowid, old.ref, old.maker, old.note);
END;
CREATE TRIGGER IF NOT EXISTS parts_au AFTER UPDATE ON parts BEGIN
  INSERT INTO parts_fts(parts_fts, rowid, ref, maker, note) VALUES('delete', old.rowid, old.ref, old.maker, old.note);
  INSERT INTO parts_fts(rowid, ref, maker, note) VALUES (new.rowid, new.ref, new.maker, new.note);
END;
"""


def build(db_path, csv_paths):
    if os.path.exists(db_path):
        os.remove(db_path)
    for ext in ('-wal', '-shm'):
        p = db_path + ext
        if os.path.exists(p):
            os.remove(p)

    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.executescript(TRIGGERS)

    total, skipped = 0, 0
    for path in csv_paths:
        src = os.path.basename(path)
        with open(path, newline='', encoding='utf-8') as f:
            for i, row in enumerate(csv.reader(f), 1):
                if len(row) != 8:
                    print(f"  警告: {src}:{i} が{len(row)}列のためスキップ", file=sys.stderr)
                    skipped += 1
                    continue
                maker, ref, typ, volt, amp, term, cont, note = [c.strip() for c in row]
                if not ref:
                    skipped += 1
                    continue
                conn.execute("""
                    INSERT INTO parts (ref, maker, type, volt, amp, terminals, contacts, note, source)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(ref) DO UPDATE SET
                      maker=excluded.maker, type=excluded.type, volt=excluded.volt,
                      amp=excluded.amp, terminals=excluded.terminals,
                      contacts=excluded.contacts, note=excluded.note, source=excluded.source
                """, (ref, maker, typ, volt, amp, term, cont, note, src))
                total += 1

    conn.commit()
    conn.execute("INSERT INTO parts_fts(parts_fts) VALUES('optimize')")
    conn.commit()

    n = conn.execute("SELECT COUNT(*) FROM parts").fetchone()[0]
    makers = conn.execute("SELECT maker, COUNT(*) FROM parts GROUP BY maker ORDER BY 2 DESC").fetchall()
    conn.close()

    print(f"\n構築完了: {db_path}")
    print(f"  処理行数: {total}行(スキップ {skipped}行)")
    print(f"  登録型番: {n}件")
    print("  メーカー別:")
    for m, c in makers:
        print(f"    {m}: {c}件")
    print(f"  ファイルサイズ: {os.path.getsize(db_path):,} バイト")


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    build(sys.argv[1], sys.argv[2:])
