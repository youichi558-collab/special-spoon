// ================================================================
// resize.js — リサイズハンドル管理（canvas描画方式）
// ================================================================

// ハンドル情報をstateに保持
function updateResizeHandles() {
  state.resizeHandles = calcResizeHandles();
}

function calcResizeHandles() {
  const { els, wires } = state.sel;
  if (els.size + wires.size >= 2) return calcGroupHandles();
  if (els.size === 1) return calcElHandles([...els][0]);
  return [];
}

function calcElHandles(elId) {
  const el = state.elements.find(e => e.id === elId);
  if (!el) return [];
  if (el.type === 'rect') {
    const x=el.x, y=el.y, w=el.w||10, h=el.h||10;
    return [
      { wx:x,     wy:y,     hid:'nw', el },
      { wx:x+w,   wy:y,     hid:'ne', el },
      { wx:x+w,   wy:y+h,   hid:'se', el },
      { wx:x,     wy:y+h,   hid:'sw', el },
    ];
  }
  if (el.type === 'circle') {
    const r = (el.r||10)+8;
    return [
      { wx:el.x,   wy:el.y-r, hid:'n', el },
      { wx:el.x+r, wy:el.y,   hid:'e', el },
      { wx:el.x,   wy:el.y+r, hid:'s', el },
      { wx:el.x-r, wy:el.y,   hid:'w', el },
    ];
  }
  const d = getDef(el.type);
  if (!d || d.w === 0) return [];
  const rot = (el.rot||0)*Math.PI/180;
  const sc = el.scale||1;
  const hw = d.w*sc/2+8, hh = d.h*sc/2+8;
  return [[-hw,-hh,'nw'],[hw,-hh,'ne'],[hw,hh,'se'],[-hw,hh,'sw']].map(([lx,ly,hid]) => {
    const rx = lx*Math.cos(rot)-ly*Math.sin(rot);
    const ry = lx*Math.sin(rot)+ly*Math.cos(rot);
    return { wx:el.x+rx, wy:el.y+ry, hid, el };
  });
}

function calcGroupHandles() {
  const selEls   = state.elements.filter(el => state.sel.els.has(el.id));
  const selWires = state.wires.filter(w    => state.sel.wires.has(w.id));
  const b = getGroupBounds(selEls, selWires);
  if (!b || b.w < 1 || b.h < 1) return [];
  return [
    { wx:b.x,     wy:b.y,     hid:'nw', group:true, bounds:b },
    { wx:b.x+b.w, wy:b.y,     hid:'ne', group:true, bounds:b },
    { wx:b.x,     wy:b.y+b.h, hid:'sw', group:true, bounds:b },
    { wx:b.x+b.w, wy:b.y+b.h, hid:'se', group:true, bounds:b },
  ];
}

// canvas上にハンドルを描画（draw.jsから呼ぶ）
function drawResizeHandlesOnCanvas() {
  if (!state.resizeHandles || !state.resizeHandles.length) return;
  const z = state.zoom;
  state.resizeHandles.forEach(h => {
    const cp = tc(h.wx, h.wy);
    ctx.save();
    ctx.fillStyle = h.group ? '#e07000' : '#0067c0';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    const s = h.group ? 5 : 4;
    ctx.fillRect(cp.x-s, cp.y-s, s*2, s*2);
    ctx.strokeRect(cp.x-s, cp.y-s, s*2, s*2);
    ctx.restore();
  });
}

// ハンドルのヒットテスト（ワールド座標）
function hitResizeHandle(wx, wy) {
  if (!state.resizeHandles) return null;
  const R = 8 / state.zoom;
  return state.resizeHandles.find(h => Math.abs(wx-h.wx)<R && Math.abs(wy-h.wy)<R) || null;
}

