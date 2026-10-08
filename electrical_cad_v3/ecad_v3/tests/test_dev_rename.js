// デバイス名の付け替え(2026-10-08 プロジェクト台帳の作る順の4④。js/devices.js devRenamePlan・devRenameApply)
//   node tests/test_dev_rename.js
// 盛田さんと決めたこと: 図面の記号を選んでプロパティのデバイス欄で名前を変えると、ほかの記号もあれば窓を出す。そのデバイスの記号すべて(別ファイルも)を新しい名前に。
// 使われている名前なら「ずらして入れる」(最初の空き番号の手前まで)。名前が数字で終わらなければ止める。実行前に一覧を見せる。
// このテストが守るもの:
//   1. ★そのデバイスの記号すべて(綴りの違う記号・外形図・端子台の端子・別ファイル)が新しい名前になる。ほかのデバイスは変わらない
//   2. ★使われている名前: CR3〜CR5 があり CR6 が空き → CR5→CR6・CR4→CR5・CR3→CR4・選んだデバイス→CR3。CR7 以降は動かない
//   3. 選んだデバイス自身が並びの中(CR5 を CR3 に)・桁(X09→X10)・数字で終わらない名前は止める・同じ名前は何もしない
//   4. 名前の無い記号はその記号だけ。台帳が無ければ開いているファイルだけ。別ファイルは書く前の図面を履歴に残す
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const DEFS = { coil: { type: 'coil', role: 'coil', w: 40, h: 40 }, ca: { type: 'ca', role: 'contact_a', w: 40, h: 40 } };
const hist = [];
const sb = { console, DEFS, pushH() { sb.pushed = (sb.pushed || 0) + 1; }, draw() {}, updateRightPanel() {}, window: {}, document: { getElementById: () => null },
  stToast() {}, escH: require('./_esch.js').escH, getDef: t => DEFS[t] || null,
  async ptreeHistSave(src, fh) { const f = await fh.getFile(); hist.push(src); return 'h'; } };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState;', sb);
vm.runInContext(R('js/proj_index.js') + '\nthis.pidxState = pidxState;', sb);

const mk = () => ({
  P2: { customSymbols: [], pages: [{ name: 'P2', frameObj: { page: '5' }, elements: [
    { id: 'k2', type: 'ca', x: 100, y: 100, partRef: 'kr1', partModel: 'MY2N' },
    { id: 'c4', type: 'coil', x: 200, y: 100, partRef: 'CR4' },
    { id: 'c4b', type: 'ca', x: 200, y: 200, partRef: 'CR4' },
    { id: 'c7', type: 'coil', x: 300, y: 100, partRef: 'CR7' },
    { id: 't1', type: 'junction', style: 'circle', x: 0, y: 0, partRef: 'TB1', label: '1' },
  ], wires: [], groups: [{ id: 'g1', partRef: 'KR1', partModel: 'MY2N' }] }] },
  open: { name: '開いている', elements: [
    { id: 'c1', type: 'coil', x: 0, y: 0, partRef: 'KR1', partModel: 'MY2N' },
    { id: 'c3', type: 'coil', x: 50, y: 0, partRef: 'CR3' },
    { id: 'c5', type: 'coil', x: 60, y: 0, partRef: 'CR5' },
    { id: 'n1', type: 'coil', x: 70, y: 0, partRef: 'NEW' },
    { id: 'n2', type: 'ca', x: 80, y: 0, partRef: 'NEW' },
    { id: 'z', type: 'coil', x: 90, y: 0 },
    { id: 'x9', type: 'coil', x: 0, y: 50, partRef: 'X09' }, { id: 'x10', type: 'coil', x: 0, y: 60, partRef: 'X10' },
    { id: 'm', type: 'coil', x: 0, y: 70, partRef: 'MC-A' }, { id: 'j1', type: 'junction', style: 'circle', x: 0, y: 0, partRef: 'KR1' },
  ], wires: [] },
});
let D, tree, now = 10;
const fh = n => ({ name: n, async getFile() { const f = tree[n]; return { lastModified: f.lastModified, size: Buffer.byteLength(f.text), async text() { return f.text; } }; },
  async createWritable() { let buf = ''; return { async write(x) { buf += x; }, async close() { tree[n].text = buf; tree[n].lastModified = ++now; } }; } });
