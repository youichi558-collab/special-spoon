// シンボル登録の「貼り付け」で図形の形が変わらないことのテスト
//   node tests/test_paste_geometry.js
//
// 【背景】2026-08-23、盛田さんが実機で「貼付け時に図形がズレる、✕の部分がズレてる」
// と報告。原因はsrPasteFromClipboardのtx/tyが各点を個別にMath.roundしていたこと。
// cx/cy(選択範囲の中心)は一般に整数にならないため、端点1つあたり最大±0.5単位の
// 誤差が独立に乗り、短い斜め線(×印)は角度も長さも目に見えて変わっていた。
//
// これは同ファイル内のコメント(弧の変換部分)にある「各点を整数へ丸めていて
// 歪んでいた」不具合と全く同じもので、弧だけ対処済みで直線・矩形・ポリラインが
// 直し残されていた。
//
// 対策: 丸めるのは平行移動量(ox/oy)だけにする。全点が同じ整数量だけ動くので
// 相対形状は完全に保存される。
//
// このテストは「貼り付け前後で各線分の長さと角度が完全一致すること」を検証する。
// 平行移動そのものは正しい動作なので、形状の不変性だけを見る。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const near = (a, b, m, tol = 1e-9) => ok(Math.abs(a - b) <= tol, `${m} (期待 ${b}, 実際 ${a})`);

const uiSrc = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = uiSrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = uiSrc.indexOf('\n}', start);
  return uiSrc.slice(start, end + 2);
};

function paste(els) {
  const sandbox = { console, snapLineWidth: v => v, alert(){} };
  vm.createContext(sandbox);
  vm.runInContext(
    [grab('srWorldShapesForEl'), grab('srEffectiveLW'), grab('srXformPt'), grab('srXformAngle'),
     grab('flattenSymbolElToShapes'), grab('srGridAlignShapes'), grab('srPasteFromClipboard')].join('\n'),
    sandbox
  );
  sandbox.state = { customSymbols: [], clipboard: { els, wires: [] } };
  sandbox.LAYERS = [];
  sandbox.SR_GRID = 5;
  sandbox._srShapes = [];
  sandbox.srFitToContent = () => {};
  sandbox.srRender = () => {};
  sandbox.srPasteFromClipboard();
  return sandbox._srShapes;
}

const len = s => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
const ang = s => Math.atan2(s.y2 - s.y1, s.x2 - s.x1);

