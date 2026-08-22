// 端子台一覧の作り直しテスト
//   node tests/test_terminal_list.js
//
// 【背景】盛田さんの指摘で判明した不具合。
// 旧実装は type==='terminal' のシンボルだけを拾っていたが、実際に図面へ
// 配置している端子台の端子は type==='junction' かつ style==='circle'(○) /
// 'dbl'(◎) のもの。全く別のものを集計していたため、端子を何個置いても
// 「端子台がありません」と出ていた。さらに現在ページしか見ておらず、
// ページをまたぐ端子台に対応していなかった。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};

// 端子(○)を作る。style省略時は白丸。
const term = (o) => Object.assign({ type: 'junction', style: 'circle', x: 0, y: 0 }, o);

const state = {
  pages: [
    { elements: [
        term({ partRef: 'TB1', label: '1', partModel: '端子台 M4' }),
        term({ partRef: 'TB1', label: '2', partModel: '端子台 M4' }),
        // ●分岐点は端子ではないので拾ってはいけない
        { type: 'junction', style: 'dot', x: 5, y: 5 },
        // シンボルも拾ってはいけない
        { type: 'coil', partRef: 'MC1' },
      ], frameObj: null },
    { elements: [
        term({ partRef: 'TB1', label: '3', partModel: '端子台 M4' }),   // ページをまたぐ同じ端子台
        term({ partRef: 'TB2', label: '1', style: 'dbl' }),             // ◎二重丸も端子
        term({ label: 'X' }),                                           // デバイス未設定
      ], frameObj: null },
  ],
  currentPage: 0,
};
state.elements = state.pages[0].elements;

const sandbox = { state, dl: () => {}, _reportOpen: () => {}, console };
vm.createContext(sandbox);

// report.js は他モジュール依存があるため、対象の関数だけ切り出してevalする
const src = fs.readFileSync(__dirname + '/../js/report.js', 'utf8');
const pick = re => { const m = src.match(re); if (!m) { console.log('  NG 関数を取り出せません:', re); process.exit(1); } return m[0]; };
vm.runInContext([
  'function elLocation(el, pageIdx) { return String(pageIdx + 1); }',   // 区画計算は本テストの対象外
  pick(/function collectTerminals\(\)[\s\S]*?\n\}/),
  pick(/function groupTerminalsByDevice\([\s\S]*?\n\}/),
  pick(/function showTerminals\(\)[\s\S]*?\n\}/),
].join('\n'), sandbox);

console.log('【collectTerminals: 端子の収集】');
let rows = sandbox.collectTerminals();
eq(rows.length, 5, '○と◎だけを拾う(●分岐点とシンボルは除外)');
eq(rows.map(r => r.el.label), ['1', '2', '3', '1', 'X'], 'ページ順→配置順に並ぶ');
eq(rows.map(r => r.page), [0, 0, 1, 1, 1], '全ページを横断して拾う');
eq(rows.map(r => r.loc), ['1', '1', '2', '2', '2'], '位置(ページ)が付く');

console.log('\n【groupTerminalsByDevice: デバイスごとのまとめ】');
let g = sandbox.groupTerminalsByDevice(rows);
eq([...g.keys()], ['TB1', 'TB2', '(デバイス未設定)'], 'デバイスごとに分かれる');
eq(g.get('TB1').length, 3, 'TB1はページをまたいで3点にまとまる');
eq(g.get('TB2').length, 1, 'TB2は1点');
eq(g.get('(デバイス未設定)').length, 1, 'デバイス未設定も落とさず出す');

console.log('\n【tbOrder: 端子表で並べ替えた順序に従う】');
// 端子表で 3 → 1 → 2 の順に並べ替えた想定
state.pages[0].elements[0].tbOrder = 1;   // label '1'
state.pages[0].elements[1].tbOrder = 2;   // label '2'
state.pages[1].elements[0].tbOrder = 0;   // label '3' を先頭へ
rows = sandbox.collectTerminals();
eq(rows.slice(0, 3).map(r => r.el.label), ['3', '1', '2'], 'tbOrderの順に並ぶ');
eq(rows.slice(3).map(r => r.el.label), ['1', 'X'], 'tbOrderが無いものは後ろに元の順で残る(既存図面との互換)');

