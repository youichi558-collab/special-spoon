// 端子台の端子(○◎)にじかに付いたシンボルの端子はつながっている(2026-10-06 js/conn_table.js connSymOnTB)
//   node tests/test_conn_sym_on_tb.js
// 盛田さん「これが未接続になってる理由は？」(Sheet3 のモータ M)。M の T1〜T4 が TB2 1〜4 の○の下の縁(y=423、○の中心は420・半径3)に
// 配線を挟まずじかに付いていて、未接続のチェックは「配線の端が来ているか」しか見ないため未接続、接続チェックでもどのネットにも入らなかった。
// → 案1「端子台の○にじかに付いたシンボルの端子は、その端子台の端子とつながっていると見なす」。
// このテストが守るもの(盛田さんの図面 drawings/仕様２1002_Sheet3.json で):
//   1. 未接続の端子に M が出ない
//   2. 接続チェックのネット U/V/W/E に M の T1〜T4 が入る
//   3. 主回路の線番(wnmPlan)でも M の端子がネットに入る
//   4. ○から離れた端子は今までどおり未接続
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const sb = { console, alert() {}, document: { getElementById: () => null }, getDef: () => ({ w: 20 }), escH: require('./_esch.js').escH, LAYERS: [] };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
const d = JSON.parse(R('drawings/仕様２1002_Sheet3.json'));
sb.state = { customSymbols: d.customSymbols, pages: d.pages };

console.log('【Sheet3 のモータ M(TB2 の○にじかに付いている)】');
const m = d.pages[0].elements[18];
eq([m.partRef, m.x, m.y], ['M', 130, 453], 'M の位置(図面の前提)');
eq(sb.analyzeUnconnectedTerminals().map(u => u.name + ':' + u.term), [], '★未接続の端子に M が出ない(以前は M:T1〜T4)');
const nets = sb.analyzeConnections();
const netOf = no => (nets.find(n => n.wireNo === no) || { terms: [] }).terms.map(t => t.name + ':' + t.term);
eq(netOf('U'), ['INV:U', 'M:T1', 'TB2:1'], '★U のネットに M:T1');
eq(netOf('V'), ['INV:V', 'M:T2', 'TB2:2'], '★V のネットに M:T2');
eq(netOf('W'), ['INV:W', 'M:T3', 'TB2:3'], '★W のネットに M:T3');
eq(netOf('E'), ['INV:PE', 'M:T4', 'TB1:4', 'TB2:4'], '★E のネットに M:T4');
eq(netOf('02'), ['CR3:2', 'LS1:T2', 'TB2:5'], 'ほかのネットは変わらない');

console.log('\n【主回路の線番(js/wire_no_main.js)】');
{
  const src = R('js/wire_no_main.js');
  ok(/connSymOnTB\(collectTerminalPoints\(els\), tol\)/.test(src), '★wnmPlan でも端子台の○にじかに付いた端子をネットに入れる');
}

console.log('\n【○から離れた端子は今までどおり】');
sb.state = { customSymbols: [{ type: 's', terminals: [{ x: 0, y: -30 }] }], pages: [{ name: 'P', wires: [], elements: [
  { id: 'j', type: 'junction', style: 'circle', r: 3, x: 0, y: 0, partRef: 'TB9', label: '1' },
  { id: 'a', type: 's', x: 0, y: 33, partRef: 'A' },    // 端子は (0,3) = ○の縁
  { id: 'b', type: 's', x: 0, y: 39.1, partRef: 'B' },  // 端子は (0,9.1) = ○から 6.1(許容 5 の外)
] }] };
eq(sb.analyzeUnconnectedTerminals().map(u => u.name), ['B'], '★○の縁(半径+5以内)はつながっている・それより離れれば未接続');
eq(sb.connSymOnTB(sb.collectTerminalPoints(sb.state.pages[0].elements)).map(o => o.sym.dispName + '→' + o.tb.dispName), ['A→TB9'], 'connSymOnTB は○に付いた端子だけ');
sb.state.pages[0].elements[0].style = 'dot';   // 分岐点(●)
eq(sb.analyzeUnconnectedTerminals().map(u => u.name), ['A', 'B'], '分岐点(●)にじかに付いた端子は対象外(端子台の端子だけ)');

function ok(c, msg) { eq(!!c, true, msg); }
console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
