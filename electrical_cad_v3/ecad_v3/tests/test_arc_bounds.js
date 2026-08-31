// 円弧(arc)の範囲計算のテスト
//   node tests/test_arc_bounds.js
//
// 【背景】盛田さん報告(2026-08-30): 範囲選択したとき、選択のハンドル(オレンジの□)が
// 何も描かれていない場所まで下に伸びることがあり、範囲選択の仕方で結果が変わった。
// コンソールで実データを取ったところ、ハンドルの箱は y=582 まで伸びているのに、
// 選んだ図形は y=477 までしかなく、伸ばしていたのは1個のarcだった:
//   下端 583 arc el_mtgil9nv_lufhb4 {x:876.65, y:562.75, w:20, h:20}
//
// 【原因】円弧の el.x/el.y は「弧の中心点」で、弧そのものは半径分だけ離れた位置に
// 描かれる。resize.js の getGroupBounds には arc の分岐が無く、arcはシンボル扱いに
// 落ちて「中心点の周り±10」の箱になっていた(上の 20x20 がそれ)。半径が大きい弧では
// 中心が画面に見えている弧から遠く離れるため、箱が見当違いの場所まで伸びる。
// draw.js の drawGroupBoxes 側は el.r から円1周分(中心±r)を足しており、こちらは
// 弧をはみ出さないものの実際より大きい。**2つの箱の計算が食い違っていた**。
//
// 【修正】draw.js に arcBounds() を新設(弧の両端点＋弧が実際に通る上下左右の頂点だけを
// 見る正確な範囲)し、getGroupBounds と drawGroupBoxes の両方がこれを使うようにした。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const near = (a, b, m) => ok(Math.abs(a-b) < 1e-6, `${m} (期待 ${b}, 実際 ${a})`);

function cut(src, head) {
  const s = src.indexOf(head);
  if (s < 0) throw new Error('関数が見つからない: ' + head);
  return src.slice(s, src.indexOf('\n}', s) + 2);
}
const drawSrc   = fs.readFileSync(__dirname + '/../js/draw.js', 'utf8');
const resizeSrc = fs.readFileSync(__dirname + '/../js/resize.js', 'utf8');

const sb = { console };
vm.createContext(sb);
vm.runInContext([
  cut(drawSrc, 'function arcBounds('),
  cut(resizeSrc, 'function getGroupBounds('),
  'function getDef(t){ return null; }',   // arcはシンボルではない
].join('\n'), sb);
const { arcBounds, getGroupBounds } = sb;

const P = Math.PI;
console.log('【弧そのものの範囲(中心ではない)】');
{
  // 中心(100,100) 半径50、0°→90°(canvasはy下向きなので右→下)の1/4円
  const b = arcBounds({ x:100, y:100, r:50, startA:0, endA:P/2 });
  near(b.minX, 100, '左端は中心X(弧は右下にしか無い)');
  near(b.maxX, 150, '右端は中心X+r');
  near(b.minY, 100, '上端は中心Y');
  near(b.maxY, 150, '下端は中心Y+r');
  ok(b.maxY - b.minY === 50, '1/4円の高さは半径ぶんだけ(円1周分にしない)');
}
{
  // 全周
  const b = arcBounds({ x:0, y:0, r:10, startA:0, endA:P*2 });
  near(b.minX, -10, '全周なら左端は-r');
  near(b.maxY,  10, '全周なら下端は+r');
}
{
  // canvasのctx.arcは ccw=false で角度が増える向き(画面上は時計回り、yは下向き)。
  // π→0 を ccw=false で進むと π→2π となり、270°(画面の上)を通る。
  const b = arcBounds({ x:0, y:0, r:10, startA:P, endA:0, ccw:false });
  near(b.minY, -10, 'ccw=falseでπ→2π(上の270°)を通るなら上端は-r');
  near(b.maxY,   0, '下には出ない');
}
{
  // 同じ両端でも回る向きが逆なら通る場所が違う(π→0を減る向き=90°の下を通る)
  const cw  = arcBounds({ x:0, y:0, r:10, startA:P, endA:0, ccw:true });
  near(cw.maxY, 10, '向きが逆(下の90°を通る)なら下端は+r');
  near(cw.minY,  0, '上には出ない');
}

console.log('\n【報告された症状: 弧の中心が遠いと箱が見当違いの場所まで伸びる】');
{
  // 実データに合わせた再現。矩形は y=180..477。
  // 弧は中心(886.65, 572.75)・半径120で、上側(270°)だけを通る短い弧。
  // 弧そのものは y=452.75 付近にあり、矩形の中に収まっている。
  const rect = { type:'rect', x:610, y:180, w:420, h:297 };
  const arc  = { type:'arc', x:886.65, y:572.75, r:120,
                 startA:-P*0.6, endA:-P*0.4, ccw:false };
  const ab = arcBounds(arc);
  ok(ab.maxY < 477, `弧そのものは矩形の中に収まっている(下端 ${Math.round(ab.maxY)})`);
  const b = getGroupBounds([rect, arc], []);
  ok(b.y + b.h <= 477 + 1e-6,
     `ハンドルの箱も矩形どおりで止まる(下端 ${Math.round(b.y+b.h)}、修正前は中心+10の 583)`);
}
{
  // 弧の中心が選択の外(下)にあっても、弧が上にあるなら箱は下に伸びない
  const arc = { type:'arc', x:0, y:1000, r:1000, startA:-P*0.55, endA:-P*0.45 };
  const b = getGroupBounds([arc], []);
  // 弧は y=0〜12付近(中心から半径1000だけ離れた上側)にしかない
  ok(b.y + b.h < 20, `中心(y=1000)に引っ張られない(下端 ${Math.round(b.y+b.h)})`);
  ok(b.h < 20, `箱の高さも弧の分だけ(高さ ${Math.round(b.h)})`);
}

console.log('\n【ハンドルの箱とグループ枠が同じ計算を使う】');
{
  const arcSrc = cut(drawSrc, 'function drawGroupBoxes(');
  ok(arcSrc.includes('arcBounds(el)'), 'drawGroupBoxes も arcBounds を使う');
  ok(cut(resizeSrc, 'function getGroupBounds(').includes('arcBounds(el)'),
     'getGroupBounds も arcBounds を使う');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
