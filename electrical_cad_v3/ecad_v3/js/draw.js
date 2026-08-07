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

  // 【検証用/仮】シンボル端子(ピン)マーカー表示。PDF出力には反映しない
  if (!state.pdfMode && state.showSymPins) drawSymPinMarkers();

  // 未接続端子マーカー(runUnconnectedCheck()のキャッシュ結果を描画するだけ、
  // ここでは再計算しない)。PDF出力には反映しない
  if (!state.pdfMode && state.showUnconnected) drawUnconnectedMarkers();

  // グループ境界ボックス
  if (!state.pdfMode) drawGroupBoxes();

  // プレビュー（仮描画）
  drawPreview();

  // スナップマーカー
  drawSnapMarker();

  // ラバーバンド選択ボックス
  if (!state.pdfMode) drawGuides();

  // 検索ヒットの点滅マーカー
  if (!state.pdfMode && state.searchHit) {
    const h = state.searchHit;
    const t = (Date.now() - h.t0) / 400;
    const rw = (16 + 10 * Math.abs(Math.sin(t * Math.PI))) / state.zoom;
    ctx.save();
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2.5 / state.zoom;
    ctx.beginPath();
    ctx.arc(h.x, h.y, rw, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
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
  // ズーム後のグリッド間隔が4px未満なら描画スキップ（G=1等で重くなるのを防ぐ）
  const pixelStep = G * zoom;
  if (pixelStep < 4) return;
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
    const color = sel ? '#0067c0' : (lay ? lay.color : '#0F6E56');
    const lw    = w.lineWidth || lay?.lineWidth || 1.0;
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
      // ワイヤーの法線方向を計算（常に画面上側へ）
      let nx = 0, ny = -1;
      if (n >= 2) {
        const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
        const len = Math.hypot(dx, dy);
        if (len > 0.1) { nx = -dy/len; ny = dx/len; if (ny > 0) { nx=-nx; ny=-ny; } }
      }
      const fs  = w.wireNoFs || 10;
      const off = fs + 6;
      const tx = mp.x + nx*off + (w.wireNoOffX||0);
      const ty = mp.y + ny*off + (w.wireNoOffY||0);
      ctx.font  = `bold ${fs}px sans-serif`; ctx.textAlign = 'center';
      const tw2 = ctx.measureText(w.wireNo).width;
      ctx.fillStyle = sel ? '#0067c0' : '#1e40af';
      ctx.strokeStyle = state.darkMode ? '#252525' : '#fff';
      ctx.lineWidth = 3/state.zoom; ctx.lineJoin='round';
      ctx.strokeText(w.wireNo, tx, ty);
      ctx.fillText(w.wireNo, tx, ty);
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
  ctx.lineWidth   = 1;
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
    } else if (el.type === 'bezier') {
      drawBezierEl(el, sel, lc, lay);
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

// 【検証用/仮】シンボル端子(ピン)位置を小さい丸マーカーで表示する。
// snap.js のスナップ判定と全く同じデータ(cS.terminals / 標準シンボルの左右端)を使う。
// つまりこの表示 = 実際にワイヤーがスナップする位置、そのもの。
// PDF出力・DXF等には一切影響しない。
const SYM_ONLY_TYPES = ['text','rect','circle','fline','triangle','arc','junction','bezier','dim','angle_dim','leader'];
function drawSymPinMarkers() {
  ctx.save();
  state.elements.forEach(el => {
    if (SYM_ONLY_TYPES.includes(el.type)) return; // シンボル以外はスキップ
    const lay = LAYERS.find(l => l.name === el.layer);
    if (lay && !lay.visible) return;

    const cS  = state.customSymbols.find(s => s.type === el.type);
    const rot = (el.rot || 0) * Math.PI / 180;
    let pins = [];
    if (cS && cS.terminals && cS.terminals.length) {
      pins = cS.terminals.map((t, i) => {
        const rx = t.x * Math.cos(rot) - t.y * Math.sin(rot);
        const ry = t.x * Math.sin(rot) + t.y * Math.cos(rot);
        return { x: el.x + rx, y: el.y + ry, name: `T${i}` };
      });
    } else {
      // 標準シンボル、またはterminals未定義のカスタムシンボル
      // → snap.js と同じフォールバック(左右端の中点)
      const d  = getDef(el.type) || {};
      const sc = el.scale || 1;
      const hw = (d.w || 0) / 2 * sc;
      pins = [+hw, -hw].map((dx, i) => {
        const rx = dx * Math.cos(rot), ry = dx * Math.sin(rot);
        return { x: el.x + rx, y: el.y + ry, name: i === 0 ? 'R' : 'L' };
      });
    }
    pins.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4/state.zoom, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,0,0,0.75)';
      ctx.fill();
      ctx.font = `${10/state.zoom}px sans-serif`;
      ctx.fillStyle = '#ff0000';
      ctx.fillText(p.name || p.id, p.x + 6/state.zoom, p.y - 6/state.zoom);
    });
  });
  ctx.restore();
}

