#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部品DBの保存(サーバー側)のテスト

    py tests\\test_parts_db_save.py        (Windows)
    python3 tests/test_parts_db_save.py

【背景】
2026-09-02 に部品DB(parts_db.json)の書き手をブラウザから tools/parts_db/parts_db.py へ移した。
2026-10-03 に部品DBを**ライブラリフォルダ**に置く形にし、控え(mirror)をやめ、
「読んだ後に他で保存されていたら書かない(版の確認)」と「保存のたびに世代バックアップ」を入れた
(HANDOFF.md「ライブラリの置き場所の再設計」段階1)。**本物のファイルを書いて確かめる。**

このテストが守るもの:
  1. 場所が未設定・見つからないなら、どこにも書かない(勝手に作らない)
  2. 読んだ時点の版と違えば書かない(force でも通さない)
  3. 件数が激減したら、force が無い限り書かない
  4. 書く前に必ず backup/ へ世代を残し、古いものから消す(自分の作った名前だけ)
  5. 書きかけの .tmp を残さない / 壊れた入力でファイルを壊さない
  6. フォルダを選んで部品DBが無ければ、頼まれたときだけ空で作る。既にあるファイルには書かない
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', 'tools', 'parts_db'))
import parts_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    if cond:
        print('  OK', msg)
    else:
        ng += 1
        print('  NG', msg)


def eq(a, b, msg):
    ok(a == b, msg if a == b else f'{msg} 期待 {b!r} 実際 {a!r}')


def mk(n):
    return [{'ref': f'P{i}', 'maker': 'M'} for i in range(n)]


def body(parts):
    return {'customParts': parts, 'hiddenBuiltinRefs': []}


