// Undo/Redo で未保存の印(●)が正しく付くかのテスト(2026-10-11)
//   node tests/test_undo_dirty.js
//
// 【背景】全体レビューで再現した: 図面を開く → 1か所直す → 保存 → Ctrl+Z。中身は直す前に戻り、保存したファイルとは
// 違うのに●が消えていた。Undo が控え(保存より前に取ったもの)の「未保存の印」まで戻していたため(盛田さん「2も直して」)。
// 直したこと(js/edit.js _histDirty): 戻すページの印を、今のページと比べて決める。
//
// 本物の js/state.js・js/sym_store.js・js/edit.js を読み込み、キー操作は edit.js が登録した keydown の処理にそのまま渡す
// (tests/test_edit_fuzz.js と同じ作り)。保存は、画面の保存と同じく「書き出す前に dirty を落とす」だけを真似る。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

const keyHandlers = [];
const dummyEl = () => ({ textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
const document = {
  readyState: 'loading',
  addEventListener: (t, f) => { if (t === 'keydown') keyHandlers.push(f); },
  getElementById: () => null,
  querySelectorAll: () => [],
  activeElement: { tagName: 'BODY' },
  body: dummyEl(),
};
const noop = () => {};
const sb = {
  console: { ...console, warn: noop, log: noop },
  document, window: undefined,
  draw: noop, updateRightPanel: noop, renderPageTabs: noop, updateResizeHandles: noop, renderSymFloat: noop, renderPartsAll: noop,
  syncModeButtons: noop, updateHint: noop, setMode: noop,
  confirm: () => true, alert: noop, prompt: () => null,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  setTimeout: noop, fetch: () => Promise.reject(new Error('no server')),
  LAYERS: [], DEFS: {},
};
vm.createContext(sb);
vm.runInContext(R('js/state.js'), sb);
vm.runInContext(R('js/sym_store.js'), sb);
vm.runInContext(R('js/edit.js'), sb);
vm.runInContext('this.__state = state;', sb);
const S = () => sb.__state;
const key = (k, mods) => { const e = Object.assign({ key: k, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, preventDefault: noop }, mods || {}); keyHandlers.forEach(f => f(e)); };
const undo = () => key('z', { ctrlKey: true });
const redo = () => key('y', { ctrlKey: true });
const save = () => S().pages.forEach(p => { p.dirty = false; });   // 保存(saveProject・saveAllProject は書き出す前に dirty を落とす)
const move = () => {   // 先頭のページの最初の図形を選んで矢印で動かす(pushH が呼ばれて●が付く)
  S().currentPage = 0;
  S().sel.els.clear(); S().sel.wires.clear(); S().sel.els.add(S().pages[0].elements[0].id);
  key('ArrowRight');
};
const dirty = i => !!S().pages[i].dirty;

const f = fs.readdirSync(path.join(ROOT, 'drawings')).filter(n => /\.(json|seqzu)$/i.test(n)).sort()[0];
ok(!!f, `drawings/ に図面がある(${f})`);
const D = JSON.parse(R('drawings/' + f));
function open(extraPage) {
  const d = JSON.parse(JSON.stringify(D));
  if (extraPage) d.pages.push({ name: '2枚目', elements: [], wires: [], groups: [], guides: [], frameObj: null });
  sb.applyProjectData(d);
  S().hist = []; S().redoHist = [];
}

console.log('【レビューで再現した流れ: 直す → 保存 → Ctrl+Z】');
{
  open();
  move();
  ok(dirty(0), '直すと●');
  save();
  ok(!dirty(0), '保存すると●が消える');
  undo();
  ok(dirty(0), 'Ctrl+Z で保存したファイルと違う中身に戻ると●が付く(以前は消えたまま)');
  redo();
  ok(!dirty(0), 'Ctrl+Y で保存した中身に戻ると●が消える');
}

console.log('【保存を挟まなければ今まで通り】');
{
  open();
  ok(!dirty(0), '開いた直後は●なし');
  move();
  ok(dirty(0), '直すと●');
  undo();
  ok(!dirty(0), '開いた状態まで Ctrl+Z で戻すと●が消える(今まで通り)');
  redo();
  ok(dirty(0), 'Ctrl+Y で直した中身に戻ると●');
  move(); move();
  undo();
  ok(dirty(0), '途中までの Ctrl+Z は●のまま');
}

console.log('【直す → 保存 → また直す → 保存の前まで Ctrl+Z → さらに Ctrl+Z】');
{
  open();
  move(); save(); move();
  ok(dirty(0), '保存のあとに直すと●');
  undo();
  ok(!dirty(0), '保存した中身まで戻すと●が消える');
  undo();
  ok(dirty(0), '保存より前まで戻すと●が付く');
  redo();
  ok(!dirty(0), 'Ctrl+Y で保存した中身に戻ると●が消える');
}

console.log('【触っていないページの●は変えない】');
{
  open(true);
  ok(S().pages.length === 2 && !dirty(1), '2枚目は●なし');
  move(); save(); undo();
  ok(dirty(0) && !dirty(1), '1枚目だけ●が付き、2枚目は●なしのまま');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
