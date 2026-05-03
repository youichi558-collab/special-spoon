// ================================================================
// hit_test.js — ヒットテスト・選択補助関数
// ================================================================

function hitTest(wx, wy) {
  const R = 8 / state.zoom;
  for (let i = state.elements.length-1; i >= 0; i--) {
    const el = state.elements[i];
    const lay = LAYERS.find(l => l.name === el.layer);
    if (lay && lay.locked) continue;
    // getDef()に依存しない型を先に判定
    if (el.type === 'text')   { const hw = Math.min(200, (el.text||'').length * (el.fs||14) * 0.55); const hh = (el.fs||14) * 0.8; if (wx>=el.x && wx<=el.x+hw && wy>=el.y-hh && wy<=el.y+2) return el; continue; }
    if (el.type === 'dim')    { if (distToSeg(wx,wy,el.x1,el.y1,el.x2,el.y2) < R) return el; continue; }
    if (el.type === 'leader') { if (distToSeg(wx,wy,el.x1,el.y1,el.bx,el.by) < R || distToSeg(wx,wy,el.bx,el.by,el.x2,el.y2) < R) return el; continue; }
    if (el.type === 'fline')  { if (distToSeg(wx,wy,el.x1,el.y1,el.x2,el.y2) < R) return el; continue; }
    if (el.type === 'rect')   { if (wx>=el.x&&wx<=el.x+el.w&&wy>=el.y&&wy<=el.y+el.h) return el; continue; }
    if (el.type === 'circle') { if (Math.abs(Math.hypot(wx-el.x,wy-el.y)-el.r) < R) return el; continue; }
    // シンボル系はgetDef()が必要
    const d = getDef(el.type);
    if (!d) continue;
    const sc = el.scale || 1;
    if (Math.abs(wx-el.x)<(d.w*sc/2+R) && Math.abs(wy-el.y)<(d.h*sc/2+R)) return el;
  }
  return null;
}

function hitTestWire(wx, wy) {
  const R = 6 / state.zoom;
  for (let i = state.wires.length-1; i >= 0; i--) {
    const w = state.wires[i];
    const lay = LAYERS.find(l => l.name === w.layer);
    if (lay && lay.locked) continue;
    const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
    for (let j = 0; j < pts.length-1; j++) {
      if (distToSeg(wx,wy,pts[j].x,pts[j].y,pts[j+1].x,pts[j+1].y) < R) return w;
    }
  }
  return null;
}

function distToSeg(px,py,x1,y1,x2,y2) {
  const dx=x2-x1, dy=y2-y1, len2=dx*dx+dy*dy;
  if (len2===0) return Math.hypot(px-x1,py-y1);
  const t = Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2));
  return Math.hypot(px-(x1+t*dx), py-(y1+t*dy));
}

function inBox(el, sx, sy, ex, ey, crossing) {
  // ロック中レイヤーはスキップ
  const _lay = LAYERS.find(l => l.name === el.layer);
  if (_lay && _lay.locked) return false;
  // crossing=true: 部分重なりも選択（右→左ドラッグ）
  // crossing=false: 完全に内側のみ（左→右ドラッグ）
  if (el.type === 'text') {
    const x2 = el.x + Math.min(200, (el.text||'').length * (el.fs||14) * 0.55);
    const y1 = el.y - (el.fs||14) * 0.8, y2 = el.y + 2;
    return crossing
      ? el.x<=ex && x2>=sx && y1<=ey && y2>=sy
      : el.x>=sx && x2<=ex && y1>=sy && y2<=ey;
  }
  if (el.type === 'rect') {
    const rx2=el.x+el.w, ry2=el.y+el.h;
    return crossing
      ? el.x<=ex && rx2>=sx && el.y<=ey && ry2>=sy
      : el.x>=sx && rx2<=ex && el.y>=sy && ry2<=ey;
  }
  if (el.type === 'circle') {
    return crossing
      ? el.x+el.r>=sx && el.x-el.r<=ex && el.y+el.r>=sy && el.y-el.r<=ey
      : el.x-el.r>=sx && el.x+el.r<=ex && el.y-el.r>=sy && el.y+el.r<=ey;
  }
  if (el.type === 'fline' || el.type === 'dim' || el.type === 'leader') {
    const pts2 = [{x:el.x1,y:el.y1},{x:el.x2,y:el.y2}];
    if (el.type === 'leader') pts2.push({x:el.bx,y:el.by});
    return crossing
      ? pts2.some(p => p.x>=sx&&p.x<=ex&&p.y>=sy&&p.y<=ey)
      : pts2.every(p => p.x>=sx&&p.x<=ex&&p.y>=sy&&p.y<=ey);
  }
  const d = getDef(el.type);
  if (!d) {
    if (el.x != null) return crossing
      ? el.x>=sx&&el.x<=ex&&el.y>=sy&&el.y<=ey
      : el.x>=sx&&el.x<=ex&&el.y>=sy&&el.y<=ey;
    return false;
  }
  const sc = el.scale || 1;
  const hw = d.w*sc/2, hh = d.h*sc/2;
  return crossing
    ? el.x+hw>=sx && el.x-hw<=ex && el.y+hh>=sy && el.y-hh<=ey
    : el.x-hw>=sx && el.x+hw<=ex && el.y-hh>=sy && el.y+hh<=ey;
}

function wireInBox(w, sx, sy, ex, ey, crossing) {
  const _lay = LAYERS.find(l => l.name === w.layer);
  if (_lay && _lay.locked) return false;
  const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
  return crossing
    ? pts.some(p => p.x>=sx && p.x<=ex && p.y>=sy && p.y<=ey)
    : pts.every(p => p.x>=sx && p.x<=ex && p.y>=sy && p.y<=ey);
}

function buildDragGroup() {
  const group = [];
  const selEls   = state.elements.filter(el => state.sel.els.has(el.id));
  const selWires = state.wires.filter(w    => state.sel.wires.has(w.id));
  selEls.forEach(el => {
    if (el.x != null)  group.push({ el, ox: el.x, oy: el.y, obx: el.bx, oby: el.by });
    if (el.x1 != null) group.push({ el, ox1: el.x1, oy1: el.y1, ox2: el.x2, oy2: el.y2 });
  });
  selWires.forEach(w => {
    const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
    group.push({ el: w, opts: JSON.parse(JSON.stringify(pts)) });
  });
  return group;
}
