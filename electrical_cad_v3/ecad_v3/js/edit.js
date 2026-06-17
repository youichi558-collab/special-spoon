document.addEventListener('keyup', e => {
  if (e.key === 'Shift' && state._shiftOrtho) {
    state._shiftOrtho = false;
    state.ortho = false;
    document.getElementById('rb-ortho')?.classList.remove('on');
  }
});

// ================================================================
// edit.js — Undo/Redo・保存・読込・クリップボード・ショートカット
// ================================================================

// ----------------------------------------------------------------
// Undo / Redo
// ----------------------------------------------------------------
function pushH() {
  const snap = {
    pages:      JSON.parse(JSON.stringify(state.pages)),
    currentPage:state.currentPage,
  };
  state.hist.push(snap);
  if (state.hist.length > 80) state.hist.shift();
  state.redoHist = [];
  // 現在ページを未保存マーク
  state.pages[state.currentPage].dirty = true;
  renderPageTabs();
}

function undo() {
  if (!state.hist.length) return;
  const snap = state.hist.pop();
  state.redoHist.push({
    pages:      JSON.parse(JSON.stringify(state.pages)),
    currentPage:state.currentPage,
  });
  state.pages       = snap.pages;
  state.currentPage = snap.currentPage;
  state.sel.els.clear(); state.sel.wires.clear();
  renderPageTabs(); draw(); updateRightPanel();
}

