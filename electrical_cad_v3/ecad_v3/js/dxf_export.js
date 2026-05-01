// ================================================================
// dxf_export.js — DXF出力
// 依存: state, LAYERS, getDef, dl
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
