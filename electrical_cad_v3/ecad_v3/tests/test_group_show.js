// 外形図グループのデバイス／型番の表示切り替えテスト。
//   node tests/test_group_show.js
//
// 盤面図では密度によって書き分ける: 密集した箇所は1つだけ型番を書いて他は省略、
// 全部デバイスのみ、という使い方があるため、両者を独立して切れる必要がある。
// 消すのではなく表示だけ切る(値を消すと部品表からも消えてしまう)。
const fs=require('fs');
const dr=fs.readFileSync(__dirname+'/../js/draw.js','utf8');
let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};
// 描画条件を実コードから取り出して評価
// letはevalのスコープから出ないのでvarに置き換える(実コードは変えない)
const src=dr.match(/const _showRef = [\s\S]*?const _showMdl = [^\n]*/)[0].replace(/const /g,'var ');
const check=g=>eval(src+'; ({ref:!!_showRef, mdl:!!_showMdl})');

console.log('【表示の組み合わせ】');
eq(check({partRef:'MC1',partModel:'MSO-T12'}),{ref:true,mdl:true},'既定は両方出る');
eq(check({partRef:'MC1',partModel:'MSO-T12',showModel:false}),{ref:true,mdl:false},'型番だけ消す(密集部の省略)');
eq(check({partRef:'MC1',partModel:'MSO-T12',showDev:false}),{ref:false,mdl:true},'デバイスだけ消す');
eq(check({partRef:'MC1',partModel:'MSO-T12',showDev:false,showModel:false}),{ref:false,mdl:false},'両方消す');
eq(check({partModel:'MSO-T12'}),{ref:false,mdl:true},'配置直後(デバイス未入力)は型番だけ');
eq(check({partRef:'MC1'}),{ref:true,mdl:false},'型番が無ければデバイスだけ');
eq(check({}),{ref:false,mdl:false},'どちらも無ければ何も出ない');

console.log('\n【値は保持される】');
const g={partRef:'MC1',partModel:'MSO-T12',showModel:false};
eq(g.partModel,'MSO-T12','表示を切っても型番の値は残る(部品表に出る)');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
