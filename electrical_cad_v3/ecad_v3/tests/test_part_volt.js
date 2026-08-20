// コイル電圧の選択肢解析のテスト。
//   node tests/test_part_volt.js
// js/ui.js から実装を読み込んで実行するので、実装を変えたらここも自動で追従する。
const fs=require('fs');
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const pick=(re)=>{const m=ui.match(re);if(!m)throw new Error('実装が見つかりません: '+re);return m[0];};
const IMPL=[
  pick(/const COIL_VOLT_TYPES = \[[\s\S]*?\];/),
  pick(/function partVoltOptions\([\s\S]*?\n\}/),
  pick(/function defaultPartVolt\([\s\S]*?\n\}/),
  pick(/function applyDefaultVolt\([\s\S]*?\n\}/),
].join('\n');

const state = { customParts: [
  { ref:'S-T21',   type:'contactor', volt:'AC100V・AC200V・AC400V' },
  { ref:'SD-T12',  type:'contactor', volt:'DC24V(標準、他DC12~220V選択可、極性あり:A1+/A2-)' },
  { ref:'SC09XA',  type:'contactor', volt:'AC200-240V(AC-3使用、380-440V級も同一電流定格で使用可)' },
  { ref:'NF63-CV', type:'breaker',   volt:'600V' },
  { ref:'MY2',     type:'coil',      volt:'AC12・24・100/110・110/120・200/220・220/240 / DC12・24・48・100/110' },
  { ref:'KV-RC4AD',type:'plc_unit',  volt:'電圧-10~+10V等複数レンジ選択可/電流0~20mA・4~20mA' },
]};

eval(IMPL);

let ng=0;
const eq=(a,b,m)=>{const p=JSON.stringify(a)===JSON.stringify(b);if(!p){ng++;console.log('  NG',m,'\n     期待',JSON.stringify(b),'\n     実際',JSON.stringify(a));}else console.log('  OK',m);};
console.log('【選択肢の抽出】');
eq(partVoltOptions('S-T21'),['AC100V','AC200V','AC400V'],'複数選択肢');
eq(partVoltOptions('SD-T12'),['DC24V'],'括弧の補足を除去');
eq(partVoltOptions('SC09XA'),['AC200-240V'],'範囲表記は1つとして扱う');
eq(partVoltOptions('MY2').length,13,'省略された接頭辞を引き継ぐ');
eq(partVoltOptions('MY2')[1],'AC24V','「24」にACが付く');
eq(partVoltOptions('MY2')[8],'DC12V','DC群に切り替わる');
eq(partVoltOptions('NF63-CV'),[],'ブレーカはコイル電圧なし');
eq(partVoltOptions('KV-RC4AD'),[],'アナログの入出力レンジは拾わない');
eq(partVoltOptions('未登録'),[],'未登録');
console.log('\n【既定値】');
eq(defaultPartVolt('S-T21'),'AC100V','先頭を代表値に');
eq(defaultPartVolt('SD-T12'),'DC24V','1つならそれが確定');
eq(defaultPartVolt('NF63-CV'),'','対象外は空');
console.log('\n【型番変更時の追従】');
let el={partModel:'S-T21',partVolt:'AC200V'};
applyDefaultVolt(el); eq(el.partVolt,'AC200V','選択済みの値は残る');
el.partModel='SD-T12'; applyDefaultVolt(el); eq(el.partVolt,'DC24V','新型番で選べない値は入替');
el.partModel='NF63-CV'; applyDefaultVolt(el); eq(el.partVolt,undefined,'選択肢が無ければ削除');
console.log('\n【部品表のまとめ単位】');
const els=[{partRef:'MC1',partModel:'S-T21',partVolt:'AC200V'},
           {partRef:'MC2',partModel:'S-T21',partVolt:'AC200V'},
           {partRef:'MC3',partModel:'S-T21',partVolt:'AC100V'}];
const g={};els.forEach(e=>{const k=e.partModel+'\u0000'+e.partVolt;(g[k]=g[k]||[]).push(e.partRef);});
eq(Object.keys(g).length,2,'型番同じでも電圧違いは別行');
eq(g['S-T21\u0000AC200V'],['MC1','MC2'],'同電圧はまとまる');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
