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
      const dist = Math.round(len);
      const txt = prompt('寸法テキスト（空欄で自動）:', '') ?? '';
      state.mouse.down = false;  // promptのOK後にmouseupがcanvasに届かないためリセット
      pushH();
      state.elements.push({ id: genId('el'), type:'dim', x1:ds.x1, y1:ds.y1, x2:ds.x2, y2:ds.y2,
        dimText: txt || String(dist), offset, offsetSign:sign,
        arrowSz:8, layer:activeLayer(), x:(ds.x1+ds.x2)/2, y:(ds.y1+ds.y2)/2 });
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
// ツールマップに追加
// ----------------------------------------------------------------
TOOLS.dim    = dimTool;
TOOLS.leader = leaderTool;
