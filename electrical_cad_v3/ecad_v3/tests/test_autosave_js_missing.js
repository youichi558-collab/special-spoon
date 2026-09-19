// JSが虫食いで読み込めていないとき、自動保存を止めることのテスト
//   node tests/test_autosave_js_missing.js
//
// 【背景・2026-09-19】盛田さんから「図面消えた」。実際には消えておらず、
// サーバー(start.bat)が落ちた状態でCADを開いたため frame.js・snap.js など
// 8本が ERR_CONNECTION_REFUSED で読み込めず、drawFrame が無いまま
// draw() の先頭(30行目)で例外になり、配線も要素も描かれずに真っ白になっていた。
// データは state にも localStorage にも無傷で残っており、start.bat を
// 起動し直してリロードしたら3ページ・400個そのまま戻った。
//
// ただし「欠けた状態で起動したアプリが自動保存を走らせる」経路は残っていた。
// 2026-08-23の事故(空の状態で上書き → 復旧不能)と同じ形になりうるため、
// 読み込めていないJSがあるときは自動保存を一切行わないようにした。
//
// このテストが守るのは2点。
//  (1) 目印(window.__ecadLoaded)が欠けていたら書かない。localStorageは無傷のまま
//  (2) 「あるべきファイル」の一覧が index.html の <script> タグと一致していること。
//      目印を入れ忘れたファイルがあると、そのファイルは常に「欠けている」と
//      判定され、自動保存が永久に止まる(検出できないことより危険)。
//      逆に目印だけあってタグが無いファイルは検出対象から漏れる。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const root = path.join(__dirname, '..');
const src  = fs.readFileSync(path.join(root, 'js/autosave.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// index.html が読み込む自前のJS一覧(他所のライブラリは除く)
const THIRD = ['jspdf.umd.min.js', 'jszip.min.js'];
const tagFiles = [...html.matchAll(/<script src="js\/([^"]+\.js)"><\/script>/g)].map(m => m[1]);
const ourFiles = tagFiles.filter(f => !THIRD.includes(f));

// ------------------------------------------------------------------
console.log('【目印の付け忘れが無い】');
console.log('  ← 付け忘れると、そのファイルは常に「欠けている」判定になり自動保存が永久に止まる');
{
  ok(ourFiles.length > 20, `index.htmlが読む自前のJSを拾えている(${ourFiles.length}本)`);
  const noMark = ourFiles.filter(f => {
    const p = path.join(root, 'js', f);
    if (!fs.existsSync(p)) return true;
    return !fs.readFileSync(p, 'utf8').includes(`__ecadLoaded`);
  });
  ok(noMark.length === 0, `全ファイルに目印がある${noMark.length ? '（無い: ' + noMark.join(', ') + '）' : ''}`);

  // 目印に書いた名前が、タグのファイル名と一致しているか(コピペ間違いの検出)
  const wrongName = ourFiles.filter(f => {
    const s = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    return !s.includes(`['${f}'] = 1`);
  });
  ok(wrongName.length === 0, `目印の名前がファイル名と一致${wrongName.length ? '（不一致: ' + wrongName.join(', ') + '）' : ''}`);

  // 除外しているのは本当に他所のライブラリだけか
  const excluded = tagFiles.filter(f => THIRD.includes(f));
  ok(excluded.length === THIRD.length, `除外は他所のライブラリ${THIRD.length}本だけ (${excluded.join(', ')})`);
}

// ------------------------------------------------------------------
// autosave.js を、DOMのスタブ付きで走らせる
function makeSandbox({ loadedFiles, pages, lsInit }) {
  const store = Object.assign({}, lsInit);
  const ls = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const hint = { textContent: '' };
  const loaded = {};
  (loadedFiles || []).forEach(f => { loaded[f] = 1; });
  const sandbox = {
    console, localStorage: ls,
    state: {
      pages, currentPage: 0, zoom: 1, pan: { x:0, y:0 }, darkMode: false, showTermNo: false,
      saveFileName: '', customSymbols: [], customParts: [], hiddenBuiltinRefs: [], wireNoRule: {},
    },
    LAYERS: [], DEFS: {},
    _syncCurrentPage: () => {},
    setTimeout: (fn) => fn(), clearTimeout: () => {},
    document: {
      getElementById: () => hint,
      addEventListener: () => {},
      // 実物と同じく index.html のタグ一覧を返す
      querySelectorAll: () => tagFiles.map(f => ({ getAttribute: () => 'js/' + f })),
    },
    window: { addEventListener: () => {}, __ecadLoaded: loaded },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { sandbox, store, hint, ls };
}

const PAGE = (n) => ({
  elements: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, type: 'fline' })),
  wires: [], guides: [], groups: [],
});
const countOf = (store, key) => {
  if (!store[key]) return null;
  return (JSON.parse(store[key]).pages || []).reduce((n, p) => n + p.elements.length + p.wires.length, 0);
};

