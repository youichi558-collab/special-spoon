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
function snap(v)   { return Math.round(Math.round(v / state.G) * state.G * 1000) / 1000; }
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
// ポインター入力（マウス／Apple Pencil等ペン／指タッチを統合）
// ----------------------------------------------------------------
// 方針（iPad/タッチ対応）：
//  - mouse / pen(スタイラス) は従来のマウス操作と全く同じ即時発火にする（描画精度優先、遅延なし）
//  - touch(指) はタップ/ドラッグ/ロングタップの3状態を判定してから発火する
//      ・タップ（動かさず離す）           → リリース時にonDown→onUpを連続実行（クリック相当）
//      ・ドラッグ（動かした）             → 移動を検知した時点で開始点基準にonDownを発火→以後onMoveを継続
//      ・ロングタップ（500ms動かさず保持）→ 右クリック相当（作図キャンセル/コンテキストメニュー）を発火
//  - 2本指はピンチズーム＋パン（ホイールが無い環境でのズーム手段）
//  - ダブルタップは既存のdblclick処理（線番/寸法文字/引出しテキスト編集）を流用
const TOUCH_LONGPRESS_MS   = 500; // ロングタップ判定時間
const TOUCH_MOVE_THRESHOLD = 8;   // タップ/ドラッグ判定のしきい値(canvas px)
const DOUBLETAP_MS         = 350; // ダブルタップ判定時間
const DOUBLETAP_DIST       = 24;  // ダブルタップ判定距離(canvas px)

let activePointers = new Map(); // pointerId -> {cx,cy}（ピンチ/2本指パン用）
let pinchStart = null;          // {dist, mid:{cx,cy}, zoom, pan:{x,y}}
let _lastTap   = null;          // {t, cx, cy}（ダブルタップ判定用）

function ptrPos(e) {
  const r = cv.getBoundingClientRect();
  return { cx: e.clientX - r.left, cy: e.clientY - r.top };
}

function clearTouchPending() {
  clearTimeout(state.mouse._touchTimer);
  state.mouse._touchTimer = null;
  state.mouse._touchPend  = null;
}

// 右クリック相当の処理（タッチのロングタップ専用。実マウスの右クリックはdoPointerLeftDown内で従来通り処理）
function doContextAction(wx, wy, clientX, clientY) {
  if ((state.mode === 'dim' || state.mode === 'leader') && state.dimState) {
    if (state.dimState.step === 2) state.dimState.step = 1;
    else state.dimState = null;
    state.preview = null; draw(); return;
  }
  if (state.mode === 'angle_dim' && state.angleDimState) {
    if (state.angleDimState.step === 2) state.angleDimState.step = 1;
    else state.angleDimState = null;
    state.preview = null; draw(); return;
  }
  if (state.mode === 'chain_dim' && state.dimState) {
    state.dimState = null; state.preview = null;
    if (typeof updateHint === 'function') updateHint();
    draw(); return;
  }
  if (state.mouse.shapeStart || state.mouse.arcP1) {
    state.mouse.shapeStart = null;
    state.mouse.arcP1 = null; state.mouse.arcP2 = null; state.mouse.arc3P1 = null; state.mouse.arc3P2 = null; state.mouse.triP1 = null; state.mouse.triP2 = null;
    state.preview = null; draw(); return;
  }
  if (state.mode === 'wire' && state.wirePoints.length > 0) {
    state.wirePoints.pop();
    state.preview = null; draw(); return;
  }
  // 上記いずれでもない → コンテキストメニュー表示
  showCtx(clientX, clientY);
}

