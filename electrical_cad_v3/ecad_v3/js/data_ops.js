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
function buildSymBlocksDXF(){
  const ls=[];
  function bk(name,fn){
    ls.push('0','BLOCK','8','0','2',name,'70','1','10','0','20','0','30','0','3',name,'1','');
    fn();
    ls.push('0','ENDBLK','8','0');
  }
  function LN(x1,y1,x2,y2){ls.push('0','LINE','8','0','10',x1.toFixed(3),'20',(-y1).toFixed(3),'30','0','11',x2.toFixed(3),'21',(-y2).toFixed(3),'31','0');}
  function CIR(cx,cy,r){ls.push('0','CIRCLE','8','0','10',cx.toFixed(3),'20',(-cy).toFixed(3),'30','0','40',r.toFixed(3));}
  function ARC(cx,cy,r,sa,ea){ls.push('0','ARC','8','0','10',cx.toFixed(3),'20',(-cy).toFixed(3),'30','0','40',r.toFixed(3),'50',sa.toFixed(3),'51',ea.toFixed(3));}
  function RCT(x1,y1,x2,y2){ls.push('0','LWPOLYLINE','8','0','90','4','70','1','43','0','10',x1.toFixed(3),'20',(-y1).toFixed(3),'10',x2.toFixed(3),'20',(-y1).toFixed(3),'10',x2.toFixed(3),'20',(-y2).toFixed(3),'10',x1.toFixed(3),'20',(-y2).toFixed(3));}
  function TXT(x,y,h,s){ls.push('0','TEXT','8','0','10',x.toFixed(3),'20',(-y).toFixed(3),'30','0','40',h.toFixed(3),'1',s,'72','1');}
  bk('resistor',()=>{ LN(-32,0,-18,0); RCT(-18,-8,18,8); LN(18,0,32,0); });
  bk('capacitor',()=>{ LN(-27,0,-6,0); LN(-6,-12,-6,12); LN(6,-12,6,12); LN(6,0,27,0); });
  bk('inductor',()=>{ LN(-32,0,-22,0); for(let i=0;i<4;i++) ARC(-16+i*10,0,8,0,180); LN(22,0,32,0); });
  bk('diode',()=>{ LN(-32,0,-12,0); LN(-12,-10,-12,10); LN(-12,10,12,0); LN(12,0,-12,-10); LN(12,-10,12,10); LN(12,0,32,0); });
  bk('sw_no',()=>{ LN(-32,0,-14,0); CIR(-14,0,3); LN(-14,0,14,-9); CIR(14,0,3); LN(14,0,32,0); });
  bk('push_no',()=>{ LN(-32,0,-14,0); CIR(-14,0,3); LN(-14,0,14,-9); CIR(14,0,3); LN(14,0,32,0); LN(0,-14,0,-9); LN(-6,-14,6,-14); });
  bk('sw_nc',()=>{ LN(-32,0,-14,0); CIR(-14,0,3); LN(-14,0,14,5); CIR(14,0,3); LN(14,0,32,0); LN(0,-10,0,-2); });
  bk('coil',()=>{ LN(-32,0,-20,0); RCT(-20,-14,20,14); LN(20,0,32,0); TXT(0,4,9,'CR'); });
  bk('timer_coil',()=>{ LN(-32,0,-20,0); RCT(-20,-14,20,14); LN(20,0,32,0); TXT(0,0,9,'TIM'); CIR(0,10,4); });
  bk('breaker',()=>{ LN(-32,0,-20,0); RCT(-20,-14,20,14); LN(20,0,32,0); TXT(0,4,9,'CB'); });
  bk('motor',()=>{ CIR(0,0,20); LN(-32,0,-20,0); LN(20,0,32,0); TXT(0,5,14,'M'); });
  bk('lamp',()=>{ CIR(0,0,18); LN(-11,-9,11,9); LN(11,-9,-11,9); LN(-32,0,-18,0); LN(18,0,32,0); });
  bk('ground',()=>{ LN(0,-18,0,0); LN(-18,0,18,0); LN(-13,5,13,5); LN(-8,10,8,10); });
  bk('battery',()=>{ LN(-36,0,-14,0); LN(-14,-9,-14,9); LN(-7,-6,-7,6); LN(0,-9,0,9); LN(7,-6,7,6); LN(14,-9,14,9); LN(14,0,36,0); });
  bk('fuse',()=>{ LN(-32,0,-18,0); RCT(-18,-7,18,7); LN(-18,0,18,0); LN(18,0,32,0); });
  bk('ac',()=>{ LN(-32,0,-20,0); CIR(0,0,19); LN(-14,0,-7,-13); LN(-7,-13,0,0); LN(0,0,7,13); LN(7,13,14,0); LN(19,0,32,0); });
  bk('transformer',()=>{ LN(-32,0,-22,0); ARC(-16,0,7,0,180); ARC(-8,0,7,0,180); ARC(0,0,7,0,180); LN(0,-16,0,16); ARC(2,0,7,180,0); ARC(10,0,7,180,0); ARC(18,0,7,180,0); LN(26,0,32,0); });
  bk('terminal',()=>{ LN(-20,0,20,0); RCT(-10,-8,10,8); LN(-4,-4,4,4); LN(4,-4,-4,4); });
  return ls;
}

