// デバイス台帳(作り直しの①、js/devices.js)
//   node tests/test_devices.js
// 盛田さんの原則: 「同じデバイスで型番仕様が変わるはずない、変わったらそれは違うデバイスだ。デバイスが全部のベースで作れ」
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}（実際 ${JSON.stringify(a)}）`);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

const sb = { console, escH: require('./_esch.js').escH, symRole: el => (el.type === 'coil' ? 'coil' : ''), elLocation: (el, pi) => `${pi + 1}/${el.id}` };
vm.createContext(sb);
vm.runInContext(pick(R('js/report.js'), /function normalizeRef\([\s\S]*?\n\}/), sb);
vm.runInContext(R('js/devices.js'), sb);

const E = (id, type, ref, o) => Object.assign({ id, type, partRef: ref, x: 0, y: 0 }, o);
const set = (pages) => { sb.state = { pages: pages.map(p => Object.assign({ elements: [], wires: [], groups: [] }, p)) }; return sb.state.pages; };

console.log('【台帳: デバイスごとにまとめ、食い違いを見つける】');
{
  set([{ elements: [
    E('c1', 'coil', 'CR1', { partModel: 'MY4N', partVolt: 'AC100V', label: '4C', specHide: true }),
    E('a1', 'ca', 'CR1', { partModel: 'MY4N', label: '4C', specHide: true }),
    E('a2', 'ca', 'CR1', { partModel: 'MY2N AC100V', label: '4C', specHide: true }),
    E('t1', 'junction', 'TB1', { style: 'circle', label: '1' }), E('t2', 'junction', 'TB1', { style: 'circle', label: '2', panelZone: '外' }),
    E('j', 'junction', '', { style: 'dot' }),
  ] }, { elements: [E('a3', 'ca', 'cr-1', { partModel: 'MY4N' })] }]);
  const L = sb.deviceLedger();
  eq([...L.keys()].sort(), ['CR1', 'TB1'], 'デバイスは CR1・TB1(綴りの違う cr-1 も CR1。分岐点は入らない)');
  const cr1 = L.get('CR1');
  eq(cr1.items.length, 4, 'CR1 は2ページにまたがる記号4つ');
  eq(cr1.ref, 'CR1', '表示名は一番多い綴り');
  eq(cr1.vals.label, '4C', '仕様は食い違いなし');
  eq(cr1.vals.partVolt, 'AC100V', '空欄は「未入力」なので食い違いではない');
  eq(cr1.conflicts.map(c => c.field + ':' + c.options.map(o => o.value + '×' + o.items.length).join('/')), ['partModel:MY4N×3/MY2N AC100V×1'], '型番の食い違い(多い順)');
  const tb1 = L.get('TB1');
  eq(tb1.conflicts.map(c => c.field), ['panelZone'], '対象外は空欄も1つの値(対象)なので、端子の1つだけ対象外は食い違い');
  ok(!('label' in tb1.vals) && !tb1.conflicts.some(c => c.field === 'label'), '端子台の端子の label(端子番号)は仕様として扱わない');
}

console.log('\n【読込時の点検: 空欄だけ埋め、食い違いは勝手に決めない】');
{
  const pg = set([{ elements: [
    E('c1', 'coil', 'CR3', {}),                                   // コイルの仕様は空欄・表示ON(既定)
    E('a1', 'ca', 'CR3', { label: '4C', specHide: true, partVolt: 'AC100V' }),
    E('a2', 'ca', 'CR3', { label: '4C', specHide: true }),
    E('k1', 'coil', 'CR9', { partModel: 'A' }), E('k2', 'ca', 'CR9', { partModel: 'B' }),
  ] }])[0].elements;
  const r = sb.devNormalize();
  ok(pg[0].label === '4C' && pg[2].partVolt === 'AC100V' && pg[0].partVolt === 'AC100V', '食い違いの無い項目は、空欄の記号にそのデバイスの値を入れる');
  ok(pg[0].specHide === true, '仕様を入れたコイルは「仕様を図面に表示」をOFFにする(図面に文字が増えない)');
  eq(r.filled, 3, '埋めた数(コイルの仕様・コイルの電圧・接点2の電圧)');
  ok(pg[3].partModel === 'A' && pg[4].partModel === 'B', '食い違い(CR9の型番)は勝手に決めない');
  eq(r.conflicts.map(c => c.ref + ':' + c.field), ['CR9:partModel'], '食い違いは一覧で返す');
  eq(sb.devNormalize().filled, 0, '2回目は何もしない');
}

console.log('\n【値を入れる(devSetField): デバイスの全部の記号に入る】');
{
  const pg = set([{ elements: [E('c', 'coil', 'K1', {}), E('a', 'ca', 'K1', {}), E('b', 'ca', 'K1', {}), E('t', 'junction', 'K1', { style: 'circle', label: '5' }), E('x', 'ca', 'K2', {})],
    groups: [{ id: 'g', partRef: 'K1' }] }]);
  const el = pg[0].elements;
  sb.devSetField('K1', 'label', 'AC200V');
  ok(el[0].label === 'AC200V' && el[1].label === 'AC200V' && el[2].label === 'AC200V', '仕様が全部の記号に入る');
  ok(!el[0].specHide && el[1].specHide === true && el[2].specHide === true, '初めて入れるときは、コイルだけ図面に表示(他はOFF)');
  ok(el[3].label === '5', '端子台の端子の番号は触らない');
  ok(el[4].label === undefined, '別のデバイスは変わらない');
  sb.devSetField('K1', 'partModel', 'SC-03');
  ok(el.slice(0, 4).every(e => e.partModel === 'SC-03') && pg[0].groups[0].partModel === 'SC-03', '型番は端子台の端子・外形図のグループにも入る');
  sb.devSetField('K1', 'panelZone', '外');
  ok(el.slice(0, 4).every(e => e.panelZone === '外') && pg[0].groups[0].panelZone === undefined, '対象外はデバイスの記号全部(グループは型番だけ)');
  sb.devSetField('K1', 'panelZone', '');
  ok(el.slice(0, 4).every(e => e.panelZone === undefined), '空にすると消す');
}

console.log('\n【食い違いを選ぶ画面】');
{
  const pg = set([{ elements: [E('k1', 'coil', 'CR9', { partModel: 'A' }), E('k2', 'ca', 'CR9', { partModel: 'B' }), E('k3', 'ca', 'CR9', { partModel: 'B' }),
    E('t1', 'junction', 'TB1', { style: 'circle' }), E('t2', 'junction', 'TB1', { style: 'circle', panelZone: '外' })] }])[0].elements;
  const nodes = {}; let removed = false, html = '';
  const radios = {};
  const ov = { style: {}, set innerHTML(h) { html = h; }, get innerHTML() { return html; }, remove() { removed = true; },
    querySelector: q => {
      const m = q.match(/input\[name="(devc\d+)"\]:checked/);
      if (m) return radios[m[1]] ? { value: radios[m[1]] } : null;
      return (nodes[q] = nodes[q] || {});
    } };
  sb.document = { createElement: () => ov, getElementById: () => null, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} };
  let pushed = 0, done = -1; sb.pushH = () => { pushed++; }; sb.draw = () => {}; sb.updateRightPanel = () => {};
  const cs = sb.devConflicts();
  eq(cs.map(c => c.ref + ':' + c.field), ['CR9:partModel', 'TB1:panelZone'], '食い違いの一覧');
  sb.devResolveDialog(cs, { undo: true, onDone: n => { done = n; } });
  ok(/CR9 の型番/.test(html) && /<b>B<\/b>/.test(html) && /2個/.test(html) && /1\/k2/.test(html), 'デバイス・項目・値・個数・位置を出す');
  ok(/TB1 の部品表の対象外/.test(html) && /対象外/.test(html) && /対象\(部品表に載せる\)/.test(html), '対象外は「対象外/対象」と出す');
  ok(!/checked/.test(html), '最初はどれも選ばれていない(勝手に決めない)');
  radios.devc0 = '0';   // CR9 は B(多い方=先頭)
  nodes['#devr-ok'].onclick();
  ok(pg[0].partModel === 'B' && pg[1].partModel === 'B' && pg[2].partModel === 'B', '選んだ値が全部の記号に入る');
  ok(pg[4].panelZone === '外' && pg[3].panelZone === undefined, '選ばなかった項目(TB1)はそのまま');
  ok(pushed === 1 && done === 1 && removed, '元に戻せるように pushH・閉じる・そろえた件数を返す');
}

console.log('\n【組み込み】');
{
  const edit = R('js/edit.js'), html = R('index.html');
  ok(/<script src="js\/devices\.js"><\/script>/.test(html) && html.indexOf('js/devices.js') < html.indexOf('js/autosave.js'), 'index.html が devices.js を読む(自動保存の復元より前)');
  ok((edit.match(/devAfterLoad\(\{ defer: true \}\)/g) || []).length === 2, '読込(置き換え・追加)の両方で点検する');
  ok(/devAfterLoad\(\{ defer: true \}\)/.test(R('js/backup.js')), 'バックアップの復元でも点検する');
  ok(/devAfterLoad\(\{ defer: true \}\)/.test(R('js/autosave.js')), '自動保存の復元(リロード)でも点検する');
  ok(/devResolveDialog\(null,\{undo:true/.test(R('js/report.js')), '部品表から「食い違いを直す」を開ける');
  ok(/\['devices\.js'\] = 1/.test(R('js/devices.js')), '読み込めた目印がある');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
