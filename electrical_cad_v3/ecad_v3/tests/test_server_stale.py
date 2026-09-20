#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「サーバーが古いコードで動いている」の検出のテスト

    py tests\\test_server_stale.py       (Windows)
    python3 tests/test_server_stale.py

【背景・2026-09-20】
`catalog_db.py` の10列対応を入れたあと、盛田さんが「再取込」→「作り直し」を
**4〜5回やっても直らなかった**。原因は `server.py` を起動したまま pull したこと。
`server.py` は起動時に `tools/catalog_db/catalog_db.py` を import してメモリに
持ち続けるので、ファイルを直しても**動いているのは古いコード**のままだった。

盛田さん「毎回再起動は要らないと聞いてるが？いる時は再起動を要請が当たり前だろ」。
そのとおりで、JS・HTML・CSS は pull して F5 すれば効く。Pythonだけが効かない。
**要るときだけこちらから言う**ために、起動時刻と .py の最終更新を比べて帯を出す。

このテストが守るもの:
  1. .py の最終更新を拾える(server.py と tools/ 配下)
  2. __pycache__ を見ない(実行のたびに新しくなるので、常に「古い」と誤報する)
  3. 返すのはリポジトリからの相対パス(絶対パスを画面に出さない)
  4. サーバー側の入口と画面側の呼び出しが両方残っている(片方だけ消すと黙って死ぬ)
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
sys.path.insert(0, APP)
import server  # noqa: E402  (__main__ ガードがあるので import しても起動しない)

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK   ' if cond else '  NG   ') + msg)
    if not cond:
        ng += 1


print('【.py の最終更新を拾える】')
newest, name = server.newest_py()
ok(newest > 0, '最終更新の時刻が取れる')
ok(name.endswith('.py'), f'返るのは .py ({name})')
ok(not os.path.isabs(name), f'絶対パスを返さない ({name})')
ok('\\\\' not in name, 'パス区切りは / に揃える(画面に出すため)')

print('【__pycache__ は見ない】')
print('  ← .pyc の隣に .py が生成されることはないが、走査対象から外れていることを見る')
cache = os.path.join(APP, 'tools', 'catalog_db', '__pycache__')
os.makedirs(cache, exist_ok=True)
trap = os.path.join(cache, '_test_trap.py')
try:
    with open(trap, 'w', encoding='utf-8') as f:
        f.write('# テスト用。__pycache__ の中を拾っていないかを見るだけ\n')
    # 未来の時刻にして「必ず最新」にする
    future = time.time() + 3600
    os.utime(trap, (future, future))
    n2, name2 = server.newest_py()
    ok('__pycache__' not in name2, f'__pycache__ の中を拾わない (拾ったもの: {name2})')
    ok(n2 <= future - 1, '未来の時刻に引きずられない')
finally:
    if os.path.exists(trap):
        os.remove(trap)

print('【古い/新しいの判定】')
ok(server.SERVER_STARTED > 0, '起動時刻が入っている')
t = 1_000_000.0
ok(not server.is_stale(t, t - 10), '起動より古い .py なら「古い」と言わない')
ok(server.is_stale(t, t + 10), '起動より新しい .py なら「古い」と言う')
ok(not server.is_stale(t, t), '同時刻なら誤報しない')
ok(not server.is_stale(t, t + 0.5), '1秒以内の差は誤報しない(pull直後に起動した場合)')
ok(server.is_stale(t, t + 1.5), '1秒を超えたら言う')

print('【入口と呼び出しが両方残っている】')
src = open(os.path.join(APP, 'server.py'), encoding='utf-8').read()
ok("'/api/serverinfo'" in src, 'server.py に /api/serverinfo の入口がある')
ok('def handle_serverinfo' in src, 'server.py に handle_serverinfo がある')
ok('is_stale(SERVER_STARTED' in src, '判定に is_stale を使っている(式を2重に持たない)')
js = open(os.path.join(APP, 'js', 'state.js'), encoding='utf-8').read()
ok("'/api/serverinfo'" in js, 'state.js が /api/serverinfo を呼んでいる')
ok('server-stale-banner' in js, 'state.js が帯を出している')
ok('checkServerFresh' in js and 'DOMContentLoaded' in js, '読み込み時に自分で走る')
for page in ('index.html', 'parts.html'):
    html = open(os.path.join(APP, page), encoding='utf-8').read()
    ok('js/state.js' in html, f'{page} が state.js を読んでいる(帯が出る前提)')

print('\n失敗 %d 件' % ng if ng else '\nすべて通過')
sys.exit(1 if ng else 0)
