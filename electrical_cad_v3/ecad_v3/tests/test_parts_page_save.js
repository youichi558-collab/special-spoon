// 部品DB単独画面(parts.html)の保存(saveAll)のテスト
//   node tests/test_parts_page_save.js
//
// 【背景・2026-09-03】
// js/parts_page.js の saveAll() は js/parts_db.js の writeToServer() と
// 同じ /api/parts/save を叩く別実装（単独画面は parts_db.js を使わない設計。
// 理由はHANDOFF.md参照）。書き手が2箇所に分かれた以上、Stage 1で
// writeToServer() に足した不変条件(tests/test_parts_db_server_mode.js)が
// こちらにも同じ形で効いているかを別途見ておく必要がある。
//
// このテストは js/parts_page.js を実際に実行して saveAll() を呼び、
//   1. 通常保存できる
//   2. 件数激減時は確認し、OKならforceを立てて1回だけ送り直す
//   3. 確認でキャンセルしたら送り直さない(ロックもしない=次の保存は普通に試せる)
//   4. 保存に失敗したら以後の保存をロックする(サーバーへ送らない)
//   5. サーバーに繋がらない(fetch例外)ときもロックする
//   6. 保存できていないのに true を返さない
// を見る。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const SRC = fs.readFileSync(__dirname + '/../js/parts_page.js', 'utf8');

const mkParts = n => Array.from({ length: n }, (_, i) => ({ ref: 'P' + i, maker: 'M' }));

function load({ routes = {}, initialParts = [], confirmAnswer = true } = {}) {
  const calls = [];
  const sandbox = {
    console,
    state: { customParts: initialParts, hiddenBuiltinRefs: [] },
    document: { getElementById: () => null },
    localStorage: { getItem: () => null, setItem: () => {} },
    window: { addEventListener: () => {} },
    escH: s => String(s == null ? '' : s),
    _banners: [],
    showTopBanner: (id, msg) => { sandbox._banners.push(msg); },
    confirm: () => confirmAnswer !== false,
    BUILTIN_PARTS: [],
    PART_TYPE_ORDER: [], PART_TYPE_LABELS: {}, PART_TYPE_CODES: [], LEGACY_PART_TYPES: {},
    fetch: async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      calls.push({ url, method: (opts && opts.method) || 'GET', body });
      let r = routes[url];
      if (typeof r === 'function') r = r(body, calls);
      if (r === undefined) throw new Error('route なし: ' + url);
      if (r instanceof Error) throw r;
      return { json: async () => r };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  sandbox.saveAll = vm.runInContext('saveAll', sandbox);
  sandbox.calls = calls;
  return sandbox;
}

const SAVED = { available: true, ok: true, count: 3, path: 'I:\\...\\parts_db.json', backup: '' };

(async () => {

// ------------------------------------------------------------------
console.log('【通常保存】');
{
  const s = load({ routes: { '/api/parts/save': SAVED }, initialParts: mkParts(3) });
  eq(await s.saveAll(), true, '保存できたら true');
  eq(s.calls.length, 1, '1回だけ送る');
  eq(s.calls[0].body.customParts.length, 3, '送っているのは現在の部品DB');
  eq(s._banners[s._banners.length - 1], '', '成功したらバナーを消す');
}

// ------------------------------------------------------------------
console.log('\n【件数が激減したら、確認せずに書かない】');
{
  const drop = { available: true, ok: false, reason: 'drop', prev: 605, now: 3,
                path: 'I:\\...\\parts_db.json', error: '件数が減っています' };
  const routes = {
    '/api/parts/save': body => (body.force ? { ...SAVED, backup: 'parts_db_backup_x.json' } : drop),
  };

  // OKと答えたとき: forceを立てて1回だけ送り直す
  const s = load({ routes, confirmAnswer: true, initialParts: mkParts(3) });
  eq(await s.saveAll(), true, '人がOKなら保存する');
  eq(s.calls.map(c => !!c.body.force), [false, true], '★2回目だけforceを立てて送る');

  // キャンセルしたとき: 送り直さない。ロックもしない(次の保存は普通に試せる)
  const s2 = load({ routes, confirmAnswer: false, initialParts: mkParts(3) });
  eq(await s2.saveAll(), false, '人がキャンセルしたら false');
  eq(s2.calls.length, 1, '★送り直さない(ファイルは無傷)');
  eq(await s2.saveAll(), false, 'まだ件数は減ったまま(同じ応答)');
  eq(s2.calls.length, 2, '★ロックしていないので次の保存も普通にサーバーへ送る');
}

// ------------------------------------------------------------------
console.log('\n【保存に失敗したら、以後の保存をロックする】');
{
  const s = load({ routes: { '/api/parts/save': { available: true, ok: false, error: '書けません' } },
                   initialParts: mkParts(3) });
  eq(await s.saveAll(), false, '★falseを返す(呼び出し側が成功と誤認しない)');
  ok(s._banners.some(b => /書けません/.test(b)), '原因をバナーで案内する');

  s.calls.length = 0;
  eq(await s.saveAll(), false, 'ロック中もfalse');
  eq(s.calls.length, 0, '★ロック中はサーバーへ送らない');
}

// ------------------------------------------------------------------
console.log('\n【サーバーに繋がらないときも、以後の保存をロックする】');
{
  const s = load({ routes: { '/api/parts/save': new Error('接続できません') },
                   initialParts: mkParts(3) });
  eq(await s.saveAll(), false, '接続できなければ false');
  ok(s._banners.some(b => /届きません/.test(b)), 'ファイルは無傷である旨を案内する');

  s.calls.length = 0;
  eq(await s.saveAll(), false, 'ロック中もfalse');
  eq(s.calls.length, 0, '★ロック中はサーバーへ送らない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
