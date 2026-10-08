// 部品表で打った値を別ファイルにも書く(2026-10-08 プロジェクト台帳の作る順の4 一括操作。js/proj_index.js pidxDevPlan・pidxWritePlan)
//   node tests/test_bom_bulk.js
// 盛田さん「部品表は？」→ 部品表から・「a」=打つたびに、書き換える一覧を見せて聞いてから別ファイルに書く。
// このテストが守るもの:
//   1. ★開いているファイルは今まで通り入る。別ファイルで変わる記号(記号・外形図)を一覧にする(どのファイル・ページ・記号・前→後)
//   2. ★書くと、そのファイルの記号だけが変わる(ほかの中身はそのまま)。書く前の図面を履歴に残す。台帳も新しい値になる
//   3. 台帳を作ったあとに変わったファイル・記号が見つからないファイルは書かない(知らせる)
//   4. 仕様を図面に表示する代表の記号はプロジェクト全体で1つ(別ファイルに仕様があれば、開いているファイルの記号は表示しない)
//   5. 空にすると消す。台帳が無ければ今まで通り開いているファイルだけ
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const DEFS = { coil: { type: 'coil', role: 'coil', w: 40, h: 40 }, ca: { type: 'ca', role: 'contact_a', w: 40, h: 40 } };
const toasts = [], hist = [];
const sb = { console, DEFS, pushH() {}, draw() {}, updateRightPanel() {}, window: {}, document: { getElementById: () => null },
  stToast(m) { toasts.push(m); }, escH: require('./_esch.js').escH, getDef: t => DEFS[t] || null,
  async ptreeHistSave(src, fh, text) { const f = await fh.getFile(); hist.push([src, await f.text()]); return 'h'; } };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState;', sb);
vm.runInContext(R('js/proj_index.js') + '\nthis.pidxState = pidxState;', sb);
sb._reportOpen = () => {};

// 別ファイル: KR1 の接点2つと外形図・MC1(別ファイルだけ)・SW1(仕様なし)
const P2 = { customSymbols: [], pages: [{ name: 'P2', frameObj: { page: '5' }, elements: [
  { id: 'k2', type: 'ca', x: 100, y: 100, partRef: 'KR1', partModel: 'MY2N', label: '2P' },
  { id: 'k3', type: 'ca', x: 200, y: 100, partRef: 'kr1', partModel: 'MY2N' },
  { id: 'm1', type: 'coil', x: 300, y: 100, partRef: 'MC1', partModel: 'S-T10' },
  { id: 'm2', type: 'ca', x: 300, y: 200, partRef: 'MC1' },
  { id: 't1', type: 'text', x: 0, y: 0, text: 'メモはそのまま' },
], wires: [{ id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0, wireNo: '7' }], groups: [{ id: 'g1', partRef: 'KR1', partModel: 'MY2N' }] }] };
const P3 = { customSymbols: [], pages: [{ name: 'P3', elements: [{ id: 'k9', type: 'ca', x: 0, y: 0, partRef: 'KR1', partModel: 'MY2N' }], wires: [] }] };
let now = 10;
const tree = { 'P2.seqzu': { text: JSON.stringify(P2), lastModified: 1 }, '盤外/P3.seqzu': { text: JSON.stringify(P3), lastModified: 1 } };
const fh = n => {
  if (!tree[n]) throw new Error('NotFound ' + n);
  return { name: n, async getFile() { const f = tree[n]; return { lastModified: f.lastModified, size: Buffer.byteLength(f.text), async text() { return f.text; } }; },
    async createWritable() { let buf = ''; return { async write(x) { buf += x; }, async close() { tree[n].text = buf; tree[n].lastModified = ++now; } }; } };
};
const dir = { kind: 'directory', name: '案件',
  async getFileHandle(n, opt) { if (!tree[n] && opt && opt.create) tree[n] = { text: '', lastModified: 0 }; return fh(n); } };
sb.xprojDirHandle = async () => dir;
sb.xprojReadList = async () => Object.keys(tree).filter(n => n.endsWith('.seqzu')).sort();
sb.xprojFileHandle = async (d, n) => fh(n);
const file = n => JSON.parse(tree[n].text);
const el = (n, id) => file(n).pages[0].elements.find(e => e.id === id);

const openPage = { name: '開いている', elements: [{ id: 'c1', type: 'coil', x: 0, y: 0, partRef: 'KR1', partModel: 'MY2N' }], wires: [] };
sb.state = { pages: [openPage], currentPage: 0, customSymbols: [], customParts: [] };

