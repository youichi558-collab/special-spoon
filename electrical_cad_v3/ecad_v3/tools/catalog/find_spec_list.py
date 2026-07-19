#!/usr/bin/env python3
"""
find_spec_list.py
--------------------
find_spec.py は「フレームが列になっている」表（三菱の機種一覧表など）向け。
このスクリプトは「1行が1レコードで、上下方向に結合セルがある」表
（富士電機の定格・形式表など、フレームが縦の行のかたまりになっているもの）向け。

表の構造イメージ（富士の例）:
    フレームサイズ | 定格容量[kW] | 定格使用電流[A] | ... | 形式(=商品コード)
    09形[09X]      | 2.2  4  2.7  | 11  9  6        | ... | SC09XA-□10
                   |              |                 | ... | SC09XA-□01
                   |              |                 | ... | SC09XAH-□10
    12形[12X]      | 2.7  5.5     | 13  12          | ... | SC12XA-□10
    ...

上の「09形[09X]」や「2.2」のような値は最初の行にしか書かれておらず、
以降の行（SC09XA-□01など）では空欄（＝上のセルと同じ）になっている。
このスクリプトは「空セルは真上の値を引き継ぐ」（縦方向のffill）で復元し、
指定した型式が含まれる行を丸ごと1レコードとして出力する。

使い方:
    python3 find_spec_list.py <PDFファイル or フォルダ> <型式> <出力CSV> [ヘッダー行数]

例:
    python3 find_spec_list.py 電磁接触器、開閉器-51.pdf SC20XA-□10 SC20XA_spec.csv 3

    ヘッダー行数（省略時3）: 表の一番上、複数行にわたる見出し部分の行数。
    見出しが複数行の結合セルになっている場合、縦方向ffillしてから
    横に連結してラベルを作る。

出力CSV形式:
    ソースファイル,ページ番号,列ラベル,値
    （型式が見つかった行の、全列の値を出力する）

注意:
    - 型式は部分一致。"SC20XA"だけ指定すると、SC20XA-□10とSC20XA-□01の
      両方に一致してその両方を出力するので、完全な型式（例: SC20XA-□10）
      で指定するのがおすすめ。
    - ヘッダー行数の判定は自動化していない（表ごとに見出し行数が違うため）。
      まず出力してみて、ラベルがおかしければヘッダー行数を変えて再実行。
    - 出力は必ず目視で確認すること。
"""
import sys
import os
import csv

import pdfplumber


def get_cell_texts(page, table):
    """セルごとにbboxで正確にテキストを取得した2次元リストを返す"""
    grid = []
    for row in table.rows:
        texts = []
        for c in row.cells:
            if c is None:
                texts.append(None)
                continue
            x0, top, x1, bottom = c
            crop = page.within_bbox((x0, top, x1, bottom))
            t = crop.extract_text()
            texts.append(t.replace('\n', ' ').strip() if t else None)
        grid.append(texts)
    return grid


def vfill_columns(grid):
    """列ごとに縦方向(上から下)のffillを行う"""
    if not grid:
        return grid
    ncols = max(len(r) for r in grid)
    last = [''] * ncols
    out = []
    for row in grid:
        new_row = []
        for ci in range(ncols):
            v = row[ci] if ci < len(row) else None
            v = (v or '').strip()
            if v == '':
                new_row.append(last[ci])
            else:
                new_row.append(v)
                last[ci] = v
        out.append(new_row)
    return out


def build_header_labels(grid, header_rows):
    """先頭header_rows行を縦にffillしてから、列ごとに縦連結してラベルにする"""
    header_part = vfill_columns(grid[:header_rows])
    ncols = max(len(r) for r in header_part) if header_part else 0
    labels = []
    for ci in range(ncols):
        parts = []
        for row in header_part:
            v = row[ci] if ci < len(row) else ''
            if v and v not in parts:
                parts.append(v)
        labels.append(' / '.join(parts) if parts else f'列{ci}')
    return labels


def search_pdf(pdf_path, model_query, header_rows, out_rows):
    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ''
            if model_query not in text:
                continue
            tables = page.find_tables()
            for table in tables:
                grid = get_cell_texts(page, table)
                if len(grid) <= header_rows:
                    continue
                labels = build_header_labels(grid, header_rows)
                data = vfill_columns(grid[header_rows:])
                for row in data:
                    if any(model_query in (v or '') for v in row):
                        print(f"  一致: {os.path.basename(pdf_path)} page {page_idx}")
                        for ci, val in enumerate(row):
                            label = labels[ci] if ci < len(labels) else f'列{ci}'
                            out_rows.append([os.path.basename(pdf_path), page_idx, label, val])
                        out_rows.append([os.path.basename(pdf_path), page_idx, '---', '---'])


def search_model(target, model_query, header_rows=3):
    """target(PDFファイル or フォルダ)からmodel_queryを検索し、
    [(source_file, page_no, label, value), ...] を返す。サーバーからも呼べるように分離。"""
    if os.path.isdir(target):
        pdf_files = [os.path.join(target, f) for f in sorted(os.listdir(target)) if f.lower().endswith('.pdf')]
    else:
        pdf_files = [target]

    out_rows = []
    for pdf_path in pdf_files:
        try:
            search_pdf(pdf_path, model_query, header_rows, out_rows)
        except Exception as e:
            print(f"警告: {pdf_path} の処理中にエラー: {e}")
    return out_rows


def main():
    if len(sys.argv) not in (4, 5):
        print(__doc__)
        sys.exit(1)
    target, model_query, out_csv = sys.argv[1:4]
    header_rows = int(sys.argv[4]) if len(sys.argv) == 5 else 3

    out_rows = search_model(target, model_query, header_rows)

    if not out_rows:
        print(f"「{model_query}」は見つかりませんでした。ヘッダー行数を変えるか、表記を変えて再実行してみてください。")
        return

    with open(out_csv, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['ソースファイル', 'ページ番号', '列ラベル', '値'])
        for r in out_rows:
            w.writerow(r)

    print(f"\n{out_csv} に出力しました。内容を確認してください。")


if __name__ == '__main__':
    main()
