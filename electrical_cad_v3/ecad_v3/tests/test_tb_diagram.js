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

// ------------------------------------------------------------------
console.log('【insertTerminalBlockDiagram: 端子3個ぶんの箱とキャプションを生成】');
const before = sandbox.state.elements.length;
sandbox._pushed = 0;
sandbox.insertTerminalBlockDiagram('TB1');

const added = sandbox.state.elements.slice(before);
eq(sandbox._pushed, 1, '履歴に1回積む(pushH)');

const caption = added.find(e => e.type === 'text' && e.text === 'TB1');
ok(caption, 'デバイス名(TB1)がキャプションとして入る');

const rects = added.filter(e => e.type === 'rect');
eq(rects.length, 3, '端子3個ぶんの箱(rect)ができる');

const texts = added.filter(e => e.type === 'text' && e.text !== 'TB1');
eq(texts.length, 6, '各箱に番号+線番の2テキストずつ、計6個');

// ------------------------------------------------------------------
console.log('【中身: 左に番号、右に線番】');
const termTexts = texts.filter(t => ['1','2','3'].includes(t.text));
eq(termTexts.map(t => t.text), ['1','2','3'], '番号が上から1,2,3の順で入る(tbOrder順)');

const wireTexts = texts.filter(t => t.text.startsWith('W'));
eq(wireTexts.map(t => t.text).sort(), ['W101','W102'], '接続している線番が入る(TB1-3は未接続なので線番なし)');

// 同じ行(同じy)で番号のx座標が線番のx座標より小さい(左に番号、右に線番)
const row1Term = termTexts.find(t => t.text === '1');
const row1Wire = wireTexts.find(t => t.text === 'W101');
ok(row1Term.y === row1Wire.y, '同じ端子の番号と線番は同じ行(同じy)に並ぶ');
ok(row1Term.x < row1Wire.x, '番号が左、線番が右に配置される');

// ------------------------------------------------------------------
console.log('【縦配置: 箱が上から下へ積み上がる】');
const ys = rects.map(r => r.y).sort((a, b) => a - b);
ok(ys[0] < ys[1] && ys[1] < ys[2], '箱が縦方向に順番に並ぶ');
eq(new Set(rects.map(r => r.x)).size, 1, '箱のx座標は全部同じ(横には並ばない)');

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

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
