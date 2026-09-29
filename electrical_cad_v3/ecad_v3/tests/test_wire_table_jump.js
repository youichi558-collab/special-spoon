// ================================================================
// 線番表の行を押すと、図面のそのネットへ飛ぶ(jumpToNet)
//
// 【2026-09-25】盛田さん「線番が無いことはわかるがそれがどれなのかは不明」。
// 行を押す → 帳票パネルを閉じ(中央を覆って見えないため)、そのページへ切り替え、
// ネットの配線を選択して画面中央に出し、点滅させる(検索と同じ動き)。
// 欄・ボタン・チェックを押したときは飛ばない。
//
// report.js を丸ごと実行し、本物の jumpToNet / wireNoTable を動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const log = { closed: [], switched: [] };
const domEls = {};
['report-tabs', 'report-title', 'report-body', 'report-csv-btn'].forEach(id => { domEls[id] = { innerHTML: '', textContent: '', style: {} }; });
const sb = {
  document: { getElementById: id => domEls[id] || null },
  console,
  escH: require('./_esch.js').escH,
  window: {},
  cv: { width: 1000, height: 800 },
  openFP: () => {}, closeFP: id => log.closed.push(id),
  draw: () => {}, pushH: () => {}, updateRightPanel: () => {}, updateResizeHandles: () => {},
  requestAnimationFrame: () => {},
  switchPage: i => { log.switched.push(i); sb.state.currentPage = i; },
};
vm.createContext(sb);
// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8').replace(/\r\n/g, '\n'), sb);
// 接続チェック・端子台表は conn_table.js にある(本物を使う)
vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8').replace(/\r\n/g, '\n'), sb);

sb.state = {
  currentPage: 0, zoom: 0.5, pan: { x: 0, y: 0 },
  sel: { els: new Set(['e1']), wires: new Set(['old']) },
  pages: [
    { name: 'P1', elements: [], wires: [{ id: 'a', x1: 0, y1: 0, x2: 10, y2: 0, wireNo: '01' }] },
    { name: 'P2', elements: [], wires: [
      { id: 'x', x1: 0,   y1: 0,   x2: 100, y2: 0,   wireNo: '05' },
      { id: 'y', x1: 200, y1: 100, x2: 300, y2: 100 },
    ] },
  ],
};

console.log('【別ページの未採番の配線へ飛ぶ】');
sb.jumpToNet(1, [1]);
ok(log.closed.includes('report-p'), '帳票パネルを閉じる(中央を覆って見えないため)');
ok(log.switched[0] === 1, 'そのページへ切り替える');
ok(sb.state.sel.wires.size === 1 && sb.state.sel.wires.has('y'), 'その配線だけを選択する');
ok(sb.state.sel.els.size === 0, '要素の選択は外す');
ok(sb.state.zoom === 1, '縮小しすぎていれば100%にする');
ok(sb.state.pan.x === 500 - 250 && sb.state.pan.y === 400 - 100, '配線の中心が画面中央に来る');
ok(sb.state.searchHit && sb.state.searchHit.x === 250 && sb.state.searchHit.y === 100, '配線の中点で点滅する');

console.log('\n【線番表の行に飛ぶ仕掛けがある・欄やボタンでは飛ばない】');
sb.wireNoTable();
const body = domEls['report-body'].innerHTML;
ok(/<tr [^>]*jumpToNet\(1,\[1\]\)/.test(body), '行を押すと jumpToNet が呼ばれる');
ok(/INPUT\|BUTTON\|SELECT/.test(body), '欄・ボタン・チェックを押したときは飛ばない条件がある');

console.log('\n【注目する点(focus)を渡すと、その点へ飛ぶ・点滅する(接続チェックの「端子未特定」用)】');
sb.state.zoom = 2; sb.state.pan = { x: 0, y: 0 };
sb.jumpToNet(1, [1], { x: 210, y: 100 });
ok(sb.state.pan.x === 500 - 210 * 2 && sb.state.pan.y === 400 - 100 * 2, 'focus の点が画面中央に来る');
ok(sb.state.searchHit && sb.state.searchHit.x === 210 && sb.state.searchHit.y === 100, 'focus の点で点滅する');
ok(sb.state.sel.wires.size === 1 && sb.state.sel.wires.has('y'), '選択は配線のまま');

console.log('\n【接続チェックの行: 押すとその配線へ飛ぶ。端子に乗っていない端があれば、その端へ】');
{
  const el = { id: 'k', type: 't', x: 0, y: 0, partRef: 'K1' };
  sb.state.customSymbols = [];
  sb.getDef = () => ({ w: 20 });
  sb.state.pages = [{ name: 'P1', elements: [el], wires: [
    { id: 'w0', pts: [{ x: -10, y: 0 }, { x: -10, y: 50 }] },   // 始点が端子(K1の左端 -10,0)に乗る・終点は何にも乗らない
    { id: 'w1', pts: [{ x: 10, y: 0 }, { x: 10, y: 0 }] },      // 両端が端子(K1の右端)
  ] }];
  sb.showConnTable();
  const h = domEls['report-body'].innerHTML;
  ok(/<tr onclick="jumpToNet\(0,\[0\],\{x:-10,y:50\}\)"/.test(h), '端子未特定の行は、乗っていない端(終点)を指して飛ぶ');
  ok(/<tr onclick="jumpToNet\(0,\[1\]\)"/.test(h), '問題の無い行は配線そのものへ飛ぶ(focus 無し)');
  ok(/cursor:pointer/.test(h.match(/<tr onclick="jumpToNet\(0,\[0\][^>]*>/)[0]), '押せる見た目');
}

console.log('\n【端子台表の行: 押すとその端子へ飛ぶ】');
{
  const t = (id, x) => ({ id, type: 'junction', style: 'circle', x, y: 0, partRef: 'TB1', label: String(x) });
  sb.state.pages = [{ name: 'P1', elements: [t('t1', 10), t('t2', 20)], wires: [] }, { name: 'P2', elements: [t('t3', 30)], wires: [] }];
  sb.elLocation = () => '1/A1';
  sb.showTBTable();
  const h = domEls['report-body'].innerHTML;
  ok(/<tr draggable="true"[^>]*onclick="jumpToRefEl\(0,&quot;t1&quot;\)"/.test(h), '行を押すと jumpToRefEl(ページ, 端子のID)');
  ok(/onclick="jumpToRefEl\(1,&quot;t3&quot;\)"/.test(h), '別ページの端子はそのページ番号で飛ぶ');
  ok(/ondragstart="tbDragStart/.test(h), 'ドラッグの並べ替えは従来どおり残っている');
  log.closed.length = 0; log.switched.length = 0;
  sb.state.sel = { els: new Set(), wires: new Set() }; sb.state.currentPage = 0; sb.state.zoom = 1; sb.state.pan = { x: 0, y: 0 };
  sb.jumpToRefEl(1, 't3');
  ok(log.closed.includes('report-p') && log.switched[0] === 1 && sb.state.sel.els.has('t3'), '帳票を閉じ、そのページへ移り、その端子を選択する');
  ok(sb.state.pan.x === 500 - 30 && sb.state.pan.y === 400, '端子が画面中央に来る');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
