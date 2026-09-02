// 部品DBの保存をサーバー経由にした部分のテスト
//   node tests/test_parts_db_server_mode.js
//
// 【背景・2026-09-02】
// 部品DB(parts_db.json)は、CADがブラウザの File System Access API で書いていた。
// その許可はページを開くたびに下りるとは限らず、下りなかった回の保存が
// 静かに空振りする —— これが2026-09-01に約440型番が欠落した事故の根本だった。
//
// そこで書き手を server.py 側へ移した(Stage 1)。ブラウザの許可を通らないので、
// 「許可が下りずに保存できない」状態がこの経路では起こり得ない。
//
// ただし移したことで作ってはいけないものが2つある:
//   1. 回帰。setpath をしていない環境・サーバー無しでファイルを直接開いている
//      環境では、今まで通り File System Access API で保存できなければならない。
//   2. 書き手が2つになること。サーバーとブラウザが同時に同じファイルへ書くと、
//      どちらかの書き込みが黙って失われる。CADは起動時にどちらか一方だけを選ぶ。
//
// このテストは js/parts_db.js を実際に実行して、その2つを見る。
// 「保存できていないのに true を返さないか」も併せて確認する
// (呼び出し側の catalogResetPartsDb がこの戻り値だけを見て成功を伝えるため)。

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

// 偽のファイルハンドル(従来のFile System Access API経路の確認用)。
// 使われたかどうかを数えて、サーバー経由のときに触っていないことを見る。
function makeHandle(content) {
  const h = {
    name: 'parts_db.json', content, writes: 0, reads: 0,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFile: async () => { h.reads++; return { text: async () => h.content }; },
    createWritable: async () => {
      h.content = '';
      return { write: async t => { h.content = t; }, close: async () => { h.writes++; } };
    },
  };
  return h;
}

// routes: { '/api/parts/stats': 応答 or 関数, ... }。
// 応答が Error なら投げる(=サーバーが居ない・落ちた状況)。
function load({ routes = {}, handle = null, initialParts = [], confirmAnswer = true } = {}) {
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
    alert: () => {},
    confirm: () => confirmAnswer !== false,
    setTimeout, clearTimeout,
    indexedDB: {
      open: () => {
        const req = {};
        setTimeout(() => req.onsuccess({ target: { result: {
          transaction: () => ({ objectStore: () => ({
            get: () => { const r = {};
              setTimeout(() => { r.result = handle; r.onsuccess(); }, 0);
              return r; },
            put: () => {},
          }) }),
        } } }), 0);
        return req;
      },
    },
    renderPartsAll: () => {},
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
  vm.runInContext(BANNER_SRC, sandbox);
  vm.runInContext(SRC, sandbox);
  sandbox.partsDb = vm.runInContext('partsDb', sandbox);
  sandbox.calls = calls;
  return sandbox;
}
const tick = () => new Promise(r => setTimeout(r, 20));

const STATS_OK = { available: true, ok: true, writable: true, source: 'path',
                   count: 3, path: 'I:\\マイドライブ\\claude\\parts_db.json' };
const ALL_OK = { ok: true, customParts: mkParts(3), hiddenBuiltinRefs: [] };
const SAVED = { available: true, ok: true, count: 3, path: STATS_OK.path, backup: '' };

