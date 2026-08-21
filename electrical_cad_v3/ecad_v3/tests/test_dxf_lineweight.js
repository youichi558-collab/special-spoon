// DXFの線の太さ(group code 370)の読み書きテスト。
//   node tests/test_dxf_lineweight.js
//
// 370は1/100mm単位の整数。負の値は太さの指定ではなく
// -1=レイヤーに従う / -2=ブロックに従う / -3=既定に従う を意味する。
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../js/dxf_import.js','utf8');
const pick=re=>{const m=src.match(re);if(!m)throw new Error('見つからない:'+re);return m[0];};
eval(pick(/function lineweightToMm\([\s\S]*?\n\}/));
eval(pick(/function _lwOf\([\s\S]*?\n\}/));
let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};

console.log('【DXFの線の太さ(370)をmmに変換】');
eq(lineweightToMm('50'),0.5,   '50 → 0.5mm');
eq(lineweightToMm('13'),0.13,  '13 → 0.13mm(最細の規格値)');
eq(lineweightToMm('211'),2.11, '211 → 2.11mm(最太の規格値)');
eq(lineweightToMm('0'),0.05,   '0(極細) → 0.05mm(線が消えないように)');
console.log('\n【指定なしとみなす値】');
eq(lineweightToMm('-1'),null,  '-1(レイヤーに従う) → 指定なし');
eq(lineweightToMm('-2'),null,  '-2(ブロックに従う) → 指定なし');
eq(lineweightToMm('-3'),null,  '-3(既定に従う) → 指定なし');
eq(lineweightToMm(undefined),null,'未指定 → 指定なし');
eq(lineweightToMm('abc'),null, '不正値 → 指定なし');

console.log('\n【エンティティへの付与】');
eq(_lwOf({'370':'50'}),{lineWidth:0.5},'指定があれば要素に焼き込む');
eq(_lwOf({'370':'-1'}),{},           'レイヤー従属なら何も付けない');
eq(_lwOf({}),{},                     '未指定なら何も付けない');

console.log('\n【書き出し(mm→370)】');
const toCode=lay=>(lay&&lay.lineWidth>0)?Math.max(0,Math.min(211,Math.round(lay.lineWidth*100))):-3;
eq(toCode({lineWidth:0.5}),50,   '0.5mm → 50');
eq(toCode({lineWidth:0.13}),13,  '0.13mm → 13');
eq(toCode({lineWidth:5}),211,    '規格上限を超えたら211で頭打ち');
eq(toCode({lineWidth:0}),-3,     '太さ0は既定(-3)');
eq(toCode({}),-3,                '未設定は既定(-3)');
console.log('\n【往復】');
eq(toCode({lineWidth:lineweightToMm('50')}),50,'50 → 0.5mm → 50 に戻る');
eq(toCode({lineWidth:lineweightToMm('13')}),13,'13 → 0.13mm → 13 に戻る');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
