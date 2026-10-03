#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parts_db.py — 部品DB(parts_db.json)の読み書き。ライブラリフォルダの中に置く。

**このファイル自体はサーバーではない。** ecad_v3 の server.py がこれをimportして使う。

■ ライブラリフォルダ(2026-10-03・再設計の段階1)
    PC間で共有するもの(部品DB。後の段階で図面枠・表題欄様式・登録シンボルも)は、
    **盛田さんが選んだ1つのフォルダ**に置く。場所は固定しない(ローカル・同期フォルダ・
    社内の共有フォルダのどれでもよい)。設計は HANDOFF.md「ライブラリの置き場所の再設計」。

        <ライブラリフォルダ>/
            parts_db.json      部品DB本体
            frames.json        図面枠テンプレート(段階2)
            titleblocks.json   表題欄の様式(段階2)
            symbols.json       登録シンボル(段階3)
            part_favorites.json  CADの部品パネルの「★よく使う」(段階4)
            backup/            保存のたびに溜まる世代バックアップ(古いものから消す)

    フォルダの場所はPCごとの設定 %LOCALAPPDATA%\\ecad\\parts_db_config.json に入る
    (キーは library_dir)。画面(CADの設定タブ/部品DB画面の「部品DBの場所」)で
    「フォルダを選ぶ」「探す」から設定する。コマンドなら `py parts_db.py setlib <フォルダ>`。

    旧形式の設定(キー path = parts_db.json のフルパス)は、そのファイルのあるフォルダを
    ライブラリフォルダとして読み替える(ファイル名が parts_db.json のときだけ)。

■ 見つからないとき
    設定のフォルダが無ければ、ドライブ文字だけ付け替えて探す(一瞬で済む)。それでも無ければ
    「見つかりません」を返す。**ディスク全体を勝手に探したり、古い控えを読んだりはしない**
    (同期ソフトやネットワークの準備待ちのことがあり、古い内容で動くのが一番困る)。
    以前あった控え(parts_db_mirror.json)と起動時の全走査は 2026-10-03 にやめた。

■ 【最重要】parts_db.json の書き手は「常に1つだけ」
    2つ以上が書くと、どちらかの書き込みが黙って失われるか、書きかけのJSONが
    残って次の起動で読めなくなる。2026-09-01に「保存できていないことに誰も
    気づけない」事故を起こしたファイルなので、ここは崩さない。
      1. 書き込み口は server.py の POST /api/parts/save と /api/parts/backup だけで、
         呼ぶのは部品DB画面(parts.html)だけ。CADは読むだけ。
      2. 場所が未設定・見つからないなら save() は失敗を返す(どこにも書かない)。
      3. **読んだ時点の版**(中身のハッシュ)を受け取り、ファイルがその後に変わっていたら
         書かない(別のPC・別の画面で保存された内容を黙って上書きしない)。
      4. 書く前に、今の中身を backup/ へ世代として残す。
      5. tmp に書いてから os.replace で置き換える(書きかけが本体にならない)。
