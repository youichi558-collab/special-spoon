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
    // ジャンクションを最優先（ワイヤーと重なっていても選択できるよう）
    const junc = hitTestJunction(wx, wy);
    const wire = junc ? null : hitTestWire(wx, wy);
    const el   = junc || (wire ? null : hitTest(wx, wy));

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
    expandSelToGroups();

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
    // 移動量をグリッドスナップ（相対関係を保持）
    const sdx = snap(dx); const sdy = snap(dy);
    state.mouse.dragGroup.forEach(({ el, ox, oy, obx, oby, ox1, oy1, ox2, oy2, ox3, oy3, ocx, ocy, opts }) => {
      if (el.type === 'triangle') {
        el.x1=ox1+sdx; el.y1=oy1+sdy; el.x2=ox2+sdx; el.y2=oy2+sdy; el.x3=ox3+sdx; el.y3=oy3+sdy;
      } else if (el.type === 'angle_dim') {
        el.cx=ocx+sdx; el.cy=ocy+sdy; el.x1=ox1+sdx; el.y1=oy1+sdy; el.x2=ox2+sdx; el.y2=oy2+sdy;
      } else if (el.x != null) {
        el.x = ox + sdx; el.y = oy + sdy;
        if (obx != null) { el.bx = obx + sdx; el.by = oby + sdy; }
      } else if (el.x1 != null) {
        if (opts) {
          el.pts = opts.map(p => ({ x: p.x + sdx, y: p.y + sdy }));
          el.x1 = el.pts[0].x; el.y1 = el.pts[0].y;
          el.x2 = el.pts[el.pts.length-1].x; el.y2 = el.pts[el.pts.length-1].y;
        } else {
          el.x1 = ox1 + sdx; el.y1 = oy1 + sdy;
          el.x2 = ox2 + sdx; el.y2 = oy2 + sdy;
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
      expandSelToGroups();
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
    // スナップ先の端子情報を記録
    if (!state.wireSnapPts) state.wireSnapPts = [];
    state.wireSnapPts.push(sp.snapType === 'terminal' ? { elId: sp.elId, termIdx: sp.termIdx } : null);
    if (state.wirePoints.length >= 2) {
      const pts = [...state.wirePoints];
      const snaps = state.wireSnapPts || [];
      const fromSnap = snaps[0];
      const toSnap   = snaps[snaps.length - 1];
      pushH();
      state.wires.push({ id: genId('w'),
        pts, x1: pts[0].x, y1: pts[0].y,
        x2: pts[pts.length-1].x, y2: pts[pts.length-1].y,
        layer: activeLayer(), wireNo: '',
        fromElId:   fromSnap?.elId   || '',
        fromTermIdx:fromSnap?.termIdx ?? '',
        toElId:     toSnap?.elId     || '',
        toTermIdx:  toSnap?.termIdx  ?? '',
      });
      state.wirePoints = [{ x: sp.x, y: sp.y }];
      state.wireSnapPts = [sp.snapType === 'terminal' ? { elId: sp.elId, termIdx: sp.termIdx } : null];
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
    const sx = snap(wx), sy = snap(wy);
    state.mouse.down = false; state.mouse.dragging = false;

    // キャンバス上にインライン入力を表示
    const cv2 = document.getElementById('cv');
    const r   = cv2.getBoundingClientRect();
    const px  = sx * state.zoom + state.pan.x + r.left;
    const py  = sy * state.zoom + state.pan.y + r.top;
    const fs  = LAYERS.find(l=>l.active)?.fontSize || 14;

    // プレビュー用に仮要素を追加
    const previewEl = { id:'__text_preview', type:'text', x:sx, y:sy, text:'', fs, layer:activeLayer() };
    state.elements.push(previewEl);

    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:${px}px;top:${py-fs*state.zoom}px;z-index:9999;display:flex;gap:4px;align-items:center;background:var(--bg2,#2a2a2a);border:1px solid var(--border,#555);border-radius:4px;padding:3px 6px;box-shadow:0 2px 8px rgba(0,0,0,.5)`;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'テキスト入力';
    inp.style.cssText = 'width:160px;background:transparent;border:none;outline:none;color:inherit;font-size:13px;';
    wrap.appendChild(inp);
    document.body.appendChild(wrap);
    inp.focus();

    // 入力中リアルタイムプレビュー
    inp.addEventListener('input', () => {
      previewEl.text = inp.value;
      draw();
    });

    const finish = (confirm) => {
      // プレビュー要素を削除
      const idx = state.elements.indexOf(previewEl);
      if (idx !== -1) state.elements.splice(idx, 1);
      wrap.remove();
      if (confirm && inp.value.trim()) {
        pushH();
        state.elements.push({ id: genId('el'), type:'text', x:sx, y:sy,
          text:inp.value.trim(), fs, layer:activeLayer(),
          textBox: state.textBoxDefault || false });
      }
      draw();
    };

    let finished = false;
    const safeFinish = (confirm) => { if (finished) return; finished = true; finish(confirm); };

    inp.addEventListener('keydown', e2 => {
      if (e2.key === 'Enter')  { e2.preventDefault(); safeFinish(true); }
      if (e2.key === 'Escape') { safeFinish(false); }
    });
    // 外側クリックで確定
    const onOutside = (e2) => {
      if (!wrap.contains(e2.target)) { document.removeEventListener('mousedown', onOutside, true); safeFinish(true); }
    };
    document.addEventListener('mousedown', onOutside, true);
  },
  onMove() {}, onUp() {}, onHover() {}
};

// ----------------------------------------------------------------
// 図形ツール（rect / circle / fline）
// ----------------------------------------------------------------
const shapeTool = {
  onDown(wx, wy, e) {
    // ホバー時に計算済みのスナップ座標を再利用（クリック時のマウスぶれ対策）
    const sp = state.snapPreview || getAllSnapPoints(wx, wy);
    if (!state.mouse.shapeStart) {
      state.mouse.shapeStart = { x: sp.x, y: sp.y };
    } else {
      const p1 = state.mouse.shapeStart;
      let p = sp;
      if (state.ortho) { const o = applyOrtho(p1.x, p1.y, p.x, p.y); p = {x:o.x, y:o.y}; }
      const p2 = p;
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
    let p = getAllSnapPoints(wx, wy);
    if (state.ortho) { const o = applyOrtho(p1.x, p1.y, p.x, p.y); p = {x:o.x, y:o.y}; }
    state.preview = { type:'shape_preview', shapeMode: state.mode, p1, p2: p };
  },

  onUp(wx, wy, e) {},

  onHover(wx, wy, e) {
    if (!state.mouse.shapeStart) return;
    const p1 = state.mouse.shapeStart;
    let p = getAllSnapPoints(wx, wy);
    if (state.ortho) { const o = applyOrtho(p1.x, p1.y, p.x, p.y); p = {x:o.x, y:o.y}; }
    state.preview = { type:'shape_preview', shapeMode: state.mode, p1, p2: p };
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

const junctionTool = {
  onDown(wx, wy) {
    const p = getAllSnapPoints(wx, wy);
    pushH();
    state.elements.push({ id: genId('el'), type:'junction', x:p.x, y:p.y, r: state.junctionR || 2, layer: activeLayer() });
    draw();
  },
  onMove(wx, wy) {
    const p = getAllSnapPoints(wx, wy);
    state.preview = { type: 'junction_preview', x: p.x, y: p.y };
  },
  onUp() {},
  onHover(wx, wy) {
    const p = getAllSnapPoints(wx, wy);
    state.preview = { type: 'junction_preview', x: p.x, y: p.y };
  }
};

// ----------------------------------------------------------------
// 曲線ツール（bezier）- クリックで制御点追加、ダブルクリック/Enterで確定
// ----------------------------------------------------------------
const bezierTool = {
  onDown(wx, wy) {
    const p = getAllSnapPoints(wx, wy);
    if (!state.mouse.bezierPts) state.mouse.bezierPts = [];
    state.mouse.bezierPts.push({ x: p.x, y: p.y });
    state.preview = { type: 'bezier_preview', pts: [...state.mouse.bezierPts], mx: p.x, my: p.y };
  },
  onMove(wx, wy) {
    if (!state.mouse.bezierPts || !state.mouse.bezierPts.length) return;
    state.preview = { type: 'bezier_preview', pts: [...state.mouse.bezierPts], mx: wx, my: wy };
  },
  onUp() {},
  onHover(wx, wy) { this.onMove(wx, wy); },
  confirm() {
    const pts = state.mouse.bezierPts;
    if (!pts || pts.length < 2) { state.mouse.bezierPts = null; state.preview = null; draw(); return; }
    pushH();
    state.elements.push({ id: genId('el'), type: 'bezier', pts: [...pts], layer: activeLayer() });
    state.mouse.bezierPts = null;
    state.preview = null;
    draw();
  }
};

// ----------------------------------------------------------------
// ツールマップ
// ----------------------------------------------------------------
// ================================================================
// 補助線ツール
// ================================================================
const guideTool = {
  onDown(wx, wy) {
    const mode = state.mode;
    const tol = 8 / state.zoom; // クリック許容距離

    // 既存の補助線に近ければ削除
    const hit = state.guides.findIndex(g => {
      if (g.type !== mode) return false;
      if (mode === 'guide_h') return Math.abs(g.y - wy) < tol;
      if (mode === 'guide_v') return Math.abs(g.x - wx) < tol;
      return false;
    });

    const sp = state.snapPreview || getAllSnapPoints(wx, wy);
    pushH();
    if (hit >= 0) {
      state.guides.splice(hit, 1);
    } else {
      state.guides.push({
        id: genId('guide'),
        type: mode,
        x: sp.x,
        y: sp.y,
      });
    }
    draw();
  },
  onMove() {},
  onUp() {},
};
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
  bezier: bezierTool,
  guide_h:  guideTool,
  guide_v:  guideTool,
};

// ----------------------------------------------------------------
// 寸法線ツール
// ----------------------------------------------------------------
const dimTool = {
  onDown(wx, wy, e) {
    const pt = getAllSnapPoints(wx, wy);
    let sx = pt.x, sy = pt.y;
    if (!state.dimState) {
      state.dimState = { step:1, x1:sx, y1:sy };
    } else if (state.dimState.step === 1) {
      if (state.ortho) { const o = applyOrtho(state.dimState.x1, state.dimState.y1, sx, sy); sx=o.x; sy=o.y; }
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
      const dist = Math.round(len * (state.drawScale||1) * 100) / 100;
      const txt = prompt('寸法テキスト（空欄で自動）:', '') ?? '';
      state.mouse.down = false; state.mouse.dragging = false;
      state.mouse.down = false;
      pushH();
      const def = state.dimDef;
      state.elements.push({ id: genId('el'), type:'dim', x1:ds.x1, y1:ds.y1, x2:ds.x2, y2:ds.y2,
        dimText: txt || String(dist), offset, offsetSign:sign,
        layer:'寸法', x:(ds.x1+ds.x2)/2, y:(ds.y1+ds.y2)/2,
        dimFs: def.fs, dimTx: def.tx, dimTy: def.ty,
        gap: def.gap, ext: def.ext, color: def.color,
        arrowStyle: def.arrowStyle||'filled', arrowSz: def.arrowSz||8 });
      state.dimState = null; state.preview = null;
    }
  },
  onMove(wx, wy) {
    const pt = getAllSnapPoints(wx, wy);
    let sx = pt.x, sy = pt.y;
    const ds = state.dimState;
    if (!ds) return;
    if (ds.step === 1) {
      if (state.ortho) { const o = applyOrtho(ds.x1, ds.y1, sx, sy); sx=o.x; sy=o.y; }
      state.preview = { type:'dim_prev1', x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
    } else if (ds.step === 2) {
      const dx=ds.x2-ds.x1, dy=ds.y2-ds.y1, len=Math.hypot(dx,dy);
      if (len < 0.1) return;
      const px=-dy/len, py=dx/len;
      const mx=(ds.x1+ds.x2)/2, my=(ds.y1+ds.y2)/2;
      const dot=(sx-mx)*px+(sy-my)*py;
      state.preview = { type:'dim_prev2', x1:ds.x1, y1:ds.y1, x2:ds.x2, y2:ds.y2,
        dimText:String(Math.round(len * 100) / 100), offset:Math.max(15,Math.abs(dot)), offsetSign:dot>=0?1:-1, arrowSz:8 };
    }
  },
  onUp() {}, onHover(wx, wy) { this.onMove(wx, wy); }
};

// ----------------------------------------------------------------
// 引出線ツール（2クリック: 始点→終点、折れ点自動計算、インライン文字入力）
// ----------------------------------------------------------------
function showLeaderTextInput(wx, wy, onConfirm) {
  // キャンバス座標→画面座標に変換
  const cv = document.getElementById('cv');
  const r  = cv.getBoundingClientRect();
  const sx = wx * state.zoom + state.pan.x + r.left;
  const sy = wy * state.zoom + state.pan.y + r.top;

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:${sx+8}px;top:${sy-16}px;z-index:9999;display:flex;gap:4px;align-items:center;background:var(--bg2,#2a2a2a);border:1px solid var(--border,#555);border-radius:4px;padding:3px 5px;box-shadow:0 2px 8px rgba(0,0,0,.5)`;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'テキスト';
  inp.style.cssText = 'width:120px;background:transparent;border:none;outline:none;color:inherit;font-size:12px;';
  const btn = document.createElement('button');
  btn.textContent = 'OK';
  btn.style.cssText = 'font-size:11px;padding:1px 6px;cursor:pointer;';
  wrap.appendChild(inp); wrap.appendChild(btn);
  document.body.appendChild(wrap);
  inp.focus();

  const finish = () => { onConfirm(inp.value.trim()); wrap.remove(); };
  let done = false;
  const safeDone = (ok) => { if (done) return; done = true; if (ok) finish(); else { wrap.remove(); state.dimState=null; state.preview=null; draw(); } };
  btn.addEventListener('click', () => safeDone(true));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); safeDone(true); }
    if (e.key === 'Escape') { safeDone(false); }
  });
  // 外側クリックで確定
  const onOut = (e) => {
    if (!wrap.contains(e.target)) { document.removeEventListener('mousedown', onOut, true); safeDone(true); }
  };
  document.addEventListener('mousedown', onOut, true);
}

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
      const ex = sx, ey = ds.by; // Y は折れ点に固定（水平シェルフ）
      state.mouse.down = false; state.mouse.dragging = false;
      showLeaderTextInput(ex, ey, (txt) => {
        pushH();
        state.elements.push({ id: genId('el'), type:'leader',
          x1:ds.x1, y1:ds.y1, bx:ds.bx, by:ds.by, x2:ex, y2:ey,
          leaderText:txt, layer:activeLayer(), x:(ds.x1+ex)/2, y:(ds.y1+ey)/2 });
        state.dimState = null; state.preview = null;
        draw();
      });
    }
  },
  onMove(wx, wy) {
    const pt = getAllSnapPoints(wx, wy);
    const sx = pt.x, sy = pt.y;
    const ds = state.dimState;
    if (!ds) return;
    if (ds.step === 1) state.preview = { type:'leader_prev1', x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
    else if (ds.step === 2) state.preview = { type:'leader_prev2', x1:ds.x1, y1:ds.y1, bx:ds.bx, by:ds.by, x2:sx, y2:ds.by };
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
        Math.hypot(sx-ds.cx, sy-ds.cy)
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
      state._angleDimDone = true; // onUpでsetModeを呼ぶ
    }
  },
  onMove(wx, wy) {
    const ds = state.angleDimState;
    if (!ds) return;
    const sx=snap(wx), sy=snap(wy);
    if (ds.step === 1) state.preview = { type:'angle_dim_prev1', cx:ds.cx, cy:ds.cy, x1:sx, y1:sy };
    else               state.preview = { type:'angle_dim_prev2', cx:ds.cx, cy:ds.cy, x1:ds.x1, y1:ds.y1, x2:sx, y2:sy };
  },
  onUp() {
    if (state._angleDimDone) {
      state._angleDimDone = false;
      setMode('select');
    }
  },
  onHover(wx, wy) { this.onMove(wx, wy); }
};

TOOLS.dim    = dimTool;
TOOLS.leader = leaderTool;
TOOLS.angle_dim = angleDimTool;


