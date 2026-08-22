// 端子のデバイス表示ON/OFFと文字サイズの後方互換を検証
const fs=require('fs'), vm=require('vm');
let ng=0; const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m); };

const src=fs.readFileSync(__dirname+'/../js/draw.js','utf8');
const m=src.match(/function drawJunctionEl\([\s\S]*?\n\}/);
const drawn=[];
const ctx=new Proxy({},{get:(t,p)=>{ if(p==='fillText') return (txt,x,y)=>drawn.push({txt,x,y,font:t.font}); if(p in t) return t[p]; return ()=>{}; },set:(t,p,v)=>{t[p]=v;return true;}});
const sandbox={ctx,state:{zoom:1,darkMode:false,showPartRef:true,pdfSkipText:false},console,Math};
vm.createContext(sandbox);
vm.runInContext(m[0],sandbox);

const run=el=>{drawn.length=0;sandbox.drawJunctionEl(el,false,'#000');return drawn.map(d=>d.txt);};

console.log('【後方互換: showDev未定義の既存端子】');
eq(run({x:0,y:0,style:'circle',label:'1',partRef:'TB1'}),['1','TB1'],'従来どおりデバイス名も出る(黙って消えない)');

console.log('\n【新規端子: showDev=false】');
eq(run({x:0,y:0,style:'circle',label:'1',partRef:'TB1',showDev:false}),['1'],'端子番号だけ出る(TB1は出ない)');

console.log('\n【先頭だけON】');
eq(run({x:0,y:0,style:'circle',label:'1',partRef:'TB1',showDev:true}),['1','TB1'],'ONにすればTB1が出る');

console.log('\n【分岐点(●)には何も出さない】');
eq(run({x:0,y:0,style:'dot',label:'1',partRef:'TB1',showDev:true}),[],'●は端子ではないので文字なし');

console.log('\n【文字サイズの指定が効く】');
drawn.length=0; sandbox.drawJunctionEl({x:0,y:0,style:'circle',label:'1',partRef:'TB1',showDev:true,labelFs:20,devFs:16},false,'#000');
eq(drawn[0].font,'20px sans-serif','端子番号のサイズ指定が効く');
eq(drawn[1].font,'bold 16px sans-serif','デバイス名のサイズ指定が効く');
drawn.length=0; sandbox.drawJunctionEl({x:0,y:0,style:'circle',label:'1'},false,'#000');
eq(drawn[0].font,'11px sans-serif','未指定なら従来どおり11px');

console.log(ng===0?'\n全て成功':`\n${ng}件失敗`);
process.exit(ng?1:0);
