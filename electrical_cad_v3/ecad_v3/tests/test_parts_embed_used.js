// 図面に入れる部品の写し(使った型式の分だけ)のテスト
//   node tests/test_parts_embed_used.js
//
// 【背景・2026-10-03 再設計の段階1】
// CADは図面を開いた後も型式で部品DBを引く(コイル電圧・極数/電流の選択肢、端子番号の候補、
// 部品表のメーカー/名称、クロスリファレンスの空き接点の枠、端子台表で装置端子を除く判定)。
// ライブラリ(部品DB)が無いPCで図面を開いてもこれらが効くよう、図面には**使った型式の部品だけ**を
// いつも写しとして入れる(以前は「サーバーに繋がらないときだけ部品DBを丸ごと」)。
// 開いたときはライブラリが正で、写しはライブラリに無い型式だけ使う(js/parts_db.js の mergeEmbedded)。
//
// このテストが守るもの:
//   1. 要素(el.partModel)とグループ(g.partModel)で使っている型式だけを入れる
//   2. 外形図DXF(数百KB)は入れない
//   3. 図面の保存・全ページ保存・自動保存・バックアップの4経路とも、この関数で入れる(丸ごと入れる経路が残っていない)

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const read = p => fs.readFileSync(__dirname + '/../' + p, 'utf8').replace(/\r\n/g, '\n');
const EDIT = read('js/edit.js');
const fnSrc = EDIT.match(/function usedPartsForSave\(pages\) \{[\s\S]*?\n\}/)[0];

const sb = { state: { customParts: [
  { ref: 'S-T21', maker: '三菱', volt: 'AC200V', outlineDxf: '0\nSECTION...(大きい)', outlineDxfName: 'st21.dxf' },
  { ref: 'NF63', maker: '三菱', amp: '30A' },
  { ref: 'UNUSED', maker: 'X' },
] } };
vm.createContext(sb);
vm.runInContext(fnSrc, sb);

console.log('【使った型式だけを入れる】');
{
  const pages = [
    { elements: [{ partModel: 'S-T21' }, { partModel: '' }, {}], groups: [] },
    { elements: [], groups: [{ partModel: 'NF63 ' }] },   // グループ(外形図)の型式・前後の空白
  ];
  const got = vm.runInContext('usedPartsForSave', sb)(pages);
  eq(got.map(p => p.ref), ['S-T21', 'NF63'], '★要素とグループで使っている型式だけ(使っていない UNUSED は入れない)');
  ok(got.every(p => !('outlineDxf' in p) && !('outlineDxfName' in p)), '★外形図DXFは入れない');
  eq(got[0].volt, 'AC200V', '引く処理に要る項目(電圧など)は入っている');
  eq(sb.state.customParts[0].outlineDxf.length > 0, true, '元の部品DBの外形図は消えていない(写しを作るだけ)');
}
{
  const got = vm.runInContext('usedPartsForSave', sb)([{ elements: [], groups: [] }]);
  eq(got, [], '型式を使っていない図面には何も入れない');
}

console.log('\n【保存の4経路とも、使った分の写しを入れる】');
const saves = [
  ['js/edit.js(1ページ保存)', /customParts:\s*usedPartsForSave\(\[pg\]\)/.test(EDIT)],
  ['js/edit.js(全ページ保存)', /customParts:\s*usedPartsForSave\(state\.pages\)/.test(EDIT)],
  ['js/autosave.js(自動保存)', /customParts:[^\n]*usedPartsForSave\(state\.pages\)/.test(read('js/autosave.js'))],
  ['js/backup.js(バックアップ)', /customParts:[^\n]*usedPartsForSave\(state\.pages\)/.test(read('js/backup.js'))],
];
saves.forEach(([n, hit]) => ok(hit, n));
const all = ['js/edit.js', 'js/autosave.js', 'js/backup.js'].map(read).join('\n');
ok(!/customParts:\s*\(typeof partsDb[^\n]*state\.customParts/.test(all), '★「繋がらないときだけ丸ごと入れる」経路が残っていない');
ok(!/hiddenBuiltinRefs:/.test(all), '標準部品の非表示(廃止)は図面に入れない');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
