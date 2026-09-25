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

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