// 未接続端子マーカー(state._unconnectedResultsのキャッシュを描画するだけ。
// ここでは再計算しない。runUnconnectedCheck()で計算されたものを表示する)
function drawUnconnectedMarkers() {
  ctx.save();
  (state._unconnectedResults || []).forEach(r => {
    ctx.beginPath();
    ctx.arc(r.x, r.y, 6/state.zoom, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,152,0,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#e65100'; ctx.lineWidth = 1.2/state.zoom;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${9/state.zoom}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', r.x, r.y + 3/state.zoom);
  });
  ctx.restore();
}

function drawTextEl(el, sel, lc, lay) {
  ctx.save();
  ctx.fillStyle = lc;
  const fs = el.fs || lay?.fontSize || 14;
  ctx.font = `${fs}px sans-serif`;
  const lines = (el.text || '').split('\n');
  const lineH = fs * 1.4;
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const totalH = lines.length * lineH;
  const pad = el.textBoxPad ?? 4;

  // 枠あり
  if (el.textBox) {
    const lw = el.lineWidth || lay?.lineWidth || 1.0;
    ctx.strokeStyle = lc; ctx.lineWidth = lw;
    ctx.strokeRect(el.x - pad, el.y - fs * 0.85, maxW + pad * 2, totalH + pad * 0.5);
  }

  lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lineH));

  if (sel) {
    ctx.strokeStyle = lc; ctx.lineWidth = 1.5/state.zoom;
    ctx.setLineDash([4/state.zoom, 3/state.zoom]);
    ctx.strokeRect(el.x - pad - 3, el.y - fs * 0.85 - 3, maxW + pad * 2 + 6, totalH + pad * 0.5 + 6);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawRectEl(el, sel, lc, lay) {
  ctx.save();
  const c  = lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.0;
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
  const c  = lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.0;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+1 : lw);
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  if (el.fillColor) { ctx.fillStyle = el.fillColor; ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI*2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}

function drawTriEl(el, sel, lc, lay) {
  ctx.save();
  const c = lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.0;
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
  const c  = lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.0;
  ctx.strokeStyle = c; ctx.lineWidth = (sel ? lw+1 : lw);
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  ctx.beginPath(); ctx.arc(el.x, el.y, el.r, el.startA, el.endA, el.ccw || false); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawJunctionEl(el, sel, lc) {
  ctx.save();
  const c = lc;
  const r = el.r || 5;
  const style = el.style || 'dot';
  if (sel) {
    ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1.5 / state.zoom;
    ctx.beginPath(); ctx.arc(el.x, el.y, r + 2/state.zoom, 0, Math.PI*2); ctx.stroke();
  }
  if (style === 'circle' || style === 'dbl') {
    // 白丸(端子台の端子): 背景色で塗って輪郭のみ描く
    ctx.fillStyle = state.darkMode ? '#252525' : '#d4d4cc';
    ctx.beginPath(); ctx.arc(el.x, el.y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, r*0.3) / state.zoom;
    ctx.beginPath(); ctx.arc(el.x, el.y, r, 0, Math.PI*2); ctx.stroke();
    if (style === 'dbl') {
      ctx.beginPath(); ctx.arc(el.x, el.y, r*0.55, 0, Math.PI*2); ctx.stroke();
    }
  } else {
    // 塗りつぶし丸(既定・配線分岐点)
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(el.x, el.y, r, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();

  // 端子番号ラベル(常時表示、図面を読むための必須情報。分岐点(●)には表示しない)
  if (el.label && style !== 'dot') {
    ctx.save();
    ctx.fillStyle = c;
    ctx.font = `${11/state.zoom}px sans-serif`;
    ctx.textAlign = 'left';
    const lx = el.x + r + 4/state.zoom + (el.labelOffX||0);
    const ly = el.y + 4/state.zoom + (el.labelOffY||0);
    ctx.fillText(el.label, lx, ly);
    ctx.restore();
  }
  // デバイス(TB1等、デバイス表示ON時のみ。分岐点(●)には表示しない)
  if (state.showPartRef && !state.pdfSkipText && el.partRef && style !== 'dot') {
    ctx.save();
    ctx.fillStyle = state.darkMode ? '#4da3ff' : '#1d6fb5';
    ctx.font = `bold ${10/state.zoom}px sans-serif`;
    ctx.textAlign = 'center';
    const dx = el.x + (el.devOffX||0);
    const dy = el.y - r - 6/state.zoom + (el.devOffY||0);
    ctx.fillText(el.partRef, dx, dy);
    ctx.restore();
  }
}

function drawCatmullRom(pts, tension) {
  if (pts.length < 2) return;
  tension = tension || 0.5;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i-1)];
    const p1 = pts[i];
    const p2 = pts[i+1];
    const p3 = pts[Math.min(pts.length-1, i+2)];
    const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 3;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

function drawBezierEl(el, sel, lc, lay) {
  if (!el.pts || el.pts.length < 2) return;
  ctx.save();
  const c = lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.0;
  ctx.strokeStyle = c; ctx.lineWidth = sel ? lw+1 : lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  applyLineStyle(ctx, el.lineStyle || lay?.lineDash, state.zoom);
  ctx.beginPath();
  drawCatmullRom(el.pts);
  ctx.stroke(); ctx.setLineDash([]);
  if (sel) {
    ctx.fillStyle = '#0067c0';
    el.pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3/state.zoom, 0, Math.PI*2); ctx.fill(); });
  }
  ctx.restore();
}

