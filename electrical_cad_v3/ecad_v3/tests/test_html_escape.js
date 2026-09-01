// 画面に出す文字列のHTMLエスケープ・ローカルサーバーの公開範囲のテスト
//   node tests/test_html_escape.js
//
// 【背景・2026-09-01】
// 部品名・型番・メーカー名・デバイス名・ページ名・シンボル名は、
// カタログCSV・DXF・他所で作られた図面ファイル・手入力から入ってくる。
// これらを `el.innerHTML = `...${name}...`` の形でそのまま入れている箇所が
// 多数あり、`<` を含む型番で表示が欠ける(良い方)か、onerror付きの<img>等が
// そのまま実行される(悪い方)状態だった。
//
// 対策として js/state.js に escH() を1つ置き、各描画箇所でかぶせた。
// このテストは「実際に描画関数を動かして、危険な文字列が生のHTMLとして
// 出てこないこと」を見る(正規表現でソースの形を見るのではなく、動かす)。

const fs = require('fs');
const vm = require('vm');
const { escH } = require('./_esch.js');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// 実際に踏まれると困る文字列。属性を抜けるパターンも入れてある。
const EVIL = '<img src=x onerror=alert(1)>';
const EVIL_ATTR = '" onmouseover="alert(1)';

// ------------------------------------------------------------------
console.log('【escH 単体】');
eq(escH(EVIL), '&lt;img src=x onerror=alert(1)&gt;', '< と > を潰す');
eq(escH('A"B'), 'A&quot;B', '属性を抜けられないよう " も潰す');
eq(escH("A'B"), 'A&#39;B', "' も潰す(シングルクォート属性・onclick対策)");
eq(escH('A&B'), 'A&amp;B', '& を先に潰す(二重エスケープしない)');
eq(escH(null), '', 'null は空文字');
eq(escH(undefined), '', 'undefined は空文字');
eq(escH(0), '0', '数値0が空にならない');
eq(escH(1.5), '1.5', '数値はそのまま文字列化');

// ------------------------------------------------------------------
console.log('\n【部品表(BOM): 型番・デバイス名が生のHTMLにならない】');
{
  const domEls = {};
  const stub = () => ({ innerHTML:'', textContent:'', style:{}, onclick:null });
  ['report-tabs','report-title','report-body','report-csv-btn'].forEach(id => { domEls[id] = stub(); });
  const sandbox = {
    document: { getElementById: id => domEls[id] || null },
    console, escH, window: {},
    openFP: () => {}, closeFP: () => {},
    draw: () => {}, pushH: () => {}, dl: () => {},
    getDef: () => ({}), partVoltOptions: () => [], updateRightPanel: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);
  sandbox.state = {
    pages: [{
      name: 'P1',
      elements: [{ id:1, type:'coil', partRef: EVIL, partModel: EVIL, partVolt: EVIL }],
      groups: [],
    }],
  };
  sandbox.state.elements = sandbox.state.pages[0].elements;
  sandbox.showBOM();
  const html = domEls['report-body'].innerHTML;
  ok(html.length > 0, '部品表が描画される');
  ok(!html.includes('<img'), '型番に入れた<img>が生のタグとして出ない');
  ok(html.includes('&lt;img'), 'エスケープされた形で表示される(消えてはいない)');
}

// ------------------------------------------------------------------
console.log('\n【線番表: ページ名・線番が生のHTMLにならない】');
{
  const domEls = {};
  const stub = () => ({ innerHTML:'', textContent:'', style:{}, onclick:null });
  ['report-tabs','report-title','report-body','report-csv-btn'].forEach(id => { domEls[id] = stub(); });
  const sandbox = {
    document: { getElementById: id => domEls[id] || null },
    console, escH, window: {},
    openFP: () => {}, closeFP: () => {},
    draw: () => {}, pushH: () => {}, dl: () => {},
    getDef: () => ({}), partVoltOptions: () => [], updateRightPanel: () => {},
    groupWiresByNet: idxs => idxs.map((_, i) => [i]),
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);
  sandbox.state = {
    pages: [{
      name: EVIL,
      elements: [],
      wires: [{ x1:0, y1:0, x2:10, y2:0, wireNo: EVIL_ATTR }],
      groups: [],
    }],
  };
  sandbox.state.elements = [];
  sandbox.state.wires = sandbox.state.pages[0].wires;
  sandbox.wireNoTable('');
  const html = domEls['report-body'].innerHTML;
  ok(html.length > 0, '線番表が描画される');
  ok(!html.includes('<img'), 'ページ名に入れた<img>が生のタグとして出ない');
  ok(!/value="[^"]*" onmouseover=/.test(html), '線番のvalue属性から抜け出せない');
}

