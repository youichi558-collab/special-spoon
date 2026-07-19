# カタログPDF → 部品DB CSV 変換ツール

メーカーPDFカタログから ecad_v3 の「部品DB CSV一括登録」形式
（メーカー,型番,種別,定格電圧,定格電流,端子番号,接点構成,備考）を作るための2段階ツール。

## 前提

- Python3 + `pdfplumber`（`pip install pdfplumber --break-system-packages`）
- 実際のPDFファイル（三菱ブレーカー総合カタログ.pdf、電磁開閉器.pdf など）がローカルにあること
  ※ Google Driveの表示ページからは実行できません。ローカルにダウンロードしてから使ってください。

## 手順

### 1. 表がありそうなページを抽出して中身を確認する

```
python3 extract_catalog_tables.py 電磁開閉器.pdf 30 31 ./out
```

- `30 31` はページ範囲（PDFビューアの表示ページ番号と同じ、1始まり）
- `./out` に `page030_table1.csv`（検出できた表）と `page030_text.txt`（レイアウト保持テキスト）が出力される
- 表が罫線で区切られていないと自動検出できないことがある。その場合は `_text.txt` を見て、
  どの行にどの情報（型番／電圧／電流／接点構成）があるか確認する

### 2. マッピング設定を書いて、部品DB CSVに変換する

`mapping_example.json` をコピーして、実際の表の行ラベルに合わせて書き換える。

```json
{
  "maker": "三菱電機",
  "type": "breaker",
  "model_row_label": "形　名",
  "volt_row_label": "定格使用電圧",
  "amp_row_label": "定格使用電流",
  "contacts_row_label": "補助接点",
  "note": "MS-T/Nシリーズ カタログp.30-31より"
}
```

- `*_row_label` は、その行の1列目に書かれているラベル文字列の一部（部分一致）
- `type` は ecad_v3側の種別コード: `coil` / `sw_no` / `sw_nc` / `breaker` / `motor` / `terminal` / `lamp` / `fuse` / `transformer`

```
python3 build_parts_csv.py ./out/page030_table1.csv mapping_mitsubishi.json parts_mitsubishi.csv
```

- 出力される `parts_mitsubishi.csv` をそのまま ecad_v3 の「部品登録」パネル下部の
  「CSV一括登録」欄に貼り付ければOK

## 注意（安全に関わる部分）

- **出力されたCSVは必ず目視で確認してから登録してください。** 特に定格電流・定格電圧は
  誤って登録すると製作ミスや事故につながります。
- 表がページをまたぐ場合（フレームの数が多く2ページに分かれる等）は、2回抽出して
  出力CSVを結合するか、生CSVを手動で1つに結合してから `build_parts_csv.py` を実行してください。
- メーカーやカタログのページによって表のレイアウトはバラバラです。1つのマッピング設定で
  全ページに対応できるとは限らないので、ページごとに調整が必要です。
- 罫線なしの表（文字の位置だけで表現された表）はpdfplumberでは自動検出できないことが
  多いです。この場合はスクリプトでの自動化を諦め、手動でCSVを作るか、該当ページの
  画像を見ながら私（Claude）に直接データを渡してもらえれば、そこから変換します。

---

## CAD画面からの検索（server.py連携）

このフォルダ内の find_spec.py / find_spec_list.py は、ecad_v3 の `server.py` から
直接呼び出せるようになっています（`search_model()` 関数として import される）。

### セットアップ

1. リポジトリ直下の `catalog_config.json` を開き、実際のカタログPDF（またはフォルダ）の
   パスに書き換える（Windowsパスは `\\` でエスケープすること）。
   ```json
   {
     "catalog_paths": {
       "三菱電磁開閉器": "C:\\Users\\your_name\\Downloads\\三菱電磁開閉器分割",
       "富士SC-NEXT": "C:\\Users\\your_name\\Downloads\\電磁接触器・電磁開閉器SC-NEXT分割"
     }
   }
   ```
2. `pip install pdfplumber --break-system-packages`（初回のみ）
3. `start.bat` で起動（内部で `server.py` を使うように変更済み。中身は静的ファイル
   配信＋`/api/search`検索APIのローカルサーバー）
4. CAD画面の「部品登録」パネルを開くと「カタログ型式検索」欄がある。カタログ・表の形式
   （三菱タイプ/富士タイプ）・型式を選んで「検索」

### 注意

- `catalog_config.json` は個人のPC上のパスを書くので、gitで共有する場合は各自の環境に
  合わせて書き換えること（パスが違う場合はカタログが見つからないエラーになるだけで、
  CAD自体の動作には影響しない）
- 検索結果からは今のところ「型式のみ」をCSV欄に追記する（値は結合セルの解釈が
  カタログごとに違うため、安全のため自動転記せず目視で埋める運用）