function drawFlineEl(el, sel, lc, lay) {
  ctx.save();
  const c  = lc;
  const lw = el.lineWidth || lay?.lineWidth || 1.0;
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
    // symScale(=sc)を渡し、scale後も線幅が指定どおりの太さで見えるよう補正する。
    drawSym(el.type, 0, 0, sel, el.rot||0, el.flipH, el.flipV, lc, el.lineStyle, el.lineWidth, sc);
    ctx.restore();
  } else {
    drawSym(el.type, el.x, el.y, sel, el.rot||0, el.flipH, el.flipV, lc, el.lineStyle, el.lineWidth, 1);
  }
  if (el.label && !state.pdfSkipText) {
    const d   = getDef(el.type) || { w:64, h:34 };
    const sc  = el.scale || 1;
    const loy = el.labelOffY || (d.h*sc/2 + 15*sc);
    const rot = (el.rot||0) * Math.PI/180;
    // 文字サイズはシンボルのスケールに追随させない(印字上の実サイズとして固定)。
    // 位置(loy等)はシンボルに対する相対配置なのでスケールに追随させたまま。
    const fs  = Math.round(el.labelFs||11);
    ctx.save();
    // translate+rotateしたローカル座標系で描くと、文字揃えの基準x(lox)が
    // 全行共通のまま保てる。textAlignをleft/center/rightに切り替えるだけで
    // 各行の長さが違っても自然に左揃え/中央揃え/右揃えになる。
    ctx.translate(el.x, el.y);
    ctx.rotate(rot);
    ctx.fillStyle = el.labelColor || (state.darkMode ? '#aaa' : '#555');
    ctx.font = `${fs}px sans-serif`;
    // 基準点(lox)は内容の長さに関わらず常に固定(labelOffXのみ)。
    // 以前は最長行の幅から基準点を計算し「揃えを変えても文章全体の中心が動かない」
    // ようにしていたが、これだと仕様文字列の長さが違う機器同士で左揃えの
    // 開始位置がズレてしまっていた(同じ書き方でも装置ごとに位置が変わる不具合)。
    // 「左揃え=決まった位置から書き始める」という素直な期待に合わせ、固定点+揃えのみにする。
    ctx.textAlign = el.labelAlign || 'center';
    const lines = String(el.label).split('\n');
    const lh = Math.round(fs * 1.25);
    const lox = el.labelOffX || 0;
    lines.forEach((ln, i) => ctx.fillText(ln, lox, loy + i*lh));
    ctx.restore();
  }
  // 型式(partModel)の図面表示。要素ごとの el.showModel が真のときだけ描く。
  // 全体トグルにすると同じデバイスの接点すべてに型式が出てしまうため、
  // 表示するシンボル(コイル・本体側)を個別に選べるようにしている。
  if (el.showModel && el.partModel && !state.pdfSkipText) {
    const d   = getDef(el.type) || { w:64, h:34 };
    const sc  = el.scale || 1;
    const fs  = Math.round(el.modelFs || el.labelFs || 11);
    // 型式専用の補正(modelOffX/Y)があればそれを使い、無ければ
    // ラベルの位置を基準に「ラベルがあれば1行下、無ければラベルの位置」に置く
    const base = el.labelOffY || (d.h*sc/2 + 15*sc);
    const lox  = el.modelOffX !== undefined ? el.modelOffX : (el.labelOffX || 0);
    // 仕様が複数行のときは、その行数ぶん下げて重ならないようにする
    const lblLines = el.label ? String(el.label).split('\n').length : 0;
    const lblFs    = Math.round(el.labelFs||11);
    const loy  = el.modelOffY !== undefined ? el.modelOffY
               : base + (lblLines ? (lblLines - 1) * Math.round(lblFs*1.25) + fs + 3 : 0);
    const rot  = (el.rot||0) * Math.PI/180;
    const mx   = el.x + lox*Math.cos(rot) - loy*Math.sin(rot);
    const my   = el.y + lox*Math.sin(rot) + loy*Math.cos(rot);
    ctx.save();
    ctx.fillStyle = el.modelColor || el.labelColor || (state.darkMode ? '#aaa' : '#555');
    ctx.font = `${fs}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(el.partModel, mx, my);
    ctx.restore();
  }
  // デバイス表示（表示ON時）。
  // 以前は未入力シンボルにオレンジの「?」を描いていたが、デバイスを持たない
  // シンボルすべてに出て図面が読めなくなるため廃止した。
  // 3極品のように同じデバイスを複数要素に分けて配置する場合、
  // 部品表・接続表を正しく集計するには全要素に同じデバイス名を入れる必要がある。
  // その一方で文字は1箇所だけに出したいので、要素ごとに devHide で
  // 表示/非表示を切り替えられるようにしている(既定は表示=false)。
  // 位置・サイズは devOffX / devOffY / devFs で個別に調整できる。
  // 既定は従来どおりシンボル上端の少し上。回転には追随しない（従来の見た目を維持）。
  if (state.showPartRef && !state.pdfSkipText && el.partRef && !el.devHide) {
    const d  = getDef(el.type) || { w:64, h:34 };
    const sc = el.scale || 1;
    const fs = Math.round(el.devFs || 11);
    const dx = el.devOffX || 0;
    const dy = el.devOffY !== undefined ? el.devOffY : -(d.h*sc/2 + 6);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold ${fs}px sans-serif`;
    ctx.fillStyle = el.devColor || (state.darkMode ? '#4da3ff' : '#1d6fb5');
    ctx.fillText(el.partRef, el.x + dx, el.y + dy);
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
  } else if (prev.type === 'outline_preview') {
    ctx.strokeRect(prev.x, prev.y, prev.w, prev.h);
  } else if (prev.type === 'junction_preview') {
    ctx.setLineDash([]);
    const r = (state.junctionR || 2);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0067c0';
    ctx.beginPath(); ctx.arc(prev.x, prev.y, r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (prev.type === 'bezier_preview') {
    ctx.setLineDash([4/state.zoom, 3/state.zoom]);
    const allPts = [...prev.pts, { x: prev.mx, y: prev.my }];
    ctx.beginPath();
    drawCatmullRom(allPts);
    ctx.stroke();
    ctx.setLineDash([]);
    // 確定済み制御点を表示
    ctx.fillStyle = '#0067c0';
    prev.pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3/state.zoom, 0, Math.PI*2); ctx.fill(); });
  } else if (prev.type === 'dim_prev1' || prev.type === 'dim_prev2' ||
             prev.type === 'leader_prev1' || prev.type === 'leader_prev2' ||
             prev.type === 'chain_prev') {
    ctx.setLineDash([]);
    drawDimPreview(prev);
  } else if (prev.type === 'paste_preview') {
    ctx.setLineDash([4/state.zoom, 3/state.zoom]);
    ctx.globalAlpha = 0.5;
    const { dx, dy } = prev;
    // クリップボードの要素を仮描画
    (state.clipboard?.els || []).forEach(el => {
      const ne = JSON.parse(JSON.stringify(el));
      if (typeof moveEntity === 'function') moveEntity(ne, dx, dy);
      const lay = LAYERS.find(l => l.name === ne.layer);
      const lc = lay ? lay.color : fgC();
      if (ne.type === 'text')     drawTextEl(ne, false, lc, lay);
      else if (ne.type === 'rect')     drawRectEl(ne, false, lc, lay);
      else if (ne.type === 'circle')   drawCircleEl(ne, false, lc, lay);
      else if (ne.type === 'fline')    drawFlineEl(ne, false, lc, lay);
      else if (ne.type === 'triangle') drawTriEl(ne, false, lc, lay);
      else if (ne.type === 'arc')      drawArcEl(ne, false, lc, lay);
      else if (ne.type === 'dim')      drawDimEl(ne, false);
      else if (ne.type === 'leader')   drawLeaderEl(ne, false);
      else if (ne.type === 'junction') drawJunctionEl(ne, false, lc);
      else if (ne.type === 'bezier')   drawBezierEl(ne, false, lc, lay);
      else drawSymEl(ne, false, lc);
    });
    (state.clipboard?.wires || []).forEach(w => {
      const nw = JSON.parse(JSON.stringify(w));
      nw.pts = (nw.pts||[]).map(p => ({ x: p.x+dx, y: p.y+dy }));
      nw.x1 = nw.pts[0]?.x; nw.y1 = nw.pts[0]?.y;
      nw.x2 = nw.pts[nw.pts.length-1]?.x; nw.y2 = nw.pts[nw.pts.length-1]?.y;
      // ワイヤー描画（簡易）
      const lay = LAYERS.find(l => l.name === nw.layer);
      const lc = lay ? lay.color : fgC();
      ctx.setLineDash([]);
      ctx.strokeStyle = lc;
      ctx.lineWidth = (lay?.lineWidth || 1.0);
      ctx.beginPath();
      (nw.pts||[]).forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
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
  } else if (stype === 'guide_cross') {
    // 補助線交点：水色の二重円
    const s = 7/state.zoom;
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2/state.zoom;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, s, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, s*0.45, 0, Math.PI*2); ctx.stroke();
  } else if (stype === 'guide') {
    // 単独補助線：水色×印
    const s = 6/state.zoom;
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2/state.zoom;
    ctx.beginPath(); ctx.moveTo(sp.x-s, sp.y-s); ctx.lineTo(sp.x+s, sp.y+s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sp.x+s, sp.y-s); ctx.lineTo(sp.x-s, sp.y+s); ctx.stroke();
  } else if (stype === 'intersection') {
    // 交点スナップ：オレンジ×印＋円
    const s = 6/state.zoom;
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2/state.zoom;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, s, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sp.x-s, sp.y-s); ctx.lineTo(sp.x+s, sp.y+s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sp.x+s, sp.y-s); ctx.lineTo(sp.x-s, sp.y+s); ctx.stroke();
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
  const c = isSel ? '#0067c0' : (layColor(el.layer)||'#744da9');
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
  ctx.strokeStyle=state.darkMode?'#252525':'#fff';
  ctx.lineWidth=3/state.zoom; ctx.lineJoin='round';
  ctx.strokeText(txt, tx2, ty2);
  ctx.fillStyle=c; ctx.fillText(txt, tx2, ty2);
  ctx.textBaseline='alphabetic';
  ctx.restore();
}

