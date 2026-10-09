// ================================================================
// 端子台の端子(○◎)の接続の判定を「半径+許容誤差」にそろえる(2026-10-01)
//
// 端子台表(_tbConnsOf)と接続チェック(findNearestTerminal)は「中心から5以内」、線番表(groupWiresByNet)は「半径+5以内」で
// ずれていた。端子の円を5より大きくすると、円周で止めた線を端子台表・接続チェックが拾えなかった(盛田さん「直して」)。
// 線の端は一番近い端子にだけつなぐ(詰めて並べた隣の端子の線を拾わない)。
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const sb = { console, window: {}, document: { getElementById: () => null }, escH: require('./_esch.js').escH, getDef: () => null, LAYERS: [] };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);

const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '', layer: '回路' });
const T = (id, x, y, r, label) => ({ id, type: 'junction', style: 'circle', x, y, r, partRef: 'TB1', label, layer: '回路' });
const setup = (els, wires) => { sb.state = { pages: [{ name: 'P', elements: els, wires, frameObj: null }], currentPage: 0, customSymbols: [], customParts: [] }; };

console.log('【大きい端子(半径8)の円周で止めた線】');
setup([T('t1', 200, 100, 8, '1')], [W('a', 100, 100, 192, 100, 'W1'), W('b', 208, 100, 300, 100)]);
eq(sb.buildTerminalBlockRows().map(r => r.conns), [['W1']], '端子台表: 円周で止めた線の線番が出る');
const n = sb.analyzeConnections();
eq(n.map(x => [x.wireNo, x.terms.map(t => t.name + ':' + t.term), x.dangling.length]), [['W1', ['TB1:1'], 2]], '接続チェック: 端子に乗っている(浮いているのは外側の両端だけ)');

console.log('【詰めて並べた端子(間隔10・半径3)】');
setup([T('t1', 100, 100, 3, '1'), T('t2', 110, 100, 3, '2')],
  [W('a', 100, 50, 100, 97, 'W1'), W('b', 110, 50, 110, 97, 'W2')]);
eq(sb.buildTerminalBlockRows().map(r => [r.termNo, r.conns]), [['1', ['W1']], ['2', ['W2']]], '隣の端子の線は拾わない(一番近い端子にだけ)');

console.log('【端子の上をまっすぐ通して描いた線(2026-10-02)】');
setup([T('t1', 200, 100, 3, '1')], [W('a', 100, 100, 300, 100, 'W5')]);
eq(sb.buildTerminalBlockRows().map(r => r.conns), [['W5']], '端子台表: 円の中を通る線の線番が出る');
eq(sb.analyzeConnections().map(x => x.terms.map(t => t.name + ':' + t.term)), [['TB1:1']], '接続チェック: 端子の一覧に出る');
setup([T('t1', 200, 100, 3, '1')], [W('a', 100, 104, 300, 104, 'W5')]);
eq(sb.buildTerminalBlockRows().map(r => r.conns), [[]], '円の外を通る線は拾わない');
setup([T('t1', 200, 100, 3, '1')], [W('a', 100, 100, 300, 100, 'W5'), W('b', 200, 103, 200, 200)]);
eq(sb.groupWiresByNet(sb.state.pages[0].wires, null, sb.state.pages[0].elements).length, 1, '端子を通る線と、端子に端が乗る線は同じネット');

console.log('【分岐点●は今までどおり中心から】');
setup([{ id: 'j', type: 'junction', style: 'dot', x: 200, y: 100, r: 2, layer: '回路' }], [W('a', 100, 100, 200, 100, 'W1'), W('b', 200, 100, 200, 200)]);
eq(sb.collectTerminalPoints(sb.state.pages[0].elements)[0].r, 0, '●の判定には半径を足さない');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
