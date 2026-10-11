// 「読込」で置き換えたあとの Ctrl+Z で、前の図面ごと戻るかのテスト(2026-10-11)
//   node tests/test_undo_load.js
//
// 【背景】全体レビューで再現した: 読込(置き換え)のあとに Ctrl+Z を押すと、ページだけが前の図面に戻り、
// 保存ファイル名・レイヤー・シンボル・線番の規則などは読み込んだ図面のままだった。レイヤーが違うと前の図面の線が
// 「レイヤー不明」で白っぽくなる(盛田さん「3も直して」)。
// 直したこと(js/edit.js): 置き換える前に pushH({ doc: true }) で図面の設定も控え(_histDocSnap)、Undo/Redo で戻す。
//
// 本物の js/state.js・js/sym_store.js・js/edit.js を読み込み、キー操作は edit.js が登録した keydown の処理にそのまま渡す
// (tests/test_undo_dirty.js と同じ作り)。読込は、プロジェクトのツリーから開くときと同じ loadProjectText(…, 'replace')。
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
const layerNames = () => sb.LAYERS.map(l => l.name).join(',');
const symTypes = () => (S().customSymbols || []).map(s => s.type).sort().join(',');
const pagesBody = () => JSON.stringify(S().pages.map(({ dirty, ...pg }) => pg));
const missingLayers = () => { const L = new Set(sb.LAYERS.map(l => l.name)); return S().pages.flatMap(pg => [...pg.elements, ...pg.wires]).filter(e => !L.has(e.layer)).length; };

// 読み込む別の図面: 名前・レイヤー・線番の規則・シンボルが違う
const B = JSON.parse(JSON.stringify(D));
B.saveFileName = '別の図面';
const keep = 'B専用';   // 前の図面が使っていないレイヤーだけにする(戻らないと、前の図面の線が全部「レイヤー不明」になる)
B.layers = [{ ...B.layers[0], name: keep }];
B.pages.forEach(pg => { pg.name = 'B1'; pg.elements.forEach(e => { e.layer = keep; }); pg.wires.forEach(w => { w.layer = keep; }); });
B.wireNoRule = { ...(D.wireNoRule || {}), _test: 'B' };
B.customSymbols = (B.customSymbols || []).slice(0, 1);

console.log('【図面を開いて直す → 別の図面を読込(置き換え) → Ctrl+Z】');
{
  sb.applyProjectData(JSON.parse(JSON.stringify(D)));
  S().hist = []; S().redoHist = [];
  move();
  const before = { name: S().saveFileName, layers: layerNames(), syms: symTypes(), rule: JSON.stringify(S().wireNoRule), pages: pagesBody(), dirty: S().pages.map(p => !!p.dirty) };
  ok(before.dirty[0] === true, '直したので●');
  sb.loadProjectText(JSON.stringify(B), 'B.seqzu', 'replace');
  ok(S().saveFileName === '別の図面' && sb.LAYERS.length === 1, '読み込んだ図面になる');
  undo();
  ok(S().saveFileName === before.name, `保存ファイル名が前の図面に戻る(${S().saveFileName})`);
  ok(layerNames() === before.layers, 'レイヤーが前の図面に戻る');
  ok(missingLayers() === 0, '前の図面の線・図形のレイヤーがどれもある(以前は「レイヤー不明」になった)');
  ok(JSON.stringify(S().wireNoRule) === before.rule, '線番の規則が前の図面に戻る');
  ok(symTypes() === before.syms, 'シンボルが前の図面に戻る');
  ok(pagesBody() === before.pages, 'ページの中身が前の図面に戻る');
  ok(JSON.stringify(S().pages.map(p => !!p.dirty)) === JSON.stringify(before.dirty), '●は読込の前のまま(直したページは●)');
  redo();
  ok(S().saveFileName === '別の図面' && sb.LAYERS.length === 1 && JSON.stringify(S().wireNoRule).includes('"_test":"B"'), 'Ctrl+Y で読み込んだ図面に戻る');
  ok(missingLayers() === 0, 'Ctrl+Y のあともレイヤーはそろっている');
  ok(S().pages.every(p => !p.dirty), 'Ctrl+Y のあと、読み込んだ図面は●なし(開いた直後と同じ)');
  undo(); undo();
  ok(S().saveFileName === before.name && pagesBody() !== before.pages, '読込の前の編集も続けて戻せる');
}

console.log('【読込でない操作の Ctrl+Z は今まで通り(図面の設定は変えない)】');
{
  sb.applyProjectData(JSON.parse(JSON.stringify(D)));
  S().hist = []; S().redoHist = [];
  S().saveFileName = 'あとで変えた名前';
  move(); undo();
  ok(S().saveFileName === 'あとで変えた名前', '名前は戻さない');
  ok(!S().redoHist.some(h => h.doc) && !S().hist.some(h => h.doc), '図面の設定の控えは取らない');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
