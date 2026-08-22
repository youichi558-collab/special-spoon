// 端子台の配置図（図面挿入）のテスト
//   node tests/test_tb_diagram.js
//
// 【背景】盛田さんが見せた「引出配線図」の例（メーカー正式書式、上段/下段・
// 型式併記・設置場所ごとの点線グループ）ほど作り込む必要はなく、「四角で囲って
// 左に番号、右に線番を並べるだけの縦配置」が欲しい、との要望。残り(メーカー名・
// 型式・設置場所の区切り等)は手書きで足す前提。
// 並び順はtbOrder(端子台表の並べ替え結果)、線番は接続チェックと同じ座標近接
// 判定(buildTerminalBlockRows経由)から自動生成する。
//
// 生成するのは rect/text 要素そのもの。BOM集計(collectBOMRows)はrect/textを
// スキップリストで除外済みなので、この図が部品として二重計上されないことも
// あわせて検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const sandbox = {
  document: { getElementById: id => (id === 'cv' ? { width: 1000, height: 800 } : null) },
  console,
  activeLayer: () => '回路',
  pushH: () => { sandbox._pushed = (sandbox._pushed || 0) + 1; },
  draw: () => {},
  genId: (() => { let n = 0; return prefix => `${prefix}_test_${n++}`; })(),
  getDef: () => ({}),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8'), sandbox);

sandbox.state = {
  G: 10, pan: { x: 0, y: 0 }, zoom: 1,
  customSymbols: [],
  pages: [{
    name: 'P1', frameObj: null,
    elements: [
      { id: 11, type:'junction', style:'circle', partRef:'TB1', partModel:'端子台 M4', label:'1', x:0,  y:0 },
      { id: 12, type:'junction', style:'circle', partRef:'TB1', partModel:'端子台 M4', label:'2', x:10, y:0 },
      { id: 13, type:'junction', style:'circle', partRef:'TB1', partModel:'端子台 M4', label:'3', x:20, y:0 },
    ],
    wires: [
      { id:'w1', wireNo:'W101', layer:'L1', x1:0,  y1:0, x2:0,  y2:50 },  // TB1-1
      { id:'w2', wireNo:'W102', layer:'L1', x1:10, y1:0, x2:10, y2:50 },  // TB1-2
      // TB1-3 は未接続のまま
    ],
  }],
};
sandbox.state.elements = sandbox.state.pages[0].elements;
sandbox.state.wires = sandbox.state.pages[0].wires;
sandbox.state.page = sandbox.state.pages[0];   // 実アプリのstate.pageゲッターに相当

// ------------------------------------------------------------------
console.log('【insertTerminalBlockDiagram: 端子3個ぶんの表構造(外枠+仕切り線)を生成】');
const before = sandbox.state.elements.length;
sandbox._pushed = 0;
sandbox.insertTerminalBlockDiagram('TB1');

const added = sandbox.state.elements.slice(before);
eq(sandbox._pushed, 1, '履歴に1回積む(pushH)');

const caption = added.find(e => e.type === 'text' && e.text === 'TB1');
ok(caption, 'デバイス名(TB1)がキャプションとして入る');

const rects = added.filter(e => e.type === 'rect');
eq(rects.length, 1, '外枠は1つの箱(rect)だけ(端子ごとにバラバラの箱を積まない)');

const flines = added.filter(e => e.type === 'fline');
// 横の仕切り線(行と行の間、端子3個なら2本) + 縦の仕切り線(番号/線番の境界、1本)
eq(flines.length, 3, '横の仕切り線2本+縦の仕切り線1本、計3本');

const vLine = flines.find(f => f.x1 === f.x2);
const hLines = flines.filter(f => f.y1 === f.y2);
ok(vLine, '縦線(x1===x2)が1本ある');
eq(hLines.length, 2, '横線(y1===y2)が2本ある(端子3個の間仕切り)');

const texts = added.filter(e => e.type === 'text' && e.text !== 'TB1');
eq(texts.length, 6, '各行に番号+線番の2テキストずつ、計6個');

// ------------------------------------------------------------------
console.log('【縦線は表の全高を貫通する】');
ok(vLine.y1 === rects[0].y && vLine.y2 === rects[0].y + rects[0].h,
   '縦の仕切り線が外枠の上端から下端まで通っている(途中で切れていない)');

