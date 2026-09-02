# 部品DBを他ソフトからも使えるようにする仕組み

部品DB（盛田さんが手で育てる `parts_db.json`）を、CAD以外のソフトからも
読めるようにするための小さな仕組み。カタログDB（`tools/catalog_db/`）と同じ形。

```
盛田さんのPC上の parts_db.json          読む側
        ↑                              ┌─ ecad_v3 の「部品登録」パネル
   書くのはここ1つ                     ├─ 見積・部品表・Excelマクロ等
   （server.py の /api/parts/save）    │   （parts_db_server.py 経由）
        │                              │
        ├─ 直接読む（setpath 設定時）──┤
        │                              │
        └─ 保存のたびに控えも写す ──────┘
             %LOCALAPPDATA%\ecad\parts_db_mirror.json
```

## なぜ必要だったか

部品DBの実体はローカルのJSONファイルだが、**その場所はブラウザしか知らない。**
File System Access API はセキュリティ上、フォルダやファイルの絶対パスを
JavaScriptに渡さない（ハンドルをIndexedDBに覚えているだけ）。
そのためCAD以外のソフトからは、部品DBを探しようが無かった。

## 【最重要】書き手は常に1つ

2つ以上が書くと、どちらかの書き込みが黙って失われるか、書きかけのJSONが残って
次の起動で読めなくなる。2026-09-01に「保存できていないことに誰も気づけない」
事故を起こしたばかりのファイルなので、ここは崩さない。

### 2026-09-02：その「1つ」がCADからサーバーへ移った

以前は CAD（ブラウザの File System Access API）が書いていた。移した理由:

- **ブラウザの許可はページを開くたびに下りるとは限らない。** 下りなかった回の
  保存が静かに空振りする —— これが9-01の事故の根本だった。
  サーバーからの書き込みに許可ダイアログは無い。
- **tmpに書いてから `os.replace` で置き換えられる。** FSAの `createWritable()` は
  開いた瞬間に中身を捨てるので、途中で落ちるとファイルが空のまま残る。
- **退避（バックアップ）を `parts_db.json` と同じフォルダへ自動で置ける。**
  Chromeに `getParent()` が無く、FSAではフォルダを別途選ばせる必要があった。

移した後も書き手は1つのまま。守り方:

| | |
|---|---|
| 書けるのは setpath 済みのときだけ | `save()` は `resolve()` ではなく `configured_path()` だけを見る。控え（mirror）には保存しない |
| 書き込み口はCADの `server.py` だけ | `POST /api/parts/save`・`/api/parts/backup`。他ソフト向けの `parts_db_server.py` は今まで通り**読み取り専用**（POST/PUT/DELETE/PATCH は **405**） |
| setpath が未設定なら書かない | `save()` が `reason:'unset'` を返し、CADは従来どおり File System Access API で保存する（そのときも書き手は1つ） |

CADがどちらの経路で保存しているかは、「部品登録」パネルの状態行に出る
（`…（605件・保存済み・サーバー経由）`）。

この不変条件は `tests/test_parts_db_api.js`（書き手が増えていないか）、
`tests/test_parts_db_server_mode.js`（CADがどちらの経路を選ぶか）、
`tests/test_parts_db_save.py`（実際にファイルを書いて壊れないか）が見張っている。

### 件数が激減したら書かない

`save()` は、**今ファイルに入っている件数**と比べて「0件になる」「10件以上あった
ものが半分未満になる」場合は書かずに `reason:'drop'` を返す。CADが人に確認して
`force:true` で送り直してきたときだけ、退避を取ってから書く。
（同じ規則が `js/parts_db.js` の `isSuspiciousDrop` にもある。経路ごとに1つずつ
なので、**変えるときは必ず両方**。テストが一致を見ている）

## ファイル構成

| ファイル | 役割 |
|---|---|
| `parts_db.py` | **本体。** parts_db.json の読み書きと検索。サーバー機能は持たない |
| `parts_db_server.py` | 他ソフトから使いたいときだけ起動する独立HTTPサーバー（**普段は不要**） |

`ecad_v3/server.py` は `parts_db.py` を直接importして使う。
→ **盛田さんは今まで通り `start.bat` を起動するだけでよい。常駐サーバーは増えない。**

## 部品DBをどうやって見つけるか

上から順に試す。

### 1. パスを設定する（推奨・CADを起動していなくても最新を読める）

**場所が分からない場合は探せる。** 部品DBの場所はブラウザしか知らない
（File System Access API は絶対パスをJSに渡さない）ので、すぐには出てこない。

```
> py parts_db.py find
parts_db.json を探しています(数十秒かかることがあります)...

部品DB本体:
       605件  2026-09-02 10:59  G:\マイドライブ\claude\部品カタログ\parts_db.json
       168件  2026-08-20 22:30  C:\Users\y.morita\Desktop\旧\parts_db.json

件数が一番多いものを設定するなら:
  py parts_db.py setpath "G:\マイドライブ\claude\部品カタログ\parts_db.json"
```

**件数の多い順に並べている**（中身が空のファイルを先頭に出すと選び間違えるため）。
バックアップ（`parts_db_backup_*.json`）も参考として別に出すが、
setpath には本体を指定すること。

```
py parts_db.py setpath "G:\マイドライブ\claude\部品カタログ\parts_db.json"
```

設定は `%LOCALAPPDATA%\ecad\parts_db_config.json` に入る。
以後はこのファイルを直接読むので、常に最新。

### 2. CADが置いていく控え（設定不要）

部品DBが保存されるたびに、その中身を `%LOCALAPPDATA%\ecad\parts_db_mirror.json`
に写す。パスを一度も設定していない場合はこちらを読む。
**最後に保存した時点の内容**なので、1より鮮度は落ちる。

**控えは読むためだけのもので、保存先にはならない。** ここへ保存してしまうと
「原本は古いまま、他ソフトだけ新しい内容を見る」という一番分かりにくい
食い違いが起きる。setpath をしていない環境では、CADは今まで通り
ブラウザ側（File System Access API）で `parts_db.json` に保存する。

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

`stats` の `writable` が真なら、CADの保存もそのファイルへ直接書いている。
偽（控えしか無い）なら、CADはブラウザ側で保存している。

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

`server.py` にはこのほかにCAD専用の口がある。**他ソフトからは叩かないこと。**

| API | 用途 |
|---|---|
| `GET /api/parts/all` | 外形図DXFまで含めた全件（CADの起動時読み込み用） |
| `POST /api/parts/save` | 保存（`{customParts, hiddenBuiltinRefs, force?}`） |
| `POST /api/parts/backup` | 退避を1つ書き出す |

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
CADは `/api/parts/stats` が返らない時点で、従来の File System Access API による
保存へ自動的に戻る（`js/parts_db.js` の `restoreFromServer` が false を返す）ので、
部品DBの読み書きはそのまま続けられる。
