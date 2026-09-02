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
const BANNER_SRC = (() => {
  const m = fs.readFileSync(__dirname + '/../js/state.js', 'utf8')
    .match(/function showTopBanner\([\s\S]*?\n\}/);
  if (!m) throw new Error('js/state.js に showTopBanner が見つかりません');
  return m[0];
})();
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
function load(handle, initialParts, confirmAnswer, backupDir) {
  const sandbox = {
    console,
    state: { customParts: initialParts || [], hiddenBuiltinRefs: [] },
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
            // 部品DBファイルとバックアップ先フォルダを、キーで出し分ける
            get: (key) => { const r = {};
              setTimeout(() => { r.result = (key === 'backupDir' ? backupDir : handle); r.onsuccess(); }, 0);
              return r; },
            put: () => {},
          }) }),
        } } }), 0);
        return req;
      },
    },
    renderPartsAll: () => {},
  };
  vm.createContext(sandbox);
  // parts_db.js は警告の帯を state.js の showTopBanner に任せている。
  // コピーを置くと本体を直したときにテストだけ古い挙動を見続けるので、実ソースから取る。
  vm.runInContext(BANNER_SRC, sandbox);
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

// ------------------------------------------------------------------
// 部品DBパネルの件数表示。
// 2026-09-01: 約440型番の欠落に気づくのが遅れた原因の一つが「合計件数が
// どこにも出ていない」ことだった。そこで見出しに件数を出したのだが、
// 最初の実装は renderPartsAll() にだけ足していて、パネルを開く経路
// (renderPartsFloat)は同じ処理を別に書いていたため何も表示されなかった。
// 「同じものを2箇所で計算しているのを見つけたら疑う」の実例。
console.log('\n【部品DBパネルに件数が出る(開く経路・更新経路の両方)】');
{
  const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
  const pick = re => { const m = ui.match(re); if (!m) throw new Error('見つからない:' + re); return m[0]; };
  const countEl = { textContent: '', style: {}, title: '' };
  const sandbox = {
    console,
    state: { customParts: mkParts(170) },
    document: { getElementById: id => (id === 'prt-float-count' ? countEl : null) },
    partsDb: { isLocked: () => false },
    renderMakerTabs: () => {},
    renderPartsTable2: () => {},
    applyPartsFilters: () => [],
    _lastPartsQuery: '',
  };
  vm.createContext(sandbox);
  vm.runInContext([
    pick(/function renderPartsAll\([\s\S]*?\n\}/),
    pick(/function renderPartsDbCount\([\s\S]*?\n\}/),
    pick(/function renderPartsFloat\([\s\S]*?\n\}/),
  ].join('\n'), sandbox);

  countEl.textContent = '';
  vm.runInContext('renderPartsFloat()', sandbox);
  eq(countEl.textContent, '170件', 'パネルを開く経路(renderPartsFloat)で件数が出る');

  countEl.textContent = '';
  vm.runInContext('renderPartsAll()', sandbox);
  eq(countEl.textContent, '170件', '更新経路(renderPartsAll)でも件数が出る');

  // 保存できていないときは、件数だけでなくその事実も出す
  sandbox.partsDb.isLocked = () => true;
  vm.runInContext('renderPartsAll()', sandbox);
  eq(countEl.textContent, '170件・未保存', '保存できていないことが件数の横に出る');
  ok(/red/.test(countEl.style.color || ''), '未保存のときは赤で出す');
}

// ------------------------------------------------------------------
// 2026-08-20に実際に起きた消失の再現。
// 「カタログDBの全件で部品DBを作り直す」は writeNow() の戻り値を見ずに
// 「605件で作り直しました」と成功のalertを出していた。保存が空振りしても
// 画面には605件が並び、次の起動で元の168件に戻る。気づく手段が無かった。
// (Driveに残っていた parts_db_backup_2026-08-20_2230.json が作り直し直前の
//  168件で、現在のファイルと完全一致したことで確定した)
console.log('\n【writeNow() が保存の成否を返す】');
{
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(10), hiddenBuiltinRefs: [] }) });
  const s = load(h, []);
  await s.partsDb.autoRestore();
  await tick();
  s.state.customParts = mkParts(605);          // 作り直し相当
  eq(await s.partsDb.writeNow(), true, '書けたときは true');
  eq(JSON.parse(h.content).customParts.length, 605, 'ファイルにも605件入る');

  // 保存できない状態にする
  s.partsDb.scheduleSave();
  const h2 = makeHandle({ content: JSON.stringify({ customParts: mkParts(10) }), perm: 'prompt' });
  const s2 = load(h2, []);
  await s2.partsDb.autoRestore();               // 権限が下りずロックされる
  await tick();
  s2.state.customParts = mkParts(605);
  eq(await s2.partsDb.writeNow(), false, '書けなかったときは false（呼び出し側が成功と誤認しない）');
  eq(h2.writes, 0, 'ファイルは触られない');
}

// ------------------------------------------------------------------
// backupNow のバックアップ先。
// 2026-09-01: 元の実装は fileHandle.getParent?.() で部品DBと同じフォルダに
// 書こうとしていたが、ChromeのFile System Access APIに getParent() は存在しない。
// この経路は常に失敗し、毎回「保存先を手で選ぶダイアログ」に落ちていた。
// つまり「破壊的操作の前に自動でバックアップを取る」保険は一度も自動で動いておらず、
// 2026-09-01の作り直しでも実際にバックアップが残らなかった。
// 覚えてあるフォルダへ自動で書けることを、実ソースを動かして確認する。
console.log('\n【バックアップ先フォルダを覚えて自動で書ける】');
{
  const written = {};
  const backupDir = {
    name: 'カタログDB',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async (n) => ({
      createWritable: async () => ({
        write: async t => { written[n] = t; },
        close: async () => {},
      }),
    }),
  };
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(170), hiddenBuiltinRefs: [] }) });
  const s = load(h, [], true, backupDir);
  await s.partsDb.autoRestore();
  await tick();

  const name = await s.partsDb.backupNow();
  ok(name && /^parts_db_backup_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(name),
     `日付入りの名前で書き出される（実際: ${name}）`);
  ok(written[name], '覚えてあるフォルダに実際に書かれる（ダイアログを出さない）');
  eq(JSON.parse(written[name] || '{}').customParts.length, 170, '現在の内容がそのまま入る');
  eq(await s.partsDb.backupDirName(), 'カタログDB', '設定済みのフォルダ名を画面に出せる');
}

console.log('\n【バックアップ先が未設定なら、取れなかったと分かる】');
{
  const h = makeHandle({ content: JSON.stringify({ customParts: mkParts(170), hiddenBuiltinRefs: [] }) });
  const s = load(h, [], true, null);   // フォルダ未設定・保存ダイアログも無い環境
  await s.partsDb.autoRestore();
  await tick();
  eq(await s.partsDb.backupNow(), null, 'null を返す（呼び出し側が確認を出せる）');
  eq(await s.partsDb.backupDirName(), '', '未設定と分かる');
}

console.log(ng === 0 ? '\n=== 全て OK ===' : `\n=== NG ${ng}件 ===`);
process.exit(ng === 0 ? 0 : 1);
})();
