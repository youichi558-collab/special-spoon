#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部品DBの場所が外れたときの自動復帰のテスト

    py tests\\test_parts_db_recover.py
    python3 tests/test_parts_db_recover.py

【背景・2026-09-21】
部品DBはリポジトリの外(Drive上)に置く決まりで、場所は設定ファイルの絶対パスで
持っている。2026-09-21、その設定が外れて「部品DBの場所が未設定です」で止まった。

盛田さん「なぜ固定パスを使っている、環境が変わったら動かんぞ」。そのとおりで、
設定の絶対パスは**前に見つけた場所の控え**であって正ではない。Drive for Desktop の
ドライブ文字は環境で変わる(G: / I:)し、PCを変えれば当然違う。
探す道具(find_candidates)は前からあったのに、**人が打つ前提**だった。

復帰は速い方から2段:
  ① 末尾パスを手がかりに、実在するドライブへ当てる … 一瞬
  ② それでも駄目なら全走査                        … 数十秒・1プロセス1回だけ

このテストが守るもの:
  1. 設定どおり読めるときは何も探さない(毎回走査したら使い物にならない)
  2. ドライブ文字が変わっただけなら、走査せずに復帰する
  3. 復帰したら設定を書き換える(次から一発で読める)
  4. 全走査は1プロセスで1回だけ
  5. 候補が複数あるときは**自動で決めない**(古い部品DBに繋ぐ方が危険)
  6. 古い設定(末尾パスを持たない)にも、読めたときに後から足す
"""
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
tmp = tempfile.mkdtemp(prefix='ecad_recover_')
os.environ['XDG_DATA_HOME'] = os.path.join(tmp, 'xdg')
os.environ['LOCALAPPDATA'] = os.path.join(tmp, 'local')
sys.path.insert(0, os.path.join(APP, 'tools', 'parts_db'))
import parts_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK   ' if cond else '  NG   ') + msg)
    if not cond:
        ng += 1


def make_db(path, refs):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({'customParts': [{'ref': r} for r in refs], 'hiddenBuiltinRefs': []},
              open(path, 'w', encoding='utf-8'))
    return path


def reset_scan():
    parts_db._scan_done = False
    parts_db._scan_found = []
    parts_db._scan_backups = []


try:
    # 「ドライブ」を2つ作る。I: が消えて G: に変わった、を模す
    drv_old = os.path.join(tmp, 'I')
    drv_new = os.path.join(tmp, 'G')
    tail = os.path.join('マイドライブ', 'カタログDB', 'parts_db.json')
    old_path = make_db(os.path.join(drv_old, tail), ['A', 'B', 'C'])
    parts_db.DRIVE_ROOTS = [drv_old, drv_new]
    parts_db.SCAN_ROOTS = [tmp]

    db = parts_db.PartsDB()
    db.set_path(old_path)

    print('【設定どおり読めるときは探さない】')
    reset_scan()
    p, src = db.resolve()
    ok(p == old_path and src == 'path', f'そのまま読める ({src})')
    ok(parts_db._scan_done is False, '全走査を走らせない')
    ok(parts_db.load_config().get('path_tail') == parts_db.path_tail(old_path),
       '末尾パスが保存されている')

    print('【ドライブ文字が変わっただけなら、走査せずに戻る】')
    print('  ← Drive for Desktop の I: / G: は環境で変わる')
    new_path = make_db(os.path.join(drv_new, tail), ['A', 'B', 'C'])
    shutil.rmtree(drv_old)          # 前のドライブが消えた
    reset_scan()
    p, src = db.resolve()
    ok(p == new_path, f'新しいドライブの同じ場所を見つける ({p})')
    ok(src == 'path_recovered', f'由来が path_recovered ({src})')
    ok(parts_db._scan_done is False, '全走査は走らせない(一瞬で戻る)')
    ok(parts_db.load_config().get('path') == new_path, '設定を書き換える(次から一発)')

    print('【末尾パスを持たない古い設定にも、後から足す】')
    parts_db.save_config({'path': new_path})     # path_tail 無しの古い形
    reset_scan()
    p, src = db.resolve()
    ok(src == 'path', '読めること自体は変わらない')
    ok(parts_db.load_config().get('path_tail'), '末尾パスが足される(次に外れたとき効く)')

    print('【全滅なら全走査。候補が1つなら自動で設定する】')
    moved = make_db(os.path.join(tmp, 'どこか', 'べつの場所', 'parts_db.json'), ['X', 'Y'])
    shutil.rmtree(drv_new)
    parts_db.save_config({'path': new_path, 'path_tail': parts_db.path_tail(new_path)})
    reset_scan()
    p, src = db.resolve()
    ok(p == moved, f'走査で見つける ({p})')
    ok(src == 'path_found', f'由来が path_found ({src})')
    ok(parts_db._scan_done is True, '全走査が走った')
    ok(parts_db.load_config().get('path') == moved, '設定を書き換える')

    print('【全走査は1プロセスで1回だけ】')
    print('  ← 数十秒かかる。ページを開くたびに走らせたら使い物にならない')
    parts_db.save_config({})
    calls = []
    real = parts_db.find_candidates
    parts_db.find_candidates = lambda roots=None: (calls.append(1), real(roots))[1]
    try:
        reset_scan()
        parts_db.PartsDB().resolve()
        parts_db.PartsDB().resolve()
        parts_db.PartsDB().resolve()
        ok(len(calls) == 1, f'3回呼んでも走査は1回 (実際 {len(calls)}回)')
    finally:
        parts_db.find_candidates = real

    print('【候補が複数あるときは自動で決めない】')
    print('  ← 古い部品DBに黙って繋ぐ方が危険。件数付きで出して選んでもらう')
    make_db(os.path.join(tmp, 'もうひとつ', 'parts_db.json'), ['Z'])
    parts_db.save_config({})
    reset_scan()
    p, src = db.resolve()
    ok(p is None, '自動では決めない')
    ok(src == 'unset', f'由来は unset のまま ({src})')
    found, _bk = parts_db.PartsDB.scan_candidates()
    ok(len(found) >= 2, f'候補は覚えている ({len(found)}件)')
    err = db.load()['error']
    ok('候補' in err and 'setpath' in err, '画面に出す文言に候補とsetpathが入る')
    ok(found[0][1] >= found[-1][1], '件数が多い順に並ぶ(空ファイルを先頭に出さない)')

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n失敗 %d 件' % ng if ng else '\nすべて通過')
sys.exit(1 if ng else 0)
