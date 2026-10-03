#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部品DBの場所(ライブラリフォルダ)が外れたときのテスト

    py tests\\test_parts_db_recover.py
    python3 tests/test_parts_db_recover.py

【背景】
2026-09-21 盛田さん「なぜ固定パスを使っている、環境が変わったら動かんぞ」。設定の絶対パスは
前に選んだ場所の控えで、同期ソフト(Drive for Desktop等)のドライブ文字は環境で変わる(G: / I:)。
そこで ①ドライブ文字の付け替え ②ディスク全走査 の2段で自動復帰していた。

2026-10-03(再設計の段階1)で②の全走査をやめた。同期ソフトやネットワークの準備前に起動すると
見つからないのは当たり前で、そのときに勝手に探して別の部品DBに繋いだり、数十秒待たせたりするより、
「見つかりません(準備待ちかも)」+「もう一度確かめる」の方がよい(HANDOFF.md「ライブラリの置き場所の再設計」)。
ディスクを探すのは、画面の「探す」を押したときだけ。

このテストが守るもの:
  1. 設定どおり読めるときは何も探さない
  2. ドライブ文字が変わっただけなら付け替えて読み、設定を書き換える(次から一発で読める)
  3. 付け替えでも見つからなければ path_missing を返し、**ディスクを探さない・勝手に設定しない**
  4. 旧形式の設定(path / path_tail)からも付け替えられる
  5. 「探す」(find_candidates)は件数の多い順に返す(押したときだけ使う)
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


def make_db(folder, refs):
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, 'parts_db.json'), 'w', encoding='utf-8') as f:
        json.dump({'customParts': [{'ref': r} for r in refs], 'hiddenBuiltinRefs': []}, f)
    return folder


try:
    # 2つの「ドライブ」を作る。G: に置いた部品DBが、別のPCでは I: に見える状況。
    G = os.path.join(tmp, 'G')
    I = os.path.join(tmp, 'I')
    os.makedirs(G)
    os.makedirs(I)
    parts_db.DRIVE_ROOTS = [G, I]
    scanned = []
    real_find = parts_db.find_candidates
    parts_db.find_candidates = lambda *a, **k: scanned.append(1) or real_find(*a, **k)
    db = parts_db.PartsDB()

    print('【設定どおり読めるときは何も探さない】')
    make_db(os.path.join(G, 'マイドライブ', 'lib'), ['A', 'B'])
    db.set_library(os.path.join(G, 'マイドライブ', 'lib'))
    p, src = db.resolve()
    ok(src == 'path', f'由来は path ({src})')
    ok(parts_db.load_config().get('library_tail') == os.path.join('マイドライブ', 'lib'),
       '設定に末尾(ドライブから下)も入る')
    ok(not scanned, 'ディスクは探さない')

    print('\n【ドライブ文字が変わった(G:→I:)だけなら付け替えて読む】')
    shutil.move(os.path.join(G, 'マイドライブ'), os.path.join(I, 'マイドライブ'))
    p, src = db.resolve()
    ok(src == 'path_recovered', f'由来は path_recovered ({src})')
    ok(p == os.path.join(I, 'マイドライブ', 'lib', 'parts_db.json'), 'I: 側を読む')
    ok(parts_db.load_config().get('library_dir') == os.path.join(I, 'マイドライブ', 'lib'),
       '★設定も書き換わる(次から一発で読める)')
    ok(db.resolve()[1] == 'path', '次は path で読める')
    ok(not scanned, 'ディスクは探していない')

    print('\n【付け替えても見つからなければ、探さずに「見つかりません」を返す】')
    shutil.rmtree(os.path.join(I, 'マイドライブ'))
    make_db(os.path.join(G, '別の場所'), ['Z'])   # 探せば見つかる別の部品DB
    p, src = db.resolve()
    ok(p is None and src == 'path_missing', f'path_missing ({src})')
    ok(not scanned, '★ディスクを探さない(数十秒待たせない・別の部品DBに勝手に繋がない)')
    ok(parts_db.load_config().get('library_dir') == os.path.join(I, 'マイドライブ', 'lib'),
       '★設定は書き換えない(準備ができたら元の場所で読める)')
    err = db.load()['error']
    ok('準備' in err and 'もう一度確かめる' in err, '同期ソフトやネットワークの準備待ちの可能性と「もう一度確かめる」を案内する')

    print('\n【旧形式の設定(path / path_tail)からも付け替えられる】')
    make_db(os.path.join(I, 'old', 'lib'), ['X'])
    parts_db.save_config({'path': os.path.join(G, 'old', 'lib', 'parts_db.json'),
                          'path_tail': os.path.join('old', 'lib', 'parts_db.json')})
    p, src = db.resolve()
    ok(src == 'path_recovered' and p == os.path.join(I, 'old', 'lib', 'parts_db.json'),
       f'旧形式の末尾からも付け替える ({src})')
    cfg = parts_db.load_config()
    ok('path' not in cfg and cfg.get('library_dir') == os.path.join(I, 'old', 'lib'),
       '付け替えたら新形式の設定に書き換わる')

    print('\n【未設定なら探さない】')
    parts_db.save_config({})
    p, src = db.resolve()
    ok(src == 'unset', f'unset ({src})')
    ok(not scanned, '★未設定でもディスクは探さない(以前は起動時に全走査していた)')

    print('\n【「探す」は押したときだけ。件数の多い順】')
    make_db(os.path.join(G, '空'), [])
    found = real_find([tmp])
    ok(len(found) >= 3, f'候補が見つかる ({len(found)}件)')
    ok(found[0][1] >= found[-1][1], '件数が多い順に並ぶ(空ファイルを先頭に出さない)')
    ok(all(os.path.basename(f[0]) == 'parts_db.json' for f in found), 'parts_db.json だけを拾う')

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n' + (f'失敗 {ng} 件' if ng else 'すべて通過'))
sys.exit(1 if ng else 0)
