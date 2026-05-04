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
  const data = {
    version: 2,
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    customParts:   state.customParts,
    wireNoRule:    state.wireNoRule,
    layers:        LAYERS,
    pages: [pg],
  };
  dl(JSON.stringify(data, null, 2), _pageFileName(pg, state.currentPage) + '.json', 'application/json');
  pg.dirty = false;
  renderPageTabs();
}

function saveAllProject() {
  // 全ページまとめて保存
  _syncCurrentPage();
  const data = {
    version: 2,
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    customParts:   state.customParts,
    wireNoRule:    state.wireNoRule,
    layers:        LAYERS,
    pages: state.pages,
  };
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
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
        state.pages        = d.pages || [{ name:'Sheet1', elements:[], wires:[], groups:[], frameObj:null }];
        state.wireNoRule   = d.wireNoRule || state.wireNoRule;
        state.customSymbols= d.customSymbols || [];
        state.customParts  = d.customParts   || [];
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
function copySelected() {
  const els   = state.elements.filter(el => state.sel.els.has(el.id));
  const wires = state.wires.filter(w   => state.sel.wires.has(w.id));
  if (!els.length && !wires.length) return;
  state.clipboard = {
    els:   JSON.parse(JSON.stringify(els)),
    wires: JSON.parse(JSON.stringify(wires)),
  };
}

function cutSelected() { copySelected(); delSel(); }

function pasteSelected() {
  if (!state.clipboard?.els) return;
  pushH();
  const off = state.G * 2;
  function offsetEl(el) {
    const ne = JSON.parse(JSON.stringify(el));
    ne.id = genId('el');
    // x,y（中心・基準点）
    if (ne.x != null) ne.x += off;
    if (ne.y != null) ne.y += off;
    // 2点系（fline/dim/leader）
    if (ne.x1 != null) ne.x1 += off;
    if (ne.y1 != null) ne.y1 += off;
    if (ne.x2 != null) ne.x2 += off;
    if (ne.y2 != null) ne.y2 += off;
    // leader折れ曲がり点
    if (ne.bx != null) ne.bx += off;
    if (ne.by != null) ne.by += off;
    return ne;
  }
  const newEls = state.clipboard.els.map(offsetEl);
  const newWires = state.clipboard.wires.map(w => {
    const nw = JSON.parse(JSON.stringify(w));
    nw.id  = genId('w');
    nw.pts = (nw.pts||[]).map(p => ({ x: p.x+off, y: p.y+off }));
    nw.x1  = nw.pts[0]?.x; nw.y1 = nw.pts[0]?.y;
    nw.x2  = nw.pts[nw.pts.length-1]?.x; nw.y2 = nw.pts[nw.pts.length-1]?.y;
    return nw;
  });
  state.elements.push(...newEls);
  state.wires.push(...newWires);
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
  const skipTypes = ['text','rect','circle','fline'];
  const targets = state.elements.filter(el => state.sel.els.has(el.id) && !skipTypes.includes(el.type));
  if (!targets.length) return;
  pushH();
  targets.forEach(el => { el.rot = ((el.rot||0) + deg) % 360; });
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
function groupSelected() {
  const elIds   = [...state.sel.els];
  const wireIds = [...state.sel.wires];
  if (!elIds.length && !wireIds.length) return;
  pushH();
  const id = genId('g');
  state.page.groups = state.page.groups || [];
  state.page.groups.push({ id, elIds, wireIds });
  draw();
}

function ungroupSelected() {
  pushH();
  state.page.groups = (state.page.groups || []).filter(g =>
    !g.elIds.some(id => state.sel.els.has(id)) &&
    !g.wireIds.some(id => state.sel.wires.has(id))
  );
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
      case 'c': e.preventDefault(); copySelected(); break;
      case 'x': e.preventDefault(); cutSelected(); break;
      case 'v': e.preventDefault(); pasteSelected(); break;
      case 'g': e.preventDefault(); groupSelected(); break;
      case 'Tab': e.preventDefault();
        switchPage((state.currentPage + (e.shiftKey ? -1 : 1) + state.pages.length) % state.pages.length);
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Delete': case 'Backspace': e.preventDefault(); delSel(); break;
    case 'Escape':
      if (document.getElementById('pdf-preview-overlay')?.style.display === 'flex') { closePDFPreview(); break; }
      if (document.body.classList.contains('fullscreen')) { toggleExpand(); break; }
      state.wirePoints = []; state.preview = null; state.dimState = null;
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
    const step = e.shiftKey ? state.G : 2;
    pushH();
    state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => {
      if (el.x != null) {
        if (e.key === 'ArrowLeft')  el.x -= step;
        if (e.key === 'ArrowRight') el.x += step;
        if (e.key === 'ArrowUp')    el.y -= step;
        if (e.key === 'ArrowDown')  el.y += step;
      }
    });
    draw();
  }
});
