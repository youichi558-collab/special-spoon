#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""カタログCSV→カタログDB→部品DB の作り直しのテスト

    py tests\\test_rebuild_parts_db.py
    python3 tests/test_rebuild_parts_db.py

【背景・2026-09-20】
Coworkがカタログ36ファイル・635型番に端子グループ・出典・カタログURLを入れたが、
それが部品DBに入るまでに画面の操作が3つ(再取込→検索→全件作り直し)あり、さらに
`catalog_db.py` を直した直後は server.py の再起動も要る。盛田さんが4〜5回やっても
直らず、切り分けだけで長くかかった。そこで `tools/rebuild_parts_db.py` を用意した。

**この道は部品DBを丸ごと書き換える。** 間違えると盛田さんの手が止まるので、
本物のファイルを書いて、何が残って何が消えたかを見る。

このテストが守るもの:
  1. CSVの全行が部品DBに入る(取りこぼさない)
  2. 10列目のカタログURLと9列目の出典が全行に入る(途中で落ちない)
  3. 端子のグループ形式が保たれる(「主接点:1,3,5」がそのまま届く)
  4. 外形図DXFの紐付けを型番で引き継ぐ(作り直しで消さない)
  5. 非表示にした標準部品(hiddenBuiltinRefs)を残す
  6. 書く前に必ず退避を取る
"""
import csv
import glob
import os
import re
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

# データの置き場所を一時フォルダへ逃がす(本物のカタログDB・部品DBを触らない)。
# import より前に入れる必要がある。
tmp = tempfile.mkdtemp(prefix='ecad_rebuild_')
os.environ['XDG_DATA_HOME'] = os.path.join(tmp, 'xdg')
os.environ['LOCALAPPDATA'] = os.path.join(tmp, 'local')

sys.path.insert(0, os.path.join(APP, 'tools'))
sys.path.insert(0, os.path.join(APP, 'tools', 'parts_db'))
import parts_db          # noqa: E402
import rebuild_parts_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK   ' if cond else '  NG   ') + msg)
    if not cond:
        ng += 1


def grouped(s):
    return bool(re.search(r'[^,:：/]+[:：]', s or ''))


try:
    # CSVから期待値を先に数えておく(件数を固定値で書くと、カタログが増えたとき落ちる)
    want, want_grp = 0, 0
    for f in sorted(glob.glob(os.path.join(APP, 'catalog_pending', '*.csv'))):
        for row in csv.reader(open(f, encoding='utf-8-sig')):
            if not row or not any(c.strip() for c in row):
                continue
            want += 1
            if len(row) > 5 and grouped(row[5]):
                want_grp += 1

    # 「今の部品DB」を作る: カタログにある2件(外形図つき) + カタログに無い1件
    pdb_path = os.path.join(tmp, 'parts_db.json')
    import json
    json.dump({'customParts': [
        {'ref': 'NF32-SV', 'maker': '三菱電機', 'terminals': '-', 'custom': True,
         'outlineDxf': '0\nSECTION\n', 'outlineDxfName': 'NF32-SV.dxf'},
        {'ref': 'S-T10', 'maker': '三菱電機', 'terminals': 'A1,A2', 'custom': True,
         'outlineDxf': 'x', 'outlineDxfName': 'S-T10.dxf'},
        {'ref': 'MYPART-1', 'maker': '自作', 'custom': True, 'outlineDxf': 'y'},
    ], 'hiddenBuiltinRefs': ['builtin_x']},
        open(pdb_path, 'w', encoding='utf-8'), ensure_ascii=False)
    parts_db.PartsDB().set_path(pdb_path)

    rc = rebuild_parts_db.main(['--yes'])
    ok(rc == 0, f'作り直しが成功する (戻り値 {rc})')

    data = json.load(open(pdb_path, encoding='utf-8'))
    P = data['customParts']
    by = {p['ref']: p for p in P}

    print('【CSVの全行が届く】')
    ok(len(P) == want, f'件数がCSVと一致 (期待 {want}、実際 {len(P)})')

    print('【出典とカタログURLが落ちない】')
    print('  ← 2026-09-20、catalog_db.py が9列のままで10列目が黙って捨てられていた')
    ok(all(p.get('source') for p in P), '全行に出典が入る')
    ok(all(p.get('catalogUrl') for p in P), '全行にカタログURLが入る')
    ok(by['NF32-SV']['catalogUrl'].startswith('http'), 'URLがhttpで始まる')

    print('【端子のグループ形式が保たれる】')
    got_grp = sum(1 for p in P if grouped(p.get('terminals')))
    ok(got_grp == want_grp, f'グループ形式の件数が一致 (期待 {want_grp}、実際 {got_grp})')
    ok(by['NF32-SV']['terminals'] == '主接点:1,3,5,2,4,6',
       f"NF32-SVの端子がそのまま (実際 {by['NF32-SV']['terminals']})")

    print('【消してはいけないものを消さない】')
    ok(by['NF32-SV'].get('outlineDxf') == '0\nSECTION\n', '外形図DXFを引き継ぐ')
    ok(by['NF32-SV'].get('outlineDxfName') == 'NF32-SV.dxf', '外形図のファイル名も引き継ぐ')
    ok(by['S-T10'].get('outlineDxf') == 'x', '2件目の外形図も引き継ぐ')
    ok(data['hiddenBuiltinRefs'] == ['builtin_x'], '非表示にした標準部品を残す')

    print('【カタログに無い部品は消える(画面の作り直しと同じ)】')
    ok('MYPART-1' not in by, 'カタログに無い手作り部品は消える')

    print('【書く前に退避を取る】')
    bks = [f for f in os.listdir(tmp) if f.startswith('parts_db_backup')]
    ok(len(bks) == 1, f'退避ファイルが1つできる ({bks})')
    if bks:
        old = json.load(open(os.path.join(tmp, bks[0]), encoding='utf-8'))
        refs = [p['ref'] for p in old['customParts']]
        ok('MYPART-1' in refs, '退避には作り直し前の中身が入っている(戻せる)')

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n失敗 %d 件' % ng if ng else '\nすべて通過')
sys.exit(1 if ng else 0)
