#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
append_catalog.py — カタログCSVに行を追記する(Cowork/Claude用)。

■ なぜ専用スクリプトが要るか
メーカー別CSVは将来数千〜数万行に育つ。追記のたびにファイル全体を読み込むと、
コンテキストにも時間にも無駄が出るうえ、うっかり既存行を壊す危険がある。
このスクリプトは**末尾に追記するだけ**で、既存行には一切触らない。

■ 重複について
重複チェックはここではしない。同じ型番が複数回書かれていても、
SQLite構築時(catalog_db.build)に後勝ちのUPSERTで正規化される。
CSVは「追記のみ・重複可」、正規化はDB側、という役割分担にしてある。

■ 使い方
    # 標準入力から(行数が多いときはこちら)
    python append_catalog.py <カタログCSVフォルダ> mitsubishi < new_rows.csv

    # 引数で直接
    python append_catalog.py <カタログCSVフォルダ> omron --row "オムロン,MY2,coil,...,,"

ファイル名は <メーカーキー>.csv になる(例: mitsubishi.csv)。
フォルダを省略すると catalog_db.py の設定値を使う。

■ 検証内容(README_CSV化指示書の絶対厳守事項に対応)
- csv.reader で必ず8列であることを検証してから書き込む
- 8列でない行が1つでもあれば**何も書き込まずに中断**する(部分的な混入を防ぐ)
- 価格らしき列の混入を警告する
"""
import csv
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog_db  # noqa: E402

PRICE_HINTS = ('標準価格', '価格', '円)', '¥')


def validate(text):
    """8列検証。問題があれば (None, エラー一覧) を返す。"""
    rows, errors = [], []
    for i, row in enumerate(csv.reader(io.StringIO(text)), 1):
        if not row or not any(c.strip() for c in row):
            continue
        if len(row) != 8:
            errors.append(f'{i}行目: {len(row)}列です(8列であること)。'
                          f'仕様値の中のカンマは「/」や「・」に置き換えてください: {row[:3]}...')
            continue
        if not row[1].strip():
            errors.append(f'{i}行目: 型番(2列目)が空です')
            continue
        joined = ','.join(row)
        for h in PRICE_HINTS:
            if h in joined:
                errors.append(f'{i}行目: 価格らしき記載「{h}」が含まれています(価格データは登録禁止)')
                break
        rows.append(row)
    return (rows, errors)


def append(csv_dir, maker_key, text):
    path = os.path.join(csv_dir, f'{maker_key}.csv')
    rows, errors = validate(text)
    if errors:
        for e in errors:
            print('エラー:', e, file=sys.stderr)
        print(f'\n{len(errors)}件の問題があるため、何も書き込みませんでした。', file=sys.stderr)
        return 1
    if not rows:
        print('追記する行がありません', file=sys.stderr)
        return 1

    os.makedirs(csv_dir, exist_ok=True)
    exists = os.path.exists(path)
    # 末尾が改行で終わっていない既存ファイルに追記すると行が繋がるので確認する
    need_nl = False
    if exists and os.path.getsize(path) > 0:
        with open(path, 'rb') as f:
            f.seek(-1, os.SEEK_END)
            need_nl = f.read(1) not in (b'\n', b'\r')

    with open(path, 'a', newline='', encoding='utf-8') as f:
        if need_nl:
            f.write('\n')
        w = csv.writer(f, lineterminator='\n')
        for r in rows:
            w.writerow([c.strip() for c in r])

    print(f'{path} に {len(rows)}行を追記しました({"既存に追記" if exists else "新規作成"})')
    print('CAD側は次回起動時(またはDB再構築時)に自動で取り込みます')
    return 0


def _main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    csv_dir = argv[1]
    if csv_dir in ('-', 'default'):
        csv_dir = catalog_db.CatalogDB().csv_dir
        if not csv_dir:
            print('カタログCSVフォルダが未設定です', file=sys.stderr)
            return 1
    maker_key = argv[2]

    if '--row' in argv:
        text = '\n'.join(argv[argv.index('--row') + 1:])
    else:
        text = sys.stdin.read()
    return append(csv_dir, maker_key, text)


if __name__ == '__main__':
    sys.exit(_main(sys.argv))
