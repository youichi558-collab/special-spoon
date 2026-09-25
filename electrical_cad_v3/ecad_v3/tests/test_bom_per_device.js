// ================================================================
// 部品表: 1デバイス=1行・分岐点(●)を載せない
//
// 【2026-09-25】盛田さん「分岐点は部品じゃない」「型式で折りたたむのはNG、
// 間違ってたらどう修正するのか？」
//   ・以前は同じ型番のデバイスを1行に束ね(「CR1, CR1A, CR3, CR2A」MY4N 4台)、
//     メーカー等を部品表で打つと束ねた全デバイスに書き込まれていた
//   ・分岐点(●)が「デバイス未設定」に junction 24台 として載っていた
//
// report.js を丸ごと実行し、本物の collectBOMRows / showBOM / setBOMMaker を動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const stub = () => ({ innerHTML: '', textContent: '', style: {}, onclick: null });
const domEls = {};
['report-tabs', 'report-title', 'report-body', 'report-csv-btn'].forEach(id => { domEls[id] = stub(); });
const sb = {
  document: { getElementById: id => domEls[id] || null },
  console,
  escH: require('./_esch.js').escH,
  window: {},
  openFP: () => {}, draw: () => {}, pushH: () => {}, updateRightPanel: () => {},
  getDef: () => ({}),
  partVoltOptions: () => [],
};
vm.createContext(sb);
// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8').replace(/\r\n/g, '\n'), sb);

const els = [
  { id: 1, type: 'c_coil', partRef: 'CR10', partModel: 'MY4N' },
  { id: 2, type: 'c_coil', partRef: 'CR2',  partModel: 'MY4N' },
  { id: 3, type: 'c_a',    partRef: 'CR2',  partModel: 'MY4N' },   // CR2の接点(同じデバイス)
  { id: 4, type: 'c_coil', partRef: 'CR1',  partModel: 'MY4N' },
  { id: 5, type: 'junction', x: 0, y: 0, style: 'dot' },           // 分岐点
  { id: 6, type: 'junction', x: 9, y: 0 },                         // style未設定=●
  { id: 7, type: 'junction', x: 0, y: 9, style: 'circle', partRef: 'TB1', label: '1' },
];
sb.state = { pages: [{ name: 'P1', elements: els, groups: [] }], customParts: [] };

console.log('【同じ型番でも1デバイス=1行】');
{
  const rows = sb.collectBOMRows().filter(r => !r.noRef);
  const my4 = rows.filter(r => r.model === 'MY4N');
  eq(my4.map(r => r.refs.join()), ['CR1', 'CR2', 'CR10'], 'MY4Nの3台が別々の行・デバイス名の自然順');
  eq(my4.map(r => r.count), [1, 1, 1], '各行の台数は1');
  eq(my4.map(r => r.parts), [1, 2, 1], '同じデバイスの接点はその行の構成数に入る(CR2はコイル+接点=2)');
}

console.log('\n【部品表で打った値はそのデバイスだけに入る】');
{
  sb.showBOM();
  const idx = sb.window._bomRows.findIndex(r => r.refs[0] === 'CR2');
  sb.setBOMMaker(idx, 'オムロン');
  eq(els.filter(e => e.partRef === 'CR2').map(e => e.partMaker), ['オムロン', 'オムロン'], 'CR2の全要素に入る');
  ok(els.filter(e => e.partRef === 'CR1' || e.partRef === 'CR10').every(e => !e.partMaker),
     '同じ型番のCR1・CR10には入らない');
}

console.log('\n【分岐点(●)は載せない・端子台(○)は残す】');
{
  const rows = sb.collectBOMRows();
  ok(!rows.some(r => r.noRef && r.type === 'junction'), '分岐点が「デバイス未設定」に載らない');
  ok(rows.some(r => r.refs[0] === 'TB1'), '端子台TB1は載る');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
