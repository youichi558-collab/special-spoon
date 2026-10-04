// 部品表は参照図面(プロジェクト)まで含めた盤全体で集計する(2026-10-04 js/report.js collectBOMRows)
//   node tests/test_bom_project.js
// 盛田さん「部品表は確実に全体見ないと使い物にならん」。以前は開いているファイルだけで、1ページ1ファイルに分けると
// そのページの部品しか出なかった。
// このテストが守るもの:
//   1. 別ファイルの記号も数える。同じデバイスがファイルをまたいでも1台
//   2. 別ファイルだけにあるデバイスの行は表示だけ(打つ欄を出さない)。どのファイルかを出す
//   3. 打った値は開いているファイルの記号にだけ入る(別ファイルは読むだけ)
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
let _html = '';
const sb = { console, pushH() {}, draw() {}, dl() {}, confirm: () => true, alert() {}, updateRightPanel() {}, window: {}, document: { getElementById: () => null },
  escH: require('./_esch.js').escH,
  getDef: t => ({ coil: { w: 40, h: 40, role: 'coil' }, ca: { w: 40, h: 40, role: 'contact_a' } }[t] || { w: 20, h: 20 }) };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState;', sb);
sb._reportOpen = (k, ti, h) => { _html = h; };

let id = 0;
const E = (type, ref, o) => Object.assign({ id: 'e' + (++id), type, x: 0, y: 0, partRef: ref }, o);
const cr1coil = E('coil', 'CR1', { partModel: 'MY4N' });
sb.state = { pages: [{ name: 'P1', elements: [cr1coil, E('ca', 'CR2', { partModel: 'MY2N' })], wires: [] }], currentPage: 0, customSymbols: [], customParts: [] };
sb.xprojState.files = [{ name: 'B.json', pages: [{ name: 'P2', elements: [E('ca', 'CR1', { partModel: 'MY4N' }), E('ca', 'CR1', { partModel: 'MY4N' }), E('coil', 'CR9', { partModel: 'MY2N' })], wires: [] }], symbols: [] }];

console.log('【別ファイルも数える】');
{
  const rows = sb.collectBOMRows().filter(r => !r.noRef);
  const by = Object.fromEntries(rows.map(r => [r.refs[0], r]));
  eq(Object.keys(by).sort(), ['CR1', 'CR2', 'CR9'], '★別ファイルだけのデバイス(CR9)も出る');
  eq([by.CR1.count, by.CR1.parts], [1, 3], '★ファイルをまたぐ CR1 は1台(構成数はコイル1+別ファイルの接点2)');
  eq([by.CR1.local, by.CR1.extFiles], [true, ['B']], 'CR1: 開いているファイルにもある・別ファイル B にもある');
  eq([by.CR9.local, by.CR9.extFiles], [false, ['B']], 'CR9: 別ファイルだけ');
  eq(sb.state.pages.length, 1, '集計のあと、開いているファイルのページは元のまま');
}

console.log('\n【表示】');
{
  sb.showBOM();
  ok(/このファイル1ページ＋参照図面1ページを集計/.test(_html), '★集計した範囲を出す');
  const cr9 = _html.split('<tr').find(t => />CR9</.test(t)) || '';
  ok(cr9 && !/<input/.test(cr9) && /別ファイル: B/.test(cr9), '★別ファイルだけの行は打つ欄が無く、どのファイルかを出す');
  const cr1 = _html.split('<tr').find(t => />CR1</.test(t)) || '';
  ok(/<input/.test(cr1) && /＋別ファイル: B/.test(cr1), '両方にある行は打てて、別ファイルにもあることを添える');
}

console.log('\n【打った値は開いているファイルにだけ】');
{
  const rows = sb.collectBOMRows();
  sb.window._bomRows = rows;
  const i = rows.findIndex(r => r.refs && r.refs[0] === 'CR1');
  sb.setBOMMaker(i, 'オムロン');
  eq(cr1coil.partMaker, 'オムロン', '★開いているファイルのコイルに入る');
  ok(sb.xprojState.files[0].pages[0].elements.every(e => !e.partMaker), '★別ファイルの記号は変えない(読むだけ)');
}

console.log('\n【参照図面が無いとき】');
{
  sb.xprojState.files = [];
  sb.showBOM();
  ok(/このファイル1ページを集計/.test(_html) && /参照図面を設定すると盤全体の部品表になります/.test(_html), '参照図面を設定するよう案内する');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
