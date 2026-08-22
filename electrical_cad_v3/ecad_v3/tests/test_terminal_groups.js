// 端子番号の「名前付きグループ」機能のテスト
//   node tests/test_terminal_groups.js
//
// 【背景】部品DBの端子番号欄はフラットなカンマ区切り1本で、シンボルの端子点に
// 頭から順に割り当てる仕様だった。しかし1つの型式が複数のシンボルに分かれる
// 部品(電磁接触器のコイル+主接点+補助接点、ブレーカの主回路+補助+警報)では
// これが破綻していた。端子番号欄を「名前:番号,番号 / 名前:番号,番号」形式に
// 拡張し、割り当て時にシンボルの端子点数から自動判定するようにした。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};

// ------------------------------------------------------------------
// ui.js を実コードでevalする。placePart/parseTerminalGroups等を本物で動かす。
// ------------------------------------------------------------------
const state = {
  customParts: [],
  customSymbols: [],
  sel: { els: new Set(), wires: new Set() },
  pages: [{ elements: [], wires: [], groups: [] }],
  currentPage: 0,
  get elements() { return this.pages[this.currentPage].elements; },
  get page() { return this.pages[this.currentPage]; },
};

let opened = null, closed = null, alerted = null;
const fields = {};
const mk = (id, v) => (fields[id] = { value: v ?? '', textContent: '', innerHTML: '', style: {} });
['s-hint', 'tg-ref', 'tg-list'].forEach(id => mk(id));

