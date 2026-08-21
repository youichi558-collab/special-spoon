// 部品割り当て・グループデバイスのテスト。
//   node tests/test_part_assign.js
//
// 【重要】再実装ではなく js/ui.js の実コードをevalして動かす。
// 以前は挙動を書き写したテストにしていたため、pushUndo()という
// 存在しない関数を呼んでいたバグ(例外で描画されない)を見逃した。
const fs=require('fs');
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const pick=re=>{const m=ui.match(re);if(!m)throw new Error('見つからない: '+re);return m[0];};

// --- 依存の最小スタブ ---
let drawn=0, histPushed=0;
global.draw=()=>drawn++;
global.pushH=()=>histPushed++;
global.updateRightPanel=()=>{};
global.alert=()=>{};
const fields={};
global.document={getElementById:id=>fields[id]||null,querySelectorAll:()=>[]};
const mk=(id,v='')=>fields[id]={value:v,checked:true};

const state={
  customParts:[{ref:'S-T21',type:'contactor',volt:'AC100V・AC200V',amp:'18A',contacts:'2a2b',terminals:'A1,A2'}],
  elements:[{id:1,type:'coil'},{id:2,type:'sw_no'}],
  sel:{els:new Set(),wires:new Set()},
  pages:[],
  page:{groups:[]},
};
global.state=state;
state.pages=[{elements:state.elements,groups:state.page.groups}];

eval([
  pick(/const COIL_VOLT_TYPES = \[[\s\S]*?\];/),
  pick(/const COMMON_VOLTS = \[[\s\S]*?\];/),
  pick(/function partVoltOptions\([\s\S]*?\n\}/),
  pick(/function defaultPartVolt\([\s\S]*?\n\}/),
  pick(/function applyDefaultVolt\([\s\S]*?\n\}/),
  pick(/function collectDeviceInfo\([\s\S]*?\n\}/),
  pick(/function placePart\([\s\S]*?\n\}/),
  pick(/function applyGroupDevice\([\s\S]*?\n\}/),
].join('\n'));

let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};

console.log('【placePart を実コードで実行】');
state.sel.els.add(1); state.sel.els.add(2);
placePart('contactor','S-T21','A1,A2');
eq(state.elements[0].partModel,'S-T21','型番が入る');
eq(state.elements[0].partVolt,'AC200V','AC200Vが代表値');
eq(state.elements[0].label,'AC200V\n18A\n2a2b','仕様が入る(未入力だったので自動入力)');
eq(histPushed,1,'履歴が積まれる(pushHが呼べている)');
eq(drawn,1,'再描画される');

console.log('\n【2026-08-22追加: 既存の仕様欄(手書き)は上書きしない】');
state.elements.push({id:3,type:'coil',label:'既存の手書きメモ　運転用'});
state.sel.els.clear(); state.sel.els.add(3);
placePart('contactor','S-T21','A1,A2');
eq(state.elements[2].partModel,'S-T21','型番は割り当てられる(端子番号目的なので問題ない)');
eq(state.elements[2].label,'既存の手書きメモ　運転用','仕様欄(手書き)は上書きされず保護される');

console.log('\n【複数選択で一部だけ既存ラベルがある場合】');
state.elements.push({id:4,type:'coil'}); // labelなし
state.sel.els.clear(); state.sel.els.add(3); state.sel.els.add(4);
placePart('contactor','S-T21','A1,A2');
eq(state.elements[2].label,'既存の手書きメモ　運転用','id3(既存ラベルあり)は保護されたまま');
eq(state.elements[3].label,'AC200V\n18A\n2a2b','id4(ラベルなし)は自動入力される');

console.log('\n【applyGroupDevice を実コードで実行】');
state.sel.els.clear(); state.sel.els.add(1);
const drawnBeforeGroup = drawn;
state.page.groups.push({elIds:[1],wireIds:[],partRef:'',partModel:''});
mk('gp-partref','MC1'); mk('gp-partmodel','MSO-T12'); mk('gp-showdev');
applyGroupDevice();
eq(state.page.groups[0].partRef,'MC1','グループにデバイスが入る');
eq(state.page.groups[0].partModel,'MSO-T12','型番も入る');
eq(drawn,drawnBeforeGroup+1,'再描画される');

console.log('\n【グループが複数選択されているとき】');
state.page.groups.push({elIds:[2],wireIds:[],partRef:'',partModel:''});
state.sel.els.add(2);
fields['gp-partref'].value='CR1';
applyGroupDevice();
eq(state.page.groups[0].partRef,'MC1','1つ目は書き換わらない');
eq(state.page.groups[1].partRef,'','2つ目にも書き込まない(事故防止)');

console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
