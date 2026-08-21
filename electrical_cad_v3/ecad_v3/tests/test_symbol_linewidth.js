// シンボルの線幅のテスト。
//   node tests/test_symbol_linewidth.js
//
// 一括変更(bulkSetLineWidth)がシンボルにも効くこと、描画時に
// 要素の線幅 > シンボル内図形の線幅 > 既定 の順で使われることを、
// js/ui.js の実コードを動かして確認する。
const fs=require('fs');
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const pick=re=>{const m=ui.match(re);if(!m)throw new Error('見つからない:'+re);return m[0];};
eval([pick(/const LINE_WIDTHS = \[[\s\S]*?\];/).replace('const','var'),
      pick(/const DEFAULT_LINE_WIDTH = [\d.]+;/).replace('const','var'),
      pick(/function snapLineWidth\([\s\S]*?\n\}/)].join('\n'));

// 一括変更(bulkSetLineWidth)の本体を取り出して実行
eval(pick(/function bulkSetLineWidth\([\s\S]*?\n\}/));
global.pushH=()=>{}; global.draw=()=>{}; global.alert=()=>{};
const state={
  elements:[
    {id:1,type:'coil'},               // シンボル
    {id:2,type:'fline'},              // 図形
    {id:3,type:'coil',lineWidth:0.13},// 既に線幅を持つシンボル
  ],
  wires:[{id:9}],
  sel:{els:new Set([1,2,3]),wires:new Set([9])},
};
global.state=state;
let ng=0;
const eq=(a,b,m)=>{if(a!==b){ng++;console.log('  NG',m,'期待',b,'実際',a);}else console.log('  OK',m);};

console.log('【一括変更はシンボルにも効くか】');
bulkSetLineWidth('0.35');
eq(state.elements[0].lineWidth,0.35,'シンボルに効く');
eq(state.elements[1].lineWidth,0.35,'図形に効く');
eq(state.elements[2].lineWidth,0.35,'既存値も上書きされる');
eq(state.wires[0].lineWidth,0.35,'配線にも効く');

console.log('\n【描画時の優先順位】');
// drawSymは lwOverride(el.lineWidth) を最優先し、無ければ図形個別のs.lineWidth
const drawLw=(elLw,shapeLw,isSel)=>elLw||shapeLw||(isSel?DEFAULT_LINE_WIDTH*3:DEFAULT_LINE_WIDTH);
eq(drawLw(0.35,0.13,false),0.35,'要素の線幅がシンボル内図形より優先');
eq(drawLw(undefined,0.13,false),0.13,'要素に無ければ図形個別の値');
eq(drawLw(undefined,undefined,false),DEFAULT_LINE_WIDTH,'どちらも無ければ既定0.5');

console.log('\n【登録時に規格値へ丸まるか】');
eq(snapLineWidth(0.56),0.5,'0.56 → 0.5');
eq(snapLineWidth(0.09),0.13,'0.09 → 0.13');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
