#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部品DBの保存(サーバー側)のテスト

    py tests\\test_parts_db_save.py        (Windows)
    python3 tests/test_parts_db_save.py

【背景・2026-09-02】
部品DB(parts_db.json)の書き手を、ブラウザ(File System Access API)から
tools/parts_db/parts_db.py へ移した。移した理由の1つが「途中で落ちても
ファイルが壊れないようにする」ことなので、**本物のファイルを書いて確かめる**。

FSAの createWritable は開いた瞬間に中身を捨てる。書いている途中で落ちると
parts_db.json が空のまま残り、次の起動で0件になる —— それが起きない形
(tmpに書いてから os.replace)になっているかを、実際にファイルを見て確認する。

このテストが守るもの:
  1. 保存できるのは setpath で設定したファイルだけ。控え(mirror)には保存しない
  2. 件数が激減したら、force が無い限り書かない(ファイルは無傷のまま)
  3. force で書くときは、その前に必ず退避を取る
  4. 書きかけの .tmp を残さない / 壊れた入力でファイルを壊さない
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
    """設定フォルダも部品DBも使い捨てのフォルダに作って試す。

    default_data_dir()(=%LOCALAPPDATA%\\ecad)には絶対に触らない ——
    テストが盛田さんの実データの設定を書き換えたら本末転倒なので、
    PartsDB(data_dir=...) を必ず渡す。
    """

    def __enter__(self):
        self.dir = tempfile.mkdtemp(prefix='ecad_test_')
        self.data_dir = os.path.join(self.dir, 'appdata')
        self.parts_path = os.path.join(self.dir, 'drive', 'parts_db.json')
        os.makedirs(os.path.dirname(self.parts_path))
        self.db = parts_db.PartsDB(data_dir=self.data_dir)
        return self

    def __exit__(self, *a):
        shutil.rmtree(self.dir, ignore_errors=True)

    def put(self, parts):
        with open(self.parts_path, 'w', encoding='utf-8') as f:
            json.dump(body(parts), f, ensure_ascii=False)
        return self

    def setpath(self):
        self.db.set_path(self.parts_path)
        return self

    def leftovers(self):
        d = os.path.dirname(self.parts_path)
        return sorted(n for n in os.listdir(d) if n.endswith('.tmp'))

    def backups(self):
        d = os.path.dirname(self.parts_path)
        return sorted(n for n in os.listdir(d) if n.startswith('parts_db_backup_'))


print('【setpath していなければ、どこにも書かない】')
with Bench() as b:
    # 控え(mirror)がある状態。読むことはできるが、保存先にはならない。
    parts_db.write_mirror(json.dumps(body(mk(5))), b.data_dir)
    eq(b.db.stats()['source'], 'mirror', '控えを読んでいる')
    eq(b.db.stats()['writable'], False, '★控えしか無いときは writable=False')
    res = b.db.save(body(mk(9)))
    eq(res['ok'], False, '保存は失敗を返す')
    eq(res['reason'], 'unset', '理由が分かる形で返る(CADが従来の経路に落ちる判断に使う)')
    eq(len(read(parts_db.mirror_path(b.data_dir))['customParts']), 5,
       '★控えは書き換わっていない(控えは保存先ではない)')

print('\n【設定したファイルに保存できる・書きかけを残さない】')
with Bench() as b:
    b.put(mk(3)).setpath()
    eq(b.db.stats()['writable'], True, 'setpath 済みなら writable=True')
    res = b.db.save(body(mk(4)))
    eq(res['ok'], True, '保存できる')
    eq(res['count'], 4, '件数を返す')
    eq(len(read(b.parts_path)['customParts']), 4, '★ファイルの中身が入れ替わっている')
    eq(b.leftovers(), [], '★.tmp を残さない')
    eq(len(read(parts_db.mirror_path(b.data_dir))['customParts']), 4,
       '控えも同時に更新される(他ソフトが古い件数を見ない)')

    # 保存した内容がそのまま次の読み込みに出る(キャッシュが残らない)
    eq(b.db.stats()['count'], 4, '保存直後の stats が新しい件数を返す')

