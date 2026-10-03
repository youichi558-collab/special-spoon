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
   'checkDrawingSymbolsVsLibrary', 'setDrawingSymbols'].forEach(n => { sb[n] = vm.runInContext(n, sb); });
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
    ['js/edit.js(1ページ保存)', /customSymbols:\s*usedSymbolsForSave\(\[pg\]\)/.test(read('js/edit.js'))],
    ['js/edit.js(全ページ保存)', /customSymbols:\s*usedSymbolsForSave\(state\.pages\)/.test(read('js/edit.js'))],
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

console.log('\n【図面とライブラリの違いを知らせる】');
{
  const base = sym('A', 10);
  const sb = load({ lib: { A: base, B: sym('B', 1) } });
  // プレビュー画像とキーの順だけ違う → 違いとみなさない
  const same = JSON.parse(JSON.stringify({ preview: 'data:other', terminals: base.terminals, shapes: base.shapes, h: base.h, w: base.w,
    role: '', cat: 'c', label: 'A', name: 'A', type: 'A' }));
  sb.setDrawingSymbols([same]);
  sb.checkDrawingSymbolsVsLibrary();
  ok(!sb._els['sym-diff'], '★プレビュー画像やキーの順だけの違いでは聞かない');
  sb.setDrawingSymbols([sym('A', 20), sym('X', 3)]);
  sb.checkDrawingSymbolsVsLibrary();
  const ov = sb._els['sym-diff'];
  ok(ov && /違う 1件: A/.test(ov.innerHTML) && /ライブラリに無い 1件: X/.test(ov.innerHTML), '★形が違う A・ライブラリに無い X を挙げる');
  await sb._els['sym-diff-apply']._click();
  eq([sb._lib.data.A.w, !!sb._lib.data.X, !!sb._lib.data.B], [20, true, true], '★「ライブラリへ反映」で図面の中のものを保存(他は残す)');
  sb._lib.data = { A: base };   // 同じ図面で、また同じ違いになった
  const n0 = sb.shown;
  sb.checkDrawingSymbolsVsLibrary();
  eq(sb.shown, n0, '★同じ違いは同じ図面で何度も聞かない');
  sb.setDrawingSymbols([sym('A', 20), sym('X', 3)]);   // 図面を開き直した
  sb.checkDrawingSymbolsVsLibrary();
  eq(sb.shown, n0 + 1, '図面を開き直したらまた聞く');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
