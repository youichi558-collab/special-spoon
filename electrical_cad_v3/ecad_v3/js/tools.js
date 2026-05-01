// ================================================================
// tools.js — ツールごとの状態遷移処理
// ツールはstateを更新するだけ。描画はdraw.jsが行う。
// ================================================================

// ----------------------------------------------------------------
// スナップ補助
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// 選択ツール
// ----------------------------------------------------------------
const selectTool = {
  onDown(wx, wy, e) {
    // リサイズハンドル上のクリックはハンドル側で処理済み
    const el = hitTest(wx, wy);
    const wire = el ? null : hitTestWire(wx, wy);

    if (!el && !wire) {
      // 空白クリック → ラバーバンド開始 or 選択解除
      if (!e.shiftKey) { state.sel.els.clear(); state.sel.wires.clear(); }
      state.mouse.selboxing = true;
      updateRightPanel();
      return;
    }

    // 要素クリック
    if (!e.shiftKey && !state.sel.els.has(el?.id) && !state.sel.wires.has(wire?.id)) {
      state.sel.els.clear(); state.sel.wires.clear();
    }
    if (el)   state.sel.els.add(el.id);
    if (wire) state.sel.wires.add(wire.id);

    // ドラッグ準備
    state.mouse.dragging  = true;
    state.mouse.dragMoved = false;
    state.mouse.dragGroup = buildDragGroup();
    updateRightPanel();
  },

  onMove(wx, wy, e) {
    if (state.mouse.selboxing) { draw(); return; }
    if (!state.mouse.dragging) return;

    const dx = wx - state.mouse.startWx;
    const dy = wy - state.mouse.startWy;
    if (!state.mouse.dragMoved && Math.hypot(dx, dy) < 2/state.zoom) return;

    state.mouse.dragMoved = true;
    state.mouse.dragGroup.forEach(({ el, ox, oy, ox1, oy1, ox2, oy2, opts }) => {
      if (el.x != null) { el.x = snap(ox+dx); el.y = snap(oy+dy); }
      if (el.x1 != null) {
        if (opts) {
          el.pts = opts.map(p => ({ x: snap(p.x+dx), y: snap(p.y+dy) }));
          el.x1 = el.pts[0].x; el.y1 = el.pts[0].y;
          el.x2 = el.pts[el.pts.length-1].x; el.y2 = el.pts[el.pts.length-1].y;
        } else {
          el.x1 = snap(ox1+dx); el.y1 = snap(oy1+dy);
          el.x2 = snap(ox2+dx); el.y2 = snap(oy2+dy);
        }
      }
    });
  },

  onUp(wx, wy, e) {
    if (state.mouse.selboxing) {
      // ラバーバンド選択確定
      const sx = Math.min(state.mouse.startWx, wx);
      const ex = Math.max(state.mouse.startWx, wx);
      const sy = Math.min(state.mouse.startWy, wy);
      const ey = Math.max(state.mouse.startWy, wy);
      if (!e.shiftKey) { state.sel.els.clear(); state.sel.wires.clear(); }
      state.elements.forEach(el => { if (inBox(el, sx, sy, ex, ey)) state.sel.els.add(el.id); });
      state.wires.forEach(w => { if (wireInBox(w, sx, sy, ex, ey)) state.sel.wires.add(w.id); });
      state.mouse.selboxing = false;
      updateRightPanel();
      updateResizeHandles();
      return;
    }
    if (state.mouse.dragging) {
      if (state.mouse.dragMoved) pushH();
      state.mouse.dragging  = false;
      state.mouse.dragGroup = [];
      updateResizeHandles();
    }
  },

  onHover(wx, wy, e) {}
};

