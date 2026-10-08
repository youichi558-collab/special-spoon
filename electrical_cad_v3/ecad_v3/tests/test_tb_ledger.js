// 端子台表を台帳から集計する(2026-10-08 プロジェクト台帳の作る順の3。js/proj_index.js・js/conn_table.js buildTerminalBlockRows)
//   node tests/test_tb_ledger.js
// 以前の端子台表は開いているファイルの端子しか見ていなかった(端子台は端子が複数ファイルにまたがる)。
// このテストが守るもの:
//   1. ★台帳から集計した端子台表が、図面を全部読んで集計した端子台表と同じ(盛田さんの Sheet3 と作った図面。台・番号・位置・線番・型式・並び)
//   2. ★線番の無いネットの端子は、ページ跨ぎの矢印の相手の線番を借りる(盛田さん「未採番はなおるのか？」)。台帳どうし・開いている図面と台帳の両方向。
//      相手が一対一でなければ借りない(「未採番」のまま)
//   3. 並びはファイルの名前順 → そのファイルの中で tbOrder(開いているファイルは _src の名前の位置)
//   4. 番号の振り直しは別ファイルも含めた表の順で、書くのは開いているファイルの端子だけ
//   5. 別ファイルの行は読むだけ(ドラッグ・押して飛ぶ無し)。端子台表を開くと台帳を最新にする
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const DEFS = {};
const toasts = [];
const sb = { console, DEFS, pushH() {}, draw() {}, updateRightPanel() {}, window: {}, document: { getElementById: () => null },
  stToast(m) { toasts.push(m); }, alert(m) { toasts.push('alert:' + m); },
  escH: require('./_esch.js').escH, getDef: t => DEFS[t] || null };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/xref.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState;', sb);
vm.runInContext(R('js/proj_index.js') + '\nthis.pidxState = pidxState;', sb);
let _html = '';
sb._reportOpen = (k, ti, h) => { _html = h; };

// 矢印(送り/受け)。端子は記号の中心
const arrowSyms = [{ type: 'sig_o', role: 'sig_out', terminals: [{ x: 0, y: 0, label: '' }] }, { type: 'sig_i', role: 'sig_in', terminals: [{ x: 0, y: 0, label: '' }] }];
DEFS.sig_o = arrowSyms[0]; DEFS.sig_i = arrowSyms[1];
const term = (id, x, ref, no, more) => Object.assign({ id, type: 'junction', style: 'circle', x, y: 0, partRef: ref, label: no }, more || {});
const arrow = (id, out, x, label) => ({ id, type: out ? 'sig_o' : 'sig_i', x, y: 100, label });
const wire = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '' });

const sheet3 = JSON.parse(R('drawings/仕様２1002_Sheet3.json'));
// A: XT1 の端子(番号あり・未採番で矢印X1の送りにつながる・矢印Z1の受けにつながる)
const fileA = { customSymbols: arrowSyms, pages: [{ name: 'A1', frameObj: { page: '3' }, elements: [
  term('a1', 0, 'XT1', '1', { tbOrder: 1 }), term('a2', 100, 'XT1', '2', { tbOrder: 0 }), term('a3', 200, 'XT1', '3'), term('a4', 300, 'XT2', '1', { partModel: 'BTH15' }),
  arrow('xo', true, 100, 'X1'), arrow('zi', false, 200, 'Z1'),
], wires: [wire('w1', 0, 0, 0, 50, '101'), wire('w2', 100, 0, 100, 100), wire('w3', 200, 0, 200, 100), wire('w4', 300, 0, 300, 50)] }] };
// B: 矢印X1の受け(線番201)・矢印W1が2つ(一対一でない)
const fileB = { customSymbols: arrowSyms, pages: [{ name: 'B1', elements: [
  arrow('xi', false, 0, 'X1'), arrow('wo1', true, 100, 'W1'), arrow('wo2', true, 200, 'W1'),
  term('b1', 400, 'XT1', '9', { tbOrder: 0 }),
], wires: [wire('v1', 0, 100, 0, 200, '201')] }] };