// ------------------------------------------------------------------
console.log('【中身: 左に番号、右に線番、縦線を挟んで両側に分かれる】');
const termTexts = texts.filter(t => ['1','2','3'].includes(t.text));
eq(termTexts.map(t => t.text), ['1','2','3'], '番号が上から1,2,3の順で入る(tbOrder順)');

const wireTexts = texts.filter(t => t.text.startsWith('W'));
eq(wireTexts.map(t => t.text).sort(), ['W101','W102'], '接続している線番が入る(TB1-3は未接続なので線番なし)');

// 同じ行(同じy)で番号のx座標が線番のx座標より小さい(左に番号、右に線番)
const row1Term = termTexts.find(t => t.text === '1');
const row1Wire = wireTexts.find(t => t.text === 'W101');
ok(row1Term.y === row1Wire.y, '同じ端子の番号と線番は同じ行(同じy)に並ぶ');
ok(row1Term.x < row1Wire.x, '番号が左、線番が右に配置される');
ok(row1Term.x < vLine.x1, '番号のテキストは縦の仕切り線より左にある');
ok(row1Wire.x > vLine.x1, '線番のテキストは縦の仕切り線より右にある');

// ------------------------------------------------------------------
console.log('【文字位置: 行の見た目の中心に来るようベースラインを補正】');
// type='text'はdrawTextEl()でtextBaseline='alphabetic'固定(el.yは文字の下端)。
// y=行の中心のまま置くと文字が中心より上に見えてしまうため、字高の0.35em分
// だけベースラインを下げて見た目の中心を行の中心に合わせている。
const rowTopY = added.find(e => e.type === 'rect').y;   // 表全体の上端
const rectAll = added.find(e => e.type === 'rect');
const boxHUsed = rectAll.h / termTexts.length;
const term1Text = termTexts.find(t => t.text === '1');
const fsUsed = term1Text.fs;
const rawCenterY = rowTopY + boxHUsed / 2;
ok(term1Text.y > rawCenterY, 'ベースラインは行の幾何中心より下にずらしてある(補正が効いている)');
eq(term1Text.y - rawCenterY, fsUsed * 0.35, '補正量は文字サイズの0.35倍');


const termYs = ['1','2','3'].map(n => termTexts.find(t => t.text === n).y);
ok(termYs[0] < termYs[1] && termYs[1] < termYs[2], '番号1→2→3が上から下の順で並ぶ');
eq(new Set(termTexts.map(t => t.x)).size, 1, '番号列のx座標は全行で同じ(横には並ばない)');

// ------------------------------------------------------------------
console.log('【挿入位置: 画面中心(ワールド座標)から始まる】');
eq(caption.x, 500, 'pan=0,zoom=1でcv.width=1000なら中心xは500');
eq(caption.y, 400, 'pan=0,zoom=1でcv.height=800なら中心yは400');

// ------------------------------------------------------------------
console.log('【デバイス未存在: 何もしない】');
const beforeNone = sandbox.state.elements.length;
sandbox.insertTerminalBlockDiagram('存在しないTB');
eq(sandbox.state.elements.length, beforeNone, '存在しないデバイス名では何も追加しない');

// ------------------------------------------------------------------
console.log('【BOM集計に混入しない】');
// rect/textはcollectBOMRowsのskipリストで除外されるため、挿入した図がBOMの
// 部品として二重計上されないことを確認する。
const bomRows = sandbox.collectBOMRows();
const hasTB1AsPart = bomRows.some(r => (r.refs || []).includes('TB1'));
// TB1自体はjunction(端子)としてBOMに載る(端子台という部品として)。
// 追加したrect/textが"別の部品"として増えていないかだけを見る。
const junctionOnlyCount = bomRows.filter(r => (r.refs || []).includes('TB1')).length;
eq(junctionOnlyCount, 1, 'TB1のBOM行は1つのまま(挿入した図が別部品として二重計上されない)');

// ------------------------------------------------------------------
console.log('【列幅: 番号列は狭く、線番列は広く(約1:3)】');
eq(vLine.x1 - added.find(e => e.type === 'rect').x, 10, '番号列の幅は10(箱幅40の25%)');
eq(added.find(e => e.type === 'rect').w - (vLine.x1 - added.find(e => e.type === 'rect').x), 30,
   '線番列の幅は30(箱幅40の75%)。番号列の3倍');

