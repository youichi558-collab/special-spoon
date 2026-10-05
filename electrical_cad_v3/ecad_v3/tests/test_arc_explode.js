// 弧の向き(2026-10-05 盛田さん「弧の計算間違ってないか」「シンボル分解しても弧の向きが変わる」)
//   node tests/test_arc_explode.js
// このテストが守るもの:
//   1. シンボル分解(js/edit.js explodeSelected)の弧が、分解前の描画(js/symbols.js: 反転→回転、ccw あり)と同じ点の集まりになる。回転0/90/180/270 × 反転4通り
//   2. ピンエディタの弧の描画が ccw を使う
//   3. シンボルライブラリ(JIS の DXF)の弧の取り込みが y反転に合わせて角度を反転し ccw にする(DXF読込と同じ)
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (c) console.log('  OK', m); else { ng++; console.log('  NG', m); } };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

// canvas の arc(cx,cy,r,a1,a2,ccw) が描く点(角度の刻みで)
function arcPts(cx, cy, r, a1, a2, ccw, n = 24) {
  const TAU = Math.PI * 2;
  let sweep = ccw ? a1 - a2 : a2 - a1;
  sweep = ((sweep % TAU) + TAU) % TAU;
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a1 + (ccw ? -1 : 1) * sweep * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
const near = (P, Q) => P.every(p => Q.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.6)) && Q.every(q => P.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.6));

const edit = R('js/edit.js');
const fn = edit.match(/function explodeSelected\(\)[\s\S]*?\n\}/)[0];
const shape = { t: 'A', cx: -30, cy: 5, r: 5, sa: -90, ea: 90, ccw: true };   // 盛田さんの漏電ブレーカーの弧(左にふくらむ)
const shape2 = { t: 'A', cx: 3, cy: -2, r: 6, sa: 10, ea: 100, ccw: false };   // 対称でない弧
console.log('【分解しても弧が同じ所に描かれる】');
let all = true, cnt = 0;
for (const sh of [shape, shape2]) for (const rotD of [0, 90, 180, 270]) for (const fH of [false, true]) for (const fV of [false, true]) {
  const el = { id: 'e', type: 'S', x: 100, y: 50, rot: rotD, flipH: fH, flipV: fV, scale: 1.5 };
  const sb = { console, Math, state: { elements: [el], sel: { els: new Set(['e']), wires: new Set() }, customSymbols: [{ type: 'S', shapes: [sh] }] },
    pushH() {}, genId: () => 'n' + (++cnt), activeLayer: () => 'L', draw() {}, updateRightPanel() {}, renderGroupList() {}, rebuildGroupIdx() {} };
  vm.createContext(sb);
  vm.runInContext(fn + '\nthis.explodeSelected = explodeSelected;', sb);
  try { sb.explodeSelected(); } catch (e) {}
  const a = sb.state.elements.find(x => x.type === 'arc');
  // 分解前: 局所座標の弧の点を 反転→拡大→回転→平行移動
  const rot = rotD * Math.PI / 180, sc = 1.5;
  const before = arcPts(sh.cx, sh.cy, sh.r, sh.sa * Math.PI / 180, sh.ea * Math.PI / 180, !!sh.ccw).map(([x, y]) => {
    const sx = x * (fH ? -1 : 1) * sc, sy = y * (fV ? -1 : 1) * sc;
    return [el.x + sx * Math.cos(rot) - sy * Math.sin(rot), el.y + sx * Math.sin(rot) + sy * Math.cos(rot)];
  });
  const after = a ? arcPts(a.x, a.y, a.r, a.startA, a.endA, !!a.ccw) : [];
  if (!a || !near(before, after)) { all = false; console.log('    ずれ', JSON.stringify(sh), rotD, fH, fV); }
}
ok(all, '★回転0/90/180/270・反転4通りで、分解前と分解後の弧が同じ点の集まり');

console.log('\n【置いたシンボルから登録し直す(反転・回転したもの)】');
{
  const ui = R('js/ui.js');
  const pick = re => ui.match(re)[0];
  const sb = { Math, console };
  vm.createContext(sb);
  vm.runInContext([pick(/function srXformPt\([\s\S]*?\n\}/), pick(/function srXformAngle\([\s\S]*?\n\}/), pick(/function flattenSymbolElToShapes\([\s\S]*?\n\}/)].join('\n') + ';this.flat = flattenSymbolElToShapes;', sb);
  let good = true;
  for (const sh of [shape, shape2]) for (const rotD of [0, 90, 180, 270]) for (const fH of [false, true]) for (const fV of [false, true]) {
    const el = { x: 100, y: 50, rot: rotD, flipH: fH, flipV: fV, scale: 1.5 };
    const o = sb.flat(el, { shapes: [sh] })[0];
    const rot = rotD * Math.PI / 180;
    const before = arcPts(sh.cx, sh.cy, sh.r, sh.sa * Math.PI / 180, sh.ea * Math.PI / 180, !!sh.ccw).map(([x, y]) => {
      const sx = x * (fH ? -1 : 1) * 1.5, sy = y * (fV ? -1 : 1) * 1.5;
      return [el.x + sx * Math.cos(rot) - sy * Math.sin(rot), el.y + sx * Math.sin(rot) + sy * Math.cos(rot)];
    });
    if (!near(before, arcPts(o.cx, o.cy, o.r, o.sa * Math.PI / 180, o.ea * Math.PI / 180, !!o.ccw))) { good = false; console.log('    ずれ', rotD, fH, fV); }
  }
  ok(good, '★反転・回転したシンボルを登録し直しても弧が同じ所(flattenSymbolElToShapes)');
}

console.log('\n【ピンエディタ・シンボルライブラリ】');
ok(/c\.arc\(T\(s\.cx\), TY\(s\.cy\), Math\.max\(1, s\.r \* _peZoom\), s\.sa \* Math\.PI \/ 180, s\.ea \* Math\.PI \/ 180, !!s\.ccw\)/.test(R('js/pin_editor.js')), '★ピンエディタは弧の向き(ccw)を使う');
const lib = R('js/symbol_lib.js');
ok(/if\(s\.t==='A'\) return \{t:'A',cx:\(s\.cx-cxDxf\)\*SCALE,cy:-\(s\.cy-cyDxf\)\*SCALE,r:s\.r\*SCALE,sa:-s\.sa,ea:-s\.ea,ccw:true\}/.test(lib), '★シンボルライブラリの DXF の弧は角度を反転して ccw(DXF読込と同じ)');
// 取り込んだ弧が DXF の弧と同じ点(y反転)になるか: DXF 10°→100° 反時計回り
{
  const dxf = arcPts(0, 0, 1, 10 * Math.PI / 180, 100 * Math.PI / 180, false).map(([x, y]) => [x, -y]);   // y上向きでは角度が増える向き=反時計回り。y反転した点
  const conv = arcPts(0, 0, 1, -10 * Math.PI / 180, -100 * Math.PI / 180, true);
  ok(near(dxf, conv), '取り込み後の弧は DXF の弧を y反転した点と同じ');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
