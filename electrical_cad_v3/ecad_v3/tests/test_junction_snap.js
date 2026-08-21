// 端子台の端子への円周スナップのテスト。
//   node tests/test_junction_snap.js
//
// 中心にしかスナップできないと配線が円を貫通してしまい、実際の展開接続図の
// 描き方(端子の手前で止めて反対側から出す)と食い違う。円周で止められれば
// DXF出力で貫通した配線を白塗りマスクで隠す小細工も要らなくなる。
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../js/snap.js','utf8');
const body=src.match(/    if \(el\.type === 'junction'\) \{[\s\S]*?\n      return;\n    \}/)[0];
// 実コードを関数として動かす
const snapJ=(el,wx,wy,bestD0)=>{
  let bestD=bestD0===undefined?1e9:bestD0, best=null;
  const f=new Function('el','wx','wy','bestD','best',
    body.replace('return;','return {bestD,best};').replace("if (el.type === 'junction') {",'').replace(/\}$/,''));
  return f(el,wx,wy,bestD,best);
};
let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};
const rnd=p=>p?{x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100}:null;

const term={type:'junction',id:'j1',x:100,y:100,r:5,style:'circle'};
const dot ={type:'junction',id:'j2',x:100,y:100,r:2,style:'dot'};

console.log('【端子台の端子(○)】');
eq(rnd(snapJ(term,100,100).best),{x:100,y:100},'中心付近では中心');
eq(rnd(snapJ(term,112,100).best),{x:105,y:100},'右から来たら円周の右端');
eq(rnd(snapJ(term,88,100).best),{x:95,y:100},'左から来たら円周の左端');
eq(rnd(snapJ(term,100,112).best),{x:100,y:105},'下から来たら円周の下端');
eq(rnd(snapJ(term,100,88).best),{x:100,y:95},'上から来たら円周の上端');
console.log('  斜め45度 →',JSON.stringify(rnd(snapJ(term,110,110).best)),'(円周上)');
const p=snapJ(term,110,110).best;
eq(Math.round(Math.hypot(p.x-100,p.y-100)*100)/100,5,'斜めでも半径5の円周上に乗る');

console.log('\n【分岐点(●)は従来どおり中心のみ】');
eq(rnd(snapJ(dot,112,100).best),{x:100,y:100},'離れていても中心');
eq(rnd(snapJ(dot,100,100).best),{x:100,y:100},'中心');

console.log('\n【接続情報は保たれる】');
eq(snapJ(term,112,100).best.snapType,'terminal','snapTypeはterminalのまま');
eq(snapJ(term,112,100).best.elId,'j1','elIdが入る(接続の記録に使う)');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
