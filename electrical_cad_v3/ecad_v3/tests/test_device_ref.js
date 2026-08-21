// デバイス候補と引き継ぎのテスト。
//   node tests/test_device_ref.js
// js/ui.js から実装を読み込むので、実装を変えたらここも自動で追従する。
const fs=require('fs');
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const pick=re=>{const m=ui.match(re);if(!m)throw new Error('実装が見つかりません: '+re);return m[0];};
const IMPL=[
  pick(/function collectDeviceInfo\([\s\S]*?\n\}/),
  pick(/function partRefOptionsHtml\([\s\S]*?\n\}/),
  pick(/function _esc\([\s\S]*?\n\}/),
  pick(/function _escAttr\([\s\S]*?\n\}/),
].join('\n');

// 図面を模した状態。MC1は主接点(型番・仕様あり)・コイル・補助接点の3箇所
const state = { pages: [
  { elements: [
    { id:1, partRef:'MC1',  partModel:'MSO-T12', label:'AC100V', terminals:'A1,A2,1,3,5,2,4,6', partVolt:'AC100V', showModel:true },
    { id:2, partRef:'MC1',  partModel:'',        label:'',       terminals:'' },
    { id:3, partRef:'ELB1', partModel:'NV32-SV 3P', label:'30AF/20AT 30mA' },
    { id:4, partRef:'',     partModel:'',        label:'' },
    { id:5, partRef:'TH1',  partModel:'',        label:'9A' },
  ]},
  { elements: [
    { id:6, partRef:'MC1',  partModel:'', label:'' },
    { id:7, partRef:'CR2',  partModel:'MY2', label:'AC100V' },
    { id:8, partRef:'',     partModel:'' },   // 外形図の線(デバイスはグループが持つ)
  ], groups: [
    { elIds:[8], wireIds:[], partRef:'CP1', partModel:'CP30-BA' },
  ]},
]};

eval(IMPL);

let ng=0;
const eq=(a,b,m)=>{const p=JSON.stringify(a)===JSON.stringify(b);if(!p){ng++;console.log('  NG',m,'\n   期待',JSON.stringify(b),'\n   実際',JSON.stringify(a));}else console.log('  OK',m);};
const map=collectDeviceInfo();
console.log('【候補の収集】');
eq([...map.keys()].sort(),['CP1','CR2','ELB1','MC1','TH1'],'空のpartRefは候補に入らない');
eq(map.get('CP1').model,'CP30-BA','グループが持つデバイスも候補になる(部品外形図)');
eq(map.get('MC1').model,'MSO-T12','情報を持つ要素から型番を拾う');
eq(map.get('MC1').spec,'AC100V','仕様も拾う');
eq(map.get('MC1').terminals,'A1,A2,1,3,5,2,4,6','端子番号も拾う');
eq(map.get('TH1').model,'','型番が無ければ空');
eq(map.get('CR2').model,'MY2','別ページのデバイスも拾う');
console.log('\n【引き継ぎ】');
const el={partRef:'',partModel:'',label:'',terminals:'',showModel:false};
const info=map.get('MC1');
if(info.model)el.partModel=info.model;
if(info.spec)el.label=info.spec;
if(info.terminals)el.terminals=info.terminals;
el.partRef='MC1';
eq(el.partModel,'MSO-T12','型番が入る');
eq(el.label,'AC100V','仕様が入る');
eq(el.showModel,false,'型式の表示ON/OFFは引き継がない(重要)');
console.log('\n【候補リストHTML】');
const html=partRefOptionsHtml('MC1');
eq(html.includes('value="MC1"'),true,'MC1が候補にある');
eq(html.includes('MSO-T12'),false,'型番などの補足は出さない');
eq((html.match(/<option/g)||[]).length,5,'候補は5件(グループ分を含む)');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
