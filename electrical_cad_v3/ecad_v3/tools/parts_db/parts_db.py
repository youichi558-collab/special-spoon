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

■ 【最重要】このライブラリは parts_db.json に絶対に書き込まない
    parts_db.json はCADがブラウザの File System Access API で書いている。
    そこへサーバーが同時に書くと、どちらかの書き込みが失われるか、
    書きかけのJSONが残って次の起動で読めなくなる。
    2026-09-01に「保存できていないことに誰も気づけない」事故を起こしたばかりの
    ファイルなので、書き手は1つに保つ。
    → 公開するのは read 系のみ。write/set/delete に相当するAPIは用意しない。

■ 部品DBの実体をどうやって見つけるか
    2通りある。上から順に試す。

    1. パス設定(推奨・CADを起動していなくても読める)
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

■ 消したくなったら
    このフォルダ(tools/parts_db/)を削除すれば元の状態に戻る。
    parts_db.json 自体には一度も触っていないので、部品DBは無傷。
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

    # ---- 公開API -------------------------------------------------------
    @staticmethod
    def _public(p):
        row = {k: p.get(k, '') for k in PUBLIC_FIELDS}
        row['has_outline'] = bool(p.get('outlineDxf'))
        return row

    def stats(self):
        d = self.load()
        path, _ = self.resolve()
        s = {'ok': d['ok'], 'count': len(d['parts']), 'source': d['source'],
             'path': path or '', 'error': d['error'], 'readonly': True}
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
