#!/usr/bin/env python3
"""
build_parts_csv.py
--------------------
extract_catalog_tables.py で出力した生CSV(機種一覧表など、1行目が
フレーム/型式コードの並び、以降の行が定格電圧・定格電流・接点構成
などの属性行になっている表)を、ecad_v3の部品DB一括登録CSV形式
（メーカー,型番,種別,定格電圧,定格電流,端子番号,接点構成,備考）に変換する。

三菱電機の「機種一覧表」のような、横に型式(フレームサイズ)が並び、
縦に属性（定格容量・定格電流・補助接点など）が並ぶ表を主な対象とする。
他メーカー・他レイアウトの場合はマッピング設定(JSON)を調整すること。

使い方:
    python3 build_parts_csv.py <入力CSV> <マッピング設定JSON> <出力CSV>

マッピング設定JSON例 (mapping_example.json参照):
{
  "maker": "三菱電機",
  "type": "breaker",
  "model_row_label": "形　名",       // 型番が並ぶ行の、1列目のラベル文字列(部分一致)
  "model_row_index": null,           // ラベルで見つからない場合はここに0始まり行番号を指定
  "volt_row_label": "定格使用電圧",
  "amp_row_label": "定格使用電流",
  "contacts_row_label": "補助接点",
  "terminals_row_label": null,
  "note": "MS-T/Nシリーズ カタログp.30-31より",
  "skip_columns": [0]                // 型番以外の列（見出し列など）
}

注意:
    - 表がページをまたぐ場合（今回のp.30/p.31のように）は、2つのCSVの
      対応する行を手動で横に連結してから使うか、本スクリプトを2回実行して
      出力CSVを結合してください。
    - 値が「－」「ー」などの製作範囲外を示す記号の列はスキップします。
    - 抽出結果は必ず目視で確認してください。特に定格電流・電圧は
      安全に関わるため、誤りがあると事故につながります。
"""
import sys
import csv
import json


NA_MARKERS = {"", "－", "ー", "-", "―", "None"}


def find_row(rows, label_substr):
    if not label_substr:
        return None
    for row in rows:
        if row and label_substr in row[0]:
            return row
    return None


def build_csv(input_csv: str, mapping_path: str, output_csv: str):
    with open(input_csv, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    with open(mapping_path, encoding="utf-8") as f:
        cfg = json.load(f)

    model_row = None
    if cfg.get("model_row_label"):
        model_row = find_row(rows, cfg["model_row_label"])
    if model_row is None and cfg.get("model_row_index") is not None:
        model_row = rows[cfg["model_row_index"]]
    if model_row is None:
        raise ValueError("型番が並ぶ行が見つかりませんでした。model_row_label / model_row_index を確認してください。")

    def get_row(key):
        label = cfg.get(key)
        return find_row(rows, label) if label else None

    volt_row = get_row("volt_row_label")
    amp_row = get_row("amp_row_label")
    contacts_row = get_row("contacts_row_label")
    terminals_row = get_row("terminals_row_label")

    skip_cols = set(cfg.get("skip_columns", [0]))
    maker = cfg.get("maker", "")
    type_code = cfg.get("type", "")
    note = cfg.get("note", "")

    out_rows = []
    for col_idx, model in enumerate(model_row):
        if col_idx in skip_cols:
            continue
        model = (model or "").strip()
        if model in NA_MARKERS:
            continue

        def cell(row):
            if row is None or col_idx >= len(row):
                return ""
            v = (row[col_idx] or "").strip()
            return "" if v in NA_MARKERS else v

        out_rows.append([
            maker,
            model,
            type_code,
            cell(volt_row),
            cell(amp_row),
            cell(terminals_row),
            cell(contacts_row),
            note,
        ])

    with open(output_csv, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        for r in out_rows:
            writer.writerow(r)

    print(f"{len(out_rows)}件の部品を {output_csv} に出力しました。")
    print("必ず内容を確認してから ecad_v3 の「CSV一括登録」に貼り付けてください。")


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    build_csv(sys.argv[1], sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    main()
