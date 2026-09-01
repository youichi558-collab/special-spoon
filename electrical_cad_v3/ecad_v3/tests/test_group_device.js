// グループのデバイス表示のテスト。
//   node tests/test_group_device.js
//
// 部品外形図は数十本の線の集まりなので、デバイス記号はグループ側が持つ。
// 文字サイズ・色・位置の調整UIが出て、値が保存されることを実コードで確認する。
const fs=require('fs');
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const pick=re=>{const m=ui.match(re);if(!m)throw new Error('見つからない:'+re);return m[0];};
global.draw=()=>{}; global.pushH=()=>{}; global.updateRightPanel=()=>{};
global._escAttr=s=>String(s==null?'':s);
global.escH=require('./_esch.js').escH;   // 実体は js/state.js のもの
global.partRefOptionsHtml=()=>'';
global.colorCodeBtns=()=>'';
const fields={};
global.document={getElementById:id=>fields[id]||null};
const mk=(id,v,checked)=>fields[id]={value:v,checked:checked!==false};
const state={page:{groups:[{elIds:[1],wireIds:[],partRef:'',partModel:''}]},sel:{els:new Set([1]),wires:new Set()}};
global.state=state;
eval(pick(/function groupDevicePropsHtml\([\s\S]*?\n\}/));
eval(pick(/function applyGroupDevice\([\s\S]*?\n\}/));

let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};

console.log('【文字調整のUIが出るか】');
const html=groupDevicePropsHtml({partRef:'MC1'},1);
['gp-devfs','gp-devcolor','gp-devcolorcode','gp-devox','gp-devoy'].forEach(id=>
  eq(html.includes(`id="${id}"`),true,id+' がある'));
eq(html.includes('文字の詳細'),true,'折りたたみで出る');

console.log('\n【設定が保存されるか】');
mk('gp-partref','MC1'); mk('gp-partmodel','MSO-T12'); mk('gp-showdev','',true);
mk('gp-devfs','14'); mk('gp-devcolorcode','#ff0000'); mk('gp-devcolor','#ff0000');
mk('gp-devox','10'); mk('gp-devoy','-5');
applyGroupDevice();
const g=state.page.groups[0];
eq(g.partRef,'MC1','デバイス');
eq(g.devFs,14,'文字サイズ');
eq(g.devColor,'#ff0000','色');
eq(g.devOffX,10,'X補正');
eq(g.devOffY,-5,'Y補正');

console.log('\n【空欄なら未設定に戻る】');
fields['gp-devfs'].value=''; fields['gp-devox'].value=''; fields['gp-devoy'].value='';
applyGroupDevice();
eq(g.devFs,undefined,'サイズ空欄→未設定(既定を使う)');
eq(g.devOffX,undefined,'X補正空欄→自動');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
