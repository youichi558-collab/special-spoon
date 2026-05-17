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
// ----------------------------------------------------------------
// 共通移動関数
// ----------------------------------------------------------------
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
    moveEntity(ne, off, off);
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
      case 'c': case 'C': e.preventDefault(); copySelected(); break;
      case 'x': case 'X': e.preventDefault(); cutSelected(); break;
      case 'v': case 'V': e.preventDefault(); pasteSelected(); break;
      case 'g': case 'G': e.preventDefault(); groupSelected(); break;
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
    const step = e.shiftKey ? state.G : 2;
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
  // 列区切り（枠内のみ: lt+1 〜 lb-1）
  const nc = lx+60, pc = lx+Math.round(listW*0.45), dc = lx+Math.round(listW*0.75);
  [nc, pc, dc].forEach(x => els.push(fl(id(), x, lt+1, x, lb-1)));
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

