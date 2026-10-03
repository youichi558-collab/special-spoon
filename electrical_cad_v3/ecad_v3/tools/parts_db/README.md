# 部品DB（parts_db.json）の読み書き

部品DB（盛田さんが育てる `parts_db.json`）を読み書きするライブラリ。
`ecad_v3/server.py` がimportして使う（常駐サーバーは増えない）。

設計の経緯は `HANDOFF.md` の「ライブラリの置き場所の再設計」（2026-10-03）。

## ライブラリフォルダ

部品DBは、盛田さんが選んだ **1つのフォルダ（ライブラリフォルダ）** に置く。
場所は固定しない（ローカル・Googleドライブ等の同期フォルダ・社内の共有フォルダのどれでもよい）。

```
<ライブラリフォルダ>/
    parts_db.json      部品DB本体
    frames.json        図面枠テンプレート（段階2・CADの図面枠パネルが書く）
    titleblocks.json   表題欄の様式（段階2・CADの図面枠パネルが書く）
    symbols.json       登録シンボル（段階3・CADのシンボル登録・パレットが書く。キーの順がパレットの並び）
    backup/            保存のたびに溜まる世代バックアップ（ファイルごとに30個まで。古いものから消す）
```

frames.json・titleblocks.json・symbols.json も parts_db.json と同じく、版の確認・世代バックアップ・tmp経由の置き換えをする
（`read_library` / `save_library`）。画面側は `js/library.js`（登録シンボルは `js/sym_store.js` も）。

- フォルダの場所は PC ごとの設定 `%LOCALAPPDATA%\ecad\parts_db_config.json`（キー `library_dir`）に入る。
- 設定は画面から：CADの設定タブ／部品DB画面（`部品DBを開く.bat`）の「部品DBの場所」で
  **「フォルダを選ぶ」**（部品DBが無いフォルダなら、空の部品DBを作るか聞く）か **「探す」**。
  CADは場所が決まっていないと、起動時に案内の窓を出す。
- コマンドなら `py parts_db.py setlib <フォルダ>`（`find` で探せる）。
- 旧形式の設定（キー `path` = parts_db.json のフルパス）は、そのファイルのあるフォルダを
  ライブラリフォルダとして読み替える（ファイル名が `parts_db.json` のときだけ）。

### 見つからないとき

設定のフォルダが無ければ、ドライブ文字だけ付け替えて探す（同期ソフトのドライブ文字は環境で変わるため。一瞬で済む）。
それでも無ければ「見つかりません（同期ソフトやネットワークの準備待ちかも）」を返し、画面に「もう一度確かめる」が出る。
**ディスク全体を勝手に探したり、古い控えを読んだりはしない**（2026-10-03 にやめた）。

## 【最重要】書き手は常に1つ

2つ以上が書くと、どちらかの書き込みが黙って失われるか、書きかけのJSONが残って
次の起動で読めなくなる。2026-09-01に「保存できていないことに誰も気づけない」
事故を起こしたファイルなので、ここは崩さない。

| | |
|---|---|
| 書き込み口は `server.py` だけ | `POST /api/parts/save`・`/api/parts/backup`。呼ぶのは部品DB画面（parts.html）だけ。CADは読むだけ |
| 場所が未設定・見つからないなら書かない | `save()` が `reason:'unset'`/`'path_missing'` を返し、どこにも書かない（勝手に作らない） |
| 読んだ後に他で保存されていたら書かない | 画面は読んだ時点の版（中身のハッシュ）を送る。違えば `reason:'conflict'`。件数激減の確認（force）でも通さない |
| 件数が激減したら確認 | 「0件になる」「10件以上が半分未満になる」なら `reason:'drop'`。人が確かめて `force:true` で送り直したときだけ書く |
| 書く前に世代を残す | `backup/parts_db_YYYYMMDD_HHMMSS.json`。消すのはこの名前に一致するものだけ |
| 書きかけを残さない | tmp に書いてから `os.replace` で置き換える |

見張っているテスト: `tests/test_parts_db_api.js`（書き手・口が増えていないか）、
`tests/test_parts_db_save.py`（実際にファイルを書いて確かめる）、`tests/test_parts_db_recover.py`（見つからないとき）。

## server.py の口

| API | 用途 |
|---|---|
| `GET /api/parts/stats` | 件数・読み元・ライブラリフォルダ・書けるか |
| `GET /api/parts/all` | 外形図DXFまで含めた全件と版（CAD・部品DB画面の読み込み用） |
| `POST /api/parts/save` | 保存（`{customParts, hiddenBuiltinRefs, force?, version}`）。部品DB画面だけが呼ぶ |
| `POST /api/parts/backup` | 退避を1つ書き出す（カタログ全件で作り直す前） |
| `GET/POST /api/library/frames` `titleblocks` `symbols` | 図面枠テンプレート・表題欄様式・登録シンボルの読み書き（`{data, version}`。版が違えば conflict）。種類はこの3つだけ |
| `POST /api/parts/pick` `create` `find` `use` | 場所の設定（Windowsの窓でフォルダを選ぶ／そこに作る／探す／候補から選ぶ）。このPCからだけ受け付け、**画面から送られたパスは使わない** |

2026-10-03 に、他ソフト向けの `parts_db_server.py` と `/api/parts/search`・`/get`、
控え（`parts_db_mirror.json`）は使っていないので消した。

## 消したくなったら

**消すと部品DBが使えなくなる。** CADも部品DB画面も、部品DBをこのライブラリ経由でしか読み書きしない。
`server.py` はimportに失敗しても `/api/parts/*` を無効にするだけで動くので、
CADは部品DB0件（案内の帯あり）で起動し、図面の作業自体は続けられる。
