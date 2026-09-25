// ================================================================
// 「欠番を詰める」: ネット内に異なる線番が混在しているときは実行しない
//
// 【2026-09-25】混在ネットは最初の番号しか「使用中」に数えないため、残りの番号が
// 空き扱いになり、別の線がその番号へ詰められて重複していた。
//   a:W01 b:W02(aと●でつながる) c:W03 → 詰めると c が W02 になり b と重複
// 盛田さんの決定A: 混在があれば止めて、線番表でそろえてもらう。
//
// report.js の実コード(parseWireNo / groupWiresByNet / compactAllWireNumbers)を動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const src = fs.readFileSync(__dirname + '/../js/report.js', 'utf8').replace(/\r\n/g, '\n');
const pick = n => {
  const s = src.indexOf('function ' + n + '(');
  const e = src.indexOf('\n}\n', s);
  if (s < 0 || e < 0) throw new Error(n + ' が見つかりません');
  return src.slice(s, e + 3);
};

function run(wires, elements) {
  const log = { alert: 0, confirm: 0, pushH: 0, table: null };
  const sb = {
    state: { pages: [{ elements, wires }] },
    alert: () => { log.alert++; },
    confirm: () => { log.confirm++; return true; },
    pushH: () => { log.pushH++; },
    draw: () => {},
    wireNoTable: m => { log.table = m; },
  };
  vm.createContext(sb);
  vm.runInContext('const WIRE_NET_TOL=5;\n'
    + ['parseWireNo', 'groupWiresByNet', 'compactAllWireNumbers'].map(pick).join('\n'), sb);
  vm.runInContext('compactAllWireNumbers()', sb);
  return { log, nos: wires.map(w => w.wireNo) };
}

console.log('【混在があれば詰めない】');
{
  const { log, nos } = run([
    { id: 'a', x1: 0,   y1: 0, x2: 100, y2: 0,  wireNo: 'W01' },
    { id: 'b', x1: 50,  y1: 0, x2: 50,  y2: 50, wireNo: 'W02' },   // ●でaとつながる
    { id: 'c', x1: 500, y1: 0, x2: 600, y2: 0,  wireNo: 'W03' },
  ], [{ type: 'junction', x: 50, y: 0, style: 'dot' }]);
  ok(nos.join(',') === 'W01,W02,W03', `線番が1本も変わらない(${nos.join(',')})`);
  ok(new Set(nos).size === 3, '重複が出ない');
  ok(log.alert === 1, '理由を知らせる');
  ok(log.confirm === 0 && log.pushH === 0, '確認・履歴積みの前に止まる');
  ok(/混在1件/.test(log.table || ''), '線番表を開き、混在件数を出す');
}

console.log('\n【混在が無ければ従来どおり詰める】');
{
  const { log, nos } = run([
    { id: 'a', x1: 0,   y1: 0, x2: 100, y2: 0,  wireNo: 'W01' },
    { id: 'b', x1: 50,  y1: 0, x2: 50,  y2: 50, wireNo: 'W01' },   // ●でつながり同じ番号
    { id: 'c', x1: 500, y1: 0, x2: 600, y2: 0,  wireNo: 'W03' },
  ], [{ type: 'junction', x: 50, y: 0, style: 'dot' }]);
  ok(nos.join(',') === 'W01,W01,W02', `W03 が W02 に詰まる(${nos.join(',')})`);
  ok(log.alert === 0 && log.confirm === 1, '確認ダイアログは従来どおり出る');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