"""
import datetime
import hashlib
import json
import os
import itertools
import re
import sys

APP_NAME = 'ecad'
CONFIG_NAME = 'parts_db_config.json'
PARTS_NAME = 'parts_db.json'
BACKUP_DIR_NAME = 'backup'
BACKUP_KEEP = 30            # 世代バックアップを何個まで残すか
# ライブラリフォルダに置くほかのファイル(2026-10-03 段階2)。画面から指定できるのはこの名前だけ
LIBRARY_FILES = {'frames': 'frames.json',            # 図面枠テンプレート(寸法・区画の組)
                 'titleblocks': 'titleblocks.json',  # 表題欄の様式(客先様式)
                 'symbols': 'symbols.json',          # 登録シンボル(段階3。{type: 定義}、キーの順がパレットの並び)
                 'partfavs': 'part_favorites.json'}  # CADの部品パネルの「★よく使う」(段階4。{型番: {at}})


def _backup_re(stem):
    """世代バックアップの名前(<stem>_YYYYMMDD_HHMMSS.json)。消してよいのはこの形に一致するものだけ。"""
    return re.compile(r'^' + re.escape(stem) + r'_\d{8}_\d{6}(_\d+)?\.json$')


# ----------------------------------------------------------------
# 同時に書いても混ざらない一時ファイル名
# ----------------------------------------------------------------
# 【2026-09-21】server.py をスレッド化したので、同じ固定名の tmp に2つの書き込みが
# 同時に入ると、混ざったものが os.replace で本体になる。書き手ごとに別の名前にする。
# 連番を足すのは、スレッドIDが終わったスレッドの間で再利用されるため。
_tmp_seq = itertools.count()


def _tmp_name(path):
    return '%s.%d.%d.tmp' % (path, os.getpid(), next(_tmp_seq))


def default_data_dir():
    """設定を置くローカルフォルダ(PCごと)。catalog_db.py と同じ場所を使う。

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


# ----------------------------------------------------------------------------
# ドライブ文字が変わったときの付け替え(2026-09-21)
#
# 盛田さん「なぜ固定パスを使っている、環境が変わったら動かんぞ」。設定に入っている絶対パスは
# 前に選んだ場所の控えであって、同期ソフト(Drive for Desktop等)のドライブ文字は環境で変わる
# (G: / I:)。末尾(ドライブから下)を手がかりに、実在するドライブへ当てる。一瞬で済む。
# ----------------------------------------------------------------------------
# テストから差し替えるための口。既定(None)は本番の挙動。
DRIVE_ROOTS = None   # 付け替えで当てにいく根
SCAN_ROOTS = None    # 「探す」(find_candidates)で探す根


def drive_roots():
    """実在するドライブの根。Windows以外では空(当てる先が無い)。"""
    if DRIVE_ROOTS is not None:
        return list(DRIVE_ROOTS)
    if os.name != 'nt':
        return []
    return [f'{d}:\\' for d in 'CDEFGHIJKLMNOPQRSTUVWXYZ' if os.path.isdir(f'{d}:\\')]


