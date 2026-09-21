// ================================================================
// 部品DBは「ページの読み込みが全部終わってから」読むことの確認
//
// 【2026-09-21】盛田さん「起動が不安定だな」。部品DBが0件・
// 「読み込み中...」のまま立ち上がる事象が出ていた。
//
// 原因は server.py 側:
//   ・HTTPServer(シングルスレッド) = 1度に1リクエストしか捌けない
//   ・protocol_version 未指定 = HTTP/1.0 で keep-alive が効かず、
//     index.html の <script> 32本が32本とも別々のTCP接続を張る
//   ・request_queue_size が既定の5しかない
// ここへ /api/parts/all(実測605KB)を起動と同時に投げると、送っている間
// 残りのJSが待たされ、溢れた接続は1秒待ち(TCP再送)か拒否になる。
// **JSが1本でも欠けたまま起動すると図面が真っ白になる**(2026-09-19の事故)。
//
// 後回しにできるのは、帳票(端子台表)が部品DBを引かなくなったため
// (同日前半の変更)。起動直後に部品DBが要るものはもう無い。
//
// このテストは「起動処理の中で直接 autoRestore() を呼ぶ形」に戻って
// いないことを見張る。戻すと同じ不安定が再発する。
//
// 【注意】サーバー側(シングルスレッド・backlog 5・HTTP/1.0)は未修正。
// これは押し寄せる量を減らす対策で、根本原因はサーバー側に残っている。
// ================================================================
const fs = require('fs');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG ' + m); } else console.log('  OK ' + m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');

const boot = R('js/boot.js');
// init() の中身(即時実行される部分)だけを取り出す
const init = boot.slice(boot.indexOf('(function init() {'), boot.indexOf('\n})();'));

console.log('【起動処理の中で部品DBを読んでいないこと】');
{
  // 正規表現では「その場で呼ぶ」と「予約して後で呼ぶ」を見分けられないので、
  // boot.js を実際に走らせて、いつ autoRestore() が呼ばれるかを見る。
  const vm = require('vm');
  const calls = [];
  const idleQ = [], loadQ = [];
  const elStub = () => ({ style:{}, textContent:'', id:'', appendChild(){}, remove(){},
                          classList:{ add(){}, remove(){} }, onclick:null });
  const sandbox = {
    console: { log(){}, error(){}, warn(){} },
    state: { customSymbols: [], darkMode: false },
    partsDb: { autoRestore(){ calls.push('autoRestore'); } },
    document: {
      readyState: 'loading',
      getElementById: () => null,
      createElement: elStub,
      querySelectorAll: () => [],
      body: { appendChild(){} },
      createTextNode: () => ({}),
    },
    window: {
      addEventListener(type, fn){ if (type === 'load') loadQ.push(fn); },
    },
    requestIdleCallback: fn => { idleQ.push(fn); },
    setTimeout: fn => { idleQ.push(fn); },
  };
  // _safeInit(ラベル, 関数) の第2引数は**呼び出し時に評価される**ので、
  // 未定義だと try/catch の外で ReferenceError になる。名前だけ通す。
  ['restoreAutosave','loadSymbolsFromStorage','renderLayers','renderPartsAll',
   'renderSymFloat','renderPageTabs','draw','updateHint','updateRightPanel']
    .forEach(n => { sandbox[n] = function(){}; });
  sandbox.window.__ecadLoaded = {};
  vm.createContext(sandbox);
  // boot.js の init() は未定義の関数を大量に呼ぶが、全て _safeInit の
  // try/catch が拾うので、ここでは落ちずに最後まで走る。
  vm.runInContext(boot, sandbox);

  ok(calls.length === 0,
     `★起動処理の時点では部品DBを読みに行かない (実際の呼び出し: ${calls.length}回)`);
  ok(loadQ.length === 1, 'load(全リソース読み込み完了)を待つ登録が1つある');

  // load が発火した時点でも、まだ読みに行かない(手が空くのを待つ)
  loadQ.forEach(fn => fn());
  ok(calls.length === 0, `load発火の時点でもまだ読まない (実際: ${calls.length}回)`);
  ok(idleQ.length === 1, '手が空くのを待つ登録(requestIdleCallback)が1つある');

  // 手が空いたところで初めて読む
  idleQ.forEach(fn => fn());
  ok(calls.length === 1, `手が空いてから1回だけ読む (実際: ${calls.length}回)`);
}

console.log('\n【後回しにできる前提が崩れていないこと】');
{
  // 帳票が部品DBを引くようになったら、起動時に無いと困る場面が復活する。
  const rep = R('js/report.js');
  const ct = rep.slice(rep.indexOf('function collectTerminals'),
                       rep.indexOf('function groupTerminalsByDevice'));
  ok(!/customParts/.test(ct),
     '★端子台表(collectTerminals)が部品DBを引いていない(引くなら後回しにできない)');
  ok(!/function isDeviceTerminal\s*\(/.test(rep),
     '★isDeviceTerminal が復活していない');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
