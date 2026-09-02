#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parts_db.py — 部品DB(parts_db.json)を他ソフトからも読めるようにするライブラリ。

catalog_db.py と同じ発想を部品DBに適用したもの。
**このファイル自体はサーバーではない。** HTTPが要るときだけ parts_db_server.py が
これをimportして薄く包む。ecad_v3 の server.py も同じくこれをimportして使うので、
普段はサーバーが増えない。

■ カタログDBとの違い(混同しやすいので明記する)
    カタログDB : カタログ全型番。数万件。原本はDrive上のメーカー別CSV。
                 SQLiteに構築して検索する。更新するのは Claude/Cowork。
    部品DB     : 図面で実際に使う部品。数千件。原本は parts_db.json 1ファイル。
                 **更新するのは盛田さんだけ。**

■ 【最重要】parts_db.json の書き手は「常に1つだけ」
    2つ以上が書くと、どちらかの書き込みが黙って失われるか、書きかけのJSONが
    残って次の起動で読めなくなる。2026-09-01に「保存できていないことに誰も
    気づけない」事故を起こしたばかりのファイルなので、ここは崩さない。

    【2026-09-02 変更】その「1つ」を、CAD(ブラウザのFile System Access API)から
    このライブラリに移した。理由:
      ・ブラウザの許可はページを開くたびに下りないことがあり、それが9-01の事故の
        根本だった。サーバーからの書き込みには許可ダイアログが無い。
      ・tmpに書いてから os.replace で置き換えられる(FSAのcreateWritableは
        開いた瞬間に中身を捨てるので、途中で落ちるとファイルが空になる)。
      ・バックアップを parts_db.json と同じフォルダへ自動で置ける
        (Chromeに getParent() が無く、FSAではフォルダを別途選ばせる必要があった)。

    移した後も書き手は1つのまま。守り方は下の3つ:
      1. 書けるのは setpath で場所を設定したときだけ(save() が resolve ではなく
         configured_path() だけを見る)。控え(mirror)には保存しない。
      2. 書き込み口はCAD自身の server.py の POST /api/parts/save だけ。
         他ソフト向けの parts_db_server.py は今まで通り読み取り専用(405)。
      3. setpath が未設定なら save() は失敗を返し、CAD側は従来どおり
         File System Access API で書く(=そのときも書き手は1つ)。

■ 部品DBの実体をどうやって見つけるか
    2通りある。上から順に試す。

    1. パス設定(推奨・CADを起動していなくても読める)
           py parts_db.py find                  ← 場所が分からなければ探す
           py parts_db.py setpath "G:\\マイドライブ\\...\\parts_db.json"
       設定は %LOCALAPPDATA%\\ecad\\parts_db_config.json に入る。
       以後はこのファイルを直接読むので、常に最新。

    2. CADが置いていく控え(設定不要・CADを一度開いていれば読める)
       CADが部品DBを保存するたびに、その中身を server.py 経由で
       %LOCALAPPDATA%\\ecad\\parts_db_mirror.json に写す。
       パスを一度も設定していない場合はこちらを読む。
       **CADが最後に保存した時点の内容**なので、1より鮮度は落ちる。

    どちらも読めない場合、search() 等は空を返し、stats() が理由を返す。
    呼び出し側が「部品DBが無い」と「部品が0件」を区別できるようにするため、
    例外ではなく status で返す。

