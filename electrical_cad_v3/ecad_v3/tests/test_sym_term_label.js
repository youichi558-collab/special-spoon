// シンボルの端子番号（図面表示）のテスト
//   node tests/test_sym_term_label.js
//
// 【背景】2026-09-19、盛田さんから「シンボルに端子番号を入れられるようにする、
// 実務で使う」。調べると、端子番号を入れる欄(プロパティの「端子番号」= el.terminals)は
// 以前からあり、部品DBから型番を割り当てれば自動で入るのに、その値を読んでいたのは
// 接続表・端子台表(conn_table.js)と検索(search.js)だけで、図面・PDF・DXFには
// 一切出ていなかった。端子台の端子(junction)にだけ同等の表示があった。
//
// このテストが守るのは次の2点。
//
// (1) 【最重要】端子番号が出る位置 = 実際に配線がスナップする位置であること。
//     端子点の座標式は snap.js(スナップ) と conn_table.js(接続判定) にも同じものが
//     あり、今回 draw.js 側を symTermPoints に一本化した。ここがズレると
//     「番号の横に線が来ない」図面ができ、しかも帳票とも食い違う。
//     el.scale を cS.terminals に掛けないのも既存3箇所に合わせた仕様で、
//     ここだけ掛けると表示とスナップがズレる。
//
// (2) 番号の決まり方が conn_table.js と同じ優先順位であること。ただし図面では
//     通し番号(T1,T2…)のフォールバックを出さない。帳票は行を特定するために
//     必ず何か要るが、図面に "T1" と印刷されても意味が無いため。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok   = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const near = (a, b, m, tol = 1e-9) => ok(Math.abs(a - b) <= tol, `${m} (期待 ${b}, 実際 ${a})`);

const drawSrc = fs.readFileSync(__dirname + '/../js/draw.js', 'utf8');
const grab = (name) => {
  const start = drawSrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = drawSrc.indexOf('\n}', start);
  return drawSrc.slice(start, end + 2);
};
// 定数も実ファイルから取る(値を変えたらテストもその値で走るように)
const grabConst = (name) => {
  const m = drawSrc.match(new RegExp(`^const ${name}\\s*=\\s*([-\\d.]+)\\s*;`, 'm'));
  if (!m) throw new Error(`定数 ${name} が見つかりません`);
  return `var ${name} = ${m[1]};`;
};

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([
  grabConst('SYM_TERM_GAP'), grabConst('SYM_TERM_SEP'),
  grab('symTermPoints'), grab('symTermLabelPos'), grab('symTermOff'),
].join('\n'), sandbox);
const { symTermPoints, symTermLabelPos, symTermOff, SYM_TERM_GAP, SYM_TERM_SEP } = sandbox;

// snap.js / conn_table.js が使っているのと同じ式を、テスト側で独立に書く。
// draw.js の実装がこれと一致しなくなったら落とす。
function expectedPin(el, t) {
  const rot = (el.rot || 0) * Math.PI / 180;
  return { x: el.x + (t.x * Math.cos(rot) - t.y * Math.sin(rot)),
           y: el.y + (t.x * Math.sin(rot) + t.y * Math.cos(rot)) };
}

console.log('[1] 端子点の座標がスナップ位置と一致する');
{
  const cS = { type:'mc', terminals: [ {x:-20,y:0}, {x:20,y:0}, {x:0,y:-15}, {x:0,y:15} ] };
  [0, 90, 180, 270, 45].forEach(rot => {
    const el = { type:'mc', x:300, y:200, rot, terminals:'A1,A2,13,14' };
    const pts = symTermPoints(el, cS, { w:40, h:30 });
    ok(pts.length === 4, `rot=${rot}: 端子点は4つ`);
    cS.terminals.forEach((t, i) => {
      const e = expectedPin(el, t);
      near(pts[i].x, e.x, `rot=${rot}: 端子${i}のX`, 1e-9);
      near(pts[i].y, e.y, `rot=${rot}: 端子${i}のY`, 1e-9);
    });
  });
}

console.log('[2] cS.terminals には el.scale を掛けない(既存のスナップ仕様に合わせる)');
{
  const cS = { type:'mc', terminals: [ {x:-20,y:0}, {x:20,y:0} ] };
  const a = symTermPoints({ type:'mc', x:0, y:0, scale:1, terminals:'1,2' }, cS, { w:40,h:30 });
  const b = symTermPoints({ type:'mc', x:0, y:0, scale:3, terminals:'1,2' }, cS, { w:40,h:30 });
  near(b[0].x, a[0].x, 'scale=3でも端子Xは変わらない');
  near(b[1].x, a[1].x, 'scale=3でも端子Xは変わらない(2点目)');
}