// ----------------------------------------------------------------
// 配線ツール
// ----------------------------------------------------------------
const wireTool = {
  onDown(wx, wy, e) {
    const sp = snapWirePoint(wx, wy, state.wirePoints.at(-1)?.x, state.wirePoints.at(-1)?.y);
    state.wirePoints.push({ x: sp.x, y: sp.y });
    if (state.wirePoints.length >= 2) {
      // 線を1本確定
      const pts = [...state.wirePoints];
      pushH();
      state.wires.push({ id: genId('w'),
        pts, x1: pts[0].x, y1: pts[0].y,
        x2: pts[pts.length-1].x, y2: pts[pts.length-1].y,
        layer: activeLayer(), wireNo: '',
      });
      // 最後の点を次の始点に
      state.wirePoints = [{ x: sp.x, y: sp.y }];
      state.preview = null;
    }
  },

  onMove(wx, wy, e) {
    if (!state.wirePoints.length) return;
    const prev = state.wirePoints.at(-1);
    const sp   = snapWirePoint(wx, wy, prev.x, prev.y);
    state.preview = { type:'wire_preview', pts: [prev, { x:sp.x, y:sp.y }] };
  },

  onUp(wx, wy, e) {},

  onHover(wx, wy, e) {
    if (!state.wirePoints.length) return;
    const prev = state.wirePoints.at(-1);
    const sp   = snapWirePoint(wx, wy, prev.x, prev.y);
    state.preview = { type:'wire_preview', pts: [prev, { x:sp.x, y:sp.y }] };
  }
};

// ----------------------------------------------------------------
// シンボル配置ツール
// ----------------------------------------------------------------
const symTool = {
  onDown(wx, wy, e) {
    if (!state.symType) return;
    pushH();
    const sx = snap(wx), sy = snap(wy);
    const d  = getDef(state.symType) || {};
    state.elements.push({ id: genId('el'),
      type:   state.symType,
      x: sx, y: sy,
      rot:    0,
      flipH:  false,
      flipV:  false,
      label:  d.label || '',
      layer:  activeLayer(),
      wireNo: '',
      note:   '',
    });
    state.preview = null;
  },

  onMove(wx, wy, e) {
    const sx = snap(wx), sy = snap(wy);
    state.preview = { type:'sym_preview', symType: state.symType, x: sx, y: sy };
  },

  onUp(wx, wy, e) {},

  onHover(wx, wy, e) {
    const sx = snap(wx), sy = snap(wy);
    state.preview = { type:'sym_preview', symType: state.symType, x: sx, y: sy };
  }
};

// ----------------------------------------------------------------
// テキストツール
// ----------------------------------------------------------------
const textTool = {
  onDown(wx, wy, e) {
    const text = prompt('テキスト:',''); if (!text) return;
    pushH();
    state.elements.push({ id: genId('el'), type:'text', x:snap(wx), y:snap(wy), text, fs:14, layer:activeLayer() });
    state.preview = null;
  },
  onMove() {}, onUp() {}, onHover() {}
};

// ----------------------------------------------------------------
// 図形ツール（rect / circle / fline）
// ----------------------------------------------------------------
const shapeTool = {
  onDown(wx, wy, e) {
    if (!state.mouse.shapeStart) {
      state.mouse.shapeStart = { x: snap(wx), y: snap(wy) };
    } else {
      const p1 = state.mouse.shapeStart;
      const p2 = { x: snap(wx), y: snap(wy) };
      pushH();
      if (state.mode === 'rect') {
        state.elements.push({ id: genId('el'), type:'rect', x:Math.min(p1.x,p2.x), y:Math.min(p1.y,p2.y), w:Math.abs(p2.x-p1.x), h:Math.abs(p2.y-p1.y), layer:activeLayer() });
      } else if (state.mode === 'circle') {
        state.elements.push({ id: genId('el'), type:'circle', x:p1.x, y:p1.y, r:Math.hypot(p2.x-p1.x,p2.y-p1.y), layer:activeLayer() });
      } else if (state.mode === 'fline') {
        state.elements.push({ id: genId('el'), type:'fline', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, layer:activeLayer() });
      }
      state.mouse.shapeStart = null;
      state.preview = null;
    }
  },

  onMove(wx, wy, e) {
    if (!state.mouse.shapeStart) return;
    const p1 = state.mouse.shapeStart;
    const p2 = { x: snap(wx), y: snap(wy) };
    state.preview = { type:'shape_preview', shapeMode: state.mode, p1, p2 };
  },

  onUp(wx, wy, e) {},

  onHover(wx, wy, e) {
    if (!state.mouse.shapeStart) return;
    const p1 = state.mouse.shapeStart;
    const p2 = { x: snap(wx), y: snap(wy) };
    state.preview = { type:'shape_preview', shapeMode: state.mode, p1, p2 };
  }
};

