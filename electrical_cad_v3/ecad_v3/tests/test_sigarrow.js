// ================================================================
// ページ跨ぎの矢印(送り・受け)の一対一の結び(2026-09-30、js/xref.js の sigarrowCompute)
//
// 盛田さんの決定(HANDOFF.md)を実コードで確かめる:
//   ・コイル側: 図の中身の一番下より下に、デバイス名→型式→電圧→接点(a/b別行)。端子番号つき。使っていない接点は位置を空欄
//   ・接点側: デバイス名の真下に、コイルの位置を括弧付きで (1/6C)
//   ・対象はコイルとa接点・b接点だけ。「空き」「未使用」の文字は書かない
// 期待値は盛田さんの実図面Sheet3のCR1(MY4N)と同じ。区画は列=数字・行=英字。
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

let _html = '';
const sb = { console, _reportOpen: (k, ti, h) => { _html = h; }, pushH() {}, draw() {}, dl() {}, confirm: () => true, alert() {}, updateRightPanel() {}, incRef: s => s.replace(/\d+$/, n => String(+n + 1).padStart(n.length, '0')), window: {}, document: { getElementById: () => null }, escH: require('./_esch.js').escH,
  getDef: t => ({ sout: { w: 30, h: 20, role: 'sig_out' }, sin: { w: 30, h: 20, role: 'sig_in' }, coil: { w: 96, h: 80, role: 'coil' }, ca: { w: 40, h: 40, role: 'contact_a' }, cb: { w: 40, h: 40, role: 'contact_b' },
                  cm: { w: 40, h: 40, role: 'contact_main' }, lamp: { w: 40, h: 40, role: '' } }[t] || { w: 20, h: 20 }) };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