■ 他ツールからの使い方
    import parts_db
    db = parts_db.PartsDB()
    db.stats()                      # {'ok':True,'count':605,'source':'path',...}
    db.search('S-T21')              # 型番・メーカー・備考の部分一致
    db.get('S-T21')                 # 1件
    db.outline('S-T21')             # 外形図DXFの中身(無ければNone)

    HTTPで使いたいなら parts_db_server.py を起動する(既定 http://127.0.0.1:8091)。
    **他ツールからは読むだけにすること。** 書き込み(save/backup)はCADのために
    用意してあるもので、server.py の /api/parts/save 以外からは呼ばない。

■ 消したくなったら
    このフォルダ(tools/parts_db/)を削除すれば元の状態に戻る。
    CADは setpath が読めなくなった時点で、従来の File System Access API による
    保存へ自動的に戻る(js/parts_db.js の restoreFromServer が false を返す)ので、
    部品DBの読み書きはそのまま続けられる。
"""
import json
import os
import sys

APP_NAME = 'ecad'
CONFIG_NAME = 'parts_db_config.json'
MIRROR_NAME = 'parts_db_mirror.json'

# 検索対象にする文字列カラム。outlineDxf(DXFの全文)は入れない ——
# 数百KBの図形データが「備考に一致した」形でヒットしても意味が無いため。
SEARCH_FIELDS = ('ref', 'maker', 'type', 'volt', 'amp', 'terminals',
                 'contacts', 'note', 'source')

# 一覧・検索で返すカラム。outlineDxf は本文が巨大なので既定では返さず、
# 「あるか無いか」だけを has_outline で伝える。中身が要るときは outline() を呼ぶ。
PUBLIC_FIELDS = SEARCH_FIELDS + ('outlineDxfName', 'voltOpts')


def default_data_dir():
    """設定と控えを置くローカルフォルダ。catalog_db.py と同じ場所を使う。

    ecad_v3のフォルダ内には置かない(CADを消しても設定が残るように)。
    Windows: %LOCALAPPDATA%\\ecad  / それ以外: ~/.local/share/ecad
    """
    if os.name == 'nt':
        base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    else:
        base = os.environ.get('XDG_DATA_HOME') or os.path.join(
            os.path.expanduser('~'), '.local', 'share')
    return os.path.join(base, APP_NAME)


def config_path(data_dir=None):
    return os.path.join(data_dir or default_data_dir(), CONFIG_NAME)


def mirror_path(data_dir=None):
    return os.path.join(data_dir or default_data_dir(), MIRROR_NAME)


def load_config(data_dir=None):
    try:
        with open(config_path(data_dir), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(cfg, data_dir=None):
    d = data_dir or default_data_dir()
    os.makedirs(d, exist_ok=True)
    with open(config_path(d), 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return config_path(d)


def normalize(data):
    """parts_db.json の中身を {'customParts': [...], 'hiddenBuiltinRefs': [...]} に揃える。

    古い版のファイルは配列そのものだった(js/parts_db.js の readFromHandle と同じ扱い)。
    ここを合わせておかないと、古いファイルを読んだときだけ0件になる。
    """
    if isinstance(data, list):
        return {'customParts': data, 'hiddenBuiltinRefs': []}
    if isinstance(data, dict):
        return {'customParts': data.get('customParts') or [],
                'hiddenBuiltinRefs': data.get('hiddenBuiltinRefs') or []}
    raise ValueError('parts_db.json の形式が想定と違います(配列でもオブジェクトでもない)')


def is_suspicious_drop(prev, now):
    """件数が大きく減った上書きを疑う。

    js/parts_db.js の isSuspiciousDrop と**同じ規則**。片方だけ直すと、
    保存経路(サーバー/ブラウザ)によって守られたり守られなかったりする
    —— それが一番たちが悪いので、変えるときは必ず両方を直すこと。
    tests/test_parts_db_server_mode.js が両者の一致を見ている。

    1件ずつの削除は普通の操作なので通し、「全部消えた」「半分以下になった」だけ止める。
    """
    if prev is None or prev <= 0:
        return False
    if now == 0:
        return True
    return prev >= 10 and now < prev / 2


def write_mirror(text, data_dir=None):
    """CADが保存した部品DBの中身を控えとして写す。server.py から呼ばれる。

    書き先は %LOCALAPPDATA%\\ecad\\parts_db_mirror.json であって、
    盛田さんの parts_db.json ではない。控えが壊れても原本は無傷。

    中身が parts_db.json として読める形かをここで検証してから置く。
    壊れたものを黙って控えに残すと、原本が読めないときに
    「控えはあるのに空」という分かりにくい状態になるため。
    """
    info = normalize(json.loads(text))
    d = data_dir or default_data_dir()
    os.makedirs(d, exist_ok=True)
    p = mirror_path(d)
    # 書きかけの控えを他のツールが読まないよう、別名に書いてから置き換える。
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False)
    os.replace(tmp, p)
    return {'path': p, 'count': len(info['customParts'])}


class PartsDB:
    """部品DBの読み取り専用ビュー。

    毎回ファイルを読み直す(mtimeが変わっていなければ前回の内容を使い回す)ので、
    CAD側で保存された内容がそのまま次の検索に出る。
    """

    def __init__(self, data_dir=None):
        self.data_dir = data_dir or default_data_dir()
        self._cache = None
        self._cache_key = None

    # ---- 置き場所の解決 ------------------------------------------------
    def configured_path(self):
        return (load_config(self.data_dir).get('path') or '').strip()

    def set_path(self, path):
        """parts_db.json の場所を設定する。CLIからのみ呼ぶ。

        HTTPからは受け付けない(catalog_db の setdir を撤去したのと同じ理由 ——
        GET一発でサーバーに任意のファイルを読ませられるため)。
        """
        path = os.path.abspath(os.path.expanduser(path))
        if not os.path.isfile(path):
            raise FileNotFoundError(f'ファイルが見つかりません: {path}')
        normalize(json.loads(open(path, encoding='utf-8').read()))  # 読める形か確認
        cfg = load_config(self.data_dir)
        cfg['path'] = path
        save_config(cfg, self.data_dir)
        return path

    def resolve(self):
        """(実ファイルのパス, 由来) を返す。見つからなければ (None, 理由)。"""
        p = self.configured_path()
        if p:
            if os.path.isfile(p):
                return p, 'path'
            return None, 'path_missing'
        m = mirror_path(self.data_dir)
        if os.path.isfile(m):
            return m, 'mirror'
        return None, 'unset'

    # ---- 読み込み ------------------------------------------------------
    def load(self):
        """{'ok':bool, 'parts':[...], 'hidden':[...], 'source':str, 'error':str}"""
        path, source = self.resolve()
        if path is None:
            return {'ok': False, 'parts': [], 'hidden': [], 'source': source,
                    'error': {
                        'unset': '部品DBの場所が未設定です'
                                 '(py parts_db.py setpath <parts_db.jsonのパス>)',
                        'path_missing': f'設定された部品DBが見つかりません: '
                                        f'{self.configured_path()}',
                    }.get(source, '部品DBを読めません')}
        try:
            st = os.stat(path)
            key = (path, st.st_mtime, st.st_size)
            if self._cache_key != key:
                with open(path, encoding='utf-8') as f:
                    self._cache = normalize(json.load(f))
                self._cache_key = key
        except Exception as e:
            # 読めなかったときに前回のキャッシュを返さない。
            # 「壊れているのに古い内容で動き続ける」のは、今年ここで起きた
            # 事故と同じ形(気づけないまま作業が進む)なので、はっきり失敗させる。
            self._cache = None
            self._cache_key = None
            return {'ok': False, 'parts': [], 'hidden': [], 'source': source,
                    'error': f'部品DBを読めませんでした({path}): {e}'}
        return {'ok': True, 'parts': self._cache['customParts'],
                'hidden': self._cache['hiddenBuiltinRefs'],
                'source': source, 'error': ''}

    # ---- 書き込み(CADの保存経路・2026-09-02) ---------------------------
    #
    # ここから書けるのは setpath で設定された parts_db.json だけ。
    # 控え(mirror)には保存しない —— 控えは「CADが最後に保存した中身の写し」で
    # あって原本ではなく、そこへ保存すると原本が更新されないまま
    # 他ツールだけが新しい内容を見る、という一番分かりにくい形になる。
    def writable_path(self):
        """保存先の parts_db.json。書けないときは (None, 理由)。"""
        p = self.configured_path()
        if not p:
            return None, 'unset'
        if not os.path.isfile(p):
            return None, 'path_missing'
        return p, 'path'

    def _count_on_disk(self, path):
        """今ファイルに入っている件数。読めなければ None(=比較しない)。"""
        try:
            with open(path, encoding='utf-8') as f:
                return len(normalize(json.load(f))['customParts'])
        except Exception:
            return None

    def backup(self):
        """現在のファイルの中身を、同じフォルダへ退避する。

        parts_db_backup_YYYY-MM-DD_HHMM.json という名前は、CAD側(js/parts_db.js)が
        FSAで書いていたものと同じ。find の「バックアップ」表示もこの名前で拾う。

        中身は「今ディスクにあるもの」であって、これから書こうとしている内容では
        ない。戻したいのは常に上書きされる前の方なので、必ずコピー元は原本にする。
        """
        path, why = self.writable_path()
        if path is None:
            return {'ok': False, 'reason': why, 'name': '',
                    'error': '部品DBの場所が未設定です'}
        import datetime
        base = 'parts_db_backup_' + datetime.datetime.now().strftime('%Y-%m-%d_%H%M')
        folder = os.path.dirname(path)
        # 名前は分までしか持たないので、同じ分に2回退避すると衝突する。
        # 上書きすると「1回目の退避(=一番戻したい内容)」が消えるので、必ず別名にする。
        # 作り直しの直前など、短い間に2回退避が走る流れが実際にある。
        name = base + '.json'
        for i in range(2, 100):
            if not os.path.exists(os.path.join(folder, name)):
                break
            name = f'{base}_{i}.json'
        dst = os.path.join(folder, name)
        try:
            with open(path, encoding='utf-8') as f:
                body = f.read()
            tmp = dst + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(body)
            os.replace(tmp, dst)
        except Exception as e:
            return {'ok': False, 'reason': 'error', 'name': '', 'error': str(e)}
        return {'ok': True, 'name': name, 'path': dst, 'error': ''}

    def save(self, data, force=False):
        """部品DBを保存する。**CADの保存経路。他ツールからは呼ばない。**

        戻り値は必ず ok を含む dict。例外にしないのは、呼び出し側(server.py →
        js/parts_db.js)が「保存できなかった」を画面に出さなければならないため。
        2026-09-01の事故は、保存の失敗が誰にも届かなかったことで起きている。

        force=False のときに件数が激減していたら、書かずに reason='drop' を返す。
        判断材料は**今ファイルに入っている件数**で、ブラウザ側の記憶ではない。
        """
        path, why = self.writable_path()
        if path is None:
            return {'ok': False, 'reason': why, 'count': 0, 'path': '',
                    'error': {
                        'unset': '部品DBの場所が未設定です'
                                 '(py parts_db.py setpath <parts_db.jsonのパス>)',
                        'path_missing': '設定された部品DBが見つかりません: '
                                        + self.configured_path(),
                    }.get(why, '部品DBに保存できません')}
        try:
            info = normalize(data)
        except Exception as e:
            return {'ok': False, 'reason': 'bad_data', 'count': 0, 'path': path,
                    'error': f'保存する中身の形が違います: {e}'}
        now = len(info['customParts'])
        prev = self._count_on_disk(path)
        dropping = is_suspicious_drop(prev, now)
        if dropping and not force:
            return {'ok': False, 'reason': 'drop', 'prev': prev, 'now': now,
                    'count': prev or 0, 'path': path,
                    'error': f'部品DBの件数が {prev} 件から {now} 件に減っています'}
        backup = ''
        if dropping:
            # 人が「それでも書く」と答えた激減。戻せるようにしてから書く。
            backup = self.backup().get('name', '')
        try:
            # 書きかけのJSONが parts_db.json として残らないよう、別名に書いてから
            # 置き換える。FSAのcreateWritableは開いた瞬間に中身を捨てるので、
            # 途中で落ちるとファイルが空になった —— それが起きない形にする。
            text = json.dumps(info, ensure_ascii=False, indent=2)
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(text)
            os.replace(tmp, path)
        except Exception as e:
            return {'ok': False, 'reason': 'error', 'count': 0, 'path': path,
                    'error': f'部品DBを保存できませんでした({path}): {e}'}
        self._cache = None
        self._cache_key = None
        # 控えも合わせて更新する。失敗しても保存は成功のまま返す ——
        # 控えが古いことと部品DBが保存できていないことは別の話で、
        # ここを混ぜると「正常なのに保存失敗の赤い帯が出る」ようになる。
        mirror_error = ''
        try:
            write_mirror(text, self.data_dir)
        except Exception as e:
            mirror_error = str(e)
        return {'ok': True, 'count': now, 'path': path, 'backup': backup,
                'mirror_error': mirror_error, 'error': ''}

    # ---- 公開API -------------------------------------------------------
    @staticmethod
    def _public(p):
        row = {k: p.get(k, '') for k in PUBLIC_FIELDS}
        row['has_outline'] = bool(p.get('outlineDxf'))
        return row

    def stats(self):
        d = self.load()
        path, _ = self.resolve()
        # writable は「このライブラリから保存できるか」。
        # setpath 済み(source='path')のときだけ真になり、控え(mirror)しか
        # 無いときは偽。CAD側はこれを見て、保存をサーバーに任せるか
        # 従来の File System Access API で書くかを決める。
        wpath, _ = self.writable_path()
        s = {'ok': d['ok'], 'count': len(d['parts']), 'source': d['source'],
             'path': path or '', 'error': d['error'],
             'writable': wpath is not None}
        if d['ok']:
            s['makers'] = sorted({(p.get('maker') or '') for p in d['parts']} - {''})
            s['types'] = sorted({(p.get('type') or '') for p in d['parts']} - {''})
            s['outline_count'] = sum(1 for p in d['parts'] if p.get('outlineDxf'))
        return s

    def search(self, q='', maker='', type_='', limit=100):
        """型番・メーカー・備考等の部分一致(大文字小文字を区別しない)。

        件数が数千なので、SQLiteを作らず素直に総当たりする。
        カタログDB(数万件)と違い、構築の手間とズレの原因を増やす価値が無い。
        """
        d = self.load()
        if not d['ok']:
            return []
        q = (q or '').strip().lower()
        maker = (maker or '').strip().lower()
        type_ = (type_ or '').strip().lower()
        out = []
        for p in d['parts']:
            if maker and maker not in (p.get('maker') or '').lower():
                continue
            if type_ and type_ != (p.get('type') or '').lower():
                continue
            if q and not any(q in str(p.get(f) or '').lower() for f in SEARCH_FIELDS):
                continue
            out.append(self._public(p))
            if limit and len(out) >= limit:
                break
        return out

    def get(self, ref):
        """型番の完全一致で1件。無ければ None。"""
        d = self.load()
        ref = (ref or '').strip()
        for p in d['parts']:
            if (p.get('ref') or '') == ref:
                return self._public(p)
        return None

    def outline(self, ref):
        """外形図DXFの中身。無ければ None。

        本文が大きいので search/get には含めず、明示的に取りに来たときだけ返す。
        """
        d = self.load()
        ref = (ref or '').strip()
        for p in d['parts']:
            if (p.get('ref') or '') == ref:
                return p.get('outlineDxf') or None
        return None


def find_candidates(roots=None, max_depth=6):
    """parts_db.json をディスクから探す。

    部品DBの場所はブラウザしか知らない(File System Access API は絶対パスを
    JSに渡さない)ので、盛田さん自身もパスを即答できない。setpath を使うために
    毎回エクスプローラで探させるのは無駄なので、こちらで探す。

    バックアップ(parts_db_backup_*.json)も拾う —— 本体が見つからないときの
    手がかりになるため。ただし本体と区別して返す。
    """
    if roots is None:
        roots = []
        home = os.path.expanduser('~')
        if os.path.isdir(home):
            roots.append(home)
        if os.name == 'nt':
            # Drive for Desktop は G: や I: に来ることが多い(環境で変わる)。
            # 実在するドライブだけを見る。
            for d in 'DEFGHIJKLMNOPQRSTUVWXYZ':
                if os.path.isdir(f'{d}:\\'):
                    roots.append(f'{d}:\\')

    # 入って意味が無い場所。ここを刈らないと何分もかかる。
    SKIP = {'node_modules', '.git', '__pycache__', 'AppData', 'Windows',
            'Program Files', 'Program Files (x86)', '$Recycle.Bin',
            'System Volume Information', '.cache', 'venv', '.venv'}
    found, backups, seen = [], [], set()
    for root in roots:
        root = os.path.abspath(root)
        base_depth = root.rstrip(os.sep).count(os.sep)
        for dirpath, dirnames, filenames in os.walk(root, onerror=lambda e: None):
            if dirpath.count(os.sep) - base_depth >= max_depth:
                dirnames[:] = []
                continue
            dirnames[:] = [d for d in dirnames if d not in SKIP and not d.startswith('.')]
            for fn in filenames:
                if fn == 'parts_db.json':
                    target = found
                elif fn.startswith('parts_db_backup_') and fn.endswith('.json'):
                    target = backups
                else:
                    continue
                full = os.path.join(dirpath, fn)
                if full in seen:
                    continue
                seen.add(full)
                try:
                    info = normalize(json.load(open(full, encoding='utf-8')))
                    target.append((full, len(info['customParts']),
                                   os.path.getmtime(full)))
                except Exception:
                    target.append((full, -1, os.path.getmtime(full)))
    # 件数が多い順。中身が空のファイルを先頭に出すと選び間違えるため。
    found.sort(key=lambda t: -t[1])
    backups.sort(key=lambda t: -t[2])
    return found, backups


# ----------------------------------------------------------------------------
# コマンドライン
# ----------------------------------------------------------------------------
def main(argv):
    cmd = argv[1] if len(argv) > 1 else 'stats'
    db = PartsDB()
    if cmd == 'setpath':
        if len(argv) < 3:
            print('使い方: py parts_db.py setpath <parts_db.jsonのパス>', file=sys.stderr)
            return 2
        print('設定しました:', db.set_path(argv[2]))
    elif cmd == 'find':
        import datetime
        print('parts_db.json を探しています(数十秒かかることがあります)...',
              flush=True)
        found, backups = find_candidates()
        if not found and not backups:
            print('見つかりませんでした。', file=sys.stderr)
            print('  CADの「部品登録」パネルで一度保存すると作られます。',
                  file=sys.stderr)
            return 1
        def show(rows, label):
            if not rows:
                return
            print(f'\n{label}:')
            for path, count, mtime in rows:
                t = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
                n = f'{count}件' if count >= 0 else '(読めません)'
                print(f'  {n:>10}  {t}  {path}')
        show(found, '部品DB本体')
        show(backups, 'バックアップ(参考。setpathには使わない)')
        if found:
            print(f'\n件数が一番多いものを設定するなら:')
            print(f'  py parts_db.py setpath "{found[0][0]}"')
    elif cmd == 'path':
        p, src = db.resolve()
        print(f'{p or "(未設定)"}  [{src}]')
    elif cmd == 'stats':
        s = db.stats()
        if not s['ok']:
            print('エラー:', s['error'], file=sys.stderr)
            return 1
        print(f"{s['count']}件  外形図{s['outline_count']}件  "
              f"メーカー{len(s['makers'])}社  種別{len(s['types'])}種")
        print(f"読み元: {s['path']}  [{s['source']}]")
    elif cmd == 'search':
        rows = db.search(argv[2] if len(argv) > 2 else '')
        for r in rows:
            print(f"{r['ref']}\t{r['maker']}\t{r['type']}\t{r['note']}")
        print(f'-- {len(rows)}件', file=sys.stderr)
    elif cmd == 'get':
        print(json.dumps(db.get(argv[2] if len(argv) > 2 else ''),
                         ensure_ascii=False, indent=2))
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