function toUnicodeDXF(str){return[...str].map(c=>{const code=c.charCodeAt(0);return code>127?`\\U+${code.toString(16).toUpperCase().padStart(4,'0')}`:c;}).join('');}
function exportDXF(){
  const ls=[];
  ls.push('0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','0','ENDSEC');
  ls.push('0','SECTION','2','TABLES','0','TABLE','2','LAYER','70',String(LAYERS.length));
  LAYERS.forEach((l,i)=>ls.push('0','LAYER','2',l.name,'70','0','62',String(i+1),'6','CONTINUOUS'));
  ls.push('0','ENDTAB','0','ENDSEC');
  ls.push('0','SECTION','2','BLOCKS');
  ls.push(...buildSymBlocksDXF());
  ls.push('0','ENDSEC');
  ls.push('0','SECTION','2','ENTITIES');
  if(state.frameObj){
    const fr=state.frameObj;
    const{sc,wMM,hMM,mg,thMM,cols=8,rows=4}=fr;
    const W=wMM*sc,H=hMM*sc,MG=mg*sc,TH=thMM*sc;
    const innerW=W-MG*2,innerH=H-MG*2,drawH=innerH-TH;
    const colW=innerW/cols,rowH=drawH/rows;
    function ft(x,y,h,s){if(!s)return;ls.push('0','TEXT','8','図面枠','10',x.toFixed(2),'20',(-y).toFixed(2),'30','0','40',h.toFixed(2),'1',toUnicodeDXF(s),'72','1','11',x.toFixed(2),'21',(-y).toFixed(2),'31','0','73','2');}
    function fl(x1,y1,x2,y2){ls.push('0','LINE','8','図面枠','10',x1.toFixed(2),'20',(-y1).toFixed(2),'30','0','11',x2.toFixed(2),'21',(-y2).toFixed(2),'31','0');}
    addRect(ls,'図面枠',0,0,W,H);
    addRect(ls,'図面枠',MG,MG,W-MG,H-MG);
    addRect(ls,'図面枠',MG,MG+drawH,W-MG,MG+innerH);
    for(let c=1;c<cols;c++){fl(MG+c*colW,0,MG+c*colW,MG);fl(MG+c*colW,MG+drawH,MG+c*colW,MG+innerH);}
    for(let r=1;r<rows;r++){fl(0,MG+r*rowH,MG,MG+r*rowH);fl(MG+innerW,MG+r*rowH,W,MG+r*rowH);}
    for(let c=0;c<cols;c++){ft(MG+c*colW+colW/2,MG-4,7,String.fromCharCode(65+c%26));}
    for(let r=0;r<rows;r++){
      ft(MG-6,MG+r*rowH+rowH/2+2,7,String(r+1));
      ft(MG+innerW+3,MG+r*rowH+rowH/2+2,7,String(r+1));
    }
    const tbY=MG+drawH;
    const cells=[
      {x:0,y:0,w:.25,h:.5,key:'drawno',lbl:'図面番号'},
      {x:.25,y:0,w:.35,h:.5,key:'title',lbl:'図面名称'},
      {x:.6,y:0,w:.2,h:.5,key:'company',lbl:'会社名'},
      {x:.8,y:0,w:.2,h:.5,key:'equip',lbl:'設備名'},
      {x:0,y:.5,w:.12,h:.5,key:'author',lbl:'作成'},
      {x:.12,y:.5,w:.12,h:.5,key:'approve',lbl:'承認'},
      {x:.24,y:.5,w:.2,h:.5,key:'date',lbl:'日付'},
      {x:.44,y:.5,w:.1,h:.5,key:'scale2',lbl:'縮尺'},
      {x:.54,y:.5,w:.06,h:.5,key:'rev',lbl:'Rev'},
    ];
    cells.forEach(c=>{
      const cx=MG+c.x*innerW,cy=tbY+c.y*TH,cw=c.w*innerW,ch=c.h*TH;
      addRect(ls,'図面枠',cx,cy,cx+cw,cy+ch);
      ft(cx+2,cy+4,6,c.lbl);
      if(fr[c.key])ft(cx+3,cy+ch-4,9,fr[c.key]);
    });
  }
  state.elements.filter(e=>e.type==='dim').forEach(el=>{
    const dx=el.x2-el.x1,dy=el.y2-el.y1,len=Math.hypot(dx,dy);
    if(len<0.1)return;
    const off=el.offset||30;
    const ux=dx/len,uy=dy/len,px=-uy,py=ux;
    const ax1=el.x1+px*off,ay1=el.y1+py*off,ax2=el.x2+px*off,ay2=el.y2+py*off;
    ls.push('0','DIMENSION','8',el.layer||'寸法','10',((ax1+ax2)/2).toFixed(3),'20',(-(ay1+ay2)/2).toFixed(3),'30','0','11',((ax1+ax2)/2).toFixed(3),'21',(-(ay1+ay2)/2).toFixed(3),'31','0','70','32','13',el.x1.toFixed(3),'23',(-el.y1).toFixed(3),'33','0','14',el.x2.toFixed(3),'24',(-el.y2).toFixed(3),'34','0','1',el.dimText||'');
    ls.push('0','LINE','8',el.layer||'寸法','10',ax1.toFixed(3),'20',(-ay1).toFixed(3),'30','0','11',ax2.toFixed(3),'21',(-ay2).toFixed(3),'31','0');
    ls.push('0','LINE','8',el.layer||'寸法','10',el.x1.toFixed(3),'20',(-el.y1).toFixed(3),'30','0','11',ax1.toFixed(3),'21',(-ay1).toFixed(3),'31','0');
    ls.push('0','LINE','8',el.layer||'寸法','10',el.x2.toFixed(3),'20',(-el.y2).toFixed(3),'30','0','11',ax2.toFixed(3),'21',(-ay2).toFixed(3),'31','0');
    if(el.dimText)ls.push('0','TEXT','8',el.layer||'寸法','10',((ax1+ax2)/2).toFixed(3),'20',(-(ay1+ay2)/2-5).toFixed(3),'30','0','40','10','1',el.dimText,'72','1');
  });
  state.wires.forEach(w=>{const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];const layer=w.layer||'配線';for(let i=0;i<pts.length-1;i++)ls.push('0','LINE','8',layer,'10',pts[i].x.toFixed(2),'20',(-pts[i].y).toFixed(2),'30','0','11',pts[i+1].x.toFixed(2),'21',(-pts[i+1].y).toFixed(2),'31','0');if(w.wireNo){const mp=pts[Math.floor(pts.length/2)];ls.push('0','TEXT','8',layer,'10',mp.x.toFixed(2),'20',(-mp.y+8).toFixed(2),'30','0','40','8','1',w.wireNo,'72','1');}});
  state.elements.forEach(el=>{const layer=el.layer||'回路';if(el.type==='text')ls.push('0','TEXT','8',layer,'10',el.x.toFixed(2),'20',(-el.y).toFixed(2),'30','0','40',String(el.fs||14),'1',el.text);else if(el.type==='rect')addRect(ls,layer,el.x,el.y,el.x+el.w,el.y+el.h);else if(el.type==='circle')ls.push('0','CIRCLE','8',layer,'10',el.x.toFixed(2),'20',(-el.y).toFixed(2),'30','0','40',el.r.toFixed(2));else if(el.type==='fline')ls.push('0','LINE','8',layer,'10',el.x1.toFixed(2),'20',(-el.y1).toFixed(2),'30','0','11',el.x2.toFixed(2),'21',(-el.y2).toFixed(2),'31','0');else{const d=getDef(el.type);ls.push('0','INSERT','8',layer,'2',el.type,'10',el.x.toFixed(3),'20',(-el.y).toFixed(3),'30','0','50',String(el.rot||0),'41','1','42','1','66','1');if(el.label){const lox=el.labelOffX||0,loy=el.labelOffY||(d.h/2+15);const rot=(el.rot||0)*Math.PI/180;const lx=el.x+lox*Math.cos(rot)-loy*Math.sin(rot);const ly=el.y+lox*Math.sin(rot)+loy*Math.cos(rot);ls.push('0','ATTRIB','8',layer,'10',lx.toFixed(3),'20',(-ly).toFixed(3),'30','0','40','10','1',el.label,'2','LABEL','70','0','72','1');}ls.push('0','SEQEND','8',layer);}});
  ls.push('0','ENDSEC','0','EOF');
  dl(ls.join('\n'),'circuit.dxf','application/dxf');
}
function addRect(ls,layer,x1,y1,x2,y2){ls.push('0','LWPOLYLINE','8',layer,'90','4','70','1','43','0','10',x1.toFixed(2),'20',(-y1).toFixed(2),'10',x2.toFixed(2),'20',(-y1).toFixed(2),'10',x2.toFixed(2),'20',(-y2).toFixed(2),'10',x1.toFixed(2),'20',(-y2).toFixed(2));}

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
function calcPageBounds(pg) {
  if (pg.frameObj) {
    const f = pg.frameObj;
    const W = (f.wMM || f.w || 297) * (f.sc || 1);
    const H = (f.hMM || f.h || 210) * (f.sc || 1);
    return { minX:0, minY:0, maxX:W, maxY:H };
  }
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const pad = 40;
  (pg.elements||[]).forEach(el => {
    const d = getDef(el.type) || {};
    const hw=(d.w||20)/2, hh=(d.h||20)/2;
    if      (el.type==='rect')   { minX=Math.min(minX,el.x); minY=Math.min(minY,el.y); maxX=Math.max(maxX,el.x+(el.w||0)); maxY=Math.max(maxY,el.y+(el.h||0)); }
    else if (el.type==='circle') { minX=Math.min(minX,el.x-(el.r||0)); minY=Math.min(minY,el.y-(el.r||0)); maxX=Math.max(maxX,el.x+(el.r||0)); maxY=Math.max(maxY,el.y+(el.r||0)); }
    else if (el.type==='dim' || el.type==='leader') {
      const off = (el.offset||30) + 20;
      minX=Math.min(minX,el.x1,el.x2)-off; minY=Math.min(minY,el.y1,el.y2)-off;
      maxX=Math.max(maxX,el.x1,el.x2)+off; maxY=Math.max(maxY,el.y1,el.y2)+off;
    }
    else if (el.x1!=null) { minX=Math.min(minX,el.x1,el.x2); minY=Math.min(minY,el.y1,el.y2); maxX=Math.max(maxX,el.x1,el.x2); maxY=Math.max(maxY,el.y1,el.y2); }
    else if (el.x!=null)  { minX=Math.min(minX,el.x-hw); minY=Math.min(minY,el.y-hh); maxX=Math.max(maxX,el.x+hw); maxY=Math.max(maxY,el.y+hh); }
  });
  (pg.wires||[]).forEach(w => {
    (w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(p => {
      minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
      maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
    });
  });
  if (!isFinite(minX)) return { minX:0, minY:0, maxX:297, maxY:210 };
  return { minX:minX-pad, minY:minY-pad, maxX:maxX+pad, maxY:maxY+pad };
}

function exportPDF() {
  document.getElementById('pdf-opt-p').classList.add('open');
}

// シンボル要素をオフスクリーンキャンバスでラスタライズ → dataURL
function rasterizeSymEl(el, s) {
  const dpi = 200;
  const def = getDef(el.type) || { w:40, h:40 };
  const pad = 10;
  const wW = (def.w||40) + pad*2;
  const hW = (def.h||40) + pad*2;
  const zoom = s * dpi / 25.4;
  const pxW = Math.max(4, Math.round(wW * zoom));
  const pxH = Math.max(4, Math.round(hW * zoom));
  const dispW = wW * s;
  const dispH = hW * s;

  const oc = document.createElement('canvas');
  oc.width = pxW; oc.height = pxH;
  const octx = oc.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, pxW, pxH);

  const origCv = cv, origCtx = ctx, origZoom = state.zoom;
  cv = oc; ctx = octx;
  // zoom=1にするとdrawSym内の N/state.zoom がN pxになりcanvasスケールで拡大される
  // → フォントが適切なサイズになる
  state.zoom = 1;

  octx.save();
  octx.translate(pxW/2, pxH/2);
  octx.scale(zoom, zoom);
  drawSym(el.type, 0, 0, false, el.rot||0, el.flipH, el.flipV, '#000000');
  octx.restore();

  cv = origCv; ctx = origCtx; state.zoom = origZoom;
  return { dataURL: oc.toDataURL('image/png'), dispW, dispH };
}

