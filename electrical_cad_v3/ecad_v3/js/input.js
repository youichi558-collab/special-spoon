// ================================================================
// input.js — マウスイベントを正規化してtools/selectに渡す
// input.jsはデータを直接変更しない
// ================================================================

// ----------------------------------------------------------------
// 座標変換（world ↔ canvas）
// ----------------------------------------------------------------
function tc(wx, wy) { // world → canvas
  return { x: wx * state.zoom + state.pan.x, y: wy * state.zoom + state.pan.y };
}
function tw(cx, cy) { // canvas → world
  return { x: (cx - state.pan.x) / state.zoom, y: (cy - state.pan.y) / state.zoom };
}
function snap(v)   { return Math.round(v / state.G) * state.G; }
function snapPt(wx, wy) { return { x: snap(wx), y: snap(wy) }; }

function resize() {
  cv.width  = cwEl.clientWidth;
  cv.height = cwEl.clientHeight;
}
window.addEventListener('resize', () => { resize(); draw(); });

// ----------------------------------------------------------------
// ズーム・パン
// ----------------------------------------------------------------
function doZoom(factor, cx, cy) {
  const r = cv.getBoundingClientRect();
  const ox = cx ?? cv.width  / 2;
  const oy = cy ?? cv.height / 2;
  const wx = (ox - state.pan.x) / state.zoom;
  const wy = (oy - state.pan.y) / state.zoom;
  state.zoom = Math.max(0.05, Math.min(20, state.zoom * factor));
  state.pan.x = ox - wx * state.zoom;
  state.pan.y = oy - wy * state.zoom;
  draw();
}

function resetView() {
  state.zoom = 1;
  state.pan  = state.frameObj ? { x:20, y:20 } : { x:60, y:60 };
  draw();
}

cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  doZoom(e.deltaY < 0 ? 1.12 : 1/1.12, e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

// ----------------------------------------------------------------
// マウスイベント
// ----------------------------------------------------------------
cv.addEventListener('mousedown', e => {
  if (state.colorEditing) { state.colorEditing = false; draw(); return; } // カラー編集中はキャンバス操作をブロック
  const r  = cv.getBoundingClientRect();
  const cx = e.clientX - r.left;
  const cy = e.clientY - r.top;
  const {x: wx, y: wy} = tw(cx, cy);

  state.mouse.down    = true;
  state.mouse.button  = e.button;
  state.mouse.startCx = cx; state.mouse.startCy = cy;
  state.mouse.startWx = wx; state.mouse.startWy = wy;
  state.mouse.cx = cx; state.mouse.cy = cy;
  state.mouse.wx = wx; state.mouse.wy = wy;

  // 中ボタン → パン開始
  if (e.button === 1) {
    state.mouse.panning   = true;
    state.mouse.panOrigin = { x: state.pan.x, y: state.pan.y };
    return;
  }

  // 右ボタン → dim/leader中はステップキャンセル、それ以外はパン開始
  if (e.button === 2) {
    if ((state.mode === 'dim' || state.mode === 'leader') && state.dimState) {
      if (state.dimState.step === 2) {
        state.dimState.step = 1;  // 一つ戻る
      } else {
        state.dimState = null;    // キャンセル
      }
      state.preview = null; draw(); return;
    }
    // 作図中のキャンセル（rect/circle/fline/arc）
    if (state.mouse.shapeStart || state.mouse.arcP1) {
      state.mouse.shapeStart = null;
      state.mouse.arcP1 = null; state.mouse.arcP2 = null; state.mouse.arc3P1 = null; state.mouse.arc3P2 = null; state.mouse.triP1 = null; state.mouse.triP2 = null;
      state.preview = null; draw(); return;
    }
    // 配線中の右クリック：1点戻る（なければパンニング）
    if (state.mode === 'wire' && state.wirePoints.length > 0) {
      state.wirePoints.pop();
      state.preview = null; draw(); return;
    }
    state.mouse.panning   = true;
    state.mouse.panOrigin = { x: state.pan.x, y: state.pan.y };
    state.mouse.dragMoved = false;
    cv.style.cursor = 'grabbing';
    return;
  }

  // 左ボタン → リサイズハンドル優先チェック（selectモード時）
  if (state.mode === 'select') {
    const h = hitResizeHandle(wx, wy);
    if (h) {
      if (h.group) startGroupResize(h, e);
      else         startElResize(h, e);
      return;
    }
  }

  // 左ボタン → 現在ツールに委譲
  currentTool().onDown(wx, wy, e);
  draw();
});

cv.addEventListener('mousemove', e => {
  const r  = cv.getBoundingClientRect();
  const cx = e.clientX - r.left;
  const cy = e.clientY - r.top;
  const {x: wx, y: wy} = tw(cx, cy);

  state.mouse.cx = cx; state.mouse.cy = cy;
  state.mouse.wx = wx; state.mouse.wy = wy;

  if (state.mouse.panning) {
    const dx = cx - state.mouse.startCx;
    const dy = cy - state.mouse.startCy;
    if (Math.hypot(dx, dy) > 4) state.mouse.dragMoved = true;
    state.pan.x = state.mouse.panOrigin.x + dx;
    state.pan.y = state.mouse.panOrigin.y + dy;
    draw();
    return;
  }

  if (!state.mouse.down) {
    // ホバー：スナップマーカー更新
    state.snapPreview = getAllSnapPoints(wx, wy);
    currentTool().onHover?.(wx, wy, e);
    draw();
    return;
  }

  currentTool().onMove(wx, wy, e);
  draw();
});

cv.addEventListener('mouseup', e => {
  const r  = cv.getBoundingClientRect();
  const cx = e.clientX - r.left;
  const cy = e.clientY - r.top;
  const {x: wx, y: wy} = tw(cx, cy);

  if (state.mouse.panning) {
    state.mouse.panning = false;
    state.mouse.down    = false;
    cv.style.cursor = '';
    // 右クリックでパン距離が小さい場合はコンテキストメニュー
    if (e.button === 2 && !state.mouse.dragMoved) {
      showCtx(e.clientX, e.clientY);
    }
    return;
  }

  if (e.button === 2) {
    showCtx(e.clientX, e.clientY);
    state.mouse.down = false;
    return;
  }

  currentTool().onUp(wx, wy, e);
  state.mouse.down   = false;
  state.mouse.button = -1;
  draw();
});

cv.addEventListener('mouseleave', () => {
  state.snapPreview = null;
  draw();
});

cv.addEventListener('contextmenu', e => e.preventDefault());

// ダブルクリック → dim/leader/text のテキスト直接編集（selectモードのみ）
cv.addEventListener('dblclick', e => {
  if (state.mode !== 'select') return;  // dim/leader配置中は無視
  const r = cv.getBoundingClientRect();
  const {x:wx, y:wy} = tw(e.clientX - r.left, e.clientY - r.top);
  // ワイヤー → 線番編集
  const wire = hitTestWire(wx, wy);
  if (wire) {
    const txt = prompt('線番:', wire.wireNo || '');
    if (txt === null) return;
    pushH(); wire.wireNo = txt; draw(); return;
  }
  // 要素（hitTest が正しい関数名）
  const el = hitTest(wx, wy);
  if (!el) return;
  if (el.type === 'dim') {
    const len = Math.round(Math.hypot(el.x2-el.x1, el.y2-el.y1));
    const txt = prompt('寸法テキスト:', el.dimText || String(len));
    if (txt === null) return;
    pushH(); el.dimText = txt; draw();
  } else if (el.type === 'leader') {
    const txt = prompt('引出しテキスト:', el.leaderText || '');
    if (txt === null) return;
    pushH(); el.leaderText = txt; draw();
  } else if (el.type === 'text') {
    const txt = prompt('テキスト:', el.text || '');
    if (txt === null) return;
    pushH(); el.text = txt; draw();
  }
});

// ----------------------------------------------------------------
// ツール切り替え
// ----------------------------------------------------------------
function currentTool() {
  return TOOLS[state.mode] || TOOLS.select;
}

function setMode(m, sym) {
  state.mode     = m;
  state.symType  = sym || null;
  state.preview  = null;
  state.wirePoints = [];
  state.dimState = null;
  state.mouse.shapeStart = null;
  state.mouse.arcP1 = null;
  state.mouse.arcP2 = null;
  // 選択解除 + resizeハンドル削除（ハンドルがstopPropagationでdimクリックを横取りするのを防ぐ）
  state.sel.els.clear();
  state.sel.wires.clear();
  if (typeof updateResizeHandles === 'function') updateResizeHandles();
  document.querySelectorAll('.rb[id^=rb-]').forEach(b => b.classList.remove('on'));
  document.getElementById('rb-' + (m === 'sym' ? 'sym' : m))?.classList.add('on');
  updateHint();
}

function toggleOrtho() {
  state.ortho = !state.ortho;
  document.getElementById('rb-ortho')?.classList.toggle('on', state.ortho);
  document.getElementById('s-hint').textContent = state.ortho ? '直交モード ON (F8でOFF)' : '';
}
function toggleSnapEnd() {
  state.snapEnd = !state.snapEnd;
  document.getElementById('rb-snapend')?.classList.toggle('on', state.snapEnd);
}
function toggleSnapMid() {
  state.snapMid = !state.snapMid;
  document.getElementById('rb-snapmid')?.classList.toggle('on', state.snapMid);
}
