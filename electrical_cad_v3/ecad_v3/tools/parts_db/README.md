# 部品DBを他ソフトからも使えるようにする仕組み

部品DB（盛田さんが手で育てる `parts_db.json`）を、CAD以外のソフトからも
読めるようにするための小さな仕組み。カタログDB（`tools/catalog_db/`）と同じ形。

```
盛田さんのPC上の parts_db.json          読む側
  （更新するのはCADだけ）
        │                              ┌─ ecad_v3 の「部品登録」パネル
        ├─ 直接読む（setpath 設定時）──┤
        │                              ├─ 見積・部品表・Excelマクロ等
        └─ CADが保存のたびに控えを写す ─┘   （parts_db_server.py 経由）
             %LOCALAPPDATA%\ecad\parts_db_mirror.json
```

## なぜ必要だったか

部品DBの実体はローカルのJSONファイルだが、**その場所はブラウザしか知らない。**
File System Access API はセキュリティ上、フォルダやファイルの絶対パスを
JavaScriptに渡さない（ハンドルをIndexedDBに覚えているだけ）。
そのためCAD以外のソフトからは、部品DBを探しようが無かった。

## 【最重要】書き込みはしない

**このフォルダのコードは `parts_db.json` に一切書き込まない。**

`parts_db.json` を書いているのはCAD（ブラウザのFile System Access API）。
そこへサーバーが同時に書くと、どちらかの書き込みが黙って失われるか、
書きかけのJSONが残って次の起動で読めなくなる。
2026-09-01に「保存できていないことに誰も気づけない」事故を起こしたばかりの
ファイルなので、**書き手は1つに保つ。**

- 公開するのは read 系のAPIのみ
- `parts_db_server.py` は POST/PUT/DELETE/PATCH を **405** で返す
  （404ではなく405なのは、「実装し忘れ」ではなく「意図的に置いていない」と
  分かるようにするため）
- 部品DBを更新する手段は今まで通りCADの「部品登録」パネルだけ

この不変条件は `tests/test_parts_db_api.js` が見張っている。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `parts_db.py` | **本体。** parts_db.json の読み込みと検索。サーバー機能は持たない |
| `parts_db_server.py` | 他ソフトから使いたいときだけ起動する独立HTTPサーバー（**普段は不要**） |

`ecad_v3/server.py` は `parts_db.py` を直接importして使う。
→ **盛田さんは今まで通り `start.bat` を起動するだけでよい。常駐サーバーは増えない。**

## 部品DBをどうやって見つけるか

上から順に試す。

### 1. パスを設定する（推奨・CADを起動していなくても最新を読める）

```
py parts_db.py setpath "G:\マイドライブ\claude\部品カタログ\parts_db.json"
```

設定は `%LOCALAPPDATA%\ecad\parts_db_config.json` に入る。
以後はこのファイルを直接読むので、常に最新。

### 2. CADが置いていく控え（設定不要）

CADが部品DBの保存に成功するたびに、その中身を `server.py` 経由で
`%LOCALAPPDATA%\ecad\parts_db_mirror.json` に写す。
パスを一度も設定していない場合はこちらを読む。
**CADが最後に保存した時点の内容**なので、1より鮮度は落ちる。

控えの送信が失敗しても、部品DBの保存自体には影響しない（別の話として扱う）。
状態は「部品登録」パネルの `他ソフトへの公開:` の行に出る。

## 使い方

### コマンドから

```
py parts_db.py stats            件数・メーカー数・外形図の件数
py parts_db.py search S-T21     部分一致で検索
py parts_db.py get S-T21        1件をJSONで
py parts_db.py path             今どこを読んでいるか
```

### Pythonから

```python
import parts_db
db = parts_db.PartsDB()
db.stats()              # {'ok':True,'count':605,'source':'path',...}
db.search('S-T21')      # 型番・メーカー・備考等の部分一致
db.get('S-T21')         # 1件（無ければ None）
db.outline('S-T21')     # 外形図DXFの中身（無ければ None）
```

### HTTPから（他言語・Excelマクロ等）

```
py parts_db_server.py            既定 http://127.0.0.1:8091
```

| API | 返すもの |
|---|---|
| `GET /stats` | 件数・メーカー一覧・種別一覧・読み元 |
| `GET /search?q=&maker=&type=&limit=` | 検索結果 |
| `GET /get?ref=S-T21` | 1件 |
| `GET /outline?ref=S-T21` | 外形図DXFの中身（text/plain。無ければ404） |

CADの `server.py` 経由でも同じものが引ける（`/api/parts/stats` `/api/parts/search`
`/api/parts/get`）。CADを開いているならサーバーを増やさずに済む。

**外形図DXF（`outlineDxf`）は検索結果に含めない。** 1件が数百KBあり、
一覧に混ぜると応答が肥大化するうえ、備考の全文検索にDXFの図形データが
引っかかる。あるか無いかは `has_outline` で分かるので、
中身が要るときだけ `/outline` を叩く。

## 外に出さない

待ち受けは既定で `127.0.0.1`（このPCからのみ）。CORSも `localhost` のみ。
LANの別PCから使いたい場合だけ `--host 0.0.0.0` を明示的に付ける
（`server.py` の `ECAD_HOST` と同じ方針）。

## 消したくなったら

このフォルダ（`tools/parts_db/`）を削除すれば元の状態に戻る。
`server.py` はimportに失敗しても `/api/parts/*` を無効にするだけで通常通り動く。
`parts_db.json` 自体には一度も触っていないので、部品DBは無傷。
