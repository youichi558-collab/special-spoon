// ================================================================
// draw.js — 描画専用。state を読むだけで状態変更は行わない。
// 描画順: 背景 → グリッド → 図面枠 → 配線 → 要素 → プレビュー → UI
// ================================================================

let cv  = document.getElementById('cv');
let ctx = cv.getContext('2d');
const cwEl = document.getElementById('cw');

function fgC() { return state.darkMode ? '#ccc' : '#222'; }

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);

  // 背景（PDF出力時は白・グリッドなし）
  if (state.pdfMode) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = state.darkMode ? '#252525' : '#d4d4cc';
  }
  ctx.fillRect(0, 0, cv.width, cv.height);

  if (!state.pdfMode) drawGrid();

  ctx.save();
  ctx.translate(state.pan.x, state.pan.y);
  ctx.scale(state.pdfZoom || state.zoom, state.pdfZoom || state.zoom);

  // 図面枠
  if (state.frameObj) drawFrame(state.frameObj);

  // 配線
  drawWires();

  // 配線プレビュー
  drawWirePreview();

  // 要素
  drawElements();

  // プレビュー（仮描画）
  drawPreview();

  // スナップマーカー
  drawSnapMarker();

  // ラバーバンド選択ボックス
  ctx.restore();
  drawSelBox();

  // ステータス更新
  document.getElementById('s-zoom').textContent = Math.round(state.zoom * 100) + '%';
  document.getElementById('s-cnt').textContent  = state.elements.length + state.wires.length;
  document.getElementById('s-sel').textContent  = state.sel.els.size + state.sel.wires.size;
  document.getElementById('s-pos').textContent  = `${Math.round(state.mouse.wx)}, ${Math.round(state.mouse.wy)}`;
  const al = LAYERS.find(l => l.active);
  document.getElementById('s-lay').textContent  = al ? al.name : '';
}

// ----------------------------------------------------------------
// グリッド
// ----------------------------------------------------------------
function drawGrid() {
  const { zoom, pan, G, darkMode } = state;
  ctx.save();
  ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.5;
  const startX = Math.floor(-pan.x / zoom / G) * G;
  const endX   = Math.ceil((cv.width  - pan.x) / zoom / G) * G;
  const startY = Math.floor(-pan.y / zoom / G) * G;
  const endY   = Math.ceil((cv.height - pan.y) / zoom / G) * G;
  for (let x = startX; x <= endX; x += G) {
    const cx2 = x * zoom + pan.x;
    ctx.beginPath(); ctx.moveTo(cx2, 0); ctx.lineTo(cx2, cv.height); ctx.stroke();
  }
  for (let y = startY; y <= endY; y += G) {
    const cy2 = y * zoom + pan.y;
    ctx.beginPath(); ctx.moveTo(0, cy2); ctx.lineTo(cv.width, cy2); ctx.stroke();
  }
  ctx.restore();
}

// ----------------------------------------------------------------
// 配線
// ----------------------------------------------------------------
function drawWires() {
  state.wires.forEach(w => {
    const lay = LAYERS.find(l => l.name === w.layer);
    if (lay && !lay.visible) return;
    const sel   = state.sel.wires.has(w.id);
    const color = sel ? '#0067c0' : (w.color || (lay ? lay.color : '#0F6E56'));
    const lw    = w.lineWidth || 2;
    const pts   = w.pts || [{ x:w.x1, y:w.y1 }, { x:w.x2, y:w.y2 }];

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = (sel ? lw+0.5 : lw) / state.zoom;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    applyLineStyle(ctx, w.lineStyle, state.zoom);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke(); ctx.setLineDash([]);

    // 線端
    if (w.arrowStart && w.arrowStart !== 'none') {
      const p0=pts[0], p1=pts[1]||pts[0];
      const dx=p0.x-p1.x, dy=p0.y-p1.y, len=Math.hypot(dx,dy);
      if (len>0.1) drawLineEnd(ctx, p0.x, p0.y, dx/len, dy/len, w.arrowStart, 10, color, state.zoom);
    }
    if (w.arrowEnd && w.arrowEnd !== 'none') {
      const pn=pts[pts.length-1], pn1=pts[pts.length-2]||pn;
      const dx=pn.x-pn1.x, dy=pn.y-pn1.y, len=Math.hypot(dx,dy);
      if (len>0.1) drawLineEnd(ctx, pn.x, pn.y, dx/len, dy/len, w.arrowEnd, 10, color, state.zoom);
    }

    // 線番
    if (w.wireNo) {
      const mp  = pts[Math.floor(pts.length/2)];
      const fs  = 10;
      ctx.font  = `bold ${fs}px sans-serif`; ctx.textAlign = 'center';
      const tw2 = ctx.measureText(w.wireNo).width;
      ctx.fillStyle = state.darkMode ? '#252525' : '#fff';
      ctx.fillRect(mp.x-tw2/2-1, mp.y-fs-1, tw2+2, fs+2);
      ctx.fillStyle = sel ? '#0067c0' : '#1e40af';
      ctx.fillText(w.wireNo, mp.x, mp.y-1);
    }
    ctx.restore();
  });
}

