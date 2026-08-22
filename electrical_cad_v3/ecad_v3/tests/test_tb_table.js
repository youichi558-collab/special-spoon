// 端子台表（並べ替え・型式表示）のテスト
//   node tests/test_tb_table.js
//
// 【背景】盛田さんの「端子台回りの修正を終わらせろ」への対応。
// 実コードを読んで見つかった不具合2件を検証する。
//
//   1. デバイスを跨いだドラッグにガードが無かった
//      端子台表はデバイス(TB1/TB2…)ごとにグループ表示するが、tbOrderは全端子の
//      通し番号。TB1の端子をTB2の行へ落とすとtbOrderだけTB2の位置へ移るのに
//      partRefは変わらないため、表示はTB1グループに残ったまま順序だけ不可解に
//      変わっていた。跨ぎは拒否する。
//   2. 型式が全行に重複表示されていた
//      型式は同じデバイスで揃う運用(6a7824c)にしたため、20端子あれば同じ文字が
//      20回並ぶ。台の見出しに1回だけ出し、揃っていないときだけ警告する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// ------------------------------------------------------------------
// report.js / conn_table.js を実コードのままevalする。
// トップレベルの let があるため vm.runInContext + createContext が必須。
// ------------------------------------------------------------------
const domEls = {};
const stub = () => ({ innerHTML:'', textContent:'', style:{}, onclick:null, classList:{ add(){}, remove(){} } });
['report-tabs','report-title','report-body','report-csv-btn'].forEach(id => { domEls[id] = stub(); });

let lastAlert = null;
const sandbox = {
  document: { getElementById: id => domEls[id] || null },
  console,
  alert: msg => { lastAlert = msg; },
  openFP: () => {}, closeFP: () => {},
  draw: () => {},
  pushH: () => { sandbox._pushed = (sandbox._pushed || 0) + 1; },
  dl: () => {},
  CONN_TABLE_TOL: 5,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8'), sandbox);

// 端子2台ぶん。TB1=3点(型式そろい)、TB2=2点(型式バラバラ)
const mkState = () => ({
  customSymbols: [],
  pages: [{
    name: 'Sheet1', frameObj: null, wires: [],
    elements: [
      { id:11, type:'junction', style:'circle', partRef:'TB1', partModel:'端子台 M4', label:'1', x:0,  y:0 },
      { id:12, type:'junction', style:'circle', partRef:'TB1', partModel:'端子台 M4', label:'2', x:10, y:0 },
      { id:13, type:'junction', style:'circle', partRef:'TB1', partModel:'端子台 M4', label:'3', x:20, y:0 },
      { id:21, type:'junction', style:'circle', partRef:'TB2', partModel:'端子台 M6', label:'1', x:0,  y:50 },
      { id:22, type:'junction', style:'circle', partRef:'TB2', partModel:'端子台 M4', label:'2', x:10, y:50 },
      // ●塗りつぶしは分岐点なので端子台には出ない
      { id:31, type:'junction', style:'dot', x:0, y:99 },
    ],
  }],
});
sandbox.state = mkState();
sandbox.state.elements = sandbox.state.pages[0].elements;
sandbox.state.wires = sandbox.state.pages[0].wires;

const ev = () => ({ preventDefault(){}, dataTransfer:null, currentTarget:null });

// ------------------------------------------------------------------
console.log('【collectTerminals: ○白丸/◎二重丸だけを端子として拾う】');
eq(sandbox.collectTerminals().map(r => r.el.id), [11,12,13,21,22], '●分岐点(id31)は端子に含めない');

// ------------------------------------------------------------------
console.log('【tbDrop: デバイスを跨いだ並べ替えは拒否する】');
lastAlert = null;
sandbox._pushed = 0;
const before = sandbox.collectTerminals().map(r => r.el.id);
sandbox.tbDragStart(ev(), '11');
sandbox.tbDrop(ev(), '22');            // TB1の端子 → TB2の行へ落とす
ok(lastAlert && lastAlert.includes('別の端子台へは移動できません'), '警告が出る');
eq(sandbox.collectTerminals().map(r => r.el.id), before, '並び順は変わらない');
eq(sandbox._pushed, 0, '履歴に積まない（何も変えていないので）');

// ------------------------------------------------------------------
console.log('【tbDrop: 同じデバイス内なら並べ替えできる】');
lastAlert = null;
sandbox._pushed = 0;
sandbox.tbDragStart(ev(), '13');
sandbox.tbDrop(ev(), '11');            // TB1の3番目を先頭へ
eq(lastAlert, null, '警告は出ない');
eq(sandbox.collectTerminals().map(r => r.el.id), [13,11,12,21,22], '3番目が先頭へ移動');
eq(sandbox._pushed, 1, '履歴に1回積む');

// ------------------------------------------------------------------
console.log('【renumberTerminals: 並べ替えた順に1から振り直す】');
sandbox.renumberTerminals('TB1');
const tb1 = sandbox.state.pages[0].elements.filter(e => e.partRef === 'TB1');
eq(tb1.find(e => e.id === 13).label, '1', '先頭へ移動した端子が「1」になる');
eq(tb1.find(e => e.id === 11).label, '2', '元の1番目が「2」になる');
eq(tb1.find(e => e.id === 12).label, '3', '元の2番目が「3」になる');
eq(sandbox.state.pages[0].elements.filter(e => e.partRef === 'TB2').map(e => e.label), ['1','2'],
   '別デバイス(TB2)の番号は巻き込まれない');

// ------------------------------------------------------------------
console.log('【showTBTable: 型式は台の見出しに1回だけ / 不揃いは警告】');
sandbox.showTBTable();
const body = domEls['report-body'].innerHTML;

// TB1は型式が揃っているので見出しに1回だけ出る
const tb1ModelCount = (body.match(/端子台 M4/g) || []).length;
// TB2は M6 と M4 が混在しているので「揃っていません」と両方の型式が出る
ok(body.includes('型式が揃っていません'), 'TB2の型式不揃いを警告する');
ok(!/<th>型式<\/th>/.test(body), '表の列から型式が消えている（全行の重複表示をやめた）');
ok(tb1ModelCount <= 2, `TB1の型式が繰り返されない（出現${tb1ModelCount}回、端子は3点）`);

// 未接続の検出は従来どおり
ok(body.includes('未接続'), '未接続の端子を赤字で示す');

// ------------------------------------------------------------------
console.log('【showTBTable: 型式未設定の台は「型式未設定」と出す】');
sandbox.state = mkState();
sandbox.state.elements = sandbox.state.pages[0].elements;
sandbox.state.wires = sandbox.state.pages[0].wires;
sandbox.state.pages[0].elements.forEach(e => { if (e.partRef === 'TB1') e.partModel = ''; });
sandbox.showTBTable();
ok(domEls['report-body'].innerHTML.includes('型式未設定'), '型式が空の台は「型式未設定」と表示');

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
