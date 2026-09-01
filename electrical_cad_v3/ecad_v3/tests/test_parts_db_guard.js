// 部品DBの保存保護のテスト
//   node tests/test_parts_db_guard.js
//
// 【背景・2026-09-01】
// 盛田さんの部品DBから約440型番が欠落していた。調査したところ、
// js/parts_db.js に「静かにデータを失う」経路が3つあった:
//
//   A. autoRestore() が読み込みより先に fileHandle を立てていたため、
//      権限が下りない・JSONが壊れている等で読めなくても「接続済み」になり、
//      次に部品を1つ触った時点で空の部品DBでファイルを丸ごと上書きした。
//      (図面側 autosave.js で2026-08-23に直したのと同じ構造の穴)
//   B. writeNow()/scheduleSave() が `if (!fileHandle) return;` で無言で抜けるため、
//      接続できていない回の登録はどこにも書かれないまま失われた。
//      保存状態の表示先が閉じたパネルの中の1行しか無く、気づけなかった。
//   C. autoRestore() が state.customParts を無条件に置き換えていたため、
//      ファイルに書けず図面側(localStorage)に退避されていた部品が、
//      次の起動でファイルの古い内容に上書きされて消えた。
//
// このテストは js/parts_db.js を実際に実行して、上記が起きないことを見る。
// 偽のファイルハンドルを渡し、「ファイルの中身」が本当に無事かを確認する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const SRC = fs.readFileSync(__dirname + '/../js/parts_db.js', 'utf8');
const mkParts = n => Array.from({ length: n }, (_, i) => ({ ref: 'P' + i, maker: 'M' }));

// 偽のファイルハンドル。content がディスク上の中身に相当する。
function makeHandle(opts) {
  const h = {
    name: 'parts_db.json',
    content: opts.content,
    writes: 0,
    queryPermission: async () => opts.perm || 'granted',
    requestPermission: async () => opts.perm || 'granted',
    getFile: async () => {
      if (opts.readThrows) throw new Error('読めない');
      return { text: async () => h.content };
    },
    createWritable: async () => {
      // 実物と同じく、開いた時点で中身は捨てられる
      h.content = '';
      return {
        write: async t => { h.content = t; },
        close: async () => { h.writes++; },
      };
    },
  };
  return h;
}

// parts_db.js を1回読み込んで partsDb を作る。handle は IndexedDB から返る想定。
function load(handle, initialParts, confirmAnswer) {
  const sandbox = {
    console,
    state: { customParts: initialParts || [], hiddenBuiltinRefs: [] },
    document: {
      querySelectorAll: () => [],
      getElementById: () => sandbox._banner || null,
      createElement: () => ({ style: {}, id: '', textContent: '',
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
            get: () => { const r = {}; setTimeout(() => { r.result = handle; r.onsuccess(); }, 0); return r; },
            put: () => {},
          }) }),
        } } }), 0);
        return req;
      },
    },
    renderPartsAll: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  // `const partsDb` はトップレベルのconstなのでサンドボックスのプロパティにならない。
  // 他のテスト(test_terminal_label.js等)と同じく、式を評価して取り出す。
  sandbox.partsDb = vm.runInContext('partsDb', sandbox);
  return sandbox;
}
const tick = () => new Promise(r => setTimeout(r, 20));