// ------------------------------------------------------------------
console.log('\n【端子(ピン)編集: 端子番号が生のHTMLにならない】');
{
  const ctxStub = () => new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}) });
  const elStub = () => ({
    getContext: ctxStub,
    getBoundingClientRect: () => ({ left:0, top:0, width:400, height:300 }),
    width: 400, height: 300,
    style: {}, textContent: '', value: '', innerHTML: '',
    onmousedown: null, onwheel: null,
  });
  const domEls = {
    'pin-edit-cv': elStub(), 'pe-name': elStub(),
    'pe-role': elStub(), 'pe-term-list': elStub(),
  };
  const sandbox = {
    state: { customSymbols: [{ type:'testsym', name:'テスト', shapes:[], terminals:[] }] },
    DEFS: { testsym: {} },
    document: { getElementById: id => domEls[id] || null },
    console, escH,
    alert: () => {}, openFP: () => {}, closeFP: () => {},
    draw: () => {}, saveSymbolsToStorage: () => {}, requestAnimationFrame: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/pin_editor.js', 'utf8'), sandbox);
  sandbox.openPinEditor('testsym');
  vm.runInContext('_peTerms.push({x:0,y:0,label:' + JSON.stringify(EVIL_ATTR) + '}); peUpdateList();', sandbox);
  const html = domEls['pe-term-list'].innerHTML;
  ok(html.length > 0, '端子一覧が描画される');
  ok(!/value="[^"]*" onmouseover=/.test(html), '端子番号のvalue属性から抜け出せない');
  ok(html.includes('&quot;'), '" がエスケープされている');
}

// ------------------------------------------------------------------
// ローカルサーバーの公開範囲。ここはPythonなのでソースを読んで確認する
// (実際にポートを開くテストはCIでもローカルでも副作用が大きいため)。
console.log('\n【server.py: LANに公開しない】');
{
  const src = fs.readFileSync(__dirname + '/../server.py', 'utf8');
  ok(!/HTTPServer\(\(''\s*,/.test(src), "HTTPServer(('', PORT)) で全インターフェースに開いていない");
  ok(/HOST = os\.environ\.get\('ECAD_HOST', '127\.0\.0\.1'\)/.test(src),
     '既定の待ち受けは127.0.0.1(このPCからのみ)');
  ok(/HTTPServer\(\(HOST, PORT\)/.test(src), 'HOSTを使って待ち受けている');

  // setdir は「サーバー上の任意フォルダをGET一発で指定できる」ため撤去した。
  // 画面からは一度も呼んでおらず(取り込みは /api/catalog/import)、
  // 設定変更はコマンドライン(catalog_db.py setdir)で行う。
  ok(!/action == 'setdir'/.test(src), "/api/catalog/setdir がHTTPから呼べない");
}

console.log('\n【catalog_server.py: LANに公開しない・CORSを絞る】');
{
  const p = __dirname + '/../tools/catalog_db/catalog_server.py';
  if (!fs.existsSync(p)) {
    console.log('  -- catalog_server.py が無いので省略');
  } else {
    const src = fs.readFileSync(p, 'utf8');
    ok(!/HTTPServer\(\(''\s*,/.test(src), "HTTPServer(('', port)) で全インターフェースに開いていない");
    ok(/DEFAULT_HOST = '127\.0\.0\.1'/.test(src), '既定の待ち受けは127.0.0.1');
    ok(!/'Access-Control-Allow-Origin', '\*'/.test(src), 'CORSが * のままになっていない');
  }
}

// ------------------------------------------------------------------
console.log('\n【JSZipを外部CDNから読まない(オフラインで動く)】');
{
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  ok(!/src="https?:\/\//.test(html), 'index.htmlが外部URLのscriptを読み込んでいない');
  ok(/src="js\/jszip(\.min)?\.js"/.test(html), 'JSZipを同梱ファイルから読んでいる');
  ok(fs.existsSync(__dirname + '/../js/jszip.min.js'), 'js/jszip.min.js が存在する');
}

console.log(ng === 0 ? '\n=== 全て OK ===' : `\n=== NG ${ng}件 ===`);
process.exit(ng === 0 ? 0 : 1);
