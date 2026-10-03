# 部品DBを他ソフトからも使えるようにする仕組み

部品DB（盛田さんが手で育てる `parts_db.json`）を、CAD以外のソフトからも
読めるようにするための小さな仕組み。カタログDB（`tools/catalog_db/`）と同じ形。

```
parts_db.json（場所はPCごとの設定）       読む側
        ↑                              ┌─ CAD（index.html。読むだけ）
   書くのはここ1つ                     ├─ 他ソフト（parts_db_server.py 経由）
   部品DB画面（parts.html）→           │
   server.py の /api/parts/save        │
        │                              │
        ├─ 直接読む（場所を設定済み）──┤
        │                              │
        └─ 保存のたびに控えも写す ──────┘
             %LOCALAPPDATA%\ecad\parts_db_mirror.json
```

## なぜ作ったか（2026-09-02）

当時、部品DBの場所はブラウザしか知らなかった（File System Access API は
絶対パスをJavaScriptに渡さない）。そのためCAD以外のソフトからは、部品DBを
探しようが無かった。今は場所をサーバー側の設定に持っている。

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
| 書けるのは場所を設定済みのときだけ | `save()` は `resolve()` ではなく `configured_path()` だけを見る。控え（mirror）には保存しない |
| 書き込み口は `server.py` だけ | `POST /api/parts/save`・`/api/parts/backup`。呼ぶのは部品DB画面（parts.html）だけ。他ソフト向けの `parts_db_server.py` は**読み取り専用**（POST/PUT/DELETE/PATCH は **405**） |
| 場所が未設定なら書かない | `save()` が `reason:'unset'` を返し、どこにも書かない |

この不変条件は `tests/test_parts_db_api.js`（書き手が増えていないか）、
`tests/test_parts_db_save.py`（実際にファイルを書いて壊れないか）が見張っている。
（CADがブラウザ側で書く経路は2026-09-03に廃止した。書き手はこのサーバー経由の1つだけ）

### 件数が激減したら書かない

`save()` は、**今ファイルに入っている件数**と比べて「0件になる」「10件以上あった
ものが半分未満になる」場合は書かずに `reason:'drop'` を返す。CADが人に確認して
`force:true` で送り直してきたときだけ、退避を取ってから書く。
（以前はブラウザ側にも同じ規則があったが、書き込み経路がサーバーだけになり、規則もここだけになった）

## ファイル構成

| ファイル | 役割 |
|---|---|
| `parts_db.py` | **本体。** parts_db.json の読み書きと検索。サーバー機能は持たない |
| `parts_db_server.py` | 他ソフトから使いたいときだけ起動する独立HTTPサーバー（**普段は不要**） |

`ecad_v3/server.py` は `parts_db.py` を直接importして使う。
→ **盛田さんは今まで通り `start.bat` を起動するだけでよい。常駐サーバーは増えない。**

## 部品DBをどうやって見つけるか

上から順に試す。

### 1. 場所を設定する（推奨）

**画面から設定するのが普通（2026-10-02〜）。** CADの設定タブ、または部品DB画面の
上にある「部品DBの場所」で「ファイルを選ぶ」「探す」「新規作成」。
コマンドでも同じことができる（場所が分からなければ `find` で探せる）。

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

設定は `%LOCALAPPDATA%\ecad\parts_db_config.json` に入る（PCごと）。
以後はこのファイルを直接読むので、常に最新。設定の場所が外れたら、ドライブ文字の
付け替え→ディスク全走査（1プロセスで1回）で探し直す。

### 2. 控え（設定していないとき）

部品DBが保存されるたびに、その中身を `%LOCALAPPDATA%\ecad\parts_db_mirror.json`
に写す。パスを一度も設定していない場合はこちらを読む。
**最後に保存した時点の内容**なので、1より鮮度は落ちる。

**控えは読むためだけのもので、保存先にはならない。** ここへ保存してしまうと
「原本は古いまま、他ソフトだけ新しい内容を見る」という一番分かりにくい
食い違いが起きる。場所を設定していない環境では、部品DB画面は保存しない。

控えの書き込みが失敗しても、部品DBの保存自体は成功として扱う（別の話として扱う）。

（2026-10-03の再設計案で、控えと全走査はやめる予定。HANDOFF.md「ライブラリの置き場所の再設計」）

## 使い方

### コマンドから

```
py parts_db.py stats            件数・メーカー数・外形図の件数
py parts_db.py search S-T21     部分一致で検索
py parts_db.py get S-T21        1件をJSONで
py parts_db.py path             今どこを読んでいるか
```

`stats` の `writable` が真なら、部品DB画面はそのファイルへ保存できる。
偽（未設定・控えしか無い）なら保存できない。

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

`server.py` にはこのほかにCAD・部品DB画面専用の口がある。**他ソフトからは叩かないこと。**

| API | 用途 |
|---|---|
| `GET /api/parts/all` | 外形図DXFまで含めた全件（CAD・部品DB画面の読み込み用） |
| `POST /api/parts/save` | 保存（`{customParts, hiddenBuiltinRefs, force?}`）。部品DB画面だけが呼ぶ |
| `POST /api/parts/backup` | 退避を1つ書き出す |
| `POST /api/parts/pick` `new` `find` `use` | 部品DBの場所の設定（Windowsの窓で選ぶ／新規作成／探す／候補から選ぶ）。このPCからだけ受け付け、画面から送られたパスは使わない |

**外形図DXF（`outlineDxf`）は検索結果に含めない。** 1件が数百KBあり、
一覧に混ぜると応答が肥大化するうえ、備考の全文検索にDXFの図形データが
引っかかる。あるか無いかは `has_outline` で分かるので、
中身が要るときだけ `/outline` を叩く。

## 外に出さない

待ち受けは既定で `127.0.0.1`（このPCからのみ）。CORSも `localhost` のみ。
LANの別PCから使いたい場合だけ `--host 0.0.0.0` を明示的に付ける
（`server.py` の `ECAD_HOST` と同じ方針）。

## 消したくなったら

**消すと部品DBが使えなくなる。** 2026-09-03以降、CADも部品DB画面も部品DBを
このライブラリ経由でしか読み書きしない（ブラウザで直接読み書きする経路は廃止した）。
`server.py` はimportに失敗しても `/api/parts/*` を無効にするだけで動くので、
CADは部品DB0件（案内の帯あり）で起動し、図面の作業自体は続けられる。
