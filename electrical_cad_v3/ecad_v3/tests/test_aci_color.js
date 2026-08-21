// ACI色変換のテスト。
//   node tests/test_aci_color.js
//
// ACI 7(既定色)はAutoCADでは背景に応じて表示色が反転する。単純に#ffffffへ
// 変換していたため、メーカー外形図(全実体がレイヤー0=ACI 7)を取り込むと
// 図形が純白になり「白く壊れて見える」状態だった。
const fs=require('fs');
eval(fs.readFileSync(__dirname+'/../js/aci_colors.js','utf8'));
let ng=0;
const eq=(a,b,m)=>{if(a!==b){ng++;console.log('  NG',m,'期待',b,'実際',a);}else console.log('  OK',m);};
console.log('【ACI 7 は背景に応じた色】');
global.state={darkMode:true};
eq(aciToHex(7),'#cccccc','ダークでは明るいグレー(純白で浮かない)');
global.state={darkMode:false};
eq(aciToHex(7),'#222222','ライトでは黒に近い色(白背景で見える)');
console.log('\n【他の色は変えない】');
eq(aciToHex(3),'#00ff00','緑はそのまま');
eq(aciToHex(8),'#808080','グレーはそのまま');
eq(aciToHex(1),'#ff0000','赤はそのまま');
console.log('\n【往復（レイヤー色を変えていない場合）】');
const exportAci=lay=>(lay.srcAci && lay.color===aciDefaultColor())?lay.srcAci:hexToACI(lay.color);
global.state={darkMode:true};
eq(exportAci({color:aciToHex(7),srcAci:7}),7,'ACI7→取り込み→書き出しで7に戻る');
eq(exportAci({color:aciToHex(3),srcAci:undefined}),3,'ACI3はそのまま3');
console.log('\n【往復（レイヤー色を変えた場合）】');
eq(exportAci({color:'#ff0000',srcAci:7}),1,'色を赤に変えたら赤(1)で出る');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
