// グループ化直後の枠が選択範囲より数倍大きく出る件の再現テスト
//   node tests/test_group_box_expand.js
//
// 【背景】盛田さん報告(2026-08-23): 個別にクリックして不要な図形を削除 → 残りを
// 範囲選択 → Gキーでグループ化、という手順で、グループ化直後の枠が選択した範囲より
// 数倍大きく出た。グループ解除して中身を見ても余計な要素は見当たらず、グループ化と
// 解除を数回繰り返したら正常な大きさに収まった。
// HANDOFF.mdには「コードレビューのみでは原因を特定できず、再現待ち」と記録されていた。
//
// 【このテストで確かめること】
// 範囲選択(tools.jsのonUp)もクリック選択と同じく expandSelToGroups() を呼ぶ。
// つまり、ドラッグした矩形が既存グループの構成要素に1つでも掛かると、選択は
// そのグループ全体(矩形の外にある残り全部)へ黙って広がる。その状態でGキーを押すと
// groupSelected() は広がった選択をそのまま新グループにするので、グループ枠は
// ドラッグした矩形より遥かに大きくなる。「解除して中身を見ても余計な要素は
// 見当たらない」のは、増えたのが遠くにある普通の線(部品外形図など)だからで、
// 「繰り返したら直った」のは ungroupSelected() が元の既存グループごと消すため、
// 2回目以降は広がる相手が居なくなるから。
//
// 実際に edit.js の expandSelToGroups / groupSelected と draw.js の drawGroupBoxes を
// 動かして、描かれる枠(strokeRect)の座標で検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

function cut(src, head) {
  const s = src.indexOf(head);
  if (s < 0) throw new Error('関数が見つからない: ' + head);
  return src.slice(s, src.indexOf('\n}', s) + 2);
}
const editSrc = fs.readFileSync(__dirname + '/../js/edit.js', 'utf8');
const drawSrc = fs.readFileSync(__dirname + '/../js/draw.js', 'utf8');
const fnSrc = [
  cut(editSrc, 'function expandSelToGroups('),
  cut(editSrc, 'function groupSelected('),
  cut(drawSrc, 'function drawGroupBoxes('),
].join('\n');

// 図面: 手前に小さな図形3つ(0..100)、離れた場所に部品外形図のグループ(500..700)
function makePage() {
  const els = [
    { id:'a1', type:'fline', x1:10,  y1:10,  x2:60,  y2:10  },
    { id:'a2', type:'fline', x1:10,  y1:40,  x2:60,  y2:40  },
    { id:'a3', type:'fline', x1:10,  y1:70,  x2:60,  y2:70  },
    // 既存グループ(部品外形図)。g1a だけが手前の図形に近く、残りは遠くにある
    { id:'g1a', type:'fline', x1:90,  y1:10,  x2:95,  y2:10  },
    { id:'g1b', type:'fline', x1:600, y1:400, x2:700, y2:400 },
    { id:'g1c', type:'fline', x1:600, y1:500, x2:700, y2:500 },
  ];
  return {
    elements: els, wires: [],
    groups: [{ id:'g1', elIds:['g1a','g1b','g1c'], wireIds:[] }],
  };
}

function makeSandbox(page) {
  const rects = [];
  const fakeCtx = {
    save(){}, restore(){}, beginPath(){}, fill(){}, stroke(){}, fillText(){}, arc(){},
    setLineDash(){}, strokeRect(x,y,w,h){ rects.push({x,y,w,h}); },
    set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){},
    set textAlign(v){}, set textBaseline(v){}, set font(v){},
  };
  const state = {
    page, elements: page.elements, wires: page.wires,
    sel: { els:new Set(), wires:new Set() },
    zoom: 1, darkMode: false, pdfSkipText: true,
  };
  const sandbox = {
    console, ctx: fakeCtx, state,
    genId: p => p + '_test', pushH(){}, draw(){},
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc, sandbox);
  sandbox._rects = rects;
  return sandbox;
}

// 範囲選択(tools.js onUp相当)。矩形に入る要素を選び、そのあと選択をグループへ拡張する
function boxSelect(sb, sx, sy, ex, ey, expand) {
  sb.state.sel.els.clear(); sb.state.sel.wires.clear();
  sb.state.elements.forEach(el => {
    const xs = [el.x1, el.x2], ys = [el.y1, el.y2];
    if (Math.min(...xs) >= sx && Math.max(...xs) <= ex &&
        Math.min(...ys) >= sy && Math.max(...ys) <= ey) sb.state.sel.els.add(el.id);
  });
  if (expand) sb.expandSelToGroups();
}

console.log('【前提: 範囲選択が既存グループに掛かると選択が黙って広がる】');
{
  const sb = makeSandbox(makePage());
  boxSelect(sb, 0, 0, 100, 100, false);
  ok([...sb.state.sel.els].sort().join(',') === 'a1,a2,a3,g1a',
     '拡張前の選択はドラッグした矩形の中だけ(a1,a2,a3,g1a)');
  sb.expandSelToGroups();
  ok(sb.state.sel.els.has('g1b') && sb.state.sel.els.has('g1c'),
     '拡張後は矩形の外にある g1b・g1c まで選択に入る(これが原因)');
}

console.log('\n【再現: グループ化直後の枠が矩形より数倍大きい】');
{
  const sb = makeSandbox(makePage());
  boxSelect(sb, 0, 0, 100, 100, true);
  sb.groupSelected();
  sb._rects.length = 0;
  sb.drawGroupBoxes();
  ok(sb._rects.length === 1, '枠は1つだけ描かれる(既存グループは吸収されて消える)');
  const r = sb._rects[0];
  // pad=6/zoom を差し引いた実寸で比較する
  const w = r.w - 12, h = r.h - 12;
  ok(w > 500 && h > 400, `枠がドラッグ矩形(100x100)より遥かに大きい(実際 ${Math.round(w)}x${Math.round(h)})`);
  ok(w / 100 > 3 && h / 100 > 3, '「数倍大きい」という報告と一致する');
}

console.log('\n【解除後は再発しない(「繰り返したら直った」の説明)】');
{
  const sb = makeSandbox(makePage());
  boxSelect(sb, 0, 0, 100, 100, true);
  sb.groupSelected();
  // グループ解除(ungroupSelected相当): 選択に掛かるグループを消す
  sb.state.page.groups = sb.state.page.groups.filter(g =>
    !g.elIds.some(id => sb.state.sel.els.has(id)));
  ok(sb.state.page.groups.length === 0, '解除で元の既存グループごと消える');
  boxSelect(sb, 0, 0, 100, 100, true);   // 選択し直し
  sb.groupSelected();
  sb._rects.length = 0;
  sb.drawGroupBoxes();
  const r = sb._rects[0];
  ok(r.w - 12 <= 100 && r.h - 12 <= 100,
     `2回目の枠はドラッグ矩形どおりの大きさ(実際 ${Math.round(r.w-12)}x${Math.round(r.h-12)})`);
}

console.log('\n【枠の計算自体は正しい(bboxのバグではない)】');
{
  const sb = makeSandbox(makePage());
  sb.state.page.groups = [{ id:'g2', elIds:['a1','a3'], wireIds:[] }];
  sb.drawGroupBoxes();
  const r = sb._rects[0];
  ok(Math.abs(r.x - (10-6)) < 1e-9 && Math.abs(r.y - (10-6)) < 1e-9 &&
     Math.abs(r.w - (50+12)) < 1e-9 && Math.abs(r.h - (60+12)) < 1e-9,
     'メンバーの座標どおりの枠(pad 6)が描かれる');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
