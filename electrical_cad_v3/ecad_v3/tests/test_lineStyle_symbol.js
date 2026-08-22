// カスタムシンボル登録・配置・DXF出力での「線種(lineStyle: 破線/点線/一点鎖線)」
// 保持のテスト
//   node tests/test_lineStyle_symbol.js
//
// 【背景】2026-08-22、盛田さんが「点線と実線の違いは？」と指摘。点線で描いた
// flineをカスタムシンボルとして登録すると、登録パネルのプレビュー・配置済み
// シンボルの本描画・DXF出力のいずれでも実線になっていた。ccw(弧の向き)バグと
// 同じ調査(srWorldShapesForEl)で見つかったが、報告の起点は盛田さんの指摘であり、
// 「調査中に(Claude側が能動的に)見つけた」という書き方は正確ではなかった
// (2026-08-23、盛田さん指摘により訂正)。
//
// 原因: srWorldShapesForElはfline/circle/rect/triangle/arcからlineWidthは
// 拾うのにlineStyleを一切拾っていなかった。同様にflattenSymbolElToShapes
// (配置済みインスタンスの再フラット化経路)・srDrawShape(登録パネルの
// プレビュー)・js/symbols.jsのdrawSym(配置済みシンボルの本描画)・
// js/dxf_export.jsのcustomSyms BLOCK定義出力、いずれもlineStyleを
// 参照していなかった。
//
// 修正箇所:
//   ①srWorldShapesForEl: el.lineStyleを各shapeにpersistする
//   ②flattenSymbolElToShapes: s.lineStyleを引き継ぐ(L/C/A/R/Pすべて。
//     Pはこれまでlinewidthすら渡っていなかった漏れも合わせて修正)
//   ③srDrawShape: 登録パネルのプレビュー描画でs.lineStyleに応じてsetLineDash
//   ④js/symbols.js drawSym: 配置済みシンボルの本描画でapplyLineStyle(s.lineStyle)
//     を図形ごとに適用し、ループ後にsetLineDash([])で必ずリセットする
//   ⑤js/dxf_export.js customSyms.forEach: sh.lineStyleをresolveLT()でDXF線種名
//     に変換し、bL/bC/bA/bR/bPに渡す

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// ------------------------------------------------------------------
// ①②: js/ui.js の該当関数を実コードのままevalして検証
// ------------------------------------------------------------------
const uiSrc = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = uiSrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = uiSrc.indexOf('\n}', start);
  return uiSrc.slice(start, end + 2);
};

const sandbox = { console, snapLineWidth: v => v };
vm.createContext(sandbox);
vm.runInContext(
  [grab('srWorldShapesForEl'), grab('srEffectiveLW'), grab('srXformPt'), grab('srXformAngle'),
   grab('flattenSymbolElToShapes')].join('\n'),
  sandbox
);
sandbox.state = { customSymbols: [] };
sandbox.LAYERS = [];

console.log('【①srWorldShapesForEl: 各図形タイプからlineStyleを持ち出す】');
eq(sandbox.srWorldShapesForEl({ type:'fline', x1:0,y1:0,x2:1,y2:1, lineStyle:'dash' })[0].lineStyle, 'dash', 'fline: dash');
eq(sandbox.srWorldShapesForEl({ type:'circle', x:0,y:0,r:5, lineStyle:'dot' })[0].lineStyle, 'dot', 'circle: dot');
eq(sandbox.srWorldShapesForEl({ type:'rect', x:0,y:0,w:5,h:5, lineStyle:'dashdot' })[0].lineStyle, 'dashdot', 'rect: dashdot');
eq(sandbox.srWorldShapesForEl({ type:'arc', x:0,y:0,r:5, startA:0, endA:1, lineStyle:'dot' })[0].lineStyle, 'dot', 'arc: dot');
{
  const tri = sandbox.srWorldShapesForEl({ type:'triangle', x1:0,y1:0,x2:1,y2:0,x3:0,y3:1, lineStyle:'dash' });
  ok(tri.every(s => s.lineStyle === 'dash'), 'triangle: 3辺すべてdash');
}
eq(sandbox.srWorldShapesForEl({ type:'fline', x1:0,y1:0,x2:1,y2:1 })[0].lineStyle, undefined,
   '未指定(実線)ならlineStyleはundefinedのまま(旧データ互換)');

