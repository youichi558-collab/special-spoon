// ================================================================
// 主回路の線番の段送り(2026-10-04 仮案。js/wire_no_main.js)
//   node tests/test_wire_no_main.js
//
// 盛田さん「一応主回路、仮案で入れとくか、どうなるかやってみたい」。決まり(仮):
//   起点は手入力 / 主接点を通るたびに段を上げる(R → R1) / 分岐は段＋枝番(R21・R22)、その先は R31 /
//   U・V・W の端子に乗る線は U1 / 枝番・モータの番号は「位置順 / デバイス名の番号」/ 相は端子番号 奇数↔次の偶数 /
//   手で入れた名前は変えない / 自動の名前は目印付きで、もう一度押すと入れ直す / 決められない所は入れずに知らせる
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (c, m) => eq(!!c, true, m);

const log = { confirm: [], table: '' };
// 1極の主接点(上=1・下=2)と、端子 U のモータ
const CB = { type: 'cb', role: 'contact_main', w: 20, h: 20, terminals: [{ x: 0, y: -10, label: '1' }, { x: 0, y: 10, label: '2' }] };
const M  = { type: 'mot', role: '', w: 20, h: 20, terminals: [{ x: 0, y: -10, label: 'U' }] };
const DEFS = { cb: CB, mot: M };
const sb = {
  document: { getElementById: () => null }, console, window: {},
  escH: require('./_esch.js').escH,
  confirm: m => { log.confirm.push(m); return true; }, alert: () => {},
  openFP: () => {}, closeFP: () => {}, draw: () => {}, pushH: () => {},
  getDef: t => DEFS[t] || { w: 20 },
};
vm.createContext(sb);
const R = f => fs.readFileSync(__dirname + '/../js/' + f, 'utf8').replace(/\r\n/g, '\n');
vm.runInContext(R('report.js'), sb);
vm.runInContext(R('conn_table.js'), sb);
vm.runInContext(R('wire_no_main.js'), sb);
sb.wireNoTable = m => { log.table = m || ''; };

const W = (id, x1, y1, x2, y2, no) => ({ id, x1, y1, x2, y2, wireNo: no || '' });
// R ─ CB1 ─ R1 ─┬─ CB2 ─ R21 ─ MC1 ─ R31
//               └─ CB3 ─ (モータ M1 の U)
function setup(fmt, refs) {
  refs = refs || {};
  log.confirm = []; log.table = '';
  const els = [
    { id: 'cb1', type: 'cb', x: 0,   y: 0,   partRef: refs.cb1 || 'CB1' },
    { id: 'cb2', type: 'cb', x: 0,   y: 70,  partRef: refs.cb2 || 'CB2' },
    { id: 'cb3', type: 'cb', x: 100, y: 70,  partRef: refs.cb3 || 'CB3' },
    { id: 'mc1', type: 'cb', x: 0,   y: 130, partRef: 'MC1' },
    { id: 'm1',  type: 'mot', x: 100, y: 200, partRef: 'M1' },
    { id: 'j',   type: 'junction', x: 0, y: 50, style: 'dot' },
  ];
  const wires = [
    W('r',   0, -50, 0, -10, 'R'),                       // 起点(手入力)
    W('o1',  0, 10, 0, 60), W('o1b', 0, 50, 100, 50), W('o1c', 100, 50, 100, 60),   // CB1 の出口(●で分岐)
    W('o2',  0, 80, 0, 120),                             // CB2 の出口 → MC1
    W('o3',  0, 140, 0, 180),                            // MC1 の出口
    W('o4',  100, 80, 100, 190),                         // CB3 の出口 → モータの U
  ];
  sb.state = { wireNoFmt: fmt || {}, currentPage: 0, customSymbols: [CB, M], customParts: [],
    pages: [{ name: 'P1', elements: els, wires, frameObj: null }] };
  return wires;
}
const byId = (w, id) => w.find(x => x.id === id);
const names = w => ['r', 'o1', 'o2', 'o3', 'o4'].map(id => { const g = sb.groupWiresByNet(w, null, sb.state.pages[0].elements).find(g => g.includes(w.indexOf(byId(w, id)))); return g.map(i => w[i].wireNo).find(Boolean) || ''; });

console.log('【段送り・分岐・U・V・W】');
{
  const w = setup();
  sb.wireNoMainCircuit(0);
  eq(names(w), ['R', 'R1', 'R21', 'R31', 'U1'], '★R → CB1 → R1 → 分岐 CB2 → R21 → MC1 → R31(枝番を持ち越す)/CB3 の先はモータの U → U1');
  ok(/R1/.test(log.confirm[0] || ''), '入れる前に一覧で確かめる');
  ok(w.filter(x => x.wireNo && x.wireNo !== 'R').every(x => x.wireNoMain), '自動で入れた名前には目印');
  ok(!byId(w, 'r').wireNoMain, '起点(手入力)には目印を付けない');
  log.confirm = [];
  sb.wireNoMainCircuit(0);
  ok(log.confirm.length === 0 && /入れる名前はありません/.test(log.table), 'もう一度押しても変わらない');
}

console.log('\n【手で直した名前は変えない】');
{
  const w = setup();
  sb.wireNoMainCircuit(0);
  const i = w.indexOf(w.find(x => x.wireNo === 'R21'));
  const g = sb.groupWiresByNet(w, null, sb.state.pages[0].elements).find(g => g.includes(i));
  sb.applyNetWireNo(0, g, 'R2A');   // 線番表で手で直す
  sb.wireNoMainCircuit(0);
  eq(names(w), ['R', 'R1', 'R2A', 'R31', 'U1'], '★手で直した R2A は次に押しても変わらない(目印が外れる)。その先の R31 は決まりで作り直せないが消さずに残す');
}

console.log('\n【デバイス名の番号】');
{
  const w = setup({ mainBranch: 'dev', mainMotor: 'dev' }, { cb2: 'MCCB5' });
  sb.wireNoMainCircuit(0);
  eq(names(w), ['R', 'R1', 'R25', 'R35', 'U1'], '★分岐の枝番は MCCB5 の 5 → R25(その先 R35)/モータは M1 の 1 → U1');
  const w2 = setup({ mainBranch: 'dev' }, { cb2: 'MCCB' });
  sb.wireNoMainCircuit(0);
  eq(names(w2)[2], '', '★デバイス名に番号が無ければ入れない');
  ok(/番号が無い/.test(log.table), 'そのことを知らせる');
}

console.log('\n【決められない所は入れずに知らせる】');
{
  const w = setup();
  CB.terminals[1].label = '4';   // 1 と 4 は組にならない
  sb.wireNoMainCircuit(0);
  CB.terminals[1].label = '2';
  eq(names(w), ['R', '', '', '', 'U1'], '★端子番号が「奇数とその次の偶数」の組にならなければ先へ進まない');
  ok(/組にならない/.test(log.table), 'そのことを知らせる');
  const w2 = setup();
  w2.push(W('x', 500, 0, 500, 30, 'R21'));   // 別の所で R21 を手で使っている
  sb.wireNoMainCircuit(0);
  eq(names(w2)[2], '', '★同じ名前が既にあれば入れない(同じ番号は出てはいけない)');
}

console.log('\n【制御の番号の割付・振り直しは主回路の名前を触らない】');
{
  const w = setup({ pageDigits: 0, seqDigits: 2 });
  sb.wireNoMainCircuit(0);
  sb.wireNoRenumberPage(0);
  eq(names(w), ['R', 'R1', 'R21', 'R31', 'U1'], '振り直しても主回路の名前は変わらない(書式に合わない=名前)');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
