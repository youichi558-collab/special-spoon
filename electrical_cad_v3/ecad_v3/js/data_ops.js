// ================================================================
// 線番・BOM・端子台・リファレンス
// ================================================================
function autoWireNumber(){
  pushH();let n=1;state.wires.forEach(w=>{if(!w.wireNo){w.wireNo='W'+String(n).padStart(3,'0');}n++;});
  let html=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">${state.wires.length}本に線番を割付しました</p><table class="tbl"><tr><th>線番</th><th>始点</th><th>終点</th><th>レイヤー</th></tr>`;
  state.wires.forEach(w=>{const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];const p0=pts[0],p1=pts[pts.length-1];html+=`<tr><td><span class="badge badge-b">${w.wireNo||'-'}</span></td><td>${Math.round(p0.x)},${Math.round(p0.y)}</td><td>${Math.round(p1.x)},${Math.round(p1.y)}</td><td>${w.layer||''}</td></tr>`;});
  html+='</table>';document.getElementById('wire-body').innerHTML=html;document.getElementById('wire-p').classList.add('open');draw();
}
function exportWireCSV(){const rows=['線番,始点X,始点Y,終点X,終点Y,レイヤー',...state.wires.map(w=>{const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];const p0=pts[0],p1=pts[pts.length-1];return`${w.wireNo||''},${Math.round(p0.x)},${Math.round(p0.y)},${Math.round(p1.x)},${Math.round(p1.y)},${w.layer||''}`;})];dl(rows.join('\n'),'wire_numbers.csv','text/csv');}
function showBOM(){
  const counts={};state.elements.forEach(el=>{if(['text','rect','circle','fline'].includes(el.type))return;const k=`${el.type}|${el.label}`;if(!counts[k])counts[k]={type:el.type,label:el.label||'',count:0,jis:getDef(el.type)?.jis||''};counts[k].count++;});
  const rows=Object.values(counts);
  let html=rows.length?`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">合計 ${state.elements.filter(e=>!['text','rect','circle','fline'].includes(e.type)).length} 個</p><table class="tbl"><tr><th>記号</th><th>種別</th><th>JIS</th><th>数量</th></tr>${rows.map(r=>`<tr><td>${r.label}</td><td>${r.type}</td><td style="color:var(--acc)">${r.jis}</td><td style="font-weight:600">${r.count}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">配置されたシンボルがありません</p>';
  document.getElementById('bom-body').innerHTML=html;document.getElementById('bom-p').classList.add('open');
}
function exportBOMCSV(){const counts={};state.elements.forEach(el=>{if(['text','rect','circle','fline'].includes(el.type))return;const k=`${el.type}|${el.label}`;if(!counts[k])counts[k]={type:el.type,label:el.label||'',count:0,jis:getDef(el.type)?.jis||''};counts[k].count++;});dl(['記号,種別,JIS規格,数量',...Object.values(counts).map(r=>`${r.label},${r.type},${r.jis},${r.count}`)].join('\n'),'bom.csv','text/csv');}
function showRefPanel(){
  const coils=state.elements.filter(el=>getDef(el.type)?.isCoil);
  const contacts=state.elements.filter(el=>getDef(el.type)?.isContact||el.refCoil);
  const map={};coils.forEach(c=>{const k=c.coilName||c.label||'?';if(!map[k])map[k]={coil:c,contacts:[]};});
  contacts.forEach(ct=>{const k=ct.refCoil||(coils.find(c=>(c.coilName||c.label)===ct.label)?ct.label:null);if(k){if(!map[k])map[k]={coil:null,contacts:[]};if(!map[k].contacts.includes(ct))map[k].contacts.push(ct);}});
  let html=Object.keys(map).length?`<table class="tbl"><tr><th>コイル名</th><th>種別</th><th>接点</th><th>数</th></tr>${Object.entries(map).map(([key,{coil,contacts}])=>`<tr><td><b>${key}</b></td><td>${coil?`<span class="badge badge-p">${coil.type==='timer_coil'?'タイマ':'リレー'}</span>`:'<span class="badge" style="background:var(--rbg);color:var(--red)">未配置</span>'}</td><td>${contacts.map(c=>`<span class="badge badge-${getDef(c.type).contactType==='a'?'g':'b'}">${c.label}</span>`).join(' ')||'なし'}</td><td>${contacts.length}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">コイルシンボルがありません</p>';
  document.getElementById('ref-body').innerHTML=html;document.getElementById('ref-p').classList.add('open');
}
function showTerminals(){
  const terms=state.elements.filter(el=>el.type==='terminal');
  let html=terms.length?`<table class="tbl"><tr><th>No</th><th>ラベル</th><th>端子番号</th><th>線番</th><th>メモ</th></tr>${terms.map((t,i)=>`<tr><td>${i+1}</td><td>${t.label||''}</td><td>${t.terminals||''}</td><td>${t.wireNo||''}</td><td>${t.note||''}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">端子台がありません</p>';
  document.getElementById('term-body').innerHTML=html;document.getElementById('term-p').classList.add('open');
}
function exportTermCSV(){const terms=state.elements.filter(el=>el.type==='terminal');dl(['No,ラベル,端子番号,線番,メモ',...terms.map((t,i)=>`${i+1},${t.label||''},${t.terminals||''},${t.wireNo||''},${t.note||''}`)].join('\n'),'terminals.csv','text/csv');}