// ----------------------------------------------------------------
// 配線プレビュー
// ----------------------------------------------------------------
function drawWirePreview() {
  const prev = state.preview;
  if (!prev || prev.type !== 'wire_preview') return;
  const pts = prev.pts;
  if (!pts || pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = '#0F6E56';
  ctx.lineWidth   = 2/state.zoom;
  ctx.lineCap = 'round'; ctx.setLineDash([6/state.zoom, 4/state.zoom]);
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.stroke(); ctx.setLineDash([]);

  // 始点マーカー
  if (state.wirePoints.length > 0) {
    const p0 = state.wirePoints[0];
    ctx.beginPath(); ctx.arc(p0.x, p0.y, 4/state.zoom, 0, Math.PI*2);
    ctx.fillStyle = '#0F6E56'; ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------------------------------
// 要素
// ----------------------------------------------------------------
function drawElements() {
  state.elements.forEach(el => {
    const lay = LAYERS.find(l => l.name === el.layer);
    if (lay && !lay.visible) return;
    // 枠レイヤーの要素はdrawFrame()が描画するのでスキップ
    if (state.frameObj && el.layer && (el.layer==='図面枠'||el.layer.toLowerCase().includes('frame')||el.layer.toLowerCase().includes('border')||el.layer==='defpoints')) return;
    const sel = state.sel.els.has(el.id);
    const lc  = lay ? lay.color : fgC();

    if (el.type === 'text') {
      drawTextEl(el, sel, lc);
    } else if (el.type === 'rect') {
      drawRectEl(el, sel, lc);
    } else if (el.type === 'circle') {
      drawCircleEl(el, sel, lc);
    } else if (el.type === 'fline') {
      drawFlineEl(el, sel, lc);
    } else if (el.type === 'dim') {
      drawDimEl(el, sel);
    } else if (el.type === 'leader') {
      drawLeaderEl(el, sel);
    } else {
      drawSymEl(el, sel, lc);
    }
  });
}

function drawTextEl(el, sel, lc) {
  ctx.save();
  ctx.fillStyle = sel ? '#0067c0' : (el.color || lc);
  ctx.font      = `${el.fs||14}px sans-serif`;
  ctx.fillText(el.text, el.x, el.y);
  if (sel) {
    const m = ctx.measureText(el.text);
    ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1/state.zoom;
    ctx.setLineDash([4/state.zoom, 3/state.zoom]);
    ctx.strokeRect(el.x-3, el.y-14, m.width+6, 18);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawRectEl(el, sel, lc) {
  ctx.save();
  const c  = sel ? '#0067c0' : (el.color || lc);
  const lw = el.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+0.5 : lw)/state.zoom;
  applyLineStyle(ctx, el.lineStyle, state.zoom);
  if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.fillRect(el.x, el.y, el.w, el.h); }
  ctx.strokeRect(el.x, el.y, el.w, el.h); ctx.setLineDash([]);
  if (sel) {
    ctx.strokeStyle='#0067c0'; ctx.lineWidth=1/state.zoom;
    ctx.setLineDash([4/state.zoom,3/state.zoom]);
    ctx.strokeRect(el.x-5, el.y-5, el.w+10, el.h+10); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawCircleEl(el, sel, lc) {
  ctx.save();
  const c  = sel ? '#0067c0' : (el.color || lc);
  const lw = el.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+0.5 : lw)/state.zoom;
  applyLineStyle(ctx, el.lineStyle, state.zoom);
  if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI*2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

function drawFlineEl(el, sel, lc) {
  ctx.save();
  const c  = sel ? '#0067c0' : (el.color || lc);
  const lw = el.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+0.5 : lw)/state.zoom; ctx.lineCap = 'round';
  applyLineStyle(ctx, el.lineStyle, state.zoom);
  ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke(); ctx.setLineDash([]);
  if (el.arrowStart && el.arrowStart !== 'none') { const dx=el.x1-el.x2,dy=el.y1-el.y2,len=Math.hypot(dx,dy); if(len>0.1) drawLineEnd(ctx,el.x1,el.y1,dx/len,dy/len,el.arrowStart,10,c,state.zoom); }
  if (el.arrowEnd   && el.arrowEnd   !== 'none') { const dx=el.x2-el.x1,dy=el.y2-el.y1,len=Math.hypot(dx,dy); if(len>0.1) drawLineEnd(ctx,el.x2,el.y2,dx/len,dy/len,el.arrowEnd,  10,c,state.zoom); }
  ctx.restore();
}

function drawSymEl(el, sel, lc) {
  const sc = el.scale || 1;
  if (sc !== 1) {
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.scale(sc, sc);
    drawSym(el.type, 0, 0, sel, el.rot||0, el.flipH, el.flipV, el.color||lc);
    ctx.restore();
  } else {
    drawSym(el.type, el.x, el.y, sel, el.rot||0, el.flipH, el.flipV, el.color||lc);
  }
  if (el.label) {
    const d   = getDef(el.type) || { w:64, h:34 };
    const lox = el.labelOffX || 0;
    const loy = el.labelOffY || (d.h/2+15);
    const rot = (el.rot||0) * Math.PI/180;
    const lx  = el.x + lox*Math.cos(rot) - loy*Math.sin(rot);
    const ly  = el.y + lox*Math.sin(rot) + loy*Math.cos(rot);
    ctx.save();
    ctx.fillStyle = state.darkMode ? '#aaa' : '#555';
    ctx.font = `${11}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(el.label, lx, ly);
    ctx.restore();
  }
  if (el.refLabel) {
    const d = getDef(el.type) || { h:34 };
    ctx.save(); ctx.fillStyle = '#744da9';
    ctx.font = `${9}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('→'+el.refLabel, el.x, el.y-d.h/2-5);
    ctx.restore();
  }
}

// ----------------------------------------------------------------
// プレビュー（仮描画）
// ----------------------------------------------------------------
function drawPreview() {
  const prev = state.preview;
  if (!prev) return;

  ctx.save();
  ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1.5/state.zoom; ctx.setLineDash([5/state.zoom, 3/state.zoom]);

  if (prev.type === 'shape_preview') {
    const { shapeMode, p1, p2 } = prev;
    if (shapeMode === 'rect') {
      ctx.strokeRect(Math.min(p1.x,p2.x), Math.min(p1.y,p2.y), Math.abs(p2.x-p1.x), Math.abs(p2.y-p1.y));
    } else if (shapeMode === 'circle') {
      ctx.beginPath(); ctx.arc(p1.x, p1.y, Math.hypot(p2.x-p1.x, p2.y-p1.y), 0, Math.PI*2); ctx.stroke();
    } else if (shapeMode === 'fline') {
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  } else if (prev.type === 'sym_preview') {
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.5;
    drawSym(prev.symType, prev.x, prev.y, false, 0, false, false, fgC());
    ctx.globalAlpha = 1;
  } else if (prev.type === 'dim_prev1' || prev.type === 'dim_prev2' ||
             prev.type === 'leader_prev1' || prev.type === 'leader_prev2' ||
             prev.type === 'chain_prev') {
    ctx.setLineDash([]);
    drawDimPreview(prev);
  }

  ctx.setLineDash([]); ctx.restore();
}

// ----------------------------------------------------------------
// スナップマーカー
// ----------------------------------------------------------------
function drawSnapMarker() {
  const sp = state.snapPreview;
  if (!sp) return;
  const stype = sp.snapType || 'grid';
  ctx.save();
  if (stype === 'endpoint') {
    const s = 6/state.zoom;
    ctx.strokeStyle = '#00cc44'; ctx.lineWidth = 2/state.zoom; ctx.fillStyle = 'rgba(0,204,68,0.15)';
    ctx.fillRect(sp.x-s, sp.y-s, s*2, s*2); ctx.strokeRect(sp.x-s, sp.y-s, s*2, s*2);
  } else if (stype === 'midpoint') {
    const s = 6/state.zoom;
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2/state.zoom; ctx.fillStyle = 'rgba(245,158,11,0.15)';
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y-s); ctx.lineTo(sp.x+s, sp.y); ctx.lineTo(sp.x, sp.y+s); ctx.lineTo(sp.x-s, sp.y); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else {
    // グリッドスナップ：クロスヘアカーソル
    const s = 8/state.zoom;
    const g = 3/state.zoom;
    ctx.strokeStyle = state.darkMode ? 'rgba(150,180,255,0.8)' : 'rgba(0,80,180,0.7)';
    ctx.lineWidth = 1/state.zoom;
    // 縦線（中央に隙間）
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y-s); ctx.lineTo(sp.x, sp.y-g); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y+g); ctx.lineTo(sp.x, sp.y+s); ctx.stroke();
    // 横線（中央に隙間）
    ctx.beginPath(); ctx.moveTo(sp.x-s, sp.y); ctx.lineTo(sp.x-g, sp.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sp.x+g, sp.y); ctx.lineTo(sp.x+s, sp.y); ctx.stroke();
  }
  ctx.restore();
}

// ----------------------------------------------------------------
// ラバーバンド選択ボックス
// ----------------------------------------------------------------
function drawSelBox() {
  if (!state.mouse.selboxing) return;
  const { startCx, startCy, cx, cy } = state.mouse;
  const x = Math.min(startCx, cx), y = Math.min(startCy, cy);
  const w = Math.abs(cx - startCx), h = Math.abs(cy - startCy);
  ctx.save();
  ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
  ctx.fillStyle = 'rgba(0,103,192,0.05)';
  ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]); ctx.restore();
}

// ----------------------------------------------------------------
// 寸法線・引出線 描画
// ----------------------------------------------------------------
function drawDimEl(el, isSel) {
  if (el.x1==null||el.x2==null) return;
  const dx=el.x2-el.x1, dy=el.y2-el.y1, len=Math.hypot(dx,dy);
  if (len<0.1) return;
  const sign=el.offsetSign||1, off=(el.offset||30)*sign, arr=el.arrowSz||8;
  const ux=dx/len, uy=dy/len, px=-uy*sign, py=ux*sign;
  const ax1=el.x1+px*Math.abs(off), ay1=el.y1+py*Math.abs(off);
  const ax2=el.x2+px*Math.abs(off), ay2=el.y2+py*Math.abs(off);
  const c = isSel ? '#0067c0' : (layColor(el.layer)||'#744da9');
  ctx.save(); ctx.strokeStyle=c; ctx.fillStyle=c; ctx.lineWidth=(isSel?1.5:1)/state.zoom;
  ctx.beginPath(); ctx.moveTo(el.x1,el.y1); ctx.lineTo(ax1,ay1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(el.x2,el.y2); ctx.lineTo(ax2,ay2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ax1,ay1); ctx.lineTo(ax2,ay2); ctx.stroke();
  const a=arr/state.zoom;
  const drawArr=(x,y,dx2,dy2)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx2*a-(-dy2)*a*0.3,y+dy2*a-dx2*a*0.3);ctx.lineTo(x+dx2*a+(-dy2)*a*0.3,y+dy2*a+dx2*a*0.3);ctx.closePath();ctx.fill();};
  drawArr(ax1,ay1,ux,uy); drawArr(ax2,ay2,-ux,-uy);
  const mx=(ax1+ax2)/2, my=(ay1+ay2)/2, fs=11/state.zoom;
  ctx.font=`${fs}px sans-serif`; ctx.textAlign='center';
  const txt=el.dimText||String(Math.round(len)), tw2=ctx.measureText(txt).width;
  ctx.fillStyle=state.darkMode?'#252525':'#fff'; ctx.fillRect(mx-tw2/2-2,my-fs-1,tw2+4,fs+2);
  ctx.fillStyle=c; ctx.fillText(txt,mx,my);
  ctx.restore();
}