const files = [{ name: '仕様２1002_Sheet3.seqzu', data: sheet3 }, { name: '盤A.seqzu', data: fileA }, { name: '盤B.seqzu', data: fileB }];
// 開いているファイル: XT1 の端子(未採番で矢印Y1の受け → 台帳の送りY1 は無いので未採番)・矢印Z1の送り(線番401)
const openPage = { name: '開いている', _src: '/盤0.seqzu', elements: [
  term('o1', 0, 'XT1', '5'), arrow('zo', true, 500, 'Z1'),
], wires: [wire('ow', 500, 100, 500, 200, '401'), wire('ow2', 0, 0, 0, 40)] };
sb.state = { pages: [openPage], currentPage: 0, customSymbols: arrowSyms.slice(), customParts: [] };
const PIDX_VER = Number(R('js/proj_index.js').match(/const PIDX_VER\s*=\s*(\d+)/)[1]);
const mkIndex = () => ({ version: PIDX_VER, files: Object.fromEntries(files.map(f => [f.name, { lastModified: 1, size: 1, pages: sb.pidxExtractFile(f.name, f.data) }])) });
let index = mkIndex();
const view = rows => rows.map(r => ({ tb: r.tbRef, no: r.termNo, loc: r.loc, conns: r.conns, model: r.tbModel, ext: r.ext, file: r.file }));
const full = () => { sb.pidxState.index = null; sb.xprojState.files = files.map(f => ({ name: f.name, pages: f.data.pages, symbols: f.data.customSymbols || [] })); };
const ledger = () => { sb.xprojState.files = []; sb.pidxState.index = index; };

console.log('【台帳の版と中身】');
eq(PIDX_VER, 5, '台帳の版は 5(端子の線番の無いネット un を足した)');
{
  const t = Object.fromEntries(index.files['盤A.seqzu'].pages[0].terms.map(x => [x.id, x]));
  eq([t.a1.un, t.a2.un, t.a3.un], [undefined, [1], [2]], '線番の無いネットにつながる端子だけ un を持つ');
}

console.log('\n【台帳から集計した端子台表 = 図面を全部読んで集計した端子台表(矢印の相手を借りない端子で)】');
{
  // 全部読む方は別ファイルの端子に矢印の相手の番号を貸さない(netWireNoOf は別ファイルの側を直さない)ので、借りない端子で比べる
  const noArrow = rows => view(rows).filter(r => !(r.file === '盤A' && (r.no === '2' || r.no === '3')) && r.file !== '');
  full();
  const rf = sb.buildTerminalBlockRows();
  ledger();
  const ri = sb.buildTerminalBlockRows();
  ok(rf.filter(r => r.file === '仕様２1002_Sheet3').length === 14, '(Sheet3 の端子 14)');
  eq(noArrow(ri), noArrow(rf), '★別ファイルの行(台・番号・位置・線番・型式・どのファイルか・並び)が同じ');
  eq(view(ri).filter(r => !r.ext), view(rf).filter(r => !r.ext), '開いているファイルの行も同じ');
  eq(sb.state.pages, [openPage], '集計のあと開いている図面は元のまま');
}

console.log('\n【矢印の相手の線番を借りる(盛田さん「未採番はなおるのか？」)】');
{
  ledger();
  const by = Object.fromEntries(sb.buildTerminalBlockRows().map(r => [`${r.file || '開'}:${r.tbRef}:${r.termNo}`, r.conns]));
  eq(by['盤A:XT1:1'], ['101'], '線番のあるネットはそのまま');
  eq(by['盤A:XT1:2'], ['201'], '★台帳どうし: 送りX1(盤A・未採番)は受けX1(盤B 201)の番号');
  eq(by['盤A:XT1:3'], ['401'], '★開いている図面の送りZ1(401)の番号を台帳の受けZ1が借りる');
  eq(by['開:XT1:5'], ['未採番'], '相手の無いネットは未採番のまま');
  eq(by['盤A:XT2:1'], ['未採番'], '矢印につながっていない未採番のネットはそのまま');
  // 開いている図面の端子が台帳の矢印の相手から借りる
  openPage.elements.push(arrow('yi', false, 0, 'Y1'));
  openPage.wires.push(wire('ow3', 0, 40, 0, 100));
  fileB.pages[0].elements.push(arrow('yo', true, 300, 'Y1'));
  fileB.pages[0].wires.push(wire('v2', 300, 100, 300, 200, '777'));
  index = mkIndex(); ledger();
  const by2 = Object.fromEntries(sb.buildTerminalBlockRows().map(r => [`${r.file || '開'}:${r.tbRef}:${r.termNo}`, r.conns]));
  eq(by2['開:XT1:5'], ['777'], '★開いている図面の端子が、台帳の送りY1(盤B 777)の番号を借りる');
  // 一対一でない
  fileA.pages[0].elements.push(arrow('wi', false, 300, 'W1'));
  fileA.pages[0].wires.push(wire('w5', 300, 50, 300, 100));
  index = mkIndex(); ledger();
  const by3 = Object.fromEntries(sb.buildTerminalBlockRows().map(r => [`${r.file || '開'}:${r.tbRef}:${r.termNo}`, r.conns]));
  eq(by3['盤A:XT2:1'], ['未採番'], '★送りW1が2つ(一対一でない)なら借りない');
}

