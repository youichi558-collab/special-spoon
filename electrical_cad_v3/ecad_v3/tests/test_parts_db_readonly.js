// 部品DBを読むだけになったCAD側(js/parts_db.js)のテスト
//   node tests/test_parts_db_readonly.js
//
// 【背景・2026-09-03】
// 部品DBの書き手はCADから部品DB単独画面(parts.html)へ一本化した。
// CAD側の js/parts_db.js は File System Access API 経由の直接読み書きを
// 丸ごと廃止し、ローカルサーバー(start.bat)経由で読むだけになった
// (書き込み関連の不変条件は tests/test_parts_page_save.js が見ている)。
//
// このテストは js/parts_db.js を実際に実行して、
//   1. サーバーから読めたら接続済みになる(hasFile()==true)
//   2. サーバーに繋がらない・読めないときは接続済みにならず、案内が出る
//   3. 図面ファイルに古い形式で埋め込まれていたcustomPartsを、
//      サーバーの内容とマージして捨てない(Stage 1以前の図面との互換)
// を見る。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const SRC = fs.readFileSync(__dirname + '/../js/parts_db.js', 'utf8');
const BANNER_SRC = (() => {
  const m = fs.readFileSync(__dirname + '/../js/state.js', 'utf8')
    .match(/function showTopBanner\([\s\S]*?\n\}/);
  if (!m) throw new Error('js/state.js に showTopBanner が見つかりません');
  return m[0];
})();
const mkParts = n => Array.from({ length: n }, (_, i) => ({ ref: 'P' + i, maker: 'M' }));

function load({ routes = {}, initialParts = [] } = {}) {
  const calls = [];
  const sandbox = {
    console,
    state: { customParts: initialParts, hiddenBuiltinRefs: [] },
    document: {
      querySelectorAll: () => [],
      getElementById: () => sandbox._banner || null,
      createElement: () => ({ style: {}, id: '', textContent: '', setAttribute() {},
                              remove() { sandbox._banner = null; } }),
      body: { appendChild: el => { sandbox._banner = el; } },
    },
    window: {},
    // 【2026-09-21】autoRestore が失敗時にやり直すようになり、待ちに
    // setTimeout を使う。テストでは待たずに即やり直させる(本番の待ち時間
    // 1.5+3+6秒をそのまま待つとテストが遅くなるだけで、確かめたいのは
    // 「やり直した末にどうなるか」なので)。
    setTimeout: (fn) => { fn(); return 0; },
    renderPartsAll: () => {},
    fetch: async url => {
      calls.push(url);
      let r = routes[url];
      if (typeof r === 'function') r = r();
      if (r === undefined) throw new Error('route なし: ' + url);
      if (r instanceof Error) throw r;
      return { json: async () => r };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(BANNER_SRC, sandbox);
  vm.runInContext(SRC, sandbox);
  sandbox.partsDb = vm.runInContext('partsDb', sandbox);
  sandbox.calls = calls;
  return sandbox;
}

const STATS_OK = { available: true, path: 'I:\\マイドライブ\\claude\\parts_db.json' };
const ALL_OK = n => ({ ok: true, customParts: mkParts(n), hiddenBuiltinRefs: [] });

(async () => {

// ------------------------------------------------------------------
console.log('【サーバーから読めたら接続済みになる】');
{
  const s = load({ routes: { '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK(605) } });
  await s.partsDb.autoRestore();
  ok(s.partsDb.hasFile(), 'hasFile() が真になる');
  eq(s.state.customParts.length, 605, 'サーバーの605件が読める');
  eq(s.partsDb.saveMode(), 'server', '経路は server');
  eq(s.partsDb.savePath(), STATS_OK.path, 'パスが取れる');
  eq(s.partsDb.partsCount(), 605, '件数が取れる');
  ok(!s._banner, '正常時はバナーを出さない');
}

// ------------------------------------------------------------------
console.log('\n【サーバーに繋がらない(start.batを起動していない)】');
{
  const s = load({ routes: { '/api/parts/stats': new Error('接続できません') } });
  await s.partsDb.autoRestore();
  ok(!s.partsDb.hasFile(), '★接続済みにならない(図面側への退避が働く)');
  eq(s.state.customParts.length, 0, '部品DBは読み込まれない');
  ok(s._banner && /接続できません/.test(s._banner.textContent), '接続できないことを画面で知らせる');
  ok(/部品DBを開く\.bat/.test(s._banner.textContent), '編集は単独画面で行う案内がある');
}

// ------------------------------------------------------------------
console.log('\n【部品DB機能が導入されていない環境】');
{
  const s = load({ routes: { '/api/parts/stats': { available: false } } });
  await s.partsDb.autoRestore();
  ok(!s.partsDb.hasFile(), '接続済みにならない');
}

// ------------------------------------------------------------------
console.log('\n【/api/parts/all が失敗する(部品DBの場所が壊れている等)】');
{
  const s = load({ routes: {
    '/api/parts/stats': STATS_OK,
    '/api/parts/all': { ok: false, error: '部品DBの場所が未設定です' },
  } });
  await s.partsDb.autoRestore();
  ok(!s.partsDb.hasFile(), '接続済みにならない');
  ok(s._banner && /部品DBの場所が未設定です/.test(s._banner.textContent), '理由が画面に出る');
}

// ------------------------------------------------------------------
console.log('\n【図面ファイルに古い形式で埋め込まれていたcustomPartsを捨てない】');
{
  // Stage 1以前の図面ファイルには customParts が直接埋め込まれていた。
  // 読み込み時にそれが state.customParts に載っている状態で autoRestore が走る。
  const s = load({ routes: { '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK(3) },
                   initialParts: [{ ref: 'ONLY_EMBEDDED' }, { ref: 'P0' }] });
  await s.partsDb.autoRestore();
  // サーバーの3件(P0,P1,P2) + 埋め込みにしかない ONLY_EMBEDDED の4件。P0は重複しない。
  eq(s.state.customParts.length, 4, 'サーバーの3件＋埋め込み1件(重複するP0は除く)');
  ok(s.state.customParts.some(p => p.ref === 'ONLY_EMBEDDED'), '★埋め込み分が残っている');
  eq(s.state.customParts.filter(p => p.ref === 'P0').length, 1, 'P0は重複しない');
  ok(s._banner && /1 件があります/.test(s._banner.textContent), '古い図面ファイル分があることを知らせる');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
