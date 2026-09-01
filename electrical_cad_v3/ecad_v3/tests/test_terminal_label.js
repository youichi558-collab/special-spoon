// 端子番号(cS.terminals[i].label)機能のテスト
//   node tests/test_terminal_label.js
//
// 【背景】cS.terminals は {x,y} で座標しか持たず、端子番号(ラベル)が無かった。
// {x,y,label} に拡張し、ピンエディタ(pin_editor.js)で番号を入力・保存できるようにした。
// conn_table.js(接続表)の端子番号表示は
//   ①部品割当時の個体差(el.terminals、型番ごとに異なる実際の端子番号)
//   ②シンボル定義側の既定ラベル(cS.terminals[i].label、部品未割当でも参照名として出す)
//   ③どちらも無ければ通し番号(T1,T2...)
// の優先順位で決まる。この一連を、書き写した再実装ではなく実コードをevalして検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};

// ------------------------------------------------------------------
// 1) pin_editor.js を実コードでeval。既存カスタムシンボルの端子編集フローを再現。
// ------------------------------------------------------------------
console.log('【pin_editor.js: 既存シンボルの端子番号編集】');

const cS = { type: 'testsym', name: 'テストシンボル', shapes: [], terminals: [] };
const state = { customSymbols: [cS] };
const DEFS = { testsym: {} };

function makeCtxStub() {
  // Canvas 2D contextのダミー。プロパティ代入・メソッド呼び出しをすべて無害に受け流す。
  return new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}) });
}
function makeElStub(overrides) {
  return Object.assign({
    getContext: () => makeCtxStub(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    width: 400, height: 300,
    style: {}, textContent: '', value: '', innerHTML: '',
    onmousedown: null, onwheel: null,
  }, overrides || {});
}
const domEls = {
  'pin-edit-cv': makeElStub({}),
  'pe-name': makeElStub({}),
  'pe-role': makeElStub({}),
  'pe-term-list': makeElStub({}),
};

const sandbox = {
  state, DEFS,
  document: { getElementById: id => domEls[id] || null },
  alert: () => {}, openFP: () => {}, closeFP: () => {},
  draw: () => {}, saveSymbolsToStorage: () => {},
  requestAnimationFrame: () => {},
  console,
  escH: require('./_esch.js').escH,   // 実体は js/state.js のもの
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/pin_editor.js', 'utf8'), sandbox);

// パネルを開く(実コードのopenPinEditorを実行。bbox計算・zoom計算等も本物を通す)
sandbox.openPinEditor('testsym');

// キャンバス上のクリックをシミュレート(実コードpeOnClickをそのまま呼ぶ。
// クリック位置→ワールド座標の変換自体は既存機能であり本テストの対象外なので、
// 「新規端子が追加されること」「labelフィールドが既定で入ること」を検証する)
sandbox.peOnClick({ clientX: 200, clientY: 150 });

// _peTermsはpin_editor.js側のトップレベルlet変数なのでsandbox._peTermsとしては
// 読めない(vmコンテキストのlet/constはグローバルオブジェクトのプロパティにならない)。
// 同じコンテキスト内でrunInContextして式評価すれば、字句スコープ上は繋がっているので読める。
const peTerms = () => vm.runInContext('_peTerms', sandbox);

eq(peTerms().length, 1, 'クリックで端子が1点追加される');
eq(peTerms()[0].label, '', '新規端子のlabelは既定で空文字');

sandbox.peSetTermLabel(0, 'A1');
eq(peTerms()[0].label, 'A1', 'peSetTermLabelでlabelが書き換わる');

sandbox.savePinEdits();
eq(cS.terminals.length, 1, '保存後、cS.terminalsに1件入る');
eq(cS.terminals[0].label, 'A1', 'cS.terminals[0].labelに保存される');
eq(DEFS.testsym.terminals[0].label, 'A1', 'DEFS[type].terminalsにもlabelが反映される(描画・スナップ側の参照用)');

// ------------------------------------------------------------------
// 2) conn_table.js を実コードでeval。端子番号表示の優先順位を検証。
// ------------------------------------------------------------------
console.log('\n【conn_table.js: 接続表の端子番号 優先順位】');

const cS2 = {
  type: 'contact_a_test',
  terminals: [
    { x: -10, y: 0, label: '13' },
    { x: 10, y: 0, label: '14' },
  ],
};
const state2 = {
  customSymbols: [cS2],
  pages: [], // buildConnectionRowsは使わないためダミーでよい
};
function getDef() { return {}; }
const sandbox2 = { state: state2, getDef, console };
vm.createContext(sandbox2);
vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8'), sandbox2);

// ケースA: 部品未割当(el.terminalsが空) → シンボル定義側のlabel('13','14')が出る
const elNoAssign = { id: 'e1', type: 'contact_a_test', x: 0, y: 0, rot: 0, terminals: '' };
let pts = sandbox2.collectTerminalPoints([elNoAssign]);
eq(pts.map(p => p.dispTerm), ['13', '14'], '部品未割当でもシンボル定義のlabelが出る');

// ケースB: 部品割当済み(el.terminalsに個体差の番号) → そちらが優先される
const elAssigned = { id: 'e2', type: 'contact_a_test', x: 0, y: 0, rot: 0, terminals: '23,24' };
pts = sandbox2.collectTerminalPoints([elAssigned]);
eq(pts.map(p => p.dispTerm), ['23', '24'], '部品割当時はel.terminals(個体差)が優先される');

// ケースC: シンボル定義側にlabelが無い(旧データ、{x,y}のみ)場合の後方互換
const cS3 = { type: 'legacy_sym', terminals: [{ x: -5, y: 0 }, { x: 5, y: 0 }] };
state2.customSymbols.push(cS3);
const elLegacy = { id: 'e3', type: 'legacy_sym', x: 0, y: 0, rot: 0, terminals: '' };
pts = sandbox2.collectTerminalPoints([elLegacy]);
eq(pts.map(p => p.dispTerm), ['T1', 'T2'], 'labelが無い旧データはT1,T2にフォールバック(後方互換)');

console.log(ng === 0 ? '\n全て成功' : `\n${ng}件失敗`);
process.exit(ng === 0 ? 0 : 1);
