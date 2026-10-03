// CADの部品パネルの見せ方(2026-10-03 再設計の段階4)のテスト
//   node tests/test_parts_panel.js
//
// 部品DBはカタログの全件(数千〜数万件)を持つようになったので、CADの部品パネルで全件を木に並べるのをやめた。
// 盛田さんの決定: ★よく使う・最近使った と 検索 を基本、シンボルに役割(コイル)があるときだけ種別を自動で絞る。
// 「この図面で使っている型式」の一覧は入れない(描き始めは型式が無いため)。
//
// このテストが守るもの:
//   1. 検索していないときは ★よく使う と 最近使った だけ(全件を並べない)
//   2. 検索結果は上限(100件)まで。型番の前方一致を先に
//   3. 選択中のシンボルが全部コイルなら、コイルを持つ種別だけ。解除できる
//   4. 最近使ったは新しい順・重複なし・20件まで

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8').replace(/\r\n/g, '\n');
const block = ui.slice(ui.indexOf('const PARTS_LIST_LIMIT'), ui.indexOf('function filterParts(q)'));
const coil = ui.match(/const COIL_VOLT_TYPES = \[[^\]]*\];/)[0];

function load({ parts, favs = {}, sel = [], roles = {} }) {
  const store = {};
  const el = { innerHTML: '' };
  const sb = {
    console, JSON, Map, Set,
    state: { elements: sel.map(id => ({ id, type: 't_' + id })), sel: { els: new Set(sel) }, partsMakerFilter: '' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { getElementById: id => (id === 'parts-table2' ? el : null) },
    ecadLib: { get: () => favs },
    allParts: () => parts,
    symTermRole: e => roles[e.id] || '',
    escH: s => String(s == null ? '' : s),
    _escAttr: s => String(s == null ? '' : s),
    PART_TYPE_LABELS: { coil: 'リレーコイル', contactor: '電磁接触器', breaker: 'ブレーカ' },
    _lastPartsQuery: '',
    _el: el,
  };
  vm.createContext(sb);
  vm.runInContext(coil.replace('const ', 'var ') + '\nvar _lastPartsQuery = "";\n' + block, sb);
  sb.render = q => { vm.runInContext(`_lastPartsQuery = ${JSON.stringify(q || '')}`, sb); vm.runInContext('renderPartsTable2()', sb); return el.innerHTML; };
  sb.cards = () => (el.innerHTML.match(/onclick="placePart\('[^']*','([^']*)'/g) || []).map(m => m.match(/,'([^']*)'$/)[1]);
  return sb;
}

const many = Array.from({ length: 300 }, (_, i) => ({ ref: 'X-' + i, maker: 'M', type: i % 2 ? 'breaker' : 'contactor' }));

console.log('【検索していないときは ★よく使う と 最近使った だけ】');
{
  const sb = load({ parts: many.concat([{ ref: 'S-T10', maker: '三菱', type: 'contactor' }]), favs: { 'S-T10': {} } });
  vm.runInContext("recordRecentPart('X-5'); recordRecentPart('X-7'); recordRecentPart('X-5')", sb);
  const html = sb.render('');
  eq(sb.cards(), ['S-T10', 'X-5', 'X-7'], '★よく使う(S-T10)→最近使った(新しい順・重複なし)だけ。全件は並べない');
  ok(/全301件/.test(html), '全件数と、検索するよう案内する');
}

console.log('\n【検索結果は上限まで・型番の前方一致を先に】');
{
  const sb = load({ parts: many.concat([{ ref: 'AX-1', maker: 'M', type: 'coil', note: '' }]) });
  sb.render('x-');
  eq(sb.cards().length, 100, '★上限100件');
  ok(/上位100件を表示/.test(sb._el.innerHTML), '絞り込むよう案内する');
  sb.render('X-29');
  eq(sb.cards().slice(0, 1), ['X-29'], '前方一致が先');
}

console.log('\n【選択中のシンボルがコイルなら、コイルを持つ種別だけ】');
{
  const parts = [{ ref: 'C1', maker: 'M', type: 'contactor' }, { ref: 'B1', maker: 'M', type: 'breaker' }, { ref: 'R1', maker: 'M', type: 'coil' }];
  const sb = load({ parts, sel: ['e1'], roles: { e1: 'coil' } });
  sb.render('1');
  eq(sb.cards().sort(), ['C1', 'R1'], '★ブレーカは出さない');
  ok(/コイルを持つ種別だけ/.test(sb._el.innerHTML), '絞っていることと解除を出す');
  vm.runInContext('state.partsRoleFilterOff = true', sb);
  sb.render('1');
  eq(sb.cards().sort(), ['B1', 'C1', 'R1'], '解除すると全部');
  const sb2 = load({ parts, sel: ['e1', 'e2'], roles: { e1: 'coil', e2: 'contact_a' } });
  sb2.render('1');
  eq(sb2.cards().length, 3, 'コイル以外(接点)が混ざっていれば絞らない');
}

console.log('\n【最近使ったは20件まで】');
{
  const sb = load({ parts: many });
  for (let i = 0; i < 25; i++) vm.runInContext(`recordRecentPart('X-${i}')`, sb);
  eq(vm.runInContext('partRecentRefs()', sb).length, 20, '20件まで');
  eq(vm.runInContext('partRecentRefs()[0]', sb), 'X-24', '新しい順');
}

ok(!/function togglePartsMaker|_isCollapsed/.test(ui), '全件の木(メーカー→種別の折りたたみ)は無い');
ok(/if \(typeof recordRecentPart === 'function'\) recordRecentPart\(ref\)/.test(ui), '割り当てたら最近使ったに入れる(placePart)');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
