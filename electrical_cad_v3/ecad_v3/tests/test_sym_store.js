// 登録シンボルの置き場所(js/sym_store.js)のテスト
//   node tests/test_sym_store.js
//
// 【背景・2026-10-03 再設計の段階3】
// 登録シンボルはブラウザの中(localStorage)が正で、図面にはパレットが丸ごと入っていた。
// ライブラリフォルダの symbols.json を正にし、図面には使ったシンボルだけを入れる形にした。
// 図面とライブラリで違うときは**図面の中を使い**、知らせて「ライブラリへ反映／そのまま」を選ぶ(盛田さんの決定(3))。
//
// このテストが守るもの:
//   1. パレット = ライブラリ(ライブラリの順)＋図面の中＋まだ移していないブラウザの旧データ。同じ type は図面の中
//   2. 図面に入れるのは使っているシンボルだけ。保存4経路とも
//   3. 登録・変更・削除・並べ替えはライブラリへ。読めていない間はブラウザの中へ(移す対象に戻す)
//   4. 使っているシンボルをライブラリから消しても、図面の中には残る(置いた要素が描けなくならない)
//   5. 違いの判定はプレビュー画像やキーの順の違いでは反応しない。同じ違いは1度だけ聞く

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const read = p => fs.readFileSync(__dirname + '/../' + p, 'utf8').replace(/\r\n/g, '\n');

const sym = (type, w, extra) => Object.assign({ type, name: type, label: type, cat: 'c', role: '', w, h: 10,
  shapes: [{ t: 'L', x1: 0, y1: 0, x2: w, y2: 0 }], terminals: [{ x: 0, y: 0, label: '1' }] }, extra || {});

function load({ lib = {}, ready = true, legacy = [], migrated = [], pages = [], drawing = {} }) {
  const store = { ecad_customSymbols: JSON.stringify(legacy) };
  const els = {};
  const saves = [];
  const libState = { data: lib };
  const sb = {
    console, DEFS: {}, alerts: [],
    state: { pages, customSymbols: [], drawingSymbols: drawing },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    alert: m => sb.alerts.push(m),
    escH: s => String(s),
    showTopBanner: (id, m) => { sb.banner = m; },
    document: {
      body: { appendChild: el => { els[el.id] = el; sb.shown = (sb.shown || 0) + 1; } },
      createElement: () => ({ style: {}, remove() { delete els[this.id]; } }),
      getElementById: id => els[id] || (els[id] = { set onclick(f) { this._click = f; } }),
    },
    ecadLib: {
      isReady: () => ready,
      get: () => libState.data,
      save: async (k, data) => { saves.push(data); libState.data = data; sb.rebuildSymbolPalette(); return { ok: true }; },
      resetMigrationSkip() {},
      migrated: () => new Set(sb._migrated),
      unmarkMigrated: (k, keys) => { sb._migrated = sb._migrated.filter(x => !keys.includes(x)); },
    },
    _migrated: migrated.slice(),
    setTimeout: fn => fn(),
    _els: els, _store: store, _saves: saves, _lib: libState,
  };
  vm.createContext(sb);
  vm.runInContext(read('js/sym_store.js'), sb);
  ['rebuildSymbolPalette', 'usedSymbolsForSave', 'symStorePut', 'symStoreDelete', 'symStoreReorder',
   'symDiffList', 'symApplyChoices', 'symCompareDialog', 'setDrawingSymbols'].forEach(n => { sb[n] = vm.runInContext(n, sb); });
  return sb;
}
const types = sb => sb.state.customSymbols.map(s => s.type);