const sandbox = {
  state,
  document: { getElementById: id => fields[id] || null },
  alert: m => { alerted = m; },
  openFP: id => { opened = id; },
  closeFP: id => { closed = id; },
  draw: () => {},
  updateRightPanel: () => {},
  pushH: () => {},
  applyDefaultVolt: () => {},
  partsDb: { scheduleSave: () => {}, writeNow: async () => {} },
  console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// ui.js は巨大で他モジュール依存もあるため、必要な関数だけを切り出してevalする。
// (ファイル全体をevalすると未定義参照でトップレベルが落ちるため)
const src = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const start = src.indexOf('function parseTerminalGroups');
const endMark = '\n// 既存のカスタム部品を登録フォームに読み込んで編集';
const end = src.indexOf(endMark);
if (start < 0 || end < 0 || end <= start) {
  console.log('  NG テスト対象の範囲をui.jsから切り出せませんでした（関数名かコメントが変わった可能性）');
  process.exit(1);
}
vm.runInContext(src.slice(start, end), sandbox);

// ------------------------------------------------------------------
console.log('【parseTerminalGroups: 書式の解析】');

eq(sandbox.parseTerminalGroups(''), [], '空文字はグループ0個');

eq(sandbox.parseTerminalGroups('A1,A2,1,2'),
   [{ name: '', list: ['A1', 'A2', '1', '2'] }],
   '「:」が無い従来データは名前なしの1グループ(後方互換)');

eq(sandbox.parseTerminalGroups('コイル:A1,A2 / 主回路:1,3,5,2,4,6 / 補助:13,14'),
   [{ name: 'コイル', list: ['A1', 'A2'] },
    { name: '主回路', list: ['1', '3', '5', '2', '4', '6'] },
    { name: '補助', list: ['13', '14'] }],
   '3グループに分解できる');

eq(sandbox.parseTerminalGroups('主回路：1,2,3 / 補助：11,12,14'),
   [{ name: '主回路', list: ['1', '2', '3'] },
    { name: '補助', list: ['11', '12', '14'] }],
   '全角コロンでも解析できる');

eq(sandbox.parseTerminalGroups('  主回路 : 1 , 2 , 3  '),
   [{ name: '主回路', list: ['1', '2', '3'] }],
   '余分な空白を除去する');

eq(sandbox.parseTerminalGroups('-'),
   [{ name: '', list: ['-'] }],
   'カタログの未記入値「-」はそのまま1件として扱う(呼び出し側で判断)');

// ------------------------------------------------------------------
console.log('\n【pickTerminalGroup: 端子点数による自動判定】');

const g3 = sandbox.parseTerminalGroups('主回路:1,2,3,4,5,6 / 補助:11,12,14 / 警報:91,92,94');

eq(sandbox.pickTerminalGroup(g3, 6), { name: '主回路', list: ['1', '2', '3', '4', '5', '6'] },
   '6点シンボルなら主回路が一意に決まる');

eq(sandbox.pickTerminalGroup(g3, 3), null,
   '3点シンボルは補助と警報の2つが該当するので自動判定しない(選ばせる)');

eq(sandbox.pickTerminalGroup(g3, 2), null,
   '該当なしなら自動判定しない');

eq(sandbox.pickTerminalGroup(g3, 0), null,
   '端子点数が分からないシンボルでは自動判定しない');

const g2 = sandbox.parseTerminalGroups('コイル:A1,A2 / 主回路:1,3,5,2,4,6');
eq(sandbox.pickTerminalGroup(g2, 2), { name: 'コイル', list: ['A1', 'A2'] },
   'コイル(2点)と主回路(6点)は点数が違うので迷わない');

eq(sandbox.pickTerminalGroup(sandbox.parseTerminalGroups('1,2'), 99),
   { name: '', list: ['1', '2'] },
   '1グループしかなければ点数に関係なくそれを使う');

// ------------------------------------------------------------------
console.log('\n【placePart: 実コードで割り当て】');

// テスト用のカスタムシンボル(主接点6点・補助接点3点)と部品
state.customSymbols.push({ type: 'mcb_main', terminals: [{}, {}, {}, {}, {}, {}] });
state.customSymbols.push({ type: 'mcb_aux', terminals: [{}, {}, {}] });
state.customParts.push({
  ref: 'BW32AAG-3P005W', type: 'breaker', amp: '5A', contacts: '1a1b',
  terminals: '主回路:1,2,3,4,5,6 / 補助:11,12,14 / 警報:91,92,94',
});

const TERMS = '主回路:1,2,3,4,5,6 / 補助:11,12,14 / 警報:91,92,94';

// ケースA: 6点の主接点シンボル → 自動で主回路が入る
state.pages[0].elements.length = 0;
state.pages[0].elements.push({ id: 1, type: 'mcb_main' });
state.sel.els.clear(); state.sel.els.add(1);
opened = null;
sandbox.placePart('breaker', 'BW32AAG-3P005W', TERMS);
eq(state.elements[0].terminals, '1,2,3,4,5,6', '6点シンボルには主回路が自動で入る');
eq(state.elements[0].partModel, 'BW32AAG-3P005W', '型番も入る');
eq(opened, null, '自動判定できたので選択パネルは出ない');
eq(fields['s-hint'].textContent.includes('［端子:主回路］'), true, 'どのグループを使ったかヒントに出る');

// ケースB: 3点の補助接点シンボル → 補助と警報が両方3点なので選択パネルが出る
state.pages[0].elements.length = 0;
state.pages[0].elements.push({ id: 2, type: 'mcb_aux' });
state.sel.els.clear(); state.sel.els.add(2);
opened = null;
sandbox.placePart('breaker', 'BW32AAG-3P005W', TERMS);
eq(opened, 'term-group-p', '判定できないときは選択パネルが出る');
eq(state.elements[0].terminals, undefined, 'まだ何も書き込まれていない(選択待ち)');
eq(fields['tg-ref'].textContent, 'BW32AAG-3P005W', 'パネルに型番が表示される');
eq(fields['tg-list'].innerHTML.includes('警報'), true, 'パネルに全グループが並ぶ');

// 「警報」(index 2)を選ぶ
closed = null;
sandbox.applyPartAssign(2);
eq(state.elements[0].terminals, '91,92,94', '選んだグループ(警報)が書き込まれる');
eq(closed, 'term-group-p', 'パネルが閉じる');
eq(fields['s-hint'].textContent.includes('［端子:警報］'), true, '選んだグループ名がヒントに出る');

// ケースC: 従来データ(グループ分けなし)はそのまま入る
state.pages[0].elements.length = 0;
state.pages[0].elements.push({ id: 3, type: 'mcb_main' });
state.sel.els.clear(); state.sel.els.add(3);
opened = null;
sandbox.placePart('breaker', 'BW32AAG-3P005W', 'A1,A2,1,2');
eq(state.elements[0].terminals, 'A1,A2,1,2', '従来のフラット形式はそのまま入る(後方互換)');
eq(opened, null, '選択パネルは出ない');

// ケースD: 仕様欄の保護（2026-08-22の修正が生きているか）
state.pages[0].elements.length = 0;
state.pages[0].elements.push({ id: 4, type: 'mcb_main', label: '手書きメモ' });
state.sel.els.clear(); state.sel.els.add(4);
sandbox.placePart('breaker', 'BW32AAG-3P005W', TERMS);
eq(state.elements[0].label, '手書きメモ', 'グループ対応後も仕様欄の手書きは保護される');

// ケースE: シンボル未選択なら何もしない
state.sel.els.clear();
alerted = null;
sandbox.placePart('breaker', 'BW32AAG-3P005W', TERMS);
eq(alerted !== null, true, 'シンボル未選択なら注意を出す');

console.log(ng === 0 ? '\n全て成功' : `\n${ng}件失敗`);
process.exit(ng === 0 ? 0 : 1);
