// 端子(junction)の文字(端子番号・デバイス名)をクリックしても選択できるかのテスト
//   node tests/test_junction_text_hit.js
//
// 【背景】盛田さん「貼付けもシンボルと同じ挙動じゃないと使えん、あと文字に
// ヒット判定がない、なぜ同じになっていないのか」。
//
// シンボル側は2026-08-03の修正(js/hit_test.js の hitTest 内)で、デバイス名・
// 型式・仕様の文字表示もクリック判定の対象にしていた(devOffX/Y等で本体から
// 離れた位置に出ている文字を、本体の狭い図形をピンポイントで狙わなくても
// クリックで選べるようにする改善)。しかし端子(junction)専用の hitTestJunction は
// この修正から取り残されており、丸(本体)しかクリック判定していなかった。
//
// 端子は本体が小さい丸1つで、端子番号・デバイス名の文字は labelOffX/devOffX等で
// そこから離れた位置に出ることが多い。この判定が無いと、複数の端子を選ぶ操作
// (コピー貼り付けの貼り付け先選択を含む)が事実上できなかった。
//
// このテストは draw.js の drawJunctionEl と全く同じ位置式・同じ揃えで
// ヒット領域が計算されているかを検証する(位置がズレると「見えているのに
// クリックできない」逆効果になるため、描画側の式と一致することが重要)。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const src = fs.readFileSync(__dirname + '/../js/hit_test.js', 'utf8');
const start = src.indexOf('function hitTestJunction(');
const end = src.indexOf('\n}', start) + 2;
const fnSrc = src.slice(start, end);

function makeSandbox(elements, opts) {
  const sandbox = {
    console,
    state: {
      zoom: 1, elements, showPartRef: true,
      ...opts,
    },
    LAYERS: [],
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc, sandbox);
  return sandbox;
}

const TERM = (over) => Object.assign({
  id: 't1', type:'junction', style:'circle', x:100, y:100, r:5,
  label:'1', labelFs:11,
  partRef:'TB1', devFs:10, showDev:true,
}, over);

// ------------------------------------------------------------------
console.log('【端子番号の文字をクリックすると選択できる】');
{
  // draw.jsの式: lx = x + r + 4 + labelOffX, ly = y + 4 + labelOffY (labelOffX/Y省略時0)
  // r=5, x=100,y=100 → lx=109, ly=104。'1'は幅 max(10,1*11*0.55)=10 なので lx~lx+10
  const el = TERM();
  const s = makeSandbox([el]);
  ok(s.hitTestJunction(112, 102) === el, '端子番号「1」の文字の上でヒットする');
  ok(s.hitTestJunction(50, 50)  === null, '離れた場所ではヒットしない');
}

console.log('【端子番号がlabelOffX/Yで離れていても、その位置でヒットする】');
{
  const el = TERM({ labelOffX: 30, labelOffY: 20, label: 'A1' });
  const s = makeSandbox([el]);
  // lx = 100+5+4+30=139, ly=100+4+20=124
  ok(s.hitTestJunction(140, 122) === el, 'オフセット先の文字をクリックしてヒットする');
  // 丸のヒット範囲(半径5+R8=13)からは十分外れた、かつ実際の文字位置(139,124)
  // からも外れた点で確認する(近すぎる点だと丸のヒット判定に拾われてしまい、
  // 文字ヒットの検証にならない)
  ok(s.hitTestJunction(100, 200) === null, '丸からも文字からも十分離れた場所ではヒットしない');
}

console.log('【デバイス名の文字をクリックすると選択できる】');
{
  // draw.jsの式: dx = x+devOffX, dy = y-r-6+devOffY (中央揃え)
  const el = TERM({ partRef: 'TB1' });
  const s = makeSandbox([el]);
  // dx=100, dy=100-5-6=89。'TB1'は幅 max(10,3*10*0.55)=16.5 なので中心100±8.25
  ok(s.hitTestJunction(100, 87) === el, 'デバイス名「TB1」の文字の上でヒットする');
}

console.log('【分岐点(●)には文字が無いのでテキストヒットの対象にならない】');
{
  const el = TERM({ style: 'dot', label: '', partRef: '' });
  const s = makeSandbox([el]);
  // 丸自体は当然ヒットする
  ok(s.hitTestJunction(100, 100) === el, '丸本体はヒットする');
  // 丸のヒット範囲(半径5+R8=13)から十分離れた点で確認する
  ok(s.hitTestJunction(100, 200) === null, '文字が無い位置ではヒットしない(誤爆しない)');
}

console.log('【デバイス表示OFF(showDev:false)なら、その文字ではヒットしない】');
{
  const el = TERM({ showDev: false });
  const s = makeSandbox([el]);
  ok(s.hitTestJunction(100, 87) === null, 'デバイス名が非表示なら、その位置はヒットしない');
  ok(s.hitTestJunction(112, 102) === el, '端子番号は表示されているのでヒットする');
}

console.log('【レイヤーが非表示なら文字ヒットも無効(丸のヒットは既存どおり変えていない)】');
{
  const el = TERM({ layer: 'hidden' });
  const s = makeSandbox([el], {});
  s.LAYERS.push({ name: 'hidden', visible: false, locked: false });
  // 【既存動作・今回変更していない点】丸自体のヒット判定はvisibleを見ておらず
  // (元コードはlockedしかチェックしていない)、これは今回のスコープ外として
  // そのままにしてある。丸のヒット範囲(半径5+R8=13)から十分離れた点で、
  // 「非表示レイヤーの文字はヒットしない」ことだけを確認する。
  ok(s.hitTestJunction(100, 200) === null, '非表示レイヤーの文字(丸から十分離れた位置)はヒットしない');
}

console.log('【ロックされたレイヤーは丸も文字もヒットしない(既存動作)】');
{
  const el = TERM({ layer: 'locked' });
  const s = makeSandbox([el], {});
  s.LAYERS.push({ name: 'locked', visible: true, locked: true });
  ok(s.hitTestJunction(100, 100) === null, 'ロック中は丸もヒットしない');
  ok(s.hitTestJunction(112, 102) === null, 'ロック中は文字もヒットしない');
}

console.log('【draw.jsの描画式と一致していること(回帰防止)】');
{
  const drawSrc = fs.readFileSync(__dirname + '/../js/draw.js', 'utf8');
  const drawFn = drawSrc.slice(drawSrc.indexOf('function drawJunctionEl('), drawSrc.indexOf('function drawJunctionEl(') + 3000);
  ok(drawFn.includes('el.x + r + 4 + (el.labelOffX||0)'),
     '端子番号の位置式が現在もdraw.js側と同じ(前提が崩れていない)');
  ok(drawFn.includes('el.y - r - 6 + (el.devOffY||0)'),
     'デバイス名の位置式が現在もdraw.js側と同じ(前提が崩れていない)');
  // 【2026-08-23】文字サイズがズームで割られていないことも回帰防止として確認する。
  // 盛田さん「文字関係、図面の拡縮でおかしくなってる」で発覚した不具合そのもの。
  ok(!drawFn.includes('(el.labelFs || 11)/state.zoom') && !drawFn.includes('(el.devFs || 10)/state.zoom'),
     '端子の文字サイズがズームで割られていない(シンボル側と同じ、ズームしても見た目のサイズ比が変わらない)');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