// ================================================================
// DXF・印刷
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
  while(i<pairs.length){
    const{code,val}=pairs[i];
    if(code===0){
      if(val==='LINE'){const e=readEnt(pairs,i);const x1=+e['10']||0,y1=-(+e['20']||0),x2=+e['11']||0,y2=-(+e['21']||0);if(Math.hypot(x2-x1,y2-y1)>0.1){state.wires.push({x1,y1,x2,y2,pts:[{x:x1,y:y1},{x:x2,y:y2}],layer:e['8']||'配線',wireNo:null});lc++;}i=e._end;continue;}
      if(val==='CIRCLE'){const e=readEnt(pairs,i);const r=+e['40']||0;if(r>0){state.elements.push({type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}i=e._end;continue;}
      if(val==='TEXT'||val==='MTEXT'){const e=readEnt(pairs,i);let t=(e['1']||e['3']||'').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/\\P/g,' ').trim();const h=+e['40']||12;if(t)state.elements.push({type:'text',x:+e['10']||0,y:-(+e['20']||0),text:t,fs:Math.max(8,Math.min(72,h)),layer:e['8']||'注記'});tc++;i=e._end;continue;}
      if(val==='INSERT'){const e=readEnt(pairs,i);const bname=e['2']||'';const mapped=mapBlock(bname);const def=getDef(mapped);state.elements.push({type:mapped,x:+e['10']||0,y:-(+e['20']||0),label:def.label||bname,layer:e['8']||'回路',rot:+e['50']||0,flipH:false,flipV:false});ic++;i=e._end;continue;}
      if(val==='LWPOLYLINE'){const e=readPoly(pairs,i);if(e.pts&&e.pts.length>=2){const p=e.pts,minX=Math.min(...p.map(v=>v.x)),minY=Math.min(...p.map(v=>v.y)),maxX=Math.max(...p.map(v=>v.x)),maxY=Math.max(...p.map(v=>v.y));if(maxX-minX>0.1&&maxY-minY>0.1)state.elements.push({type:'rect',x:minX,y:minY,w:maxX-minX,h:maxY-minY,layer:e['8']||'外形'});else if(maxX-minX>0.1||maxY-minY>0.1)state.wires.push({x1:p[0].x,y1:p[0].y,x2:p[p.length-1].x,y2:p[p.length-1].y,pts:p,layer:e['8']||'配線',wireNo:null});}i=e._end;continue;}
      if(val==='ARC'){const e=readEnt(pairs,i);const r=+e['40']||0;if(r>0){state.elements.push({type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}i=e._end;continue;}
      if(val==='ELLIPSE'){const e=readEnt(pairs,i);const r=Math.abs(+e['40']||0)*Math.hypot(+e['11']||0,+e['21']||0);if(r>0){state.elements.push({type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}i=e._end;continue;}
      if(val==='SPLINE'){const e=readPoly(pairs,i);if(e.pts&&e.pts.length>=2){for(let k=0;k<e.pts.length-1;k++){state.wires.push({x1:e.pts[k].x,y1:e.pts[k].y,x2:e.pts[k+1].x,y2:e.pts[k+1].y,pts:[e.pts[k],e.pts[k+1]],layer:e['8']||'外形',wireNo:null});lc++;}}i=e._end;continue;}
      if(val==='DIMENSION'){const e=readEnt(pairs,i);state.elements.push({type:'dim',x1:+e['13']||0,y1:-(+e['23']||0),x2:+e['14']||0,y2:-(+e['24']||0),dimText:e['1']||'',offset:30,arrowSz:8,layer:e['8']||'寸法',x:(+e['13']||0+e['14']||0)/2,y:-(+e['23']||0+e['24']||0)/2});i=e._end;continue;}
    }
    i++;
  }
  const total=lc+cc+tc+ic;
  document.getElementById('dxf-log-body').innerHTML=`<p style="font-size:11px;margin-bottom:8px">読込完了: <b>${total}</b>要素</p><table class="tbl"><tr><th>種別</th><th>件数</th></tr><tr><td>配線</td><td>${lc}</td></tr><tr><td>円</td><td>${cc}</td></tr><tr><td>テキスト</td><td>${tc}</td></tr><tr><td>シンボル</td><td>${ic}</td></tr></table>${total===0?'<p style="font-size:11px;color:var(--red);margin-top:6px">要素が読み込めませんでした</p>':''}`;
  document.getElementById('dxf-log-p').classList.add('open');draw();
}
function readEnt(pairs,start){const e={_end:start+1};let i=start+1;while(i<pairs.length){const{code,val}=pairs[i];if(code===0)break;if(e[String(code)]===undefined)e[String(code)]=val;i++;}e._end=i;return e;}
function readPoly(pairs,start){const e={_end:start+1,pts:[]};let i=start+1,cx=null;while(i<pairs.length){const{code,val}=pairs[i];if(code===0&&i>start+1)break;if(e[String(code)]===undefined&&code!==10&&code!==20)e[String(code)]=val;if(code===10)cx=+val||0;if(code===20&&cx!==null){e.pts.push({x:cx,y:-(+val||0)});cx=null;}i++;}e._end=i;return e;}
function mapBlock(name){const n=name.toLowerCase();const m=[['coil','coil'],['relay','coil'],['timer','timer_coil'],['motor','motor'],['breaker','breaker'],['mccb','breaker'],['cb','breaker'],['nf','breaker'],['fuse','fuse'],['lamp','lamp'],['sw_no','sw_no'],['sw_nc','sw_nc'],['terminal','terminal'],['tb','terminal'],['transformer','transformer']];for(const[k,v]of m)if(n.includes(k))return v;return'text';}
// ================================================================
// PDF出力（ベクター：jsPDF直接API）
// ================================================================