// ----------------------------------------------------------------
// ツールマップ
// ----------------------------------------------------------------
const TOOLS = {
  select: selectTool,
  wire:   wireTool,
  sym:    symTool,
  text:   textTool,
  rect:   shapeTool,
  circle: shapeTool,
  fline:  shapeTool,
};

// ----------------------------------------------------------------
// ヒットテスト
// ----------------------------------------------------------------
function hitTest(wx, wy) {
  const R = 8 / state.zoom;
  for (let i = state.elements.length-1; i >= 0; i--) {
    const el = state.elements[i];
    const d  = getDef(el.type);
    if (!d) continue;
    if (el.type === 'text')   { const hw = Math.min(200, (el.text||'').length * (el.fs||14) * 0.55); const hh = (el.fs||14) * 0.8; if (wx>=el.x && wx<=el.x+hw && wy>=el.y-hh && wy<=el.y+2) return el; }
    else if (el.type === 'fline') { if (distToSeg(wx,wy,el.x1,el.y1,el.x2,el.y2) < R) return el; }
    else if (el.type === 'rect')  { if (wx>=el.x&&wx<=el.x+el.w&&wy>=el.y&&wy<=el.y+el.h) return el; }
    else if (el.type === 'circle'){ if (Math.abs(Math.hypot(wx-el.x,wy-el.y)-el.r) < R) return el; }
    else { if (Math.abs(wx-el.x)<(d.w/2+R) && Math.abs(wy-el.y)<(d.h/2+R)) return el; }
  }
  return null;
}

function hitTestWire(wx, wy) {
  const R = 6 / state.zoom;
  for (let i = state.wires.length-1; i >= 0; i--) {
    const w = state.wires[i];
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
    // テキストの表示領域: x方向=el.x〜el.x+tw, y方向=el.y-th〜el.y
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
    if (el.x != null)  group.push({ el, ox: el.x, oy: el.y });
    if (el.x1 != null) group.push({ el, ox1: el.x1, oy1: el.y1, ox2: el.x2, oy2: el.y2 });
  });
  selWires.forEach(w => {
    const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
    group.push({ el: w, opts: JSON.parse(JSON.stringify(pts)) });
  });
  return group;
}

// ----------------------------------------------------------------
// リサイズハンドル
// ----------------------------------------------------------------
function updateResizeHandles() {
  document.querySelectorAll('.resize-handle, .grp-resize-handle').forEach(h => h.remove());
  const { els, wires } = state.sel;
  if (els.size + wires.size >= 2) {
    drawGroupResizeHandles();
  } else if (els.size === 1) {
    drawResizeHandles([...els][0]);
  }
}

function drawResizeHandles(el) {
  const d = getDef(el.type); if (!d || d.w === 0) return;
  const rot = (el.rot||0)*Math.PI/180;
  const hw = d.w/2+8, hh = d.h/2+8;
  [[-hw,-hh,'nw'],[hw,-hh,'ne'],[hw,hh,'se'],[-hw,hh,'sw']].forEach(([lx,ly,hid]) => {
    const rx = lx*Math.cos(rot)-ly*Math.sin(rot);
    const ry = lx*Math.sin(rot)+ly*Math.cos(rot);
    const cp = tc(el.x+rx, el.y+ry);
    const div = document.createElement('div');
    div.className = 'resize-handle';
    div.style.left = (cp.x-4)+'px'; div.style.top = (cp.y-4)+'px';
    div.dataset.handle = hid;
    div.addEventListener('mousedown', ev => { ev.stopPropagation(); startElResize(el, hid, ev); });
    document.getElementById('cw').appendChild(div);
  });
}

