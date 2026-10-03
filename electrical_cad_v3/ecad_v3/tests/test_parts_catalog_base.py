#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""部品DBをカタログの全件を土台にする(2026-10-03 再設計の段階4)のテスト

    python3 tests/test_parts_catalog_base.py

盛田さんの決定(2) (b)「DBとしては全件持ってるのは普通」。parts_db.json には
自分で足した部品・自分で直した項目・外形図だけを持ち、読むときにカタログ(catalog_pending)へ重ねる
(tools/parts_db/parts_db.py merge_with_catalog / overlay_from、server.py が両方を呼ぶ)。

このテストが守るもの:
  1. 重ねた一覧はカタログの全件＋自分で足した部品。直した項目は自分の値
  2. 保存は差分だけ(カタログと同じ項目は入れない)。外形図はカタログが変わっても消えない
  3. 直していない項目には、カタログCSVの修正がそのまま流れる(全件作り直しは要らない)
  4. 直した後にカタログ側が変わったら _catalogChanged で知らせる(同じ値で直し続けている間は印が消えない)
  5. 以前の「カタログを丸ごと写した parts_db.json」も読め、保存すると差分に縮む(件数激減と誤判定しない)
  6. 「カタログの内容に戻す」= 直した項目をカタログの値にして保存すると、直した印が消える
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools', 'parts_db'))
import parts_db  # noqa: E402

ng = 0


def ok(cond, msg):
    global ng
    print(('  OK ' if cond else '  NG ') + msg)
    if not cond:
        ng += 1


def row(ref, **kw):
    r = {'maker': '三菱電機', 'ref': ref, 'type': 'contactor', 'volt': 'AC200V', 'amp': '', 'terminals': 'A1,A2',
         'contacts': '', 'note': '', 'source': 'p.1', 'catalogUrl': '', 'src_file': 'x.csv'}
    r.update(kw)
    return r


CAT = [row('S-T10'), row('S-T21'), row('NF63', type='breaker', volt='')]
M = parts_db.merge_with_catalog
O = parts_db.overlay_from

print('【重ねた一覧】')
merged = M(CAT, [{'ref': 'S-T21', 'volt': 'AC100V', 'outlineDxf': 'DXF', 'outlineDxfName': 'a.dxf',
                  '_catalog': {'volt': 'AC200V'}},
                 {'ref': 'OWN-1', 'maker': '自社', 'type': 'terminal'}])
by = {p['ref']: p for p in merged}
ok([p['ref'] for p in merged] == ['S-T10', 'S-T21', 'NF63', 'OWN-1'], 'カタログの全件＋自分で足した部品')
ok(by['S-T10']['_origin'] == 'catalog' and by['S-T21']['_origin'] == 'edited' and by['OWN-1']['_origin'] == 'own', '出どころの印')
ok(by['S-T21']['volt'] == 'AC100V' and by['S-T21']['terminals'] == 'A1,A2', '直した項目は自分の値・他はカタログ')
ok(by['S-T21']['outlineDxf'] == 'DXF', '外形図が重なる')
ok(by['S-T21']['_catalogValues'] == {'volt': 'AC200V'}, '戻すためのカタログの値を持つ')
ok('src_file' not in by['S-T10'], 'カタログDBの内部の列は出さない')

print('\n【保存は差分だけ】')
ov = O(CAT, merged)
ok(len(ov) == 2, f'差分は直した S-T21 と自分の OWN-1 だけ ({len(ov)}件。カタログのままの部品は入れない)')
st21 = [p for p in ov if p['ref'] == 'S-T21'][0]
ok(set(st21) == {'ref', 'volt', 'outlineDxf', 'outlineDxfName', '_catalog'}, f'直した項目と外形図だけ ({sorted(st21)})')
ok(all(not k.startswith('_') or k == '_catalog' for p in ov for k in p), '画面用の印(_origin 等)は保存しない')

