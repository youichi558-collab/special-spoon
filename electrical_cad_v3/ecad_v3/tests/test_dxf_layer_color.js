// DXF書き出しのレイヤー色のテスト。
//   node tests/test_dxf_layer_color.js
//
// 決まった名前のレイヤー(回路→CIRCUIT・図面枠→FRAME等)も、アプリのレイヤー色で
// 書き出す(2026-10-06)。旧実装は固定色(CIRCUIT=2黄・FRAME=4水色)が優先され、
// TrueViewでカラー印刷すると画面と違う色で出ていた。実コードを切り出して検証する。
const fs=require('fs');
const dx=fs.readFileSync(__dirname+'/../js/dxf_export.js','utf8');
const ac=fs.readFileSync(__dirname+'/../js/aci_colors.js','utf8');
const pick=(s,re)=>{const m=s.match(re);if(!m)throw new Error('見つからない:'+re);return m[0];};
const mapSrc=pick(dx,/const DXF_LAYER_MAP = \{[\s\S]*?\};\nfunction dxfLayer\([^\n]*/);
const defsSrc=pick(dx,/const LAYER_DEFS = \[[\s\S]*?\];/);
const bodySrc=pick(dx,/const appLayers = [\s\S]*?\n  \];/);
const run=(LAYERS)=>new Function('LAYERS',ac+'\n'+mapSrc+'\n'+defsSrc+'\n'+bodySrc+'\nreturn allLayers;')(LAYERS);

let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};
const c=(all,n)=>{const l=all.find(x=>x.n===n);return l?l.c:undefined;};
const H=new Function(ac+'\nreturn hexToACI;')();

console.log('【既定のレイヤー色がDXFに出る】');
const all=run([
  {name:'回路',color:'#1d6fb5'},{name:'配線',color:'#0F6E56'},
  {name:'図面枠',color:'#222'},{name:'自作',color:'#ff0000'},
]);
eq(c(all,'CIRCUIT'),H('#1d6fb5'),'回路の青がCIRCUITの色になる');
eq(c(all,'CIRCUIT')!==2,true,'固定の黄(2)ではない');
eq(c(all,'WIRE'),H('#0F6E56'),'配線の色がWIREの色になる');
eq(c(all,'FRAME'),7,'図面枠(#222)は7(白黒)。固定の水色(4)ではない');
eq(c(all,'自作'),1,'独自レイヤーは従来どおり自分の色(赤=1)');
eq(all.filter(l=>l.n==='CIRCUIT').length,1,'CIRCUITは1件だけ(重複しない)');
eq(all.slice(0,8).map(l=>l.n),['0','CIRCUIT','WIRE','NOTE','OUTLINE','FRAME','DIM','DIM_VIS'],'固定レイヤーの順番は変わらない');

console.log('\n【アプリに無いレイヤーは固定色】');
eq(c(all,'NOTE'),3,'注記が無ければNOTEは固定の3');
eq(c(all,'DIM_VIS'),1,'DIM_VISは固定の1');
eq(c(run([]),'CIRCUIT'),2,'レイヤーが空なら固定の2');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
