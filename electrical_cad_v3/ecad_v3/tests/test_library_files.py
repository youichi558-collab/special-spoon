#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ライブラリフォルダの図面枠テンプレート・表題欄様式(frames.json / titleblocks.json)のテスト

    python3 tests/test_library_files.py

【背景・2026-10-03 再設計の段階2】
図面枠テンプレートと表題欄の様式は、ブラウザの中(localStorage)にしか無く、別のPCでは使えず、
ブラウザのデータを消すと無くなった。部品DBと同じライブラリフォルダに置く形にした
(tools/parts_db/parts_db.py read_library / save_library、server.py /api/library/)。

このテストが守るもの:
  1. ライブラリが未設定・見つからないなら、読まない・書かない
  2. ファイルがまだ無ければ空({})で読め、版 '' で最初の保存ができる
  3. 読んだ後に他で保存されていたら書かない(版の確認)。版を送らない古い画面も書かない
  4. 上書きの前に backup/ へ世代を残す(<名前>_YYYYMMDD_HHMMSS.json)。部品DBの世代と混ざらない
  5. 決まった種類(frames / titleblocks)以外は受け付けない・形の違う中身は書かない
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools', 'parts_db'))
import parts_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK ' if cond else '  NG ') + msg)
    if not cond:
        ng += 1


tmp = tempfile.mkdtemp(prefix='ecad_lib_')
try:
    data_dir = os.path.join(tmp, 'appdata')
    lib = os.path.join(tmp, 'lib')
    os.makedirs(lib)
    db = parts_db.PartsDB(data_dir=data_dir)
    TPL = {'custA': {'label': '客先A', 'cells': [{'x': 0, 'y': 0, 'w': 1, 'h': 1, 'key': 'title', 'lbl': '名称'}]}}

    print('【ライブラリが未設定なら、読まない・書かない】')
    r = db.read_library('titleblocks')
    ok(not r['ok'] and r['source'] == 'unset', '読めない(unset)')
    r = db.save_library('titleblocks', TPL, '')
    ok(not r['ok'] and r['reason'] == 'unset', '書かない(unset)')
    ok(not os.path.exists(os.path.join(lib, 'titleblocks.json')), '★どこにも作らない')

    print('\n【ファイルがまだ無ければ空で読め、最初の保存ができる】')
    db.set_library(lib, create=True)
    r = db.read_library('titleblocks')
    ok(r['ok'] and r['source'] == 'nofile' and r['data'] == {} and r['version'] == '', '空・版は空文字')
    r = db.save_library('titleblocks', TPL, '')
    ok(r['ok'] and r['version'], '保存でき、新しい版を返す')
    with open(os.path.join(lib, 'titleblocks.json'), encoding='utf-8') as f:
        ok(json.load(f) == TPL, '★ライブラリフォルダの titleblocks.json に書かれる')
    ok(not os.path.isdir(os.path.join(lib, 'backup')) or not [n for n in os.listdir(os.path.join(lib, 'backup')) if n.startswith('titleblocks_')],
       '最初の保存では世代は作らない(上書きされる前の中身が無い)')

    print('\n【読んだ後に他で保存されていたら書かない】')
    v1 = db.read_library('titleblocks')['version']
    other = dict(TPL, custB={'label': 'B', 'cells': []})
    ok(db.save_library('titleblocks', other, v1)['ok'], '別のPCが保存した')
    r = db.save_library('titleblocks', {}, v1)
    ok(not r['ok'] and r['reason'] == 'conflict', '★古い版での保存は conflict')
    ok('custB' in db.read_library('titleblocks')['data'], '★相手の保存した内容が残っている')
    r = db.save_library('titleblocks', {}, None)
    ok(not r['ok'] and r['reason'] == 'conflict' and 'Ctrl+Shift+R' in r['error'], '版を送らない古い画面は書かない')

    print('\n【上書きの前に backup/ へ世代を残す(部品DBの世代と混ざらない)】')
    bk = sorted(os.listdir(os.path.join(lib, 'backup')))
    ok(any(n.startswith('titleblocks_') for n in bk), '★titleblocks_YYYYMMDD_HHMMSS.json ができる')
    ok(not any(n.startswith('parts_db_') for n in bk), '部品DBの世代は作らない(別のファイル)')

    print('\n【決まった種類・形以外は受け付けない】')
    try:
        db.read_library('../parts_db')
        ok(False, '知らない種類は ValueError')
    except ValueError:
        ok(True, '知らない種類は ValueError(画面からファイル名やパスを渡せない)')
    v = db.read_library('frames')['version']
    r = db.save_library('frames', ['配列'], v)
    ok(not r['ok'] and r['reason'] == 'bad_data', '配列は書かない')
    r = db.save_library('frames', {'a': '文字'}, v)
    ok(not r['ok'] and r['reason'] == 'bad_data', '{キー: 定義(オブジェクト)} の形でなければ書かない')
    ok(db.save_library('frames', {'A3': {'w': '420', 'h': '297'}}, v)['ok'], 'frames.json も同じ形で保存できる')

    print('\n【フォルダが見つからなければ読まない・書かない】')
    v = db.read_library('frames')['version']
    shutil.move(lib, lib + '_away')
    r = db.read_library('frames')
    ok(not r['ok'] and r['source'] == 'path_missing', '読めない(path_missing)')
    ok(not db.save_library('frames', {}, v)['ok'], '書かない')
    ok(not os.path.exists(lib), '★勝手に作らない')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n' + (f'失敗 {ng} 件' if ng else 'すべて通過'))
sys.exit(1 if ng else 0)
