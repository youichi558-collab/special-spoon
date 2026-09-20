#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""図面バックアップ(ファイル世代)のテスト

    py tests\\test_backup_rotate.py       (Windows)
    python3 tests/test_backup_rotate.py

【背景・2026-09-20】
盛田さん「自動保存とは別に何かのタイミングでどっかにファイル保存する仕組みが
要るかもな。件数ある程度たまったら削除していくような」。

ブラウザ内の「自動保存」は現行＋1世代前しか持たない。2026-08-23に図面が
全部消えた事故では、JSONファイルさえあれば復旧できた。そこで他のCADにある
「一定時間ごとにファイルへ控えを取り、件数が溜まったら古いものから消す」
仕組みを足した。

**古いものを消す処理**なので、間違えると控えそのものを失う。
本物のファイルを書いて、実際に何が残って何が消えたかを見る。

このテストが守るもの:
  1. 件数は図面ごとに数える(A図面を触り続けてB図面の控えが消えない)
  2. 消すのは自分が作った名前のファイルだけ。人が置いたファイルに触らない
  3. 書きかけの .tmp を残さない
  4. backup/ の外のファイルを読ませない(名前にパスや .. が混ざったもの)
  5. 図面名に使えない文字が混ざっても安全な名前になる
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', 'tools', 'backup'))
import backup_store  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    if cond:
        print('  OK', msg)
    else:
        ng += 1
        print('  NG', msg)


def data(n):
    return {'version': 2, 'pages': [{'name': 'S1',
            'elements': [{'id': 'e%d' % i} for i in range(n)], 'wires': []}]}


def names(d):
    return sorted(os.listdir(d))


tmp = tempfile.mkdtemp(prefix='ecad_bk_')
try:
    store = backup_store.BackupStore(tmp)

    print('【件数は図面ごとに数える】')
    print('  ← A図面を触り続けたせいでB図面の控えが全部消える、を起こさない')
    for i in range(5):
        store.save(data(10), name='A図面', keep=3, stamp='2026092%d_120000' % i)
    for i in range(2):
        store.save(data(10), name='B図面', keep=3, stamp='2026092%d_130000' % i)
    got = names(tmp)
    a = [n for n in got if n.startswith('A図面_')]
    b = [n for n in got if n.startswith('B図面_')]
    ok(len(a) == 3, 'A図面は新しい3件だけ残る（実際 %d 件）' % len(a))
    ok(len(b) == 2, 'B図面は2件とも残る（実際 %d 件）' % len(b))
    ok('A図面_20260924_120000.json' in a, 'Aの最新が残っている')
    ok('A図面_20260920_120000.json' not in a, 'Aの一番古いものが消えている')

    print('【人が置いたファイルには触らない】')
    mine = os.path.join(tmp, 'だいじなメモ.txt')
    with open(mine, 'w', encoding='utf-8') as f:
        f.write('触るな')
    other = os.path.join(tmp, 'A図面.json')          # タイムスタンプが無い＝自分の形ではない
    with open(other, 'w', encoding='utf-8') as f:
        f.write('{}')
    for i in range(5):
        store.save(data(10), name='A図面', keep=1, stamp='2026093%d_120000' % i)
    ok(os.path.exists(mine), '関係ないファイルが残っている')
    ok(os.path.exists(other), '自分の名前の形でないJSONも残っている')
    ok(len([n for n in names(tmp) if n.startswith('A図面_')]) == 1, 'keep=1でAは1件だけになる')
    ok(all(not n.endswith('.tmp') for n in names(tmp)), '書きかけの .tmp が残っていない')

    print('【一覧は自分が作ったものだけ、新しい順】')
    lst = store.list()
    ok(all('_' in f['name'] for f in lst['files']), '一覧に自分の形のものだけが出る')
    ok(lst['files'] == sorted(lst['files'], key=lambda x: x['stamp'], reverse=True),
       '新しい順に並んでいる')
    ok(not any(f['name'] in ('だいじなメモ.txt', 'A図面.json') for f in lst['files']),
       '関係ないファイルは一覧に出ない')

    print('【中身がそのまま読み戻せる】')
    r = store.save(data(7), name='C図面', keep=5, stamp='20260920_150000')
    ok(r['ok'], '保存できる')
    g = store.get(r['file'])
    ok(g['ok'], '読み出せる')
    ok(len(g['data']['pages'][0]['elements']) == 7, '要素7個がそのまま戻る')

    print('【backup/ の外は読ませない】')
    for bad in ['../server.py', '..\\server.py', '/etc/passwd', 'A図面_20260920_120000.json/../../x',
                'server.py', '', None, 123]:
        res = store.get(bad)
        ok(not res.get('ok'), '読ませない: %r' % (bad,))

    print('【図面名に使えない文字が混ざっても安全な名前になる】')
    r2 = store.save(data(3), name='../../危ない:名前*?', keep=5, stamp='20260920_160000')
    ok(r2['ok'], '保存できる')
    ok(os.path.dirname(os.path.abspath(os.path.join(tmp, r2['file']))) == os.path.abspath(tmp),
       'backup/ の直下に書かれる（外に出ない）')
    ok(not any(c in r2['file'] for c in '\\/:*?"<>|'), '禁止文字が名前に残らない: %s' % r2['file'])

    print('【空・壊れた入力でファイルを壊さない】')
    before = names(tmp)
    ok(not store.save(None, name='C図面')['ok'], 'None は保存しない')
    ok(names(tmp) == before, 'フォルダの中身が変わらない')

    print('【keep の値がおかしくても落ちない】')
    for k in [0, -5, 'あ', None, 10 ** 9]:
        res = store.save(data(2), name='D図面', keep=k, stamp='20260921_%06d' % (abs(hash(str(k))) % 240000))
        ok(res['ok'], 'keep=%r でも保存できる' % (k,))
    ok(len([n for n in names(tmp) if n.startswith('D図面_')]) >= 1, 'D図面が少なくとも1件残る')

finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n失敗 %d 件' % ng if ng else '\nすべて通過')
sys.exit(1 if ng else 0)
