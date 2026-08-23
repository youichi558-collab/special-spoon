// 端子(junction)の見た目コピー・貼り付けのテスト
//   node tests/test_junction_copy_paste.js
//
// 【背景】盛田さん「端子台プロパティにもコピー貼付けがいる」。一般要素側には
// 2026-08-03からデバイス/型式/仕様のコピー貼り付けがあったが、端子(junction)は
// 対象外だった(copyDeviceProps/pasteDevicePropsはel.type==='junction'を弾く)。
//
// 端子用は一般要素と同じ形だが、対象フィールドを絞ってある:
//   ・partRef/partModel/panelZone(デバイス識別情報)は含めない。
//     onJunctionRefChanged(デバイス名を打つと引き継ぐ)という別の仕組みが
//     既にあり、コピー貼り付けまで対象にすると、貼り付け先の端子が別デバイス
//     だった場合にデバイス名を誤って上書きする事故になりやすい
//   ・label(端子番号)は絶対に含めない。端子ごとに違う値であり、貼り付けで
//     上書きすると全部同じ番号になってしまう
// 対象は表示ON/OFFと、色・サイズ・位置補正(見た目)のみ。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

const src = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
};
const grabConst = (name) => {
  const start = src.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`定数 ${name} が見つかりません`);
  const end = src.indexOf('];', start) + 2;
  return src.slice(start, end);
};

function makeSandbox() {
  const rp = { _el: null };
  const sandbox = {
    console,
    document: { getElementById: id => (id === 'rp-body' ? rp : null) },
    applyRightPanel: () => {},           // 未確定編集の反映はここでは対象外
    updateRightPanel: () => {},
    draw: () => {},
    pushH: () => { sandbox._pushed = (sandbox._pushed || 0) + 1; },
    junctionClipboard: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [grabConst('JUNCTION_PROP_KEYS'), grab('copyJunctionProps'), grab('pasteJunctionProps')].join('\n'),
    sandbox
  );
  sandbox._rp = rp;
  return sandbox;
}

const TERM = (over) => Object.assign({
  id: Math.random(), type: 'junction', style: 'circle',
  partRef: 'TB1', partModel: '端子台 M4', label: '1', panelZone: undefined,
}, over);

// ------------------------------------------------------------------
console.log('【copyJunctionProps: 端子以外からはコピーできない】');
{
  const s = makeSandbox();
  const alerts = [];
  s.alert = m => alerts.push(m);
  s._rp._el = { type: 'fline' };
  s.copyJunctionProps();
  ok(alerts.length === 1, '端子以外を選んでいるとアラートが出る');
  ok(s.junctionClipboard === null, 'クリップボードは更新されない');
}

console.log('【copyJunctionProps: 見た目フィールドだけをコピーする】');
{
  const s = makeSandbox();
  s._rp._el = TERM({
    showDev: true, devFs: 14, devColor: '#ff0000', devOffX: 3, devOffY: -2,
    labelFs: 9, labelColor: '#00ff00', labelOffX: 1, labelOffY: 1,
  });
  s.copyJunctionProps();
  eq(s.junctionClipboard.devFs, 14, 'devFsがコピーされる');
  eq(s.junctionClipboard.devColor, '#ff0000', 'devColorがコピーされる');
  eq(s.junctionClipboard.labelColor, '#00ff00', 'labelColorがコピーされる');
  ok(!('partRef' in s.junctionClipboard), 'partRef(デバイス名)はコピーされない');
  ok(!('partModel' in s.junctionClipboard), 'partModel(型式)はコピーされない');
  ok(!('panelZone' in s.junctionClipboard), 'panelZone(対象外)はコピーされない');
  ok(!('label' in s.junctionClipboard), 'label(端子番号)は絶対にコピーされない');
}

console.log('【pasteJunctionProps: 選択中の端子すべてに見た目だけ貼り付く】');
{
  const s = makeSandbox();
  s._rp._el = TERM({ devFs: 20, devColor: '#123456', labelColor: '#abcdef' });
  s.copyJunctionProps();

  const target1 = TERM({ id: 't1', partRef: 'TB2', label: '5', partModel: '別の型式' });
  const target2 = TERM({ id: 't2', partRef: 'TB3', label: 'A', panelZone: '外' });
  s.state = { sel: { els: new Set(['t1','t2']) }, elements: [target1, target2] };

  s.pasteJunctionProps();

  eq(target1.devFs, 20, 'target1: devFsが貼り付く');
  eq(target1.devColor, '#123456', 'target1: devColorが貼り付く');
  eq(target1.partRef, 'TB2', 'target1: デバイス名は変わらない(TB2のまま)');
  eq(target1.label, '5', 'target1: 端子番号は変わらない(5のまま)');
  eq(target1.partModel, '別の型式', 'target1: 型式は変わらない');

  eq(target2.labelColor, '#abcdef', 'target2: labelColorが貼り付く');
  eq(target2.partRef, 'TB3', 'target2: デバイス名は変わらない(TB3のまま)');
  eq(target2.panelZone, '外', 'target2: 対象外の設定は変わらない');

  eq(s._pushed, 1, 'pushHが呼ばれる(undo対応)');
}

console.log('【pasteJunctionProps: 一般要素は貼り付け対象から除外される】');
{
  const s = makeSandbox();
  s._rp._el = TERM({ devFs: 20 });
  s.copyJunctionProps();

  const junctionTarget = TERM({ id: 't1' });
  const symbolTarget   = { id: 't2', type: 'coil', devFs: 11 };
  s.state = { sel: { els: new Set(['t1','t2']) }, elements: [junctionTarget, symbolTarget] };
  s.pasteJunctionProps();

  eq(junctionTarget.devFs, 20, '端子には貼り付く');
  eq(symbolTarget.devFs, 11, '一般要素(coil)には貼り付かない(元のまま)');
}

console.log('【pasteJunctionProps: コピーしていなければ何もしない】');
{
  const s = makeSandbox();
  const alerts = [];
  s.alert = m => alerts.push(m);
  s.state = { sel: { els: new Set() }, elements: [] };
  s.pasteJunctionProps();
  ok(alerts.length === 1, '先にコピーするよう促すアラートが出る');
}

console.log('【pasteJunctionProps: 未選択でも右パネルの対象1件には貼り付けられる】');
{
  const s = makeSandbox();
  s._rp._el = TERM({ devColor: '#999999' });
  s.copyJunctionProps();

  const only = TERM({ id: 'only' });
  s._rp._el = only;
  s.state = { sel: { els: new Set() }, elements: [only] };
  s.pasteJunctionProps();
  eq(only.devColor, '#999999', '未選択でも右パネルに開いている端子に貼り付く');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
