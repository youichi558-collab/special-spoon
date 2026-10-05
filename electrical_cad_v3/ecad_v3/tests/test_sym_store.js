// 登録シンボルの置き場所(js/sym_store.js)のテスト
//   node tests/test_sym_store.js
//
// 【背景・2026-10-03 再設計の段階3】
// 登録シンボルはブラウザの中(localStorage)が正で、図面にはパレットが丸ごと入っていた。
// ライブラリフォルダの symbols.json を正にし、図面には使ったシンボルだけを入れる形にした。
// 図面とライブラリで違うときは、2026-10-05 から**登録シンボル(ライブラリ)を使う=シンボルは1つ**(盛田さん「アじゃないか？」。10-03 の決定(3)「図面の中が正」を改めた)。
// 登録シンボルが読めないときだけ図面の中を使う。
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

console.log('【パレットの中身と並び・登録シンボルが正(2026-10-05)】');
{
  const sb = load({
    lib: { L1: sym('L1', 10), D1: sym('D1', 10) },
    drawing: { D1: sym('D1', 99), D2: sym('D2', 5), D3: sym('D3', 5) },
    legacy: [sym('L1', 1), sym('OLD', 3), sym('MOVED', 4)], migrated: ['MOVED'],
    pages: [{ elements: [{ type: 'D1' }, { type: 'D3' }] }],
  });
  sb.rebuildSymbolPalette();
  eq(types(sb), ['L1', 'D1', 'D3'], '★登録シンボル(その順)＋図面に置いてある未登録だけ(置いていない写し D2・旧データ OLD は出さない。欠陥3 2026-10-05)');
  eq(sb.state.customSymbols.find(s => s.type === 'D1').w, 10, '★同じ type は登録シンボルを使う(シンボルは1つ。2026-10-05)');
  eq(sb.state.customSymbols.find(s => s.type === 'L1').w, 10, 'ライブラリにあるものは旧データよりライブラリ');
  ok(!types(sb).includes('MOVED'), '★ライブラリへ移した旧データは出さない(ライブラリから消した後に復活しない)');
  ok(sb.DEFS.D1 && sb.DEFS.D1.w === 10, '描くときの定義(DEFS)も登録シンボル');
  {
    const sb2 = load({ lib: { D1: sym('D1', 10) }, ready: false, drawing: { D1: sym('D1', 99), D2: sym('D2', 5) }, legacy: [sym('OLD', 3), sym('MOVED', 4)], migrated: ['MOVED'] });
    sb2.rebuildSymbolPalette();
    eq(sb2.state.customSymbols.find(s => s.type === 'D1').w, 99, '★登録シンボルが読めないときは図面の中を使う');
    eq(types(sb2), ['D1', 'D2', 'OLD'], '読めないときは図面の写し全部とまだ移していない旧データも出す(作業を止めない)');
  }
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
  await sb.symStorePut([sym('U', 2)]);
  ok(!('U' in sb._lib.data), '★登録の画面以外(端子の編集・サイズ調整・置き直し)では、登録シンボルに無いものを登録しない(欠陥4)');
  await sb.symStorePut([sym('N', 2)], { register: true });
  eq(Object.keys(sb._lib.data), ['A', 'N'], '★登録の画面からの新しいものはライブラリの末尾へ');
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
     [['A', false, ['形', '大きさ'], false, 1], ['C', false, ['端子の位置'], true, 2]],
     '★違い(形・大きさ・端子の位置)・置いた数を出す。置いていない写し(X)は出さない(消したものを生き返らせない。欠陥3)');
  sb.state.pages[0].elements.push({ id: 'e9', type: 'X' });
  eq(sb.symDiffList().find(r => r.type === 'X').what, ['登録シンボルに無い'], '置いてあれば「登録シンボルに無い」として出す');
  sb.state.pages[0].elements.pop();
  eq(sb.shown || 0, 0, '★比べただけでは窓を出さない(開いたときも出さない)');
  await sb.symApplyChoices(['C'], ['A', 'X']);
  eq([sb._lib.data.A.w, !!sb._lib.data.X, !!sb._lib.data.B], [20, true, true], '★「登録シンボルを図面に合わせる/足す」は選んだものだけ登録シンボルへ(他は残す)');
  eq([sb.state.drawingSymbols.C.terminals[0].y, sb.state.pages[0].dirty], [0, true], '★「図面を登録シンボルに合わせる」は図面の中のシンボルを置き換え、未保存にする');
  ok(sb.state.drawingSymbols.C !== sb._lib.data.C, '図面には登録シンボルの写しを入れる(同じ物を共有しない)');
  eq(sb.symDiffList(), [], '合わせたあとは違いが無い');
  // 端子の位置が変わる記号の確認(端子の編集・サイズ調整の前)
  const cs = []; sb.confirm = m => { cs.push(m); return false; };
  sb.state.pages = [{ name: 'P', elements: [{ id: 'e1', type: 'C' }, { id: 'e2', type: 'C' }] }];
  sb.pidxState = { index: { files: { 'Q.seqzu': { pages: [{ devs: [{ type: 'C' }] }] }, 'R.seqzu': { pages: [{ devs: [{ type: 'Z' }] }] } } } };
  const symConfirmTermMove = vm.runInContext('symConfirmTermMove', sb);
  eq(symConfirmTermMove('C', C, [{ x: 0, y: 0 }]), true, '端子の位置が変わらなければ聞かない');
  eq(symConfirmTermMove('C', C, [{ x: 0, y: 5 }]), false, '★端子の位置が変わるなら確かめる(やめたら変えない)');
  ok(/開いている図面に 2 個、プロジェクトのほかの図面 1 枚/.test(cs[0] || ''), '★使っている数(開いている図面の記号・台帳のほかの図面)を見せる');
  const ed = read('js/edit.js'), lb = read('js/library.js'), html = read('index.html');
  ok(/symMovedNotice\(state\.drawingSymbols\)/.test(ed) && /symMovedNotice\(state\.drawingSymbols\)/.test(lb), '★開いたとき・登録シンボルを読んだときに、端子の位置が変わった記号を知らせる');
  ok(/symMovedNotice\(fileSyms, pg => newPages\.includes\(pg\)\)/.test(ed), 'ページとして足したときも、足したページの分を知らせる');
  ok(/symConfirmTermMove\(_peType, cS, _peTerms\)/.test(read('js/pin_editor.js')) && /symConfirmTermMove\(type, sym,/.test(read('js/ui.js')), '端子の編集・サイズ調整の前に確かめる');
  ok(!/checkDrawingSymbolsVsLibrary/.test(ed + lb + read('js/sym_store.js')), '★図面を開いたとき・ライブラリを読んだときに比べて窓を出す処理は無い');
  ok(/onclick="symCompareDialog\(\)"[^>]*>🔍 登録シンボルと比べる/.test(html), 'シンボルパネルに「登録シンボルと比べる」');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
