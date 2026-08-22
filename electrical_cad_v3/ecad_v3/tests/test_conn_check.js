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
  getDef: () => ({ w: 20 }),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8'), sandbox);

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
      ],
      wires: [
        // TB1-1 → 分岐点（分岐点側は特定できない＝分岐点としか出ない）
        { id:'w1', wireNo:'W101', layer:'L1', x1:0,   y1:0, x2:100, y2:0 },
        // 分岐点 → MC1の端子13（x=190がMC1の左端子）
        { id:'w2', wireNo:'W101', layer:'L1', x1:100, y1:0, x2:190, y2:0 },
        // 端点が端子から大きく外れている（目視では繋がって見えるがズレている）
        { id:'w3', wireNo:'W102', layer:'L1', x1:0,   y1:60, x2:80, y2:60 },
        // 線番が振られていない
        { id:'w4', wireNo:'',     layer:'L1', x1:0,   y1:0,  x2:210, y2:0 },
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
console.log('【全ページ集計（端子表の「現在ページのみ」が解消されている）】');
eq(sandbox.buildConnectionRows().length, 4, '2ページ分を走査して配線4本を拾う');

// ------------------------------------------------------------------
console.log('【問題のある行を先頭に集める】');
sandbox.setConnSort('wire');
const rows = sandbox._connSortRows(sandbox.buildConnectionRows());
const issues = rows.map(r => sandbox._connRowIssue(r));
// 先頭2行が問題行（端子未特定 or 未採番）、後ろは正常
ok(issues[0] !== '' && issues[1] !== '', `問題行が先頭に来る（${issues.join(' / ')}）`);
ok(issues[issues.length - 1] === '', '正常な行は後ろに回る');

// ------------------------------------------------------------------
console.log('【状態の判定】');
const byWire = {};
rows.forEach(r => { byWire[r.wireNo || '(未採番)'] = sandbox._connRowIssue(r); });
eq(byWire['W102'], '端子未特定', '端点が端子から離れた配線は「端子未特定」');
eq(byWire['(未採番)'], '未採番', '線番が無い配線は「未採番」');

// ------------------------------------------------------------------
console.log('【分岐点は特定不可として扱う（不具合ではない）】');
sandbox.showConnTable();
const body = domEls['report-body'].innerHTML;
ok(body.includes('分岐点'), '分岐点と表示される');
ok(body.includes('同電位'), '分岐点の先が特定できない理由を説明している');
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
ok(lastCsv && lastCsv.name === 'connection_check.csv', 'ファイル名が connection_check.csv');
ok(lastCsv.content.split('\n')[0].includes('状態'), 'ヘッダーに状態列がある');
ok(lastCsv.content.includes('端子未特定'), '本文に状態が出力される');
ok(lastCsv.content.split('\n')[1].startsWith('"'), '各値がクォートされている（生カンマ対策）');

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
