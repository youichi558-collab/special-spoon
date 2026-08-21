// DXF読込時のレイヤー欠落救済のテスト。
//   node tests/test_dxf_layer.js
//
// レイヤー名が付かないとLAYERS.findが外れ、描画色がfgC()(ダークで#ccc=ほぼ白)に
// なって「図面の一か所だけ白く壊れる」症状になる。実コードをevalして検証する。
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../js/dxf_import.js','utf8');
const m=src.match(/\{\s*const FALLBACK='外形';[\s\S]*?\n  \}/);
if(!m)throw new Error('救済処理が見つからない');

const state={
  elements:[
    {id:1,type:'fline',layer:'回路'},   // レイヤーあり
    {id:2,type:'fline'},                // group code 8 が無い → undefined
    {id:3,type:'circle',layer:''},      // 空文字
  ],
  wires:[{id:9,layer:undefined}],
};
const LAYERS=[{name:'回路'},{name:'外形'}];
console.log=console.log;
eval(m[0]);

let ng=0;
const eq=(a,b,msg)=>{if(a!==b){ng++;console.log('  NG',msg,'期待',b,'実際',a);}else console.log('  OK',msg);};
console.log('【レイヤー欠落の救済】');
eq(state.elements[0].layer,'回路','元からあるレイヤーは変えない');
eq(state.elements[1].layer,'外形','undefinedを救済');
eq(state.elements[2].layer,'外形','空文字も救済');
eq(state.wires[0].layer,'外形','配線も救済');

console.log('\n【救済後の描画色】');
const fgC=()=>'#ccc';
const LAY=[{name:'回路',color:'#1d6fb5'},{name:'外形',color:'#228844'}];
const colorOf=el=>{const l=LAY.find(x=>x.name===el.layer);return l?l.color:fgC();};
eq(colorOf(state.elements[1]),'#228844','白(#ccc)にならない');
eq(colorOf(state.elements[2]),'#228844','白(#ccc)にならない');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
