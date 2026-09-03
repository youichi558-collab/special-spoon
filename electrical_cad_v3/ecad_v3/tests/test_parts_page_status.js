// 部品DB単独画面(parts.html)の起動時メッセージのテスト
//   node tests/test_parts_page_status.js
//
// 【背景・2026-09-02】盛田さんから「他のPCでドライブが変わっても問題ないか」。
//
// tools/parts_db/parts_db.py の source は「未設定」(unset)と「設定されている
// のに見つからない」(path_missing)を区別して返す。後者はGoogleドライブ
// (Drive for Desktop)がドライブ文字を変えたとき(実例: I:\ が別の文字になる)
// に起きる —— ファイルには一切触っていないので実害は無いが、
// js/parts_page.js が両方とも「未設定です」と表示していたため、
// 「一度も設定していない」ように読めて紛らわしかった。
//
// このテストは js/parts_page.js の loadAll() を実際に動かし、
// source ごとに正しい案内が出ることを見る。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const SRC = fs.readFileSync(__dirname + '/../js/parts_page.js', 'utf8');

function load(statsResponse) {
  const sandbox = {
    console,
    state: { customParts: [], hiddenBuiltinRefs: [] },
    document: { getElementById: () => null },
    localStorage: { getItem: () => null, setItem: () => {} },
    window: { addEventListener: () => {} },
    escH: s => String(s == null ? '' : s),
    showTopBanner: () => {},
    BUILTIN_PARTS: [],
    PART_TYPE_ORDER: [], PART_TYPE_LABELS: {}, PART_TYPE_CODES: [], LEGACY_PART_TYPES: {},
    fetch: async url => {
      if (url === '/api/parts/stats') return { json: async () => statsResponse };
      throw new Error('unexpected fetch: ' + url);
    },
    _statusHistory: [],
  };
  sandbox.document.getElementById = id => {
    if (id !== 'pp-status') return null;
    return {
      set textContent(v) { sandbox._statusHistory.push(v); this._t = v; },
      get textContent() { return this._t; },
      style: {},
    };
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  sandbox.loadAll = vm.runInContext('loadAll', sandbox);
  return sandbox;
}

(async () => {

console.log('【source=unset: 一度も設定していない】');
{
  const s = load({ available: true, ok: false, writable: false, source: 'unset',
                   count: 0, path: '', error: '部品DBの場所が未設定です' });
  await s.loadAll();
  const msg = s._statusHistory[s._statusHistory.length - 1];
  ok(/未設定/.test(msg), '「未設定」と案内する');
  ok(/setpath/.test(msg), 'setpathコマンドを案内する');
}

console.log('\n【source=path_missing: 設定されているのに見つからない(ドライブ文字が変わった等)】');
{
  const staleError = '設定された部品DBが見つかりません: I:\\マイドライブ\\claude\\部品カタログ\\parts_db.json';
  const s = load({ available: true, ok: false, writable: false, source: 'path_missing',
                   count: 0, path: '', error: staleError });
  await s.loadAll();
  const msg = s._statusHistory[s._statusHistory.length - 1];
  ok(!/^部品DBの場所が未設定です/.test(msg),
     '★「未設定」から始まらない(実際には設定済みなので誤解を招く)');
  ok(msg.includes(staleError), '★元のパス(I:\\...)を含む具体的な案内が出る');
  ok(/ドライブの文字/.test(msg), 'ドライブ文字が変わった可能性を案内する');
  ok(/setpath/.test(msg), '新しいパスでsetpathし直す案内がある');
}

console.log('\n【source=mirror: setpathしていないが控えは読める(書けない)】');
{
  const s = load({ available: true, ok: true, writable: false, source: 'mirror',
                   count: 5, path: '/tmp/.../parts_db_mirror.json', error: '' });
  await s.loadAll();
  const msg = s._statusHistory[s._statusHistory.length - 1];
  ok(/未設定/.test(msg), '控えしか無いときはsetpathを促す(単独画面は書けないと動かないため)');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