(async () => {
  await sb.pidxRefresh();
  ok(sb.pidxReady(), '(台帳ができた)');

  console.log('【打った値の別ファイルの分を一覧にする】');
  const plan = sb.pidxDevPlan(() => sb.devSetField('KR1', 'partModel', 'MY4N'));
  eq(openPage.elements[0].partModel, 'MY4N', '★開いているファイルの記号には今まで通り入る');
  eq(plan.map(p => [p.file, p.pi, p.id, p.group, p.set, p.before.partModel]).sort(), [
    ['P2.seqzu', 0, 'g1', true, { partModel: 'MY4N' }, 'MY2N'],
    ['P2.seqzu', 0, 'k2', false, { partModel: 'MY4N' }, 'MY2N'],
    ['P2.seqzu', 0, 'k3', false, { partModel: 'MY4N' }, 'MY2N'],
    ['盤外/P3.seqzu', 0, 'k9', false, { partModel: 'MY4N' }, 'MY2N'],
  ], '★別ファイルで変わる記号と外形図(綴りの違う kr1 も)。前の値');
  ok(plan.every(p => p.loc), '位置がある(表題欄のページ番号・区画。一覧はファイルごとにまとめて出す)');
  eq(sb.state.pages, [openPage], '計算のあと、開いている図面に別ファイルが残らない');
  eq([el('P2.seqzu', 'k2').partModel], ['MY2N'], 'まだ書いていない(聞いてから)');

  console.log('\n【書く】');
  const r = await sb.pidxWritePlan(plan);
  eq(r, { files: ['P2.seqzu', '盤外/P3.seqzu'], ng: [] }, '2ファイルに書いた');
  eq([el('P2.seqzu', 'k2').partModel, el('P2.seqzu', 'k3').partModel, file('P2.seqzu').pages[0].groups[0].partModel, el('盤外/P3.seqzu', 'k9').partModel], ['MY4N', 'MY4N', 'MY4N', 'MY4N'], '★別ファイルの記号・外形図に入った');
  { const a = file('P2.seqzu'), b = JSON.parse(JSON.stringify(P2)); b.pages[0].elements[0].partModel = b.pages[0].elements[1].partModel = b.pages[0].groups[0].partModel = 'MY4N';
    eq(a, b, '★ほかの中身(別のデバイス・文字・配線)はそのまま'); }
  eq(hist.map(h => [h[0], JSON.parse(h[1]).pages[0].elements[0].partModel]), [['/P2.seqzu', 'MY2N'], ['/盤外/P3.seqzu', 'MY2N']], '★書く前の図面を履歴に残す');
  const kr = sb.collectBOMRows().find(x => !x.noRef && x.refs[0] === 'KR1');
  eq(kr.model, 'MY4N', '★台帳も新しい値(部品表は1つの型番)');

  console.log('\n【書かないとき】');
  {
    const p2 = sb.pidxDevPlan(() => sb.devSetField('KR1', 'partMaker', 'オムロン'));
    tree['P2.seqzu'].lastModified = ++now;   // 別の窓で保存された
    const r2 = await sb.pidxWritePlan(p2);
    eq([r2.files, r2.ng.length, /P2\.seqzu: 帳票を開いたあとに変わっています/.test(r2.ng[0]), el('P2.seqzu', 'k2').partMaker], [['盤外/P3.seqzu'], 1, true, undefined], '★台帳のあとに変わったファイルは書かない');
    await sb.pidxRefresh();
    const p3 = sb.pidxDevPlan(() => sb.devSetField('KR1', 'partMaker', 'オムロン'));
    const t = JSON.parse(tree['P2.seqzu'].text); t.pages[0].elements = t.pages[0].elements.filter(e => !/^k/.test(e.id)); t.pages[0].groups = [];
    tree['P2.seqzu'].text = JSON.stringify(t); await sb.pidxRefresh();
    const r3 = await sb.pidxWritePlan(p3.filter(p => p.file === 'P2.seqzu'));
    eq(r3.ng, ['P2.seqzu: 書き換える記号が見つかりません'], '記号が無くなっていたら書かない');
    tree['P2.seqzu'] = { text: JSON.stringify(P2), lastModified: ++now };
    await sb.pidxRefresh();
  }

  console.log('\n【仕様を図面に表示するのはプロジェクトで1つ】');
  {
    sb.pidxDevPlan(() => sb.devSetField('KR1', 'label', '2P'));
    eq([openPage.elements[0].label, openPage.elements[0].specHide], ['2P', true], '★別ファイルに仕様の記号があれば、開いているファイルの記号は表示しない');
    const p = sb.pidxDevPlan(() => sb.devSetField('MC1', 'label', 'AC200V 3P'));
    eq(p.map(x => [x.id, x.set]).sort(), [['m1', { label: 'AC200V 3P' }], ['m2', { label: 'AC200V 3P', specHide: true }]], '★仕様の無いデバイス: コイルにだけ表示(別ファイルだけのデバイスも)');
    await sb.pidxWritePlan(p);
    eq([el('P2.seqzu', 'm1').specHide, el('P2.seqzu', 'm2').specHide, el('P2.seqzu', 'm2').label], [undefined, true, 'AC200V 3P'], 'ファイルにもその通り入る');
  }

  console.log('\n【空にすると消す】');
  {
    const p = sb.pidxDevPlan(() => sb.devSetField('MC1', 'partModel', ''));
    eq(p.map(x => [x.id, 'partModel' in x.set, x.set.partModel]), [['m1', true, undefined]], '消す記号');
    await sb.pidxWritePlan(p);
    ok(!('partModel' in el('P2.seqzu', 'm1')), '★ファイルからも消える');
  }

  console.log('\n【部品表の入力欄・食い違いの画面から】');
  {
    let asked = null;
    sb.pidxAskWrite = (plan, what) => { asked = { n: plan.length, what }; return Promise.resolve(null); };
    sb.window._bomRows = [{ refs: ['KR1'], els: [] }];
    sb.setBOMMaker(0, 'IDEC');
    eq([openPage.elements[0].partMaker, asked && asked.n, asked && asked.what], ['IDEC', 3, 'KR1 のメーカー'], '★部品表で打つと開いているファイルに入れて、別ファイルの記号3個を聞く(メーカーは外形図に持たない)');
    ok(/pidxDevApply\(run/.test(R('js/devices.js')), '食い違いを直す画面も同じ口');
    asked = null;
    sb.pidxState.index = null;
    sb.setBOMMaker(0, 'オムロン');
    eq([openPage.elements[0].partMaker, asked], ['オムロン', null], '台帳が無ければ今まで通り開いているファイルだけ(聞かない)');
  }

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
