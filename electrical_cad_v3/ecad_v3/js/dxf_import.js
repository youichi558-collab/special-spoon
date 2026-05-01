// ================================================================
// dxf_import.js — DXF読込
// 依存: state, getDef, draw
// ================================================================
function loadDXF(input){
  const f=input.files[0];if(!f)return;
  let idx=0;const encs=['UTF-8','Shift-JIS','iso-8859-1'];
  function tryNext(){if(idx>=encs.length)return;const rd=new FileReader();rd.onload=e=>{if((e.target.result.match(/\ufffd/g)||[]).length>10&&idx<encs.length-1){idx++;tryNext();return;}parseDXF(e.target.result);};rd.onerror=()=>{idx++;tryNext();};rd.readAsText(f,encs[idx++]);}
  tryNext();input.value='';
}
function parseDXF(text){
  const lines=text.split(/\r?\n/).map(l=>l.trim());
  const pairs=[];for(let i=0;i<lines.length-1;i+=2){const code=parseInt(lines[i]);if(!isNaN(code))pairs.push({code,val:lines[i+1]});}
  let lc=0,cc=0,tc=0,ic=0;let i=0;
  // frameObjをコメントから復元
  for(let j=0;j<pairs.length;j++){
    if(pairs[j].code===999&&pairs[j].val.startsWith('ECAD_FRAME:')){
      try{state.frameObj=JSON.parse(pairs[j].val.slice('ECAD_FRAME:'.length));}catch(e){}
      break;
    }
  }
  while(i<pairs.length){
    const{code,val}=pairs[i];
    if(code===0){
      if(val==='LINE'){const e=readEnt(pairs,i);const x1=+e['10']||0,y1=-(+e['20']||0),x2=+e['11']||0,y2=-(+e['21']||0);if(Math.hypot(x2-x1,y2-y1)>0.1){state.wires.push({id:genId('w'),x1,y1,x2,y2,pts:[{x:x1,y:y1},{x:x2,y:y2}],layer:e['8']||'配線',wireNo:null});lc++;}i=e._end;continue;}
      if(val==='CIRCLE'){const e=readEnt(pairs,i);const r=+e['40']||0;if(r>0){state.elements.push({id:genId('el'),type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}i=e._end;continue;}
      if(val==='TEXT'||val==='MTEXT'){const e=readEnt(pairs,i);let t=fromUnicodeDXF((e['1']||e['3']||'').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/\\P/g,' ').trim());const h=+e['40']||12;if(t)state.elements.push({id:genId('el'),type:'text',x:+e['10']||0,y:-(+e['20']||0),text:t,fs:Math.max(8,Math.min(72,h)),layer:e['8']||'注記'});tc++;i=e._end;continue;}
      if(val==='INSERT'){const e=readEnt(pairs,i);const bname=e['2']||'';const mapped=mapBlock(bname);if(mapped){const def=getDef(mapped);state.elements.push({id:genId('el'),type:mapped,x:+e['10']||0,y:-(+e['20']||0),label:def?.label||bname,layer:e['8']||'回路',rot:+e['50']||0,flipH:false,flipV:false});ic++;}i=e._end;continue;}
      if(val==='LWPOLYLINE'){const e=readPoly(pairs,i);if(e.pts&&e.pts.length>=2){const p=e.pts,minX=Math.min(...p.map(v=>v.x)),minY=Math.min(...p.map(v=>v.y)),maxX=Math.max(...p.map(v=>v.x)),maxY=Math.max(...p.map(v=>v.y));if(maxX-minX>0.1&&maxY-minY>0.1)state.elements.push({id:genId('el'),type:'rect',x:minX,y:minY,w:maxX-minX,h:maxY-minY,layer:e['8']||'外形'});else if(maxX-minX>0.1||maxY-minY>0.1)state.wires.push({x1:p[0].x,y1:p[0].y,x2:p[p.length-1].x,y2:p[p.length-1].y,pts:p,layer:e['8']||'配線',wireNo:null});}i=e._end;continue;}
      if(val==='ARC'){const e=readEnt(pairs,i);const r=+e['40']||0;if(r>0){state.elements.push({id:genId('el'),type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}i=e._end;continue;}
      if(val==='ELLIPSE'){const e=readEnt(pairs,i);const r=Math.abs(+e['40']||0)*Math.hypot(+e['11']||0,+e['21']||0);if(r>0){state.elements.push({id:genId('el'),type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}i=e._end;continue;}
      if(val==='SPLINE'){const e=readPoly(pairs,i);if(e.pts&&e.pts.length>=2){for(let k=0;k<e.pts.length-1;k++){state.wires.push({x1:e.pts[k].x,y1:e.pts[k].y,x2:e.pts[k+1].x,y2:e.pts[k+1].y,pts:[e.pts[k],e.pts[k+1]],layer:e['8']||'外形',wireNo:null});lc++;}}i=e._end;continue;}
      if(val==='DIMENSION'){const e=readEnt(pairs,i);state.elements.push({id:genId('el'),type:'dim',x1:+e['13']||0,y1:-(+e['23']||0),x2:+e['14']||0,y2:-(+e['24']||0),dimText:e['1']||'',offset:30,arrowSz:8,layer:e['8']||'寸法',x:(+e['13']||0+e['14']||0)/2,y:-(+e['23']||0+e['24']||0)/2});i=e._end;continue;}
    }
    i++;
  }
  const total=lc+cc+tc+ic;
  document.getElementById('dxf-log-body').innerHTML=`<p style="font-size:11px;margin-bottom:8px">読込完了: <b>${total}</b>要素</p><table class="tbl"><tr><th>種別</th><th>件数</th></tr><tr><td>配線</td><td>${lc}</td></tr><tr><td>円</td><td>${cc}</td></tr><tr><td>テキスト</td><td>${tc}</td></tr><tr><td>シンボル</td><td>${ic}</td></tr></table>${total===0?'<p style="font-size:11px;color:var(--red);margin-top:6px">要素が読み込めませんでした</p>':''}`;
  document.getElementById('dxf-log-p').classList.add('open');draw();
}
function readEnt(pairs,start){const e={_end:start+1};let i=start+1;while(i<pairs.length){const{code,val}=pairs[i];if(code===0)break;if(e[String(code)]===undefined)e[String(code)]=val;i++;}e._end=i;return e;}
function readPoly(pairs,start){const e={_end:start+1,pts:[]};let i=start+1,cx=null;while(i<pairs.length){const{code,val}=pairs[i];if(code===0&&i>start+1)break;if(e[String(code)]===undefined&&code!==10&&code!==20)e[String(code)]=val;if(code===10)cx=+val||0;if(code===20&&cx!==null){e.pts.push({x:cx,y:-(+val||0)});cx=null;}i++;}e._end=i;return e;}
function fromUnicodeDXF(str){return str.replace(/\\U\+([0-9A-Fa-f]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));}const n=name.toLowerCase();const m=[
  ['coil','coil'],['relay','coil'],['timer','timer_coil'],
  ['motor','motor'],['breaker','breaker'],['mccb','breaker'],
  ['cb','breaker'],['nf','breaker'],['fuse','fuse'],
  ['lamp','lamp'],['sw_no','sw_no'],['sw_nc','sw_nc'],
  ['push_no','push_no'],['push','push_no'],
  ['terminal','terminal'],['tb','terminal'],
  ['transformer','transformer'],['trans','transformer'],
  ['battery','battery'],['batt','battery'],
  ['capacitor','capacitor'],['cap','capacitor'],
  ['resistor','resistor'],['res','resistor'],
  ['inductor','inductor'],['ind','inductor'],
  ['diode','diode'],
  ['ac','ac'],['ground','ground'],['gnd','ground'],
];for(const[k,v]of m)if(n.includes(k))return v;return null;}
