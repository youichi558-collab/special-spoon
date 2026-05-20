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
  if (!state.pdfMode) drawGuides();
  ctx.restore();
  drawSelBox();

  // リサイズハンドル（canvas上に描画）
  if (typeof drawResizeHandlesOnCanvas === 'function') drawResizeHandlesOnCanvas();

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
    const lw    = w.lineWidth || lay?.lineWidth || 1.5;
    const pts   = w.pts || [{ x:w.x1, y:w.y1 }, { x:w.x2, y:w.y2 }];

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = (sel ? lw+0.5 : lw);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    applyLineStyle(ctx, w.lineStyle || lay?.lineDash, state.zoom);
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
    if (w.wireNo && !state.pdfSkipText) {
      const n = pts.length;
      const i = Math.floor((n-1)/2), j = Math.ceil((n-1)/2);
      const mp = n >= 2 ? { x:(pts[i].x+pts[j].x)/2, y:(pts[i].y+pts[j].y)/2 } : pts[0];
      const fs  = 10;
      const off = fs + 6;   // ワイヤーから離す距離
      ctx.font  = `bold ${fs}px sans-serif`; ctx.textAlign = 'center';
      const tw2 = ctx.measureText(w.wireNo).width;
      ctx.fillStyle = state.darkMode ? '#252525' : '#fff';
      ctx.fillRect(mp.x-tw2/2-2, mp.y-off-fs, tw2+4, fs+3);
      ctx.fillStyle = sel ? '#0067c0' : '#1e40af';
      ctx.fillText(w.wireNo, mp.x, mp.y-off);
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
  ctx.lineWidth   = 2;
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
      if (!state.pdfSkipText) drawTextEl(el, sel, lc, lay);
    } else if (el.type === 'rect') {
      drawRectEl(el, sel, lc, lay);
    } else if (el.type === 'circle') {
      drawCircleEl(el, sel, lc, lay);
    } else if (el.type === 'fline') {
      drawFlineEl(el, sel, lc, lay);
    } else if (el.type === 'triangle') {
      drawTriEl(el, sel, lc, lay);
    } else if (el.type === 'arc') {
      drawArcEl(el, sel, lc, lay);
    } else if (el.type === 'junction') {
      drawJunctionEl(el, sel, lc);
    } else if (el.type === 'dim') {
      drawDimEl(el, sel);
    } else if (el.type === 'angle_dim') {
      drawAngleDimEl(el, sel);
    } else if (el.type === 'leader') {
      drawLeaderEl(el, sel);
    } else {
      drawSymEl(el, sel, lc);
    }
  });
}

function drawTextEl(el, sel, lc, lay) {
  ctx.save();
  ctx.fillStyle = el.color || lc;
  const fs = el.fs || lay?.fontSize || 14;
  ctx.font = `${fs}px sans-serif`;
  const lines = (el.text || '').split('\n');
  const lineH = fs * 1.4;
  lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lineH));
  if (sel) {
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const totalH = lines.length * lineH;
    ctx.strokeStyle = el.color || lc; ctx.lineWidth = 1.5/state.zoom;
    ctx.setLineDash([4/state.zoom, 3/state.zoom]);
    ctx.strokeRect(el.x-3, el.y-fs*0.8, maxW+6, totalH+4);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawRectEl(el, sel, lc, lay) {
  ctx.save();
  const c  = el.color || lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+1 : lw);
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.fillRect(el.x, el.y, el.w, el.h); }
  ctx.strokeRect(el.x, el.y, el.w, el.h); ctx.setLineDash([]);
  if (sel) {
    ctx.strokeStyle=c; ctx.lineWidth=1;
    ctx.setLineDash([4/state.zoom,3/state.zoom]);
    ctx.strokeRect(el.x-5, el.y-5, el.w+10, el.h+10); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawCircleEl(el, sel, lc, lay) {
  ctx.save();
  const c  = el.color || lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+1 : lw);
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI*2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

function drawTriEl(el, sel, lc, lay) {
  ctx.save();
  const c = el.color || lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = sel ? lw+1 : lw;
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  ctx.beginPath();
  ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2);
  ctx.lineTo(el.x3, el.y3); ctx.closePath();
  if (el.fillColor) {
    const m = el.fillColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) { ctx.fillStyle = el.fillColor; ctx.fill(); }
  }
  ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}

