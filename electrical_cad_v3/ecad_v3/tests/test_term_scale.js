// 端子の位置は、置いたシンボルの倍率(el.scale)に従って縮む(2026-09-29、盛田さん「帳票系を確認」→「やっていい」)
//   node tests/test_term_scale.js
//
// 【背景】カスタムシンボルの絵は el.scale で縮小して描かれるのに、端子の位置(cS.terminals)には倍率が掛かっていなかった。
// Sheet3の接点(倍率0.29〜0.45)では、計算上の端子が絵から離れた所に出て、配線の端(絵の端子=倍率を掛けた位置)と
// 合わず、接続チェックは配線70本中47本が「端子未特定」になっていた。
// 端子の位置を計算する4箇所(snap.js / conn_table.js / conn_check.js / draw.js の symTermPoints)は必ず揃える。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const near = (a, b, m) => ok(Math.abs(a - b) < 1e-9, `${m}（実際 ${a}、期待 ${b}）`);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

// Sheet3の接点と同じ形: 高さ54・端子は縦に±25、倍率0.447 → 絵の端子は中心から±11.17
const cS = { type: 'k', w: 14, h: 54, terminals: [{ x: 0, y: -25, label: '' }, { x: 0, y: 25, label: '' }] };
const el = { id: 'e1', type: 'k', x: 390, y: 191, scale: 0.4466220154377728, rot: 0, layer: '回路', terminals: '9,5' };
const want = [[390, 191 - 25 * el.scale], [390, 191 + 25 * el.scale]];

const sb = { console, LAYERS: [{ name: '回路', visible: true }], getDef: () => ({ w: 14, h: 54 }), document: { getElementById: () => null } };
sb.state = { customSymbols: [cS], elements: [el], wires: [] };
vm.createContext(sb);
vm.runInContext(R('js/conn_table.js').replace(/^const CONN_TABLE_TOL/m, 'var CONN_TABLE_TOL'), sb);
vm.runInContext(R('js/conn_check.js').replace(/^const CONN_CHECK_TOL/m, 'var CONN_CHECK_TOL'), sb);
vm.runInContext(pick(R('js/draw.js'), /function symTermPoints\([\s\S]*?\n\}\n/), sb);

console.log('【接続表・未接続チェック・端子番号の位置が、倍率を掛けた位置で揃っている】');
const a = sb.collectTerminalPoints([el]);
near(a[0].y, want[0][1], 'conn_table: 端子1のY'); near(a[1].y, want[1][1], 'conn_table: 端子2のY');
const c = sb.symTermPoints(el, cS, { w: 14, h: 54 });
near(c[0].y, want[0][1], 'draw.js symTermPoints: 端子1のY'); near(c[1].y, want[1][1], 'draw.js symTermPoints: 端子2のY');
// 配線の端を、絵の端子の位置(倍率を掛けた位置)に置いたら、両端とも接続と判定される
sb.state.wires = [{ id: 'w1', pts: [{ x: 390, y: 100 }, { x: 390, y: want[0][1] }] }, { id: 'w2', pts: [{ x: 390, y: want[1][1] }, { x: 390, y: 300 }] }];
ok(sb.findUnconnectedTerminals().length === 0, 'conn_check: 絵の端子の位置に配線の端を置けば「未接続」にならない');
const near0 = sb.findNearestTerminal(390, want[0][1], sb.collectTerminalPoints([el]), 5);
ok(near0 && near0.dispTerm === '9', 'conn_table: 配線の端から端子9が特定できる');
// 倍率を掛けない古い位置(±25)には、もう吸われない
ok(!sb.findNearestTerminal(390, 191 - 25, sb.collectTerminalPoints([el]), 5), '倍率を掛けない古い位置(±25)は端子ではない');
el.scale = 1;
near(sb.collectTerminalPoints([el])[0].y, 191 - 25, '倍率1なら従来と同じ位置');

console.log('【4箇所とも端子の定義位置に倍率を掛けている(数え上げ漏れ防止)】');
['js/snap.js', 'js/conn_table.js', 'js/conn_check.js', 'js/draw.js'].forEach(f => {
  const code = R(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  ok(/const tsc = el\.scale \|\| 1;/.test(code) && /t\.x \* tsc/.test(code) && /t\.y \* tsc/.test(code), `${f}: cS.terminals に el.scale を掛けている`);
});

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