function drawGroupResizeHandles() {
  const selEls   = state.elements.filter(el => state.sel.els.has(el.id));
  const selWires = state.wires.filter(w    => state.sel.wires.has(w.id));
  const b = getGroupBounds(selEls, selWires);
  if (!b || b.w < 1 || b.h < 1) return;
  [['nw',b.x,b.y,'nw-resize'],['ne',b.x+b.w,b.y,'ne-resize'],
   ['sw',b.x,b.y+b.h,'sw-resize'],['se',b.x+b.w,b.y+b.h,'se-resize']].forEach(([hid,wx,wy,cur]) => {
    const cp = tc(wx, wy);
    const div = document.createElement('div');
    div.className = 'resize-handle grp-resize-handle';
    div.style.left = (cp.x-5)+'px'; div.style.top = (cp.y-5)+'px';
    div.style.cursor = cur;
    div.dataset.handle = hid;
    div.addEventListener('mousedown', ev => { ev.stopPropagation(); startGroupResize(hid, ev, b); });
    document.getElementById('cw').appendChild(div);
  });
}

function getGroupBounds(els, wires) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  els.forEach(el => {
    if (el.type==='rect') { minX=Math.min(minX,el.x); minY=Math.min(minY,el.y); maxX=Math.max(maxX,el.x+el.w); maxY=Math.max(maxY,el.y+el.h); }
    else if (el.type==='circle') { minX=Math.min(minX,el.x-el.r); minY=Math.min(minY,el.y-el.r); maxX=Math.max(maxX,el.x+el.r); maxY=Math.max(maxY,el.y+el.r); }
    else if (el.x1!=null) { minX=Math.min(minX,el.x1,el.x2); minY=Math.min(minY,el.y1,el.y2); maxX=Math.max(maxX,el.x1,el.x2); maxY=Math.max(maxY,el.y1,el.y2); }
    else if (el.x!=null) {
      if (el.type==='text') {
        const tw=(el.text||'').length*(el.fs||14)*0.6, th=(el.fs||14);
        minX=Math.min(minX,el.x); minY=Math.min(minY,el.y-th);
        maxX=Math.max(maxX,el.x+tw); maxY=Math.max(maxY,el.y);
      } else {
        const d=getDef(el.type)||{}; const hw=(d.w||20)/2,hh=(d.h||20)/2;
        minX=Math.min(minX,el.x-hw); minY=Math.min(minY,el.y-hh);
        maxX=Math.max(maxX,el.x+hw); maxY=Math.max(maxY,el.y+hh);
      }
    }
  });
  wires.forEach(w => (w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(p => { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }));
  if (!isFinite(minX)) return null;
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}

