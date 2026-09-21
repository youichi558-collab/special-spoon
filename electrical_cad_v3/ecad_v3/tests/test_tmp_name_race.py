# -*- coding: utf-8 -*-
"""同時に書いても一時ファイルが混ざらないことの確認

    py tests/test_tmp_name_race.py

【2026-09-21】server.py を ThreadingHTTPServer にした(起動時にJSが落ちる
問題への対処)。それまでは1度に1リクエストしか動かなかったので、書き込みが
同時に走ることが無く、固定名の `xxx.tmp` に書いて os.replace で置き換える
形で足りていた。

スレッド化すると同じ固定名に2つの書き込みが同時に入りうる。片方が open('w')
でファイルを切り詰めている最中にもう片方が書き続けるため、**1つのファイルに
両方のバイトが混ざり、その壊れたものが os.replace で本体になる**。
os.replace 自体は不可分でも、「書きかけを本体にしない」という元の狙いが破れる。

実測(長さの違う2つを同時に60回書く):
    固定名  → 60回中18回 壊れた/混ざった
    別名    → 0回

そこで tools/*/_tmp_name() で書き手ごと(プロセスID+スレッドID)に別名にした。
このテストは、
  1. _tmp_name() がスレッドごとに違う名前を返すこと
  2. 固定名だと実際に壊れること(対策が要る根拠)
  3. _tmp_name() を使えば壊れないこと
を見る。**固定名に戻すとここが落ちる。**
"""
import json
import os
import sys
import tempfile
import shutil
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for sub in ('parts_db', 'backup', 'catalog_db'):
    sys.path.insert(0, os.path.join(ROOT, 'tools', sub))

ng = 0


def ok(cond, msg):
    global ng
    if cond:
        print('  OK ' + msg)
    else:
        ng += 1
        print('  NG ' + msg)


print('【_tmp_name がスレッドごとに違う名前を返す】')
import parts_db
import backup_store
import catalog_db

names = []
lock = threading.Lock()


def collect():
    n = parts_db._tmp_name('/x/parts_db.json')
    with lock:
        names.append(n)


ths = [threading.Thread(target=collect) for _ in range(20)]
for t in ths:
    t.start()
for t in ths:
    t.join()
ok(len(set(names)) == len(names),
   '20スレッドが全部違う名前を得る (重複 %d件)' % (len(names) - len(set(names))))
ok(all(n.endswith('.tmp') for n in names), '末尾は .tmp のまま')
ok(all(n.startswith('/x/parts_db.json.') for n in names), '元のパスを前に残している')

# 3つのツールが同じ仕掛けを持っていること(1つだけ直し忘れると、そこだけ壊れる)
for mod, nm in ((parts_db, 'parts_db'), (backup_store, 'backup_store'),
                (catalog_db, 'catalog_db')):
    ok(hasattr(mod, '_tmp_name'), '%s に _tmp_name がある' % nm)

print('\n【固定名だと実際に壊れる(対策が要る根拠)】')
d = tempfile.mkdtemp()
target = os.path.join(d, 'parts_db.json')
# 長さを大きく変えるのが要点。同じ長さ・同じ形だと混ざっても正しいJSONになり、
# 壊れたことに気付けない(最初それで「壊れない」と誤判定した)。
BIG = json.dumps({'customParts': [{'ref': 'A' * 60, 'n': i} for i in range(40000)]})
SMALL = json.dumps({'customParts': [{'ref': 'B', 'n': i} for i in range(50)]})


def run(unique, rounds=40):
    bad = 0
    for _ in range(rounds):
        def w(body):
            t = parts_db._tmp_name(target) if unique else target + '.tmp'
            try:
                with open(t, 'w', encoding='utf-8') as f:
                    f.write(body)
                os.replace(t, target)
            except Exception:
                pass
        ts = [threading.Thread(target=w, args=(BIG,)),
              threading.Thread(target=w, args=(SMALL,))]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        try:
            got = json.load(open(target, encoding='utf-8'))
            if len(got['customParts']) not in (40000, 50):
                bad += 1          # どちらでもない = 混ざった
        except Exception:
            bad += 1              # 読めない = 壊れた
    return bad


fixed = run(False)
uniq = run(True)
shutil.rmtree(d, ignore_errors=True)
ok(fixed > 0, '固定名なら壊れる (40回中 %d回)  ← 対策が要る根拠' % fixed)
ok(uniq == 0, '★別名なら壊れない (40回中 %d回)' % uniq)

print('\n【全走査の共有変数に鍵がかかっている】')
src = open(os.path.join(ROOT, 'tools', 'parts_db', 'parts_db.py'),
           encoding='utf-8').read()
ok('_scan_lock' in src, '_scan_lock がある')
ok('with _scan_lock:' in src, '判定と実行をまとめて鍵の中で行っている')

print('\n%d件失敗' % ng if ng else '\n全て成功')
sys.exit(1 if ng else 0)