console.log('\n【端子が1点も無いとき】');
const empty = { pages: [{ elements: [{ type: 'junction', style: 'dot' }] }] };
const sb2 = { state: empty, dl: () => {}, _reportOpen: () => {}, console };
vm.createContext(sb2);
vm.runInContext([
  'function elLocation(el, i){ return String(i+1); }',
  pick(/function collectTerminals\(\)[\s\S]*?\n\}/),
].join('\n'), sb2);
eq(sb2.collectTerminals().length, 0, '●分岐点しか無ければ0点');


// ------------------------------------------------------------------
// 並べ替えと番号の振り直し（2026-08-22追加）
// ------------------------------------------------------------------
// 盛田さんの要望「デバイスだけ指定しとけばあとは自動番号振りして、端子表で
// 並びを変えたらその順番で番号振り直せるか？」に対する実装の検証。
//
// 元データにidが無いので、テスト用にidを振ってから検証する。
let _n = 0;
state.pages.forEach(pg => pg.elements.forEach(e => { e.id = 'e' + (++_n); }));

sandbox.pushed = 0;
vm.runInContext([
  'let _tbDragId = null;',
  'function pushH(){ pushed++; }',
  'function draw(){}',
  'function exportTermCSV(){}',
  pick(/function reorderTerminal\([\s\S]*?\n\}/),
  pick(/function renumberTerminals\([\s\S]*?\n\}/),
].join('\n'), sandbox);

const ids = () => sandbox.collectTerminals().map(r => r.el.id);
const labelsOf = dev => sandbox.groupTerminalsByDevice(sandbox.collectTerminals())
  .get(dev).map(r => r.el.label);

console.log('\n【reorderTerminal: 表での並べ替え】');
// 前段のテストで付いた tbOrder を消して素の状態に戻す
state.pages.forEach(pg => pg.elements.forEach(e => { delete e.tbOrder; }));
eq(ids(), ['e1', 'e2', 'e5', 'e6', 'e7'], '並べ替え前はページ順→配置順');

// e5(2ページ目のTB1端子「3」)を先頭(e1の位置)へドラッグした想定
sandbox.reorderTerminal('e5', 'e1');
eq(ids(), ['e5', 'e1', 'e2', 'e6', 'e7'], 'ページをまたいで先頭へ移動できる');
eq(sandbox.collectTerminals().map(r => r.el.tbOrder), [0, 1, 2, 3, 4],
   '全端子に連番のtbOrderが振り直される(欠番・重複なし)');

sandbox.reorderTerminal('e5', 'e6');   // 後ろ方向へ
eq(ids(), ['e1', 'e2', 'e6', 'e5', 'e7'], '後ろ方向へも移動できる');

console.log('\n【renumberTerminals: 並べ替えた順で番号を振り直す】');
state.pages.forEach(pg => pg.elements.forEach(e => { delete e.tbOrder; }));
sandbox.reorderTerminal('e5', 'e1');           // TB1を 3→1→2 の並びにする
eq(labelsOf('TB1'), ['3', '1', '2'], '振り直す前は並びと端子番号が不一致');

sandbox.pushed = 0;
sandbox.renumberTerminals('TB1');
eq(labelsOf('TB1'), ['1', '2', '3'], '表示順どおり1から振り直される');
eq(sandbox.groupTerminalsByDevice(sandbox.collectTerminals()).get('TB1').map(r => r.el.id),
   ['e5', 'e1', 'e2'], '並び順自体は変わらない(番号だけ振り直す)');
eq(sandbox.pushed, 1, '履歴が積まれる(undoで戻せる)');

console.log('\n【他のデバイスに影響しない】');
eq(labelsOf('TB2'), ['1'], 'TB1を振り直してもTB2は変わらない');
eq(labelsOf('(デバイス未設定)'), ['X'], 'デバイス未設定の端子も勝手に振り直さない');

console.log('\n【存在しないデバイスを指定しても壊れない】');
sandbox.pushed = 0;
sandbox.renumberTerminals('存在しないTB');
eq(sandbox.pushed, 0, '対象が無ければ何もしない(履歴も積まない)');

console.log(ng === 0 ? '\n全て成功' : `\n${ng}件失敗`);
process.exit(ng === 0 ? 0 : 1);