// 左ボタン相当の押下処理（マウス／ペンは即時、タッチはドラッグ確定時に開始点基準で呼ばれる）
function doPointerLeftDown(cx, cy, e, wxOverride, wyOverride) {
  if (state.colorEditing) { state.colorEditing = false; draw(); return; }
  const wPt = (wxOverride != null) ? { x: wxOverride, y: wyOverride } : tw(cx, cy);
  const wx = wPt.x, wy = wPt.y;

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

  // 右ボタン(実マウスのみ。タッチのロングタップはdoContextActionで別処理) → dim/leader中はステップキャンセル、それ以外はパン開始
  if (e.button === 2) {
    if ((state.mode === 'dim' || state.mode === 'leader') && state.dimState) {
      if (state.dimState.step === 2) {
        state.dimState.step = 1;  // 一つ戻る
      } else {
        state.dimState = null;    // キャンセル
      }
      state.preview = null; draw(); return;
    }
    if (state.mode === 'angle_dim' && state.angleDimState) {
      if (state.angleDimState.step === 2) {
        state.angleDimState.step = 1;
      } else {
        state.angleDimState = null;
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

  // pasteモード：1クリック目=基準点（コピー元図形上の点）、2クリック目=貼付け先
  if (state.mode === 'paste') {
    const pt = getAllSnapPoints(wx, wy);
    const sp = { x: pt.x, y: pt.y };
    if (state.pasteStep === 'base') {
      state.pasteBaseWorld = { x: sp.x, y: sp.y };
      state.pasteStep = 'dest';
      document.getElementById('s-hint').textContent = '貼付け先をクリック（基準点がカーソルに追従）  [ESC] キャンセル';
    } else if (state.pasteStep === 'dest') {
      const base = state.pasteBaseWorld;
      commitPaste(sp.x - base.x, sp.y - base.y);
    }
    draw();
    return;
  }

  // partRef連続採番モード：シンボルクリックで割り当て→自動インクリメント
  if (state.mode === 'partref') {
    state.mouse.down = false; state.mouse.dragging = false;
    const el = hitTest(wx, wy);
    if (el && getDef(el.type)) {
      pushH();
      const assigned = state.partRefNext || '';
      el.partRef = assigned;
      state.partRefNext = incRef(assigned);
      document.getElementById('s-hint').textContent = `「${assigned}」を割当 → 次:「${state.partRefNext}」をクリック  [ESC] 終了`;
      draw();
    }
    return;
  }

  // 線番連続採番モード：配線クリックで割り当て→自動インクリメント
  if (state.mode === 'wireno') {
    state.mouse.down = false; state.mouse.dragging = false;
    const w = hitTestWire(wx, wy);
    if (w) {
      pushH();
      const assigned = state.wireNoNext || '';
      w.wireNo = assigned;
      state.wireNoNext = incRef(assigned);
      document.getElementById('s-hint').textContent = `「${assigned}」を割当 → 次:「${state.wireNoNext}」をクリック  [ESC] 終了`;
      draw();
    }
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
}

// ダブルタップ/ダブルクリック共通処理（線番編集・寸法/引出し/テキストの直接編集・bezier確定）
function handleDblAction(wx, wy) {
  if (state.mode === 'bezier') {
    if (state.mouse.bezierPts && state.mouse.bezierPts.length > 1) {
      state.mouse.bezierPts.pop();
    }
    currentTool().confirm();
    return;
  }
  if (state.mode !== 'select') return;
  const wire = hitTestWire(wx, wy);
  if (wire) {
    const txt = prompt('線番:', wire.wireNo || '');
    if (txt === null) return;
    pushH(); wire.wireNo = txt; draw(); return;
  }
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
}

cv.addEventListener('pointerdown', e => {
  const { cx, cy } = ptrPos(e);
  activePointers.set(e.pointerId, { cx, cy });

  // 2本指以上 → ピンチズーム/2本指パンへ移行（進行中だった単指操作は破棄）
  if (activePointers.size >= 2) {
    clearTouchPending();
    state.mouse._touchLong = false;
    state.mouse.down = false; state.mouse.panning = false; state.mouse.dragging = false;
    const pts = [...activePointers.values()];
    pinchStart = {
      dist: Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy),
      mid:  { cx: (pts[0].cx + pts[1].cx) / 2, cy: (pts[0].cy + pts[1].cy) / 2 },
      zoom: state.zoom,
      pan:  { x: state.pan.x, y: state.pan.y },
    };
    return;
  }

  try { cv.setPointerCapture(e.pointerId); } catch (_) {}

  if (e.pointerType === 'touch') {
    if (state.colorEditing) { state.colorEditing = false; draw(); return; }
    const { x: wx, y: wy } = tw(cx, cy);
    state.mouse._touchPend = { cx, cy, wx, wy, clientX: e.clientX, clientY: e.clientY };
    state.mouse._touchDragStarted = false;
    clearTimeout(state.mouse._touchTimer);
    state.mouse._touchTimer = setTimeout(() => {
      const p = state.mouse._touchPend;
      if (!p || state.mouse._touchDragStarted) return;
      state.mouse._touchLong = true;
      state.mouse._touchPend = null;
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
      doContextAction(p.wx, p.wy, p.clientX, p.clientY);
    }, TOUCH_LONGPRESS_MS);
    return;
  }

  // マウス／ペン（Apple Pencil等）は従来通り即時発火
  doPointerLeftDown(cx, cy, e);
});

cv.addEventListener('pointermove', e => {
  if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, ptrPos(e));

  // ピンチズーム/2本指パン中
  if (pinchStart && activePointers.size >= 2) {
    const pts  = [...activePointers.values()];
    const dist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
    const mid  = { cx: (pts[0].cx + pts[1].cx) / 2, cy: (pts[0].cy + pts[1].cy) / 2 };
    const newZoom = Math.max(0.05, Math.min(20, pinchStart.zoom * (dist / (pinchStart.dist || 1))));
    const wx = (pinchStart.mid.cx - pinchStart.pan.x) / pinchStart.zoom;
    const wy = (pinchStart.mid.cy - pinchStart.pan.y) / pinchStart.zoom;
    state.zoom  = newZoom;
    state.pan.x = mid.cx - wx * newZoom;
    state.pan.y = mid.cy - wy * newZoom;
    draw();
    return;
  }

  if (state.colorEditing) return;

  const { cx, cy } = ptrPos(e);

  // タッチのタップ/ドラッグ判定待ち：しきい値を超えたらドラッグ確定として開始点基準でonDownを発火
  const pend = state.mouse._touchPend;
  if (pend && !state.mouse._touchDragStarted) {
    if (Math.hypot(cx - pend.cx, cy - pend.cy) > TOUCH_MOVE_THRESHOLD) {
      clearTimeout(state.mouse._touchTimer);
      state.mouse._touchTimer = null;
      state.mouse._touchDragStarted = true;
      doPointerLeftDown(pend.cx, pend.cy, e, pend.wx, pend.wy);
    } else {
      return; // まだ静止扱い（タップ/ロングタップ判定待ち）
    }
  }

  const { x: wx, y: wy } = tw(cx, cy);
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

  // pasteモード：プレビュー表示
  if (state.mode === 'paste') {
    const pt = getAllSnapPoints(wx, wy);
    const sp = { x: pt.x, y: pt.y };
    let dx, dy;
    if (state.pasteStep === 'base') {
      dx = 0; dy = 0;
    } else {
      const base = state.pasteBaseWorld;
      dx = sp.x - base.x;
      dy = sp.y - base.y;
    }
    state.preview = { type: 'paste_preview', dx, dy };
    state.snapPreview = getAllSnapPoints(wx, wy);
    draw();
    return;
  }

  if (!state.mouse.down) {
    // ホバー：スナップマーカー更新（タッチには実質発生しないがペン/マウスは従来通り）
    state.snapPreview = getAllSnapPoints(wx, wy);
    currentTool().onHover?.(wx, wy, e);
    draw();
    return;
  }

  currentTool().onMove(wx, wy, e);
  draw();
});

cv.addEventListener('pointerup', e => {
  activePointers.delete(e.pointerId);
  if (pinchStart && activePointers.size < 2) { pinchStart = null; return; }
  if (activePointers.size >= 2) return; // 3本指以降の余った指は無視

  const { cx, cy } = ptrPos(e);
  const { x: wx, y: wy } = tw(cx, cy);

  if (e.pointerType === 'touch') {
    clearTimeout(state.mouse._touchTimer);
    state.mouse._touchTimer = null;

    if (state.mouse._touchLong) {
      // ロングタップは既にdoContextActionで処理済み
      state.mouse._touchLong = false;
      state.mouse._touchPend = null;
      return;
    }

    if (state.mouse._touchPend && !state.mouse._touchDragStarted) {
      // 静止タップ：リリース時にonDown→onUpを連続実行（クリック相当）
      const p = state.mouse._touchPend;
      state.mouse._touchPend = null;
      doPointerLeftDown(p.cx, p.cy, e, p.wx, p.wy);
      if (!state.mouse.panning) {
        currentTool().onUp(p.wx, p.wy, e);
      }
      state.mouse.panning = false;
      state.mouse.down    = false;
      state.mouse.button  = -1;
      cv.style.cursor = '';
      draw();
      // ダブルタップ判定
      const now = Date.now();
      if (_lastTap && (now - _lastTap.t) < DOUBLETAP_MS && Math.hypot(cx - _lastTap.cx, cy - _lastTap.cy) < DOUBLETAP_DIST) {
        handleDblAction(p.wx, p.wy);
        _lastTap = null;
      } else {
        _lastTap = { t: now, cx, cy };
      }
      return;
    }
    // ここまで来た場合はドラッグ完了
    state.mouse._touchDragStarted = false;
  }

  if (state.mouse.panning) {
    state.mouse.panning = false;
    state.mouse.down    = false;
    cv.style.cursor = '';
    return;
  }

  if (e.button === 2) {
    state.mouse.down = false;
    return;
  }

  currentTool().onUp(wx, wy, e);
  state.mouse.down   = false;
  state.mouse.button = -1;
  draw();
});

cv.addEventListener('pointercancel', e => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchStart = null;
  clearTouchPending();
  state.mouse._touchLong = false;
  state.mouse._touchDragStarted = false;
  state.mouse.down = false;
  state.mouse.panning = false;
  cv.style.cursor = '';
});

cv.addEventListener('pointerleave', () => {
  state.snapPreview = null;
  draw();
});

// キャンバス外でポインターを離した場合のリセット（setPointerCaptureにより通常はcv内でupを受け取るが保険として維持）
document.addEventListener('pointerup', e => {
  if (!state.mouse.down) return;
  if (state.mouse.selboxing) {
    state.mouse.selboxing = false;
    state.mouse.down = false;
    draw();
  } else if (state.mouse.panning) {
    state.mouse.panning = false;
    state.mouse.down = false;
  } else {
    state.mouse.down = false;
  }
});

cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  e.stopPropagation();
  // 連続寸法の連鎖中は右クリック=終了(メニューは出さない)
  if (state.mode === 'chain_dim' && state.dimState) {
    state.dimState = null; state.preview = null;
    if (typeof updateHint === 'function') updateHint();
    state.mouse.panning = false; state.mouse.dragMoved = false;
    draw();
    return;
  }
  if (!state.mouse.dragMoved) {
    showCtx(e.clientX, e.clientY);
  }
  state.mouse.panning  = false;
  state.mouse.dragMoved = false;
});