console.log('[3] 端子未定義のシンボルは左右端にフォールバックし、そちらは scale が効く');
console.log('  ← 並びは「左が1番目」。右が1番目だと A1,A2 と入れた図面で A2 が左に出る');
{
  const a = symTermPoints({ type:'std', x:100, y:50, scale:1, terminals:'1,2' }, null, { w:40, h:30 });
  ok(a.length === 2, 'フォールバックは2点');
  near(a[0].x,  80, '1番目は左端(-w/2)');
  near(a[1].x, 120, '2番目は右端(+w/2)');
  ok(a[0].label === '1' && a[1].label === '2', '「1,2」なら左が1・右が2');
  const b = symTermPoints({ type:'std', x:100, y:50, scale:2, terminals:'1,2' }, null, { w:40, h:30 });
  near(b[0].x,  60, 'scale=2で左端が伸びる');
  near(b[1].x, 140, 'scale=2で右端が伸びる');
}

console.log('[4] 端子番号の優先順位（①el.terminals ②定義側label ③出さない）');
{
  const cS = { type:'mc', terminals: [ {x:-20,y:0,label:'X1'}, {x:20,y:0,label:'X2'}, {x:0,y:15,label:'X3'} ] };
  const p1 = symTermPoints({ type:'mc', x:0, y:0, terminals:'A1,A2' }, cS, {});
  ok(p1[0].label === 'A1', '①el.terminals が定義側labelより優先される');
  ok(p1[1].label === 'A2', '①2点目も同じ');
  ok(p1[2].label === 'X3', '②el.terminals が足りない分は定義側labelで埋まる');

  const p2 = symTermPoints({ type:'mc', x:0, y:0, terminals:'' }, cS, {});
  ok(p2[0].label === 'X1', '②el.terminalsが空なら定義側label');

  const cS2 = { type:'mc', terminals: [ {x:-20,y:0}, {x:20,y:0} ] };
  const p3 = symTermPoints({ type:'mc', x:0, y:0, terminals:'' }, cS2, {});
  ok(p3[0].label === '' && p3[1].label === '',
     '③どちらも無ければ空。図面に通し番号(T1)は出さない');

  const cS3 = { type:'mc', terminals: [ {x:-20,y:0}, {x:0,y:0}, {x:20,y:0} ] };
  const p4 = symTermPoints({ type:'mc', x:0, y:0, terminals:' A1 , , 14 ' }, cS3, {});
  ok(p4[0].label === 'A1', '前後の空白は落とす');
  ok(p4[1].label === '',   '空の項目はその端子だけ番号なしにする(詰めない)');
  ok(p4[2].label === '14', '空の項目を飛ばさず位置どおりに対応する');

  // 端子点より多い番号を書いても、無い端子の分は捨てるだけで落ちない
  const p5 = symTermPoints({ type:'mc', x:0, y:0, terminals:'1,2,3,4,5' }, cS2, {});
  ok(p5.length === 2, '端子点の数より多い番号を書いても端子点の数は変わらない');
  ok(p5[1].label === '2', '余った番号は無視される');
}

console.log('[5] 文字は配線に重ならない側へ逃げる');
{
  // 右向きの端子 → 右へ出し、線の上に載せる
  const r = symTermLabelPos(20, 0);
  ok(r.align === 'left',     '右の端子は左揃え(右へ伸ばす)');
  ok(r.baseline === 'bottom','右の端子は配線の上に載る');
  ok(r.dx > 0,               '右へ逃がす');
  ok(r.dy < 0,               '配線に重ねない分だけ上げる');

  // 左向きの端子 → 左へ出す
  const l = symTermLabelPos(-20, 0);
  ok(l.align === 'right',    '左の端子は右揃え(左へ伸ばす)');
  ok(l.dx < 0,               '左へ逃がす');

  // 下向きの端子 → 下へ出し、配線の右に置く
  const d = symTermLabelPos(0, 15);
  ok(d.align === 'left',     '下の端子は配線の右に置く');
  ok(d.baseline === 'top',   '下の端子は下側に出す');
  ok(d.dy > 0,               '下へ逃がす');
  ok(d.dx > 0,               '配線に重ねない分だけ右へ寄せる');

  // 上向きの端子
  const u = symTermLabelPos(0, -15);
  ok(u.baseline === 'bottom','上の端子は上側に出す');
  ok(u.dy < 0,               '上へ逃がす');

  // 端子がシンボル中心と同じ位置(向きが決まらない)でもNaNにしない
  const c = symTermLabelPos(0, 0);
  ok(Number.isFinite(c.dx) && Number.isFinite(c.dy), '中心の端子でもNaNにならない');
  ok(c.align === 'left', '中心の端子は右へ出す');

  // 逃がす量は隙間の設定どおり
  near(Math.hypot(r.dx, r.dy + SYM_TERM_SEP), SYM_TERM_GAP, '逃がす距離はSYM_TERM_GAP', 1e-9);
}

console.log('[6] 端子ごとの位置補正');
{
  const el = { termOff: [ [5,-3], null, [0,0] ] };
  const a = symTermOff(el, 0);
  ok(a.ox === 5 && a.oy === -3, '指定した端子の補正が読める');
  const b = symTermOff(el, 1);
  ok(b.ox === 0 && b.oy === 0, '欠番は0');
  const c = symTermOff(el, 9);
  ok(c.ox === 0 && c.oy === 0, '範囲外は0');
  const d = symTermOff({}, 0);
  ok(d.ox === 0 && d.oy === 0, 'termOffを持たない既存図面は0(互換性)');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
