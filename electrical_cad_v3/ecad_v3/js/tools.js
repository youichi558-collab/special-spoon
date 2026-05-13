// ================================================================
// tools.js — ツールごとの状態遷移処理
// ツールはstateを更新するだけ。描画はdraw.jsが行う。
// スナップ補助 → snap.js
// ヒットテスト → hit_test.js
// リサイズ     → resize.js
// ================================================================

// ----------------------------------------------------------------
// 選択ツール
// ----------------------------------------------------------------
const selectTool = {
  onDown(wx, wy, e) {
    // ワイヤーを先に判定（leaderより優先）
    const wire = hitTestWire(wx, wy);
    const el = wire ? null : hitTest(wx, wy);

    if (!el && !wire) {
      if (!e.shiftKey) { state.sel.els.clear(); state.sel.wires.clear(); }
      state.mouse.selboxing = true;
      updateRightPanel();
      return;
    }

    if (!e.shiftKey && !state.sel.els.has(el?.id) && !state.sel.wires.has(wire?.id)) {
      state.sel.els.clear(); state.sel.wires.clear();
    }
    if (el)   state.sel.els.add(el.id);
    if (wire) state.sel.wires.add(wire.id);

    state.mouse.dragging  = true;
    state.mouse.dragMoved = false;
    state.mouse.dragHistPushed = false;
    state.mouse.dragGroup = buildDragGroup();
    updateRightPanel();
    updateResizeHandles();
  },

  onMove(wx, wy, e) {
    if (state.mouse.selboxing) { draw(); return; }
    if (!state.mouse.dragging) return;

    const dx = wx - state.mouse.startWx;
    const dy = wy - state.mouse.startWy;
    if (!state.mouse.dragMoved && Math.hypot(dx, dy) < 2/state.zoom) return;

    state.mouse.dragMoved = true;
    if (state.mouse.dragMoved && !state.mouse.dragHistPushed) {
      pushH();
      state.mouse.dragHistPushed = true;
    }
    state.mouse.dragGroup.forEach(({ el, ox, oy, obx, oby, ox1, oy1, ox2, oy2, opts }) => {
      if (el.x != null) {
        el.x = snap(ox+dx); el.y = snap(oy+dy);
        if (obx != null) { el.bx = snap(obx+dx); el.by = snap(oby+dy); }
      }
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
      const crossing = wx < state.mouse.startWx; // 右→左なら交差選択
      const sx = Math.min(state.mouse.startWx, wx);
      const ex = Math.max(state.mouse.startWx, wx);
      const sy = Math.min(state.mouse.startWy, wy);
      const ey = Math.max(state.mouse.startWy, wy);
      if (!e.shiftKey) { state.sel.els.clear(); state.sel.wires.clear(); }
      state.elements.forEach(el => { if (inBox(el, sx, sy, ex, ey, crossing)) state.sel.els.add(el.id); });
      state.wires.forEach(w => { if (wireInBox(w, sx, sy, ex, ey, crossing)) state.sel.wires.add(w.id); });
      state.mouse.selboxing = false;
      updateRightPanel();
      updateResizeHandles();
      return;
    }
    if (state.mouse.dragging) {
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
      const pts = [...state.wirePoints];
      pushH();
      state.wires.push({ id: genId('w'),
        pts, x1: pts[0].x, y1: pts[0].y,
        x2: pts[pts.length-1].x, y2: pts[pts.length-1].y,
        layer: activeLayer(), wireNo: '',
      });
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
      partRef: state.pendingRef || '',
      terminals: state.pendingTerm || '',
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
    state.mouse.down = false; state.mouse.dragging = false;
    pushH();
    state.elements.push({ id: genId('el'), type:'text', x:snap(wx), y:snap(wy), text, fs:(LAYERS.find(l=>l.active)?.fontSize||14), layer:activeLayer() });
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
// ----------------------------------------------------------------
// 半円ツール（arc）- 端点1→端点2→マウス位置で上下向き→クリック確定
// ----------------------------------------------------------------
const arcTool = {
  onDown(wx, wy) {
    let p = getAllSnapPoints(wx, wy);
    if (!state.mouse.arcP1) {
      state.mouse.arcP1 = p;
    } else if (!state.mouse.arcP2) {
      // 直交モードなら端点1から水平/垂直に拘束
      if (state.ortho) { const o = applyOrtho(state.mouse.arcP1.x, state.mouse.arcP1.y, p.x, p.y); p = {x:o.x, y:o.y}; }
      const r = Math.hypot(p.x-state.mouse.arcP1.x, p.y-state.mouse.arcP1.y) / 2;
      if (r < 1) { state.mouse.arcP1 = null; state.preview = null; return; }
      state.mouse.arcP2 = p;
    } else {
      const p1 = state.mouse.arcP1, p2 = state.mouse.arcP2;
      const cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
      const r=Math.hypot(p2.x-p1.x,p2.y-p1.y)/2;
      const nx=-(p2.y-p1.y), ny=p2.x-p1.x;
      const side = nx*(wx-cx)+ny*(wy-cy) >= 0 ? 1 : -1;
      const a1=Math.atan2(p1.y-cy,p1.x-cx);
      const a2=Math.atan2(p2.y-cy,p2.x-cx);
      pushH();
      state.elements.push({ id: genId('el'), type:'arc',
        x:cx, y:cy, r, startA:a1, endA:a2, ccw: side > 0,
        layer: activeLayer() });
      state.mouse.arcP1 = null; state.mouse.arcP2 = null; state.preview = null;
    }
  },
  onMove(wx, wy) {
    if (!state.mouse.arcP1) return;
    const p1 = state.mouse.arcP1;
    if (!state.mouse.arcP2) {
      let ex = wx, ey = wy;
      if (state.ortho) { const o = applyOrtho(p1.x, p1.y, wx, wy); ex=o.x; ey=o.y; }
      state.preview = { type:'arc_preview_line', x1:p1.x, y1:p1.y, x2:ex, y2:ey };
      return;
    }
    const p2 = state.mouse.arcP2;
    const cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
    const r=Math.hypot(p2.x-p1.x,p2.y-p1.y)/2;
    const nx=-(p2.y-p1.y), ny=p2.x-p1.x;
    const side = nx*(wx-cx)+ny*(wy-cy) >= 0 ? 1 : -1;
    const a1=Math.atan2(p1.y-cy,p1.x-cx);
    const a2=Math.atan2(p2.y-cy,p2.x-cx);
    state.preview = { type:'arc_preview', x:cx, y:cy, r, startA:a1, endA:a2, ccw: side > 0 };
  },
  onUp() {}, onHover(wx, wy) { this.onMove(wx, wy); }
};

// ----------------------------------------------------------------
// ジャンクションツール
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// 弧ツール（arc3）- 始点→終点→通過点の3クリックで任意弧
// ----------------------------------------------------------------
const arc3Tool = {
  onDown(wx, wy) {
    const p = getAllSnapPoints(wx, wy);
    if (!state.mouse.arc3P1) {
      state.mouse.arc3P1 = p;
    } else if (!state.mouse.arc3P2) {
      if (state.ortho) { const o = applyOrtho(state.mouse.arc3P1.x, state.mouse.arc3P1.y, p.x, p.y); state.mouse.arc3P2 = {x:o.x,y:o.y}; }
      else state.mouse.arc3P2 = p;
    } else {
      // 3点から外接円を計算
      const p1=state.mouse.arc3P1, p2=state.mouse.arc3P2, p3=p;
      const ax=p2.x-p1.x, ay=p2.y-p1.y;
      const bx=p3.x-p1.x, by=p3.y-p1.y;
      const D = 2*(ax*by - ay*bx);
      if (Math.abs(D) < 1e-6) { state.mouse.arc3P1=null; state.mouse.arc3P2=null; state.preview=null; return; }
      const cx = (by*(ax*ax+ay*ay) - ay*(bx*bx+by*by)) / D + p1.x;
      const cy = (ax*(bx*bx+by*by) - bx*(ax*ax+ay*ay)) / D + p1.y;
      const r  = Math.hypot(p1.x-cx, p1.y-cy);
      const a1 = Math.atan2(p1.y-cy, p1.x-cx);
      const a2 = Math.atan2(p2.y-cy, p2.x-cx);
      // p3が時計/反時計どちら側かでccwを決定
      const nx=-(p2.y-p1.y), ny=p2.x-p1.x;
      const ccw = nx*(p3.x-(p1.x+p2.x)/2)+ny*(p3.y-(p1.y+p2.y)/2) > 0;
      pushH();
      state.elements.push({ id:genId('el'), type:'arc', x:cx, y:cy, r, startA:a1, endA:a2, ccw, layer:activeLayer() });
      state.mouse.arc3P1=null; state.mouse.arc3P2=null; state.preview=null;
    }
  },
  onMove(wx, wy) {
    if (!state.mouse.arc3P1) return;
    const p1 = state.mouse.arc3P1;
    if (!state.mouse.arc3P2) {
      let ex=wx, ey=wy;
      if (state.ortho) { const o=applyOrtho(p1.x,p1.y,wx,wy); ex=o.x; ey=o.y; }
      state.preview = { type:'arc_preview_line', x1:p1.x, y1:p1.y, x2:ex, y2:ey };
      return;
    }
    const p2 = state.mouse.arc3P2;
    const ax=p2.x-p1.x, ay=p2.y-p1.y;
    const bx=wx-p1.x,   by=wy-p1.y;
    const D = 2*(ax*by - ay*bx);
    if (Math.abs(D) < 1e-6) return;
    const cx = (by*(ax*ax+ay*ay) - ay*(bx*bx+by*by)) / D + p1.x;
    const cy = (ax*(bx*bx+by*by) - bx*(ax*ax+ay*ay)) / D + p1.y;
    const r  = Math.hypot(p1.x-cx, p1.y-cy);
    const a1 = Math.atan2(p1.y-cy, p1.x-cx);
    const a2 = Math.atan2(p2.y-cy, p2.x-cx);
    const nx=-(p2.y-p1.y), ny=p2.x-p1.x;
    const ccw = nx*(wx-(p1.x+p2.x)/2)+ny*(wy-(p1.y+p2.y)/2) > 0;
    state.preview = { type:'arc_preview', x:cx, y:cy, r, startA:a1, endA:a2, ccw };
  },
  onUp() {}, onHover(wx, wy) { this.onMove(wx, wy); }
};

// ----------------------------------------------------------------
// 三角形ツール（triangle）- 3点クリックで確定、Shiftで正三角形
// ----------------------------------------------------------------
const triTool = {
  _equilateral(p1, p2, mx, my) {
    // p1-p2の底辺に対して正三角形の3点目を計算（マウス位置mx,myで向き決定）
    const dx=p2.x-p1.x, dy=p2.y-p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return {x:mx, y:my};
    const nx=-dy/len, ny=dx/len; // 法線（単位）
    const cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
    const h = len * Math.sqrt(3) / 2;
    const side = nx*(mx-cx)+ny*(my-cy) >= 0 ? 1 : -1;
    return { x: cx + nx*h*side, y: cy + ny*h*side };
  },
  onDown(wx, wy, e) {
    const p = getAllSnapPoints(wx, wy);
    if (!state.mouse.triP1) {
      state.mouse.triP1 = p;
    } else if (!state.mouse.triP2) {
      let p2 = p;
      if (state.ortho) { const o = applyOrtho(state.mouse.triP1.x, state.mouse.triP1.y, p.x, p.y); p2 = {x:o.x, y:o.y}; }
      state.mouse.triP2 = p2;
    } else {
      const p3 = e?.shiftKey ? this._equilateral(state.mouse.triP1, state.mouse.triP2, wx, wy) : p;
      pushH();
      state.elements.push({ id:genId('el'), type:'triangle',
        x1:state.mouse.triP1.x, y1:state.mouse.triP1.y,
        x2:state.mouse.triP2.x, y2:state.mouse.triP2.y,
        x3:p3.x, y3:p3.y, layer:activeLayer() });
      state.mouse.triP1 = null; state.mouse.triP2 = null; state.preview = null;
    }
  },
  onMove(wx, wy, e) {
    if (!state.mouse.triP1) return;
    const p1 = state.mouse.triP1;
    if (!state.mouse.triP2) {
      let ex=wx, ey=wy;
      if (state.ortho) { const o=applyOrtho(p1.x,p1.y,wx,wy); ex=o.x; ey=o.y; }
      state.preview = { type:'tri_preview', p1, p2:{x:ex,y:ey}, p3:null };
      return;
    }
    const p2 = state.mouse.triP2;
    const p3 = e?.shiftKey ? this._equilateral(p1, p2, wx, wy) : {x:wx, y:wy};
    state.preview = { type:'tri_preview', p1, p2, p3 };
  },
  onUp() {}, onHover(wx, wy, e) { this.onMove(wx, wy, e); }
};

const junctionTool = {  onDown(wx, wy) {
    const p = getAllSnapPoints(wx, wy);
    pushH();
    state.elements.push({ id: genId('el'), type:'junction', x:p.x, y:p.y, layer: activeLayer() });
  },
  onMove() {}, onUp() {}, onHover() {}
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
  arc:    arcTool,
  arc3:   arc3Tool,
  triangle: triTool,
  junction: junctionTool,
};

// ----------------------------------------------------------------
// 寸法線ツール
// ----------------------------------------------------------------
const dimTool = {
  onDown(wx, wy, e) {
    const pt = getAllSnapPoints(wx, wy);
    const sx = pt.x, sy = pt.y;
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
      const dist = Math.round(len * (state.drawScale||1));
      const txt = prompt('寸法テキスト（空欄で自動）:', '') ?? '';
      state.mouse.down = false; state.mouse.dragging = false;
      state.mouse.down = false;
      pushH();
      const def = state.dimDef;
      state.elements.push({ id: genId('el'), type:'dim', x1:ds.x1, y1:ds.y1, x2:ds.x2, y2:ds.y2,
        dimText: txt || String(dist), offset, offsetSign:sign,
        arrowSz:8, layer:'寸法', x:(ds.x1+ds.x2)/2, y:(ds.y1+ds.y2)/2,
        dimFs: def.fs, dimTx: def.tx, dimTy: def.ty,
        gap: def.gap, ext: def.ext, color: def.color,
        arrowStyle: def.arrowStyle||'filled', arrowSz: def.arrowSz||8 });
      state.dimState = null; state.preview = null;
    }
  },
  onMove(wx, wy) {
    const pt = getAllSnapPoints(wx, wy);
    const sx = pt.x, sy = pt.y;
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
    const pt = getAllSnapPoints(wx, wy);
    const sx = pt.x, sy = pt.y;
    if (!state.dimState) {
      state.dimState = { step:1, x1:sx, y1:sy };
    } else if (state.dimState.step === 1) {
      state.dimState.bx = sx; state.dimState.by = sy; state.dimState.step = 2;
    } else if (state.dimState.step === 2) {
      const ds = state.dimState;
      const txt = prompt('引出線テキスト:', '') ?? '';
      state.mouse.down = false; state.mouse.dragging = false;
      state.mouse.down = false;  // promptのOK後にmouseupがcanvasに届かないためリセット
      pushH();
      state.elements.push({ id: genId('el'), type:'leader', x1:ds.x1, y1:ds.y1,
        bx:ds.bx, by:ds.by, x2:sx, y2:sy,
        leaderText:txt, layer:activeLayer(), x:(ds.x1+sx)/2, y:(ds.y1+sy)/2 });
      state.dimState = null; state.preview = null;
    }
  },
  onMove(wx, wy) {
    const pt = getAllSnapPoints(wx, wy);
    const sx = pt.x, sy = pt.y;
    const ds = state.dimState;
    if (!ds) return;
    if (ds.step === 1) state.preview = { type:'leader_prev1', x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
    else if (ds.step === 2) state.preview = { type:'leader_prev2', x1:ds.x1, y1:ds.y1, bx:ds.bx, by:ds.by, x2:sx, y2:sy };
  },
  onUp() {}, onHover(wx, wy) { this.onMove(wx, wy); }
};

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// 角度寸法線ツール (angle_dim): 頂点→点1→点2の3点クリック
// ----------------------------------------------------------------
const angleDimTool = {
  onDown(wx, wy) {
    const sx=snap(wx), sy=snap(wy);
    if (!state.angleDimState) {
      state.angleDimState = { step:1, cx:sx, cy:sy };
    } else if (state.angleDimState.step === 1) {
      state.angleDimState.x1 = sx; state.angleDimState.y1 = sy;
      state.angleDimState.step = 2;
    } else {
      const ds = state.angleDimState;
      const a1 = Math.atan2(ds.y1-ds.cy, ds.x1-ds.cx);
      const a2 = Math.atan2(sy-ds.cy, sx-ds.cx);
      let deg = (a2-a1)*180/Math.PI;
      if (deg < 0) deg += 360;
      if (deg > 180) deg = 360-deg;
      const r = Math.min(
        Math.hypot(ds.x1-ds.cx, ds.y1-ds.cy),
        Math.hypot(sx-ds.cy, sy-ds.cy)
      ) * 0.5 + 20;
      const def = state.dimDef || {};
      pushH();
      state.elements.push({
        id: genId('el'), type: 'angle_dim',
        cx: ds.cx, cy: ds.cy,
        x1: ds.x1, y1: ds.y1,
        x2: sx, y2: sy,
        r, dimText: Math.round(deg*10)/10 + '°',
        layer: '寸法', dimFs: def.fs||11,
        x: ds.cx, y: ds.cy
      });
      state.angleDimState = null; state.preview = null;
      setMode('select');
    }
  },
  onMove(wx, wy) {
    const ds = state.angleDimState;
    if (!ds) return;
    const sx=snap(wx), sy=snap(wy);
    if (ds.step === 1) state.preview = { type:'angle_dim_prev1', cx:ds.cx, cy:ds.cy, x1:sx, y1:sy };
    else               state.preview = { type:'angle_dim_prev2', cx:ds.cx, cy:ds.cy, x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
  },
  onUp() {},
  onHover(wx, wy) { this.onMove(wx, wy); }
};

TOOLS.dim    = dimTool;
TOOLS.leader = leaderTool;
TOOLS.angle_dim = angleDimTool;
