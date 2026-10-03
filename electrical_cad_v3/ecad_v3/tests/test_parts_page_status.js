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
  ok(/フォルダを選ぶ/.test(msg) && /作れます/.test(msg), '画面の「部品DBの場所」の「フォルダを選ぶ」で設定・作成するよう案内する(2026-10-03 ライブラリフォルダ)');
}

console.log('\n【source=path_missing: 設定されているのに見つからない(同期ソフトの準備待ち・ドライブ文字が変わった等)】');
{
  // 文言はサーバー(tools/parts_db/parts_db.py の missing_message)が作る。画面はそのまま出す
  const staleError = 'ライブラリフォルダが見つかりません: I:\\マイドライブ\\lib。同期ソフト(Googleドライブ等)やネットワークの準備がまだかもしれません。準備ができたら「もう一度確かめる」を押すか、「フォルダを選ぶ」で選び直してください';
  const s = load({ available: true, ok: false, writable: false, source: 'path_missing',
                   count: 0, path: '', error: staleError });
  await s.loadAll();
  const msg = s._statusHistory[s._statusHistory.length - 1];
  ok(!/未設定/.test(msg), '★「未設定」と言わない(実際には設定済みなので誤解を招く)');
  ok(msg.includes(staleError), '★サーバーの具体的な案内(元のフォルダ・準備待ち・もう一度確かめる)がそのまま出る');
}

console.log('\n【場所が未設定のまま「カタログ全件で作り直す」を押した(2026-10-03)】');
{
  const s = load({ available: true, ok: false, writable: false, source: 'unset',
                   count: 0, path: '', error: '部品DBの場所が未設定です' });
  await s.loadAll();
  let fetched = [];
  const f0 = s.fetch;
  s.fetch = async url => { fetched.push(url); return f0(url); };
  let asked = false;
  s.confirm = () => { asked = true; return true; };
  await vm.runInContext('catalogResetPartsDb', s)();
  const msg = s._statusHistory[s._statusHistory.length - 1];
  ok(!asked && fetched.length === 0, '★確認も通信もせずに止める(以前は確認→最後の保存で失敗し、画面だけ入れ替わっていた)');
  ok(/未設定/.test(msg) && /フォルダを選ぶ/.test(msg), '場所を設定してから押すよう案内する');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
