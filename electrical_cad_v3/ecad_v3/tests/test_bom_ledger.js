// 部品表を台帳から集計する(2026-10-08 プロジェクト台帳の作る順の2。js/proj_index.js pidxWith・pidxRefresh)
//   node tests/test_bom_ledger.js
// 以前は部品表を開くたびにプロジェクトの図面を全部読んでいた(xprojReload)。ページが増えると重いので台帳から集計する。
// このテストが守るもの:
//   1. ★台帳から集計した部品表が、図面を全部読んで集計した部品表と同じ(盛田さんの Sheet3 と、グループ・デバイス未設定・
//      端子台の端子・矢印・食い違いを入れた図面)。「食い違いを直す」の中身(位置・値)も同じ
//   2. 開いているファイルは台帳から数えない(二重に数えない)。集計のあと開いている図面は元のまま
//   3. 部品表を開くと台帳を最新にするだけで、図面を全部は読まない
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const DEFS = {};
const sb = { console, DEFS, pushH() {}, draw() {}, window: {}, document: { getElementById: () => null }, stToast() {},
  escH: require('./_esch.js').escH, getDef: t => DEFS[t] || null };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState;', sb);
vm.runInContext(R('js/proj_index.js') + '\nthis.pidxState = pidxState;', sb);
let _html = '';
sb._reportOpen = (k, ti, h) => { _html = h; };

const sheet3 = JSON.parse(R('drawings/仕様２1002_Sheet3.json'));
DEFS.coil = { type: 'coil', role: 'coil', w: 40, h: 40 };
DEFS.ca = { type: 'ca', role: 'contact_a', w: 40, h: 40 };
const made = {
  customSymbols: [{ type: 'out', role: 'sig_out', terminals: [{ x: 0, y: 0, label: '' }] }, { type: 'custom_pl', name: '表示灯', terminals: [] }],
  pages: [{ name: 'M1', frameObj: { page: '12' }, elements: [
    { id: 'c1', type: 'coil', x: 100, y: 100, partRef: 'KR1', partModel: 'MY4N', partVolt: 'AC100V', partMaker: 'オムロン' },
    { id: 'c2', type: 'ca', x: 200, y: 100, partRef: 'KR1', partModel: 'MY2N', label: '2P 5A' },   // 型番の食い違い
    { id: 'c3', type: 'ca', x: 300, y: 100, partRef: 'kr1 ', panelZone: '外' },                   // 表記ゆれ・対象外の食い違い
    { id: 'l1', type: 'custom_pl', x: 0, y: 50, partModel: 'APN', partName: 'ランプ' },             // デバイス未設定
    { id: 'l2', type: 'custom_pl', x: 0, y: 80 },                                                  // デバイス未設定(登録シンボルの名前)
    { id: 'j1', type: 'junction', style: 'circle', x: 10, y: 10, label: '1', partModel: 'TB-1' },   // 端子台の端子(デバイス未設定)
    { id: 'j2', type: 'junction', style: 'double', x: 20, y: 10, label: '2', partRef: 'TB9', partModel: 'TB-2' },
    { id: 'j3', type: 'junction', x: 30, y: 10 },                                                  // 分岐点●は部品ではない
    { id: 'a1', type: 'out', x: 100, y: 0, label: 'X1' },                                          // 矢印は部品ではない
    { id: 't1', type: 'text', x: 0, y: 0, text: 'メモ' },
  ], wires: [{ id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0, wireNo: '101' }],
  groups: [{ id: 'g1', partRef: 'MC1', partModel: 'S-T10' }, { id: 'g2', partRef: 'KR1', partModel: 'MY4N' }] }],
};

const openPage = { name: '開いている', elements: [{ id: 'mine', type: 'coil', x: 0, y: 0, partRef: 'KR1', partModel: 'MY4N' }], wires: [] };
const files = [{ name: '仕様２1002_Sheet3.seqzu', data: sheet3 }, { name: '盤外/作った.seqzu', data: made }];
sb.state = { pages: [openPage], currentPage: 0, customSymbols: [], customParts: [] };
const index = { version: 4, files: Object.fromEntries(files.map(f => [f.name, { lastModified: 1, size: 1, pages: sb.pidxExtractFile(f.name, f.data) }])) };

// 比べるために、記号そのもの(els)は名前だけにする
const view = rows => JSON.parse(JSON.stringify(rows.map(r => Object.assign({}, r, { els: (r.els || []).map(e => e.id) }))));
const viewCf = cf => cf.map(c => ({ ref: c.ref, field: c.field, options: c.options.map(o => ({ value: o.value, items: o.items.map(it => [it.loc, it.ext, it.file, !!it.group]) })) }));

