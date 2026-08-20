#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
catalog_db.py — カタログDBの本体ライブラリ。

「メーカー別CSV(Google Drive上) → SQLite(ローカル生成) → 検索」を担う。
**このファイル自体はサーバーではない。** HTTPが要るときだけ catalog_server.py が
これをimportして薄く包む。ecad_v3 の server.py も同じくこれをimportして使うので、
普段はサーバーが増えない。

■ 設計の前提(2026-08-19 盛田さんとの合意事項)
- カタログ登録は恒久的に続く作業で、最終規模は数万件。
- カタログDBはCADのリポジトリに置かない。独立させ、CADは検索して結果をもらうだけ。
- Gitとは組み合わせない(SQLiteはバイナリで差分が取れず履歴が肥大化するため)。
- 部品DB(盛田さんが手で育てるparts_db.json)には**一切書き込まない**。

■ どこに何が置かれるか
- CSV(原本)   : Google Driveの「カタログDB」フォルダ。1メーカー1ファイル。
                Drive for Desktopでローカル同期されるので、ただのファイルとして読む。
                (Drive APIは使わない。ドライブレターが環境で変わる点は設定で吸収する)
- SQLite(生成物): ローカルのユーザーデータ領域。既定は下記 default_data_dir()。
                CSVから毎回作り直せるので、消しても失われるものは無い。
                ecad_v3のフォルダ内には置かない → CADを消してもDBは残り、
                複数バージョンのCADが並んでもDBは1つに保たれる。

■ 他ツールからの使い方
    import catalog_db
    db = catalog_db.CatalogDB()          # 設定済みのCSVフォルダを自動で読む
    db.ensure_built()                    # CSVが更新されていれば作り直す(差分なしなら何もしない)
    rows = db.search('MR-J5', maker='三菱電機')

■ 消したくなったら
    このフォルダ(tools/catalog_db/)と data_dir() を削除すれば元の状態に戻る。
    CSV原本はDriveに残るので、中身は失われない。
"""
import csv
import json
import os
import sqlite3
import sys

APP_NAME = 'ecad'
CONFIG_NAME = 'catalog_db_config.json'
DB_NAME = 'catalog.sqlite3'

# CSVの列定義(部品登録パネルのCSV一括登録と同じ並び)
COLUMNS = ('maker', 'ref', 'type', 'volt', 'amp', 'terminals', 'contacts', 'note')

SCHEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS parts (
    ref        TEXT PRIMARY KEY,   -- 型番(一意)
    maker      TEXT NOT NULL,
    type       TEXT,               -- 種別コード(coil/breaker/plc/hmi...)。無い場合は空
    volt       TEXT,
    amp        TEXT,
    terminals  TEXT,
    contacts   TEXT,
    note       TEXT,
    source     TEXT                -- 由来(元CSVファイル名。出典追跡用)
);

CREATE INDEX IF NOT EXISTS idx_parts_maker ON parts(maker);
CREATE INDEX IF NOT EXISTS idx_parts_type  ON parts(type);

-- 構築元CSVの状態を記録しておき、変更が無ければ再構築を省く
CREATE TABLE IF NOT EXISTS build_state (
    path  TEXT PRIMARY KEY,
    mtime REAL,
    size  INTEGER
);
"""


# ----------------------------------------------------------------------------
# 置き場所の解決
# ----------------------------------------------------------------------------
def default_data_dir():
    """SQLiteと設定ファイルを置くローカルフォルダ。

    ecad_v3のフォルダ内には置かない(CADを消してもDBが残るように)。
    Windows: %LOCALAPPDATA%\\ecad  / それ以外: ~/.local/share/ecad
    """
    if os.name == 'nt':
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    else:
        base = os.environ.get('XDG_DATA_HOME') or os.path.join(os.path.expanduser('~'), '.local', 'share')
    return os.path.join(base, APP_NAME)


def config_path(data_dir=None):
    return os.path.join(data_dir or default_data_dir(), CONFIG_NAME)