def path_tail(path):
    """ドライブ(根)から下の部分。`I:\\マイドライブ\\lib` → `マイドライブ\\lib`"""
    full = os.path.abspath(path)
    for root in sorted(drive_roots(), key=len, reverse=True):
        r = root.rstrip('\\/')
        if r and (full == r or full.startswith(r + os.sep)):
            return full[len(r):].lstrip('\\/')
    _drive, rest = os.path.splitdrive(full)
    return rest.lstrip('\\/')


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

    古い版のファイルは配列そのものだった。hiddenBuiltinRefs は標準部品の非表示機能
    (2026-10-03に廃止)の名残で、読めるように残してあるだけ。
    """
    if isinstance(data, list):
        return {'customParts': data, 'hiddenBuiltinRefs': []}
    if isinstance(data, dict):
        return {'customParts': data.get('customParts') or [],
                'hiddenBuiltinRefs': data.get('hiddenBuiltinRefs') or []}
    raise ValueError('parts_db.json の形式が想定と違います(配列でもオブジェクトでもない)')


def is_suspicious_drop(prev, now):
    """件数が大きく減った上書きを疑う。1件ずつの削除は通し、「全部消えた」「半分以下になった」だけ止める。"""
    if prev is None or prev <= 0:
        return False
    if now == 0:
        return True
    return prev >= 10 and now < prev / 2


# ----------------------------------------------------------------------------
# カタログを土台にする(2026-10-03 再設計の段階4・盛田さんの決定(2) (b))
#
# 部品DBとしては全件を持つ(カタログ catalog_pending の全型番)。parts_db.json に入れるのは
#   ・カタログに無い、自分で足した部品(全項目)
#   ・カタログの部品のうち、自分で直した項目だけ(＋直した時点のカタログの値 _catalog)
#   ・外形図DXF(outlineDxf / outlineDxfName)など、カタログに無い項目
# 読むときはカタログに重ねる(merge_with_catalog)。保存するときは差分に戻す(overlay_from)。
# カタログCSVを直せば、自分で直していない項目にはそのまま流れる(全件作り直しは要らない)。
# 自分で直した項目のカタログ側が後で変わったら _catalogChanged で知らせる。
# ----------------------------------------------------------------------------
CATALOG_FIELDS = ('maker', 'type', 'volt', 'amp', 'terminals', 'contacts', 'note', 'source', 'catalogUrl')


def _clean_part(p):
    """画面だけで使う印(_で始まるキー)と、廃止した custom フラグを落とす。"""
    return {k: v for k, v in p.items() if not str(k).startswith('_') and k != 'custom'}


def merge_with_catalog(catalog_rows, overlay):
    """カタログの全件に parts_db.json の中身を重ねた一覧を返す。

    各部品に画面用の印を付ける:
      _origin          'catalog'(カタログのまま) / 'edited'(自分で直した項目がある) / 'own'(自分で足した)
      _catalogValues   直した項目の、今のカタログの値 {項目: 値}(「カタログの内容に戻す」に使う)
      _catalogChanged  直した後にカタログ側が変わった項目の一覧
    """
    ov = {}
    for p in overlay or []:
        if isinstance(p, dict) and p.get('ref'):
            ov[p['ref']] = p
    out, seen = [], set()
    for row in catalog_rows or []:
        ref = (row.get('ref') or '').strip()
        if not ref or ref in seen:
            continue
        seen.add(ref)
        part = {'ref': ref}
        for f in CATALOG_FIELDS:
            part[f] = row.get(f) or ''
        o = ov.get(ref)
        if o is None:
            part['_origin'] = 'catalog'
        else:
            snap = o.get('_catalog') or {}
            # 値がカタログと違う項目だけを「直した」とみなす(以前のカタログ丸写しの parts_db.json を直した扱いにしない)
            overridden = [f for f in CATALOG_FIELDS if f in o and (o[f] or '') != part[f]]
            extra = {k: v for k, v in _clean_part(o).items() if k not in CATALOG_FIELDS and k != 'ref'}
            part['_catalogValues'] = {f: part[f] for f in overridden}
            changed = [f for f in overridden if f in snap and (snap[f] or '') != part[f]]
            for f in overridden:
                part[f] = o[f]
            part.update(extra)
            part['_origin'] = 'edited' if overridden else 'catalog'
            if changed:
                part['_catalogChanged'] = changed
        out.append(part)
    for ref, o in ov.items():
        if ref in seen:
            continue
        part = _clean_part(o)
        part['_origin'] = 'own'
        out.append(part)
    return out


def overlay_from(catalog_rows, merged, old_overlay=None):
    """画面から来た一覧(カタログに重ねた形)を、parts_db.json に入れる差分に戻す。

    直した項目の「直した時点のカタログの値」(_catalog)は、同じ値のまま直し続けている間は
    前回のものを引き継ぐ(引き継がないと、カタログ側が変わったことに気づけなくなる)。
    """
    cat = {}
    for row in catalog_rows or []:
        ref = (row.get('ref') or '').strip()
        if ref and ref not in cat:
            cat[ref] = row
    old = {p.get('ref'): p for p in (old_overlay or []) if isinstance(p, dict) and p.get('ref')}
    out = []
    for p in merged or []:
        if not isinstance(p, dict) or not (p.get('ref') or '').strip():
            continue
        ref = p['ref'].strip()
        clean = _clean_part(p)
        clean['ref'] = ref
        row = cat.get(ref)
        if row is None:
            out.append(clean)          # 自分で足した部品は全項目
            continue
        d = {'ref': ref}
        snap = {}
        prev = old.get(ref) or {}
        prev_snap = prev.get('_catalog') or {}
        for f in CATALOG_FIELDS:
            v = clean.get(f, '') or ''
            c = row.get(f) or ''
            if v != c:
                d[f] = v
                # 同じ値で直し続けているなら、直した時点のカタログの値を引き継ぐ
                snap[f] = prev_snap[f] if (f in prev and (prev.get(f) or '') == v and f in prev_snap) else c
        for k, v in clean.items():
            if k not in CATALOG_FIELDS and k != 'ref' and v not in ('', None, [], {}):
                d[k] = v               # 外形図DXFなど、カタログに無い項目
        if snap:
            d['_catalog'] = snap
        if len(d) > 1:
            out.append(d)
    return out


def file_version(path):
    """ファイルの版(中身のハッシュ)。保存のときに「読んだ後に変わっていないか」を見る。無ければ ''。

    更新日時ではなく中身で見る。同期ソフトが中身を変えずに更新日時だけ触ることがあり、
    そのたびに「他で更新されています」と出ると使えないため。
    """
    try:
        with open(path, 'rb') as f:
            return hashlib.sha1(f.read()).hexdigest()
    except OSError:
        return ''


def _write_json(path, obj):
    """tmp に書いてから置き換える(書きかけが本体にならない)。"""
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    tmp = _tmp_name(path)
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())   # 電源断で空のファイルが本体にならないよう、置換の前に書き切る
    os.replace(tmp, path)


class PartsDB:
    """部品DBの読み書き。

    毎回ファイルを読み直す(版が変わっていなければ前回の内容を使い回す)ので、
    別の画面・別のPCで保存された内容がそのまま次の読み込みに出る。
    """

    def __init__(self, data_dir=None):
        self.data_dir = data_dir or default_data_dir()
        self._cache = None
        self._cache_key = None

    # ---- ライブラリフォルダ --------------------------------------------
    def configured_dir(self):
        """設定されているライブラリフォルダ。旧形式(path)なら読み替える。未設定は ''。"""
        cfg = load_config(self.data_dir)
        d = (cfg.get('library_dir') or '').strip()
        if d:
            return d
        old = (cfg.get('path') or '').strip()
        if old and os.path.basename(old) == PARTS_NAME:
            return os.path.dirname(old)
        return ''

    def _configured_tail(self):
        cfg = load_config(self.data_dir)
        t = (cfg.get('library_tail') or '').strip()
        if t:
            return t
        old = (cfg.get('path_tail') or '').strip()
        if old and old.replace('/', '\\').split('\\')[-1] == PARTS_NAME:
            return old[:-len(PARTS_NAME)].rstrip('\\/')
        return ''

    def set_library(self, folder, create=False):
        """ライブラリフォルダを設定する。

        **HTTPから任意のパスを受け取って呼ばない**(画面から送ったパスでサーバーに任意の
        ファイルを読ませられるため)。画面からは、盛田さんがWindowsの窓で選んだフォルダか、
        サーバー自身が探した候補だけを渡す(server.py の handle_parts_place)。

        フォルダに parts_db.json が無いとき: create=True なら空の部品DBを作る。
        False なら FileNotFoundError(画面で「作りますか？」と聞くため)。
        **既にある parts_db.json には書かない**(中身を作り直すのは部品DB画面の「カタログ全件で作り直す」)。
        """
        folder = os.path.abspath(os.path.expanduser(folder))
        if not os.path.isdir(folder):
            raise FileNotFoundError(f'フォルダが見つかりません: {folder}')
        p = os.path.join(folder, PARTS_NAME)
        if os.path.isfile(p):
            with open(p, encoding='utf-8') as f:
                normalize(json.load(f))   # 読める形か確認(壊れたファイルを設定しない)
        elif create:
            _write_json(p, {'customParts': [], 'hiddenBuiltinRefs': []})
        else:
            raise FileNotFoundError(f'このフォルダには部品DB({PARTS_NAME})がありません: {folder}')
        cfg = load_config(self.data_dir)
        cfg.pop('path', None)
        cfg.pop('path_tail', None)
        cfg['library_dir'] = folder
        # ドライブ文字が変わったときの手がかり。正は library_dir で、こちらは保険。
        cfg['library_tail'] = path_tail(folder)
        save_config(cfg, self.data_dir)
        return folder

    def _recover_by_tail(self):
        """ドライブ文字だけ変わった場合の付け替え。見つけたら設定も書き換える。"""
        tail = self._configured_tail()
        if not tail:
            return None
        for root in drive_roots():
            cand = os.path.join(root, tail)
            if os.path.isfile(os.path.join(cand, PARTS_NAME)):
                try:
                    self.set_library(cand)
                except Exception:
                    pass
                return cand
        return None

    def resolve(self):
        """(parts_db.json のパス, 由来) を返す。見つからなければ (None, 理由)。

        由来: path(設定どおり) / path_recovered(ドライブ文字を付け替えて見つけた)
        理由: unset(未設定) / path_missing(設定のフォルダかファイルが無い)
        """
        d = self.configured_dir()
        if not d:
            return None, 'unset'
        p = os.path.join(d, PARTS_NAME)
        if os.path.isfile(p):
            return p, 'path'
        r = self._recover_by_tail()
        if r:
            return os.path.join(r, PARTS_NAME), 'path_recovered'
        return None, 'path_missing'

    def missing_message(self):
        d = self.configured_dir()
        if os.path.isdir(d):
            return (f'ライブラリフォルダに部品DB({PARTS_NAME})がありません: {d}。'
                    '「部品DBの場所」の「フォルダを選ぶ」で選び直してください')
        return (f'ライブラリフォルダが見つかりません: {d}。'
                '同期ソフト(Googleドライブ等)やネットワークの準備がまだかもしれません。'
                '準備ができたら「もう一度確かめる」を押すか、「フォルダを選ぶ」で選び直してください')

    # ---- 読み込み ------------------------------------------------------
    def load(self):
        """{'ok':bool, 'parts':[...], 'hidden':[...], 'source':str, 'error':str, 'version':str}"""
        path, source = self.resolve()
        if path is None:
            err = (self.missing_message() if source == 'path_missing' else
                   '部品DBの場所(ライブラリフォルダ)が未設定です。'
                   '「部品DBの場所」の「フォルダを選ぶ」「探す」で設定してください')
            return {'ok': False, 'parts': [], 'hidden': [], 'source': source,
                    'error': err, 'version': ''}
        try:
            ver = file_version(path)
            key = (path, ver)
            if self._cache_key != key:
                with open(path, encoding='utf-8') as f:
                    self._cache = normalize(json.load(f))
                self._cache_key = key
        except Exception as e:
            # 読めなかったときに前回のキャッシュを返さない(壊れているのに古い内容で動き続けない)
            self._cache = None
            self._cache_key = None
            return {'ok': False, 'parts': [], 'hidden': [], 'source': source,
                    'error': f'部品DBを読めませんでした({path}): {e}', 'version': ''}
        return {'ok': True, 'parts': self._cache['customParts'],
                'hidden': self._cache['hiddenBuiltinRefs'],
                'source': source, 'error': '', 'version': ver}

    # ---- 書き込み(部品DB画面の保存経路) -------------------------------
    def writable_path(self):
        """保存先の parts_db.json。書けないときは (None, 理由)。"""
        p, source = self.resolve()
        return (p, source) if p else (None, source)

    def _count_on_disk(self, path):
        """今ファイルに入っている件数。読めなければ None(=比較しない)。"""
        try:
            with open(path, encoding='utf-8') as f:
                return len(normalize(json.load(f))['customParts'])
        except Exception:
            return None

    def _backup_file(self, path):
        """今のファイル(parts_db.json 等)を <ライブラリ>/backup/ に世代として残し、古いものから消す。

        中身は「今ディスクにあるもの」(これから書く内容ではない)。戻したいのは上書きされる前の方。
        消すのは _backup_re(ファイル名の幹) に一致する自分の作った名前だけ。
        """
        folder = os.path.join(os.path.dirname(path), BACKUP_DIR_NAME)
        os.makedirs(folder, exist_ok=True)
        stem = os.path.splitext(os.path.basename(path))[0]
        pat = _backup_re(stem)
        base = stem + '_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        name = base + '.json'
        for i in range(2, 100):   # 同じ秒に2回でも上書きしない
            if not os.path.exists(os.path.join(folder, name)):
                break
            name = f'{base}_{i}.json'
        dst = os.path.join(folder, name)
        with open(path, encoding='utf-8') as f:
            body = f.read()
        tmp = _tmp_name(dst)
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write(body)
        os.replace(tmp, dst)
        olds = sorted(n for n in os.listdir(folder) if pat.match(n))
        for n in olds[:-BACKUP_KEEP] if len(olds) > BACKUP_KEEP else []:
            try:
                os.remove(os.path.join(folder, n))
            except OSError:
                pass   # 消せなくても保存は続ける
        return name

    def backup(self):
        """破壊的な操作の前の退避(部品DB画面の「カタログ全件で作り直す」)。"""
        path, why = self.writable_path()
        if path is None:
            return {'ok': False, 'reason': why, 'name': '',
                    'error': '部品DBの場所が未設定か、見つかりません'}
        try:
            name = self._backup_file(path)
        except Exception as e:
            return {'ok': False, 'reason': 'error', 'name': '', 'error': str(e)}
        return {'ok': True, 'name': f'{BACKUP_DIR_NAME}/{name}', 'error': ''}

    def save(self, data, force=False, base_version=None, catalog_rows=None):
        """部品DBを保存する。**部品DB画面の保存経路。他からは呼ばない。**

        catalog_rows を渡したとき(段階4〜 server.py は常に渡す): data はカタログに重ねた一覧で、
        カタログとの差分(overlay_from)にして書く。件数激減の確認は重ねた後の件数で比べる。
        戻り値は必ず ok を含む dict(例外にしない。保存できなかったことを画面に出すため)。
          reason='conflict' … 読んだ後に別の画面・別のPCで保存されていた(書かない。force でも通さない)
          reason='drop'     … 件数が激減(書かない。人が確かめて force=True で送り直したときだけ書く)
        """
        path, why = self.writable_path()
        if path is None:
            return {'ok': False, 'reason': why, 'count': 0, 'path': '',
                    'error': (self.missing_message() if why == 'path_missing' else
                              '部品DBの場所(ライブラリフォルダ)が未設定です'
                              '(「部品DBの場所」の「フォルダを選ぶ」「探す」で設定してください)')}
        cur = file_version(path)
        if not base_version or base_version != cur:
            return {'ok': False, 'reason': 'conflict', 'count': 0, 'path': path, 'version': cur,
                    'error': ('部品DBが、読み込んだ後に別の画面か別のPCで保存されています。'
                              '上書きしないよう保存を止めました。読み直してから、もう一度変更してください')
                             if base_version else
                             '画面が古い版です。部品DB画面を再読み込み(Ctrl+Shift+R)してください'}
        try:
            info = normalize(data)
        except Exception as e:
            return {'ok': False, 'reason': 'bad_data', 'count': 0, 'path': path,
                    'error': f'保存する中身の形が違います: {e}'}
        now = len(info['customParts'])
        prev = self._count_on_disk(path)
        if catalog_rows is not None:
            try:
                with open(path, encoding='utf-8') as f:
                    old = normalize(json.load(f))['customParts']
            except Exception:
                old = []
            prev = len(merge_with_catalog(catalog_rows, old))
            info['customParts'] = overlay_from(catalog_rows, info['customParts'], old)
        if is_suspicious_drop(prev, now) and not force:
            return {'ok': False, 'reason': 'drop', 'prev': prev, 'now': now,
                    'count': prev or 0, 'path': path,
                    'error': f'部品DBの件数が {prev} 件から {now} 件に減っています'}
        try:
            backup = self._backup_file(path)
        except Exception as e:
            return {'ok': False, 'reason': 'error', 'count': 0, 'path': path,
                    'error': f'保存の前のバックアップを書けなかったので、保存を止めました({e})'}
        try:
            _write_json(path, info)
        except Exception as e:
            return {'ok': False, 'reason': 'error', 'count': 0, 'path': path,
                    'error': f'部品DBを保存できませんでした({path}): {e}'}
        self._cache = None
        self._cache_key = None
        return {'ok': True, 'count': now, 'path': path, 'version': file_version(path),
                'backup': f'{BACKUP_DIR_NAME}/{backup}', 'error': ''}

    # ---- ライブラリのほかのファイル(図面枠テンプレート・表題欄様式。2026-10-03 段階2) ----
    #
    # 中身は {キー: 定義} のオブジェクト1つ。書くのはCAD(図面枠のパネル)。parts_db.json と同じく
    # 版の確認・世代バックアップ・tmp経由の置き換えをする。ライブラリフォルダの場所は parts_db.json と同じ
    # (parts_db.json があるフォルダ。部品DBが未設定・見つからないなら、これらも読み書きしない)。
    def _library_file(self, kind):
        name = LIBRARY_FILES.get(kind)
        if not name:
            raise ValueError(f'ライブラリのファイルの種類が違います: {kind}')
        p, source = self.resolve()
        if p is None:
            return None, source
        return os.path.join(os.path.dirname(p), name), source

    def read_library(self, kind):
        """{'ok', 'source', 'data', 'version', 'error'}。ファイルがまだ無ければ data={}・source='nofile'。"""
        path, source = self._library_file(kind)
        if path is None:
            return {'ok': False, 'source': source, 'data': {}, 'version': '',
                    'error': self.missing_message() if source == 'path_missing'
                    else '部品DBの場所(ライブラリフォルダ)が未設定です'}
        if not os.path.isfile(path):
            return {'ok': True, 'source': 'nofile', 'data': {}, 'version': '', 'error': ''}
        try:
            ver = file_version(path)
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
            if not isinstance(data, dict):
                raise ValueError('中身がオブジェクトではありません')
        except Exception as e:
            return {'ok': False, 'source': source, 'data': {}, 'version': '',
                    'error': f'{os.path.basename(path)} を読めませんでした({path}): {e}'}
        return {'ok': True, 'source': source, 'data': data, 'version': ver, 'error': ''}

    def save_library(self, kind, data, base_version=None):
        """保存。版が読んだ時点と違えば reason='conflict' で書かない(ファイルがまだ無いときの版は '')。"""
        path, source = self._library_file(kind)
        if path is None:
            return {'ok': False, 'reason': source,
                    'error': (self.missing_message() if source == 'path_missing' else
                              '部品DBの場所(ライブラリフォルダ)が未設定です。設定タブの「部品DB」で設定してください')}
        if not isinstance(data, dict) or not all(isinstance(v, dict) for v in data.values()):
            return {'ok': False, 'reason': 'bad_data', 'error': '保存する中身の形が違います({キー: 定義} の形)'}
        cur = file_version(path)
        if base_version is None or base_version != cur:
            return {'ok': False, 'reason': 'conflict', 'version': cur,
                    'error': (f'{os.path.basename(path)} が、読み込んだ後に別の画面か別のPCで保存されています。'
                              '上書きしないよう保存を止めました。読み直したので、もう一度操作してください')
                             if base_version is not None else
                             '画面が古い版です。再読み込み(Ctrl+Shift+R)してください'}
        try:
            if cur:
                self._backup_file(path)
            _write_json(path, data)
        except Exception as e:
            return {'ok': False, 'reason': 'error', 'error': f'保存できませんでした({path}): {e}'}
        return {'ok': True, 'version': file_version(path), 'path': path, 'error': ''}

    def stats(self):
        d = self.load()
        path, _ = self.resolve()
        s = {'ok': d['ok'], 'count': len(d['parts']), 'source': d['source'],
             'path': path or '', 'library_dir': self.configured_dir(),
             'error': d['error'], 'writable': path is not None}
        if d['ok']:
            s['outline_count'] = sum(1 for p in d['parts'] if p.get('outlineDxf'))
        return s


def find_candidates(roots=None, max_depth=6):
    """parts_db.json をディスクから探す。画面の「探す」とコマンド find が使う(自動では走らせない)。

    戻り値: [(parts_db.jsonのパス, 件数(読めなければ-1), 更新日時), ...] 件数の多い順。
    """
    if roots is None:
        roots = []
        home = os.path.expanduser('~')
        if os.path.isdir(home):
            roots.append(home)
        if os.name == 'nt':
            # 同期ソフト(Drive for Desktop等)は G: や I: に来ることが多い(環境で変わる)
            for d in 'DEFGHIJKLMNOPQRSTUVWXYZ':
                if os.path.isdir(f'{d}:\\'):
                    roots.append(f'{d}:\\')

    # 入って意味が無い場所。ここを刈らないと何分もかかる。
    SKIP = {'node_modules', '.git', '__pycache__', 'AppData', 'Windows',
            'Program Files', 'Program Files (x86)', '$Recycle.Bin',
            'System Volume Information', '.cache', 'venv', '.venv', BACKUP_DIR_NAME}
    found, seen = [], set()
    for root in roots:
        root = os.path.abspath(root)
        base_depth = root.rstrip(os.sep).count(os.sep)
        for dirpath, dirnames, filenames in os.walk(root, onerror=lambda e: None):
            if dirpath.count(os.sep) - base_depth >= max_depth:
                dirnames[:] = []
                continue
            dirnames[:] = [d for d in dirnames if d not in SKIP and not d.startswith('.')]
            if PARTS_NAME not in filenames:
                continue
            full = os.path.join(dirpath, PARTS_NAME)
            if full in seen:
                continue
            seen.add(full)
            try:
                with open(full, encoding='utf-8') as f:
                    n = len(normalize(json.load(f))['customParts'])
            except Exception:
                n = -1
            found.append((full, n, os.path.getmtime(full)))
    # 件数が多い順。中身が空のファイルを先頭に出すと選び間違えるため。
    found.sort(key=lambda t: -t[1])
    return found


# ----------------------------------------------------------------------------
# コマンドライン
# ----------------------------------------------------------------------------
def main(argv):
    cmd = argv[1] if len(argv) > 1 else 'stats'
    db = PartsDB()
    if cmd == 'setlib':
        if len(argv) < 3:
            print('使い方: py parts_db.py setlib <ライブラリフォルダ>', file=sys.stderr)
            return 2
        print('設定しました:', db.set_library(argv[2]))
    elif cmd == 'find':
        print('parts_db.json を探しています(数十秒かかることがあります)...', flush=True)
        found = find_candidates()
        if not found:
            print('見つかりませんでした。部品DB画面(部品DBを開く.bat)の「部品DBの場所」→'
                  '「フォルダを選ぶ」で、空のフォルダを選ぶと作れます。', file=sys.stderr)
            return 1
        for path, count, mtime in found:
            t = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
            n = f'{count}件' if count >= 0 else '(読めません)'
            print(f'  {n:>10}  {t}  {os.path.dirname(path)}')
        print(f'\n件数が一番多いものを設定するなら:')
        print(f'  py parts_db.py setlib "{os.path.dirname(found[0][0])}"')
    elif cmd == 'path':
        p, src = db.resolve()
        print(f'{p or "(未設定)"}  [{src}]')
    elif cmd == 'stats':
        s = db.stats()
        if not s['ok']:
            print('エラー:', s['error'], file=sys.stderr)
            return 1
        print(f"{s['count']}件  外形図{s['outline_count']}件")
        print(f"読み元: {s['path']}  [{s['source']}]")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
