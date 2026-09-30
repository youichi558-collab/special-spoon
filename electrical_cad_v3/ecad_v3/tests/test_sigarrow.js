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

const sb = { console, window: {}, document: { getElementById: () => null }, escH: require('./_esch.js').escH,
  getDef: t => ({ sout: { w: 30, h: 20, role: 'sig_out' }, sin: { w: 30, h: 20, role: 'sig_in' }, coil: { w: 96, h: 80, role: 'coil' }, ca: { w: 40, h: 40, role: 'contact_a' }, cb: { w: 40, h: 40, role: 'contact_b' },
                  cm: { w: 40, h: 40, role: 'contact_main' }, lamp: { w: 40, h: 40, role: '' } }[t] || { w: 20, h: 20 }) };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/devices.js'), sb);   // 接点Refの型式欄はデバイス台帳を通る
const frame = R('js/frame.js');
vm.runInContext([pick(frame, /function frameGeom\([\s\S]*?\n\}/), pick(frame, /function zoneColLabel[^\n]*/), pick(frame, /function zoneRowLabel[^\n]*/),
  pick(R('js/ui.js'), /function parseTerminalGroups\([\s\S]*?\n\}/)].join('\n'), sb);
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