(async () => {

console.log('【パレットの中身と並び・図面の中が正】');
{
  const sb = load({
    lib: { L1: sym('L1', 10), D1: sym('D1', 10) },
    drawing: { D1: sym('D1', 99), D2: sym('D2', 5) },
    legacy: [sym('L1', 1), sym('OLD', 3), sym('MOVED', 4)], migrated: ['MOVED'],
  });
  sb.rebuildSymbolPalette();
  eq(types(sb), ['L1', 'D1', 'D2', 'OLD'], '★ライブラリ(ライブラリの順)→図面にだけある→まだ移していない旧データ');
  eq(sb.state.customSymbols.find(s => s.type === 'D1').w, 99, '★同じ type はライブラリではなく図面の中を使う(決定(3))');
  eq(sb.state.customSymbols.find(s => s.type === 'L1').w, 10, 'ライブラリにあるものは旧データよりライブラリ');
  ok(!types(sb).includes('MOVED'), '★ライブラリへ移した旧データは出さない(ライブラリから消した後に復活しない)');
  ok(sb.DEFS.D1 && sb.DEFS.D1.w === 99, '描くときの定義(DEFS)も図面の中のもの');
}

console.log('\n【図面に入れるのは使っているシンボルだけ】');
{
  const sb = load({ lib: { A: sym('A', 1), B: sym('B', 1) }, pages: [{ elements: [{ type: 'A' }, { type: 'line' }] }] });
  sb.rebuildSymbolPalette();
  eq(sb.usedSymbolsForSave(sb.state.pages).map(s => s.type), ['A'], '★使っている A だけ(以前はパレット丸ごと)');
  const saves = [
    ['js/edit.js(1ページ保存)', /customSymbols:\s*usedSymbolsForSave\(pages\)/.test(read('js/edit.js')) && /_saveData\(pages, state\.saveFileName\)/.test(read('js/edit.js'))],
    ['js/edit.js(全ページ保存)', /customSymbols:\s*usedSymbolsForSave\(pages\)/.test(read('js/edit.js')) && /_saveData\(state\.pages/.test(read('js/edit.js'))],
    ['js/autosave.js(自動保存)', /customSymbols:[^\n]*usedSymbolsForSave\(state\.pages\)/.test(read('js/autosave.js'))],
    ['js/backup.js(バックアップ)', /customSymbols:[^\n]*usedSymbolsForSave\(state\.pages\)/.test(read('js/backup.js'))],
  ];
  saves.forEach(([n, hit]) => ok(hit, '保存の経路: ' + n));
}

console.log('\n【登録・変更・並べ替え・削除はライブラリへ】');
{
  const sb = load({ lib: { A: sym('A', 1) }, pages: [{ elements: [{ type: 'A' }] }] });
  sb.rebuildSymbolPalette();
  await sb.symStorePut([sym('N', 2)]);
  eq(Object.keys(sb._lib.data), ['A', 'N'], '★新しいものはライブラリの末尾へ');
  eq(types(sb), ['A', 'N'], 'パレットにも出る');
  await sb.symStorePut([sym('A', 7)]);
  eq(sb._lib.data.A.w, 7, '変更(サイズ調整・端子の編集)はライブラリの同じ type を置き換える');
  sb.state.customSymbols.reverse();
  await sb.symStoreReorder();
  eq(Object.keys(sb._lib.data), ['N', 'A'], '★並べ替えはライブラリの順になる');
  await sb.symStoreDelete('N');
  eq(Object.keys(sb._lib.data), ['A'], '使っていないものはライブラリから消え');
  ok(!types(sb).includes('N'), 'パレットからも消える');
  await sb.symStoreDelete('A');
  eq(Object.keys(sb._lib.data), [], '使っているものもライブラリからは消える');
  ok(types(sb).includes('A'), '★図面で使っているので図面の中には残る(置いた要素が描けなくならない)');
  ok(read('js/ui.js').indexOf("localStorage.setItem('ecad_customSymbols'") < 0, 'ui.js がブラウザの中へ直接書く経路は無い');
}

console.log('\n【ライブラリが読めていない間はブラウザの中へ(移す対象に戻す)】');
{
  const sb = load({ ready: false, legacy: [sym('M', 1)], migrated: ['M'] });
  ok(await sb.symStorePut([sym('M', 5), sym('Z', 1)]), '保存できた');
  const arr = JSON.parse(sb._store.ecad_customSymbols);
  eq(arr.map(s => [s.type, s.w]), [['M', 5], ['Z', 1]], '★ブラウザの中(旧置き場所)に保存する');
  ok(!sb._migrated.includes('M'), '★直したものは「移す対象」に戻す(次にライブラリが読めたら移せる)');
  ok(/ライブラリ/.test(sb.banner || ''), 'ライブラリではなくブラウザの中に保存したと帯で知らせる');
  eq(sb._saves.length, 0, 'ライブラリへは送らない');
}

console.log('\n【図面と登録シンボルの違い(2026-10-05 開いたときは聞かない・押したときだけ比べる)】');
{
  const base = sym('A', 10);
  const C = sym('C', 5, { terminals: [{ x: 0, y: 0, label: '1' }] });
  const sb = load({ lib: { A: base, B: sym('B', 1), C } });
  // プレビュー画像とキーの順だけ違う → 違いとみなさない
  const same = JSON.parse(JSON.stringify({ preview: 'data:other', terminals: base.terminals, shapes: base.shapes, h: base.h, w: base.w,
    role: '', cat: 'c', label: 'A', name: 'A', type: 'A' }));
  sb.setDrawingSymbols([same]);
  eq(sb.symDiffList(), [], '★プレビュー画像やキーの順だけの違いは違いにしない');
  const C2 = sym('C', 5, { terminals: [{ x: 0, y: 2, label: '1' }] });
  sb.state.pages = [{ name: 'P', elements: [{ id: 'e1', type: 'C' }, { id: 'e2', type: 'C' }, { id: 'e3', type: 'A' }] }];
  sb.setDrawingSymbols([sym('A', 20), sym('X', 3), C2]);
  const L = sb.symDiffList();
  eq(L.map(r => [r.type, r.missing, r.what, r.termsMoved, r.placed]),
     [['A', false, ['形', '大きさ'], false, 1], ['X', true, ['登録シンボルに無い'], false, 0], ['C', false, ['端子の位置'], true, 2]],
     '★違い(形・大きさ・端子の位置)・登録シンボルに無いもの・置いた数を出す');
  eq(sb.shown || 0, 0, '★比べただけでは窓を出さない(開いたときも出さない)');
  await sb.symApplyChoices(['C'], ['A', 'X']);
  eq([sb._lib.data.A.w, !!sb._lib.data.X, !!sb._lib.data.B], [20, true, true], '★「登録シンボルを図面に合わせる/足す」は選んだものだけ登録シンボルへ(他は残す)');
  eq([sb.state.drawingSymbols.C.terminals[0].y, sb.state.pages[0].dirty], [0, true], '★「図面を登録シンボルに合わせる」は図面の中のシンボルを置き換え、未保存にする');
  ok(sb.state.drawingSymbols.C !== sb._lib.data.C, '図面には登録シンボルの写しを入れる(同じ物を共有しない)');
  eq(sb.symDiffList(), [], '合わせたあとは違いが無い');
  const ed = read('js/edit.js'), lb = read('js/library.js'), html = read('index.html');
  ok(!/checkDrawingSymbolsVsLibrary/.test(ed + lb + read('js/sym_store.js')), '★図面を開いたとき・ライブラリを読んだときに比べて窓を出す処理は無い');
  ok(/onclick="symCompareDialog\(\)"[^>]*>🔍 登録シンボルと比べる/.test(html), 'シンボルパネルに「登録シンボルと比べる」');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