sb._reportOpen = (k, ti, h) => { _html = h; };   // report.js の定義を、HTMLを受け取るだけのものに差し替える   // 接点Refの型式欄はデバイス台帳を通る
const frame = R('js/frame.js');
vm.runInContext([pick(frame, /function frameGeom\([\s\S]*?\n\}/), pick(frame, /function zoneColLabel[^\n]*/), pick(frame, /function zoneRowLabel[^\n]*/),
  pick(R('js/ui.js'), /function parseTerminalGroups\([\s\S]*?\n\}/)].join('\n'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
vm.runInContext(R('js/xref.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState;', sb);

const FRAME = { sc: 2, wMM: 420, hMM: 297, mg: 10, thMM: 30, cols: 12, rows: 4 };
let id = 0;
const E = (type, x, y, o) => Object.assign({ id: 'e' + (++id), type, x, y, layer: '回路' }, o);
const setup = pages => { sb.state = { pages: pages.map(els => ({ name: 'P', elements: els, wires: [], frameObj: FRAME })), currentPage: 0, customSymbols: [], customParts: [], showXref: true };
  return sb.xrefCompute(); };

console.log('【送り1・受け1 = 一対一】');
{
  const o = E('sout', 100, 100, { label: '101' }), i = E('sin', 300, 200, { label: '101' });
  const L = setup([[o], [E('lamp', 0, 0), i]]);
  eq(L.arrows.get(o.id).text.startsWith('→ 2'), true, '送りに「→ 受けのページ」が出る');
  eq(L.arrows.get(i.id).text.startsWith('← 1'), true, '受けに「← 送りのページ」が出る');
  eq(L.arrows.get(o.id).pi, 0, '送りは1ページ目');
  eq(L.arrowIssues.length, 0, '問題なし');
}
console.log('【名前は全角・半角・大小の違いを吸収】');
{
  const o = E('sout', 100, 100, { label: 'ａ1' }), i = E('sin', 100, 100, { label: 'A1 ' });
  eq(setup([[o], [i]]).arrowIssues.length, 0, 'ａ1 と A1 は同じ名前');
}
console.log('【相手なし・多すぎ・名前なし】');
{
  const o = E('sout', 0, 0, { label: '5' });
  let L = setup([[o]]);
  eq(L.arrows.get(o.id).text, '(相手なし)', '受けが無い送りは「(相手なし)」');
  eq(L.arrowIssues[0].reason, '受け矢印がありません', '理由を返す');
  const a = E('sout', 0, 0, { label: '7' }), b = E('sout', 0, 0, { label: '7' }), c = E('sin', 0, 0, { label: '7' });
  L = setup([[a, b], [c]]);
  eq(L.arrowIssues.length, 3, '送り2・受け1は一対一でないので3つとも問題');
  eq(L.arrows.get(c.id).text, '(相手なし)', 'どれにも相手を出さない');
  L = setup([[E('sin', 0, 0, { label: '  ' })]]);
  eq(L.arrowIssues[0].reason, '名前(ラベル)が空です', '名前が空は問題');
}
console.log('【分割ファイル(プロジェクト)】');
{
  // 開いている図面=1ページ目(コイルCR1)。別ファイルB=2ページ目(接点)、別ファイルC=送り矢印
  const coilEl = E('coil', 360, 375, { partRef: 'CR1', partModel: 'MY4N', terminals: '13,14', devFs: 7 });
  const o = E('sout', 100, 100, { label: '9' });
  sb.state = { pages: [{ name: 'P1', elements: [coilEl, o], wires: [], frameObj: FRAME }], currentPage: 0, customSymbols: [],
    customParts: [{ ref: 'MY4N', type: 'coil', terminals: 'コイル:13,14 / 接点1:1,5,9' }], showXref: true };
  const cont = E('ca', 390, 191, { partRef: 'CR1', partModel: 'MY4N', terminals: '9,5', devFs: 6 });
  const inn = E('sin', 300, 200, { label: '9' });
  sb.xprojState.files = [
    { name: 'B.json', pages: [{ name: 'PB', elements: [cont, inn], wires: [], frameObj: FRAME }], symbols: [] },
    { name: 'same.json', pages: [{ name: 'P1', elements: [E('ca', 0, 0, { partRef: 'CR1' })], wires: [], frameObj: FRAME }], symbols: [] },
  ];
  const pagesBefore = sb.state.pages;
  const L = sb.xrefCompute();
  eq(sb.state.pages === pagesBefore && sb.state.pages.length === 1, true, '計算のあとは今の図面のページに戻る(別ファイルは足したまま残さない)');
  ok(/^\(B\/1\//.test(L.byEl.get(coilEl.id) ? '(B/1/' : ''), 'コイルのブロックが出る');
  eq(L.blocks[0].lines.some(l => /^a 9-5 \(B\/1\//.test(l.t)), true, '別ファイルの接点が「ファイル名/ページ/区画」つきでコイルに出る');
  eq(L.arrows.get(o.id).text.startsWith('→ B/1'), true, '送り矢印に別ファイルの受けの位置が出る');
  eq(L.arrowIssues.length, 0, '別ファイルの矢印と一対一');
  eq(JSON.stringify(L.blocks).includes('same'), false, '開いている図面と同じページ名のファイルは使わない');
  sb.xprojState.files = [];
  eq(sb.xrefCompute().arrows.get(o.id).text, '(相手なし)', 'プロジェクトが空なら今の図面だけで計算');
}
console.log('【線番表: 矢印でつながるネットは1行・線番1つ】');
{
  const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
  const o = E('sout', 100, 100, { label: '9' }), i = E('sin', 300, 200, { label: '9' });
  const mk = () => {
    sb.state = { pages: [
      { name: 'P1', elements: [o], wires: [W('w1', 115, 100, 200, 100), W('w2', 200, 100, 200, 150)], frameObj: FRAME },
      { name: 'P2', elements: [i], wires: [W('w3', 285, 200, 250, 200)], frameObj: FRAME },
      { name: 'P3', elements: [], wires: [W('w4', 0, 0, 50, 0)], frameObj: FRAME },
    ], currentPage: 0, customSymbols: [], customParts: [], wireNoRule: 'W001' };
  };
  mk();
  const links = sb.sigNetLinks();
  eq(links.length, 1, '矢印の対が1つ');
  eq([links[0].a.idxs, links[0].b.idxs], [[0, 1], [0]], '送り・受けそれぞれの端子に触れているネットの配線');
  sb.wireNoTable();
  const rows = (_html.match(/<tr [^>]*jumpToNet/g) || []).length;
  eq(rows, 2, 'P1とP2のネットが1行にまとまり、P3の1行と合わせて2行');
  ok(/P1 ⇄ P2/.test(_html), 'ページ欄に「P1 ⇄ P2」');
  ok(/未採番 4本/.test(_html), '未採番の本数はまとめたあとの行で数える(全4本が未採番)');
  sb.applyNetWireNoParts([[0, [0, 1]], [1, [0]]], 'W005');
  eq([sb.state.pages[0].wires.map(w => w.wireNo).filter(Boolean), sb.state.pages[1].wires[0].wireNo], [['W005'], 'W005'], '入力すると送り側・受け側の両方のネットに1か所ずつ入る');
  // 一括割付は相手の番号を引き継ぐ
  mk();
  sb.state.pages[0].wires[0].wireNo = 'W007';
  sb.prompt = () => 'W001';
  sb.autoWireNumber();
  eq(sb.state.pages[1].wires[0].wireNo, 'W007', '一括割付: 相手に番号があれば引き継ぐ(別の番号を振らない)');
  eq(sb.state.pages[2].wires[0].wireNo, '01', '矢印と関係のないネットは線番の書式(既定=ページ番号なし・連番2桁)で採番');
  // 別ファイルの相手
  mk();
  sb.state.pages.length = 1;
  sb.xprojState.files = [{ name: 'B.json', pages: [{ name: 'PB', elements: [i], wires: [W('x1', 285, 200, 250, 200, 'W009')], frameObj: FRAME }], symbols: [] }];
  sb.wireNoTable();
  ok(/別ファイルの相手/.test(_html) && /B\/1[^ <]* W009/.test(_html), '別ファイルの相手の線番が読み取り専用で添えられる');
  sb.state.pages[0].wires[0].wireNo = 'W001'; sb.state.pages[0].wires[1].wireNo = 'W001';
  sb.wireNoTable();
  ok(/食い違っています/.test(_html), '番号が違えば橙で知らせる');
  sb.state.pages[0].wires.forEach(w => { w.wireNo = ''; });
  sb.prompt = () => 'W001';
  sb.autoWireNumber();
  eq(sb.state.pages[0].wires.map(w => w.wireNo).filter(Boolean), ['W009'], '一括割付: 別ファイルの相手の番号も引き継ぐ');
  sb.xprojState.files = [];
}
console.log('【線番の書式(2026-10-04): ページ跨ぎの線は送り側のページの番号】');
{
  const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
  const o = E('sout', 100, 100, { label: '9' }), i = E('sin', 300, 200, { label: '9' });
  sb.state = { wireNoFmt: { pageDigits: 1, seqDigits: 2 }, currentPage: 1, customSymbols: [], customParts: [], pages: [
    { name: 'P1', elements: [o], wires: [W('w1', 115, 100, 200, 100)], frameObj: Object.assign({}, FRAME, { page: '1' }) },
    { name: 'P2', elements: [i], wires: [W('w3', 285, 200, 250, 200), W('w5', 0, 0, 0, 50)], frameObj: Object.assign({}, FRAME, { page: '2' }) } ] };
  sb.autoWireNumber('page');   // 今のページは受け側の P2
  eq([sb.state.pages[0].wires[0].wireNo, sb.state.pages[1].wires[0].wireNo, sb.state.pages[1].wires[1].wireNo], ['101', '101', '201'],
    '★矢印でつながる線は送り側(P1=1ページ)の番号 101 が両側に入る。P2だけの線は 201');
  sb.state.pages[1].wires[1].wireNo = '205';
  sb.confirm = () => true;
  sb.wireNoRenumberPage(1);
  eq([sb.state.pages[1].wires[0].wireNo, sb.state.pages[1].wires[1].wireNo], ['101', '201'], '★受け側のページを振り直しても、送り側の番号 101 は触らない');
}
console.log('【接続チェック: 矢印の問題】');
{
  const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
  const o = E('sout', 100, 100, { label: '9' }), i = E('sin', 300, 200, { label: '9' });
  const mk = (w1, w2) => { sb.state = { pages: [
      { name: 'P1', elements: [o], wires: [W('w1', 115, 100, 200, 100, w1)], frameObj: FRAME },
      { name: 'P2', elements: [i], wires: w2 ? [W('w3', 285, 200, 250, 200, w2)] : [], frameObj: FRAME } ], currentPage: 0, customSymbols: [], customParts: [] }; };
  mk('W1', 'W1');
  eq(sb.analyzeArrowIssues().length, 0, '一対一で線番も同じなら問題なし');
  mk('W1', 'W2');
  eq(sb.analyzeArrowIssues().map(a => a.txt.includes('線番が違います')), [true], '送りと受けの線番が違えば問題');
  mk('W1', '');
  eq(sb.analyzeArrowIssues().map(a => a.txt.includes('触れていません')), [true], '受けの矢印に配線が触れていなければ問題');
  sb.state.pages[1].elements = [];
  eq(sb.analyzeArrowIssues().map(a => a.txt.includes('受け矢印がありません')), [true], '相手がいなければ問題');
  mk('W1', 'W1');
  sb.showConnTable();
  ok(!/ページ跨ぎの矢印の問題/.test(_html), '問題が無ければ矢印の欄は出ない');
  mk('W1', 'W2');
  sb.showConnTable();
  ok(/ページ跨ぎの矢印の問題/.test(_html) && /jumpToRefEl\(/.test(_html), '問題があれば欄が出て、行を押すと矢印へ飛ぶ');
}
console.log('【読む側: 配線番号CSV・端子台表・接続チェックは相手の線番を使う】');
{
  const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
  const o = E('sout', 100, 100, { label: '9' }), i = E('sin', 300, 200, { label: '9' });
  const tb = E('junction', 250, 200, { style: 'circle', r: 3, partRef: 'TB1', label: '1' });
  const mk = (w1, w2) => { sb.state = { pages: [
      { name: 'P1', elements: [o], wires: [W('w1', 115, 100, 200, 100, w1)], frameObj: FRAME },
      { name: 'P2', elements: [i, tb], wires: [W('w3', 285, 200, 250, 200, w2)], frameObj: FRAME } ], currentPage: 0, customSymbols: [], customParts: [] }; };
  mk('W7', '');
  eq(sb.netWireNoOf(sb.state.pages[1]), ['W7'], '未採番の側は、相手の線番が出る(書き込みはしない)');
  eq(sb.state.pages[1].wires[0].wireNo, '', '図面のデータは変えない');
  eq(sb.netWireNoOf(sb.state.pages[0]), ['W7'], '番号のある側はそのまま');
  mk('W7', 'W8');
  eq(sb.netWireNoOf(sb.state.pages[1]), ['W8'], '番号のあるネットは相手に合わせて変えない');
  mk('W7', '');
  eq(sb.buildTerminalBlockRows().map(r => r.conns), [['W7']], '端子台表の接続線番も相手の線番');
  eq(sb.analyzeConnections().filter(n => !n.wireNo).length, 0, '接続チェックも未採番にしない');
  mk('', '');
  eq(sb.netWireNoOf(sb.state.pages[1]), [''], '両方未採番なら空のまま');
  // 別ファイルの相手
  mk('', '');
  sb.state.pages.length = 1;
  sb.state.pages[0].wires = [W('w1', 115, 100, 200, 100, '')];
  sb.xprojState.files = [{ name: 'B.json', pages: [{ name: 'PB', elements: [i], wires: [W('x1', 285, 200, 250, 200, 'W9')], frameObj: FRAME }], symbols: [] }];
  eq(sb.netWireNoOf(sb.state.pages[0]), ['W9'], '別ファイルの相手の線番も使う(読むだけ)');
  sb.xprojState.files = [];
}
console.log('【分割ファイル: 型番の食い違いを選ぶ画面に出す】');
{
  const coil = E('coil', 360, 375, { partRef: 'CR1', partModel: 'MY4N', terminals: '13,14' });
  sb.state = { pages: [{ name: 'P1', elements: [coil], wires: [], frameObj: FRAME }], currentPage: 0, customSymbols: [], customParts: [] };
  sb.xprojState.files = [{ name: 'B.json', symbols: [], pages: [{ name: 'PB', wires: [], frameObj: FRAME,
    elements: [E('ca', 390, 191, { partRef: 'CR1', partModel: 'MY2N', terminals: '9,5' })] }] }];
  const pagesBefore = sb.state.pages;
  const cs = sb.devConflicts();
  eq(cs.length, 1, '別ファイルの同じデバイスと型番が違えば食い違い1件');
  eq(cs[0].field, 'partModel', '項目は型番');
  const ext = cs[0].options.flatMap(o => o.items).filter(it => it.ext);
  eq(ext.length === 1 && /^B\/1/.test(ext[0].loc), true, '別ファイルの記号には「B/1/…」の位置が付く');
  eq(cs[0].options.flatMap(o => o.items).filter(it => !it.ext).length, 1, '今の図面の記号はext=false');
  eq(sb.state.pages === pagesBefore && sb.state.pages.length === 1, true, '調べたあとは今の図面のページに戻る');
  ok(/別ファイル（B）/.test(sb.devConflictNote(cs)), '選ぶ画面に「別ファイルの値は書き換えない」の注意が出る');
  // 選んだ値は今の図面だけに入る
  sb.devSetField(cs[0].key, 'partModel', 'MY2N');
  eq(coil.partModel, 'MY2N', '今の図面のデバイスに選んだ値が入る');
  eq(sb.devConflicts().length, 0, 'そろえれば食い違いは消える');
  sb.xprojState.files = [];
  eq(sb.devConflicts().length, 0, 'プロジェクトが空なら今の図面だけ');
}
console.log('【矢印の文字は「線番 → ページ/区画」(盛田さん「線番、ページ、区分を書く」)】');
{
  const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
  const o = E('sout', 100, 100, { label: '9' }), i = E('sin', 300, 200, { label: '9' });
  const mk = (w1, w2) => { sb.state = { pages: [
      { name: 'P1', elements: [o], wires: [W('w1', 115, 100, 200, 100, w1)], frameObj: FRAME },
      { name: 'P2', elements: [i], wires: [W('w3', 285, 200, 250, 200, w2)], frameObj: FRAME } ], currentPage: 0, customSymbols: [], customParts: [], showXref: true }; };
  mk('W001', '');
  let L = sb.xrefCompute();
  eq(/^W001 → 2\//.test(L.arrows.get(o.id).text), true, '送り: 「W001 → 2/区画」');
  eq(/^W001 ← 1\//.test(L.arrows.get(i.id).text), true, '受け: 片方にしか線番が無くても同じ線番「W001 ← 1/区画」');
  mk('', '');
  L = sb.xrefCompute();
  eq(/^→ 2\//.test(L.arrows.get(o.id).text), true, 'どちらも未採番なら位置だけ');
}
console.log('【位置のページは表題欄の頁番号(盛田さん「表題欄に書く頁番号」)】');
{
  const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
  const o = E('sout', 100, 100, { label: '9' }), i = E('sin', 300, 200, { label: '9' });
  const F = pg => Object.assign({}, FRAME, { page: pg });
  sb.state = { pages: [
    { name: 'P1', elements: [o], wires: [W('w1', 115, 100, 200, 100, 'W1')], frameObj: F('12') },
    { name: 'P2', elements: [i], wires: [W('w3', 285, 200, 250, 200)], frameObj: F('15 / 40') } ], currentPage: 0, customSymbols: [], customParts: [], showXref: true };
  let L = sb.xrefCompute();
  eq(/^W1 → 15\//.test(L.arrows.get(o.id).text), true, '相手の表題欄の頁番号「15 / 40」の「15」が出る');
  eq(/^W1 ← 12\//.test(L.arrows.get(i.id).text), true, '頁番号「12」');
  sb.state.pages[1].frameObj = F('');
  L = sb.xrefCompute();
  eq(/^W1 → 2\//.test(L.arrows.get(o.id).text), true, '頁番号が空欄ならシートの並び順');
  // 別ファイル: 頁番号があればファイル名を付けない、無ければ付ける
  sb.state.pages.length = 1;
  sb.xprojState.files = [{ name: 'B.json', symbols: [], pages: [{ name: 'PB', elements: [i], wires: [W('x1', 285, 200, 250, 200)], frameObj: F('7') }] }];
  eq(/^W1 → 7\//.test(sb.xrefCompute().arrows.get(o.id).text), true, '別ファイルも表題欄の頁番号(ファイル名は付けない)');
  sb.xprojState.files[0].pages[0].frameObj = F('');
  eq(/^W1 → B\/1\//.test(sb.xrefCompute().arrows.get(o.id).text), true, '別ファイルで頁番号が空欄なら「ファイル名/1/区画」');
  // 食い違いの画面の注意は、頁番号があってもファイル名で出る
  const c1 = E('coil', 360, 375, { partRef: 'CR9', partModel: 'MY4N' });
  sb.state.pages[0].elements.push(c1);
  sb.xprojState.files = [{ name: 'B.json', symbols: [], pages: [{ name: 'PB', wires: [], frameObj: F('7'), elements: [E('ca', 390, 191, { partRef: 'CR9', partModel: 'MY2N' })] }] }];
  ok(/別ファイル（B）/.test(sb.devConflictNote(sb.devConflicts())), '食い違いの注意は頁番号があってもファイル名「B」');
  sb.xprojState.files = [];
}
console.log('【矢印のプロパティ: 名前欄・CRタブ(2026-10-01)】');
{
  const ui = R('js/ui.js');
  ok(/const _isSig = \['sig_out', 'sig_in'\]\.includes\(symRole\(el\)\)/.test(ui) && /\|\| _isSig;/.test(ui), '矢印でもCRタブを出す');
  ok(/if \(_isSig\) html \+= `<div style="display:none">`/.test(ui), '矢印ではデバイス・型式の欄を隠す(欄は残す)');
  ok(/const _spN = _isSig \? '名前' : '仕様'/.test(ui), '矢印では「仕様」欄を「名前」と見せる');
  const o = E('sout', 100, 100, { label: '9', xrefHide: true }), i = E('sin', 300, 200, { label: '9' });
  sb.state = { pages: [{ name: 'P1', elements: [o], wires: [], frameObj: FRAME }, { name: 'P2', elements: [i], wires: [], frameObj: FRAME }], currentPage: 0, customSymbols: [], customParts: [], showXref: true };
  const L = sb.xrefCompute();
  eq([L.arrows.has(o.id), L.arrows.has(i.id)], [false, true], 'CRタブで表示OFFの矢印は相手表示を出さない(相手の判定はそのまま)');
}
console.log('【矢印以外は影響しない】');
{
  const L = setup([[E('lamp', 0, 0, { label: '101' })]]);
  eq(L.arrows.size + L.arrowIssues.length, 0, 'ランプなどは対象外');
}
console.log('【部品表に載せない】');
{
  const els = [E('sout', 0, 0, { label: '101' }), E('sin', 0, 0, { label: '101' }), E('lamp', 0, 0, { partRef: 'PL1', partModel: 'X' })];
  sb.state = { pages: [{ name: 'P', elements: els, wires: [], frameObj: FRAME }], currentPage: 0, customSymbols: [], customParts: [] };
  const rows = sb.collectBOMRows();
  eq(rows.reduce((n, r) => n + (r.parts || r.count || 0), 0), 1, '矢印は部品表に出ない(ランプ1台だけ)');
}
ok(/sig_out/.test(R('index.html')) && /sig_in/.test(R('index.html')), 'シンボル登録の種別に送り・受けがある');
ok(/L\.arrows/.test(R('js/draw.js')) && /xl\.arrows/.test(R('js/dxf_export.js')), '画面もDXFも同じ結果から出す');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