function getGroupBounds(els, wires) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  els.forEach(el => {
    if (el.type==='rect') { minX=Math.min(minX,el.x); minY=Math.min(minY,el.y); maxX=Math.max(maxX,el.x+el.w); maxY=Math.max(maxY,el.y+el.h); }
    else if (el.type==='circle') { minX=Math.min(minX,el.x-el.r); minY=Math.min(minY,el.y-el.r); maxX=Math.max(maxX,el.x+el.r); maxY=Math.max(maxY,el.y+el.r); }
    else if (el.x1!=null) { const bx=el.bx??el.x2,by=el.by??el.y2; minX=Math.min(minX,el.x1,el.x2,bx); minY=Math.min(minY,el.y1,el.y2,by); maxX=Math.max(maxX,el.x1,el.x2,bx); maxY=Math.max(maxY,el.y1,el.y2,by); }
    else if (el.x!=null) {
      if (el.type==='text') { const tw=(el.text||'').length*(el.fs||14)*0.6,th=(el.fs||14); minX=Math.min(minX,el.x); minY=Math.min(minY,el.y-th); maxX=Math.max(maxX,el.x+tw); maxY=Math.max(maxY,el.y); }
      else { const d=getDef(el.type)||{}; const sc=el.scale||1; const hw=(d.w||20)*sc/2,hh=(d.h||20)*sc/2; minX=Math.min(minX,el.x-hw); minY=Math.min(minY,el.y-hh); maxX=Math.max(maxX,el.x+hw); maxY=Math.max(maxY,el.y+hh); }
    }
  });
  wires.forEach(w => (w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(p => { minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }));
  if (!isFinite(minX)) return null;
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}

function startElResize(h, e) {
  pushH();
  const el = h.el;
  state.resize = { el, handle: h.hid, orig: JSON.parse(JSON.stringify(el)) };
  const r = cv.getBoundingClientRect();
  const onMove = e2 => { const {x:wx,y:wy}=tw(e2.clientX-r.left,e2.clientY-r.top); applyElResize(wx,wy); draw(); updateResizeHandles(); };
  const onUp   = () => { state.resize={el:null,handle:'',orig:null}; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); draw(); updateResizeHandles(); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
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
    const origDist = Math.hypot(d.w*(orig.scale||1)/2+8, d.h*(orig.scale||1)/2+8);
    el.scale = Math.max(0.1, Math.min(5, (orig.scale||1) * dist/Math.max(origDist,1)));
  }
}

function startGroupResize(h, e) {
  pushH();
  const bounds = h.bounds;
  const elRefs   = state.elements.filter(el => state.sel.els.has(el.id));
  const wireRefs = state.wires.filter(w    => state.sel.wires.has(w.id));
  state.groupResize = { active:true, handle:h.hid, orig:{ bounds:{...bounds}, els:elRefs.map(el=>JSON.parse(JSON.stringify(el))), wires:wireRefs.map(w=>JSON.parse(JSON.stringify(w))), elRefs, wireRefs } };
  const r = cv.getBoundingClientRect();
  const onMove = e2 => { const {x:wx,y:wy}=tw(e2.clientX-r.left,e2.clientY-r.top); applyGroupResize(wx,wy); draw(); updateResizeHandles(); };
  const onUp   = () => { state.groupResize={active:false,handle:'',orig:null}; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); draw(); updateResizeHandles(); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
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
    else if(el.x1!=null){el.x1=anchorX+(o.x1-anchorX)*sx;el.y1=anchorY+(o.y1-anchorY)*sy;el.x2=anchorX+(o.x2-anchorX)*sx;el.y2=anchorY+(o.y2-anchorY)*sy;if(o.bx!=null){el.bx=anchorX+(o.bx-anchorX)*sx;el.by=anchorY+(o.by-anchorY)*sy;}}
    else if(el.x!=null){el.x=anchorX+(o.x-anchorX)*sx;el.y=anchorY+(o.y-anchorY)*sy;if(el.scale!=null)el.scale=(o.scale||1)*(sx+sy)/2;}
  });
  orig.wireRefs.forEach((w,i)=>{ const o=orig.wires[i];
    const pts=(o.pts||[{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]).map(p=>({x:anchorX+(p.x-anchorX)*sx,y:anchorY+(p.y-anchorY)*sy}));
    w.pts=pts;w.x1=pts[0].x;w.y1=pts[0].y;w.x2=pts[pts.length-1].x;w.y2=pts[pts.length-1].y;
  });
}