def load_config(data_dir=None):
    """設定(カタログCSVフォルダのパス等)を読む。無ければ空dict。"""
    p = config_path(data_dir)
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg, data_dir=None):
    d = data_dir or default_data_dir()
    os.makedirs(d, exist_ok=True)
    with open(config_path(d), 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return config_path(d)


# ----------------------------------------------------------------------------
# フォルダ選択の支援(パスを手入力させないため)
#
# ブラウザはセキュリティ上フォルダの絶対パスをJSに渡さない(webkitdirectoryでも
# フォルダ名しか取れない)。一方サーバー側は絶対パスが要る。そこでサーバーが
# ドライブ一覧とフォルダ一覧を返し、画面上でクリックして辿れるようにする。
# ----------------------------------------------------------------------------
def list_drives():
    """利用可能なドライブ(Windows)またはルート候補を返す。"""
    out = []
    if os.name == 'nt':
        for c in 'CDEFGHIJKLMNOPQRSTUVWXYZAB':
            p = f'{c}:\\'
            if os.path.isdir(p):
                out.append(p)
    else:
        out = ['/', os.path.expanduser('~')]
    return out


def list_dirs(path):
    """指定フォルダ直下のサブフォルダ一覧を返す。

    戻り値: {'path','parent','dirs':[{'name','path'}],'csv_count','drives'}
    csv_count はそのフォルダ直下のCSV数。カタログDBフォルダを見分ける手がかりになる。
    """
    if not path:
        return {'path': '', 'parent': None, 'dirs': [], 'csv_count': 0, 'drives': list_drives()}
    path = os.path.abspath(os.path.expanduser(path))
    if not os.path.isdir(path):
        raise ValueError(f'フォルダが見つかりません: {path}')
    dirs, csv_count = [], 0
    try:
        for name in sorted(os.listdir(path)):
            full = os.path.join(path, name)
            if name.startswith('.') or name.startswith('~$'):
                continue
            if os.path.isdir(full):
                dirs.append({'name': name, 'path': full})
            elif name.lower().endswith('.csv'):
                csv_count += 1
    except PermissionError:
        raise ValueError(f'このフォルダは開けません(アクセス権がありません): {path}')
    parent = os.path.dirname(path.rstrip(os.sep))
    if parent == path or not os.path.isdir(parent):
        parent = None
    return {'path': path, 'parent': parent, 'dirs': dirs,
            'csv_count': csv_count, 'drives': list_drives()}


# ----------------------------------------------------------------------------
# 本体
# ----------------------------------------------------------------------------
class CatalogDB:
    def __init__(self, csv_dir=None, data_dir=None):
        self.data_dir = data_dir or default_data_dir()
        cfg = load_config(self.data_dir)
        self.csv_dir = csv_dir or cfg.get('csv_dir') or ''
        self.db_path = os.path.join(self.data_dir, DB_NAME)

    # -- 設定 ---------------------------------------------------------------
    def set_csv_dir(self, path):
        """カタログCSVフォルダ(Drive同期先)を設定して保存する。

        ドライブレターが環境で変わる(I: / G:)ため、CAD側から設定できるようにしてある。
        """
        path = os.path.expanduser(path.strip().strip('"'))
        if not os.path.isdir(path):
            raise ValueError(f'フォルダが見つかりません: {path}')
        self.csv_dir = path
        cfg = load_config(self.data_dir)
        cfg['csv_dir'] = path
        save_config(cfg, self.data_dir)
        return path

    def csv_files(self):
        """カタログCSVフォルダ内のCSV一覧(ソート済み絶対パス)。"""
        if not self.csv_dir or not os.path.isdir(self.csv_dir):
            return []
        out = []
        for name in sorted(os.listdir(self.csv_dir)):
            if name.lower().endswith('.csv') and not name.startswith('~$'):
                out.append(os.path.join(self.csv_dir, name))
        return out

    def is_configured(self):
        return bool(self.csv_dir) and os.path.isdir(self.csv_dir)

    # -- 構築 ---------------------------------------------------------------
    def _current_state(self):
        st = {}
        for p in self.csv_files():
            try:
                s = os.stat(p)
                st[os.path.basename(p)] = (s.st_mtime, s.st_size)
            except OSError:
                pass
        return st

    def _stored_state(self):
        if not os.path.exists(self.db_path):
            return None
        try:
            conn = sqlite3.connect(self.db_path)
            rows = conn.execute('SELECT path, mtime, size FROM build_state').fetchall()
            conn.close()
            return {r[0]: (r[1], r[2]) for r in rows}
        except Exception:
            return None

    def needs_build(self):
        """CSVに変更があるか(=再構築が必要か)。初回やDB欠損時もTrue。"""
        return self._stored_state() != self._current_state()

    def ensure_built(self, force=False, verbose=False):
        """必要なときだけ構築する。変更が無ければ何もしない(起動が重くならない)。"""
        if not self.is_configured():
            return False
        if not force and not self.needs_build():
            return False
        self.build(verbose=verbose)
        return True

    def build(self, verbose=False):
        """CSVを読み直してSQLiteを作り直す。

        同じ型番が複数のCSVに現れた場合は後から読んだ方で上書きする(UPSERT)。
        これにより、CSV側は「追記のみ・重複可」で運用でき、正規化はここに一元化される
        (数千行のCSVを毎回突き合わせて重複を消す運用は非現実的なため)。
        """
        os.makedirs(self.data_dir, exist_ok=True)
        tmp = self.db_path + '.building'
        for p in (tmp, tmp + '-wal', tmp + '-shm'):
            if os.path.exists(p):
                os.remove(p)

        conn = sqlite3.connect(tmp)
        conn.executescript(SCHEMA)

        total, skipped, bad = 0, 0, []
        for path in self.csv_files():
            src = os.path.basename(path)
            try:
                f = open(path, newline='', encoding='utf-8-sig')
            except OSError as e:
                bad.append(f'{src}: 開けません({e})')
                continue
            with f:
                for i, row in enumerate(csv.reader(f), 1):
                    if not row or not any(c.strip() for c in row):
                        continue
                    if len(row) != 8:
                        bad.append(f'{src}:{i} が{len(row)}列(8列でないためスキップ)')
                        skipped += 1
                        continue
                    maker, ref, typ, volt, amp, term, cont, note = [c.strip() for c in row]
                    if not ref:
                        skipped += 1
                        continue
                    # ヘッダー行らしきものは飛ばす
                    if ref.lower() in ('ref', '型番') and maker.lower() in ('maker', 'メーカー'):
                        continue
                    conn.execute("""
                        INSERT INTO parts (ref, maker, type, volt, amp, terminals, contacts, note, source)
                        VALUES (?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(ref) DO UPDATE SET
                          maker=excluded.maker, type=excluded.type, volt=excluded.volt,
                          amp=excluded.amp, terminals=excluded.terminals,
                          contacts=excluded.contacts, note=excluded.note, source=excluded.source
                    """, (ref, maker, typ, volt, amp, term, cont, note, src))
                    total += 1

        for name, (mtime, size) in self._current_state().items():
            conn.execute('INSERT OR REPLACE INTO build_state (path, mtime, size) VALUES (?,?,?)',
                         (name, mtime, size))
        conn.commit()
        n = conn.execute('SELECT COUNT(*) FROM parts').fetchone()[0]
        conn.close()

        # 検索中に差し替わっても壊れないよう、作り終えてから置き換える
        for ext in ('', '-wal', '-shm'):
            p = self.db_path + ext
            if os.path.exists(p):
                os.remove(p)
        os.replace(tmp, self.db_path)

        if verbose:
            print(f'カタログDB構築: {n}件 ({total}行処理 / {skipped}行スキップ) -> {self.db_path}')
            for m in bad[:20]:
                print('  警告:', m, file=sys.stderr)
            if len(bad) > 20:
                print(f'  警告: 他{len(bad)-20}件', file=sys.stderr)
        return {'count': n, 'rows': total, 'skipped': skipped, 'warnings': bad}

    # -- 検索 ---------------------------------------------------------------
    def _connect(self):
        if not os.path.exists(self.db_path):
            raise FileNotFoundError('カタログDBが未構築です')
        conn = sqlite3.connect(f'file:{self.db_path}?mode=ro', uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def search(self, q='', maker='', type_='', limit=100):
        """型番・メーカー・備考の部分一致検索。

        空白区切りは AND 条件。型番の前方一致を最優先で並べる。
        """
        where, args = [], []
        for term in (q or '').split():
            where.append('(ref LIKE ? OR maker LIKE ? OR note LIKE ? OR type LIKE ?)')
            like = f'%{term}%'
            args += [like, like, like, like]
        if maker:
            where.append('maker LIKE ?')
            args.append(f'%{maker}%')
        if type_:
            where.append('type = ?')
            args.append(type_)
        sql = 'SELECT * FROM parts'
        if where:
            sql += ' WHERE ' + ' AND '.join(where)
        # 型番の前方一致 > 型番に含む > その他 の順に並べる
        head = (q or '').split()[0] if (q or '').split() else ''
        if head:
            sql += ' ORDER BY CASE WHEN ref LIKE ? THEN 0 WHEN ref LIKE ? THEN 1 ELSE 2 END, maker, ref'
            args += [f'{head}%', f'%{head}%']
        else:
            sql += ' ORDER BY maker, ref'
        sql += ' LIMIT ?'
        args.append(int(limit))

        conn = self._connect()
        rows = [dict(r) for r in conn.execute(sql, args)]
        conn.close()
        return rows

    def get(self, ref):
        conn = self._connect()
        r = conn.execute('SELECT * FROM parts WHERE ref = ?', (ref,)).fetchone()
        conn.close()
        return dict(r) if r else None

    # -- 取り込み(ブラウザから) --------------------------------------------
    def import_files(self, files):
        """ブラウザが読んだCSVの中身を受け取ってローカルに取り込む。

        File System Access API はセキュリティ上フォルダの絶対パスをJSに渡さない。
        そこでパスではなく「中身」を受け取り、ローカルのキャッシュフォルダに
        書き出してからDBを構築する。部品DB(parts_db.json)と同じ操作感になり、
        Windowsのフォルダ選択ダイアログがそのまま使える。

        files: [{'name': 'mitsubishi.csv', 'text': '...'}, ...]
        """
        cache = os.path.join(self.data_dir, 'csv_cache')
        os.makedirs(cache, exist_ok=True)
        # Drive側で削除されたCSVが残らないよう、取り込みのたびに作り直す
        for name in os.listdir(cache):
            if name.lower().endswith('.csv'):
                os.remove(os.path.join(cache, name))
        saved = []
        for f in files:
            name = os.path.basename(f.get('name', '')).strip()
            if not name.lower().endswith('.csv'):
                continue
            with open(os.path.join(cache, name), 'w', encoding='utf-8', newline='') as fp:
                fp.write(f.get('text', ''))
            saved.append(name)
        self.csv_dir = cache
        cfg = load_config(self.data_dir)
        cfg['csv_dir'] = cache
        cfg['source_label'] = ''  # 表示用(呼び出し側で上書きする)
        save_config(cfg, self.data_dir)
        res = self.build()
        res['files'] = saved
        return res

    def set_source_label(self, label):
        """画面に出す「どこから取り込んだか」の表示名(フォルダ名)を保存する。"""
        cfg = load_config(self.data_dir)
        cfg['source_label'] = label or ''
        save_config(cfg, self.data_dir)

    def source_label(self):
        return load_config(self.data_dir).get('source_label', '')

    def stats(self):
        """件数・メーカー内訳など。CAD側の状態表示に使う。"""
        info = {
            'configured': self.is_configured(),
            'csv_dir': self.csv_dir,
            'source_label': self.source_label(),
            'db_path': self.db_path,
            'csv_files': [os.path.basename(p) for p in self.csv_files()],
            'count': 0,
            'makers': [],
            'built': os.path.exists(self.db_path),
        }
        if not os.path.exists(self.db_path):
            return info
        try:
            conn = self._connect()
            info['count'] = conn.execute('SELECT COUNT(*) FROM parts').fetchone()[0]
            info['makers'] = [{'maker': r[0], 'count': r[1]} for r in conn.execute(
                'SELECT maker, COUNT(*) FROM parts GROUP BY maker ORDER BY 2 DESC')]
            conn.close()
        except Exception:
            pass
        return info


# ----------------------------------------------------------------------------
# コマンドライン(単体でも使えるように)
# ----------------------------------------------------------------------------
def _main(argv):
    usage = """使い方:
  python catalog_db.py setdir <カタログCSVフォルダ>   カタログCSVの場所を設定
  python catalog_db.py build [--force]               SQLiteを構築(変更が無ければ何もしない)
  python catalog_db.py search <キーワード>            検索
  python catalog_db.py stats                         現在の状態を表示
"""
    if len(argv) < 2:
        print(usage)
        return 1
    cmd = argv[1]
    db = CatalogDB()

    if cmd == 'setdir':
        if len(argv) < 3:
            print(usage); return 1
        p = db.set_csv_dir(argv[2])
        print(f'カタログCSVフォルダを設定しました: {p}')
        print(f'CSVファイル: {len(db.csv_files())}個')
    elif cmd == 'build':
        if not db.is_configured():
            print('カタログCSVフォルダが未設定です。先に setdir を実行してください', file=sys.stderr)
            return 1
        if '--force' in argv:
            db.build(verbose=True)
        elif db.ensure_built(verbose=True):
            pass
        else:
            print('CSVに変更がないため再構築は不要です')
    elif cmd == 'search':
        db.ensure_built()
        for r in db.search(' '.join(argv[2:])):
            print(f"{r['maker']}\t{r['ref']}\t{r['type']}\t{r['volt']}\t{r['amp']}")
    elif cmd == 'stats':
        s = db.stats()
        print(f"CSVフォルダ: {s['csv_dir'] or '(未設定)'}")
        print(f"DBファイル  : {s['db_path']} ({'構築済み' if s['built'] else '未構築'})")
        print(f"CSV        : {len(s['csv_files'])}個 {s['csv_files']}")
        print(f"登録型番    : {s['count']}件")
        for m in s['makers']:
            print(f"  {m['maker']}: {m['count']}件")
    else:
        print(usage); return 1
    return 0


if __name__ == '__main__':
    sys.exit(_main(sys.argv))