console.log('【②flattenSymbolElToShapes: 配置済みインスタンスの再フラット化でもlineStyleを引き継ぐ】');
{
  const cS = { shapes: [
    { t:'L', x1:0,y1:0,x2:1,y2:1, lineStyle:'dash' },
    { t:'C', cx:0,cy:0,r:5, lineStyle:'dot' },
    { t:'A', cx:0,cy:0,r:5, sa:-90,ea:90,ccw:true, lineStyle:'dashdot' },
    { t:'R', x:0,y:0,w:5,h:5, lineStyle:'dash' },
    { t:'P', pts:[[0,0],[1,0],[1,1]], cl:true, lineWidth:2, lineStyle:'dot' },
  ] };
  const el = { x:100, y:100, rot:0, flipH:false, flipV:false, scale:1 };
  const out = sandbox.flattenSymbolElToShapes(el, cS);
  eq(out[0].lineStyle, 'dash', 'L: dash');
  eq(out[1].lineStyle, 'dot', 'C: dot');
  eq(out[2].lineStyle, 'dashdot', 'A: dashdot');
  eq(out[3].lineStyle, 'dash', 'R(回転無し): dash');
  eq(out[4].lineStyle, 'dot', 'P: dot');
  eq(out[4].lineWidth, 2, 'P: lineWidthも合わせて引き継ぐ(従来は渡っていなかった漏れ)');
}
{
  // 回転ありのRはP(閉じたポリゴン)に変換される経路。そちらもlineStyleが乗るか確認
  const cS = { shapes: [{ t:'R', x:0,y:0,w:5,h:5, lineStyle:'dashdot' }] };
  const el = { x:0, y:0, rot:45, flipH:false, flipV:false, scale:1 };
  const out = sandbox.flattenSymbolElToShapes(el, cS);
  eq(out[0].t, 'P', '回転ありのRはPに変換される');
  eq(out[0].lineStyle, 'dashdot', '回転ありのR→P変換でもlineStyleを引き継ぐ');
}

// ------------------------------------------------------------------
console.log('【③srDrawShape: 登録パネルのプレビューがlineStyleに応じて破線設定する】');
{
  const dashCalls = [];
  const fakeCtx = {
    save(){}, restore(){}, beginPath(){}, stroke(){}, strokeRect(){}, fillText(){},
    moveTo(){}, lineTo(){}, closePath(){},
    setLineDash(arr) { dashCalls.push(arr); },
    arc(){},
    set strokeStyle(v){}, set fillStyle(v){}, set lineWidth(v){}, set font(v){}, set textAlign(v){},
  };
  const srSandbox = { console };
  vm.createContext(srSandbox);
  srSandbox._srZoom = 2; srSandbox.SR_CX = 0; srSandbox.SR_CY = 0;
  vm.runInContext(grab('srDrawShape'), srSandbox);

  srSandbox.srDrawShape(fakeCtx, { t:'L', x1:0,y1:0,x2:1,y2:1, lineStyle:'dash' }, '#222');
  ok(dashCalls[0].length > 0, 'dash指定: setLineDashに空でない配列');

  srSandbox.srDrawShape(fakeCtx, { t:'L', x1:0,y1:0,x2:1,y2:1 }, '#222');
  eq(dashCalls[1], [], '未指定(実線): setLineDash([])で解除される');

  srSandbox.srDrawShape(fakeCtx, { t:'T', x:0,y:0,text:'a' }, '#222');
  eq(dashCalls.length, 2, 'T(文字)はlineStyleの概念が無いのでsetLineDashを呼ばない');
}

