// ================================================================
// symbols.js — シンボル描画
// ctx は draw.js で定義されたグローバル変数を使用
// state.zoom / state.customSymbols を参照
// ================================================================

function drawSym(type, x, y, isSel, rot, fH, fV, lc) {
  const zoom = state.zoom;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  if (fH) ctx.scale(-1, 1);
  if (fV) ctx.scale(1, -1);

  const c = isSel ? '#0067c0' : (lc || fgC());
  ctx.strokeStyle = c; ctx.fillStyle = c;
  const lw = (isSel ? 2 : 1.5) / zoom;
  ctx.lineWidth = lw;
  const ln = w => { ctx.lineWidth = w / zoom; };

  // カスタムシンボル
  const cS = state.customSymbols.find(s => s.type === type);
  if (cS) {
    if (cS.shapes && cS.shapes.length) {
      cS.shapes.forEach(s => {
        if (s.t==='L') { ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke(); }
        else if (s.t==='C') { ctx.beginPath(); ctx.arc(s.cx,s.cy,s.r,0,Math.PI*2); ctx.stroke(); }
        else if (s.t==='R') { ctx.strokeRect(s.x,s.y,s.w,s.h); }
        else if (s.t==='T') { ctx.font=`${(s.fs||14)/zoom}px sans-serif`; ctx.textAlign='center'; ctx.fillText(s.text,s.x,s.y); }
      });
    } else {
      // フォールバック: 矩形+ラベル
      ctx.strokeRect(-cS.w/2,-cS.h/2,cS.w,cS.h);
      ctx.font=`bold ${11/zoom}px sans-serif`; ctx.textAlign='center';
      ctx.fillText(cS.label||type, 0, 4/zoom);
    }
    if (isSel) {
      ctx.strokeStyle='#0067c0'; ctx.lineWidth=1/zoom;
      ctx.setLineDash([4/zoom,3/zoom]);
      ctx.strokeRect(-cS.w/2-8,-cS.h/2-8,cS.w+16,cS.h+16);
      ctx.setLineDash([]);
    }
    ctx.restore(); return;
  }

  // ---- 標準シンボル ----
  if (type==='battery') {
    ctx.beginPath(); ctx.moveTo(-36,0); ctx.lineTo(-14,0); ctx.stroke();
    [[-14,2.5],[-7,1.2],[0,2.5],[7,1.2],[14,2.5]].forEach(([px,w]) => { ln(w); ctx.beginPath(); ctx.moveTo(px,w>1.5?-9:-6); ctx.lineTo(px,w>1.5?9:6); ctx.stroke(); });
    ln(1.5); ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(36,0); ctx.stroke();

  } else if (type==='ac') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,19,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14,0); ctx.quadraticCurveTo(-7,-13,0,0); ctx.quadraticCurveTo(7,13,14,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(19,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='ground') {
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(0,0); ctx.stroke();
    [[18,0,2],[13,5,1.5],[8,10,1.5]].forEach(([w2,dy,w]) => { ln(w); ctx.beginPath(); ctx.moveTo(-w2,dy); ctx.lineTo(w2,dy); ctx.stroke(); });

  } else if (type==='resistor') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-18,0); ctx.stroke();
    ctx.strokeRect(-18,-8,36,16);
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='capacitor') {
    ctx.beginPath(); ctx.moveTo(-27,0); ctx.lineTo(-6,0); ctx.stroke();
    ln(2.5); ctx.beginPath(); ctx.moveTo(-6,-12); ctx.lineTo(-6,12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6,-12); ctx.lineTo(6,12); ctx.stroke();
    ln(1.5); ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(27,0); ctx.stroke();

  } else if (type==='inductor') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-22,0); ctx.stroke();
    ctx.beginPath(); for (let i=0;i<4;i++) ctx.arc(-16+i*10,0,8,Math.PI,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='diode') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-12,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12,-10); ctx.lineTo(-12,10); ctx.lineTo(12,0); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12,-10); ctx.lineTo(12,10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='sw_no' || type==='push_no') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-14,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(-14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(14,-9); ctx.stroke();
    ctx.beginPath(); ctx.arc(14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(32,0); ctx.stroke();
    if (type==='push_no') {
      ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(0,-9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6,-14); ctx.lineTo(6,-14); ctx.stroke();
    }

  } else if (type==='sw_nc') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-14,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(-14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(14,5); ctx.stroke();
    ctx.beginPath(); ctx.arc(14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(0,-2); ctx.stroke();

  } else if (type==='coil' || type==='timer_coil') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.strokeRect(-20,-14,40,28);
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.font=`${9/zoom}px sans-serif`; ctx.textAlign='center';
    ctx.fillText(type==='coil'?'CR':'TIM', 0, type==='timer_coil'?0:4/zoom);
    if (type==='timer_coil') { ctx.beginPath(); ctx.arc(0,10,4,0,Math.PI*2); ctx.stroke(); }

  } else if (type==='breaker') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.strokeRect(-20,-14,40,28);
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.font=`${9/zoom}px sans-serif`; ctx.textAlign='center'; ctx.fillText('CB',0,4/zoom);

  } else if (type==='motor') {
    ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.font=`bold ${14/zoom}px sans-serif`; ctx.textAlign='center'; ctx.fillText('M',0,5/zoom);

  } else if (type==='lamp') {
    ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11,-9); ctx.lineTo(11,9); ctx.moveTo(11,-9); ctx.lineTo(-11,9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-18,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='fuse') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-18,0); ctx.stroke();
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-18,-7,36,14,7); else ctx.rect(-18,-7,36,14); ctx.stroke();
    ctx.setLineDash([3/zoom,3/zoom]); ctx.beginPath(); ctx.moveTo(-18,0); ctx.lineTo(18,0); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='transformer') {
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-22,0); ctx.stroke();
    ctx.beginPath(); for (let i=0;i<3;i++) ctx.arc(-16+i*8,0,7,Math.PI,0); ctx.stroke();
    ctx.setLineDash([3/zoom,3/zoom]); ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(0,16); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); for (let i=0;i<3;i++) ctx.arc(2+i*8,0,7,0,Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='terminal') {
    ctx.beginPath(); ctx.moveTo(-20,0); ctx.lineTo(20,0); ctx.stroke();
    ctx.strokeRect(-10,-8,20,16);
    ctx.beginPath(); ctx.moveTo(-4,-4); ctx.lineTo(4,4); ctx.moveTo(4,-4); ctx.lineTo(-4,4); ctx.stroke();
  }

  if (isSel) {
    const d = getDef(type) || { w:64, h:34 };
    ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1/zoom;
    ctx.setLineDash([4/zoom, 3/zoom]);
    ctx.strokeRect(-d.w/2-8, -d.h/2-8, d.w+16, d.h+16);
    ctx.setLineDash([]);
  }
  ctx.restore();
}
