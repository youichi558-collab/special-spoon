#!/usr/bin/env python3
"""
spec_to_bom.py
----------------
find_spec.py が出力した「項目,値」の縦持ちCSVから、キーワードとパターンで
必要な行を自動的に見つけて、ecad_v3の部品DB一括登録CSV形式
（メーカー,型番,種別,定格電圧,定格電流,端子番号,接点構成,備考）1行に変換する。

使い方:
    python3 spec_to_bom.py <find_spec.pyの出力CSV> <マッピング設定JSON> <メーカー> <型番> <種別> <出力CSV(追記)>

マッピング設定JSON例 (spec_mapping_example.json参照):
{
  "volt_label_contains": "AC-3級",
  "volt_label_excludes": ["インチング", "単相"],
  "amp_label_contains": "AC-3級",
  "amp_label_excludes": ["インチング", "単相"],
  "contacts_label_contains": "標準付属",
  "contacts_label_excludes": ["可逆"],
  "terminals_label_contains": null
}

仕組み:
  - 定格電圧・定格電流は、ラベルに「200～220V」のような電圧表記と
    "3.7/18"のような kW/A 形式の値がセットになっている行を探す想定。
    ラベル中の電圧表記を正規表現で取り出し、値の "/" 以降を電流として使う。
  - それ以外（接点構成・端子番号）は、ラベルにキーワードが含まれる行の
    値をそのまま使う。
  - 複数行を出力に追記していく運用を想定（1型式ずつ実行→同じCSVに追記）。

注意:
  - キーワードに一致する行が複数あった場合は最初に見つかった行を使う。
    想定と違う行が拾われていないか、出力後に必ず確認すること。
  - 表のラベルは三菱・富士などメーカーごと、ページごとに表現が違うので、
    マッピング設定は都度調整が必要。
"""
import sys
import csv
import json
import re
import os


VOLT_PATTERN = re.compile(r'\d{2,4}(?:[～\-]\d{2,4})?\s*V')


def load_spec_rows(spec_csv):
    with open(spec_csv, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        return list(reader)


def find_row(rows, contains, excludes=None):
    excludes = excludes or []
    for row in rows:
        label = row.get('項目', '')
        if contains and contains not in label:
            continue
        if any(ex in label for ex in excludes):
            continue
        yield row


def extract_volt_amp(rows, contains, excludes):
    for row in find_row(rows, contains, excludes):
        label = row.get('項目', '')
        value = row.get('値', '')
        m = VOLT_PATTERN.search(label)
        if m and '/' in value:
            volt = m.group(0).replace(' ', '')
            amp = value.split('/')[-1]
            return volt, amp
    return '', ''


def extract_simple(rows, contains, excludes):
    for row in find_row(rows, contains, excludes):
        return row.get('値', '')
    return ''


def main():
    if len(sys.argv) != 7:
        print(__doc__)
        sys.exit(1)
    spec_csv, mapping_path, maker, model, type_code, output_csv = sys.argv[1:7]

    rows = load_spec_rows(spec_csv)
    with open(mapping_path, encoding='utf-8') as f:
        cfg = json.load(f)

    volt, amp = extract_volt_amp(
        rows,
        cfg.get('volt_label_contains', ''),
        cfg.get('volt_label_excludes', []),
    )
    contacts = extract_simple(
        rows,
        cfg.get('contacts_label_contains', ''),
        cfg.get('contacts_label_excludes', []),
    )
    terminals = extract_simple(
        rows,
        cfg.get('terminals_label_contains') or '',
        cfg.get('terminals_label_excludes', []),
    ) if cfg.get('terminals_label_contains') else ''

    note = f"{model} カタログ自動抽出（find_spec.py + spec_to_bom.py）"

    new_row = [maker, model, type_code, volt, amp, terminals, contacts, note]

    file_exists = os.path.exists(output_csv)
    with open(output_csv, 'a', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(new_row)

    print('抽出結果:')
    print(f'  型番:     {model}')
    print(f'  定格電圧: {volt or "(見つかりませんでした)"}')
    print(f'  定格電流: {amp or "(見つかりませんでした)"}')
    print(f'  接点構成: {contacts or "(見つかりませんでした)"}')
    print(f'  端子番号: {terminals or "(設定なし)"}')
    print(f'\n{output_csv} に1行追記しました。必ず内容を確認してください。')


if __name__ == '__main__':
    main()