// ------------------------------------------------------------------
// 【テストの検出力について・重要】
// 当初このテストを整数座標(x1:5,y1:5,x2:20,y2:20 等)で書いたところ、旧実装でも
// 全て通ってしまい、バグを検出できなかった。旧実装のMath.round(wx - cx)は、元の
// 座標が整数なら全点を同じ量だけずらすだけなので形が崩れないためである。
// 歪みが発動するのは「元の座標が非整数のとき」(DXFインポート由来の図形など、
// グリッド外座標をそのまま保持しているケース)。
// したがって以下のケースは意図的に非整数座標で書いてある。整数に書き換えると
// 検出力を失うので注意すること。
console.log('【×印(短い斜め線2本の交差)の形が変わらない・非整数座標】');
{
  const els = [
    { type:'fline', x1:5.3,  y1:5.1,  x2:20.7, y2:20.9 },  // ＼
    { type:'fline', x1:20.7, y1:5.1,  x2:5.3,  y2:20.9 },  // ／
  ];
  const out = paste(els);
  ok(out.length === 2, '2本とも貼り付けられる');

  const L = Math.hypot(20.7 - 5.3, 20.9 - 5.1);
  near(len(out[0]), L, '＼の長さが元と一致');
  near(len(out[1]), L, '／の長さが元と一致');
  near(ang(out[0]), Math.atan2(20.9 - 5.1, 20.7 - 5.3), '＼の角度が元と一致');
  near(ang(out[1]), Math.atan2(20.9 - 5.1, 5.3 - 20.7), '／の角度が元と一致');

  // 2本が同じ点で交差し続けているか(相対位置の保存)
  const mid = s => [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
  const [ax, ay] = mid(out[0]), [bx, by] = mid(out[1]);
  near(ax, bx, '2本の中点X が一致(交差点が保たれている)');
  near(ay, by, '2本の中点Y が一致(交差点が保たれている)');
}

console.log('【縦線と×印の相対位置が保たれる(実機報告の構図)・非整数座標】');
{
  // 実機の症状に近い構図: 縦線1本 + それに重なる×印。
  const els = [
    { type:'fline', x1:12.4, y1:0.2, x2:12.4, y2:33.6 },  // 縦線
    { type:'fline', x1:5.1,  y1:8.3, x2:19.8, y2:22.7 },  // ＼
    { type:'fline', x1:19.8, y1:8.3, x2:5.1,  y2:22.7 },  // ／
  ];
  const out = paste(els);
  const v = out[0];
  near(len(v), 33.4, '縦線の長さが元と一致(旧実装では34.0に伸びていた)');
  near(v.x1, v.x2, '縦線が垂直のまま(x1===x2)');

  near(ang(out[1]) * 180 / Math.PI, Math.atan2(22.7 - 8.3, 19.8 - 5.1) * 180 / Math.PI,
       '＼の角度が元と一致(旧実装では44.409°→46.975°と2.6°変わっていた)');

  // ×の中心から縦線下端までの距離が保たれているか
  const xCenterY = (out[1].y1 + out[1].y2) / 2;
  near(Math.max(v.y1, v.y2) - xCenterY, 33.6 - (8.3 + 22.7) / 2,
       '×の中心から縦線下端までの距離が元と一致');

  // ×の中心が縦線に対してどの位置にあるか(相対位置の保存)
  const xCenterX = (out[1].x1 + out[1].x2) / 2;
  near(xCenterX - v.x1, (5.1 + 19.8) / 2 - 12.4, '×の中心と縦線の相対X位置が元と一致');
}

console.log('【円・弧の半径が丸められない】');
{
  const els = [
    { type:'circle', x:0, y:0, r:7.5 },
    { type:'fline',  x1:0, y1:0, x2:1, y2:0 },  // 中心を半端にするためのダミー
  ];
  const out = paste(els);
  const c = out.find(s => s.t === 'C');
  near(c.r, 7.5, '円の半径7.5が丸められずに保持される');
}
{
  const els = [
    { type:'arc', x:0, y:0, r:4.5, startA:0, endA:1.5, ccw:true },
    { type:'fline', x1:0, y1:0, x2:1, y2:0 },
  ];
  const out = paste(els);
  const a = out.find(s => s.t === 'A');
  near(a.r, 4.5, '弧の半径4.5が丸められずに保持される');
}

console.log('【矩形の幅・高さが丸められない】');
{
  const els = [
    { type:'rect', x:0, y:0, w:10.5, h:6.5 },
    { type:'fline', x1:0, y1:0, x2:1, y2:0 },
  ];
  const out = paste(els);
  const r = out.find(s => s.t === 'R');
  near(r.w, 10.5, '矩形の幅10.5が保持される');
  near(r.h, 6.5,  '矩形の高さ6.5が保持される');
}

console.log('【整数座標の図形は整数のまま(グリッド整列が従来どおり効く)】');
{
  // 中心が整数になる配置なら、結果も整数であること
  const els = [
    { type:'fline', x1:0,  y1:0,  x2:20, y2:0 },
    { type:'fline', x1:0,  y1:10, x2:20, y2:10 },
  ];
  const out = paste(els);
  const allInt = out.every(s => Number.isInteger(s.x1) && Number.isInteger(s.y1) &&
                                Number.isInteger(s.x2) && Number.isInteger(s.y2));
  ok(allInt, '元が整数座標なら結果も整数のまま');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