print('\n【件数が激減したら、確認なしには書かない】')
with Bench() as b:
    b.put(mk(605)).setpath()
    res = b.db.save(body(mk(3)))
    eq(res['ok'], False, '書かずに失敗を返す')
    eq(res['reason'], 'drop', '理由は drop')
    eq((res['prev'], res['now']), (605, 3), '★比較しているのは「今ファイルにある件数」')
    eq(len(read(b.parts_path)['customParts']), 605, '★ファイルは無傷')
    eq(b.backups(), [], 'この時点では退避も作らない(何も起きていない)')

    # 人が「それでも書く」と答えた場合 = force
    res = b.db.save(body(mk(3)), force=True)
    eq(res['ok'], True, 'force なら書く')
    eq(len(read(b.parts_path)['customParts']), 3, 'ファイルが3件になる')
    eq(len(b.backups()), 1, '★書く前に退避を取っている')
    eq(res['backup'], b.backups()[0], '退避の名前を返す(画面に出すため)')
    eq(len(read(os.path.join(os.path.dirname(b.parts_path), b.backups()[0]))['customParts']),
       605, '★退避の中身は「上書きされる前」の605件')

print('\n【1件ずつの削除は普通の操作なので通す】')
with Bench() as b:
    b.put(mk(20)).setpath()
    eq(b.db.save(body(mk(19)))['ok'], True, '20→19 は通る')
    eq(b.db.save(body(mk(11)))['ok'], True, '19→11 は通る(半分以上残っている)')
    eq(b.db.save(body(mk(5)))['reason'], 'drop', '11→5 は止める(半分未満)')
    eq(b.db.save(body([]))['reason'], 'drop', '全消しは止める')
    eq(len(read(b.parts_path)['customParts']), 11, 'ファイルは11件のまま')

print('\n【壊れた入力でファイルを壊さない】')
with Bench() as b:
    b.put(mk(10)).setpath()
    res = b.db.save('これはJSONの中身ではない')
    eq(res['ok'], False, '保存しない')
    eq(res['reason'], 'bad_data', '理由が分かる')
    eq(len(read(b.parts_path)['customParts']), 10, '★ファイルは無傷')
    eq(b.leftovers(), [], '.tmp を残さない')

print('\n【設定したファイルが消えていたら、作り直さない】')
with Bench() as b:
    b.put(mk(10)).setpath()
    os.remove(b.parts_path)
    res = b.db.save(body(mk(10)))
    eq(res['ok'], False, '保存しない')
    eq(res['reason'], 'path_missing', '理由は path_missing')
    ok(not os.path.exists(b.parts_path), '★勝手に作り直さない')
    # ここで新規作成してしまうと、Driveの同期が一時的に外れただけのときに
    # 「同じ場所に別の部品DBができる」。CADは失敗を受けて赤い帯を出す。

print('\n【古い形式(配列だけ)のファイルも扱える】')
with Bench() as b:
    with open(b.parts_path, 'w', encoding='utf-8') as f:
        json.dump(mk(12), f)          # 昔の parts_db.json は配列そのものだった
    b.setpath()
    eq(b.db.stats()['count'], 12, '読める')
    eq(b.db.save(body(mk(12)))['ok'], True, '保存できる')
    eq(sorted(read(b.parts_path).keys()), ['customParts', 'hiddenBuiltinRefs'],
       '保存後は今の形式になる')

print('\n【退避は同じフォルダに書かれる】')
with Bench() as b:
    b.put(mk(30)).setpath()
    res = b.db.backup()
    eq(res['ok'], True, '退避できる')
    ok(res['name'].startswith('parts_db_backup_') and res['name'].endswith('.json'),
       '名前の形は CAD が書いていたものと同じ(find が拾える)')
    eq(os.path.dirname(res['path']), os.path.dirname(b.parts_path),
       '★parts_db.json と同じフォルダに書く(フォルダを選ばせない)')
    eq(len(read(res['path'])['customParts']), 30, '中身は現在のファイルの写し')
    eq(b.leftovers(), [], '.tmp を残さない')

    # 名前は分までしか持たない。同じ分にもう一度退避しても、前のものを消さない
    # ——「作り直しの直前に退避 → 激減の確認でもう一度退避」は実際に起きる流れで、
    # 上書きすると一番戻したい1回目が消える。
    b.put(mk(2))
    res2 = b.db.backup()
    ok(res2['name'] != res['name'], '★同じ分でも別の名前になる')
    eq(len(read(res['path'])['customParts']), 30, '★1回目の退避が残っている')
    eq(len(read(res2['path'])['customParts']), 2, '2回目は今の中身')

print('\n' + (f'失敗 {ng} 件' if ng else 'すべて通過'))
sys.exit(1 if ng else 0)
