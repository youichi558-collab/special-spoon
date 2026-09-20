#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""検索用カタログDB(Drive CSV→SQLite)の列数のテスト

    py tests\\test_catalog_db_columns.py    (Windows)
    python3 tests/test_catalog_db_columns.py

【背景・2026-09-20】
CSVの10列目にカタログURLを足したとき、直したのは部品登録パネルの
CSV一括登録(`js/parts_page.js`)だけで、**Drive→検索用カタログDBの経路
(`tools/catalog_db/catalog_db.py`)は9列のままだった**。

穴埋めが `[''] * (9 - 10)` = `[]` になり、`cells[:9]` で10列目が
エラーも警告も出さずに捨てられていた。Coworkの作業報告で指摘されて気づいた。

**列を足すときは「読む側」が2経路ある**ことを忘れないための固定。

このテストが守るもの:
  1. 10列のCSVからカタログURLがDBに入る(黙って落ちない)
  2. 8列・9列の古いCSVもそのまま読める(混在して壊れない)
  3. JS側が読むキー名と一致している(catalogUrl。catalog_url だと食い違う)
  4. スキーマを変えたらCSVが同じでも作り直される(古いDBが使われ続けない)
"""
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools', 'catalog_db'))
import catalog_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK   ' if cond else '  NG   ') + msg)
    if not cond:
        ng += 1


ROW10 = ('三菱電機,NF32-SV,breaker,600V,"3,5,10","主接点:1,3,5,2,4,6",-,'
         '備考テキスト,三菱ブレーカー総合カタログ p.37,https://example.invalid/a/view\n')
ROW9 = ('三菱電機,NF63-SV,breaker,600V,"3,5","主接点:1,3,5",-,'
        '備考テキスト,三菱ブレーカー総合カタログ p.38\n')
ROW8 = '三菱電機,NF125-SV,breaker,690V,"15,20","主接点:1,3,5",-,備考テキスト\n'

tmp = tempfile.mkdtemp(prefix='ecad_catdb_')
try:
    csv_dir = os.path.join(tmp, 'csv')
    data_dir = os.path.join(tmp, 'data')
    os.makedirs(csv_dir)
    with open(os.path.join(csv_dir, 'a.csv'), 'w', encoding='utf-8', newline='') as f:
        f.write(ROW10 + ROW9 + ROW8)

    db = catalog_db.CatalogDB(data_dir=data_dir, csv_dir=csv_dir)
    db.build()

    by_ref = {r['ref']: r for r in db.search(limit=100)}
    ok(len(by_ref) == 3, '3件とも取り込まれる(実際は%d件)' % len(by_ref))

    print('【10列目のカタログURLが落ちない】')
    r10 = by_ref.get('NF32-SV', {})
    ok('catalogUrl' in r10, 'catalogUrl という名前で返る(JS側 r.catalogUrl と同じ)')
    ok(r10.get('catalogUrl') == 'https://example.invalid/a/view', 'URLがそのまま入る')
    ok(r10.get('source') == '三菱ブレーカー総合カタログ p.37', '9列目の出典も入ったまま')
    ok(r10.get('terminals') == '主接点:1,3,5,2,4,6', '端子番号欄のカンマで列がずれない')

    print('【古い8列・9列のCSVも読める】')
    r9 = by_ref.get('NF63-SV', {})
    ok(r9.get('source') == '三菱ブレーカー総合カタログ p.38', '9列CSVの出典が入る')
    ok(r9.get('catalogUrl') == '', '9列CSVのカタログURLは空(Noneや例外にしない)')
    r8 = by_ref.get('NF125-SV', {})
    ok(r8.get('note') == '備考テキスト', '8列CSVの備考が入る')
    ok(r8.get('source') == '' and r8.get('catalogUrl') == '', '8列CSVの出典・URLは空')

    print('【CSVが変わらなければ作り直さない】')
    ok(not db.needs_build(), '構築直後は再構築不要')

    print('【スキーマを上げたら、CSVが同じでも作り直す】')
    orig = catalog_db.CatalogDB.SCHEMA_VERSION
    try:
        catalog_db.CatalogDB.SCHEMA_VERSION = orig + 1
        db2 = catalog_db.CatalogDB(data_dir=data_dir, csv_dir=csv_dir)
        ok(db2.needs_build(), 'SCHEMA_VERSIONを上げると再構築が要ると判定される')
    finally:
        catalog_db.CatalogDB.SCHEMA_VERSION = orig

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n失敗 %d 件' % ng if ng else '\nすべて通過')
sys.exit(1 if ng else 0)
