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

function inBox(el, sx, sy, ex, ey) {
  const d = getDef(el.type);
  if (!d) return false;
  if (el.type === 'text') {
    const tw = (el.text||'').length * (el.fs||14) * 0.6;
    const th = (el.fs||14);
    return el.x <= ex && el.x+tw >= sx && el.y-th <= ey && el.y >= sy;
  }
  if (el.x != null) return el.x>=sx && el.x<=ex && el.y>=sy && el.y<=ey;
  if (el.x1 != null) return el.x1>=sx&&el.x1<=ex&&el.y1>=sy&&el.y1<=ey&&el.x2>=sx&&el.x2<=ex&&el.y2>=sy&&el.y2<=ey;
  return false;
}

function wireInBox(w, sx, sy, ex, ey) {
  const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
  return pts.every(p => p.x>=sx && p.x<=ex && p.y>=sy && p.y<=ey);
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