(async () => {

// ------------------------------------------------------------------
console.log('【setpath 済みなら、保存はサーバー経由になる】');
{
  const h = makeHandle(JSON.stringify({ customParts: mkParts(99), hiddenBuiltinRefs: [] }));
  const s = load({ routes: { '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
                             '/api/parts/save': SAVED }, handle: h });
  await s.partsDb.autoRestore();
  await tick();
  eq(s.partsDb.saveMode(), 'server', 'サーバー経由になる');
  eq(s.state.customParts.length, 3, 'サーバーから読んだ内容が入る');
  eq(h.reads, 0, '★ブラウザ側のファイルは読まない(サーバーの内容と混ざらない)');
  ok(s.partsDb.hasFile(), 'hasFile() は真（図面ファイルに部品DBを埋め込まない）');

  eq(await s.partsDb.writeNow(), true, '保存できたら true');
  const posts = s.calls.filter(c => c.method === 'POST');
  eq(posts.map(c => c.url), ['/api/parts/save'], '保存はサーバーへ送る');
  eq(posts[0].body.customParts.length, 3, '送っているのは現在の部品DB');
  eq(h.writes, 0, '★ブラウザ側からは書かない(書き手は1つ)');
  ok(!s.calls.some(c => c.url === '/api/parts/mirror'),
     '★控えは送らない(サーバーが保存と同時に更新するため)');
}

// ------------------------------------------------------------------
console.log('\n【サーバーが使えないときは、今まで通りブラウザ側で保存する】');
{
  // (a) サーバーが居ない(ファイルを直接開いている・start.batを使っていない)
  const h = makeHandle(JSON.stringify({ customParts: mkParts(20), hiddenBuiltinRefs: [] }));
  const s = load({ routes: { '/api/parts/stats': new Error('接続できません') }, handle: h });
  await s.partsDb.autoRestore();
  await tick();
  eq(s.partsDb.saveMode(), 'file', 'File System Access API 経路になる');
  eq(s.state.customParts.length, 20, 'ファイルから読めている');
  eq(await s.partsDb.writeNow(), true, '保存できる');
  eq(h.writes, 1, '★ブラウザ側でファイルに書いている(回帰していない)');

  // (b) setpath をしていない(控えしか無い)。控えは書き先ではないのでブラウザ側で書く。
  const h2 = makeHandle(JSON.stringify({ customParts: mkParts(20), hiddenBuiltinRefs: [] }));
  // 控えは「読める」ので /api/parts/all は普通に返ってくる。
  // 読めることと書けることは別 —— writable を見ずに source や ok だけで
  // 判断すると、控えを書き先だと思い込む(原本が更新されないまま
  // 他ソフトだけ新しい内容を見る、という一番分かりにくい形になる)。
  const s2 = load({ routes: {
    '/api/parts/stats': { available: true, ok: true, writable: false,
                          source: 'mirror', count: 3, path: 'C:\\...\\parts_db_mirror.json' },
    '/api/parts/all': ALL_OK,
    '/api/parts/save': SAVED,
  }, handle: h2 });
  await s2.partsDb.autoRestore();
  await tick();
  eq(s2.partsDb.saveMode(), 'file', '★控えしか無いときはブラウザ側で保存する');
  eq(await s2.partsDb.writeNow(), true, '保存できる');
  eq(h2.writes, 1, 'ファイルに書いている');

  // (c) tools/parts_db を消した環境
  const h3 = makeHandle(JSON.stringify({ customParts: mkParts(5), hiddenBuiltinRefs: [] }));
  const s3 = load({ routes: { '/api/parts/stats': { available: false, ok: false } }, handle: h3 });
  await s3.partsDb.autoRestore();
  await tick();
  eq(s3.partsDb.saveMode(), 'file', '機能が入っていなくても従来通り動く');
}

// ------------------------------------------------------------------
console.log('\n【件数が激減したら、確認せずに書かない】');
{
  // サーバーは「ファイルに実際に入っている件数」と比べて drop を返す。
  // ブラウザ側の記憶と違い、他の経路で増えていても正しく比較できる。
  const drop = { available: true, ok: false, reason: 'drop', prev: 605, now: 3,
                 path: STATS_OK.path, error: '件数が減っています' };
  const routes = {
    '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
    '/api/parts/save': body => (body.force ? { ...SAVED, backup: 'parts_db_backup_x.json' } : drop),
  };

  // OKと答えたとき: force を立てて送り直す
  const s = load({ routes, confirmAnswer: true });
  await s.partsDb.autoRestore();
  await tick();
  eq(await s.partsDb.writeNow(), true, '人がOKなら保存する');
  const saves = s.calls.filter(c => c.url === '/api/parts/save');
  eq(saves.map(c => !!c.body.force), [false, true], '★2回目だけ force を立てて送る');

  // キャンセルしたとき: 書かずに止める
  const s2 = load({ routes, confirmAnswer: false });
  await s2.partsDb.autoRestore();
  await tick();
  eq(await s2.partsDb.writeNow(), false, '人がキャンセルしたら false');
  eq(s2.calls.filter(c => c.url === '/api/parts/save').length, 1,
     '★送り直さない(ファイルは無傷)');
  ok(s2.partsDb.isLocked(), '以後の自動保存も止まる');

  // force を付けて送ったのに drop が返る = サーバー側の不具合。
  // 人に聞き直しても直らないので、往復せずに失敗として止める。
  //
  // ※ 5回目からは別のエラーを返して打ち切る。そうしないと、往復し続ける実装に
  //   戻したときテストがハングする —— 「落ちた」ではなく「終わらない」になり、
  //   何が悪いのか分からなくなる(このプロジェクトで実際に踏んだ形)。
  let saveHits = 0;
  const s3 = load({ routes: {
    '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
    '/api/parts/save': () => (++saveHits >= 5
      ? { available: true, ok: false, error: '打ち切り' } : drop),
  }, confirmAnswer: true });
  await s3.partsDb.autoRestore();
  await tick();
  eq(await s3.partsDb.writeNow(), false, 'force でも drop なら保存できない');
  eq(saveHits, 2, '★送るのは2回まで(force を付けた1回で打ち切る・無限に往復しない)');
  ok(!s2.partsDb.hasFile(), 'ロック中は hasFile() が false（図面側に控えが残る）');

  // 止まっている間は、変更があっても書きに行かない
  s2.state.customParts.push({ ref: 'NEW' });
  s2.partsDb.scheduleSave();
  await s2.partsDb.writeNow();
  eq(s2.calls.filter(c => c.url === '/api/parts/save').length, 1, 'ロック中は送らない');
}

// ------------------------------------------------------------------
console.log('\n【保存できなかったことを、成功として返さない】');
{
  // (a) サーバーが保存に失敗した(設定が消えた・ディスクが一杯 等)
  const s = load({ routes: {
    '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
    '/api/parts/save': { available: true, ok: false, reason: 'unset',
                         error: '部品DBの場所が未設定です' },
  } });
  await s.partsDb.autoRestore();
  await tick();
  eq(await s.partsDb.writeNow(), false, '★false を返す(呼び出し側が成功と誤認しない)');
  ok(s.partsDb.isLocked(), '自動保存を止める');

  // (b) サーバーが落ちた(保存の最中に start.bat を閉じた等)
  const s2 = load({ routes: {
    '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
    '/api/parts/save': new Error('接続できません'),
  } });
  await s2.partsDb.autoRestore();
  await tick();
  eq(await s2.partsDb.writeNow(), false, 'サーバーが落ちていたら false');
  ok(s2.partsDb.isLocked(), '自動保存を止める');
  ok(!s2.partsDb.hasFile(), '★図面側への退避が復活する(既存の網に乗る)');
}

// ------------------------------------------------------------------
console.log('\n【前回保存できていなかった分を捨てない】');
{
  // 図面側(localStorage)に退避されていた部品が state に載った状態で起動する。
  // サーバー経由でも、ファイル経路と同じくマージしなければならない。
  const s = load({ routes: { '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
                             '/api/parts/save': SAVED },
                   initialParts: [{ ref: 'ONLY_LOCAL' }] });
  await s.partsDb.autoRestore();
  await tick();
  eq(s.state.customParts.length, 4, 'サーバーの3件＋退避されていた1件');
  ok(s.state.customParts.some(p => p.ref === 'ONLY_LOCAL'), '★退避分が残っている');
  ok(s._banner, '復帰させたことを画面に出す');
}

// ------------------------------------------------------------------
console.log('\n【退避(バックアップ)は部品DBと同じフォルダへ】');
{
  // ブラウザ側では Chrome に getParent() が無く、フォルダを別途選ばせていた。
  // サーバーはパスを知っているので選ばせずに書ける。
  const s = load({ routes: { '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
                             '/api/parts/backup': { available: true, ok: true,
                                                    name: 'parts_db_backup_2026-09-02_1030.json' } } });
  await s.partsDb.autoRestore();
  await tick();
  eq(await s.partsDb.backupNow(), 'parts_db_backup_2026-09-02_1030.json',
     'ファイル名を返す(呼び出し側が案内に使う)');

  const s2 = load({ routes: { '/api/parts/stats': STATS_OK, '/api/parts/all': ALL_OK,
                              '/api/parts/backup': { available: true, ok: false,
                                                     error: '書けません' } } });
  await s2.partsDb.autoRestore();
  await tick();
  eq(await s2.partsDb.backupNow(), null,
     '★取れなかったら null（呼び出し側が「戻せません」と確認を出せる）');
}

// ------------------------------------------------------------------
console.log('\n【件数激減の判定規則が、JSとPythonで同じ】');
{
  // 同じ規則が2箇所にある(経路ごとに1つずつ)。片方だけ直すと、
  // 保存経路によって守られたり守られなかったりする —— 一番たちが悪い形。
  const js = SRC.slice(SRC.indexOf('function isSuspiciousDrop'));
  const py = fs.readFileSync(__dirname + '/../tools/parts_db/parts_db.py', 'utf8');
  const pyGuard = py.slice(py.indexOf('def is_suspicious_drop'),
                           py.indexOf('def write_mirror'));
  ok(/if \(now === 0\) return true;/.test(js.slice(0, 400)), 'JS: 0件になったら止める');
  ok(/if now == 0:\n\s*return True/.test(pyGuard), 'Python: 0件になったら止める');
  ok(/return prev >= 10 && now < prev \/ 2;/.test(js.slice(0, 600)),
     'JS: 10件以上あったものが半分未満になったら止める');
  ok(/return prev >= 10 and now < prev \/ 2/.test(pyGuard),
     '★Python: 同じ閾値(10件・半分)');
  ok(/js\/parts_db\.js/.test(pyGuard) && /両方/.test(pyGuard),
     'Python側に「両方直すこと」と書いてある');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
