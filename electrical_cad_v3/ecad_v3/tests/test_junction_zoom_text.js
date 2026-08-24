// 端子(junction)の文字サイズがズームに追随しない(=シンボル側と同じ「見た目の
// サイズがズームで変わらない」設計)ことのテスト
//   node tests/test_junction_zoom_text.js
//
// 【背景】盛田さん「文字関係、図面の拡縮でおかしくなってる」→「②(画面ズーム)」。
//
// 原因: js/draw.js の drawJunctionEl だけ、文字サイズ・位置オフセットを
// /state.zoom していた。これは「画面上で常に一定サイズに見える」効果になるが、
// シンボル側(devFs/labelFs等)・寸法線・グループ表示は逆に「ズームで割らない」
// 設計で統一されている(コード中に明記: 「割ると拡大縮小で文字の見かけが変わり、
// シンボル側と挙動が食い違う」)。つまり端子だけが逆方向の挙動になっており、
// ズームすると端子の文字だけ他の文字と見た目の変化の仕方が食い違って見えていた。
//
// このテストは、実際に drawJunctionEl を異なる state.zoom で呼び出し、
// ctx.font に指定されるフォントサイズ(px数)が zoom によらず一定であることを
// 直接検証する(シンボル側と同じ挙動になっているかの本質的な確認)。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

const src = fs.readFileSync(__dirname + '/../js/draw.js', 'utf8');
const start = src.indexOf('function drawJunctionEl(');
const end = src.indexOf('\n}', start) + 2;
const fnSrc = src.slice(start, end);
const applyLineStyleSrc = 'function applyLineStyle(ctx, style, zoom) {}'; // 本テスト対象外

function makeSandbox(zoom, darkMode) {
  const fontsUsed = [];
  const fakeCtx = {
    save(){}, restore(){}, beginPath(){}, fill(){}, stroke(){}, fillText(){}, arc(){},
    set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set textAlign(v){},
    set font(v){ fontsUsed.push(v); },
  };
  const sandbox = {
    console, ctx: fakeCtx,
    state: { zoom, darkMode, showPartRef: true, pdfSkipText: false },
  };
  vm.createContext(sandbox);
  vm.runInContext([applyLineStyleSrc, fnSrc].join('\n'), sandbox);
  sandbox._fontsUsed = fontsUsed;
  return sandbox;
}

const extractPx = fontStr => parseFloat(fontStr.match(/([\d.]+)px/)[1]);

// ------------------------------------------------------------------
console.log('【端子番号の文字サイズがズームによらず一定である】');
{
  const el = { type:'junction', style:'circle', x:0, y:0, r:5, label:'A1', labelFs:14 };
  const s1 = makeSandbox(1);   s1.drawJunctionEl(el, false, '#000');
  const s2 = makeSandbox(2.5); s2.drawJunctionEl(el, false, '#000');
  const s3 = makeSandbox(0.4); s3.drawJunctionEl(el, false, '#000');

  const px1 = s1._fontsUsed.map(extractPx).find(n => n === 14);
  const px2 = s2._fontsUsed.map(extractPx).find(n => n === 14);
  const px3 = s3._fontsUsed.map(extractPx).find(n => n === 14);
  eq(px1, 14, 'zoom=1: 指定どおり14px');
  eq(px2, 14, 'zoom=2.5でも14pxのまま(以前は14/2.5=5.6pxになっていた)');
  eq(px3, 14, 'zoom=0.4でも14pxのまま(以前は14/0.4=35pxになっていた)');
}

console.log('【デバイス名の文字サイズもズームによらず一定である】');
{
  const el = { type:'junction', style:'circle', x:0, y:0, r:5, partRef:'TB1', devFs:12, showDev:true };
  const s1 = makeSandbox(1);   s1.drawJunctionEl(el, false, '#000');
  const s2 = makeSandbox(3);   s2.drawJunctionEl(el, false, '#000');

  const px1 = s1._fontsUsed.map(extractPx).find(n => n === 12);
  const px2 = s2._fontsUsed.map(extractPx).find(n => n === 12);
  eq(px1, 12, 'zoom=1: 指定どおり12px');
  eq(px2, 12, 'zoom=3でも12pxのまま(以前は12/3=4pxになっていた)');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