function drawArcEl(el, sel, lc, lay) {
  ctx.save();
  const c  = el.color || lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+1 : lw);
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  ctx.beginPath(); ctx.arc(el.x, el.y, el.r, el.startA, el.endA, el.ccw || false); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawJunctionEl(el, sel, lc) {
  ctx.save();
  const c = el.color || lc;
  const r = (el.r || 4) / state.zoom * state.zoom;  // 固定4px相当
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(el.x, el.y, el.r || 4, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawFlineEl(el, sel, lc, lay) {
  ctx.save();
  const c  = el.color || lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.5;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+1 : lw); ctx.lineCap = 'round';
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
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
    drawSym(el.type, 0, 0, sel, el.rot||0, el.flipH, el.flipV, el.color||lc, el.lineStyle);
    ctx.restore();
  } else {
    drawSym(el.type, el.x, el.y, sel, el.rot||0, el.flipH, el.flipV, el.color||lc, el.lineStyle);
  }
  if (el.label && !state.pdfSkipText) {
    const d   = getDef(el.type) || { w:64, h:34 };
    const sc  = el.scale || 1;
    const lox = el.labelOffX || 0;
    const loy = el.labelOffY || (d.h*sc/2 + 15*sc);
    const rot = (el.rot||0) * Math.PI/180;
    const lx  = el.x + lox*Math.cos(rot) - loy*Math.sin(rot);
    const ly  = el.y + lox*Math.sin(rot) + loy*Math.cos(rot);
    const fs  = Math.round((el.labelFs||11) * sc);
    ctx.save();
    ctx.fillStyle = el.labelColor || (state.darkMode ? '#aaa' : '#555');
    ctx.font = `${fs}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(el.label, lx, ly);
    ctx.restore();
  }
  if (el.refLabel) {
    const d  = getDef(el.type) || { h:34 };
    const sc = el.scale || 1;
    ctx.save(); ctx.fillStyle = '#744da9';
    ctx.font = `${9}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('→'+el.refLabel, el.x, el.y-d.h*sc/2-5);
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
  } else if (prev.type === 'tri_preview') {
    ctx.beginPath(); ctx.moveTo(prev.p1.x, prev.p1.y); ctx.lineTo(prev.p2.x, prev.p2.y);
    if (prev.p3) { ctx.lineTo(prev.p3.x, prev.p3.y); ctx.closePath(); }
    ctx.stroke();
  } else if (prev.type === 'arc_preview') {
    ctx.beginPath(); ctx.arc(prev.x, prev.y, prev.r, prev.startA, prev.endA, prev.ccw || false); ctx.stroke();
  } else if (prev.type === 'angle_dim_prev1') {
    ctx.beginPath(); ctx.moveTo(prev.cx, prev.cy); ctx.lineTo(prev.x1, prev.y1); ctx.stroke();
  } else if (prev.type === 'angle_dim_prev2') {
    ctx.beginPath(); ctx.moveTo(prev.cx, prev.cy); ctx.lineTo(prev.x1, prev.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(prev.cx, prev.cy); ctx.lineTo(prev.x2, prev.y2); ctx.stroke();
  } else if (prev.type === 'arc_preview_line') {
    ctx.beginPath(); ctx.moveTo(prev.x1, prev.y1); ctx.lineTo(prev.x2, prev.y2); ctx.stroke();
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
  const crossing = cx < startCx; // 右→左 = 交差選択
  const x = Math.min(startCx, cx), y = Math.min(startCy, cy);
  const w = Math.abs(cx - startCx), h = Math.abs(cy - startCy);
  ctx.save();
  if (crossing) {
    ctx.strokeStyle = '#22aa44'; ctx.lineWidth = 1; ctx.setLineDash([4,3]);
    ctx.fillStyle = 'rgba(34,170,68,0.05)';
  } else {
    ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,103,192,0.05)';
  }
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
  const absOff=Math.abs(off);
  const gap=el.gap!=null?el.gap:state.G;    // 測定点からの隙間（デフォルト1グリッド）
  const ext=el.ext!=null?el.ext:state.G;    // 寸法線を超える伸び（デフォルト1グリッド）
  // 引出し線の始点(gap)・終点(absOff+ext)
  const ex1sx=el.x1+px*gap,    ex1sy=el.y1+py*gap;
  const ex1ex=el.x1+px*(absOff+ext), ex1ey=el.y1+py*(absOff+ext);
  const ex2sx=el.x2+px*gap,    ex2sy=el.y2+py*gap;
  const ex2ex=el.x2+px*(absOff+ext), ex2ey=el.y2+py*(absOff+ext);
  // 寸法線の端点
  const ax1=el.x1+px*absOff, ay1=el.y1+py*absOff;
  const ax2=el.x2+px*absOff, ay2=el.y2+py*absOff;
  const c = isSel ? '#0067c0' : (el.color||layColor(el.layer)||'#744da9');
  const lw = el.lineWidth || 1;
  ctx.save(); ctx.strokeStyle=c; ctx.fillStyle=c; ctx.lineWidth=(isSel?lw+0.5:lw);
  applyLineStyle(ctx, el.lineStyle, state.zoom);
  // 引出し線（gap空けて伸びる）
  ctx.beginPath(); ctx.moveTo(ex1sx,ex1sy); ctx.lineTo(ex1ex,ex1ey); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ex2sx,ex2sy); ctx.lineTo(ex2ex,ex2ey); ctx.stroke();
  // 寸法線
  ctx.beginPath(); ctx.moveTo(ax1,ay1); ctx.lineTo(ax2,ay2); ctx.stroke();
  ctx.setLineDash([]);
  const a = arr;  // ズーム追従
  const aStyle = el.arrowStyle || 'filled';
  const dimLen = Math.hypot(ax2-ax1, ay2-ay1);
  const flip = dimLen < a * 2.5;  // 短い場合は外向きに反転
  // drawArr: tip=(x,y)、outX/outY方向にbaseがある（矢印がout方向を向く）
  const drawArr=(x,y,outX,outY)=>{
    if (aStyle==='none') return;
    const nx=-outY, ny=outX;
    if (aStyle==='filled') {
      ctx.beginPath();ctx.moveTo(x,y);
      ctx.lineTo(x+outX*a+nx*a*0.3, y+outY*a+ny*a*0.3);
      ctx.lineTo(x+outX*a-nx*a*0.3, y+outY*a-ny*a*0.3);
      ctx.closePath();ctx.fill();
    } else if (aStyle==='open') {
      ctx.beginPath();
      ctx.moveTo(x+outX*a+nx*a*0.3, y+outY*a+ny*a*0.3);
      ctx.lineTo(x,y);
      ctx.lineTo(x+outX*a-nx*a*0.3, y+outY*a-ny*a*0.3);
      ctx.stroke();
    } else if (aStyle==='tick') {
      ctx.beginPath();ctx.moveTo(x-nx*a*0.5,y-ny*a*0.5);ctx.lineTo(x+nx*a*0.5,y+ny*a*0.5);ctx.stroke();
    } else if (aStyle==='dot') {
      ctx.beginPath();ctx.arc(x,y,a*0.4,0,Math.PI*2);ctx.fill();
    }
  };
  // 通常：内向き（ax1はax2方向、ax2はax1方向）
  // 短い：外向き（ax1はax1方向、ax2はax2方向）
  if (flip) {
    drawArr(ax1, ay1, -ux, -uy);
    drawArr(ax2, ay2,  ux,  uy);
  } else {
    drawArr(ax1, ay1,  ux,  uy);
    drawArr(ax2, ay2, -ux, -uy);
  }
  const cx0=(ax1+ax2)/2, cy0=(ay1+ay2)/2;
  const fs = el.dimFs || 11;
  const txt = el.dimText || String(Math.round(len));
  const tx2 = cx0 + (el.dimTx||0)/state.zoom + px*(fs+4);
  const ty2 = cy0 + (el.dimTy||0)/state.zoom + py*(fs+4);
  ctx.font=`bold ${fs}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  const tw2=ctx.measureText(txt).width;
  ctx.fillStyle=state.darkMode?'#252525':'#fff';
  ctx.fillRect(tx2-tw2/2-3, ty2-fs*0.6, tw2+6, fs+4);
  ctx.fillStyle=c; ctx.fillText(txt, tx2, ty2);
  ctx.textBaseline='alphabetic';
  ctx.restore();
}

function drawAngleDimEl(el, isSel) {
  if (el.cx==null||el.x1==null||el.x2==null) return;
  const a1 = Math.atan2(el.y1-el.cy, el.x1-el.cx);
  const a2 = Math.atan2(el.y2-el.cy, el.x2-el.cx);
  const r = el.r || 30;
  const c = isSel ? '#0067c0' : (el.color||layColor(el.layer)||'#744da9');
  const lw = el.lineWidth || 1;
  ctx.save(); ctx.strokeStyle=c; ctx.fillStyle=c;
  ctx.lineWidth = (isSel ? lw+0.5 : lw);
  // 引出し線
  ctx.beginPath(); ctx.moveTo(el.cx, el.cy); ctx.lineTo(el.cx+(el.x1-el.cx)/Math.hypot(el.x1-el.cx,el.y1-el.cy)*(r+10), el.cy+(el.y1-el.cy)/Math.hypot(el.x1-el.cx,el.y1-el.cy)*(r+10)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(el.cx, el.cy); ctx.lineTo(el.cx+(el.x2-el.cx)/Math.hypot(el.x2-el.cx,el.y2-el.cy)*(r+10), el.cy+(el.y2-el.cy)/Math.hypot(el.x2-el.cx,el.y2-el.cy)*(r+10)); ctx.stroke();
  // 弧
  let ccw = false;
  let da = a2 - a1;
  if (da < 0) da += Math.PI*2;
  if (da > Math.PI) { ccw = true; }
  ctx.beginPath(); ctx.arc(el.cx, el.cy, r, a1, a2, ccw); ctx.stroke();
  // テキスト
  const aMid = a1 + (ccw ? -(Math.PI*2-da)/2 : da/2);
  const tx = el.cx + Math.cos(aMid)*(r+14) + (el.dimTx||0);
  const ty = el.cy + Math.sin(aMid)*(r+14) + (el.dimTy||0);
  const fs = el.dimFs || 11;
  ctx.font=`bold ${fs}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  const txt = el.dimText || '';
  const tw = ctx.measureText(txt).width;
  ctx.fillStyle=state.darkMode?'#252525':'#fff';
  ctx.fillRect(tx-tw/2-2, ty-fs*0.6, tw+4, fs+4);
  ctx.fillStyle=c; ctx.fillText(txt, tx, ty);
  ctx.restore();
}

