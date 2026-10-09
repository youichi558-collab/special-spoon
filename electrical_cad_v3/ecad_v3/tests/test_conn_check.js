// 接続チェック（旧「接続表」＋「端子表」統合）のテスト
//   node tests/test_conn_check.js
//
// 【背景】盛田さんの「端子表と接続表を統合して名前を変えるのは？」への対応。
// 両者は配線と端子の対応を出すもので、主語が部品か配線かの違いしかなかった。
// 端子表は ①現在ページのみ ②端子台の端子が端子台表と重複 ③接続判定が
// fromElId 紐づけで他表と別方式 ④「種別」に内部名(coil等)が生で出る、という
// 状態だったため接続表へ統合し、名前を「接続チェック」にした。
//
// 【この表の位置づけ】
// 「分岐のない1本線の TB1-1→MC1-13 は図面を見れば判るので一覧にする意味がない」
// (盛田さん)。価値があるのは図面を見ても気づきにくい方＝端点ズレ・未採番の検出。
// よって問題行を先頭に集める。
// 分岐点経由の接続先は原理的に特定できない(分岐点は電気的に1点で、そこに集まる
// 線は全部同電位。「どっちに繋がるか」という問いが成立しない)。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const domEls = {};
const stub = () => ({ innerHTML:'', textContent:'', style:{}, onclick:null, classList:{ add(){}, remove(){} } });
['report-tabs','report-title','report-body','report-csv-btn'].forEach(id => { domEls[id] = stub(); });

