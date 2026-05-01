// ================================================================
// 図面枠
// ================================================================
function loadFrameTpl(val){
  if(!val||val==='custom')return;
  // ユーザー保存テンプレートチェック
  if(val.startsWith('_')){
    const name=val.slice(1);
    const saved=JSON.parse(localStorage.getItem('ecad_frame_tpls')||'{}');
    if(saved[name]){Object.entries(saved[name]).forEach(([k,v])=>{const el=document.getElementById('f-'+k)||document.getElementById('frame-'+k);if(el)el.value=v;});}
    return;
  }
  const t=FRAME_TPLS[val];
  if(!t)return;
  document.getElementById('frame-w').value=t.w;
  document.getElementById('frame-h').value=t.h;
  document.getElementById('frame-mg').value=t.mg;
  document.getElementById('frame-th').value=t.th;
  document.getElementById('frame-cols').value=t.cols;
  document.getElementById('frame-rows').value=t.rows;
}
function applyFrame(){
  pushH();
  state.frameObj={
    sc:parseFloat(document.getElementById('frame-scale').value)||2,
    wMM:parseFloat(document.getElementById('frame-w').value)||297,
    hMM:parseFloat(document.getElementById('frame-h').value)||210,
    mg:parseFloat(document.getElementById('frame-mg').value)||10,
    thMM:parseFloat(document.getElementById('frame-th').value)||30,
    cols:parseInt(document.getElementById('frame-cols').value)||8,
    rows:parseInt(document.getElementById('frame-rows').value)||4,
    drawno:document.getElementById('f-drawno').value,
    title:document.getElementById('f-title').value,
    company:document.getElementById('f-company').value,
    equip:document.getElementById('f-equip').value,
    author:document.getElementById('f-author').value,
    approve:document.getElementById('f-approve').value,
    date:document.getElementById('f-date').value,
    scale2:document.getElementById('f-scale2').value,
    rev:document.getElementById('f-rev').value,
    chghist:document.getElementById('f-chghist')?.value||'',
  };
  closeFP('frame-p');resetView();draw();
}
function removeFrame(){pushH();state.frameObj=null;draw();}
function saveFrameTplUser(){
  const name=prompt('テンプレート名:');if(!name)return;
  const tpls=JSON.parse(localStorage.getItem('ecad_frame_tpls')||'{}');
  tpls[name]={w:document.getElementById('frame-w').value,h:document.getElementById('frame-h').value,mg:document.getElementById('frame-mg').value,th:document.getElementById('frame-th').value,cols:document.getElementById('frame-cols').value,rows:document.getElementById('frame-rows').value};
  localStorage.setItem('ecad_frame_tpls',JSON.stringify(tpls));
  // セレクトに追加
  refreshFrameTplSel();
  alert(`「${name}」を保存しました`);
}
function refreshFrameTplSel(){
  const sel=document.getElementById('frame-tpl');
  sel.querySelectorAll('option.user').forEach(o=>o.remove());
  const tpls=JSON.parse(localStorage.getItem('ecad_frame_tpls')||'{}');
  if(Object.keys(tpls).length){
    const grp=document.createElement('optgroup');grp.label='保存済みテンプレート';
    Object.keys(tpls).forEach(k=>{const o=document.createElement('option');o.value='_'+k;o.textContent=k;o.className='user';grp.appendChild(o);});
    sel.appendChild(grp);
  }
}
function showFramePanel(){
  refreshFrameTplSel();
  if(state.frameObj){
    document.getElementById('frame-scale').value=state.frameObj.sc;
    document.getElementById('frame-w').value=state.frameObj.wMM;
    document.getElementById('frame-h').value=state.frameObj.hMM;
    document.getElementById('frame-mg').value=state.frameObj.mg;
    document.getElementById('frame-th').value=state.frameObj.thMM;
    document.getElementById('frame-cols').value=state.frameObj.cols;
    document.getElementById('frame-rows').value=state.frameObj.rows;
    ['drawno','title','company','equip','author','approve','date','scale2','rev','chghist'].forEach(k=>{const el=document.getElementById('f-'+k);if(el)el.value=state.frameObj[k]||'';});
  }
  document.getElementById('frame-p').classList.add('open');
}
function drawFrame(fr){
  const {sc,wMM,hMM,mg,thMM,cols,rows}=fr;
  const W=wMM*sc,H=hMM*sc,MGpx=mg*sc,TH=thMM*sc;
  const innerW=W-MGpx*2,innerH=H-MGpx*2;
  const drawH=innerH-TH;

  ctx.save();
  // 用紙
  ctx.fillStyle=state.darkMode?'rgba(42,42,42,0.85)':'rgba(255,255,255,0.85)';
  ctx.fillRect(0,0,W,H);
  // グリッド（PDF出力時はスキップ）
  if (!state.pdfMode) {
    const step=state.G;
    ctx.strokeStyle=state.darkMode?'rgba(255,255,255,0.13)':'rgba(0,0,0,0.10)';
    ctx.lineWidth=0.4/state.zoom;
    const gx0=MGpx,gx1=MGpx+innerW,gy0=MGpx,gy1=MGpx+drawH;
    for(let x=gx0;x<=gx1+0.1;x+=step){
      ctx.beginPath();ctx.moveTo(x,gy0);ctx.lineTo(x,gy1);ctx.stroke();
    }
    for(let y=gy0;y<=gy1+0.1;y+=step){
      ctx.beginPath();ctx.moveTo(gx0,y);ctx.lineTo(gx1,y);ctx.stroke();
    }
  }
  // 用紙外枠
  ctx.strokeStyle=state.darkMode?'#ccc':'#000';ctx.lineWidth=2/state.zoom;
  ctx.strokeRect(0,0,W,H);
  // 内枠
  ctx.lineWidth=1/state.zoom;
  ctx.strokeRect(MGpx,MGpx,innerW,innerH);

  // 区域分割・ラベル（PDF出力時はスキップ）
  const colW=innerW/cols,rowH=drawH/rows;
  if (!state.pdfMode) {
    ctx.strokeStyle=state.darkMode?'#555':'#999';ctx.lineWidth=0.5/state.zoom;
    ctx.fillStyle=state.darkMode?'#aaa':'#666';
    ctx.font=`${9/state.zoom}px sans-serif`;ctx.textAlign='center';
    for(let c=1;c<cols;c++){ctx.beginPath();ctx.moveTo(MGpx+c*colW,MGpx);ctx.lineTo(MGpx+c*colW,MGpx+drawH);ctx.stroke();}
    for(let r=1;r<rows;r++){ctx.beginPath();ctx.moveTo(MGpx,MGpx+r*rowH);ctx.lineTo(MGpx+innerW,MGpx+r*rowH);ctx.stroke();}
    // 列ラベル (A,B,C...) - 上側のみ（下は表題欄と重なるため省略）
    for(let c=0;c<cols;c++){
      const lbl=String.fromCharCode(65+c%26);
      ctx.fillText(lbl,MGpx+c*colW+colW/2,MGpx-3/state.zoom);
    }
    // 行ラベル (1,2,3...)
    ctx.textAlign='center';
    for(let r=0;r<rows;r++){
      ctx.fillText(String(r+1),MGpx-8/state.zoom,MGpx+r*rowH+rowH/2+4/state.zoom);
      ctx.fillText(String(r+1),MGpx+innerW+8/state.zoom,MGpx+r*rowH+rowH/2+4/state.zoom);
    }
  }

  // 表題欄
  const tbY=MGpx+drawH;
  ctx.strokeStyle=state.darkMode?'#ccc':'#000';ctx.lineWidth=1/state.zoom;
  ctx.strokeRect(MGpx,tbY,innerW,TH);

  // 表題欄内セル
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
    {x:.6,y:.5,w:.2,h:.5,key:'chghist',lbl:'変更履歴'},
    {x:.8,y:.5,w:.2,h:.5,key:'_page',lbl:'ページ'},
  ];
  ctx.lineWidth=0.5/state.zoom;ctx.strokeStyle=state.darkMode?'#888':'#888';
  cells.forEach(c=>{
    const cx=MGpx+c.x*innerW,cy=tbY+c.y*TH,cw=c.w*innerW,ch=c.h*TH;
    ctx.strokeRect(cx,cy,cw,ch);
    ctx.fillStyle=state.darkMode?'#888':'#777';ctx.font=`${8/state.zoom}px sans-serif`;ctx.textAlign='left';
    ctx.fillText(c.lbl,cx+2/state.zoom,cy+9/state.zoom);
    ctx.fillStyle=state.darkMode?'#eee':'#111';ctx.font=`bold ${10/state.zoom}px sans-serif`;
    const val = c.key==='_page'
      ? `${state.currentPage+1} / ${state.pages.length}`
      : (fr[c.key]||'');
    if (c.key==='chghist' && val) {
      // 折り返し描画
      const maxW = cw - 6/state.zoom;
      const lineH = 12/state.zoom;
      let line='', lines=[], y0=cy+ch*0.45;
      for (const ch2 of val) {
        if (ch2==='\n') { lines.push(line); line=''; continue; }
        if (ctx.measureText(line+ch2).width > maxW) { lines.push(line); line=ch2; }
        else line+=ch2;
      }
      if (line) lines.push(line);
      const totalH = lines.length * lineH;
      let ly = cy + (ch - totalH) / 2 + lineH * 0.8;
      lines.forEach(l => { ctx.fillText(l, cx+3/state.zoom, ly); ly+=lineH; });
    } else {
      ctx.fillText(val, cx+3/state.zoom, cy+ch-5/state.zoom);
    }
  });


  ctx.restore();
}