// テキスト要素をオフスクリーンキャンバスでラスタライズ（日本語対応）
// fsMM: フォントサイズ(mm)。el.fsはスクリーンpx単位なので呼び出し側で変換すること
function rasterizeTextEl(el, fsMM) {
  const dpi = 200;
  const text = el.text || '';
  if (!text) return null;
  const pxPerMM = dpi / 25.4;
  const fsPx = fsMM * pxPerMM;

  const tmpCv = document.createElement('canvas');
  tmpCv.width = 1; tmpCv.height = 1;
  const tmpCtx = tmpCv.getContext('2d');
  tmpCtx.font = `${fsPx}px sans-serif`;
  const tw = tmpCtx.measureText(text).width;

  const pxW = Math.max(4, Math.ceil(tw + 4));
  const pxH = Math.max(4, Math.ceil(fsPx * 1.5));

  const oc = document.createElement('canvas');
  oc.width = pxW; oc.height = pxH;
  const octx = oc.getContext('2d');
  // 背景透明（白で塗りつぶさない）
  octx.fillStyle = el.color || '#000000';
  octx.font = `${fsPx}px sans-serif`;
  octx.textBaseline = 'alphabetic';
  octx.fillText(text, 2, fsPx);
  return { dataURL: oc.toDataURL('image/png'), wMM: pxW / pxPerMM, hMM: pxH / pxPerMM };
}

