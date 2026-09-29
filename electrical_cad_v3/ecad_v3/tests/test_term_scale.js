// 端子の位置は、置いたシンボルの倍率(el.scale)に従って縮む(2026-09-29、盛田さん「帳票系を確認」→「やっていい」)
//   node tests/test_term_scale.js
//
// 【背景】カスタムシンボルの絵は el.scale で縮小して描かれるのに、端子の位置(cS.terminals)には倍率が掛かっていなかった。
// Sheet3の接点(倍率0.29〜0.45)では、計算上の端子が絵から離れた所に出て、配線の端(絵の端子=倍率を掛けた位置)と
// 合わず、接続チェックは配線70本中47本が「端子未特定」になっていた。
// 端子の位置を計算する3箇所(snap.js / conn_table.js / draw.js の symTermPoints)は必ず揃える(conn_check.js の独自計算は2026-09-29に conn_table.js へ集めた)。
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
sb.state = { customSymbols: [cS], pages: [{ name: 'P', elements: [el], wires: [] }] };
vm.createContext(sb);
vm.runInContext(R('js/conn_table.js').replace(/^const CONN_TABLE_TOL/m, 'var CONN_TABLE_TOL'), sb);
vm.runInContext(R('js/conn_check.js'), sb);
vm.runInContext(pick(R('js/draw.js'), /function symTermPoints\([\s\S]*?\n\}\n/), sb);

console.log('【接続表・未接続チェック・端子番号の位置が、倍率を掛けた位置で揃っている】');
const a = sb.collectTerminalPoints([el]);
near(a[0].y, want[0][1], 'conn_table: 端子1のY'); near(a[1].y, want[1][1], 'conn_table: 端子2のY');
const c = sb.symTermPoints(el, cS, { w: 14, h: 54 });
near(c[0].y, want[0][1], 'draw.js symTermPoints: 端子1のY'); near(c[1].y, want[1][1], 'draw.js symTermPoints: 端子2のY');
// 配線の端を、絵の端子の位置(倍率を掛けた位置)に置いたら、両端とも接続と判定される
sb.state.pages[0].wires = [{ id: 'w1', pts: [{ x: 390, y: 100 }, { x: 390, y: want[0][1] }] }, { id: 'w2', pts: [{ x: 390, y: want[1][1] }, { x: 390, y: 300 }] }];
ok(sb.findUnconnectedTerminals().length === 0, '未接続の端子: 絵の端子の位置に配線の端を置けば「未接続」にならない');
const near0 = sb.findNearestTerminal(390, want[0][1], sb.collectTerminalPoints([el]), 5);
ok(near0 && near0.dispTerm === '9', 'conn_table: 配線の端から端子9が特定できる');
// 倍率を掛けない古い位置(±25)には、もう吸われない
ok(!sb.findNearestTerminal(390, 191 - 25, sb.collectTerminalPoints([el]), 5), '倍率を掛けない古い位置(±25)は端子ではない');
el.scale = 1;
near(sb.collectTerminalPoints([el])[0].y, 191 - 25, '倍率1なら従来と同じ位置');

console.log('【端子番号の文字の基準点(lx, ly)は、倍率を掛けない昔の位置のまま】');
{
  el.scale = 0.4466220154377728; el.terminals = '9,5';
  const c2 = sb.symTermPoints(el, cS, { w: 14, h: 54 });
  near(c2[0].y, 191 - 25 * el.scale, '端子の位置(y)は倍率を掛けた位置(スナップ・接続チェックと同じ)');
  near(c2[0].ly, 191 - 25, '番号の基準点(ly)は倍率を掛けない昔の位置(リレー周りの端子ごとの位置補正 termOff を追い込んだ基準)');
  near(c2[1].ly, 191 + 25, '2つ目も同じ');
  near(c2[0].lx, 390, '横は中心のまま');
  // 90度回転しても、昔の式(倍率なし)と同じ
  el.rot = 90; const c3 = sb.symTermPoints(el, cS, { w: 14, h: 54 });
  near(c3[0].lx, 390 + 25, '90度回転: 基準点は昔の位置を回したもの(x)'); near(c3[0].ly, 191, '90度回転: (y)');
  el.rot = 0; el.scale = 1;
  const c4 = sb.symTermPoints(el, cS, { w: 14, h: 54 });
  near(c4[0].ly, c4[0].y, '倍率1なら基準点=端子の位置(従来どおり)');
  // 端子が未定義のシンボル(左右端)は、もともと倍率が掛かっている。基準点=端子の位置
  const c5 = sb.symTermPoints({ type: 'std', x: 100, y: 50, scale: 2, terminals: '1,2' }, null, { w: 40, h: 30 });
  near(c5[0].lx, c5[0].x, '端子未定義のシンボル: 基準点=端子の位置');
}
{
  const draw = R('js/draw.js'), dxf = R('js/dxf_export.js');
  ok(/p\.lx \+ lp\.dx \+ ox, p\.ly \+ lp\.dy \+ oy/.test(draw), '画面の端子番号は基準点(lx, ly)から置く');
  ok(/tp\.lx \+ lp\.dx/.test(dxf) && /tp\.ly \+ lp\.dy/.test(dxf), 'DXFの端子番号も同じ基準点(画面と同じ位置)');
}

console.log('【3箇所とも端子の定義位置に倍率を掛けている(数え上げ漏れ防止)】');
['js/snap.js', 'js/conn_table.js', 'js/draw.js'].forEach(f => {
  const code = R(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  ok(/const tsc = el\.scale \|\| 1;/.test(code) && /t\.x \* tsc/.test(code) && /t\.y \* tsc/.test(code), `${f}: cS.terminals に el.scale を掛けている`);
});

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
