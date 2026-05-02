// ================================================================
// snap.js — スナップ補助関数
// ================================================================

function getAllSnapPoints(wx, wy) {
  const R = 12 / state.zoom;
  let best = null, bestD = R;

  state.elements.forEach(el => {
    if (state.snapEnd && !['text','rect','circle','fline','dim','leader'].includes(el.type)) {
      const d = getDef(el.type) || {};
      const cS = state.customSymbols.find(s => s.type === el.type);
      const rot = (el.rot || 0) * Math.PI / 180;
      if (cS && cS.terminals?.length) {
        cS.terminals.forEach(t => {
          const rx = t.x * Math.cos(rot) - t.y * Math.sin(rot);
          const ry = t.x * Math.sin(rot) + t.y * Math.cos(rot);
          const dist = Math.hypot(wx - (el.x+rx), wy - (el.y+ry));
          if (dist < bestD) { bestD = dist; best = { x: el.x+rx, y: el.y+ry, snapType:'endpoint' }; }
        });
      } else {
        const hw = (d.w||0)/2;
        [+hw, -hw].forEach(dx => {
          const rx = dx * Math.cos(rot), ry = dx * Math.sin(rot);
          const dist = Math.hypot(wx - (el.x+rx), wy - (el.y+ry));
          if (dist < bestD) { bestD = dist; best = { x: el.x+rx, y: el.y+ry, snapType:'endpoint' }; }
        });
      }
    }
  });

  state.wires.forEach(w => {
    const pts = w.pts || [{ x:w.x1,y:w.y1 }, { x:w.x2,y:w.y2 }];
    pts.forEach(p => {
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (state.snapEnd && d < bestD) { bestD = d; best = { x:p.x, y:p.y, snapType:'endpoint' }; }
    });
    if (state.snapMid) {
      for (let i = 0; i < pts.length-1; i++) {
        const mx = (pts[i].x + pts[i+1].x)/2, my = (pts[i].y + pts[i+1].y)/2;
        const d = Math.hypot(wx - mx, wy - my);
        if (d < bestD) { bestD = d; best = { x:mx, y:my, snapType:'midpoint' }; }
      }
    }
  });

  return best || { x: snap(wx), y: snap(wy), snapType: 'grid' };
}

function snapWirePoint(wx, wy, prevX, prevY) {
  const sp = getAllSnapPoints(wx, wy);
  if (sp) {
    if (state.ortho && prevX != null) { const o = applyOrtho(prevX, prevY, sp.x, sp.y); return { x:o.x, y:o.y, snapType:sp.snapType }; }
    return { x:sp.x, y:sp.y, snapType:sp.snapType };
  }
  let sx = snap(wx), sy = snap(wy);
  if (state.ortho && prevX != null) { const o = applyOrtho(prevX, prevY, sx, sy); sx=o.x; sy=o.y; }
  return { x:sx, y:sy, snapType:'grid' };
}

function applyOrtho(x1, y1, x2, y2) {
  return Math.abs(x2-x1) >= Math.abs(y2-y1) ? { x:x2, y:y1 } : { x:x1, y:y2 };
}
