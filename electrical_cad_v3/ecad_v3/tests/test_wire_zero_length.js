// ================================================================
// 配線ツール: 直前と同じ点を押しても長さ0の配線を作らない
//
// 【2026-09-25】盛田さん「線番あるのに線番なしで判定されてるのが１箇所あるな」。
// Sheet3の(575,270)に長さ0の配線があり、線番13の線の途中に見えないまま乗って
// 未採番の別ネットになっていた。配線ツールは押すたびにその点までの線を1本作るので、
// 同じ点を2回押す(ダブルクリック等)と長さ0の配線ができていた。
// 盛田さんの決定A: 配線ツールで作らない(既存図面の分は手で消す)。
//
// tools.js の実コードから wireTool を切り出して動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const src = fs.readFileSync(__dirname + '/../js/tools.js', 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('const wireTool = {');
const e = src.indexOf('\n};\n', s);
if (s < 0 || e < 0) throw new Error('wireTool が見つかりません');

let seq = 0;
const sb = {
  state: { wirePoints: [], wireSnapPts: [], wires: [], preview: null },
  snapWirePoint: (x, y) => ({ x, y, snapType: null }),
  pushH: () => {}, genId: p => p + '_' + (seq++), activeLayer: () => '回路',
};
vm.createContext(sb);
vm.runInContext(src.slice(s, e + 3) + '\nthis.wireTool = wireTool;', sb);
const click = (x, y) => sb.wireTool.onDown(x, y, {});
const lens = () => sb.state.wires.map(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1));

console.log('【同じ点を2回押しても長さ0の配線を作らない】');
click(0, 0); click(0, 0);
ok(sb.state.wires.length === 0, '始点を2回押しても配線は0本');
click(100, 0); click(100, 0);
ok(sb.state.wires.length === 1, '途中の点をダブルクリックしても配線は1本だけ');
ok(lens().every(l => l > 0), '長さ0の配線が無い');

console.log('\n【続けて引けば従来どおり】');
click(100, 50);
ok(sb.state.wires.length === 2, '別の点を押せば次の配線ができる');
const w = sb.state.wires[1];
ok(w.x1 === 100 && w.y1 === 0 && w.x2 === 100 && w.y2 === 50, '直前の点から続けて引ける');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
