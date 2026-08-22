// 端子台の「デバイスで統一」まわりのテスト
//   node tests/test_junction_device.js
//
// 【背景】盛田さんの「端子台はプロパティまで出来ないと使えない」「種類は関係ない、
// デバイスで統一できるなら問題ない」への対応。
// 端子台は「台」という実体を持たず、同じデバイス名(TB1)の端子が集計時に1台として
// 束ねられる作り。そのため型式を端子1個ずつ手入力する必要があり、TB1の端子が
// 20個あれば20回打つことになっていた。
//
// 実装したのは次の2点:
//   1. collectDeviceInfo が端子台の label(=端子番号)を「仕様」として拾わないよう修正
//      ← これを直さずに引き継ぎを付けると端子番号が全端子にコピーされ、全部同じ
//        番号になる(実装前に発見した不具合)
//   2. 型式を1個の端子に入れると、同じデバイスの端子すべてに反映される

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};

// ------------------------------------------------------------------
// サンドボックス。ui.js は巨大なので、対象の3関数だけを切り出してevalする。
// (ui.js 全体はDOM構築時に大量の要素を触るためNode上では読み込めない)
// 切り出しは「関数定義をそのままの文字列で取り出す」方式なので、実コードと
// 同じものを検証している。
// ------------------------------------------------------------------
const src = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  // 対応する閉じ括弧まで(トップレベル関数なので行頭の } で終わる)
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
};

const domEls = {};
const sandbox = {
  document: { getElementById: id => domEls[id] || null },
  console,
  draw: () => {},
  pushH: () => { sandbox._pushed = (sandbox._pushed || 0) + 1; },
  _escAttr: s => String(s),
};
vm.createContext(sandbox);
vm.runInContext(
  [grab('collectDeviceInfo'), grab('onJunctionRefChanged'), grab('onJunctionModelChanged')].join('\n'),
  sandbox
);

// ------------------------------------------------------------------
console.log('【collectDeviceInfo: 端子台の端子番号を「仕様」として拾わない】');

sandbox.state = {
  pages: [{
    elements: [
      // TB1 の端子3個。label は端子番号(1,2,3)であって仕様ではない
      { id: 1, type: 'junction', style: 'circle', partRef: 'TB1', partModel: '端子台 M4', label: '1' },
      { id: 2, type: 'junction', style: 'circle', partRef: 'TB1', label: '2' },
      { id: 3, type: 'junction', style: 'circle', partRef: 'TB1', label: '3' },
      // 比較用: 普通のシンボルは label が仕様なので今まで通り拾う
      { id: 4, type: 'coil', partRef: 'MC1', partModel: 'S-T10', label: 'AC200V 3.7kW' },
    ],
  }],
  sel: { els: new Set() },
};
sandbox.state.elements = sandbox.state.pages[0].elements;

const info = sandbox.collectDeviceInfo();
eq(info.get('TB1').spec, '', 'TB1の仕様は空（端子番号「1」が混入しない）');
eq(info.get('TB1').model, '端子台 M4', 'TB1の型式は拾う');
eq(info.get('MC1').spec, 'AC200V 3.7kW', 'シンボル(MC1)の仕様は今まで通り拾う');

// ------------------------------------------------------------------
console.log('【onJunctionRefChanged: デバイスを選ぶと型式だけ引き継ぐ】');

// 新しく置いた端子(型式・番号なし)にデバイスTB1を入れる
const newTerm = { id: 5, type: 'junction', style: 'circle', partRef: '', partModel: '', label: '' };
sandbox.state.pages[0].elements.push(newTerm);
sandbox.state.sel.els = new Set([5]);
domEls['pp-jref'] = { value: 'TB1' };
domEls['pp-jmodel'] = { value: '' };

sandbox.onJunctionRefChanged();
eq(newTerm.partRef, 'TB1', 'デバイスが設定される');
eq(newTerm.partModel, '端子台 M4', '同じ台の型式が引き継がれる');
eq(domEls['pp-jmodel'].value, '端子台 M4', '入力欄にも反映される（適用で消えないように）');
eq(newTerm.label, '', '端子番号は引き継がない（ここが混ざると全端子が同じ番号になる）');

// 新規デバイスなら何も引き継がない
const freshTerm = { id: 6, type: 'junction', style: 'circle', partRef: '', partModel: '', label: '' };
sandbox.state.pages[0].elements.push(freshTerm);
sandbox.state.sel.els = new Set([6]);
domEls['pp-jref'] = { value: 'TB9' };
domEls['pp-jmodel'] = { value: '' };
sandbox.onJunctionRefChanged();
eq(freshTerm.partRef, 'TB9', '新規デバイスでも名前は入る');
eq(freshTerm.partModel, '', '新規デバイスなら型式は空のまま');

// ------------------------------------------------------------------
console.log('【onJunctionModelChanged: 型式を同じデバイスの端子すべてに反映】');

sandbox.state.sel.els = new Set([1]);
domEls['pp-jmodel'] = { value: '端子台 M6' };
sandbox.onJunctionModelChanged();

const tb1 = sandbox.state.pages[0].elements.filter(e => e.partRef === 'TB1');
eq(tb1.map(e => e.partModel), ['端子台 M6', '端子台 M6', '端子台 M6', '端子台 M6'],
   'TB1の端子4個すべてに型式が入る（1回の入力で済む）');
eq(tb1.map(e => e.label), ['1', '2', '3', ''], '端子番号は書き換えない');
eq(sandbox.state.pages[0].elements.find(e => e.id === 4).partModel, 'S-T10',
   '別デバイス(MC1)は巻き込まれない');
eq(sandbox.state.pages[0].elements.find(e => e.id === 6).partModel, '',
   '別デバイス(TB9)は巻き込まれない');

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