const dir = { kind: 'directory', name: '案件', async getFileHandle(n, opt) { if (!tree[n]) { if (opt && opt.create) tree[n] = { text: '', lastModified: 0 }; else throw new Error('NotFound'); } return fh(n); } };
sb.xprojDirHandle = async () => dir;
sb.xprojReadList = async () => Object.keys(tree).filter(n => n.endsWith('.seqzu')).sort();
sb.xprojFileHandle = async (d, n) => fh(n);
const reset = async () => {
  D = mk(); tree = { 'P2.seqzu': { text: JSON.stringify(D.P2), lastModified: 1 } };
  sb.state = { pages: [D.open], currentPage: 0, customSymbols: [], customParts: [] };
  sb.state.elements = D.open.elements;
  hist.length = 0;
  await sb.pidxRefresh();
};
const openRef = id => D.open.elements.find(e => e.id === id).partRef;
const extRef = id => { const d = JSON.parse(tree['P2.seqzu'].text); return d.pages[0].elements.concat(d.pages[0].groups).find(e => e.id === id).partRef; };
const sel = id => D.open.elements.find(e => e.id === id);

(async () => {
  console.log('【そのデバイスの記号すべてを新しい名前に】');
  await reset();
  {
    const p = sb.devRenamePlan(sel('c1'), 'KR9');
    eq([p.ok, p.shift.length], [true, 0], '空いている名前なのでずらさない');
    eq(p.items.map(it => [it.ext, it.old, it.nw, it.group]).sort(), [[false, 'KR1', 'KR9', false], [false, 'KR1', 'KR9', false], [true, 'KR1', 'KR9', true], [true, 'kr1', 'KR9', false]],
      '★一覧: 開いているファイルの記号・端子と、別ファイルの綴り違いの記号・外形図');
    const r = await sb.devRenameApply(p);
    eq([openRef('c1'), openRef('j1'), extRef('k2'), extRef('g1')], ['KR9', 'KR9', 'KR9', 'KR9'], '★全部の記号(別ファイルも)が KR9');
    eq([extRef('c4'), extRef('t1'), openRef('c3')], ['CR4', 'TB1', 'CR3'], 'ほかのデバイスは変わらない');
    eq([r.files, hist], [['P2.seqzu'], ['/P2.seqzu']], '別ファイルは履歴を残して書いた');
    ok(sb.collectBOMRows().some(x => !x.noRef && x.refs[0] === 'KR9') && !sb.collectBOMRows().some(x => !x.noRef && /KR1/i.test(x.refs[0])), '台帳も新しい名前(部品表に KR1 が残らない)');
  }

  console.log('\n【使われている名前なら、ずらして入れる】');
  await reset();
  {
    const p = sb.devRenamePlan(sel('n1'), 'CR3');
    eq(p.shift, [['CR5', 'CR6'], ['CR4', 'CR5'], ['CR3', 'CR4']], '★CR3〜CR5 をずらす(CR6 が空き。CR7 は動かない)');
    await sb.devRenameApply(p);
    eq([openRef('n1'), openRef('n2'), openRef('c3'), extRef('c4'), extRef('c4b'), openRef('c5'), extRef('c7')], ['CR3', 'CR3', 'CR4', 'CR5', 'CR5', 'CR6', 'CR7'],
      '★新しいデバイスが CR3、今の CR3→CR4・CR4(別ファイル)→CR5・CR5→CR6、CR7 はそのまま');
  }
  await reset();
  {
    const p = sb.devRenamePlan(sel('c5'), 'CR3');
    eq(p.shift, [['CR4', 'CR5'], ['CR3', 'CR4']], '選んだデバイス自身(CR5)は空くので、CR3・CR4 だけずらす');
    await sb.devRenameApply(p);
    eq([openRef('c5'), openRef('c3'), extRef('c4')], ['CR3', 'CR4', 'CR5'], 'CR5→CR3・CR3→CR4・CR4→CR5');
  }
  await reset();
  {
    const p = sb.devRenamePlan(sel('n1'), 'X09');
    eq(p.shift, [['X10', 'X11'], ['X09', 'X10']], '桁をそろえる(X09→X10)');
  }

  console.log('\n【止めるとき・何もしないとき】');
  await reset();
  {
    const p = sb.devRenamePlan(sel('n1'), 'MC-A');
    eq([p.ok, /数字で終わらない/.test(p.why)], [false, true], '★使われていて数字で終わらない名前は止める');
    eq(sb.devRenamePlan(sel('c1'), 'kr1').ok, false, '同じデバイス(綴り違い)は何もしない');
    eq(sb.devRenamePlan(sel('c1'), ' ').ok, false, '空は何もしない');
  }

  console.log('\n【名前の無い記号・台帳が無いとき】');
  await reset();
  {
    const p = sb.devRenamePlan(sel('z'), 'CR4');
    eq([p.shift, p.items.filter(it => it.nw === 'CR4').map(it => it.old)], [[['CR5', 'CR6'], ['CR4', 'CR5']], ['']], '名前の無い記号はその記号だけ(CR4・CR5 がずれる)');
    sb.pushed = 0;
    await sb.devRenameApply(p);
    eq([openRef('z'), openRef('c3'), extRef('c4'), openRef('c5'), sb.pushed], ['CR4', 'CR3', 'CR5', 'CR6', 1], '★名前なし→CR4・CR4→CR5・CR5→CR6、CR3 はそのまま。元に戻すは1回');
  }
  await reset();
  {
    sb.pidxState.index = null;
    const p = sb.devRenamePlan(sel('c1'), 'KR9');
    eq(p.items.every(it => !it.ext), true, '台帳が無ければ開いているファイルだけ');
    const r = await sb.devRenameApply(p);
    eq([openRef('c1'), extRef('k2'), r.files], ['KR9', 'kr1', []], '別ファイルは書かない');
  }

  console.log('\n【入口: デバイスの入力欄で名前を変えたとき】');
  await reset();
  {
    eq([sb.devRenameNeedsAsk(sel('c1'), 'KR9'), sb.devRenameNeedsAsk(sel('n1'), 'CR9'), sb.devRenameNeedsAsk(sel('c3'), 'CR9')], [true, true, false], '★ほかの記号があるデバイス(別ファイル・外形図も)は聞く。CR3 は記号1つなので聞かない');
    eq([sb.devRenameNeedsAsk(sel('z'), 'CR9'), sb.devRenameNeedsAsk(sel('c1'), ''), sb.devRenameNeedsAsk(sel('c1'), 'kr1'), sb.devRenameNeedsAsk(sel('m'), 'MC-B')], [false, false, false, false],
      '名前の無い記号・空にする・同じ名前・記号が1つだけのデバイスは聞かない(今まで通り)');
    eq([sb.devRenameKeep(sel('c1'), 'KR9'), sb.devRenameKeep(sel('m'), 'MC-B')], ['KR1', 'MC-B'], '★自動適用は、聞く間は元の名前のまま(聞かないときは打った名前)');
    sb.pidxState.index = null;
    eq(sb.devRenameNeedsAsk(sel('c5'), 'CR9'), false, '台帳が無ければ開いているファイルだけで数える(CR5 は開いているファイルに1つ)');
    const ui = R('js/ui.js');
    ok(/devRenameKeep\(el, v\('pp-partref'\)\)/.test(ui) && /devRenameKeep\(el, v\('pp-jref'\)\)/.test(ui), '自動適用(記号・端子台の端子)は devRenameKeep を通す');
    ok(/function onPartRefChanged[\s\S]*?devRenameAsk\(el, ref\)/.test(ui) && /function onJunctionRefChanged[\s\S]*?devRenameAsk\(el, ref\)/.test(ui), '入力欄の onchange から窓を出す');
    ok(!/>付け替え…<\/button>/.test(ui), '「付け替え…」ボタンはやめた');
  }

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
