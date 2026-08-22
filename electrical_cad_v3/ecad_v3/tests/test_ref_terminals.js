// 接点・コイル リファレンス(showRefPanel)に端子番号を出す機能のテスト
//   node tests/test_ref_terminals.js
//
// 【背景】2026-08-21に端子ラベル(cS.terminals[i].label)が実装され、
// 「その前提だった端子ラベルが実装できたので次はクロスリファレンスに
// 端子番号を出す」がHANDOFF.mdの本命候補だった。
// 従来のshowRefPanelはデバイス単位で「a接点 2/B3」としか出さず、同じデバイスに
// a接点が2組(主接点/補助接点)あると区別できなかった。
// elTerminalLabel()を新設し、el.terminals(個体差) → cS.terminals[i].label
// (シンボル定義の既定)の優先順位で「13-14」のような表示を作れるようにした。
// conn_table.jsの表示優先順位と同じロジックを、書き写した再実装ではなく
// report.js/data.jsの実コードをevalして検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => {
  if (!cond) { ng++; console.log('  NG', m); }
  else console.log('  OK', m);
};

// ------------------------------------------------------------------
// サンドボックスの準備。data.js(DEFS/getDef)とreport.jsを実コードでeval。
// ------------------------------------------------------------------
const domEls = {};
function stubEl() {
  return { innerHTML: '', textContent: '', style: {}, onclick: null };
}
['report-tabs', 'report-title', 'report-body', 'report-csv-btn'].forEach(id => { domEls[id] = stubEl(); });

let lastCsv = null;
const sandbox = {
  document: { getElementById: id => domEls[id] || null },
  openFP: () => {}, closeFP: () => {},
  dl: (content, name) => { lastCsv = { content, name }; },
  console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/data.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);

// state・customSymbolsをテスト用に用意
// カスタムシンボル: role指定の接点シンボル(コンタクタ用、主接点2端子)
sandbox.state = {
  pages: [],
  customSymbols: [
    { type: 'my_contact_a', role: 'contact_a', terminals: [{ x: -10, y: 0, label: '1' }, { x: 10, y: 0, label: '2' }] },
  ],
};
// カスタムシンボルをDEFSに反映(getDef()経由でroleを引くのに必要。symRole()の実挙動)
sandbox.loadCustomSymbolDefs();

// ------------------------------------------------------------------
console.log('【elTerminalLabel: 優先順位(el.terminals > cS.terminals[i].label)】');

// ①個体差(el.terminals)が入っていればそれを使う(主接点13-14 / 補助接点23-24の書き分け)
const elMain = { type: 'my_contact_a', terminals: '13,14' };
eq(sandbox.elTerminalLabel(elMain), '13-14', '部品割当済みの主接点は13-14');

const elAux = { type: 'my_contact_a', terminals: '23,24' };
eq(sandbox.elTerminalLabel(elAux), '23-24', '同じシンボルでも個体差で補助接点は23-24');

// ②el.terminalsが無ければシンボル定義側の既定ラベルにフォールバック
const elNoAssign = { type: 'my_contact_a', terminals: '' };
eq(sandbox.elTerminalLabel(elNoAssign), '1-2', '部品未割当ならシンボル定義側の既定(1-2)');

// ③標準シンボル(sw_no等、カスタムシンボルではない)はcS無し=2端子扱い。
// 定義側ラベルが無いので、el.terminalsが無ければ空文字になる(通し番号T1,T2は使わない)
const elBuiltinAssigned = { type: 'sw_no', terminals: '3,4' };
eq(sandbox.elTerminalLabel(elBuiltinAssigned), '3-4', '標準シンボル(sw_no)でも部品割当済みなら3-4');
const elBuiltinNoAssign = { type: 'sw_no', terminals: '' };
eq(sandbox.elTerminalLabel(elBuiltinNoAssign), '', '標準シンボルで割当も定義ラベルも無ければ空文字');

// ------------------------------------------------------------------
console.log('【showRefPanel: 端子番号つきでa接点2組を区別できる】');

sandbox.state.pages = [
  {
    frameObj: null,
    elements: [
      { id: 1, type: 'coil', partRef: 'MC1' },
      { id: 2, type: 'my_contact_a', partRef: 'MC1', terminals: '1,3' },   // 主接点
      { id: 3, type: 'my_contact_a', partRef: 'MC1', terminals: '13,14' }, // 補助接点
    ],
  },
];

sandbox.showRefPanel();
const body = domEls['report-body'].innerHTML;
ok(body.includes('a(1-3)'), '主接点が a(1-3) として表示される: ' + body.includes('a(1-3)'));
ok(body.includes('a(13-14)'), '補助接点が a(13-14) として表示される: ' + body.includes('a(13-14)'));

// CSV書き出しにも端子番号列が入ること
domEls['report-csv-btn'].onclick();
ok(lastCsv && lastCsv.content.includes('端子番号'), 'CSVヘッダーに端子番号列がある');
ok(lastCsv && lastCsv.content.includes('1-3') && lastCsv.content.includes('13-14'), 'CSV本文に端子番号が出力される');

// ------------------------------------------------------------------
console.log('【showRefPanel: 同じ端子番号の接点が重複していれば警告】');

sandbox.state.pages = [
  {
    frameObj: null,
    elements: [
      { id: 1, type: 'coil', partRef: 'MC2' },
      { id: 2, type: 'my_contact_a', partRef: 'MC2', terminals: '13,14' },
      { id: 3, type: 'my_contact_a', partRef: 'MC2', terminals: '13,14' }, // 同じ端子番号を誤って二重配置
    ],
  },
];
sandbox.showRefPanel();
const body2 = domEls['report-body'].innerHTML;
ok(body2.includes('端子番号重複'), '同一端子番号(13-14)の重複配置を警告する');

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
