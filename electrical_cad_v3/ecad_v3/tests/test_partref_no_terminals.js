// デバイスを選び直しても端子番号は引き継がないことのテスト(2026-09-24)
//   node tests/test_partref_no_terminals.js
//
// 盛田さん「端子番号をコピーが悪さする、同じデバイスでも端子番号は違う」。
// 貼り付け直後にデバイスを既存のものへ変えると、onPartRefChanged が
// 同じデバイスの別シンボル(コイル等)の端子番号で上書きしていた。
// 実装(js/ui.js の onPartRefChanged)をそのまま動かして確かめる。
const fs = require('fs');
const vm = require('vm');
const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const s = ui.indexOf(`function ${name}(`);
  if (s < 0) throw new Error(`関数 ${name} が見つかりません`);
  return ui.slice(s, ui.indexOf('\n}', s) + 2);
};

let ng = 0;
const eq = (a, b, m) => { const p = JSON.stringify(a) === JSON.stringify(b);
  if (!p) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };

const coil = { id: 1, partRef: 'MC2', partModel: 'S-T10', label: 'AC100V', terminals: 'A1,A2' };
const cont = { id: 2, partRef: 'MC1', partModel: 'X', label: 'AC200V', terminals: '13,14', termOff: [[3, 0], [0, -2]] };
const inputs = {
  'pp-partref': { value: 'MC2' }, 'pp-partmodel': { value: 'X' },
  'pp-label': { value: 'AC200V' }, 'pp-term': { value: '13,14' },
};
const sb = {
  state: { elements: [coil, cont], sel: { els: new Set([2]) } },
  document: { getElementById: id => inputs[id] || null },
  pushH() {}, draw() {}, onPartModelChanged() {},
  collectDeviceInfo: () => new Map([['MC2', { model: 'S-T10', spec: 'AC100V', terminals: 'A1,A2', volt: '', zone: '' }]]),
};
vm.createContext(sb);
vm.runInContext(grab('onPartRefChanged'), sb);
vm.runInContext('onPartRefChanged()', sb);

console.log('【デバイスをMC1→MC2(既存)に変えた接点】');
eq(cont.partRef, 'MC2', 'デバイスは変わる');
eq(cont.partModel, 'S-T10', '型番は引き継ぐ(従来どおり)');
eq(cont.label, 'AC100V', '仕様は引き継ぐ(従来どおり)');
eq(cont.terminals, '13,14', '端子番号は引き継がない(コイルのA1,A2で上書きしない)');
eq(inputs['pp-term'].value, '13,14', '端子番号の入力欄も書き換えない(適用で上書きされないように)');
eq(cont.termOff, [[3, 0], [0, -2]], '位置補正もそのまま');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
