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

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
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

// ------------------------------------------------------------------
// 作り直し(catalogResetPartsDb)の中核部分だけを取り出して実行する。
// 関数全体はfetch/confirm/partsDb等に依存して重いので、置き換えの1行を実ソースから
// 取り出して、それが carryOutlineDxf を通っていることを動作で確かめる。
console.log('\n【作り直しで外形図が残る】');
{
  // 実装の書き方に依存しないよう、「customPartsをrowsで置き換える文」だけを
  // 形を問わず取り出して実行する。引き継ぎが無い実装なら、ここで外形図が落ちる。
  const body = pick(/(?:const prevByRef[^\n]*\n\s*)?state\.customParts = rows\.map\(r => [\s\S]*?\)\);/);
  const sandbox = {
    console,
    state: {
      customParts: [
        { ref: 'S-T10', maker: '三菱電機', outlineDxf: 'DXF-A', outlineDxfName: 'st10.dxf' },
        { ref: 'NF63-CV', maker: '三菱電機' },
        { ref: '廃番品', maker: '三菱電機', outlineDxf: 'DXF-B' },   // カタログに無い
      ],
    },
    rows: [
      { ref: 'S-T10', maker: '三菱電機', type: 'contactor' },
      { ref: 'NF63-CV', maker: '三菱電機', type: 'breaker' },
      { ref: 'MSO-T21', maker: '三菱電機', type: 'starter' },        // カタログ側の新規
    ],
  };
  vm.createContext(sandbox);
  vm.runInContext(pick(/function carryOutlineDxf\([\s\S]*?\n\}/), sandbox);
  vm.runInContext(body, sandbox);

  const cp = sandbox.state.customParts;
  eq(cp.length, 3, 'カタログの3件になる');
  const st10 = cp.find(p => p.ref === 'S-T10');
  eq(st10.outlineDxf, 'DXF-A', '外形図の紐付けが残る（ここが2回消えていた）');
  eq(st10.outlineDxfName, 'st10.dxf', 'ファイル名も残る');
  eq(st10.type, 'contactor', 'カタログ側の新しい内容は反映される');
  ok(!cp.find(p => p.ref === '廃番品'), 'カタログに無い部品は消える（作り直しの仕様どおり）');
  ok(cp.find(p => p.ref === 'MSO-T21'), 'カタログ側の新規は入る');
}

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
  // 作り直し側
  ok(/state\.customParts = rows\.map\(r => carryOutlineDxf\(/.test(ui),
     '作り直しの置き換えが carryOutlineDxf を通っている');
}

// ------------------------------------------------------------------
console.log('\n【押す前に、何が残り何が消えるか出る】');
{
  ok(/外形図DXFの紐付け \$\{keptDxf\}件は引き継ぎます/.test(ui), '引き継ぐ件数を確認ダイアログに出す');
  ok(/カタログに無い部品 \$\{dropped\.length\}件が削除されます/.test(ui), '削除される部品の件数を出す');
  ok(/dropped\.slice\(0, 8\)/.test(ui), '削除される型番を実際に列挙する');
  ok(/カタログに無い部品に付いた外形図 \$\{lostDxf\}件は失われます/.test(ui), '失われる外形図がある場合は警告する');
}

console.log(ng === 0 ? '\n=== 全て OK ===' : `\n=== NG ${ng}件 ===`);
process.exit(ng === 0 ? 0 : 1);
