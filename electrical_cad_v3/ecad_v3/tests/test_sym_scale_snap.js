// シンボルの倍率を「端子の間隔がグリッドの倍数になる値」にそろえる(2026-10-04 js/resize.js symScaleSnap)
//   node tests/test_sym_scale_snap.js
// 盛田さん「倍率変えるときにどうするかだ」。半端な倍率(Sheet3 の PB1 は 0.344)だと端子が ±13.78 になり、
// 配線と端子がぴったり合わず、グリッドにも乗らない。
// このテストが守るもの:
//   1. 今の端子間隔から止まる倍率を決める(DXF 由来で間隔が半端でもよい)。一番近い値
//   2. 端子が2つ未満・90度単位でない回転・どの倍率でも乗らないときは、そろえない(null)
//   3. そろえるのはハンドルのドラッグと、倍率欄の値を実際に変えたときだけ(他の欄の適用で今の倍率を変えない)。グループの大きさ変更は今のまま
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../js/' + f, 'utf8').replace(/\r\n/g, '\n');
const src = R('resize.js').match(/function symScaleSnap\([\s\S]*?\n\}/)[0];
const sb = { state: { G: 10, customSymbols: [] } };
vm.createContext(sb); vm.runInContext(src, sb);
const sym = (type, terms) => sb.state.customSymbols.push({ type, terminals: terms.map(([x, y]) => ({ x, y })) });
sym('pb', [[0, -40], [0, 40]]);              // Sheet3 の押釦a接点(間隔 80)
sym('ca', [[0, -25], [0, 25]]);              // a接点(間隔 50)
sym('dxf', [[0, 0], [0, 27.3]]);             // DXF 由来で間隔が半端
sym('m', [[-30, -30], [0, -30], [30, -30], [-60, -30]]);   // 電動機(横に30間隔)
sym('bad', [[0, 0], [30, 0], [0, 47]]);      // 横30・縦47(全部を同時にそろえる倍率が近くに無い)
sym('one', [[0, 0]]);
const S = (type, want, rot) => sb.symScaleSnap({ type, rot: rot || 0 }, want);

console.log('【止まる倍率】');
eq(S('pb', 0.344), { scale: 0.375, pitch: 30 }, '★Sheet3 の PB1(0.344)→ 0.375(端子の間隔 30)');
eq(S('pb', 0.26).scale, 0.25, '0.26 → 0.25(間隔 20)');
eq(S('ca', 0.4466), { scale: 0.4, pitch: 20 }, 'a接点(間隔50)の 0.4466 → 0.4(間隔 20)');
eq(S('dxf', 1).pitch, 30, '★DXF 由来の半端な間隔(27.3)でも、間隔がグリッドの倍数(30)になる倍率に止まる');
eq(S('m', 0.9).scale, 1, '端子が4つでも、全部の間隔(30・60・90)がグリッドの倍数になる倍率');
eq(S('pb', 0.344, 90).scale, 0.375, '90度回転していても同じ');

console.log('\n【そろえないとき】');
eq(S('bad', 0.5), null, '★全部の間隔を同時にグリッドの倍数にできる倍率が近くに無ければ、そろえない');
eq(S('one', 0.5), null, '端子が1つ以下ならそろえない');
eq(S('pb', 0.344, 45), null, '90度単位でない回転ならそろえない');
eq(S('nosym', 0.5), null, '登録の無いシンボルはそろえない');

console.log('\n【そろえる場所】');
const rz = R('resize.js'), ui = R('ui.js');
ok(/const sn = symScaleSnap\(el, raw\)/.test(rz), 'ハンドルのドラッグでそろえる');
ok(!/symScaleSnap/.test(rz.match(/function applyGroupResize\([\s\S]*?\n\}/)[0]), '★グループでのまとめての大きさ変更ではそろえない(並びの関係を崩さない)');
ok(/Math\.abs\(want - orig\) < 1e-9\) el\.scale = orig/.test(ui), '★倍率欄を変えていなければ今の倍率をそのまま(他の欄の適用で今の図面の倍率を変えない)');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