// ダブルクリック → dim/leader/text のテキスト直接編集（selectモードのみ。タッチのダブルタップはpointerup内で処理）
cv.addEventListener('dblclick', e => {
  const r = cv.getBoundingClientRect();
  const { x: wx, y: wy } = tw(e.clientX - r.left, e.clientY - r.top);
  handleDblAction(wx, wy);
});

// ----------------------------------------------------------------
// ツール切り替え
// ----------------------------------------------------------------
function currentTool() {
  return TOOLS[state.mode] || TOOLS.select;
}

function setMode(m, sym) {
  // 直前ツールを記録(Enter/Spaceで再実行するため)。採番系・貼付は対象外
  if (m !== 'select' && m !== 'paste' && m !== 'partref' && m !== 'wireno') {
    state.lastToolMode = m;
    state.lastToolSym  = (m === 'sym') ? (sym || state.symType) : null;
  }
  state.mode     = m;
  state.symType  = sym || null;
  state.preview  = null;
  state.wirePoints = [];
  state.dimState = null;
  state.angleDimState = null;
  state.mouse.down      = false;
  state.mouse.dragging  = false;
  state.mouse.selboxing = false;
  state.mouse.panning   = false;
  state.mouse.shapeStart = null;
  state.mouse.arcP1 = null;
  state.mouse.arcP2 = null;
  // 選択解除 + resizeハンドル削除（ハンドルがstopPropagationでdimクリックを横取りするのを防ぐ）
  state.sel.els.clear();
  state.sel.wires.clear();
  if (typeof updateResizeHandles === 'function') updateResizeHandles();
  document.querySelectorAll('.rb[id^=rb-]').forEach(b => b.classList.remove('on'));
  document.getElementById('rb-' + (m === 'sym' ? 'sym' : m))?.classList.add('on');
  // トグル系ボタンはモードと独立なので表示状態を復元
  document.getElementById('rb-ortho')?.classList.toggle('on', !!state.ortho);
  document.getElementById('rb-snapend')?.classList.toggle('on', !!state.snapEnd);
  document.getElementById('rb-snapmid')?.classList.toggle('on', !!state.snapMid);
  document.getElementById('rb-mask')?.classList.toggle('on', !!state.maskMode);
  document.getElementById('rb-textbox')?.classList.toggle('on', !!state.textBoxDefault);
  // クイックバーのモード表示更新
  const modeLabels = { select:'選択', wire:'配線', text:'テキスト', shape:'図形', dim:'寸法', sym:'シンボル', junction:'接続点' };
  const qbMode = document.getElementById('qb-mode');
  if (qbMode) qbMode.textContent = modeLabels[m] || m;
  const qbSel = document.getElementById('qb-sel');
  const qbWire = document.getElementById('qb-wire');
  if (qbSel)  { qbSel.style.background  = m==='select' ? 'var(--acc)' : 'var(--bg)';  qbSel.style.color  = m==='select' ? '#fff' : 'var(--fg)'; }
  if (qbWire) { qbWire.style.background = m==='wire'   ? 'var(--acc)' : 'var(--bg)';  qbWire.style.color = m==='wire'   ? '#fff' : 'var(--fg)'; }
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