function runExportPDF() {
  closeFP('pdf-opt-p');
  if (!window.jspdf?.jsPDF) {
    alert('PDF出力ライブラリが読み込まれていません。\nネット接続を確認してページを再読み込みしてください。');
    return;
  }
  const { jsPDF } = window.jspdf;

  const origPage = state.currentPage;
  const origDark = state.darkMode;
  const origSelEls   = new Set(state.sel.els);
  const origSelWires = new Set(state.sel.wires);

  state.darkMode = false;
  document.body.classList.remove('dk');
  state.sel.els.clear();
  state.sel.wires.clear();

  let pdf = null;

  // 色文字列 → jsPDF setDrawColor
  function applyColor(color) {
    if (!color) { pdf.setDrawColor(0); return; }
    const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) pdf.setDrawColor(parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16));
    else    pdf.setDrawColor(0);
  }

  // lineStyle → jsPDF setLineDashPattern
  function applyDash(style, s) {
    if      (style==='dash')    pdf.setLineDashPattern([8*s, 4*s], 0);
    else if (style==='dot')     pdf.setLineDashPattern([2*s, 4*s], 0);
    else if (style==='dashdot') pdf.setLineDashPattern([8*s, 3*s, 2*s, 3*s], 0);
    else                        pdf.setLineDashPattern([], 0);
  }

  try {
    for (let idx = 0; idx < state.pages.length; idx++) {
      const pg = state.pages[idx];
      state.currentPage = idx;

      const b = calcPageBounds(pg);
      const contentW = b.maxX - b.minX;
      const contentH = b.maxY - b.minY;
      if (contentW < 1 || contentH < 1) continue;

      let pdfW, pdfH;
      if (pg.frameObj) {
        pdfW = pg.frameObj.wMM || pg.frameObj.w || 297;
        pdfH = pg.frameObj.hMM || pg.frameObj.h || 210;
      } else {
        pdfW = contentW >= contentH ? 297 : 210;
        pdfH = contentW >= contentH ? 210 : 297;
      }

      if (!pdf) {
        pdf = new jsPDF({ unit:'mm', format:[pdfW, pdfH], orientation: pdfW>=pdfH ? 'l' : 'p' });
      } else {
        pdf.addPage([pdfW, pdfH], pdfW>=pdfH ? 'l' : 'p');
      }

      // スケール: mm per world unit（アスペクト比を保って中央揃え）
      const sx = pdfW / contentW, sy = pdfH / contentH;
      const s = Math.min(sx, sy);
      const ox = (pdfW - s * contentW) / 2;
      const oy = (pdfH - s * contentH) / 2;
      const tx = wx => ox + (wx - b.minX) * s;
      const ty = wy => oy + (wy - b.minY) * s;
      const tm = v  => v * s;

      // 白背景
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdfW, pdfH, 'F');

      // ---- ワイヤー（ベクター） ----
      (pg.wires||[]).forEach(w => {
        const lay = LAYERS.find(l => l.name===w.layer);
        if (lay && !lay.visible) return;
        const lw  = w.lineWidth || 2;
        applyColor(lay ? lay.color : '#000000');
        pdf.setLineWidth(Math.max(0.05, lw * s));
        applyDash(w.lineStyle, s);
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        for (let i=0; i<pts.length-1; i++) {
          pdf.line(tx(pts[i].x), ty(pts[i].y), tx(pts[i+1].x), ty(pts[i+1].y));
        }
        pdf.setLineDashPattern([], 0);
      });

      // ---- 要素 ----
      (pg.elements||[]).forEach(el => {
        const lay = LAYERS.find(l => l.name===el.layer);
        if (lay && !lay.visible) return;
        const lc = lay ? lay.color : '#000000';

        if (el.type==='fline') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle, s);
          pdf.line(tx(el.x1), ty(el.y1), tx(el.x2), ty(el.y2));
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='rect') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle, s);
          pdf.rect(tx(el.x), ty(el.y), tm(el.w||0), tm(el.h||0), 'S');
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='circle') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle, s);
          pdf.circle(tx(el.x), ty(el.y), tm(el.r||1), 'S');
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='text') {
          // テキスト: el.fsはスクリーンpx → 0.35mm/px で変換（72dpi相当）
          const fsMM = (el.fs || 14) * 0.35;
          const res = rasterizeTextEl(el, fsMM);
          if (res) {
            pdf.addImage(res.dataURL, 'PNG', tx(el.x)-2*s, ty(el.y) - res.hMM * 0.72, res.wMM, res.hMM, '', 'FAST');
          }

        } else if (el.type!=='dim' && el.type!=='leader') {
          // 電気シンボル: ラスタライズ（アスペクト比修正済み）
          const res = rasterizeSymEl(el, s);
          pdf.addImage(res.dataURL, 'PNG', tx(el.x)-res.dispW/2, ty(el.y)-res.dispH/2, res.dispW, res.dispH, '', 'FAST');

          // シンボルラベル（el.label）を別途描画 — 3.5mm固定
          if (el.label) {
            const def2 = getDef(el.type) || { w:64, h:34 };
            const lox = el.labelOffX || 0;
            const loy = el.labelOffY || (def2.h/2+15);
            const rot = (el.rot||0) * Math.PI/180;
            const lx = el.x + lox*Math.cos(rot) - loy*Math.sin(rot);
            const ly = el.y + lox*Math.sin(rot) + loy*Math.cos(rot);
            const lblEl2 = { text: el.label, color: '#555555' };
            const lblRes2 = rasterizeTextEl(lblEl2, 3.5);
            if (lblRes2) pdf.addImage(lblRes2.dataURL, 'PNG', tx(lx) - lblRes2.wMM/2, ty(ly) - lblRes2.hMM*0.72, lblRes2.wMM, lblRes2.hMM, '', 'FAST');
          }
        }
      });

      // ---- 図面枠・表題欄（ベクター＋ラスタライズテキスト） ----
      if (pg.frameObj) {
        const fr = pg.frameObj;
        const mg = fr.mg || 10;
        const thMM = fr.thMM || 30;
        const innerW = pdfW - mg * 2;
        const innerH = pdfH - mg * 2;
        const drawH = innerH - thMM;
        const tbY = mg + drawH;

        pdf.setDrawColor(0);
        pdf.setLineDashPattern([], 0);

        // 外枠
        pdf.setLineWidth(0.7);
        pdf.rect(0, 0, pdfW, pdfH, 'S');
        // 内枠
        pdf.setLineWidth(0.5);
        pdf.rect(mg, mg, innerW, innerH, 'S');

        // 表題欄外枠
        pdf.setLineWidth(0.5);
        pdf.rect(mg, tbY, innerW, thMM, 'S');

        // 表題欄セル
        const cells = [
          {x:0,y:0,w:.25,h:.5,key:'drawno',lbl:'図面番号'},
          {x:.25,y:0,w:.35,h:.5,key:'title',lbl:'図面名称'},
          {x:.6,y:0,w:.2,h:.5,key:'company',lbl:'会社名'},
          {x:.8,y:0,w:.2,h:.5,key:'equip',lbl:'設備名'},
          {x:0,y:.5,w:.12,h:.5,key:'author',lbl:'作成'},
          {x:.12,y:.5,w:.12,h:.5,key:'approve',lbl:'承認'},
          {x:.24,y:.5,w:.2,h:.5,key:'date',lbl:'日付'},
          {x:.44,y:.5,w:.1,h:.5,key:'scale2',lbl:'縮尺'},
          {x:.54,y:.5,w:.06,h:.5,key:'rev',lbl:'Rev'},
          {x:.8,y:.5,w:.2,h:.5,key:'_page',lbl:'ページ'},
        ];

        pdf.setLineWidth(0.2);
        pdf.setDrawColor(100, 100, 100);
        const lblFsMM = thMM * 0.12;   // ラベル: セル高の約12%
        const valFsMM = thMM * 0.22;   // 値: セル高の約22%
        cells.forEach(c => {
          const cx = mg + c.x * innerW;
          const cy = tbY + c.y * thMM;
          const cw = c.w * innerW;
          const ch = c.h * thMM;
          pdf.rect(cx, cy, cw, ch, 'S');

          // ラベルテキスト
          const lblEl = { text: c.lbl, color: '#777777' };
          const lblRes = rasterizeTextEl(lblEl, lblFsMM);
          if (lblRes) pdf.addImage(lblRes.dataURL, 'PNG', cx+1, cy+1, lblRes.wMM, lblRes.hMM, '', 'FAST');

          // 値テキスト
          const val = c.key === '_page'
            ? `${idx+1} / ${state.pages.length}`
            : (fr[c.key] || '');
          if (val) {
            const valEl = { text: val, color: '#111111' };
            const valRes = rasterizeTextEl(valEl, valFsMM);
            if (valRes) pdf.addImage(valRes.dataURL, 'PNG', cx+2, cy + ch - valRes.hMM * 0.8, valRes.wMM, valRes.hMM, '', 'FAST');
          }
        });
      }
    }  // end for loop

    if (pdf) {
      pdf.save((state.saveFileName || '回路図') + '.pdf');
    } else {
      alert('出力できるページがありませんでした。');
    }
  } finally {
    state.currentPage = origPage;
    state.darkMode    = origDark;
    if (origDark) document.body.classList.add('dk');
    state.sel.els   = origSelEls;
    state.sel.wires = origSelWires;
    draw();
  }
}