(async () => {

// ------------------------------------------------------------------
console.log('【A: 権限が下りないとき、ファイルを上書きしない】');
{
  const good = JSON.stringify({ customParts: mkParts(170), hiddenBuiltinRefs: [] });
  const h = makeHandle({ content: good, perm: 'prompt' });
  const s = load(h, []);
  await s.partsDb.autoRestore();
  await tick();
  ok(!s.partsDb.hasFile(), '接続済みにならない');
  ok(s.partsDb.isLocked(), '自動保存がロックされる');
  // ロック後に部品を触っても書かれてはいけない
  s.state.customParts.push({ ref: 'NEW' });
  s.partsDb.scheduleSave();
  await s.partsDb.writeNow();
  await tick();
  eq(h.writes, 0, 'ファイルへの書き込みが1回も起きない');
  eq(h.content, good, 'ファイルの170件が無傷で残る');
  ok(s._banner && /停止/.test(s._banner.textContent), '画面に警告が出る');
}

// ------------------------------------------------------------------
console.log('\n【A: JSONが壊れていても上書きしない】');
{
  const broken = '{"customParts": [{"ref"';
  const h = makeHandle({ content: broken });
  const s = load(h, []);
  await s.partsDb.autoRestore();
  await tick();
  ok(s.partsDb.isLocked(), 'ロックされる');
  s.state.customParts.push({ ref: 'NEW' });
  await s.partsDb.writeNow();
  eq(h.writes, 0, '書き込みが起きない');
  eq(h.content, broken, '壊れたファイルもそのまま残る(原因調査ができる)');
}

// ------------------------------------------------------------------
console.log('\n【B: 接続できていないことが hasFile() で分かる】');
{
  const h = makeHandle({ content: '{"customParts":[]}', perm: 'prompt' });
  const s = load(h, []);
  await s.partsDb.autoRestore();
  await tick();
  // hasFile()がfalseなら autosave.js は customParts を図面側に退避する
  ok(!s.partsDb.hasFile(), 'ロック中は hasFile() が false（図面側に控えが残る）');
}

// ------------------------------------------------------------------
console.log('\n【C: 図面側に退避されていた未保存の部品を捨てない】');
{
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(3), hiddenBuiltinRefs: [] }) });
  // localStorage復元で先に入っている想定。P0はファイルにもあり、Xだけ未保存。
  const s = load(h, [{ ref: 'P0', maker: 'M' }, { ref: 'X', maker: '未保存' }]);
  await s.partsDb.autoRestore();
  await tick();
  eq(s.state.customParts.length, 4, 'ファイル3件＋未保存1件＝4件になる');
  ok(s.state.customParts.some(p => p.ref === 'X'), '未保存だったXが残る');
  eq(s.state.customParts.filter(p => p.ref === 'P0').length, 1, '重複しない');
  ok(s._banner && /復帰/.test(s._banner.textContent), '復帰させたことを画面で知らせる');
}

// ------------------------------------------------------------------
console.log('\n【件数が激減したら、確認せずに書かない】');
{
  const good = JSON.stringify({ customParts: mkParts(170), hiddenBuiltinRefs: [] });
  const h = makeHandle({ content: good });
  const s = load(h, [], false);   // confirmで「キャンセル」を選ぶ
  await s.partsDb.autoRestore();
  await tick();
  ok(s.partsDb.hasFile(), 'まず正常に接続する');
  s.state.customParts = mkParts(2);   // 170 → 2 に激減
  await s.partsDb.writeNow();
  eq(h.writes, 0, 'キャンセルすると書き込まれない');
  eq(h.content, good, 'ファイルの170件が無傷');
  ok(s.partsDb.isLocked(), '以後の自動保存も止まる');
}
{
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(170), hiddenBuiltinRefs: [] }) });
  const s = load(h, [], true);    // confirmで「OK」を選ぶ
  await s.partsDb.autoRestore();
  await tick();
  s.state.customParts = mkParts(2);
  await s.partsDb.writeNow();
  eq(h.writes, 1, 'OKなら意図的な操作として保存する');
  eq(JSON.parse(h.content).customParts.length, 2, '2件で保存される');
}

// ------------------------------------------------------------------
console.log('\n【普通の1件削除は止めない(過剰に邪魔しない)】');
{
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(170), hiddenBuiltinRefs: [] }) });
  const s = load(h, [], false);   // 確認が出たらキャンセルする設定
  await s.partsDb.autoRestore();
  await tick();
  s.state.customParts = mkParts(169);
  await s.partsDb.writeNow();
  eq(h.writes, 1, '170→169は確認なしで保存される');
  ok(!s.partsDb.isLocked(), 'ロックされない');
}

// ------------------------------------------------------------------
console.log('\n【正常時はこれまで通り保存できる】');
{
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(5), hiddenBuiltinRefs: [] }) });
  const s = load(h, []);
  await s.partsDb.autoRestore();
  await tick();
  eq(s.state.customParts.length, 5, 'ファイルの5件が読める');
  ok(s.partsDb.hasFile(), '接続済みになる');
  ok(!s.partsDb.isLocked(), 'ロックされていない');
  s.state.customParts.push({ ref: 'P5', maker: 'M' });
  await s.partsDb.writeNow();
  eq(h.writes, 1, '保存が実行される');
  eq(JSON.parse(h.content).customParts.length, 6, '6件で保存される');
}

console.log(ng === 0 ? '\n=== 全て OK ===' : `\n=== NG ${ng}件 ===`);
process.exit(ng === 0 ? 0 : 1);
})();
