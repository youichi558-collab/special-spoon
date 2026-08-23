// オートセーブの上書き保護のテスト
//   node tests/test_autosave_guard.js
//
// 【背景・2026-08-23】盛田さんの図面が全部消えた。調査の結果、原因の特定には
// 至らなかったが、autosave.js に致命的な欠陥が2つあることが判明した。
//   ①中身が空でも無条件に上書きしていた
//   ②保存先が1つしかなく、上書きされると前の版が残らない
// この2つが揃っていたため、「何らかの理由で画面が一瞬空になる → その状態で
// 自動保存が走る」だけで図面が完全に失われ、復旧不能になった。
// 実際、事故後の localStorage には ecad_autosave が 40586文字残っていたが、
// 中身は要素0・配線0だった(容量はカスタムシンボル等の付帯データ)。
//
// 【重要】この保護は「原因が何であれ被害を止める」ためのもの。消えた原因そのものは
// 別途特定が必要(未解決)。ここを直したから消えなくなる、ということではない。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

const src = fs.readFileSync(__dirname + '/../js/autosave.js', 'utf8');

// localStorage のスタブ
function makeLS(init) {
  const store = Object.assign({}, init);
  return {
    store,
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
}

const PAGE = (nEl, nWire) => ({
  elements: Array.from({ length: nEl }, (_, i) => ({ id: 'e' + i, type: 'fline' })),
  wires:    Array.from({ length: nWire }, (_, i) => ({ id: 'w' + i })),
  guides: [], groups: [],
});

function makeSandbox(pages, lsInit) {
  const ls = makeLS(lsInit);
  const hint = { textContent: '' };
  const sandbox = {
    console, localStorage: ls,
    state: {
      pages, currentPage: 0, zoom: 1, pan: { x:0, y:0 }, darkMode: false,
      saveFileName: '', customSymbols: [], customParts: [], hiddenBuiltinRefs: [],
      wireNoRule: {},
    },
    LAYERS: [],
    DEFS: {},
    _syncCurrentPage: () => {},
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    document: {
      getElementById: () => hint,
      addEventListener: () => {},
    },
    window: { addEventListener: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, ls, hint };
}

const countOf = (ls, key) => {
  const raw = ls.getItem(key);
  if (!raw) return null;
  const pages = JSON.parse(raw).pages || [];
  return pages.reduce((n, p) => n + p.elements.length + p.wires.length, 0);
};

// ------------------------------------------------------------------
console.log('【空のデータで、中身のある自動保存を上書きしない】');
console.log('  ← 今回の事故そのもの。これが無かったため復旧不能になった');
{
  // 既に中身のある自動保存がある状態で、空の図面を保存しようとする
  const good = JSON.stringify({ version:2, pages:[PAGE(12, 8)] });
  const { sandbox, ls, hint } = makeSandbox([PAGE(0, 0)], { ecad_autosave: good });
  sandbox.doAutosave();
  eq(countOf(ls, 'ecad_autosave'), 20, '既存の20個がそのまま保持される(空で潰れない)');
  ok(hint.textContent.includes('中止'), '中止した旨がヒントに出る');
}

console.log('【まだ何も保存されていなければ、空でも保存してよい】');
{
  const { sandbox, ls } = makeSandbox([PAGE(0, 0)], {});
  sandbox.doAutosave();
  eq(countOf(ls, 'ecad_autosave'), 0, '新規作業の初回は空でも保存される(保護対象が無い)');
}

console.log('【既存も空なら、空で上書きしてよい】');
{
  const empty = JSON.stringify({ version:2, pages:[PAGE(0, 0)] });
  const { sandbox, ls } = makeSandbox([PAGE(0, 0)], { ecad_autosave: empty });
  sandbox.doAutosave();
  eq(countOf(ls, 'ecad_autosave'), 0, '失うものが無いので通常どおり保存');
}

console.log('【中身があるときは普通に保存され、前の版が退避される】');
{
  const old = JSON.stringify({ version:2, pages:[PAGE(5, 0)] });
  const { sandbox, ls } = makeSandbox([PAGE(9, 3)], { ecad_autosave: old });
  sandbox.doAutosave();
  eq(countOf(ls, 'ecad_autosave'), 12, '新しい12個が保存される');
  eq(countOf(ls, 'ecad_autosave_prev'), 5, '前の版(5個)が退避される');
}

console.log('【1世代前への退避で、空だった前版は退避しない】');
{
  const emptyOld = JSON.stringify({ version:2, pages:[PAGE(0, 0)] });
  const { sandbox, ls } = makeSandbox([PAGE(7, 0)], { ecad_autosave: emptyOld });
  sandbox.doAutosave();
  eq(countOf(ls, 'ecad_autosave'), 7, '新しい版が保存される');
  ok(ls.getItem('ecad_autosave_prev') === null,
     '空の版は退避しない(空を退避しても復旧の役に立たない)');
}

console.log('【復元: 現行が空で前世代に中身があれば、前世代から復元する】');
{
  const emptyNow  = JSON.stringify({ version:2, pages:[PAGE(0, 0)] });
  const goodPrev  = JSON.stringify({ version:2, savedAt: Date.now(), pages:[PAGE(6, 2)] });
  const { sandbox, hint } = makeSandbox([], {
    ecad_autosave: emptyNow, ecad_autosave_prev: goodPrev,
  });
  sandbox.restoreAutosave();
  const n = sandbox.state.pages.reduce((a, p) => a + p.elements.length + p.wires.length, 0);
  eq(n, 8, '1世代前の8個が復元される');
  ok(hint.textContent.includes('1世代前'), '1世代前から復元した旨が伝わる');
}

console.log('【復元: 現行に中身があれば前世代は使わない】');
{
  const goodNow  = JSON.stringify({ version:2, savedAt: Date.now(), pages:[PAGE(4, 1)] });
  const oldPrev  = JSON.stringify({ version:2, pages:[PAGE(99, 0)] });
  const { sandbox, hint } = makeSandbox([], {
    ecad_autosave: goodNow, ecad_autosave_prev: oldPrev,
  });
  sandbox.restoreAutosave();
  const n = sandbox.state.pages.reduce((a, p) => a + p.elements.length + p.wires.length, 0);
  eq(n, 5, '現行の5個が復元される(古い前世代に戻らない)');
  ok(!hint.textContent.includes('1世代前'), '通常の復元メッセージになる');
}

console.log('【復元: 壊れたデータを削除せず退避する】');
{
  const { sandbox, ls } = makeSandbox([], { ecad_autosave: '{壊れたJSON' });
  sandbox.restoreAutosave();
  ok(ls.getItem('ecad_autosave_broken') === '{壊れたJSON',
     '壊れたデータは消さずに退避される(手作業で救える可能性を残す)');
}

// ------------------------------------------------------------------
console.log('【復元に失敗したら自動保存をロックする】');
console.log('  ← 事故の連鎖そのもの: 復元失敗 → 空の初期状態で起動 → 自動保存が上書き');
{
  // 保存済みデータはあるが、復元の途中で例外が出る状況を作る。
  // (DEFSを未定義にすると state.customSymbols.forEach(...DEFS...) で落ちる)
  const good = JSON.stringify({
    version:2, savedAt: Date.now(), pages:[PAGE(30, 10)], customSymbols:[{type:'x'}],
  });
  const { sandbox, ls, hint } = makeSandbox([PAGE(0,0)], { ecad_autosave: good });
  delete sandbox.DEFS;              // 復元途中で例外を起こす
  try { sandbox.restoreAutosave(); } catch (e) { /* boot.jsの_safeInit相当 */ }

  ok(sandbox.isAutosaveLocked(), '復元失敗でロックがかかる');

  // この状態で自動保存が走っても、保存済みデータは無傷でなければならない
  sandbox.state.pages = [PAGE(0, 0)];
  sandbox.doAutosave();
  eq(countOf(ls, 'ecad_autosave'), 40, '保存済みの40個が無傷で残る(上書きされない)');
  ok(hint.textContent.includes('停止'), '自動保存を停止している旨が伝わる');
}

console.log('【復元に成功したらロックは解除される】');
{
  const good = JSON.stringify({
    version:2, savedAt: Date.now(), pages:[PAGE(6, 2)], customSymbols:[],
  });
  const { sandbox, ls } = makeSandbox([], { ecad_autosave: good });
  sandbox.restoreAutosave();
  ok(!sandbox.isAutosaveLocked(), '正常復元後はロックされていない');

  sandbox.doAutosave();               // 通常どおり保存できること
  eq(countOf(ls, 'ecad_autosave'), 8, '復元後の自動保存は通常どおり動く');
}

console.log('【保存データが無い新規起動ではロックしない】');
{
  const { sandbox, ls } = makeSandbox([PAGE(0,0)], {});
  sandbox.restoreAutosave();
  ok(!sandbox.isAutosaveLocked(), '救うものが無いのでロックしない');
  sandbox.doAutosave();
  ok(ls.getItem('ecad_autosave') !== null, '新規作業の自動保存は普通に動く');
}

console.log('【保存データが壊れていてもロックする】');
{
  const { sandbox, ls } = makeSandbox([PAGE(0,0)], { ecad_autosave: '{壊れたJSON' });
  sandbox.restoreAutosave();
  // 壊れていて中身が数えられない場合、_asStoredCountは-1を返す。
  // 「失うものが無い」とは断定できないので、安全側に倒れているか確認する。
  const locked = sandbox.isAutosaveLocked();
  const kept = ls.getItem('ecad_autosave_broken');
  ok(kept === '{壊れたJSON', '壊れたデータは退避される');
  ok(!locked, '数えられない破損データは退避済みなのでロック不要');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