console.log('\n【並び: ファイルの名前順 → そのファイルの中で tbOrder】');
{
  ledger();
  const tb1 = () => sb.buildTerminalBlockRows().filter(r => r.tbRef === 'XT1').map(r => `${r.file || '開'}:${r.termNo}`);
  eq(tb1(), ['開:5', '盤A:2', '盤A:1', '盤A:3', '盤B:9'], '盤0(開いている)→盤A(tbOrder 0,1,なし)→盤B');
  openPage._src = '/盤Z.seqzu';
  eq(tb1(), ['盤A:2', '盤A:1', '盤A:3', '盤B:9', '開:5'], '開いているファイルは名前(_src)の位置');
  openPage._src = '/盤0.seqzu';
  sb.pidxState.index = null; sb.xprojState.files = [];
  eq(sb.buildTerminalBlockRows().filter(r => r.tbRef === 'XT1').map(r => r.termNo), ['5'], 'プロジェクトが無ければ今まで通り開いているファイルだけ');
}

console.log('\n【番号の振り直し: 表の順で。別ファイルの端子は一覧を見せて聞く(作る順の4①)】');
{
  ledger();
  let asked = null;
  const saveAsk = sb.pidxAskWrite;
  sb.pidxAskWrite = (plan, what) => { asked = { plan, what }; return Promise.resolve(null); };
  sb.renumberTerminals('XT1');
  eq(openPage.elements.find(e => e.id === 'o1').label, '1', '★開いているファイルの端子は表の順(1番目)ですぐ入る');
  eq(fileA.pages[0].elements.filter(e => e.partRef === 'XT1').map(e => e.label), ['1', '2', '3'], 'まだ別ファイルの図面は書き換えない(聞いてから)');
  eq(asked && asked.what, 'XT1 の端子番号の振り直し', '★別ファイルの分を聞く');
  eq(asked.plan.map(p => [p.file, p.id, p.before.label, p.set.label]).sort(), [['盤A.seqzu', 'a1', '1', '3'], ['盤A.seqzu', 'a3', '3', '4'], ['盤B.seqzu', 'b1', '9', '5']],
    '★番号が変わる別ファイルの端子だけ(盤A の 2 は表の順でも 2 なので入らない)');
  ok(asked.plan.every(p => p.type === 'junction'), '一覧では「端子番号」と出す(仕様ではない)');
  openPage._src = '/盤Z.seqzu';
  sb.renumberTerminals('XT1');
  eq(openPage.elements.find(e => e.id === 'o1').label, '5', '別ファイルの後ろなら 5');
  openPage._src = '/盤0.seqzu';
  asked = null;
  sb.renumberTerminals('XT2');
  eq(asked, null, '番号が変わらなければ聞かない(別ファイルだけの台 XT2 は 1 のまま)');
  sb.pidxAskWrite = saveAsk;
}

console.log('\n【端子台として集計の切り替え】');
{
  ledger();
  toasts.length = 0;
  sb.setTBExcluded('XT1', true);
  ok(toasts.some(m => /別ファイルにある 4 点は切り替えていません/.test(m)), '別ファイルの端子は切り替えていないと知らせる');
  eq(openPage.elements.find(e => e.id === 'o1').tbExclude, true, '開いているファイルの端子は切り替わる');
  sb.setTBExcluded('XT1', false);
}

console.log('\n【表示】');
(async () => {
  ledger();
  sb.showTBTable();
  ok(new RegExp(`このファイル1ページ＋プロジェクトの別ファイル${sb.pidxPages().length}ページを集計`).test(_html), '★集計した範囲(別ファイルのページ数)');
  ok(/灰色の行は別ファイルの端子です/.test(_html), '別ファイルの行の説明');
  const rowsHtml = _html.split('<tr').slice(1);
  const extRow = rowsHtml.find(h => /別ファイル（盤A）の端子/.test(h));
  ok(extRow && !/draggable|onclick/.test(extRow), '★別ファイルの行はドラッグ・押して飛ぶ無し');
  ok(rowsHtml.some(h => /draggable="true" data-elid="o1"/.test(h)), '開いているファイルの行は今まで通り');
  ok(/<td>盤A\//.test(_html) || /盤A/.test(extRow), '位置にファイル名');

  let refreshed = 0;
  sb.pidxRefresh = async () => { refreshed++; return true; };
  await sb.openTBTable();
  eq(refreshed, 1, '★端子台表を開くと台帳を最新にする(変わったファイルだけ読む)');
  ok(/call:'openTBTable\(\)'/.test(R('js/report.js')) && /onclick="openTBTable\(\)"/.test(R('index.html')), 'リボン・帳票のタブから openTBTable');

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