console.log('【JSが1本でも欠けていたら自動保存しない】');
{
  const good = JSON.stringify({ version:2, pages:[PAGE(400)] });
  // frame.js だけ読み込めなかった状態を作る(2026-09-19の事故と同じ形)
  const { sandbox, store, hint } = makeSandbox({
    loadedFiles: ourFiles.filter(f => f !== 'frame.js'),
    pages: [PAGE(400)],
    lsInit: { ecad_autosave: good },
  });
  sandbox.doAutosave();
  ok(countOf(store, 'ecad_autosave') === 400, '既存の400個が手つかずで残る');
  ok(store.ecad_autosave === good, 'localStorageに一切書き込まない(文字列が完全に同一)');
  ok(hint.textContent.includes('frame.js'), `欠けたファイル名をヒントに出す: ${hint.textContent.slice(0, 40)}…`);
  ok(hint.textContent.includes('start.bat'), '直し方(start.batを起動し直す)を書いてある');
}

console.log('【事故当日と同じ8本が欠けた場合】');
{
  const gone = ['frame.js','snap.js','hit_test.js','resize.js','tools.js','symbol_lib.js','pin_editor.js','conn_check.js'];
  const good = JSON.stringify({ version:2, pages:[PAGE(400)] });
  const { sandbox, store, hint } = makeSandbox({
    loadedFiles: ourFiles.filter(f => !gone.includes(f)),
    pages: [PAGE(0)],   // 描画が止まり、空に見えている状態
    lsInit: { ecad_autosave: good },
  });
  sandbox.doAutosave();
  ok(store.ecad_autosave === good, '図面が空に見えていても既存データを潰さない');
  gone.forEach(f => ok(hint.textContent.includes(f), `${f} が欠けている旨を出す`));
}

console.log('【全部読み込めていれば、従来どおり保存する】');
{
  const { sandbox, store } = makeSandbox({
    loadedFiles: ourFiles, pages: [PAGE(400)], lsInit: {},
  });
  sandbox.doAutosave();
  ok(countOf(store, 'ecad_autosave') === 400, '400個が保存される(誤検出で止まらない)');
}

console.log('【他所のライブラリ(jspdf/jszip)は目印が無くても止めない】');
console.log('  ← 目印を入れられないファイル。落ちてもPDF出力が使えなくなるだけで図面には影響しない');
{
  const { sandbox, store } = makeSandbox({
    loadedFiles: ourFiles,   // jspdf/jszip は最初から目印なし
    pages: [PAGE(400)], lsInit: {},
  });
  sandbox.doAutosave();
  ok(countOf(store, 'ecad_autosave') === 400, '他所のライブラリの有無では止まらない');
}

console.log('【DOMが無い環境では判定しない】');
console.log('  ← 誤検出で自動保存を止める方が、検出できないことより危険');
{
  const store = {};
  const sandbox = {
    console,
    localStorage: { getItem: k => store[k] || null, setItem: (k,v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    state: { pages: [PAGE(400)], currentPage: 0, zoom: 1, pan: {x:0,y:0}, darkMode: false,
             saveFileName: '', customSymbols: [], customParts: [], hiddenBuiltinRefs: [], wireNoRule: {} },
    LAYERS: [], DEFS: {}, _syncCurrentPage: () => {},
    setTimeout: (fn) => fn(), clearTimeout: () => {},
    document: { getElementById: () => ({ textContent: '' }), addEventListener: () => {} }, // querySelectorAll 無し
    window: { addEventListener: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  sandbox.doAutosave();
  ok(countOf(store, 'ecad_autosave') === 400, 'querySelectorAllが無くても通常どおり保存される');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
