#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
catalog_pending/ 内のCSVファイルをスキャンして、各ファイルに何が入っているか
（メーカー・種別・件数・型番一覧）をまとめた INDEX.md を自動生成する。

使い方:
    python3 tools/generate_catalog_index.py

catalog_pending に新しいCSVを追加・削除するたびに実行して INDEX.md を
更新すること（HANDOFF.md の運用ルールにも明記）。
"""
import csv
import os
import sys
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
PENDING_DIR = os.path.join(REPO_ROOT, "catalog_pending")
OUTPUT_PATH = os.path.join(PENDING_DIR, "INDEX.md")

TYPE_LABELS = {
    "coil": "リレーコイル・コンタクタ",
    "sw_no": "a接点",
    "sw_nc": "b接点",
    "breaker": "ブレーカ",
    "motor": "モーター",
    "terminal": "端子台",
    "lamp": "ランプ",
    "fuse": "ヒューズ",
    "transformer": "トランス",
    "option": "増設ユニット等(付属品)",
    "thermal": "サーマルリレー",
    "servo": "サーボアンプ",
    "": "(種別コードなし・新規種別要検討)",
}


def load_csv_rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def summarize_file(path):
    rows = load_csv_rows(path)
    makers = Counter(r[0] for r in rows if len(r) > 0)
    types = Counter(r[2] if len(r) > 2 else "" for r in rows)
    part_numbers = [r[1] for r in rows if len(r) > 1]
    return {
        "count": len(rows),
        "makers": makers,
        "types": types,
        "part_numbers": part_numbers,
        "bad_rows": [i + 1 for i, r in enumerate(rows) if len(r) != 8],
    }


def main():
    if not os.path.isdir(PENDING_DIR):
        print(f"catalog_pending が見つかりません: {PENDING_DIR}", file=sys.stderr)
        sys.exit(1)

    csv_files = sorted(
        f for f in os.listdir(PENDING_DIR) if f.endswith(".csv")
    )

    total_count = 0
    lines = []
    lines.append("# catalog_pending 内容一覧（自動生成）")
    lines.append("")
    lines.append(
        "このファイルは `tools/generate_catalog_index.py` で自動生成されています。"
        "手動で編集しないでください。CSVを追加・削除したら再実行してください。"
    )
    lines.append("")

    file_summaries = []
    for fn in csv_files:
        path = os.path.join(PENDING_DIR, fn)
        try:
            s = summarize_file(path)
        except Exception as e:
            lines.append(f"## ⚠️ {fn}（読み込みエラー: {e}）")
            lines.append("")
            continue
        file_summaries.append((fn, s))
        total_count += s["count"]

    lines.append(f"## 概要（CSVファイル数: {len(csv_files)}件、型番合計: {total_count}件）")
    lines.append("")
    lines.append("| ファイル名 | メーカー | 主な種別 | 件数 |")
    lines.append("|---|---|---|---|")
    for fn, s in file_summaries:
        maker = "・".join(s["makers"].keys())
        type_str = "・".join(
            f"{TYPE_LABELS.get(t, t)}({c})" for t, c in s["types"].most_common()
        )
        flag = " ⚠️列数異常" if s["bad_rows"] else ""
        lines.append(f"| `{fn}` | {maker} | {type_str} | {s['count']}{flag} |")
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## ファイル別 型番一覧")
    lines.append("")
    for fn, s in file_summaries:
        maker = "・".join(s["makers"].keys())
        type_str = "・".join(
            f"{TYPE_LABELS.get(t, t)}" for t in s["types"].keys()
        )
        lines.append(f"### `{fn}`（{maker}／{type_str}／{s['count']}件）")
        if s["bad_rows"]:
            lines.append(
                f"⚠️ 列数が8列でない行があります（行番号: {s['bad_rows']}）。要修正。"
            )
        lines.append("")
        lines.append(", ".join(s["part_numbers"]))
        lines.append("")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"生成しました: {OUTPUT_PATH}")
    print(f"CSVファイル数: {len(csv_files)}件、型番合計: {total_count}件")


if __name__ == "__main__":
    main()