def read(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


class Bench:
    """設定フォルダもライブラリも使い捨てのフォルダに作って試す。

    default_data_dir()(=%LOCALAPPDATA%\\ecad)には絶対に触らない ——
    テストが盛田さんの実データの設定を書き換えたら本末転倒なので、
    PartsDB(data_dir=...) を必ず渡す。
    """

    def __enter__(self):
        self.dir = tempfile.mkdtemp(prefix='ecad_test_')
        self.data_dir = os.path.join(self.dir, 'appdata')
        self.lib = os.path.join(self.dir, 'drive', 'lib')
        self.parts_path = os.path.join(self.lib, 'parts_db.json')
        os.makedirs(self.lib)
        self.db = parts_db.PartsDB(data_dir=self.data_dir)
        return self

    def __exit__(self, *a):
        shutil.rmtree(self.dir, ignore_errors=True)

    def put(self, parts):
        with open(self.parts_path, 'w', encoding='utf-8') as f:
            json.dump(body(parts), f, ensure_ascii=False)
        return self

    def setlib(self):
        self.db.set_library(self.lib)
        return self

    def ver(self):
        return self.db.load()['version']

    def save(self, parts, **kw):
        kw.setdefault('base_version', self.ver())
        return self.db.save(body(parts) if isinstance(parts, list) else parts, **kw)

    def leftovers(self):
        return sorted(n for n in os.listdir(self.lib) if n.endswith('.tmp'))

    def backups(self):
        d = os.path.join(self.lib, 'backup')
        return sorted(os.listdir(d)) if os.path.isdir(d) else []


print('【場所が未設定なら、どこにも書かない】')
with Bench() as b:
    st = b.db.stats()
    eq(st['source'], 'unset', '未設定')
    eq(st['writable'], False, 'writable=False')
    res = b.db.save(body(mk(9)), base_version='x')
    eq(res['ok'], False, '保存は失敗を返す')
    eq(res['reason'], 'unset', '理由が分かる形で返る')
    ok(not os.path.exists(b.parts_path), '★勝手に作らない')

print('\n【旧形式の設定(path=parts_db.json のフルパス)はフォルダとして読み替える】')
with Bench() as b:
    b.put(mk(3))
    parts_db.save_config({'path': b.parts_path}, b.data_dir)
    eq(b.db.configured_dir(), b.lib, 'ファイルのあるフォルダがライブラリになる')
    eq(b.db.stats()['count'], 3, 'そのまま読める(設定し直さなくてよい)')
    parts_db.save_config({'path': os.path.join(b.lib, 'other.json')}, b.data_dir)
    eq(b.db.configured_dir(), '', 'ファイル名が parts_db.json でなければ読み替えない(未設定扱い)')

print('\n【フォルダを選ぶ: 部品DBが無ければ、頼まれたときだけ空で作る】')
with Bench() as b:
    try:
        b.db.set_library(b.lib)
        ok(False, '部品DBの無いフォルダは create なしでは設定しない')
    except FileNotFoundError:
        ok(True, '部品DBの無いフォルダは create なしでは設定しない(画面が「作りますか？」と聞く)')
    ok(not os.path.exists(b.parts_path), 'この時点では作らない')
    b.db.set_library(b.lib, create=True)
    eq(read(b.parts_path), body([]), '★頼まれたら空の部品DBを作る')
    eq(b.db.stats()['source'], 'path', '設定される')
    b.put(mk(7))
    b.db.set_library(b.lib, create=True)
    eq(len(read(b.parts_path)['customParts']), 7, '★既にある部品DBには書かない(create=Trueでも中身はそのまま)')
    try:
        b.db.set_library(os.path.join(b.dir, '無いフォルダ'))
        ok(False, '無いフォルダは設定しない')
    except FileNotFoundError:
        ok(True, '無いフォルダは設定しない')

print('\n【設定したフォルダに保存できる・世代バックアップ・書きかけを残さない】')
with Bench() as b:
    b.put(mk(3)).setlib()
    eq(b.db.stats()['writable'], True, '設定済みなら writable=True')
    v0 = b.ver()
    res = b.save(mk(4))
    eq(res['ok'], True, '保存できる')
    eq(res['count'], 4, '件数を返す')
    eq(len(read(b.parts_path)['customParts']), 4, '★ファイルの中身が入れ替わっている')
    eq(b.leftovers(), [], '★.tmp を残さない')
    eq(len(b.backups()), 1, '★保存の前に backup/ へ世代を残す')
    eq(len(read(os.path.join(b.lib, 'backup', b.backups()[0]))['customParts']), 3,
       '★世代の中身は「上書きされる前」の3件')
    ok(res['version'] and res['version'] != v0, '新しい版を返す(画面は次の保存でこれを送る)')
    eq(b.db.stats()['count'], 4, '保存直後の stats が新しい件数を返す')
    ok(not os.path.exists(os.path.join(b.data_dir, 'parts_db_mirror.json')), '控え(mirror)はもう作らない')

print('\n【読んだ後に他で保存されていたら書かない(版の確認)】')
with Bench() as b:
    b.put(mk(3)).setlib()
    v_old = b.ver()
    b.put(mk(5))   # 別のPC・別の画面が保存した
    res = b.db.save(body(mk(4)), base_version=v_old)
    eq(res['ok'], False, '書かない')
    eq(res['reason'], 'conflict', '理由は conflict')
    eq(len(read(b.parts_path)['customParts']), 5, '★相手が保存した5件が残っている')
    res = b.db.save(body(mk(4)), base_version=v_old, force=True)
    eq(res['reason'], 'conflict', '★force(件数激減の確認)でも通さない')
    res = b.db.save(body(mk(4)))
    eq(res['reason'], 'conflict', '版を送ってこない(古い画面)なら書かない')
    eq(b.backups(), [], '書かなかったときは世代も作らない')
    # 中身が同じなら更新日時だけ変わっても版は同じ(同期ソフトが日時だけ触る場合)
    v = b.ver()
    os.utime(b.parts_path, (1, 1))
    eq(b.ver(), v, '★中身が同じなら更新日時が変わっても同じ版(同期ソフトで誤って止まらない)')

print('\n【件数が激減したら、確認なしには書かない】')
with Bench() as b:
    b.put(mk(605)).setlib()
    res = b.save(mk(3))
    eq(res['ok'], False, '書かずに失敗を返す')
    eq(res['reason'], 'drop', '理由は drop')
    eq((res['prev'], res['now']), (605, 3), '★比較しているのは「今ファイルにある件数」')
    eq(len(read(b.parts_path)['customParts']), 605, '★ファイルは無傷')
    res = b.save(mk(3), force=True)
    eq(res['ok'], True, 'force なら書く')
    eq(len(read(b.parts_path)['customParts']), 3, 'ファイルが3件になる')
    eq(len(read(os.path.join(b.lib, 'backup', b.backups()[-1]))['customParts']),
       605, '★世代に「上書きされる前」の605件が残っている')

print('\n【1件ずつの削除は普通の操作なので通す】')
with Bench() as b:
    b.put(mk(20)).setlib()
    eq(b.save(mk(19))['ok'], True, '20→19 は通る')
    eq(b.save(mk(11))['ok'], True, '19→11 は通る(半分以上残っている)')
    eq(b.save(mk(5))['reason'], 'drop', '11→5 は止める(半分未満)')
    eq(b.save([])['reason'], 'drop', '全消しは止める')
    eq(len(read(b.parts_path)['customParts']), 11, 'ファイルは11件のまま')

print('\n【世代バックアップは30個まで。自分の作った名前だけ消す】')
with Bench() as b:
    b.put(mk(10)).setlib()
    bk = os.path.join(b.lib, 'backup')
    os.makedirs(bk)
    for i in range(35):
        with open(os.path.join(bk, f'parts_db_20200101_0000{i:02d}.json'), 'w') as f:
            f.write('{}')
    with open(os.path.join(bk, '盛田さんのメモ.json'), 'w') as f:
        f.write('{}')
    eq(b.save(mk(11))['ok'], True, '保存できる')
    names = b.backups()
    eq(len([n for n in names if n.startswith('parts_db_')]), parts_db.BACKUP_KEEP, '★世代は30個に揃う')
    ok('parts_db_20200101_000000.json' not in names, '古いものから消す')
    ok('盛田さんのメモ.json' in names, '★人が置いたファイルは消さない')

print('\n【壊れた入力でファイルを壊さない】')
with Bench() as b:
    b.put(mk(10)).setlib()
    res = b.save('これはJSONの中身ではない')
    eq(res['ok'], False, '保存しない')
    eq(res['reason'], 'bad_data', '理由が分かる')
    eq(len(read(b.parts_path)['customParts']), 10, '★ファイルは無傷')
    eq(b.leftovers(), [], '.tmp を残さない')

print('\n【設定したフォルダが消えていたら、作り直さない】')
with Bench() as b:
    b.put(mk(10)).setlib()
    v = b.ver()
    shutil.rmtree(b.lib)
    st = b.db.stats()
    eq(st['source'], 'path_missing', '理由は path_missing')
    ok('準備' in st['error'], '同期ソフトやネットワークの準備待ちの可能性を案内する')
    res = b.db.save(body(mk(10)), base_version=v)
    eq(res['ok'], False, '保存しない')
    ok(not os.path.exists(b.parts_path), '★勝手に作り直さない')
    # ここで作ってしまうと、同期が一時的に外れただけのときに「同じ場所に別の部品DBができる」

print('\n【古い形式(配列だけ)のファイルも扱える】')
with Bench() as b:
    with open(b.parts_path, 'w', encoding='utf-8') as f:
        json.dump(mk(12), f)          # 昔の parts_db.json は配列そのものだった
    b.setlib()
    eq(b.db.stats()['count'], 12, '読める')
    eq(b.save(mk(12))['ok'], True, '保存できる')
    eq(sorted(read(b.parts_path).keys()), ['customParts', 'hiddenBuiltinRefs'],
       '保存後は今の形式になる')

print('\n【退避(カタログ全件で作り直す前)も backup/ に書く】')
with Bench() as b:
    b.put(mk(30)).setlib()
    res = b.db.backup()
    eq(res['ok'], True, '退避できる')
    ok(res['name'].startswith('backup/parts_db_'), '名前を返す(画面に出すため)')
    res2 = b.db.backup()
    ok(res2['name'] != res['name'], '★同じ秒でも別の名前になる(1回目を消さない)')
    eq(len(b.backups()), 2, '2つ残る')
    eq(b.leftovers(), [], '.tmp を残さない')

print('\n' + (f'失敗 {ng} 件' if ng else 'すべて通過'))
sys.exit(1 if ng else 0)
