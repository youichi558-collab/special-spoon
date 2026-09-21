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
  const idleQ = [], loadQ = [], timerQ = [];
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
    setTimeout: (fn, ms) => { timerQ.push({ fn, ms }); },
    _asMissingScripts: () => [],
  };
  sandbox.window.__ecadLoaded = {};
  // _safeInit(ラベル, 関数) の第2引数は**呼び出し時に評価される**ので、
  // 未定義だと try/catch の外で ReferenceError になる。名前だけ通す。
  ['restoreAutosave','loadSymbolsFromStorage','renderLayers','renderPartsAll',
   'renderSymFloat','renderPageTabs','draw','updateHint','updateRightPanel']
    .forEach(n => { sandbox[n] = function(){}; });
  vm.createContext(sandbox);
  // boot.js の init() は未定義の関数を大量に呼ぶが、全て _safeInit の
  // try/catch が拾うので、ここでは落ちずに最後まで走る。
  vm.runInContext(boot, sandbox);

  ok(calls.length === 0,
     `★起動処理の時点では部品DBを読みに行かない (実際の呼び出し: ${calls.length}回)`);
  ok(loadQ.length === 1, 'load(全リソース読み込み完了)を待つ登録が1つある');

  // 【2026-09-21】loadだけに頼らない保険。loadは混んでいるときに遅れる
  // イベントなので、JSが1本詰まると部品DBの読み込みもろとも待たされる。
  const fallback = timerQ.filter(t => t.ms >= 1000);
  ok(fallback.length === 1,
     `★loadが来なくても読む保険がある (${fallback.length}件・${fallback[0] ? fallback[0].ms + 'ms' : '-'})`);

  // load が発火した時点でも、まだ読みに行かない(手が空くのを待つ)
  loadQ.forEach(fn => fn());
  ok(calls.length === 0, `load発火の時点でもまだ読まない (実際: ${calls.length}回)`);
  ok(idleQ.length === 1, '手が空くのを待つ登録(requestIdleCallback)が1つある');

  // 手が空いたところで初めて読む
  idleQ.forEach(fn => fn());
  ok(calls.length === 1, `手が空いてから1回だけ読む (実際: ${calls.length}回)`);

  // 保険が後から発火しても二重に読まないこと
  fallback.forEach(t => t.fn());
  ok(calls.length === 1, `★保険が後から発火しても二重に読まない (実際: ${calls.length}回)`);
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

console.log('\n【JS読み込み欠けの検出】');
{
  const boot2 = boot;
  // 目印(window.__ecadLoaded)は各ファイルの末尾に付く。boot.js 自身の目印が
  // 付くのは init() が終わったあとなので、init() の中で直に数えると
  // boot.js が毎回「欠けている」ことになる。実際に画面で誤検出を出した。
  // setTimeout で判定をその場から外していることを見張る。
  const seg = boot2.slice(boot2.indexOf("_safeInit('JS読み込み欠けの検出'"),
                          boot2.indexOf("_safeInit('バックアップ開始'"));
  ok(/setTimeout\(/.test(seg),
     '★判定を setTimeout でその場から外している(boot.js自身の誤検出を防ぐ)');
  ok(/_asMissingScripts\(\)/.test(seg), '_asMissingScripts() で欠けを数えている');
  ok(/_bootBanner\(/.test(seg), '欠けていたら起動バナーで知らせる');
  ok(/missing\.join/.test(seg), '欠けたファイル名を出す(原因の切り分けに要る)');

  // 実際に走らせて、欠けが無ければ何も出ないこと
  {
    const vm2 = require('vm');
    const banners = [], timers = [];
    const sb = {
      console: { log(){}, error(){}, warn(){} },
      state: { customSymbols: [], darkMode: false },
      partsDb: { autoRestore(){} },
      document: { readyState:'loading', getElementById: () => null,
                  createElement: () => ({ style:{}, appendChild(){}, remove(){},
                                          classList:{add(){},remove(){}} }),
                  querySelectorAll: () => [], body:{ appendChild(){} },
                  createTextNode: t => { banners.push(String(t)); return {}; } },
      window: { addEventListener(){}, __ecadLoaded:{} },
      requestIdleCallback: () => {},
      setTimeout: fn => { timers.push(fn); },
      _asMissingScripts: () => [],
    };
    ['restoreAutosave','loadSymbolsFromStorage','renderLayers','renderPartsAll',
     'renderSymFloat','renderPageTabs','draw','updateHint','updateRightPanel']
      .forEach(n => { sb[n] = function(){}; });
    vm2.createContext(sb);
    vm2.runInContext(boot2, sb);
    timers.forEach(fn => fn());
    ok(!banners.some(t => t.includes('JSが読み込めていません')),
       '★欠けが無ければバナーを出さない(正常な起動で毎回出ない)');

    // 欠けがあれば、その名前を出すこと
    const banners2 = [], timers2 = [];
    const sb2 = { ...sb, _asMissingScripts: () => ['search.js'],
      document: { ...sb.document, createTextNode: t => { banners2.push(String(t)); return {}; } },
      window: { addEventListener(){}, __ecadLoaded:{} },
      setTimeout: fn => { timers2.push(fn); } };
    vm2.createContext(sb2);
    vm2.runInContext(boot2, sb2);
    timers2.forEach(fn => fn());
    ok(banners2.some(t => t.includes('search.js')),
       '★欠けていたらファイル名を名指しする');
  }
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