function redo() {
  if (!state.redoHist.length) return;
  const snap = state.redoHist.pop();
  state.hist.push({
    pages:      JSON.parse(JSON.stringify(state.pages)),
    currentPage:state.currentPage,
  });
  state.pages       = snap.pages;
  state.currentPage = snap.currentPage;
  state.sel.els.clear(); state.sel.wires.clear();
  renderPageTabs(); draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// 保存・読込
// ----------------------------------------------------------------
function _syncCurrentPage() {
  const p = state.page;
  p.elements = state.elements;
  p.wires    = state.wires;
  p.frameObj = state.frameObj;
}

function _pageFileName(pg, idx) {
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = (pg.name || ('Sheet'+(idx+1))).replace(/[\\/:*?"<>|]/g, '_');
  return `${base}_${name}`;
}

function saveProject() {
  // 現在ページのみ保存
  _syncCurrentPage();
  const pg = state.pages[state.currentPage];
  const defaultName = _pageFileName(pg, state.currentPage);
  const name = prompt('保存ファイル名を入力してください', defaultName);
  if (name === null) return; // キャンセル
  const fname = (name.trim() || defaultName).replace(/[\\/:*?"<>|]/g, '_');
  // saveFileNameを更新
  state.saveFileName = fname.replace(/_[^_]+$/, ''); // ページ名部分を除いた部分を保存
  const data = {
    version: 2,
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    customParts:   state.customParts,
    wireNoRule:    state.wireNoRule,
    layers:        LAYERS,
    pages: [pg],
  };
  dl(JSON.stringify(data, null, 2), fname + '.json', 'application/json');
  pg.dirty = false;
  renderPageTabs();
}

function saveAllProject() {
  // 全ページまとめて保存
  _syncCurrentPage();
  const defaultBase = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = prompt('保存ファイル名を入力してください', defaultBase);
  if (name === null) return; // キャンセル
  const base = (name.trim() || defaultBase).replace(/[\\/:*?"<>|]/g, '_');
  state.saveFileName = base;
  const data = {
    version: 2,
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    customParts:   state.customParts,
    wireNoRule:    state.wireNoRule,
    layers:        LAYERS,
    pages: state.pages,
  };
  dl(JSON.stringify(data, null, 2), base + '_all.json', 'application/json');
  state.pages.forEach(p => p.dirty = false);
  renderPageTabs();
}

function loadProject(input) {
  const f = input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      pushH();

      // バージョン別マイグレーション
      if (d.version === 2) {
        state.pages        = d.pages || [{ name:'Sheet1', elements:[], wires:[], groups:[], guides:[], frameObj:null }];
        state.wireNoRule   = d.wireNoRule || state.wireNoRule;
        state.customSymbols= d.customSymbols || [];
        state.customParts  = d.customParts   || [];
        // 旧フォーマット互換：トップレベルのguides → page[0].guides に移行
        if (d.guides && d.guides.length) state.pages[0].guides = d.guides;
        // 各ページにguidesがなければ初期化
        state.pages.forEach(pg => { if (!pg.guides) pg.guides = []; });
        if (d.layers && d.layers.length) { LAYERS.length = 0; d.layers.forEach(l => LAYERS.push(l)); }
      } else {
        // v1以前（旧形式）からのマイグレーション
        const pages = d.pages || [{ name:'Sheet1', elements: d.elements||[], wires: d.wires||[], frameObj: d.frameObj||null }];
        // groupsをpages内に移動・idを付与
        state.pages = pages.map(pg => ({
          ...pg,
          groups: [],
          elements: (pg.elements||[]).map(el => el.id ? el : { ...el, id: genId('el') }),
          wires:    (pg.wires||[]).map(w  => w.id  ? w  : { ...w,  id: genId('w'), wireNoAuto: true }),
        }));
        state.customSymbols = d.customSymbols || [];
        state.customParts   = d.customParts   || [];
      }

      state.currentPage = 0;
      state.customSymbols.forEach(s => { DEFS[s.type] = s; });
      state.saveFileName = d.saveFileName || '';
      state.sel.els.clear(); state.sel.wires.clear();
      // ロード時に個別色をクリア → レイヤー色を継承（junction以外）
      state.pages.forEach(pg => {
        (pg.elements||[]).forEach(el => { if (el.type !== 'junction') el.color = undefined; });
        (pg.wires||[]).forEach(w => { w.color = undefined; });
      });
      renderCustomSymbols(); renderPartsAll(); renderPageTabs(); draw(); updateRightPanel();
      alert('読込完了');
    } catch(err) {
      alert('読込失敗: ' + err.message);
    }
  };
  rd.readAsText(f);
  input.value = '';
}

function dl(text, fname, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ----------------------------------------------------------------
// クリップボード
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// 共通移動関数
// ----------------------------------------------------------------
// グリッド近傍の座標だけスナップ（許容誤差以内のズレのみ修正）
function snapNearGrid(tolerance) {
  // 許容誤差未指定 → ダイアログで入力
  if (tolerance == null) {
    const val = prompt('グリッドから何以内の座標をスナップしますか？（例: 0.5）', '0.5');
    if (val == null) return;
    tolerance = parseFloat(val);
    if (isNaN(tolerance) || tolerance <= 0) return;
  }
  // 許容誤差内ならスナップ、そうでなければそのまま
  const sn = v => {
    const snapped = Math.round(v / state.G) * state.G;
    return Math.abs(snapped - v) <= tolerance ? snapped : v;
  };
  const snP = (o, k) => { if (o[k] != null) o[k] = sn(o[k]); };

  pushH();
  const targets = (state.sel.els.size > 0)
    ? state.elements.filter(e => state.sel.els.has(e.id))
    : state.elements;
  const wTargets = (state.sel.wires.size > 0)
    ? state.wires.filter(w => state.sel.wires.has(w.id))
    : state.wires;

  targets.forEach(el => {
    snP(el,'x'); snP(el,'y');
    snP(el,'x1'); snP(el,'y1');
    snP(el,'x2'); snP(el,'y2');
    snP(el,'x3'); snP(el,'y3');
    snP(el,'cx'); snP(el,'cy');
    snP(el,'bx'); snP(el,'by');
    if (el.pts) {
      el.pts = el.pts.map(p => ({ x: sn(p.x), y: sn(p.y) }));
      el.x1 = el.pts[0]?.x; el.y1 = el.pts[0]?.y;
      el.x2 = el.pts[el.pts.length-1]?.x; el.y2 = el.pts[el.pts.length-1]?.y;
    }
  });
  wTargets.forEach(w => {
    if (w.pts) {
      w.pts = w.pts.map(p => ({ x: sn(p.x), y: sn(p.y) }));
      w.x1 = w.pts[0]?.x; w.y1 = w.pts[0]?.y;
      w.x2 = w.pts[w.pts.length-1]?.x; w.y2 = w.pts[w.pts.length-1]?.y;
    }
  });
  draw(); updateRightPanel();
}

function moveEntity(el, dx, dy) {
  if (el.cx != null) el.cx += dx;
  if (el.cy != null) el.cy += dy;
  if (el.x  != null) el.x  += dx;
  if (el.y  != null) el.y  += dy;
  if (el.x1 != null) el.x1 += dx;
  if (el.y1 != null) el.y1 += dy;
  if (el.x2 != null) el.x2 += dx;
  if (el.y2 != null) el.y2 += dy;
  if (el.x3 != null) el.x3 += dx;
  if (el.y3 != null) el.y3 += dy;
  if (el.bx != null) el.bx += dx;
  if (el.by != null) el.by += dy;
  if (el.pts) {
    el.pts = el.pts.map(p => ({ x: p.x+dx, y: p.y+dy }));
    el.x1 = el.pts[0]?.x; el.y1 = el.pts[0]?.y;
    el.x2 = el.pts[el.pts.length-1]?.x; el.y2 = el.pts[el.pts.length-1]?.y;
  }
}

function copySelected() {
  const els   = state.elements.filter(el => state.sel.els.has(el.id));
  const wires = state.wires.filter(w   => state.sel.wires.has(w.id));
  if (!els.length && !wires.length) return;
  // コピー元のID集合
  const elIdSet   = new Set(els.map(e => e.id));
  const wireIdSet = new Set(wires.map(w => w.id));
  // コピー元が属するグループ構造を保存（コピー範囲内のメンバーのみ）
  const groups = (state.page.groups || [])
    .map(g => ({
      elIds:   g.elIds.filter(id => elIdSet.has(id)),
      wireIds: g.wireIds.filter(id => wireIdSet.has(id)),
    }))
    .filter(g => g.elIds.length + g.wireIds.length > 0);
  state.clipboard = {
    els:   JSON.parse(JSON.stringify(els)),
    wires: JSON.parse(JSON.stringify(wires)),
    groups,
  };
}

function cutSelected() { copySelected(); delSel(); }

function pasteSelected() {
  if (!state.clipboard?.els) return;
  pushH();
  const off = state.G * 2;
  const idMap = {}; // 旧ID → 新ID のマッピング
  function offsetEl(el) {
    const ne = JSON.parse(JSON.stringify(el));
    const newId = genId('el');
    idMap[el.id] = newId;
    ne.id = newId;
    moveEntity(ne, off, off);
    return ne;
  }
  const newEls = state.clipboard.els.map(offsetEl);
  const newWires = state.clipboard.wires.map(w => {
    const nw = JSON.parse(JSON.stringify(w));
    const newId = genId('w');
    idMap[w.id] = newId;
    nw.id  = newId;
    nw.pts = (nw.pts||[]).map(p => ({ x: p.x+off, y: p.y+off }));
    nw.x1  = nw.pts[0]?.x; nw.y1 = nw.pts[0]?.y;
    nw.x2  = nw.pts[nw.pts.length-1]?.x; nw.y2 = nw.pts[nw.pts.length-1]?.y;
    return nw;
  });
  state.elements.push(...newEls);
  state.wires.push(...newWires);
  // グループ構造を新IDで再作成
  state.page.groups = state.page.groups || [];
  (state.clipboard.groups || []).forEach(g => {
    const elIds   = g.elIds.map(id => idMap[id]).filter(Boolean);
    const wireIds = g.wireIds.map(id => idMap[id]).filter(Boolean);
    if (elIds.length + wireIds.length > 0) {
      state.page.groups.push({ id: genId('g'), elIds, wireIds });
    }
  });
  state.sel.els.clear(); state.sel.wires.clear();
  newEls.forEach(el => state.sel.els.add(el.id));
  newWires.forEach(w  => state.sel.wires.add(w.id));
  draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// 削除・選択
// ----------------------------------------------------------------
function delSel() {
  if (!state.sel.els.size && !state.sel.wires.size) return;
  pushH();
  state.page.elements = state.elements.filter(e => !state.sel.els.has(e.id));
  state.page.wires    = state.wires.filter(w    => !state.sel.wires.has(w.id));
  state.sel.els.clear(); state.sel.wires.clear();
  draw(); updateRightPanel();
}

function selectAll() {
  state.elements.forEach(el => state.sel.els.add(el.id));
  state.wires.forEach(w    => state.sel.wires.add(w.id));
  draw(); updateRightPanel();
}

function clearAll() {
  if (!confirm('全て消去しますか？')) return;
  pushH();
  state.page.elements = [];
  state.page.wires    = [];
  state.sel.els.clear(); state.sel.wires.clear();
  state.wirePoints = []; state.preview = null;
  draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// 変形
// ----------------------------------------------------------------
function rotateSel(deg) {
  const targets   = state.elements.filter(el => state.sel.els.has(el.id));
  const wireTargets = state.wires.filter(w => state.sel.wires.has(w.id));
  if (!targets.length && !wireTargets.length) return;
  pushH();

  // 単体シンボル選択（ワイヤーなし）→ 従来通り位置移動なし
  if (targets.length === 1 && !wireTargets.length) {
    const el = targets[0];
    const noRotTypes = ['text','rect','circle','fline'];
    if (!noRotTypes.includes(el.type)) el.rot = ((el.rot||0) + deg) % 360;
    draw(); updateRightPanel();
    return;
  }

  // グループ回転 ─ 選択全体のバウンディングボックス中心を軸に回転
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  // 全座標点を収集してバウンディングボックス中心を求める
  const allPts = [];
  function addPt(x, y) { if (x != null && y != null) allPts.push({x, y}); }
  targets.forEach(el => {
    addPt(el.x,  el.y);
    addPt(el.x1, el.y1);
    addPt(el.x2, el.y2);
    addPt(el.x3, el.y3);
    addPt(el.cx, el.cy);
    addPt(el.bx, el.by);
    if (el.w != null) addPt(el.x + el.w, el.y + (el.h||0));
    if (el.r  != null) {
      addPt(el.x + el.r, el.y); addPt(el.x - el.r, el.y);
      addPt(el.x, el.y + el.r); addPt(el.x, el.y - el.r);
    }
    if (el.pts) el.pts.forEach(p => addPt(p.x, p.y));
  });
  wireTargets.forEach(w => { if (w.pts) w.pts.forEach(p => addPt(p.x, p.y)); });

  if (!allPts.length) return;
  const minX = Math.min(...allPts.map(p => p.x));
  const maxX = Math.max(...allPts.map(p => p.x));
  const minY = Math.min(...allPts.map(p => p.y));
  const maxY = Math.max(...allPts.map(p => p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 点を中心回りに回転（浮動小数点誤差を丸める）
  function rotPt(x, y) {
    const dx = x - cx, dy = y - cy;
    const rx = cx + dx*cos - dy*sin;
    const ry = cy + dx*sin + dy*cos;
    return { x: Math.round(rx * 1000) / 1000, y: Math.round(ry * 1000) / 1000 };
  }

  // 各要素を回転
  targets.forEach(el => {
    if (el.type === 'rect') {
      // 4コーナーを回転してAABBを再計算
      const corners = [
        rotPt(el.x,       el.y),
        rotPt(el.x+el.w,  el.y),
        rotPt(el.x,       el.y+el.h),
        rotPt(el.x+el.w,  el.y+el.h)
      ];
      el.x = Math.min(...corners.map(c=>c.x));
      el.y = Math.min(...corners.map(c=>c.y));
      el.w = Math.max(...corners.map(c=>c.x)) - el.x;
      el.h = Math.max(...corners.map(c=>c.y)) - el.y;
    } else if (el.type === 'arc') {
      const p = rotPt(el.x, el.y);
      el.x = p.x; el.y = p.y;
      el.startA = (el.startA||0) + rad;
      el.endA   = (el.endA  ||0) + rad;
    } else {
      // 全座標を個別に回転
      if (el.x  != null) { const p=rotPt(el.x,  el.y);  el.x=p.x;  el.y=p.y;  }
      if (el.x1 != null) { const p=rotPt(el.x1, el.y1); el.x1=p.x; el.y1=p.y; }
      if (el.x2 != null) { const p=rotPt(el.x2, el.y2); el.x2=p.x; el.y2=p.y; }
      if (el.x3 != null) { const p=rotPt(el.x3, el.y3); el.x3=p.x; el.y3=p.y; }
      if (el.cx != null) { const p=rotPt(el.cx, el.cy); el.cx=p.x; el.cy=p.y; }
      if (el.bx != null) { const p=rotPt(el.bx, el.by); el.bx=p.x; el.by=p.y; }
      if (el.pts) {
        el.pts = el.pts.map(p => rotPt(p.x, p.y));
        el.x1 = el.pts[0]?.x; el.y1 = el.pts[0]?.y;
        el.x2 = el.pts[el.pts.length-1]?.x; el.y2 = el.pts[el.pts.length-1]?.y;
      }
      // シンボル系はrot（個別向き）も更新
      const noRotTypes = ['text','rect','circle','fline','triangle','dim','angle_dim','leader','bezier','junction'];
      if (!noRotTypes.includes(el.type)) el.rot = ((el.rot||0) + deg) % 360;
    }
  });

  // ワイヤーを回転
  wireTargets.forEach(w => {
    if (w.pts) {
      w.pts = w.pts.map(p => rotPt(p.x, p.y));
      w.x1 = w.pts[0]?.x; w.y1 = w.pts[0]?.y;
      w.x2 = w.pts[w.pts.length-1]?.x; w.y2 = w.pts[w.pts.length-1]?.y;
    }
  });

  draw(); updateRightPanel();
}

function flipSel(axis) {
  const targets = state.elements.filter(el => state.sel.els.has(el.id));
  if (!targets.length) return;
  pushH();
  targets.forEach(el => {
    if (axis === 'h') el.flipH = !el.flipH;
    else              el.flipV = !el.flipV;
  });
  draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// グループ操作
// ----------------------------------------------------------------
// 選択をグループ全体に拡張（クリック・範囲選択後に呼ぶ）
function expandSelToGroups() {
  const groups = state.page.groups || [];
  let changed = true;
  while (changed) {
    changed = false;
    groups.forEach(g => {
      const hit = g.elIds.some(id => state.sel.els.has(id)) ||
                  g.wireIds.some(id => state.sel.wires.has(id));
      if (hit) {
        g.elIds.forEach(id => { if (!state.sel.els.has(id))    { state.sel.els.add(id);    changed = true; } });
        g.wireIds.forEach(id => { if (!state.sel.wires.has(id)) { state.sel.wires.add(id); changed = true; } });
      }
    });
  }
}

function applyGroupMove() {
  const dx = +document.getElementById('gp-dx')?.value || 0;
  const dy = +document.getElementById('gp-dy')?.value || 0;
  if (dx === 0 && dy === 0) return;
  pushH();
  state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => moveEntity(el, dx, dy));
  state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w => moveEntity(w, dx, dy));
  draw(); updateRightPanel();
}

function groupSelected() {
  const elIds   = [...state.sel.els];
  const wireIds = [...state.sel.wires];
  if (!elIds.length && !wireIds.length) return;
  pushH();
  state.page.groups = state.page.groups || [];
  // 既存グループに含まれるメンバーを一旦解除してから新グループを作る
  state.page.groups = state.page.groups.filter(g =>
    !g.elIds.some(id => state.sel.els.has(id)) &&
    !g.wireIds.some(id => state.sel.wires.has(id))
  );
  state.page.groups.push({ id: genId('g'), elIds, wireIds });
  draw();
}

function ungroupSelected() {
  if (!(state.page.groups || []).some(g =>
    g.elIds.some(id => state.sel.els.has(id)) ||
    g.wireIds.some(id => state.sel.wires.has(id))
  )) return;
  pushH();
  state.page.groups = (state.page.groups || []).filter(g =>
    !g.elIds.some(id => state.sel.els.has(id)) &&
    !g.wireIds.some(id => state.sel.wires.has(id))
  );
  draw();
}

// ----------------------------------------------------------------
// シンボル分解
// ----------------------------------------------------------------
function explodeSelected() {
  const selEls = state.elements.filter(e => state.sel.els.has(e.id));
  const targets = selEls.filter(e => {
    const cS = state.customSymbols.find(s => s.type === e.type);
    return cS && cS.shapes && cS.shapes.length;
  });
  if (!targets.length) return;
  pushH();
  const newIds = [];
  targets.forEach(el => {
    const cS = state.customSymbols.find(s => s.type === el.type);
    const sc = el.scale || 1;
    const rot = (el.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const fH = el.flipH ? -1 : 1, fV = el.flipV ? -1 : 1;
    const tx = (lx, ly) => {
      const sx = lx * fH * sc, sy = ly * fV * sc;
      return { x: el.x + sx * cosR - sy * sinR, y: el.y + sx * sinR + sy * cosR };
    };
    const lay = el.layer || activeLayer();
    const col = el.color || undefined;
    cS.shapes.forEach(s => {
      if (s.t === 'L') {
        const id = genId('el');
        const p1 = tx(s.x1, s.y1), p2 = tx(s.x2, s.y2);
        state.elements.push({ id, type: 'fline', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, layer: lay, color: col });
        newIds.push(id);
      } else if (s.t === 'C') {
        const id = genId('el');
        const c = tx(s.cx, s.cy);
        state.elements.push({ id, type: 'circle', x: c.x, y: c.y, r: s.r * sc, layer: lay, color: col });
        newIds.push(id);
      } else if (s.t === 'A') {
        const id = genId('el');
        const c = tx(s.cx, s.cy);
        state.elements.push({ id, type: 'arc', x: c.x, y: c.y, r: s.r * sc, startA: s.sa * Math.PI / 180 + rot, endA: s.ea * Math.PI / 180 + rot, layer: lay, color: col });
        newIds.push(id);
      } else if (s.t === 'P' && s.pts && s.pts.length >= 2) {
        const pts = s.pts.map(p => tx(p[0], p[1]));
        for (let k = 0; k < pts.length - 1; k++) {
          const id = genId('el');
          state.elements.push({ id, type: 'fline', x1: pts[k].x, y1: pts[k].y, x2: pts[k+1].x, y2: pts[k+1].y, layer: lay, color: col });
          newIds.push(id);
        }
        if (s.cl && pts.length >= 2) {
          const id = genId('el');
          state.elements.push({ id, type: 'fline', x1: pts[pts.length-1].x, y1: pts[pts.length-1].y, x2: pts[0].x, y2: pts[0].y, layer: lay, color: col });
          newIds.push(id);
        }
      }
    });
    // 元のシンボル要素を削除
    state.page.elements = state.elements.filter(e => e.id !== el.id);
  });
  // 分解後の要素を選択状態にする
  state.sel.els.clear();
  newIds.forEach(id => state.sel.els.add(id));
  updateRightPanel();
  updateResizeHandles();
  draw();
}

// ----------------------------------------------------------------
// キーボードショートカット
// ----------------------------------------------------------------
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  // Shiftキーで一時的に直交ON（F8トグルと独立して管理）
  if (e.key === 'Shift' && !e.repeat && !state.ortho) {
    state._shiftOrtho = true;
    state.ortho = true;
    document.getElementById('rb-ortho')?.classList.add('on');
    return;
  }

  if (e.ctrlKey) {
    switch (e.key) {
      case 'z': case 'Z': e.preventDefault(); undo(); break;
      case 'y': case 'Y': e.preventDefault(); redo(); break;
      case 's': e.preventDefault(); saveProject(); break;
      case 'a': e.preventDefault(); selectAll(); break;
      case 'c': case 'C': e.preventDefault(); copySelected(); break;
      case 'x': case 'X': e.preventDefault(); cutSelected(); break;
      case 'v': case 'V': e.preventDefault(); pasteSelected(); break;
      case 'g': case 'G':
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        break;
      case 'Tab': e.preventDefault();
        switchPage((state.currentPage + (e.shiftKey ? -1 : 1) + state.pages.length) % state.pages.length);
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Delete': case 'Backspace': e.preventDefault(); delSel(); break;
    case 'Enter':
      if (state.mode === 'bezier' && state.mouse.bezierPts?.length >= 2) {
        e.preventDefault(); currentTool().confirm();
      }
      break;
    case 'Escape':
      if (state.mode === 'bezier') {
        state.mouse.bezierPts = null; state.preview = null;
        setMode('select'); draw(); break;
      }
      if (document.getElementById('pdf-preview-overlay')?.style.display === 'flex') { closePDFPreview(); break; }
      if (document.body.classList.contains('fullscreen')) { toggleExpand(); break; }
      state.wirePoints = []; state.preview = null; state.dimState = null;
      state.mouse.shapeStart = null; state.mouse.arcP1 = null; state.mouse.arcP2 = null; state.mouse.arc3P1 = null; state.mouse.arc3P2 = null; state.mouse.triP1 = null; state.mouse.triP2 = null;
      state.mode = 'select'; state.symType = null;
      document.querySelectorAll('.sym-item').forEach(el => el.classList.remove('on'));
      document.getElementById('rb-sel')?.classList.add('on');
      document.getElementById('rb-wire')?.classList.remove('on');
      draw(); updateHint(); break;
    case 's': setMode('select'); break;
    case 'w': setMode('wire'); break;
    case 't': setMode('text'); break;
    case 'r': rotateSel(90); break;
    case 'h': flipSel('h'); break;
    case 'v': flipSel('v'); break;
    case '+': case '=': doZoom(1.25); break;
    case '-': doZoom(0.8); break;
    case '0': resetView(); break;
    case 'F8': e.preventDefault(); toggleOrtho(); break;
  }

  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && state.sel.els.size) {
    e.preventDefault();
    // Ctrl+矢印: 0.001刻み / Alt+矢印: 0.1刻み / Shift+矢印: グリッド / 普通: 2
    const step = e.ctrlKey ? 0.1 : e.shiftKey ? state.G : 1;
    pushH();
    const dx = e.key==='ArrowLeft' ? -step : e.key==='ArrowRight' ? step : 0;
    const dy = e.key==='ArrowUp'   ? -step : e.key==='ArrowDown'  ? step : 0;
    state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => moveEntity(el, dx, dy));
    state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w => moveEntity(w, dx, dy));
    draw();
  }
});

// ================================================================
// 表紙ページ生成
// ================================================================
function insertCoverPage() {
  _syncCurrentPage();

  const frames = state.pages.map((p,i) => ({
    idx: i, name: p.name || ('Sheet'+(i+1)), f: p.frameObj || {},
  }));

  const base = state.pages[0]?.frameObj || state.frameObj || {};
  const title   = base.title   || '無題';
  const company = base.company || '';
  const equip   = base.equip   || '';
  const author  = base.author  || '';
  const approve = base.approve || '';
  const date    = base.date    || '';
  const drawno  = base.drawno  || '';
  const rev     = base.rev     || '';

  // キャンバス: 外枠 20-820 x 20-574
  const W = 840, H = 594;
  const mx = 20, my = 20; // 外枠左上
  const mw = 800, mh = 554; // 内部幅高さ
  const cx = mx + mw/2; // 中心X = 420

  function txt(id, x, y, text, fs=14, align='center') {
    return { id, type:'text', x, y, rot:0, flipH:false, flipV:false,
             label:'', text, fs, partRef:'', terminals:'', layer:'注記', wireNo:'', note:'' };
  }
  function fl(id, x1, y1, x2, y2, lw=1) {
    return { id, type:'fline', x1, y1, x2, y2, rot:0, flipH:false, flipV:false,
             label:'', partRef:'', terminals:'', layer:'外形', wireNo:'', note:'', lineWidth:lw };
  }
  function box(id0, x1, y1, x2, y2, lw=1) {
    return [
      fl(id0+'a', x1, y1, x2, y1, lw), fl(id0+'b', x2, y1, x2, y2, lw),
      fl(id0+'c', x2, y2, x1, y2, lw), fl(id0+'d', x1, y2, x1, y1, lw),
    ];
  }

  const els = []; let n = 0;
  const id = () => 'cv_' + (n++);

  // 外枠（太線）
  els.push(...box('outer', mx, my, mx+mw, my+mh, 2));

  // ── ロゴエリア（左上 小さめ）
  els.push(...box('logo', mx, my, mx+150, my+60));
  els.push(txt(id(), mx+75, my+33, '（ロゴ）', 9));

  // ── 下部情報欄の高さを先に計算
  const infoH = 40;
  const infoY = my + mh - infoH;

  // ── ページリストの高さを計算
  const lh = 22;
  const listH = 42 + frames.length * lh; // ヘッダ+行
  const listW = mw - 80;
  const lx = mx + 40;
  const lrx = lx + listW;

  // ── 残り高さを3分割: タイトルエリア / ページリスト / 余白
  const bodyH = infoY - my;           // 情報欄より上の高さ
  const listTop = my + bodyH / 2 - listH / 2; // ページリストを縦中央に
  const lt = Math.round(listTop);
  const lb = lt + listH;

  // タイトル位置（ページリストより上の空間の中央）
  const titleAreaMid = my + (lt - my) / 2;
  const titleY = Math.round(titleAreaMid - 10);
  els.push(txt(id(), cx, titleY, title, 36));
  if (equip) els.push(txt(id(), cx, titleY + 46, equip, 16));

  // ── ページリスト
  els.push(...box('plst', lx, lt, lrx, lb));
  // ヘッダ
  els.push(fl(id(), lx, lt+20, lrx, lt+20));
  els.push(txt(id(), cx, lt+12, 'ページリスト', 10));
  // 列位置定義（縦線なし）
  const nc = lx+60, pc = lx+Math.round(listW*0.45), dc = lx+Math.round(listW*0.75);
  // 列ヘッダ
  els.push(fl(id(), lx, lt+40, lrx, lt+40));
  els.push(txt(id(), lx+30, lt+32, 'No.', 9));
  els.push(txt(id(), (lx+nc+pc)/2, lt+32, 'ページ名', 9));
  els.push(txt(id(), (nc+pc+dc)/2, lt+32, '図面番号', 9));
  els.push(txt(id(), (dc+lrx)/2, lt+32, 'Rev', 9));

  frames.forEach((pg, i) => {
    const y = lt + 52 + i * lh;
    els.push(txt(id(), lx+30, y, String(i+1), 10));
    els.push(txt(id(), (lx+60+pc)/2, y, pg.name, 10));
    els.push(txt(id(), (pc+dc)/2, y, pg.f.drawno||'', 10));
    els.push(txt(id(), (dc+lrx)/2, y, pg.f.rev||'', 10));
    if (i < frames.length-1) els.push(fl(id(), lx, y+12, lrx, y+12));
  });

  // ── 情報欄（最下部）
  els.push(fl(id(), mx, infoY, mx+mw, infoY));
  const cols = [
    { lbl:'図面番号', val:drawno, w:150 },
    { lbl:'作成',     val:author, w:110 },
    { lbl:'承認',     val:approve,w:110 },
    { lbl:'日付',     val:date,   w:130 },
    { lbl:'Rev',      val:rev,    w:80  },
    { lbl:'会社名',   val:company,w:220 },
  ];
  let cx2 = mx;
  cols.forEach((c, i) => {
    if (i > 0) els.push(fl(id(), cx2, infoY, cx2, my+mh));
    els.push(txt(id(), cx2+6, infoY+7, c.lbl, 8));
    els.push(txt(id(), cx2+6, infoY+24, c.val, 10));
    cx2 += c.w;
  });

  pushH();
  // 表紙ページは図面枠を描画しない（isCover=trueで制御）
  const coverFrame = Object.assign({}, state.frameObj, { title, drawno, page:'表紙', isCover:true });
  state.pages.unshift({ name:'表紙', elements:els, wires:[], groups:[], frameObj:coverFrame, dirty:true });
  switchPage(0);
  alert('表紙ページを先頭に挿入しました。');
}


// ================================================================
// マスクモード
// ================================================================
const MASK_FIELDS = ['company', 'equip', 'author', 'approve', 'date'];

function toggleMask() {
  state.maskMode = !state.maskMode;
  const btn = document.getElementById('rb-mask');
  if (btn) {
    btn.style.background = state.maskMode ? 'var(--accent)' : '';
    btn.style.color = state.maskMode ? '#fff' : '';
  }
  const status = state.maskMode ? 'ON（個人情報マスク中）' : 'OFF';
  console.log('[mask] マスクモード:', status);
}

// frameObjのマスク済みコピーを返す
function maskedFrame(frameObj) {
  if (!frameObj || !state.maskMode) return frameObj;
  const f = { ...frameObj };
  MASK_FIELDS.forEach(k => { if (f[k]) f[k] = '***'; });
  return f;
}