function drawLeaderEl(el, isSel) {
  if (el.x1==null) return;
  const c = isSel ? '#0067c0' : (layColor(el.layer)||'#744da9');
  const bx=el.bx??el.x2, by=el.by??el.y2;
  ctx.save(); ctx.strokeStyle=c; ctx.fillStyle=c; ctx.lineWidth=(isSel?1.5:1)/state.zoom;
  ctx.beginPath(); ctx.moveTo(el.x1,el.y1); ctx.lineTo(bx,by);
  if (el.bx!=null) ctx.lineTo(el.x2,el.y2);
  ctx.stroke();
  const dx=bx-el.x1, dy=by-el.y1, len=Math.hypot(dx,dy);
  if (len>0.1) {
    const ux=dx/len, uy=dy/len, a=8/state.zoom;
    ctx.beginPath(); ctx.moveTo(el.x1,el.y1); ctx.lineTo(el.x1+ux*a+uy*a*0.3,el.y1+uy*a-ux*a*0.3); ctx.lineTo(el.x1+ux*a-uy*a*0.3,el.y1+uy*a+ux*a*0.3); ctx.closePath(); ctx.fill();
  }
  if (el.leaderText) {
    const fs=11; ctx.font=`${fs}px sans-serif`; ctx.textAlign='left'; ctx.fillStyle=c;
    ctx.fillText(el.leaderText, bx+4, by-3);
  }
  ctx.restore();
}