// ------------------------------------------------------------------
console.log('【④js/symbols.js: 配置済みシンボルの本描画がlineStyleを反映する】');
{
  const styleCalls = [];
  let dashResetCount = 0;
  const fakeCtx = {
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, beginPath(){}, stroke(){},
    strokeRect(){}, fillText(){}, moveTo(){}, lineTo(){}, closePath(){}, arc(){},
    setLineDash(arr) { if (arr.length === 0) dashResetCount++; },
    set strokeStyle(v){}, set fillStyle(v){}, set lineWidth(v){}, set font(v){}, set textAlign(v){},
  };
  const symSandbox = {
    ctx: fakeCtx, console,
    state: { zoom: 1, customSymbols: [{ type:'my_sym', shapes:[
      { t:'L', x1:0,y1:0,x2:1,y2:1, lineStyle:'dash' },
      { t:'L', x1:0,y1:0,x2:1,y2:1 },
    ] }] },
    fgC: () => '#000',
    DEFAULT_LINE_WIDTH: 0.5,
    applyLineStyle: (ctx, style, zoom) => { styleCalls.push(style); },
  };
  vm.createContext(symSandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/symbols.js', 'utf8'), symSandbox);
  symSandbox.drawSym('my_sym', 0, 0, false, 0, false, false, '#000', null, null, 1);
  eq(styleCalls, ['dash', undefined], '図形ごとにapplyLineStyleへ各shapeのlineStyleが渡る');
  ok(dashResetCount >= 1, 'ループ後にsetLineDash([])でリセットする(後続描画への漏れ防止)');
}

// ------------------------------------------------------------------
console.log('【⑤js/dxf_export.js: customSyms出力でlineStyleがDXF線種名に変換されて渡る】');
{
  const src = fs.readFileSync(__dirname + '/../js/dxf_export.js', 'utf8');
  const start = src.indexOf('  customSyms.forEach((s,i)=>{', src.indexOf('  customSyms.forEach((s,i)=>{') + 1);
  if (start < 0) throw new Error('該当ブロックが見つかりません');
  const end = src.indexOf('\n  });', start) + 6;
  const block = src.slice(start, end);

  function run(shapes) {
    const calls = { bL: [], bC: [], bA: [], bR: [], bP: [] };
    const LT_MAP = {dash:'DASHED',dashed:'DASHED',dot:'DOT',dotted:'DOT',dashdot:'DASHDOT'};
    const sandbox = {
      console, p: () => {},
      bL: (x1,y1,x2,y2,lt) => calls.bL.push(lt),
      bC: (cx,cy,r,lt) => calls.bC.push(lt),
      bA: (cx,cy,r,sa,ea,lt) => calls.bA.push(lt),
      bR: (x1,y1,x2,y2,lt) => calls.bR.push(lt),
      bP: (pts,cl,lt) => calls.bP.push(lt),
      bT: () => {},
      resolveLT: (styleVal) => styleVal ? (LT_MAP[styleVal]||null) : null,
      custBlkH: [{ b: 1, e: 2 }],
      customSyms: [{ type: 'test', shapes }],
    };
    vm.createContext(sandbox);
    vm.runInContext(block, sandbox);
    return calls;
  }

  let calls = run([{ t:'L', x1:0,y1:0,x2:1,y2:1, lineStyle:'dash' }]);
  eq(calls.bL[0], 'DASHED', 'L: dash→DASHED');

  calls = run([{ t:'C', cx:0,cy:0,r:5, lineStyle:'dot' }]);
  eq(calls.bC[0], 'DOT', 'C: dot→DOT');

  calls = run([{ t:'A', cx:0,cy:0,r:5, sa:0,ea:90,ccw:true, lineStyle:'dashdot' }]);
  eq(calls.bA[0], 'DASHDOT', 'A: dashdot→DASHDOT');

  calls = run([{ t:'R', x:0,y:0,w:5,h:5, lineStyle:'dash' }]);
  ok(calls.bR[0] === 'DASHED' || calls.bL.every(lt => lt === 'DASHED'),
     'R: dash→DASHED(bR直呼び、またはbR内部でbLへ委譲される実装のどちらでも可)');

  calls = run([{ t:'L', x1:0,y1:0,x2:1,y2:1 }]);
  eq(calls.bL[0], null, '未指定(実線)ならlt=null(標準シンボルの既存出力を壊さない)');
}

// ------------------------------------------------------------------
console.log('【⑥srPasteFromClipboard: 実際の貼り付けフロー本体でもlineStyleが残る】');
console.log('  (前回の修正漏れ箇所。srWorldShapesForElを直しても、この後段の');
console.log('   変換処理で改めてlineStyleが運ばれていなければ意味がない)');
{
  const pasteSandbox = { console, snapLineWidth: v => v, alert(){} };
  vm.createContext(pasteSandbox);
  vm.runInContext(
    [grab('srWorldShapesForEl'), grab('srEffectiveLW'), grab('srXformPt'), grab('srXformAngle'),
     grab('flattenSymbolElToShapes'), grab('srGridAlignShapes'), grab('srPasteFromClipboard')].join('\n'),
    pasteSandbox
  );
  pasteSandbox.state = {
    customSymbols: [],
    clipboard: { els: [
      { type:'fline', x1:0,y1:0,x2:10,y2:0, lineStyle:'dash' },
      { type:'circle', x:0,y:0,r:5, lineStyle:'dot' },
      { type:'arc', x:0,y:0,r:5, startA:0, endA:1, ccw:true, lineStyle:'dashdot' },
      { type:'rect', x:0,y:0,w:5,h:5, lineStyle:'dash' },
    ], wires: [] },
  };
  pasteSandbox.LAYERS = [];
  pasteSandbox.SR_GRID = 5;
  pasteSandbox._srShapes = [];
  pasteSandbox.srFitToContent = () => {};
  pasteSandbox.srRender = () => {};
  pasteSandbox.srPasteFromClipboard();
  const pasted = pasteSandbox._srShapes;
  eq(pasted.find(s=>s.t==='L').lineStyle, 'dash', 'fline貼り付け: dashが残る');
  eq(pasted.find(s=>s.t==='C').lineStyle, 'dot', 'circle貼り付け: dotが残る');
  eq(pasted.find(s=>s.t==='A').lineStyle, 'dashdot', 'arc貼り付け: dashdotが残る');
  eq(pasted.find(s=>s.t==='R').lineStyle, 'dash', 'rect貼り付け: dashが残る');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