function startElResize(el, hid, e) {
  state.resize = { el, handle: hid, orig: JSON.parse(JSON.stringify(el)) };
  const r = cv.getBoundingClientRect();
  const onMove = e2 => {
    const {x:wx,y:wy} = tw(e2.clientX-r.left, e2.clientY-r.top);
    applyElResize(wx, wy); draw(); drawResizeHandles(el);
  };
  const onUp = () => { if (state.resize.el) pushH(); state.resize = {el:null,handle:'',orig:null}; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); draw(); updateResizeHandles(); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyElResize(wx, wy) {
  const { el, handle, orig } = state.resize;
  if (!el) return;
  if (el.type === 'rect') {
    if (handle==='se') { el.w=Math.max(10,snap(wx)-orig.x); el.h=Math.max(10,snap(wy)-orig.y); }
    else if (handle==='sw') { const nx=snap(wx); el.x=nx; el.w=Math.max(10,orig.x+orig.w-nx); el.h=Math.max(10,snap(wy)-orig.y); }
    else if (handle==='ne') { el.w=Math.max(10,snap(wx)-orig.x); const ny=snap(wy); el.y=ny; el.h=Math.max(10,orig.y+orig.h-ny); }
    else if (handle==='nw') { const nx=snap(wx),ny=snap(wy); el.x=nx; el.y=ny; el.w=Math.max(10,orig.x+orig.w-nx); el.h=Math.max(10,orig.y+orig.h-ny); }
  } else if (el.type === 'circle') {
    el.r = Math.max(5, Math.hypot(wx-orig.x, wy-orig.y));
  } else {
    const d = getDef(el.type); if (!d) return;
    const dist = Math.hypot(wx-orig.x, wy-orig.y);
    const origDist = Math.hypot(d.w/2+8, d.h/2+8);
    el.scale = Math.max(0.3, Math.min(5, dist/origDist));
  }
}

function startGroupResize(hid, e, bounds) {
  const elRefs   = state.elements.filter(el => state.sel.els.has(el.id));
  const wireRefs = state.wires.filter(w    => state.sel.wires.has(w.id));
  state.groupResize = { active:true, handle:hid, orig:{ bounds:{...bounds}, els:elRefs.map(el=>JSON.parse(JSON.stringify(el))), wires:wireRefs.map(w=>JSON.parse(JSON.stringify(w))), elRefs, wireRefs } };
  const r = cv.getBoundingClientRect();
  const onMove = e2 => { const {x:wx,y:wy}=tw(e2.clientX-r.left,e2.clientY-r.top); applyGroupResize(wx,wy); draw(); drawGroupResizeHandles(); };
  const onUp = () => { if (state.groupResize.active) pushH(); state.groupResize={active:false,handle:'',orig:null}; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); draw(); updateResizeHandles(); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyGroupResize(wx, wy) {
  const { orig, handle } = state.groupResize;
  const ob = orig.bounds;
  let anchorX, anchorY, newW, newH;
  if (handle==='se') { anchorX=ob.x; anchorY=ob.y; newW=wx-ob.x; newH=wy-ob.y; }
  if (handle==='sw') { anchorX=ob.x+ob.w; anchorY=ob.y; newW=ob.x+ob.w-wx; newH=wy-ob.y; }
  if (handle==='ne') { anchorX=ob.x; anchorY=ob.y+ob.h; newW=wx-ob.x; newH=ob.y+ob.h-wy; }
  if (handle==='nw') { anchorX=ob.x+ob.w; anchorY=ob.y+ob.h; newW=ob.x+ob.w-wx; newH=ob.y+ob.h-wy; }
  newW=Math.max(20,newW); newH=Math.max(20,newH);
  const sx=newW/ob.w, sy=newH/ob.h;
  orig.elRefs.forEach((el,i)=>{ const o=orig.els[i];
    if(el.type==='rect'){el.x=anchorX+(o.x-anchorX)*sx;el.y=anchorY+(o.y-anchorY)*sy;el.w=o.w*sx;el.h=o.h*sy;}
    else if(el.type==='circle'){el.x=anchorX+(o.x-anchorX)*sx;el.y=anchorY+(o.y-anchorY)*sy;el.r=o.r*(sx+sy)/2;}
    else if(el.x1!=null){el.x1=anchorX+(o.x1-anchorX)*sx;el.y1=anchorY+(o.y1-anchorY)*sy;el.x2=anchorX+(o.x2-anchorX)*sx;el.y2=anchorY+(o.y2-anchorY)*sy;}
    else if(el.x!=null){el.x=anchorX+(o.x-anchorX)*sx;el.y=anchorY+(o.y-anchorY)*sy;}
  });
  orig.wireRefs.forEach((w,i)=>{ const o=orig.wires[i];
    const pts=(o.pts||[{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]).map(p=>({x:anchorX+(p.x-anchorX)*sx,y:anchorY+(p.y-anchorY)*sy}));
    w.pts=pts;w.x1=pts[0].x;w.y1=pts[0].y;w.x2=pts[pts.length-1].x;w.y2=pts[pts.length-1].y;
  });
}

// ----------------------------------------------------------------
// 寸法線ツール
// ----------------------------------------------------------------
const dimTool = {
  onDown(wx, wy, e) {
    const sx = snap(wx), sy = snap(wy);
    if (!state.dimState) {
      state.dimState = { step:1, x1:sx, y1:sy };
    } else if (state.dimState.step === 1) {
      state.dimState.x2 = sx; state.dimState.y2 = sy; state.dimState.step = 2;
    } else if (state.dimState.step === 2) {
      const ds = state.dimState;
      const dx = ds.x2-ds.x1, dy = ds.y2-ds.y1, len = Math.hypot(dx, dy);
      if (len < 0.1) { state.dimState = null; return; }
      const px=-dy/len, py=dx/len;
      const mx=(ds.x1+ds.x2)/2, my=(ds.y1+ds.y2)/2;
      const dot=(sx-mx)*px+(sy-my)*py;
      const sign = dot >= 0 ? 1 : -1;
      const offset = Math.max(15, Math.abs(dot));
      const dist = Math.round(len);
      const txt = prompt('寸法テキスト（空欄で自動）:', '') ?? '';
      pushH();
      state.elements.push({ id: genId('el'), type:'dim', x1:ds.x1, y1:ds.y1, x2:ds.x2, y2:ds.y2,
        dimText: txt || String(dist), offset, offsetSign:sign,
        arrowSz:8, layer:activeLayer(), x:(ds.x1+ds.x2)/2, y:(ds.y1+ds.y2)/2 });
      state.dimState = null; state.preview = null;
    }
  },
  onMove(wx, wy) {
    const sx = snap(wx), sy = snap(wy);
    const ds = state.dimState;
    if (!ds) return;
    if (ds.step === 1) {
      state.preview = { type:'dim_prev1', x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
    } else if (ds.step === 2) {
      const dx=ds.x2-ds.x1, dy=ds.y2-ds.y1, len=Math.hypot(dx,dy);
      if (len < 0.1) return;
      const px=-dy/len, py=dx/len;
      const mx=(ds.x1+ds.x2)/2, my=(ds.y1+ds.y2)/2;
      const dot=(sx-mx)*px+(sy-my)*py;
      state.preview = { type:'dim_prev2', x1:ds.x1, y1:ds.y1, x2:ds.x2, y2:ds.y2,
        dimText:String(Math.round(len)), offset:Math.max(15,Math.abs(dot)), offsetSign:dot>=0?1:-1, arrowSz:8 };
    }
  },
  onUp() {}, onHover(wx, wy) { this.onMove(wx, wy); }
};

// ----------------------------------------------------------------
// 引出線ツール
// ----------------------------------------------------------------
const leaderTool = {
  onDown(wx, wy, e) {
    const sx = snap(wx), sy = snap(wy);
    if (!state.dimState) {
      state.dimState = { step:1, x1:sx, y1:sy };
    } else if (state.dimState.step === 1) {
      state.dimState.bx = sx; state.dimState.by = sy; state.dimState.step = 2;
    } else if (state.dimState.step === 2) {
      const ds = state.dimState;
      const txt = prompt('引出線テキスト:', '') ?? '';
      pushH();
      state.elements.push({ id: genId('el'), type:'leader', x1:ds.x1, y1:ds.y1,
        bx:ds.bx, by:ds.by, x2:sx, y2:sy,
        leaderText:txt, layer:activeLayer(), x:(ds.x1+sx)/2, y:(ds.y1+sy)/2 });
      state.dimState = null; state.preview = null;
    }
  },
  onMove(wx, wy) {
    const sx = snap(wx), sy = snap(wy);
    const ds = state.dimState;
    if (!ds) return;
    if (ds.step === 1) state.preview = { type:'leader_prev1', x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
    else if (ds.step === 2) state.preview = { type:'leader_prev2', x1:ds.x1, y1:ds.y1, bx:ds.bx, by:ds.by, x2:sx, y2:sy };
  },
  onUp() {}, onHover(wx, wy) { this.onMove(wx, wy); }
};

// ----------------------------------------------------------------
// ツールマップに追加
// ----------------------------------------------------------------
TOOLS.dim    = dimTool;
TOOLS.leader = leaderTool;