function drawDimPreview(ts) {
  ctx.save(); ctx.strokeStyle='#744da9'; ctx.fillStyle='#744da9'; ctx.lineWidth=1/state.zoom; ctx.setLineDash([4/state.zoom,3/state.zoom]);
  if (ts.type==='dim_prev1') {
    ctx.beginPath(); ctx.moveTo(ts.x1,ts.y1); ctx.lineTo(ts.x2,ts.y2); ctx.stroke();
    ctx.setLineDash([]); ctx.font=`${10}px sans-serif`; ctx.textAlign='center';
    ctx.fillText(String(Math.round(Math.hypot(ts.x2-ts.x1,ts.y2-ts.y1))), (ts.x1+ts.x2)/2, (ts.y1+ts.y2)/2-6);
    ctx.beginPath(); ctx.arc(ts.x1,ts.y1,4/state.zoom,0,Math.PI*2); ctx.fill();
  } else if (ts.type==='dim_prev2') {
    ctx.setLineDash([]); drawDimEl({...ts,layer:'',offsetSign:ts.offsetSign||1}, false);
  }
  ctx.setLineDash([]); ctx.restore();
}

// ----------------------------------------------------------------
// ヘルパー
// ----------------------------------------------------------------
function applyLineStyle(ctx, style, zoom) {
  if (style==='dash')    ctx.setLineDash([8/zoom, 4/zoom]);
  else if (style==='dot') ctx.setLineDash([2/zoom, 4/zoom]);
  else if (style==='dashdot') ctx.setLineDash([8/zoom, 3/zoom, 2/zoom, 3/zoom]);
  else ctx.setLineDash([]);
}

function drawLineEnd(ctx, x, y, vx, vy, type, size, color, zoom) {
  if (!type || type==='none') return;
  const a=size/zoom, px=-vy, py=vx;
  ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=1/zoom; ctx.setLineDash([]);
  if (type==='arrow') {
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-vx*a+px*a*0.35,y-vy*a+py*a*0.35); ctx.lineTo(x-vx*a-px*a*0.35,y-vy*a-py*a*0.35); ctx.closePath(); ctx.fill();
  } else if (type==='arrow_open') {
    ctx.beginPath(); ctx.moveTo(x-vx*a+px*a*0.4,y-vy*a+py*a*0.4); ctx.lineTo(x,y); ctx.lineTo(x-vx*a-px*a*0.4,y-vy*a-py*a*0.4); ctx.stroke();
  } else if (type==='circle') {
    ctx.beginPath(); ctx.arc(x-vx*a*0.5,y-vy*a*0.5,a*0.5,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.stroke();
  } else if (type==='dot') {
    ctx.beginPath(); ctx.arc(x-vx*a*0.5,y-vy*a*0.5,a*0.5,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
