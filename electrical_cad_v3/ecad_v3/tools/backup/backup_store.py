#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""backup_store.py — 図面の世代バックアップ(ファイル)の読み書き

【なぜ要るか・2026-09-20】
CADには元々「自動保存」があるが、置き場所はブラウザの中(localStorage)で、
現行＋1世代前しか持たない。2026-08-23に図面が全部消えた事故では、
JSONファイルさえあれば復旧できた(HANDOFF「今回もファイルがあれば復旧できた」)。
他のCADが持っている「一定時間ごとにファイルへ控えを取り、件数が溜まったら
古いものから消す」仕組みが無かった。

【名前】盛田さんの指摘「自動保存という言葉は既にある機能とダブる」を受けて、
  ・ブラウザの中(localStorage)  → 従来どおり「自動保存」
  ・フォルダにファイルで溜まる  → 「バックアップ」
と呼び分ける。AutoCADの .sv$(自動保存)と .bak(バックアップファイル)、
Jw_cadの「バックアップファイル数」と同じ使い分け。

【なぜサーバー側に置くか】
ブラウザは自分でファイルを書けない(ダウンロードフォルダが溢れるか、
File System Access APIで毎回許可が要る)。部品DBの保存を
tools/parts_db/parts_db.py へ移したのと同じ理由で、書き手はサーバーに置く。

【壊さないための作り】
  ・書きかけを残さない: .tmp に書いてから os.replace で置き換える
    (parts_db.py と同じ。途中で落ちても中身が欠けたファイルが残らない)
  ・消すのは自分が作った名前のファイルだけ。他のファイルには触らない
  ・名前にパス区切りや .. が混ざっていたら受け付けない
"""
import json
import os
import re
import time

# バックアップファイルの名前:  <図面名>_20260920_143005.json
# 消してよいのはこの形に一致するものだけ。人が置いた別のファイルは消さない。
_STAMP = r'\d{8}_\d{6}'
_NAME_RE = re.compile(r'^(?P<base>.+)_(?P<stamp>' + _STAMP + r')\.json$')

# 図面名に使えない文字(Windowsのファイル名禁止文字＋制御文字)は落とす
_BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')

DEFAULT_KEEP = 30
MAX_KEEP = 999          # Jw_cadのバックアップファイル数と同程度の上限
MAX_BYTES = 64 * 1024 * 1024   # 1ファイルの上限(暴走で埋め尽くさないため)


def _safe_base(name):
    """図面名をファイル名に使える形にする。空になったら '図面'。"""
    s = _BAD.sub('_', str(name or '')).strip().strip('.')
    return s[:80] or '図面'


class BackupStore:
    def __init__(self, directory):
        self.dir = os.path.abspath(directory)

    # ---- 一覧 -------------------------------------------------------
    def list(self):
        """新しい順に返す。フォルダが無ければ空。"""
        out = []
        try:
            names = os.listdir(self.dir)
        except OSError:
            return {'ok': True, 'dir': self.dir, 'files': []}
        for n in names:
            m = _NAME_RE.match(n)
            if not m:
                continue          # 自分が作った形以外は一覧にも出さない
            p = os.path.join(self.dir, n)
            try:
                st = os.stat(p)
            except OSError:
                continue
            out.append({'name': n, 'base': m.group('base'),
                        'stamp': m.group('stamp'),
                        'size': st.st_size, 'mtime': int(st.st_mtime)})
        # 名前のタイムスタンプで並べる(mtimeはコピー等でずれることがある)
        out.sort(key=lambda x: x['stamp'], reverse=True)
        return {'ok': True, 'dir': self.dir, 'files': out}

    # ---- 1件読む ----------------------------------------------------
    def get(self, name):
        """一覧に出ている名前のファイルだけ読む。

        名前は「このフォルダ直下の、自分が作った形のファイル」に限る。
        パス区切りや .. が混ざったものは弾く(外のファイルを読ませない)。
        """
        if not isinstance(name, str) or not _NAME_RE.match(name):
            return {'ok': False, 'error': 'バックアップの名前ではありません'}
        if os.path.basename(name) != name:
            return {'ok': False, 'error': 'バックアップの名前ではありません'}
        p = os.path.join(self.dir, name)
        # 念のため、実際の場所がこのフォルダ直下であることも確かめる
        if os.path.dirname(os.path.abspath(p)) != self.dir:
            return {'ok': False, 'error': 'バックアップの名前ではありません'}
        try:
            with open(p, 'r', encoding='utf-8') as f:
                return {'ok': True, 'name': name, 'data': json.load(f)}
        except FileNotFoundError:
            return {'ok': False, 'error': 'そのバックアップはありません'}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    # ---- 保存＋古いものを消す --------------------------------------
    def save(self, data, name='図面', keep=DEFAULT_KEEP, stamp=None):
        """1件書いて、同じ図面名のものが keep 件を超えたら古い順に消す。

        消すのは **同じ図面名の** バックアップだけ。別の図面の控えは減らさない
        (「A図面を触り続けたせいでB図面の控えが全部消えた」を起こさないため)。
        """
        if data is None:
            return {'ok': False, 'error': '中身がありません'}
        try:
            keep = int(keep)
        except (TypeError, ValueError):
            keep = DEFAULT_KEEP
        keep = max(1, min(MAX_KEEP, keep))

        base = _safe_base(name)
        body = json.dumps(data, ensure_ascii=False, indent=1)
        if len(body.encode('utf-8')) > MAX_BYTES:
            return {'ok': False, 'error': 'バックアップが大きすぎます'}

        st = stamp or time.strftime('%Y%m%d_%H%M%S')
        fname = f'{base}_{st}.json'
        path = os.path.join(self.dir, fname)
        try:
            os.makedirs(self.dir, exist_ok=True)
            # 書きかけを残さない: tmpに書き切ってから置き換える
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(body)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except Exception as e:
            try:
                if os.path.exists(path + '.tmp'):
                    os.remove(path + '.tmp')
            except OSError:
                pass
            return {'ok': False, 'error': str(e)}

        deleted = self._rotate(base, keep)
        return {'ok': True, 'file': fname, 'dir': self.dir,
                'bytes': len(body.encode('utf-8')),
                'kept': keep, 'deleted': deleted}

    def _rotate(self, base, keep):
        """同じ図面名の控えが keep 件を超えた分を、古い方から消す。"""
        mine = [f for f in self.list()['files'] if f['base'] == base]
        deleted = []
        for f in mine[keep:]:            # listは新しい順なので、keep件目以降が古い
            try:
                os.remove(os.path.join(self.dir, f['name']))
                deleted.append(f['name'])
            except OSError:
                pass
        return deleted
