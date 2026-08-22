// カスタムシンボル登録・配置・DXF出力での「弧の向き(ccw)」保持のテスト
//   node tests/test_arc_ccw.js
//
// 【背景】盛田さんの報告「シンボルの登録がおかしくなる」。3極ブレーカー接点
// (fline+arc、23要素)を登録パネルに貼り付けたところ、本来は左に膨らむはずの
// 半円(接点の丸み)が反対側に描かれ、レール線と交差して網目状に見えていた。
//
// 原因: canvas上のarc要素は el.ccw (時計回り/反時計回り) を持つが、
// カスタムシンボルの内部形式('A'ショート)には ccw フィールドが無く、
// 変換・プレビュー・配置描画・DXF出力のどこでも ccw=false 固定で扱われていた。
// 元のarcが ccw=true (反時計回り、例: -90°→90°を左側=180°経由で結ぶ)だった場合、
// 変換後は ccw=false (時計回り、0°経由=右側)で描かれてしまい、向きが反転する。
//
// 修正箇所:
//   ①srWorldShapesForEl: el.ccw を 'A' ショートに persist する
//   ②srPasteFromClipboard: 貼り付け時に ccw を引き継ぐ
//   ③srDrawShape: 登録パネルのプレビュー描画で ccw を使う
//   ④flattenSymbolElToShapes: 反転(flipH/flipV奇数回)時はccwも反転する
//   ⑤js/symbols.js: 配置済みシンボルの本描画で ccw を使う
//   ⑥js/dxf_export.js: カスタムシンボルのDXF出力でY反転+ccw規則を単体arcと揃える
//   ⑦サムネイル生成2箇所(パレット表示用)

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// ------------------------------------------------------------------
// ①②③④: js/ui.js の該当関数を実コードのままevalして検証
// ------------------------------------------------------------------
const uiSrc = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = uiSrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = uiSrc.indexOf('\n}', start);
  return uiSrc.slice(start, end + 2);
};

const sandbox = {
  console,
  snapLineWidth: v => v,
};
vm.createContext(sandbox);
vm.runInContext(
  [grab('srWorldShapesForEl'), grab('srEffectiveLW'), grab('srXformPt'), grab('srXformAngle'),
   grab('flattenSymbolElToShapes')].join('\n'),
  sandbox
);
sandbox.state = { customSymbols: [] };
sandbox.LAYERS = [];

// ------------------------------------------------------------------
console.log('【①srWorldShapesForEl: arc要素からccwを持ち出す】');
const ccwArc = { type:'arc', x:100, y:100, r:5, startA:-Math.PI/2, endA:Math.PI/2, ccw:true };
const cwArc  = { type:'arc', x:100, y:100, r:5, startA:-Math.PI/2, endA:Math.PI/2, ccw:false };
eq(sandbox.srWorldShapesForEl(ccwArc)[0].ccw, true,  '元がccw:trueならshapesもccw:true');
eq(sandbox.srWorldShapesForEl(cwArc)[0].ccw,  false, '元がccw:falseならshapesもccw:false');
eq(sandbox.srWorldShapesForEl({ type:'arc', x:0,y:0,r:1,startA:0,endA:1 })[0].ccw, false,
   'ccw未設定(旧データ)ならfalseを補う(!!undefined)');

// ------------------------------------------------------------------
console.log('【④flattenSymbolElToShapes: 反転時はccwも一緒に反転する】');
const cS = { shapes: [{ t:'A', cx:0, cy:0, r:5, sa:-90, ea:90, ccw:true }] };
const elNoFlip = { x:100, y:100, rot:0, flipH:false, flipV:false, scale:1 };
const elFlipH  = { x:100, y:100, rot:0, flipH:true,  flipV:false, scale:1 };
const elFlipV  = { x:100, y:100, rot:0, flipH:false, flipV:true,  scale:1 };
const elFlipBoth = { x:100, y:100, rot:0, flipH:true, flipV:true, scale:1 };

eq(sandbox.flattenSymbolElToShapes(elNoFlip, cS)[0].ccw, true,  '反転なしならccwはそのまま');
eq(sandbox.flattenSymbolElToShapes(elFlipH,  cS)[0].ccw, false, '片方だけ反転(flipH)ならccwも反転する');
eq(sandbox.flattenSymbolElToShapes(elFlipV,  cS)[0].ccw, false, '片方だけ反転(flipV)ならccwも反転する');
eq(sandbox.flattenSymbolElToShapes(elFlipBoth, cS)[0].ccw, true,
   '両方反転(flipH+flipV、奇数回ではなく偶数回)ならccwは元に戻る');

// ------------------------------------------------------------------
console.log('【③srDrawShape: 登録パネルのプレビューがccwを使って弧を描く】');
{
  const arcCalls = [];
  const fakeCtx = {
    save(){}, restore(){}, beginPath(){}, stroke(){}, strokeRect(){}, fillText(){},
    moveTo(){}, lineTo(){}, closePath(){},
    arc(cx, cy, r, sa, ea, ccw) { arcCalls.push({ cx, cy, r, sa, ea, ccw }); },
    set strokeStyle(v){}, set fillStyle(v){}, set lineWidth(v){}, set font(v){}, set textAlign(v){},
  };
  const srSandbox = { console };
  vm.createContext(srSandbox);
  srSandbox._srZoom = 2;
  srSandbox.SR_CX = 0; srSandbox.SR_CY = 0;
  vm.runInContext(grab('srDrawShape'), srSandbox);
  srSandbox.srDrawShape(fakeCtx, { t:'A', cx:0, cy:0, r:5, sa:-90, ea:90, ccw:true }, '#222');
  eq(arcCalls[0].ccw, true, 'ccw:trueの図形はctx.arcにも第6引数trueで渡る');
  srSandbox.srDrawShape(fakeCtx, { t:'A', cx:0, cy:0, r:5, sa:-90, ea:90, ccw:false }, '#222');
  eq(arcCalls[1].ccw, false, 'ccw:falseの図形はctx.arcにも第6引数falseで渡る');
}

// ------------------------------------------------------------------
console.log('【⑤js/symbols.js: 配置済みシンボルの本描画がccwを使う】');
{
  const arcCalls = [];
  const fakeCtx = {
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, beginPath(){}, stroke(){},
    strokeRect(){}, fillText(){}, moveTo(){}, lineTo(){}, closePath(){},
    arc(cx, cy, r, sa, ea, ccw) { arcCalls.push({ ccw }); },
    set strokeStyle(v){}, set fillStyle(v){}, set lineWidth(v){}, set font(v){}, set textAlign(v){},
  };
  const symSandbox = {
    ctx: fakeCtx, console,
    state: { zoom: 1, customSymbols: [{ type:'my_breaker', shapes:[
      { t:'A', cx:0, cy:0, r:5, sa:-90, ea:90, ccw:true },
      { t:'A', cx:0, cy:0, r:5, sa:-90, ea:90, ccw:false },
    ] }] },
    fgC: () => '#000',
    DEFAULT_LINE_WIDTH: 0.5,
    applyLineStyle: () => {},
  };
  vm.createContext(symSandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/symbols.js', 'utf8'), symSandbox);
  symSandbox.drawSym('my_breaker', 0, 0, false, 0, false, false, '#000', null, null, 1);
  eq(arcCalls.map(a => a.ccw), [true, false], '配置描画でも各弧のccwがそのまま使われる(固定falseにならない)');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
