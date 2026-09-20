#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""カタログCSVから、カタログDBと部品DBをまとめて作り直す。

    py tools\\rebuild_parts_db.py          (Windows。確認あり)
    py tools\\rebuild_parts_db.py --yes    (確認なし)

【なぜ作ったか・2026-09-20】
Coworkがカタログ36ファイル・635型番に端子グループ・出典・カタログURLを入れたが、
それが部品DBへ入るまでに **画面での操作が3つ**(再取込 → 検索 → 全件作り直し)あり、
さらに `catalog_db.py` を直した直後は **server.py の再起動**も要る。
盛田さんが4〜5回やっても直らず、原因の切り分けだけで長くかかった。

そこで **1回実行すれば終わる口** をここに用意した。
やることは画面と同じで、違うのは読む元が **リポジトリの `catalog_pending/`** で
あること(Driveの同期待ちも、フォルダ選択ダイアログも要らない)。

  1. catalog_pending/*.csv を `import_files` に渡す(画面の「再取込」と同じ経路。
     設定 csv_dir も画面と同じキャッシュに揃うので、あとで画面から触っても壊れない)
  2. できたカタログDBの全件を読む
  3. 今の部品DBを退避してから、全件で作り直す
     - **外形図DXFの紐付けは型番で引き継ぐ**(画面の carryOutlineDxf と同じ)
     - 非表示にした標準部品(hiddenBuiltinRefs)もそのまま残す

実行後は **ブラウザを Ctrl+Shift+R** で読み直すこと(CADは起動時に部品DBを
まるごとメモリに読むので、開いたままだと古い内容のまま)。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, 'catalog_db'))
sys.path.insert(0, os.path.join(HERE, 'parts_db'))
import catalog_db  # noqa: E402
import parts_db    # noqa: E402

CSV_DIR = os.path.join(APP, 'catalog_pending')


def main(argv):
    yes = '--yes' in argv or '-y' in argv

    # ---- 1) カタログCSVを読む ------------------------------------------
    if not os.path.isdir(CSV_DIR):
        print(f'カタログCSVのフォルダがありません: {CSV_DIR}')
        return 1
    files = []
    for name in sorted(os.listdir(CSV_DIR)):
        if name.lower().endswith('.csv') and not name.startswith('~$'):
            with open(os.path.join(CSV_DIR, name), encoding='utf-8-sig') as f:
                files.append({'name': name, 'text': f.read()})
    if not files:
        print(f'CSVが1つもありません: {CSV_DIR}')
        return 1
    print(f'[1/3] カタログCSV {len(files)}ファイルを読みました ({CSV_DIR})')

    # ---- 2) カタログDBを作り直す ---------------------------------------
    cdb = catalog_db.CatalogDB()
    res = cdb.import_files(files)
    cdb.set_source_label('catalog_pending（リポジトリ）')
    rows = cdb.search('', '', '', 100000)
    n_url = sum(1 for r in rows if (r.get('catalogUrl') or '').strip())
    n_src = sum(1 for r in rows if (r.get('source') or '').strip())
    n_grp = sum(1 for r in rows if ':' in (r.get('terminals') or '')
                or '：' in (r.get('terminals') or ''))
    print(f'[2/3] カタログDB {len(rows)}件'
          f'（出典 {n_src} ／ カタログURL {n_url} ／ 端子がグループ形式 {n_grp}）')
    if res.get('bad'):
        print('   読めなかった行:')
        for b in res['bad'][:10]:
            print('    -', b)
    if not rows:
        print('   カタログDBが空です。作り直しは中止します。')
        return 1
    if n_url == 0:
        print('   ⚠ カタログURLが0件です。CSVが10列になっていない可能性があります。')

    # ---- 3) 部品DBを作り直す -------------------------------------------
    pdb = parts_db.PartsDB()
    cur = pdb.load()
    if not cur['ok']:
        print('[3/3] 今の部品DBを読めませんでした:', cur['error'])
        print('      場所の設定が要ります: py tools/parts_db/parts_db.py setpath <parts_db.jsonのパス>')
        return 1
    old = {p.get('ref'): p for p in cur['parts'] if p.get('ref')}
    print(f'[3/3] 今の部品DB {len(old)}件 → 作り直すと {len(rows)}件')

    keep = ('maker', 'ref', 'type', 'volt', 'amp', 'terminals',
            'contacts', 'note', 'source', 'catalogUrl')
    new_parts, carried = [], 0
    for r in rows:
        p = {k: (r.get(k) or '') for k in keep}
        p['custom'] = True
        o = old.get(p['ref'])
        if o:
            # 外形図の紐付けは型番で引き継ぐ(js/parts_page.js の carryOutlineDxf と同じ)
            if 'outlineDxf' in o:
                p['outlineDxf'] = o['outlineDxf']
                carried += 1
            if 'outlineDxfName' in o:
                p['outlineDxfName'] = o['outlineDxfName']
        new_parts.append(p)

    dropped = [ref for ref in old if ref not in {p['ref'] for p in new_parts}]
    lost_dxf = [ref for ref in dropped if 'outlineDxf' in old[ref]]
    print(f'      外形図の引き継ぎ {carried}件')
    if dropped:
        print(f'      ⚠ カタログに無い部品 {len(dropped)}件が消えます: '
              + '、'.join(dropped[:10]) + ('…' if len(dropped) > 10 else ''))
    if lost_dxf:
        print(f'      ⚠ そのうち外形図付きが {len(lost_dxf)}件あります')

    if not yes:
        ans = input('      実行しますか？ 先に退避を取ります (y/N): ').strip().lower()
        if ans != 'y':
            print('      中止しました。何も書いていません。')
            return 0

    bk = pdb.backup()
    print('      退避:', bk.get('name') or bk.get('error'))
    if not bk.get('ok'):
        print('      退避できなかったので中止します。')
        return 1

    out = {'customParts': new_parts, 'hiddenBuiltinRefs': cur['hidden']}
    saved = pdb.save(out)
    if not saved.get('ok'):
        print('      保存できませんでした:', saved.get('error') or saved.get('reason'))
        return 1
    print(f'      保存しました: {saved["count"]}件 → {saved["path"]}')
    print()
    print('できました。**ブラウザを Ctrl+Shift+R で読み直してください**')
    print('（CADは起動時に部品DBをまるごとメモリに読むため、開いたままだと古いままです）')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