function drawAngleDimEl(el, isSel) {
  if (el.cx==null||el.x1==null||el.x2==null) return;
  const a1 = Math.atan2(el.y1-el.cy, el.x1-el.cx);
  const a2 = Math.atan2(el.y2-el.cy, el.x2-el.cx);
  const r = el.r || 30;
  const c = isSel ? '#0067c0' : (layColor(el.layer)||'#744da9');
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
  ctx.strokeStyle=state.darkMode?'#252525':'#fff';
  ctx.lineWidth=3/state.zoom; ctx.lineJoin='round';
  ctx.strokeText(txt, tx, ty);
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
    ctx.strokeStyle=state.darkMode?'#252525':'#fff';
    ctx.lineWidth=3/state.zoom; ctx.lineJoin='round';
    ctx.strokeText(el.leaderText, tx+6, ty-2);
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
  // 画面全体をカバーする無限線（world座標で画面外まで伸ばす）
  const inf = cv.width / state.zoom + Math.abs(state.pan.x / state.zoom) + 9999;

  const prevStroke = ctx.strokeStyle;
  const prevLW = ctx.lineWidth;
  ctx.strokeStyle = '#e879f9';
  ctx.lineWidth = 0.3 / state.zoom;
  ctx.setLineDash([8 / state.zoom, 4 / state.zoom]);

  guides.forEach(g => {
    ctx.beginPath();
    if (g.type === 'guide_h') {
      ctx.moveTo(-inf, g.y); ctx.lineTo(inf, g.y);
    } else {
      ctx.moveTo(g.x, -inf); ctx.lineTo(g.x, inf);
    }
    ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.strokeStyle = prevStroke;
  ctx.lineWidth = prevLW;
}

// ----------------------------------------------------------------
// グループ境界ボックス描画
// ----------------------------------------------------------------
function drawGroupBoxes() {
  const groups = state.page.groups || [];
  if (!groups.length) return;

  // O(1)検索用Map（毎フレーム1回だけ構築）
  const elMap   = new Map(state.elements.map(e => [e.id, e]));
  const wireMap = new Map(state.wires.map(w => [w.id, w]));

  ctx.save();
  const pad = 6 / state.zoom;

  groups.forEach(g => {
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    const addP = (x, y) => {
      if (x == null || y == null) return;
      if (x < minX) minX=x; if (x > maxX) maxX=x;
      if (y < minY) minY=y; if (y > maxY) maxY=y;
    };

    g.elIds.forEach(id => {
      const el = elMap.get(id);
      if (!el) return;
      addP(el.x, el.y);
      addP(el.x1, el.y1); addP(el.x2, el.y2); addP(el.x3, el.y3);
      addP(el.cx, el.cy); addP(el.bx, el.by);
      if (el.w != null) addP(el.x + el.w, el.y + (el.h||0));
      if (el.r != null) {
        addP(el.x+el.r, el.y); addP(el.x-el.r, el.y);
        addP(el.x, el.y+el.r); addP(el.x, el.y-el.r);
      }
      if (el.pts) el.pts.forEach(p => addP(p.x, p.y));
    });
    g.wireIds.forEach(id => {
      const w = wireMap.get(id);
      if (w?.pts) w.pts.forEach(p => addP(p.x, p.y));
    });

    if (minX === Infinity) return;

    const isSelected = g.elIds.some(id => state.sel.els.has(id)) ||
                       g.wireIds.some(id => state.sel.wires.has(id));
    ctx.strokeStyle = isSelected ? '#f59e0b' : (state.darkMode ? 'rgba(245,158,11,0.35)' : 'rgba(180,120,0,0.3)');
    ctx.lineWidth = (isSelected ? 1.5 : 1) / state.zoom;
    ctx.setLineDash([6/state.zoom, 3/state.zoom]);
    ctx.strokeRect(minX-pad, minY-pad, maxX-minX+pad*2, maxY-minY+pad*2);
    ctx.setLineDash([]);
  });

  ctx.restore();
}
