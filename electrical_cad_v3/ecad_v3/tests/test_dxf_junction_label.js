// 端子台の端子番号のDXF位置のテスト。
//   node tests/test_dxf_junction_label.js
//
// 画面(draw.js)は左揃え・基準線 y+4。DXFだけ中央揃え・+4なしで、番号が左上にずれて
// 線番に重なっていた(2026-10-06、TrueViewのPDF)。DXFの実コードを切り出し、画面と同じ位置・揃えか見る。
const fs=require('fs');
const dx=fs.readFileSync(__dirname+'/../js/dxf_export.js','utf8').replace(/\r\n/g, '\n');
const dr=fs.readFileSync(__dirname+'/../js/draw.js','utf8').replace(/\r\n/g, '\n');
const m=dx.match(/\n\s*(if\(el\.label && el\.style!=='dot'\) eText\([^\n]*)/);
if(!m)throw new Error('DXFの端子番号の処理が見つからない');
const dm=dr.match(/ctx\.textAlign = '(\w+)';\s*const lx = ([^;]+);\s*const ly = ([^;]+);/);
if(!dm)throw new Error('画面の端子番号の処理が見つからない');

let ng=0;
const eq=(a,b,msg)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',msg,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',msg);};
const els=[
  {x:360,y:270,r:3,style:'circle',label:'5',labelFs:6,labelOffX:0,labelOffY:-6},
  {x:360,y:310,r:3,style:'circle',label:'6',labelFs:6,labelOffX:0,labelOffY:2},
  {x:70,y:420,r:5,style:'dbl',label:'4'},
];
console.log('【端子台の端子番号: DXFと画面が同じ位置・揃え】');
els.forEach(el=>{
  let got=null;
  const eText=(layer,x,y,h,str,rot,align)=>{got={x,y,h,str,align:align||'center'};};
  const layer='CIRCUIT';
  eval(m[1]);
  const r=el.r;
  const lx=eval(dm[2]), ly=eval(dm[3]);
  eq([got.x,got.y],[lx,ly],`番号${el.label}の位置`);
  eq(got.align,dm[1],`番号${el.label}は${dm[1]}揃え`);
});
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
