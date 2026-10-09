// 外形図DXFの紐付けが、部品データの置き換えで消えないことのテスト
//   node tests/test_outline_dxf_keep.js
//
// 【背景】外形図DXFはカタログにもCSVにも列が無く、盛田さんが手で1件ずつ
// 紐付けたデータ。部品データを新しい内容で置き換えるとき、意識して引き継がないと
// 必ず消える。**実際に2回消している**:
//
//   2026-08-19  CSV一括登録(bulkImportParts)が Object.assign で丸ごと上書きしていた
//               → このとき修正した
//   2026-09-01  カタログDBからの作り直し(catalogResetPartsDb)が丸ごと置き換えていた
//               → 1回目の修正が隣の経路に反映されていなかった。同じ穴を踏んだ
//
// 3度目を防ぐため、部品データを置き換える全経路を実ソースで検証する。
//
// 【2026-09-03】部品DB(customParts)の書き込み経路はCAD(js/ui.js)から
// 部品DB単独画面(js/parts_page.js)へ移した。carryOutlineDxf等の実体も
// そちらにしか無いので、このテストが見るソースを ui.js から parts_page.js へ
// 切り替えた。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const ui = fs.readFileSync(__dirname + '/../js/parts_page.js', 'utf8').replace(/\r\n/g, '\n');
const pick = re => { const m = ui.match(re); if (!m) throw new Error('見つからない:' + re); return m[0]; };

// ------------------------------------------------------------------
console.log('【carryOutlineDxf 単体】');
{
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(pick(/function carryOutlineDxf\([\s\S]*?\n\}/), sandbox);
  const call = (n, o) => vm.runInContext(
    `carryOutlineDxf(${JSON.stringify(n)}, ${JSON.stringify(o)})`, sandbox);

  eq(call({ ref: 'A' }, { ref: 'A', outlineDxf: 'DXF...', outlineDxfName: 'a.dxf' }),
     { ref: 'A', outlineDxf: 'DXF...', outlineDxfName: 'a.dxf' }, '外形図を引き継ぐ');
  eq(call({ ref: 'A', outlineDxf: '新' }, { ref: 'A', outlineDxf: '旧' }),
     { ref: 'A', outlineDxf: '旧' }, '既存の紐付けが優先される（手作業を上書きしない）');
  eq(call({ ref: 'A' }, null), { ref: 'A' }, '相手がいなければそのまま');
  eq(call({ ref: 'A' }, { ref: 'A' }), { ref: 'A' }, '外形図が無ければ何も足さない');
}

// 【2026-10-03 段階4】「カタログ全件で作り直す」は消した(部品DBはカタログの全件を土台にし、外形図は
// parts_db.json の差分に入るので、カタログが変わっても消えない)。その確認は tests/test_parts_catalog_base.py。

// ------------------------------------------------------------------
console.log('\n【置き換える経路が全て carryOutlineDxf を通っている】');
{
  // 「部品データを丸ごと置き換える」書き方が、引き継ぎ無しで残っていないか見る。
  // Object.assign(existing, part) の直後に carryOutlineDxf が来ていること。
  const assigns = [...ui.matchAll(/Object\.assign\((\w+), part\);?\s*\n\s*([^\n]*)/g)];
  ok(assigns.length > 0, 'Object.assign による上書きが検出できている');
  assigns.forEach(([, target, next], i) => {
    ok(/carryOutlineDxf/.test(next),
       `${i + 1}箇所目の Object.assign(${target}, part) の直後に carryOutlineDxf がある`);
  });
}


console.log(ng === 0 ? '\n=== 全て OK ===' : `\n=== NG ${ng}件 ===`);
process.exit(ng === 0 ? 0 : 1);