// ------------------------------------------------------------------
console.log('【グリッドスナップ: 挿入位置がグリッドから外れていても箱の線はグリッドに乗る】');
// 画面中心がグリッド(G=10)からズレる状況(半端なpan/zoom)を作る
sandbox.state.pan = { x: 3, y: 7 };
sandbox.state.zoom = 1;
const beforeSnap = sandbox.state.elements.length;
sandbox.insertTerminalBlockDiagram('TB1');
const addedSnap = sandbox.state.elements.slice(beforeSnap);
const rectSnap  = addedSnap.find(e => e.type === 'rect');
const vLineSnap = addedSnap.filter(e => e.type === 'fline').find(f => f.x1 === f.x2);
const hLinesSnap = addedSnap.filter(e => e.type === 'fline').filter(f => f.y1 === f.y2);
const onGrid = v => v % 10 === 0;
ok(onGrid(rectSnap.x) && onGrid(rectSnap.y), '外枠の左上角がグリッドに乗る');
ok(onGrid(rectSnap.x + rectSnap.w) && onGrid(rectSnap.y + rectSnap.h), '外枠の右下角がグリッドに乗る');
ok(onGrid(vLineSnap.x1), '縦の仕切り線もグリッドに乗る');
ok(hLinesSnap.every(f => onGrid(f.y1)), '横の仕切り線もすべてグリッドに乗る');
sandbox.state.pan = { x: 0, y: 0 };  // 元に戻す


// 前回(固定world単位)は1行10mm(G*2=20 world単位)で、A3の作図領域(約160mm)に
// 16行しか入らなかった。図枠のsc(mm→world換算率)を使い、紙面上で1行5mm相当に
// 固定することで、既定のA3横(297×210・余白10・表題欄30、作図領域高さ約160mm)
// なら5mm/行で32行入るようにした(30〜40行の範囲に収まる)。
sandbox.state.pages[0].frameObj = { sc: 2, wMM: 297, hMM: 210, mg: 10, thMM: 30 };
sandbox.insertTerminalBlockDiagram('TB1');
const added2 = sandbox.state.elements.slice(-(3 /*横線+縦線*/ + 1 /*外枠*/ + 6 /*テキスト*/ + 1 /*キャプション*/));
const rect2 = added2.find(e => e.type === 'rect');
eq(rect2.h / 3, 10, '1行の高さは10 world単位(=sc2×5mm)。3行で合計30');

// 作図領域(約160mm)に収まる行数を計算し、目標の30〜40行の範囲にあることを確認
const drawHmm = (210 - 10*2 - 30);           // innerH(mm) - 表題欄(mm)
const rowsPerSheet = drawHmm / 5;            // 5mm/行
ok(rowsPerSheet >= 30 && rowsPerSheet <= 40,
   `既定A3横で1枚に入る行数が30〜40の範囲(実際: ${rowsPerSheet}行)`);

// 図枠が大きい(A1等)ほど、同じ実寸(5mm/行)を保ったまま1枚に入る行数が増える
sandbox.state.pages[0].frameObj = { sc: 2, wMM: 841, hMM: 594, mg: 10, thMM: 30 };
const beforeA1 = sandbox.state.elements.length;
sandbox.insertTerminalBlockDiagram('TB1');
const rectA1 = sandbox.state.elements.slice(beforeA1).find(e => e.type === 'rect');
eq(rectA1.h, rect2.h, '図枠のサイズが変わっても1行の実寸(world単位)は変わらない(scが同じなら)');

// scが違う図枠(縮尺が変わる)なら、1行のworld単位サイズも比例して変わる
sandbox.state.pages[0].frameObj = { sc: 4, wMM: 297, hMM: 210, mg: 10, thMM: 30 };
const beforeSc4 = sandbox.state.elements.length;
sandbox.insertTerminalBlockDiagram('TB1');
const rectSc4 = sandbox.state.elements.slice(beforeSc4).find(e => e.type === 'rect');
eq(rectSc4.h, rect2.h * 2, 'scが2倍(sc4)なら1行のworld単位も2倍(紙面上の実寸は変わらない)');

// 図枠が無いページ(表紙等)ではsc=2を仮定してフォールバックする
sandbox.state.pages[0].frameObj = null;
const beforeNoFrame = sandbox.state.elements.length;
sandbox.insertTerminalBlockDiagram('TB1');
const rectNoFrame = sandbox.state.elements.slice(beforeNoFrame).find(e => e.type === 'rect');
eq(rectNoFrame.h, rect2.h, '図枠が無ければsc=2を仮定し、既定A3と同じ実寸になる');

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
