// ================================================================
// dxf_export.js — DXF出力
// 依存: state, LAYERS, getDef, dl
// ================================================================
function buildSymBlocksDXF(){
  const ls=[];
  function bk(name,fn){
    ls.push('0','BLOCK','8','0','2',name,'70','0','10','0','20','0','30','0','3',name,'1','');
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
  bk('timer_no',()=>{ LN(-32,0,-14,0); CIR(-14,0,3); LN(-11,0,11,-12); CIR(14,0,3); LN(14,0,32,0); ARC(0,6,8,0,180); });
  bk('timer_nc',()=>{ LN(-32,0,-14,0); CIR(-14,0,3); LN(-11,0,11,0); CIR(14,0,3); LN(14,0,32,0); LN(0,0,-6,-12); ARC(0,6,8,0,180); });
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
  ls.push('0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','4','999','ECAD_DXF_V1','0','ENDSEC');
  // frameObjをコメントとして保存（HEADERの直後、TABLES前が最も互換性が高い）
  if(state.frameObj){
    ls.push('999','ECAD_FRAME:'+JSON.stringify(state.frameObj));
  }
  // 線種テーブル
  const ltypeMap = { solid:'CONTINUOUS', dashed:'DASHED', dotted:'DOT', dashdot:'DASHDOT' };
  ls.push('0','SECTION','2','TABLES');
  ls.push('0','TABLE','2','LTYPE','70','4');
  ls.push('0','LTYPE','2','CONTINUOUS','70','0','3','Solid line','72','65','73','0','40','0.0');
  ls.push('0','LTYPE','2','DASHED','70','0','3','Dashed','72','65','73','2','40','9.5','49','6.35','49','-3.175');
  ls.push('0','LTYPE','2','DOT','70','0','3','Dot','72','65','73','2','40','3.175','49','0.0','49','-3.175');
  ls.push('0','LTYPE','2','DASHDOT','70','0','3','Dash dot','72','65','73','4','40','12.7','49','6.35','49','-3.175','49','0.0','49','-3.175');
  ls.push('0','ENDTAB');
  ls.push('0','TABLE','2','LAYER','70',String(LAYERS.length));
  LAYERS.forEach((l,i)=>ls.push('0','LAYER','2',l.name,'70',String(l.locked?4:0),'62',String(i+1),'6',ltypeMap[l.lineDash||'solid']||'CONTINUOUS'));
  ls.push('0','ENDTAB','0','ENDSEC');
  ls.push('0','SECTION','2','BLOCKS');
  ls.push(...buildSymBlocksDXF());
  ls.push('0','ENDSEC');
  ls.push('0','SECTION','2','ENTITIES');
  state.elements.filter(e=>e.type==='dim').forEach(el=>{
    const dx=el.x2-el.x1,dy=el.y2-el.y1,len=Math.hypot(dx,dy);
    if(len<0.1)return;
    const sign=el.offsetSign||1, off=Math.abs(el.offset||30);
    const ux=dx/len,uy=dy/len,px=-uy*sign,py=ux*sign;
    const ax1=el.x1+px*off,ay1=el.y1+py*off,ax2=el.x2+px*off,ay2=el.y2+py*off;
    const mx=(ax1+ax2)/2,my=(ay1+ay2)/2;
    const dimLyr = el.layer||'寸法';
    const gap=el.gap!=null?el.gap:10, ext=el.ext!=null?el.ext:5;
    const isOwnLyr = dimLyr==='寸法';
    // 寸法レイヤーならDIMENSION（自ツール読込用）も出力
    if(isOwnLyr){
      ls.push('0','DIMENSION','8',dimLyr,'10',mx.toFixed(3),'20',(-my).toFixed(3),'30','0',
        '11',mx.toFixed(3),'21',(-my).toFixed(3),'31','0','70','32',
        '13',el.x1.toFixed(3),'23',(-el.y1).toFixed(3),'33','0',
        '14',el.x2.toFixed(3),'24',(-el.y2).toFixed(3),'34','0','1',el.dimText||'');
    }
    // LINE+TEXT+矢印（他CAD表示用・寸法レイヤー以外も出力）
    const drawLyr = isOwnLyr ? '寸法_vis' : dimLyr;
    // 引出し線（gap空け）
    ls.push('0','LINE','8',drawLyr,'10',(el.x1+px*gap).toFixed(3),'20',(-(el.y1+py*gap)).toFixed(3),'30','0','11',(el.x1+px*(off+ext)).toFixed(3),'21',(-(el.y1+py*(off+ext))).toFixed(3),'31','0');
    ls.push('0','LINE','8',drawLyr,'10',(el.x2+px*gap).toFixed(3),'20',(-(el.y2+py*gap)).toFixed(3),'30','0','11',(el.x2+px*(off+ext)).toFixed(3),'21',(-(el.y2+py*(off+ext))).toFixed(3),'31','0');
    // 寸法線
    ls.push('0','LINE','8',drawLyr,'10',ax1.toFixed(3),'20',(-ay1).toFixed(3),'30','0','11',ax2.toFixed(3),'21',(-ay2).toFixed(3),'31','0');
    // 矢印（SOLID）
    const a=(el.arrowSz||8)*0.8, nx=-uy*sign, ny=ux*sign;
    function solidArrow(x,y,dux,duy){
      ls.push('0','SOLID','8',drawLyr,
        '10',(x).toFixed(3),'20',(-y).toFixed(3),'30','0',
        '11',(x+dux*a+nx*a*0.3).toFixed(3),'21',(-(y+duy*a+ny*a*0.3)).toFixed(3),'31','0',
        '12',(x+dux*a-nx*a*0.3).toFixed(3),'22',(-(y+duy*a-ny*a*0.3)).toFixed(3),'32','0',
        '13',(x+dux*a).toFixed(3),'23',(-(y+duy*a)).toFixed(3),'33','0');
    }
    solidArrow(ax1,ay1,ux,uy); solidArrow(ax2,ay2,-ux,-uy);
    // テキスト
    const txt=el.dimText||String(Math.round(len*(state.drawScale||1)));
    ls.push('0','TEXT','8',drawLyr,'10',mx.toFixed(3),'20',(-my-5).toFixed(3),'30','0','40','10','1',txt,'72','1');
  });
  // 図面枠（LINE/TEXT）を出力 - 自ツール読込時はisFrameLayerでスキップ
  if(state.frameObj){
    const fr=state.frameObj;
    const {sc,wMM,hMM,mg,thMM,cols,rows}=fr;
    const W=wMM*sc,H=hMM*sc,MGpx=mg*sc,TH=thMM*sc;
    const iW=W-MGpx*2,iH=H-MGpx*2,dH=iH-TH;
    const FL='図面枠';
    const L=(x1,y1,x2,y2)=>ls.push('0','LINE','8',FL,'10',x1.toFixed(2),'20',(-y1).toFixed(2),'30','0','11',x2.toFixed(2),'21',(-y2).toFixed(2),'31','0');
    const T=(x,y,h,s)=>{if(s)ls.push('0','TEXT','8',FL,'10',x.toFixed(2),'20',(-y).toFixed(2),'30','0','40',String(h),'1',String(s));};
    // 外枠
    L(0,0,W,0);L(W,0,W,H);L(W,H,0,H);L(0,H,0,0);
    // 内枠
    L(MGpx,MGpx,MGpx+iW,MGpx);
    L(MGpx+iW,MGpx,MGpx+iW,MGpx+iH);
    L(MGpx+iW,MGpx+iH,MGpx,MGpx+iH);
    L(MGpx,MGpx+iH,MGpx,MGpx);
    // 表題欄の横線
    L(MGpx,MGpx+dH,MGpx+iW,MGpx+dH);
    // 表題欄の縦区切り
    const tw=iW/4;
    L(MGpx+tw,MGpx+dH,MGpx+tw,MGpx+iH);
    L(MGpx+tw*2,MGpx+dH,MGpx+tw*2,MGpx+iH);
    L(MGpx+tw*3,MGpx+dH,MGpx+tw*3,MGpx+iH);
    // 表題欄テキスト
    const ty=MGpx+dH+TH*0.6,fs=Math.max(4,TH*0.3);
    T(MGpx+tw*0.1,ty,fs,fr.drawno);
    T(MGpx+tw*0.1,ty-TH*0.35,fs,fr.title||'');
    T(MGpx+tw*1.1,ty,fs,fr.author);
    T(MGpx+tw*2.1,ty,fs,fr.company);
    T(MGpx+tw*3.1,ty,fs,fr.scale2||'');
    // 列ラベル・分割線（余白部分のみ）
    if(cols>0){const cw=iW/cols;for(let c=1;c<cols;c++){L(MGpx+c*cw,0,MGpx+c*cw,MGpx);L(MGpx+c*cw,MGpx+iH,MGpx+c*cw,H);}
      for(let c=0;c<cols;c++){T(MGpx+c*cw+cw/2,MGpx/2,6,String.fromCharCode(65+c));T(MGpx+c*cw+cw/2,MGpx+iH+MGpx/2,6,String.fromCharCode(65+c));}}
    // 行ラベル・分割線（余白部分のみ、表題欄を除く図面エリアのみ）
    if(rows>0){const rh=dH/rows;for(let r=1;r<rows;r++){L(0,MGpx+r*rh,MGpx,MGpx+r*rh);L(MGpx+iW,MGpx+r*rh,W,MGpx+r*rh);}
      for(let r=0;r<rows;r++){T(MGpx/2,MGpx+r*rh+rh/2,6,String(r+1));T(MGpx+iW+MGpx/2,MGpx+r*rh+rh/2,6,String(r+1));}}
  }
  state.wires.forEach(w=>{const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];const layer=w.layer||'配線';for(let i=0;i<pts.length-1;i++)ls.push('0','LINE','8',layer,'10',pts[i].x.toFixed(2),'20',(-pts[i].y).toFixed(2),'30','0','11',pts[i+1].x.toFixed(2),'21',(-pts[i+1].y).toFixed(2),'31','0');if(w.wireNo){const mp=pts[Math.floor(pts.length/2)];ls.push('0','TEXT','8',layer,'10',mp.x.toFixed(2),'20',(-mp.y+8).toFixed(2),'30','0','40','8','1',w.wireNo,'72','1');}});
  state.elements.forEach(el=>{const layer=el.layer||'回路';
    if(el.type==='dim') return; // dimは上で既に出力済み
    if(el.type==='leader'){
      // leaderをLINE+TEXTとして出力
      ls.push('0','LINE','8',layer,'10',el.x1.toFixed(2),'20',(-el.y1).toFixed(2),'30','0','11',el.bx.toFixed(2),'21',(-el.by).toFixed(2),'31','0');
      ls.push('0','LINE','8',layer,'10',el.bx.toFixed(2),'20',(-el.by).toFixed(2),'30','0','11',el.x2.toFixed(2),'21',(-el.y2).toFixed(2),'31','0');
      if(el.leaderText)ls.push('0','TEXT','8',layer,'10',el.x2.toFixed(2),'20',(-el.y2).toFixed(2),'30','0','40','10','1',el.leaderText,'72','0');
      return;
    }
    if(el.type==='text')ls.push('0','TEXT','8',layer,'10',el.x.toFixed(2),'20',(-el.y).toFixed(2),'30','0','40',String(el.fs||14),'1',el.text);else if(el.type==='rect')addRect(ls,layer,el.x,el.y,el.x+el.w,el.y+el.h);else if(el.type==='circle')ls.push('0','CIRCLE','8',layer,'10',el.x.toFixed(2),'20',(-el.y).toFixed(2),'30','0','40',el.r.toFixed(2));else if(el.type==='fline')ls.push('0','LINE','8',layer,'10',el.x1.toFixed(2),'20',(-el.y1).toFixed(2),'30','0','11',el.x2.toFixed(2),'21',(-el.y2).toFixed(2),'31','0');else{const d=getDef(el.type);const sc=el.scale||1;ls.push('0','INSERT','8',layer,'2',el.type,'10',el.x.toFixed(3),'20',(-el.y).toFixed(3),'30','0','50',String(el.rot||0),'41',String(sc),'42',String(sc),'66','1');if(el.label){const lox=el.labelOffX||0,loy=el.labelOffY||(d.h/2+15);const rot=(el.rot||0)*Math.PI/180;const lx=el.x+lox*Math.cos(rot)-loy*Math.sin(rot);const ly=el.y+lox*Math.sin(rot)+loy*Math.cos(rot);ls.push('0','ATTRIB','8',layer,'10',lx.toFixed(3),'20',(-ly).toFixed(3),'30','0','40','10','1',el.label,'2','LABEL','70','0','72','1');}ls.push('0','SEQEND','8',layer);}
  });
  ls.push('0','ENDSEC','0','EOF');
  const pg = state.pages[state.currentPage];
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = (pg.name || ('Sheet'+(state.currentPage+1))).replace(/[\\/:*?"<>|]/g, '_');
  dl(ls.join('\n'), `${base}_${name}.dxf`, 'application/dxf');
}


function addRect(ls,layer,x1,y1,x2,y2){ls.push('0','LWPOLYLINE','8',layer,'90','4','70','1','43','0','10',x1.toFixed(2),'20',(-y1).toFixed(2),'10',x2.toFixed(2),'20',(-y1).toFixed(2),'10',x2.toFixed(2),'20',(-y2).toFixed(2),'10',x1.toFixed(2),'20',(-y2).toFixed(2));}
