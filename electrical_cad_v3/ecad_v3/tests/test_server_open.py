# -*- coding: utf-8 -*-
"""サーバーが待ち受けを始めてからブラウザを開くことの確認

    py tests/test_server_open.py

【2026-09-21】盛田さん「一瞬起動が遅れる感覚はまだあるな、ブラウザに画面に
たどり着かないと一瞬でる」。

原因は start.bat の順番だった:
    start http://localhost:8080     ← ブラウザを先に開く
    py server.py                    ← サーバーはその後

**まだ誰も待ち受けていないポートにブラウザが繋ぎに行っていた。**
Pythonの起動に数百ミリ秒かかるので、その間に繋ぐと「アクセスできません」側に
一瞬振れる。たいてい繋がるのはブラウザ自身の起動の方が遅くて間に合っている
だけで、競争になっていた。

待ち受けを始めたことを確実に知っているのはサーバー自身なので、
`py server.py --open /` の形にして server.py が開くようにした。

【外してはいけない点】
  1. ポートが既に使われている場合も**ブラウザは開く**。start.bat が動いて
     いる状態で「部品DBを開く.bat」を叩くと2つ目のサーバーは起動できずに
     終了するが、既に1つ目が配信しているのでタブは開いてよい。
     従来 .bat 側が先に開いていた挙動を保つため。
  2. ブラウザは**別スレッドで**開く。webbrowser.open() が戻らない環境が
     あり、そこで待つと serve_forever が始まらず、開いたブラウザが応答を
     待ち続ける(順番を直したのに同じ競争が残る)。実際に踏んで気付いた。
  3. .bat は **Shift-JIS(cp932)**。UTF-8 で書き直すと黒い窓の日本語が
     文字化けする。
"""
import ast
import importlib.util
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ng = 0


def ok(cond, msg):
    global ng
    if cond:
        print('  OK ' + msg)
    else:
        ng += 1
        print('  NG ' + msg)


spec = importlib.util.spec_from_file_location('srv_under_test',
                                              os.path.join(ROOT, 'server.py'))
srv = importlib.util.module_from_spec(spec)
sys.modules['srv_under_test'] = srv
spec.loader.exec_module(srv)

print('【--open の解釈】')
for argv, want in ((['--open', '/'], '/'),
                   (['--open', '/parts.html'], '/parts.html'),
                   (['--open=/parts.html'], '/parts.html'),
                   ([], None),
                   (['--open'], None)):
    got = srv.parse_open_arg(argv)
    ok(got == want, '%-26s → %r' % (argv, got))

print('\n【開くURLの組み立て】')
opened = []


class _FakeWB(object):
    @staticmethod
    def open(u):
        opened.append(u)


import builtins
_real = builtins.__import__


def _fake(name, *a, **k):
    if name == 'webbrowser':
        return _FakeWB
    return _real(name, *a, **k)


builtins.__import__ = _fake
try:
    for p in ('/', '/parts.html', 'parts.html', None, ''):
        srv.open_browser(p)
finally:
    builtins.__import__ = _real

ok(opened == ['http://localhost:%d/' % srv.PORT,
              'http://localhost:%d/parts.html' % srv.PORT,
              'http://localhost:%d/parts.html' % srv.PORT],
   '先頭に / が無くても付く。None と空文字では開かない (%d件)' % len(opened))

print('\n【順番: 待ち受けの後・別スレッドで開く】')
src = io.open(os.path.join(ROOT, 'server.py'), encoding='utf-8').read()
tree = ast.parse(src)
main_fn = next(n for n in ast.walk(tree)
               if isinstance(n, ast.FunctionDef) and n.name == 'main')
body = ast.dump(main_fn)
ok('serve_forever' in body, 'main に serve_forever がある')
# open_browser の呼び出しが Thread 経由であること
ok('open_browser' in src.split('threading.Thread')[1].split('\n')[0]
   if 'threading.Thread' in src else False,
   '★ブラウザは別スレッドで開く(serve_forever を待たせない)')
# ポート使用中の経路でも開くこと
inuse = src[src.index('ポート'):src.index('serve_forever')]
ok('open_browser(open_path)' in inuse,
   '★ポートが既に使われている場合もブラウザを開く(部品DBを開く.bat のため)')

print('\n【切断のトレースバックを黙らせる】')
ok('def handle_error' in src, 'handle_error を上書きしている')
for exc in ('BrokenPipeError', 'ConnectionResetError', 'ConnectionAbortedError'):
    ok(exc in src, '%s を静かに扱う' % exc)
ok('super().handle_error' in src, 'それ以外の例外は従来どおり出す(不具合を黙らせない)')

print('\n【.bat の中身と文字コード】')
for name, want in (('start.bat', '--open /'),
                   ('部品DBを開く.bat', '--open /parts.html')):
    path = os.path.join(ROOT, name)
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('cp932')
        enc_ok = True
    except UnicodeDecodeError:
        text, enc_ok = '', False
    ok(enc_ok, '%s は Shift-JIS(cp932) のまま' % name)
    ok(want in text, '%s が %s を渡している' % (name, want))
    ok('start http://' not in text,
       '★%s は先にブラウザを開いていない(順番が戻っていない)' % name)

print(('\n%d件失敗' % ng) if ng else '\n全て成功')
sys.exit(1 if ng else 0)
