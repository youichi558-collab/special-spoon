// DXF読込時の既定線幅のテスト。
//   node tests/test_dxf_linewidth.js
//
// 線幅は図面座標の値でズームに追随しないため、短い線分が多い部品外形図では
// 線幅1.0だと線分より太くなって図が潰れる。線分長の中央値から決める。
const fs=require('fs');
const src=fs.readFileSync(__dirname+'/../js/dxf_import.js','utf8');
// 実装は js/ui.js の snapLineWidth に依存する。読み込まないとフォールバックで
// 1.0になり、テストが通らないだけでなく実装の検証にもならない。
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const grab=re=>{const m=ui.match(re);if(!m)throw new Error('見つからない:'+re);return m[0];};
eval([grab(/const LINE_WIDTHS = \[[\s\S]*?\];/).replace('const','var'),
      grab(/const DEFAULT_LINE_WIDTH = [\d.]+;/).replace('const','var'),
      grab(/function snapLineWidth\([\s\S]*?\n\}/)].join('\n'));
const m=src.match(/  let _importLineWidth = 1;[\s\S]*?\n  \}/);
if(!m)throw new Error('計算処理が見つからない');
const body=m[0].replace('let _importLineWidth','var _importLineWidth');
const calc=(wires,elements)=>{const state={wires:wires||[],elements:elements||[]};return eval(body+'; _importLineWidth');};
const seg=(len,n)=>Array.from({length:n},(_,i)=>({pts:[{x:0,y:0},{x:len,y:0}]}));
let ng=0;
const eq=(a,b,msg)=>{if(a!==b){ng++;console.log('  NG',msg,'期待',b,'実際',a);}else console.log('  OK',msg);};

console.log('【線分の細かさから既定線幅を決める】');
eq(calc(seg(2,20)),0.35, '中央値2.0 → 0.4を規格値に丸めて0.35');
eq(calc(seg(10,20)),2,   '中央値10 → 2.0(最太)');
eq(calc(seg(0.5,20)),0.13,'中央値0.5 → 最細の0.13');
eq(calc(seg(5,20)),1,    '中央値5 → 1.0');
eq(calc(seg(3,20)),0.5,  '中央値3 → 0.6は0.5の方が近いので0.5');
eq(calc(seg(2,5)),1,     '線分が少なすぎる(10本未満)ときは1.0のまま');
eq(calc([],[]),1,        '要素が無ければ1.0');

console.log('\n【実ファイルで確認】');
const SAMPLE='/mnt/user-data/uploads/ha01d800_MSO-T10_KP__.dxf';
if(!fs.existsSync(SAMPLE)){console.log('  (サンプルDXFが無いため省略)');console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');process.exit(ng?1:0);}
const t=fs.readFileSync(SAMPLE,'utf8').split('\n').map(l=>l.replace(/\r/g,'').trim());
const pairs=[];for(let i=0;i<t.length-1;i+=2){const c=parseInt(t[i]);if(!isNaN(c))pairs.push({code:c,val:t[i+1]});}
const wires=[];
for(let i=0;i<pairs.length;i++){
  if(pairs[i].code!==0||pairs[i].val!=='LINE')continue;
  let j=i+1,e={};
  while(j<pairs.length&&pairs[j].code!==0){const k=pairs[j].code;if(e[k]===undefined)e[k]=pairs[j].val;j++;}
  wires.push({pts:[{x:+e[10],y:-e[20]},{x:+e[11],y:-e[21]}]});
}
const lw=calc(wires);
console.log(`  MSO-T10外形図(LINE ${wires.length}本) → 既定線幅 ${lw} (従来は1.0)`);
eq(lw<1,true,'従来より細くなる');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