print('\n【カタログCSVの修正は、直していない項目にそのまま流れる・外形図は消えない】')
CAT2 = [row('S-T10', terminals='A1,A2,1,2'), row('S-T21', terminals='コイル:A1,A2 / 主接点:1,2'), row('NF63', type='breaker', volt='')]
m2 = {p['ref']: p for p in M(CAT2, ov)}
ok(m2['S-T21']['terminals'] == 'コイル:A1,A2 / 主接点:1,2', '★直していない端子はカタログの新しい値')
ok(m2['S-T21']['volt'] == 'AC100V', '直した電圧は自分の値のまま')
ok(m2['S-T21']['outlineDxf'] == 'DXF', '★外形図は残る(以前は全件作り直しで2回消えた)')
ok('_catalogChanged' not in m2['S-T21'], '直した項目(電圧)のカタログ側は変わっていないので印なし')

print('\n【直した後にカタログ側が変わったら知らせる】')
CAT3 = [row('S-T10'), row('S-T21', volt='AC220V'), row('NF63', type='breaker', volt='')]
m3 = {p['ref']: p for p in M(CAT3, ov)}
ok(m3['S-T21'].get('_catalogChanged') == ['volt'], '★電圧のカタログ側が変わったら印')
ov3 = O(CAT3, list(m3.values()), ov)   # 何も変えずにもう一度保存した
m3b = {p['ref']: p for p in M(CAT3, ov3)}
ok(m3b['S-T21'].get('_catalogChanged') == ['volt'], '★同じ値で直し続けている間は、保存しても印が消えない')

print('\n【カタログの内容に戻す】')
p = dict(m3['S-T21'])
p.update(p['_catalogValues'])
ov4 = O(CAT3, [p], ov3)
ok(ov4 == [{'ref': 'S-T21', 'outlineDxf': 'DXF', 'outlineDxfName': 'a.dxf'}], '直した項目が消え、外形図だけ残る')
ok(M(CAT3, ov4)[1]['_origin'] == 'catalog', '出どころは「カタログ」に戻る')

print('\n【以前の丸写しの parts_db.json も読め、保存で差分に縮む】')
tmp = tempfile.mkdtemp(prefix='ecad_cat_')
try:
    lib = os.path.join(tmp, 'lib')
    os.makedirs(lib)
    old = [dict(r, custom=True) for r in CAT] + [{'ref': 'OWN-1', 'maker': '自社', 'custom': True}]
    for p in old:
        p.pop('src_file', None)
    with open(os.path.join(lib, 'parts_db.json'), 'w', encoding='utf-8') as f:
        json.dump({'customParts': old, 'hiddenBuiltinRefs': []}, f)
    db = parts_db.PartsDB(data_dir=os.path.join(tmp, 'appdata'))
    db.set_library(lib)
    d = db.load()
    mm = M(CAT, d['parts'])
    ok(len(mm) == 4 and all(p['_origin'] in ('catalog', 'own') for p in mm), '丸写しでもそのまま読める(直した扱いにならない)')
    r = db.save({'customParts': mm, 'hiddenBuiltinRefs': []}, base_version=d['version'], catalog_rows=CAT)
    ok(r['ok'], f'★件数激減と誤判定せずに保存できる ({r.get("reason")})')
    with open(os.path.join(lib, 'parts_db.json'), encoding='utf-8') as f:
        saved = json.load(f)['customParts']
    ok([p['ref'] for p in saved] == ['OWN-1'], f'★差分(自分で足した1件)に縮む ({len(saved)}件)')
    ok(r['count'] == 4, '返す件数は重ねた後の件数')
    # 自分で足した部品を全部消すような激減は止める(重ねた後の件数で比べる)
    d = db.load()
    many = M(CAT, [{'ref': f'OWN-{i}', 'maker': 'x'} for i in range(30)])
    db.save({'customParts': many}, base_version=d['version'], catalog_rows=CAT, force=True)
    d = db.load()
    r = db.save({'customParts': M(CAT, [])}, base_version=d['version'], catalog_rows=CAT)
    ok(not r['ok'] and r['reason'] == 'drop', '★自分の部品30件が消える保存は止める(33→3件)')
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print('\n' + (f'失敗 {ng} 件' if ng else 'すべて通過'))
sys.exit(1 if ng else 0)
