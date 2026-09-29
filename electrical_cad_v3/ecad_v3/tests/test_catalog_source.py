# -*- coding: utf-8 -*-
"""カタログDBの読み先は常に catalog_pending/ (2026-09-29)

    py tests/test_catalog_source.py

同じCSVがGoogle Driveの「カタログDB」フォルダとリポジトリの catalog_pending/ の
2か所にあり、9-29にCP30-BAと補助リレー(MY)をリポジトリだけ直して食い違った。
盛田さんの決定「複数人が同じファイルを見に行くのは論外、個人個人でやる」により、
原本を catalog_pending/ だけにし、検索もそこを読む。
  ・設定ファイルに古い読み先(Drive/取り込みキャッシュ)が残っていても見ない
  ・CSVを直すと、次の検索で自動的に作り直される
  ・フォルダを選んで取り込む経路(/api/catalog/import)は廃止
"""
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'catalog_db'))
import catalog_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK  ' if cond else '  NG  ') + msg)
    if not cond:
        ng += 1


pending = os.path.join(ROOT, 'catalog_pending')
work = tempfile.mkdtemp(prefix='catsrc_')
try:
    print('【読み先は catalog_pending/】')
    ok(os.path.normcase(catalog_db.default_csv_dir()) == os.path.normcase(pending),
       'default_csv_dir() がリポジトリの catalog_pending を指す')

    # 盛田さんのPCと同じく、設定ファイルに古い読み先(取り込みキャッシュ)が残っている状態
    old = os.path.join(work, 'csv_cache')
    os.makedirs(old)
    with open(os.path.join(old, 'old.csv'), 'w', encoding='utf-8') as f:
        f.write('古いメーカー,OLD-1,breaker,,,,,,\n')
    with open(os.path.join(work, catalog_db.CONFIG_NAME), 'w', encoding='utf-8') as f:
        json.dump({'csv_dir': old, 'source_label': 'カタログDB'}, f)

    db = catalog_db.CatalogDB(data_dir=work)
    ok(os.path.normcase(db.csv_dir) == os.path.normcase(pending), '設定ファイルの古い csv_dir は見ない')
    ok(db.is_configured(), '設定しなくても使える')
    db.ensure_built()
    ok(not db.search('OLD-1'), '古い読み先のCSVは検索に出ない')
    cp = db.get('CP30-BA')
    ok(cp is not None and cp['amp'].startswith('極数:1P・2P'), '9-29に足したCP30-BAが検索に出る(選択項目の書き方のまま)')
    my = db.get('MY2N')
    ok(my is not None and my['amp'] == '-', '9-29に直したMY2Nは電流列が「-」')
    ok('catalog_pending' in db.source_label(), '画面の表示名は catalog_pending')

    print('\n【CSVを直すと次の検索で作り直される】')
    tmp_pending = os.path.join(work, 'pending_copy')
    shutil.copytree(pending, tmp_pending)
    db2 = catalog_db.CatalogDB(data_dir=work, csv_dir=tmp_pending)
    db2.ensure_built()
    with open(os.path.join(tmp_pending, 'zz_new.csv'), 'w', encoding='utf-8') as f:
        f.write('テスト,NEW-REF-1,breaker,,,,,,\n')
    ok(db2.needs_build(), 'CSVを足すと作り直しが必要と判定される')
    db2.ensure_built()
    ok(db2.get('NEW-REF-1') is not None, '作り直した後は新しい型番が出る')

    print('\n【廃止した経路が残っていない】')
    ok(not hasattr(catalog_db.CatalogDB, 'set_csv_dir'), 'set_csv_dir は無い')
    ok(not hasattr(catalog_db.CatalogDB, 'import_files'), 'import_files は無い')
    page = open(os.path.join(ROOT, 'js', 'parts_page.js'), encoding='utf-8').read()
    html = open(os.path.join(ROOT, 'parts.html'), encoding='utf-8').read()
    ok('showDirectoryPicker' not in page and 'catalogPickFolder' not in html,
       '部品DB画面にフォルダ選択が残っていない')
    ok('catalogRebuild()' in html and 'function catalogRebuild' in page, '「作り直す」ボタンがある')
    srv = open(os.path.join(ROOT, 'server.py'), encoding='utf-8').read()
    body = srv[srv.index('def handle_catalog_import'):srv.index('def handle_catalog(')]
    ok('import_files' not in body and '廃止' in body, '/api/catalog/import は断るだけ(別の場所へ書かない)')
finally:
    shutil.rmtree(work, ignore_errors=True)

print('\n' + ('失敗 %d 件' % ng if ng else 'すべて通過'))
sys.exit(1 if ng else 0)