console.log('【台帳から集計した部品表 = 図面を全部読んで集計した部品表】');
const full = () => { sb.pidxState.index = null; sb.xprojState.files = files.map(f => ({ name: f.name, pages: f.data.pages, symbols: f.data.customSymbols || [] })); };
const ledger = () => { sb.xprojState.files = []; sb.pidxState.index = index; };
full();
const rowsFull = view(sb.collectBOMRows()), cfFull = viewCf(sb.devConflicts());
ledger();
const rowsIdx = view(sb.collectBOMRows()), cfIdx = viewCf(sb.devConflicts());
ok(rowsFull.length > 20, `(図面を全部読んだ部品表は ${rowsFull.length} 行)`);
eq(rowsIdx, rowsFull, '★部品表の行がすべて同じ(台数・構成数・型番・仕様・電圧・メーカー・名称・備考・対象外・警告・どのファイルか)');
ok(cfFull.length >= 2, `(食い違いは ${cfFull.length} 件)`);
eq(cfIdx, cfFull, '★「食い違いを直す」の中身(値・位置・どのファイルか)も同じ');
{
  const by = Object.fromEntries(rowsIdx.filter(r => !r.noRef).map(r => [r.refs[0], r]));
  eq([by.KR1.count, by.KR1.parts, by.KR1.local, by.KR1.extFiles.includes('盤外/作った')], [1, 4, true, true], 'KR1 は開いているファイルと別ファイルで1台');
  eq([by.TB9.parts, by.MC1.model], [1, 'S-T10'], '端子台の端子・外形図のグループのデバイス');
  const nr = rowsIdx.filter(r => r.noRef && r.extFiles.includes('盤外/作った')).map(r => [r.type, r.label, r.count]).sort();
  eq(nr, [['custom_pl', 'APN', 1], ['custom_pl', '表示灯', 1], ['junction', 'TB-1', 1]], 'デバイス未設定(登録シンボルの名前・端子台の端子も)');
  ok(!rowsIdx.some(r => r.type === 'out' || r.label === 'X1'), '矢印は部品ではない');
}
eq(sb.state.pages, [openPage], '★集計のあと、開いている図面は元のまま');

console.log('\n【開いているファイルは台帳から数えない】');
{
  sb.state.pages = [openPage, { name: 'X', _src: '/盤外/作った.seqzu', elements: [], wires: [] }];
  eq([...new Set(sb.pidxPages().map(p => p._file))], ['仕様２1002_Sheet3'], '★ツリーから開いているファイルは除く');
  sb.state.pages = [openPage, { name: 'M1', elements: [], wires: [] }];
  eq([...new Set(sb.pidxPages().map(p => p._file))], ['仕様２1002_Sheet3'], '同じページ名のファイルも除く');
  sb.state.pages = [openPage];
}

console.log('\n【表示】');
{
  sb.showBOM();
  ok(new RegExp(`このファイル1ページ＋プロジェクトの別ファイル${sb.pidxPages().length}ページを集計`).test(_html), '★集計した範囲は台帳のページ数');
  ok(!/フォルダを開くと盤全体の部品表/.test(_html), '台帳があればフォルダを開く案内は出さない');
}

console.log('\n【部品表を開くと台帳を最新にするだけ】');
(async () => {
  const reads = [];
  const tree = { 'P2.seqzu': { text: JSON.stringify(made), lastModified: 5 } };
  const dir = {
    kind: 'directory', name: '案件',
    async *entries() { for (const n of Object.keys(tree)) yield [n, { kind: 'file', name: n }]; },
    async getFileHandle(n, opt) {
      if (!tree[n]) { if (opt && opt.create) tree[n] = { text: '', lastModified: 0 }; else throw new Error('NotFound ' + n); }
      const f = tree[n];
      return { name: n, async getFile() { return { lastModified: f.lastModified, size: Buffer.byteLength(f.text), async text() { reads.push(n); return f.text; } }; },
        async createWritable() { let buf = ''; return { async write(x) { buf += x; }, async close() { f.text = buf; f.lastModified = Date.now(); } }; } };
    },
  };
  sb.xprojDirHandle = async () => dir;
  sb.xprojState.files = [];
  eq(await sb.pidxRefresh(), true, 'フォルダがあれば台帳を最新にする');
  eq([reads.filter(n => n.endsWith('.seqzu')), sb.xprojState.files.length], [['P2.seqzu'], 0], '最初は台帳を作るために読む(参照図面の状態には入れない)');
  reads.length = 0;
  await sb.pidxRefresh();
  eq(reads.filter(n => n.endsWith('.seqzu')), [], '★2回目からは変わっていない図面を読まない');
  ok(sb.collectBOMRows().some(r => !r.noRef && r.refs[0] === 'MC1'), '台帳の図面が部品表に出る');
  sb.xprojDirHandle = async () => null;
  eq([await sb.pidxRefresh(), sb.pidxState.index], [false, null], 'フォルダを開いていなければ台帳を使わない');
  const ob = R('js/report.js').match(/async function openBOM\(\)\{[\s\S]*?\n\}/)[0];
  ok(/pidxRefresh/.test(ob) && !/xprojReload\(\)/.test(ob), '★部品表を開くと台帳の更新(pidxRefresh)だけ。全部は読まない');
  ok(/pidxState\.index = null/.test(R('js/proj_tree.js')), '別のフォルダにしたら前の台帳を使わない');

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
