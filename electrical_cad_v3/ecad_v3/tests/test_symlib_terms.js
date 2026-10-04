// シンボルライブラリ(JIS C 0617)から置くとき、端子を自動で付けてグリッドに乗せる(2026-10-04 js/symbol_lib.js)
//   node tests/test_symlib_terms.js
// 盛田さん「ライブラリーから直接おく機能は使えないという事か？」「3極も乗らないとおかしい」→「はい」。
// 以前は端子が必ず空で、図形の外枠の中心を基準にしていたので線の端がグリッドから 2〜8 ずれた(3極 MC は x=-32・8・48)。
// このテストが守るもの(Sheet3 に入っている実際の JIS 図記号の図形で確かめる):
//   1. 端子 = 外枠の辺にある線の開いた端(内側の線の端は含めない)。3極は6つ
//   2. 平行移動だけで全部の端子がグリッドに乗る(倍率は変えない=形・大きさは同じ)
//   3. 図面に置いてあるものは、定義をずらしても画面上の位置が変わらない(回転・反転・倍率込み)
//   4. 同じ図記号をもう一度置いても、端子のある定義は上書きしない
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const lib = R('js/symbol_lib.js'), pe = R('js/pin_editor.js');
const fn = (src, n, ind) => { const m = src.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n' + (ind || '') + '\\}')); if (!m) throw new Error(n); return m[0]; };
const sb = { state: { G: 10, pages: [] } };
vm.createContext(sb);
vm.runInContext([fn(pe, 'distToSegLocal'), fn(pe, 'peCollectCandidatePoints'), fn(lib, 'libAlignToGrid', '  '), fn(lib, 'libCompensatePlaced', '  ')].join('\n'), sb);
const S = JSON.parse(R('drawings/仕様２1002_Sheet3.json')).customSymbols;
const shapesOf = t => S.find(s => s.type === 'lib_JIS_C_0617______' + t).shapes;
const onGrid = ts => ts.every(t => Math.abs(t.x / 10 - Math.round(t.x / 10)) < 1e-6 && Math.abs(t.y / 10 - Math.round(t.y / 10)) < 1e-6);

console.log('【端子を付けてグリッドに乗せる】');
{
  const a = sb.libAlignToGrid(shapesOf('MC-3P_F1V'), 'V');
  eq(a.terms.map(t => [t.x, t.y]), [[-30, -40], [10, -40], [50, -40], [-30, 40], [10, 40], [50, 40]], '★3極の電磁接触器: 端子6つ(上下の外側の線の端)が -30・10・50 / ±40 に乗る(以前は -32・8・48)');
  eq([a.dx, a.dy], [2, 0], '平行移動だけ(2)');
  const li = shapesOf('MC-3P_F1V').findIndex(x => x.t === 'L');
  const before = shapesOf('MC-3P_F1V')[li], after = a.shapes[li];
  ok(Math.abs((after.x2 - after.x1) - (before.x2 - before.x1)) < 1e-9 && Math.abs((after.y2 - after.y1) - (before.y2 - before.y1)) < 1e-9, '図形の形・大きさは変わらない');
}
for (const [t, n] of [['MCCB_T1V', 2], ['LS-B_S1V', 2], ['PBS-B_S1H', 2]]) {
  const a = sb.libAlignToGrid(shapesOf(t), t.slice(-1));
  ok(a.terms.length === n && onGrid(a.terms), `${t}: 端子${n}つがグリッドに乗る(${JSON.stringify(a.terms.map(x => [x.x, x.y]))})`);
}
eq(sb.libAlignToGrid([{ t: 'C', cx: 0, cy: 0, r: 10 }]).terms, [], '線の開いた端が無い図記号(枠だけ等)は端子なし');
eq(sb.libAlignToGrid(shapesOf('MC-3P_F1V')).terms.length, 6, '向きが分からなくても、向かい合う2辺の両方に線の端がある方(上下)を端子にする');

console.log('\n【置いてあるものは画面上で動かない】');
{
  const el = { type: 'X', x: 100, y: 200, rot: 90, flipH: true, scale: 0.5 };
  sb.state.pages = [{ elements: [el] }];
  const world = (e, p) => { const sc = e.scale || 1, a = (e.rot || 0) * Math.PI / 180; const lx = e.flipH ? -p[0] : p[0], ly = e.flipV ? -p[1] : p[1]; return [e.x + sc * (lx * Math.cos(a) - ly * Math.sin(a)), e.y + sc * (lx * Math.sin(a) + ly * Math.cos(a))]; };
  const p0 = world(el, [-32, -40]);
  sb.libCompensatePlaced('X', 2, 0);
  const p1 = world(el, [-30, -40]);
  ok(Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) < 1e-9, '★定義を (2,0) ずらしても、回転90・左右反転・倍率0.5 の置いてあるものの線は同じ位置');
}

console.log('\n【もう一度置いても上書きしない】');
ok(/if\(existing>=0 && \(state\.customSymbols\[existing\]\.terminals\|\|\[\]\)\.length\)\{\s*symDef=state\.customSymbols\[existing\];/.test(lib), '★端子のある定義はそのまま使う(端子編集で付けた端子を消さない)');
ok(!/state\.customSymbols\[existing\]=symDef/.test(lib), '定義を丸ごと置き換えない');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
