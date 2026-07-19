#!/usr/bin/env python3
"""
extract_catalog_tables.py
--------------------------
PDFカタログの指定ページ範囲から表(テーブル)を検出し、生のグリッドのまま
CSVファイルとして書き出す。まずは「どんな表がどこにあるか」を人間が
目で見て確認するための第一段階のツール。

第2段階として build_parts_csv.py で、この生CSV(機種一覧表など)を
部品DB用の一括登録CSV形式(メーカー,型番,種別,定格電圧,定格電流,
端子番号,接点構成,備考)に変換する。

使い方:
    python3 extract_catalog_tables.py <PDFパス> <開始ページ> <終了ページ> <出力ディレクトリ>

例:
    python3 extract_catalog_tables.py 電磁開閉器.pdf 30 31 ./out
    → ./out/page030_table1.csv, page030_text.txt ... のように出力

注意:
    - ページ番号は1始まり（PDFビューアで見えている番号と同じ）
    - 罫線のない表（文字位置だけで表現された表）はうまく検出できないことがある。
      その場合は page{N}_text.txt (レイアウト保持テキスト)を見て手動で
      構造を確認してください。
    - 1ページに複数の表がある場合、table1, table2 ... と連番で出力する。
"""
import sys
import os
import csv

import pdfplumber


def extract_tables(pdf_path: str, start_page: int, end_page: int, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        if start_page < 1 or end_page > total:
            print(f"警告: PDFの総ページ数は{total}です。範囲を確認してください。")
        for page_num in range(start_page, min(end_page, total) + 1):
            page = pdf.pages[page_num - 1]

            # レイアウト保持テキスト（表がうまく検出できない場合の参考用）
            text = page.extract_text(layout=True) or ""
            text_path = os.path.join(out_dir, f"page{page_num:03d}_text.txt")
            with open(text_path, "w", encoding="utf-8") as f:
                f.write(text)

            tables = page.extract_tables()
            if not tables:
                print(f"page {page_num}: 表は検出されませんでした（page{page_num:03d}_text.txt を確認してください）")
                continue

            for i, table in enumerate(tables, start=1):
                out_path = os.path.join(out_dir, f"page{page_num:03d}_table{i}.csv")
                with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
                    writer = csv.writer(f)
                    for row in table:
                        writer.writerow(["" if c is None else str(c).replace("\n", " ") for c in row])
                print(f"page {page_num}: table{i} -> {out_path} ({len(table)}行 x {len(table[0]) if table else 0}列)")


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    pdf_path, start_page, end_page, out_dir = sys.argv[1:5]
    extract_tables(pdf_path, int(start_page), int(end_page), out_dir)


if __name__ == "__main__":
    main()