let lastCsv = null;
const sandbox = {
  document: { getElementById: id => domEls[id] || null },
  console, alert: () => {},
  openFP: () => {}, closeFP: () => {},
  draw: () => {}, pushH: () => {},
  dl: (content, name) => { lastCsv = { content, name }; },
  getDef: () => ({ w: 20 }), escH: require('./_esch.js').escH,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8').replace(/\r\n/g, '\n'), sandbox);
// CSVのファイル名は js/edit.js の _csvName(図面名_用途.csv) をそのまま使う
{ const e = fs.readFileSync(__dirname + '/../js/edit.js', 'utf8').replace(/\r\n/g, '\n'); const s = e.indexOf('function _csvName(');
  vm.runInContext(e.slice(s, e.indexOf('\n}', s) + 2), sandbox); }
vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8').replace(/\r\n/g, '\n'), sandbox);

// 2ページぶん。端子は端子台(junction)とカスタムシンボルの両方を用意する。
sandbox.state = {
  customSymbols: [
    { type:'my_coil', terminals:[{x:-10,y:0,label:'A1'},{x:10,y:0,label:'A2'}] },
  ],
  pages: [
    {
      name:'P1', frameObj:null,
      elements: [
        { id:11, type:'junction', style:'circle', partRef:'TB1', label:'1', x:0,   y:0 },
        { id:12, type:'junction', style:'dot',                    x:100, y:0 },  // 分岐点
        { id:13, type:'my_coil', partRef:'MC1', x:200, y:0, rot:0, terminals:'13,14' },
        // 未採番の配線(w4)用。他の線とつながらない場所に置く
        { id:14, type:'junction', style:'circle', partRef:'TB1', label:'2', x:0,   y:100 },
        { id:15, type:'my_coil', partRef:'MC2', x:200, y:100, rot:0, terminals:'13,14' },
      ],
      wires: [
        // TB1-1 → 分岐点（分岐点側は特定できない＝分岐点としか出ない）
        { id:'w1', wireNo:'W101', layer:'L1', x1:0,   y1:0, x2:100, y2:0 },
        // 分岐点 → MC1の端子13（x=190がMC1の左端子）
        { id:'w2', wireNo:'W101', layer:'L1', x1:100, y1:0, x2:190, y2:0 },
        // 端点が端子から大きく外れている（目視では繋がって見えるがズレている）
        { id:'w3', wireNo:'W102', layer:'L1', x1:0,   y1:60, x2:80, y2:60 },
        // 線番が振られていない。
        // 【2026-09-25】以前は (0,0)-(210,0) で、始点がW101のw1と重なっていた。線番は
        // 1ネット1か所になりネットの番号で出すので、それでは W101 と出る(正しい)。
        // 他の線とつながらない TB1-2 → MC2 の線にした。
        { id:'w4', wireNo:'',     layer:'L1', x1:0,   y1:100, x2:190, y2:100 },
      ],
    },
    { name:'P2', frameObj:null, elements: [], wires: [] },
  ],
};
sandbox.state.elements = sandbox.state.pages[0].elements;
sandbox.state.wires = sandbox.state.pages[0].wires;

// ------------------------------------------------------------------
console.log('【タブ構成: 端子表が消えて接続チェックになっている】');
// トップレベル const/let は sandbox のプロパティにならないため runInContext で取得する
const eval_ = expr => vm.runInContext(expr, sandbox);
const tabs = eval_('REPORT_TABS').map(t => t.label);
eq(tabs, ['部品表','線番表','接続チェック','端子台表','接点Ref'], 'タブは5つ、端子表は無い');
ok(eval_('typeof showTerminalTable') === 'undefined', '旧showTerminalTableは削除されている');
ok(eval_('typeof exportTerminalCSV') === 'undefined', '旧exportTerminalCSVは削除されている');

// ------------------------------------------------------------------
console.log('【全ページ集計・ネット単位(2026-09-29 作り直し)】');
const nets0 = sandbox.analyzeConnections();
eq(nets0.length, 3, '2ページ分を走査して、配線4本が3つのネット(w1+w2は●でつながる)');
eq(nets0.map(n => n.idxs.length).sort(), [1, 1, 2], 'ネットの配線本数は 2・1・1');

// ------------------------------------------------------------------
console.log('【問題のあるネットを先頭に集める】');
sandbox.setConnSort('wire');
const nets = sandbox._connSortNets(sandbox.analyzeConnections());
const sev = nets.map(n => sandbox._connSeverity(n));
ok(sev[0] === 2 && sev[1] === 2, `問題のあるネットが先頭に来る（${sev.join(' / ')}）`);
ok(sev[sev.length - 1] === 0, '正常なネットは後ろに回る');

// ------------------------------------------------------------------
console.log('【状態の判定】');
const byNo = {};
nets.forEach(n => { byNo[n.wireNo || '(未採番)'] = n; });
eq(byNo['W102'].dangling.length, 2, '端子にも他の配線にも触れていない端は「浮いている端」(w3は両端)');
ok(byNo['W102'].dangling[0].near && byNo['W102'].dangling[0].near.name === 'TB1', '浮いている端には、最寄りの端子と距離を添える');
eq(byNo['(未採番)'].wireNo, '', '線番が無いネットは未採番');
eq(sandbox._connSeverity(byNo['(未採番)']), 2, '未採番は問題');
eq(byNo['W101'].terms.map(t => t.name + ':' + t.term), ['MC1:13', 'TB1:1'], '●でつながった配線の先の端子も、同じネットの端子に並ぶ');
eq(byNo['W101'].dangling.length, 0, '●に触れている端は「浮いている」ではない');
eq(byNo['(未採番)'].terms.map(t => t.name + ':' + t.term), ['MC2:13', 'TB1:2'], '端子は両端から集める');

// ------------------------------------------------------------------
console.log('【●の無いT字は警告(つながっていない扱い)・他の配線の端に触れている端は問題ではない】');
{
  const saved = sandbox.state.pages;
  sandbox.state.pages = [{ name: 'T', frameObj: null, elements: [{ id: 91, type: 'junction', style: 'circle', partRef: 'TB9', label: '1', x: 0, y: 0 }, { id: 92, type: 'junction', style: 'circle', partRef: 'TB9', label: '2', x: 50, y: 40 }],
    wires: [
      { id: 't1', wireNo: 'T01', layer: 'L1', x1: 0,   y1: 0,  x2: 100, y2: 0 },     // 幹線(TB9-1から)
      { id: 't2', wireNo: 'T02', layer: 'L1', x1: 50,  y1: 40, x2: 50,  y2: 0 },     // 幹線の途中(50,0)に端が乗る。●が無い
      { id: 't3', wireNo: 'T03', layer: 'L1', x1: 100, y1: 0,  x2: 100, y2: 60 },    // 幹線の端(100,0)に端が触れる(繋がる=同じネット)
    ] }];
  const ns = sandbox.analyzeConnections();
  const tee = ns.find(n => n.tees.length);
  ok(tee && tee.tees[0].x === 50 && tee.tees[0].y === 0, '幹線の途中に●なしで端が乗る配線は「●の無いT字」');
  eq(sandbox._connSeverity(tee), 1, '警告(問題より軽い)');
  const main = ns.find(n => n.idxs.length === 2);
  ok(main && main.dangling.every(d => !(d.x === 100 && d.y === 0)), '他の配線の端に触れている端(100,0)は浮いていない');
  sandbox.state.pages = saved;
}

// ------------------------------------------------------------------
console.log('【分岐点(●)でつながる先の説明】');
sandbox.showConnTable();
const body = domEls['report-body'].innerHTML;
ok(body.includes('分岐点(●)でつながった先の端子も、同じ行に並びます'), '分岐点でつながる先も同じ行に出ることを説明している');
ok(body.includes('浮いている端'), '「浮いている端」と表示される');
eq(domEls['report-title'].textContent, '接続チェック', 'タイトルが「接続チェック」');

// ------------------------------------------------------------------
console.log('【端子の表示: 端子番号ラベルが出る】');
ok(body.includes('TB1'), '端子台のデバイス名が出る');
ok(body.includes('MC1'), 'シンボルのデバイス名が出る');
ok(body.includes('13'), 'el.terminals由来の端子番号(13)が出る');

// ------------------------------------------------------------------
console.log('【並べ替え: 線番順 / 部品順】');
sandbox.setConnSort('part');
eq(eval_('_connSortMode'), 'part', '部品順に切り替わる');
sandbox.setConnSort('wire');
eq(eval_('_connSortMode'), 'wire', '線番順に戻る');
sandbox.setConnSort('でたらめ');
eq(eval_('_connSortMode'), 'wire', '不正な値は線番順にフォールバック');

// ------------------------------------------------------------------
console.log('【CSV出力: 状態列がある / カンマがクォートされる】');
domEls['report-csv-btn'].onclick();
ok(lastCsv && lastCsv.name === '図面_接続チェック.csv', 'ファイル名が 図面名_接続チェック.csv(図面名未設定なら「図面」)');
ok(lastCsv.content.split('\n')[0].includes('状態'), 'ヘッダーに状態列がある');
ok(lastCsv.content.includes('浮いている端') && lastCsv.content.includes('未採番'), '本文に状態が出力される(画面と同じ内容)');
ok(lastCsv.content.split('\n')[0].includes('接続している端子') && lastCsv.content.includes('MC1:13 / TB1:1'), 'ネットごとの端子の一覧が出る');
ok(lastCsv.content.split('\n')[1].startsWith('"'), '各値がクォートされている（生カンマ対策）');

// ------------------------------------------------------------------
console.log('【未接続の端子: 接続チェックと同じ作り(全ページ・同じ端子の位置・同じ許容誤差)】');
{
  const u = sandbox.analyzeUnconnectedTerminals();
  eq(u.map(x => x.name + ':' + x.term), ['MC1:14', 'MC2:14'], 'シンボルの端子で、配線の端が来ていないものだけ(端子台の○・分岐点は含めない)');
  ok(u.every(x => x.pageIdx === 0 && x.page === 'P1' && typeof x.elId !== 'undefined' && Number.isFinite(x.x)), '結果にページ・要素ID・座標がある');
  // 全ページ: 2ページ目のシンボル(配線なし)も拾う。非表示レイヤーの要素は除く
  sandbox.LAYERS = [{ name: 'L1', visible: true }, { name: 'HID', visible: false }];
  sandbox.state.pages[1].elements = [
    { id: 71, type: 'my_coil', partRef: 'MC7', x: 0, y: 0, rot: 0, terminals: 'A1,A2', layer: 'L1' },
    { id: 72, type: 'my_coil', partRef: 'MC8', x: 500, y: 0, rot: 0, layer: 'HID' } ];
  const u2 = sandbox.analyzeUnconnectedTerminals();
  eq(u2.filter(x => x.pageIdx === 1).map(x => x.name + ':' + x.term), ['MC7:A1', 'MC7:A2'], '2ページ目の未接続の端子も拾う(以前は現在のページだけ)');
  ok(!u2.some(x => x.name === 'MC8'), '非表示レイヤーの要素は除く');
  sandbox.state.pages[1].elements = [];
  // 配線の端が端子の許容誤差内に来れば接続している(接続チェックの端子の判定と同じ)
  sandbox.state.pages[0].wires.push({ id: 'w9', wireNo: 'W109', layer: 'L1', x1: 210, y1: 4, x2: 260, y2: 4 });
  eq(sandbox.analyzeUnconnectedTerminals().map(x => x.name + ':' + x.term), ['MC2:14'], '端子から4(許容誤差5以内)に端が来ていれば接続している');
  sandbox.state.pages[0].wires.pop();
  // 表に「未接続の端子」の節が出て、行を押すとその端子へ飛ぶ
  sandbox.showConnTable();
  const b2 = domEls['report-body'].innerHTML;
  ok(/未接続の端子 2か所/.test(b2) && /未接続の端子<span/.test(b2), '接続チェックの表に「未接続の端子」の件数と節がある');
  ok(/jumpToRefEl\(0,(?:&quot;|")?13(?:&quot;|")?,\{x:210,y:0\}\)/.test(b2) || /jumpToRefEl\(0,[^)]*\{x:210,y:0\}\)/.test(b2), '行を押すと、その端子の位置へ飛ぶ(ページ・要素ID・端子の座標)');
  // CSVにも(画面と同じ内容)
  domEls['report-csv-btn'].onclick();
  ok(lastCsv.content.includes('"MC1:14","未接続の端子(配線の端が来ていない)"') && lastCsv.content.includes('"MC2:14"'), 'CSVの末尾にも未接続の端子が出る');
  // ツールバーの「⚠未接続」: 全ページの結果を持ち、接続チェックの表を開く(alertは出さない)
  vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_check.js', 'utf8').replace(/\r\n/g, '\n'), sandbox);
  let alerted = 0; sandbox.alert = () => { alerted++; };
  sandbox.syncUnconnectedBtn = () => {}; sandbox.state.showUnconnected = false; sandbox.state._unconnectedResults = [];
  domEls['report-title'].textContent = '';
  sandbox.runUnconnectedCheck();
  ok(sandbox.state.showUnconnected === true && sandbox.state._unconnectedResults.length === 2, 'ボタンで結果を持ち、マーカー表示をONにする');
  ok(domEls['report-title'].textContent === '接続チェック' && alerted === 0, '一覧(接続チェックの表)を開く。alertは出さない');
  ok(fs.readFileSync(__dirname + '/../js/draw.js', 'utf8').replace(/\r\n/g, '\n').includes('r.pageIdx === state.currentPage'), 'マーカーは今のページの分だけ描く(結果は全ページ分を持つ)');
  ok(!/Math\.hypot|cS\.terminals/.test(fs.readFileSync(__dirname + '/../js/conn_check.js', 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '')), 'conn_check.js に独自の座標計算は無い(計算は conn_table.js に1つ)');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