function drawLeaderEl(el, isSel) {
  if (el.x1==null) return;
  const c = isSel ? '#0067c0' : (layColor(el.layer)||'#744da9');
  const bx=el.bx??el.x2, by=el.by??el.y2;
  ctx.save(); ctx.strokeStyle=c; ctx.fillStyle=c; ctx.lineWidth=(isSel?1.5:1);
  const dx=bx-el.x1, dy=by-el.y1, len=Math.hypot(dx,dy);
  if (len>0.1) {
    const ux=dx/len, uy=dy/len, a=8;  // ズーム追従
    const gap = state.G;  // 1グリッド分の隙間
    // 矢印（先端はx1,y1）
    ctx.beginPath(); ctx.moveTo(el.x1,el.y1); ctx.lineTo(el.x1+ux*a+uy*a*0.3,el.y1+uy*a-ux*a*0.3); ctx.lineTo(el.x1+ux*a-uy*a*0.3,el.y1+uy*a+ux*a*0.3); ctx.closePath(); ctx.fill();
    // 線：gap分空けてから開始
    ctx.beginPath(); ctx.moveTo(el.x1+ux*gap, el.y1+uy*gap); ctx.lineTo(bx,by);
    if (el.bx!=null) ctx.lineTo(el.x2,el.y2);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(el.x1,el.y1); ctx.lineTo(bx,by);
    if (el.bx!=null) ctx.lineTo(el.x2,el.y2);
    ctx.stroke();
  }
  if (el.leaderText) {
    const tx = el.x2 + (el.leaderTx||0);
    const ty = el.y2 + (el.leaderTy||0);
    const fs = el.leaderFs||11;  // ズーム追従
    ctx.font=`${fs}px sans-serif`; ctx.textAlign='left';
    const tw2 = ctx.measureText(el.leaderText).width;
    ctx.fillStyle=state.darkMode?'#252525':'#fff';
    ctx.fillRect(tx+4, ty-fs-2, tw2+4, fs+4);
    ctx.fillStyle=c;
    ctx.fillText(el.leaderText, tx+6, ty-2);
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
  if (style==='dash'||style==='dashed')        ctx.setLineDash([8, 4]);
  else if (style==='dot'||style==='dotted')    ctx.setLineDash([2, 4]);
  else if (style==='dashdot')                  ctx.setLineDash([8, 3, 2, 3]);
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

function drawGuides() {
  const guides = state.guides;
  if (!guides || !guides.length) return;
  const fr = state.frameObj;
  const W = fr ? (fr.wMM || 420) * (fr.sc || 1) : cv.width / state.zoom;
  const H = fr ? (fr.hMM || 297) * (fr.sc || 1) : cv.height / state.zoom;

  ctx.save();
  ctx.strokeStyle = '#e879f9';
  ctx.lineWidth = 1 / state.zoom;
  ctx.setLineDash([8 / state.zoom, 4 / state.zoom]);

  guides.forEach(g => {
    ctx.beginPath();
    if (g.type === 'guide_h') {
      ctx.moveTo(0, g.y); ctx.lineTo(W, g.y);
    } else {
      ctx.moveTo(g.x, 0); ctx.lineTo(g.x, H);
    }
    ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.restore();
}
