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
console.log('\n【斜め45度にも止まる(8点限定)】');
const p=snapJ(term,110,110).best;
eq(rnd(p),{x:103.54,y:103.54},'右下45度');
eq(Math.round(Math.hypot(p.x-100,p.y-100)*100)/100,5,'半径5の円周上');
// 中途半端な角度(20度など)から近づいても、必ず8点のいずれかに寄る
const cand=[];
for(let a=0;a<360;a+=7){
  const rad=a*Math.PI/180;
  const q=snapJ(term,100+12*Math.cos(rad),100+12*Math.sin(rad)).best;
  cand.push(`${Math.round(q.x*100)/100},${Math.round(q.y*100)/100}`);
}
const uniq=[...new Set(cand)];
eq(uniq.length,8,'全方向から試しても8点のみ(中途半端な角度に止まらない)');

console.log('\n【分岐点(●)は従来どおり中心のみ】');
eq(rnd(snapJ(dot,112,100).best),{x:100,y:100},'離れていても中心');
eq(rnd(snapJ(dot,100,100).best),{x:100,y:100},'中心');

console.log('\n【接続情報は保たれる】');
eq(snapJ(term,112,100).best.snapType,'terminal','snapTypeはterminalのまま');
eq(snapJ(term,112,100).best.elId,'j1','elIdが入る(接続の記録に使う)');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
