#!/usr/bin/env python3
"""
find_spec.py
--------------
カタログPDF（分割済みでも、分割していない元の大きなPDFでもOK）から、
指定した型式（例: S-T20）を検索し、その型式が載っている表を見つけて、
その型式の列を（結合セル処理込みで）CSVに書き出す。

結合セルの扱い:
  三菱・富士などの機種一覧表は「同じ値が続く場合は1つのセルにまとめて
  表示」されていることが多い（例: 20 32 60 80 のうち20が3フレーム分の
  結合セルになっている）。このスクリプトは「空セルは左隣の値を引き継ぐ」
  というルールで復元する（実データで検証済み: 開放熱電流の行で
  20,20,20,32,32,32,60,80 のような並びが実際の値と一致することを確認済み）。

使い方:
    python3 find_spec.py <PDFファイル or フォルダ> <型式> <出力CSV>

例:
    python3 find_spec.py 電磁開閉器.pdf S-T20 S-T20_spec.csv
    python3 find_spec.py ./三菱電磁開閉器分割/ S-T20 S-T20_spec.csv   ← フォルダ内の全PDFを検索

出力CSV形式:
    ソースファイル,ページ番号,項目,値
    （1つの型式について、表の中の全ての行×その型式の列 の値を出力する）

注意:
    - 型式は完全一致ではなく「セルの文字列に型式の文字列が含まれるか」で
      判定する（例: "S-T20" は "S-T20" にも "MSO-2×T20" のような別セルにも
      一致しない設計。ただし表記ゆれ（全角/半角、スペース）で見つからない
      ことがあるので、見つからない場合は表記を変えて再実行してみてください）
    - 見つかった値は必ず目視で確認してから使ってください。特にこのスクリプト
      が自動復元した結合セルの値（隣接フレームと同じ値の可能性がある列）は
      要注意です。
"""
import sys
import os
import csv

import pdfplumber
from normalize import contains as fuzzy_contains
import catalog_index


def ffill_row(cells):
    """Noneや空文字を左隣の値で埋める（結合セル復元）"""
    out = []
    last = ''
    for v in cells:
        v = (v or '').strip()
        if v == '':
            out.append(last)
        else:
            out.append(v)
            last = v
    return out


def row_label(cells, ncols_label=4):
    """行の左側（ラベル列、通常先頭3〜4列）を結合してラベル文字列を作る"""
    parts = []
    for c in cells[:ncols_label]:
        c = (c or '').strip()
        if c and c not in parts:
            parts.append(c.replace('\n', ' '))
    return ' / '.join(parts)


def search_pdf(pdf_path, model_query, out_rows, ncols_label=4, stop_at_first=False):
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ''
            if not fuzzy_contains(text, model_query):
                continue
            tables = page.find_tables()
            for table in tables:
                rows = table.extract()
                if not rows:
                    continue
                # 型式が含まれる列を探す（結合セル前提でffillしてから探す）
                target_col = None
                for row in rows:
                    filled = ffill_row(row)
                    for ci, val in enumerate(filled):
                        if ci < ncols_label:
                            continue
                        if fuzzy_contains(val, model_query):
                            target_col = ci
                            break
                    if target_col is not None:
                        break
                if target_col is None:
                    continue
                print(f"  一致: {os.path.basename(pdf_path)} page {page_idx} table (列{target_col})")
                for row in rows:
                    filled = ffill_row(row)
                    if target_col >= len(filled):
                        continue
                    label = row_label(row, ncols_label)
                    value = filled[target_col]
                    if not label and not value:
                        continue
                    out_rows.append([os.path.basename(pdf_path), page_idx, label, value])
                if stop_at_first:
                    return True
    return False


def search_model(target, model_query, ncols_label=4, stop_at_first=False):
    """target(PDFファイル or フォルダ)からmodel_queryを検索し、
    [(source_file, page_no, label, value), ...] を返す。サーバーからも呼べるように分離。
    stop_at_first=True の場合、最初に見つかった時点で残りのファイル/ページの検索を打ち切る（高速だが、
    同じ型式が複数ファイル/ページに存在する場合は最初の1件しか拾えない）。

    索引(catalog_index)が作成済みの場合は、型式を含む可能性のあるファイルだけに
    事前に絞り込んでから検索する(値の抽出ロジック自体は変更しない)。
    索引が無い場合は今まで通りフォルダ内の全PDFを対象にする。"""
    if os.path.isdir(target):
        candidate_files = catalog_index.find_candidate_files(target, model_query)
        if candidate_files is not None:
            pdf_files = [os.path.join(target, f) for f in candidate_files]
        else:
            pdf_files = [os.path.join(target, f) for f in sorted(os.listdir(target)) if f.lower().endswith('.pdf')]
    else:
        pdf_files = [target]

    out_rows = []
    for pdf_path in pdf_files:
        try:
            found = search_pdf(pdf_path, model_query, out_rows, ncols_label, stop_at_first)
            if stop_at_first and found:
                break
        except Exception as e:
            print(f"警告: {pdf_path} の処理中にエラー: {e}")
    return out_rows


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    target, model_query, out_csv = sys.argv[1:4]

    out_rows = search_model(target, model_query)

    if not out_rows:
        print(f"「{model_query}」は見つかりませんでした。表記（全角/半角・スペース）を変えて再実行してみてください。")
        return

    with open(out_csv, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['ソースファイル', 'ページ番号', '項目', '値'])
        for r in out_rows:
            w.writerow(r)

    print(f"\n{len(out_rows)}行を {out_csv} に出力しました。内容を確認してください。")


if __name__ == '__main__':
    main()
