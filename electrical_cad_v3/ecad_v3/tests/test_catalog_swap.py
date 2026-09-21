# -*- coding: utf-8 -*-
"""カタログDBの差し替え中でも検索が失敗しないことの確認

    py tests/test_catalog_swap.py

【2026-09-21】server.py を ThreadingHTTPServer にしたことで踏めるように
なった穴を塞いだ記録。

再構築の最後はこうなっていた:

    for ext in ('', '-wal', '-shm'):      # '' = 本体。本体も消していた
        if os.path.exists(p): os.remove(p)
    os.replace(tmp, self.db_path)

os.replace は既存ファイルを**不可分に上書きする**ので本体を消す必要が無く、
消すせいで「本体が存在しない数ミリ秒」をわざわざ作っていた。その隙間に
検索が入ると _connect() の mode=ro が「ファイルが無い」で失敗する。

シングルスレッドだった間は検索要求が再構築の後ろに並ぶだけで踏めなかった。
スレッド化で同時に動くようになり、踏めるようになっていた。

実測(再構築8回の裏で検索を叩き続ける):
    修正前: 1362回中 2件失敗 (FileNotFoundError: カタログDBが未構築です)
    修正後: 1270回中 0件

鍵をかけて順番待ちにする案もあったが、それだと**再構築が終わるまで検索が
数秒固まる**という別の不便を持ち込む。隙間自体を無くせば待ち時間ゼロで済む。
差し替わる瞬間に検索していた場合は古い内容か新しい内容のどちらかが返る
——どちらも正しい内容。

-wal/-shm を**先に**消すのは、あれが古いDBの道連れだから。本体を差し替えた
後に残っていると、新しい本体と古いジャーナルが組み合わさる一瞬ができる。
"""
import os
import shutil
import sys
import tempfile
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'catalog_db'))
import catalog_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    if cond:
        print('  OK ' + msg)
    else:
        ng += 1
        print('  NG ' + msg)


print('【差し替えの手順】')
src = open(os.path.join(ROOT, 'tools', 'catalog_db', 'catalog_db.py'),
           encoding='utf-8').read()
tail = src[src.index('conn.close()', src.index('def build')):]
swap = tail[:tail.index('os.replace(tmp, self.db_path)')]
ok("for ext in ('', '-wal', '-shm')" not in swap,
   "★本体('')を消してから置き換える形に戻っていない")
ok("for ext in ('-wal', '-shm')" in swap,
   '-wal/-shm だけを、置き換えより前に片付けている')
ok('os.replace(tmp, self.db_path)' in tail,
   '本体は os.replace で不可分に差し替える')

print('\n【再構築の裏で検索し続けても失敗しない】')
work = tempfile.mkdtemp()
try:
    csvdir = os.path.join(work, 'csv')
    os.makedirs(csvdir)
    for f in range(4):
        with open(os.path.join(csvdir, 'b%d.csv' % f), 'w', encoding='utf-8') as fp:
            fp.write('メーカー,型番,種別,定格電圧,定格電流,端子番号,接点構成,備考,出典,カタログURL\n')
            for i in range(600):
                fp.write('M%d,REF%d_%d,coil,AC200V,10A,"A1,A2",1a,note,src,http://x\n'
                         % (f, f, i))

    db = catalog_db.CatalogDB(csv_dir=csvdir, data_dir=work)
    db.build()

    stop = threading.Event()
    fail = []
    hits = [0]

    def searcher():
        while not stop.is_set():
            try:
                db.search('REF', '', '', 5)
                hits[0] += 1
            except Exception as e:
                fail.append('%s: %s' % (type(e).__name__, str(e)[:60]))
            time.sleep(0.0005)

    ths = [threading.Thread(target=searcher) for _ in range(6)]
    for t in ths:
        t.start()
    for _ in range(6):
        db.build()
    stop.set()
    for t in ths:
        t.join()

    ok(hits[0] > 100, '検索が実際に走っている (%d回)' % hits[0])
    ok(len(fail) == 0,
       '★再構築6回の裏で検索 %d回 → 失敗 %d件' % (hits[0], len(fail)))
    for f in fail[:3]:
        print('      ', f)
finally:
    shutil.rmtree(work, ignore_errors=True)

print(('\n%d件失敗' % ng) if ng else '\n全て成功')
sys.exit(1 if ng else 0)
