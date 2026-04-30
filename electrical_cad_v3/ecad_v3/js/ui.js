// ================================================================
// ui.js — UI操作（state参照版）
// ================================================================

// ----------------------------------------------------------------
// リボンタブ
// ----------------------------------------------------------------
function switchRibbon(name, el) {
  document.querySelectorAll('.rg-wrap').forEach(e => e.style.display = 'none');
  const t = document.getElementById('rp-' + name); if (t) t.style.display = 'flex';
  document.querySelectorAll('.rtab').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
}

function switchLTab(name, el) {
  ['sym','lay','prt','cus'].forEach(n => document.getElementById('lt-'+n).style.display = n===name ? 'block' : 'none');
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  if (name==='lay') renderLayers();
  if (name==='prt') renderPartsAll();
  if (name==='cus') renderCustomSymbols();
}

// ----------------------------------------------------------------
// レイヤー
// ----------------------------------------------------------------
function renderLayers() {
  document.getElementById('layer-list').innerHTML = LAYERS.map((l, i) => `
    <div class="lr ${l.active?'al':''}" onclick="setActLayer(${i})">
      <div class="lv" onclick="event.stopPropagation();togLayVis(${i})">${l.visible?'●':'○'}</div>
      <div class="lc" style="background:${l.color}"></div>
      <span class="ln">${l.name}</span>
    </div>`).join('');
  document.getElementById('s-lay').textContent = LAYERS.find(l => l.active)?.name || '回路';
}
function setActLayer(i) { LAYERS.forEach((l,j) => l.active = j===i); renderLayers(); }
function togLayVis(i)   { LAYERS[i].visible = !LAYERS[i].visible; renderLayers(); draw(); }
function addLayer() {
  const n = prompt('レイヤー名:');
  if (n) { LAYERS.push({ name:n, color:'#888', visible:true, active:false }); renderLayers(); }
}

// ----------------------------------------------------------------
// シンボル配置
// ----------------------------------------------------------------
function pickSym(el, type) {
  document.querySelectorAll('.sym-item').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  setMode('sym', type);
  updateHint();
}

// ----------------------------------------------------------------
// 部品DB
// ----------------------------------------------------------------
function allParts() {
  return [...BUILTIN_PARTS, ...state.customParts.map(p => ({ ...p, custom:true }))];
}
function renderPartsAll()  { renderPartsTable(allParts()); }
function filterParts(q)    { renderPartsTable(allParts().filter(p => !q || p.ref.toLowerCase().includes(q.toLowerCase()) || p.maker.toLowerCase().includes(q.toLowerCase()))); }
function renderPartsTable(parts) {
  document.getElementById('parts-table').innerHTML = parts.map(p => `
    <div style="padding:4px 3px;border-bottom:1px solid var(--bg4);cursor:pointer" onclick="placePart('${p.type}','${p.ref}','${p.terminals||''}')">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;font-weight:600;color:var(--fg)">${p.ref}</span>
        ${p.custom?`<span onclick="event.stopPropagation();deletePart('${p.ref}')" style="font-size:9px;color:var(--red);cursor:pointer">×</span>`:''}
      </div>
      <div style="font-size:10px;color:var(--fg3)">${p.maker} ${p.volt||''} ${p.amp||''}</div>
      ${p.contacts?`<div style="font-size:10px;color:var(--acc)">接点:${p.contacts}</div>`:''}
    </div>`).join('');
}
function deletePart(ref) {
  if (!confirm(`「${ref}」を削除しますか？`)) return;
  state.customParts = state.customParts.filter(p => p.ref !== ref);
  renderPartsAll();
}
function placePart(type, ref, terminals) {
  state.symType    = type;
  state.pendingRef = ref;
  state.pendingTerm= terminals;
  document.querySelectorAll('.sym-item').forEach(e => e.classList.remove('on'));
  setMode('sym', type);
  document.getElementById('s-hint').textContent = `「${ref}」→ クリックで配置`;
}
function showPartReg() { document.getElementById('part-reg-p').classList.add('open'); }
function saveCusPart() {
  const ref = document.getElementById('pr-ref').value.trim();
  if (!ref) { alert('型番を入力してください'); return; }
  const part = {
    maker: document.getElementById('pr-maker').value,
    ref, type: document.getElementById('pr-type').value,
    volt: document.getElementById('pr-volt').value, amp: document.getElementById('pr-amp').value,
    terminals: document.getElementById('pr-term').value, contacts: document.getElementById('pr-contacts').value,
    note: document.getElementById('pr-note').value, custom: true,
  };
  state.customParts.push(part);
  renderPartsAll(); closeFP('part-reg-p'); alert(`「${ref}」を登録しました`);
}

// ----------------------------------------------------------------
// カスタムシンボル（シンプル版）
// ----------------------------------------------------------------
function showSymReg()       { alert('シンボル登録は現在準備中です'); }
function registerAsSymbol() { alert('シンボル登録は現在準備中です'); }

function renderCustomSymbols() {
  const el = document.getElementById('cus-list');
  if (!state.customSymbols.length) { el.innerHTML = '<p style="font-size:11px;color:var(--fg3);padding:4px">登録済みシンボルがありません</p>'; return; }
  const grps = {};
  state.customSymbols.forEach(s => { if (!grps[s.cat]) grps[s.cat]=[]; grps[s.cat].push(s); });
  el.innerHTML = Object.entries(grps).map(([cat,syms]) =>
    `<h4>${cat}</h4>` + syms.map(s =>
      `<div class="sym-item" onclick="pickSym(this,'${s.type}')"><span>${s.name}</span>
      <span onclick="event.stopPropagation();delCusSym('${s.type}')" style="margin-left:auto;color:var(--red);font-size:10px;cursor:pointer">×</span></div>`
    ).join('')
  ).join('');
}
function delCusSym(type) {
  if (!confirm('削除しますか？')) return;
  state.customSymbols = state.customSymbols.filter(s => s.type !== type);
  delete DEFS[type];

  renderCustomSymbols();
}

// ----------------------------------------------------------------
// ページタブ
// ----------------------------------------------------------------
function renderPageTabs() {
  const el = document.getElementById('page-tabs'); if (!el) return;
  el.innerHTML = state.pages.map((p,i) =>
    `<div class="page-tab${i===state.currentPage?' active':''}" onclick="switchPage(${i})" ondblclick="renamePage(${i})">${p.name||('Sheet'+(i+1))}</div>`
  ).join('') + `<div class="page-tab-add" onclick="addPage()">＋</div>`;
}

function switchPage(idx) {
  if (idx < 0 || idx >= state.pages.length) return;
  state.pages[state.currentPage].elements = state.elements;
  state.pages[state.currentPage].wires    = state.wires;
  state.pages[state.currentPage].frameObj = state.frameObj;
  state.currentPage = idx;
  state.sel.els.clear(); state.sel.wires.clear();
  renderPageTabs(); draw(); updateRightPanel();
}

function addPage() {
  state.pages[state.currentPage].elements = state.elements;
  state.pages[state.currentPage].wires    = state.wires;
  state.pages[state.currentPage].frameObj = state.frameObj;
  state.pages.push({ name:'Sheet'+(state.pages.length+1), elements:[], wires:[], frameObj:null });
  switchPage(state.pages.length - 1);
}

function renamePage(idx) {
  const name = prompt('ページ名:', state.pages[idx].name || ('Sheet'+(idx+1)));
  if (name !== null && name.trim()) { state.pages[idx].name = name.trim(); renderPageTabs(); }
}

// ----------------------------------------------------------------
// 右パネル（プロパティ）
// ----------------------------------------------------------------
function updateRightPanel() {
  const el  = state.sel.els.size  === 1 ? state.elements.find(e => state.sel.els.has(e.id))   : null;
  const wire= state.sel.wires.size === 1 ? state.wires.find(w    => state.sel.wires.has(w.id)) : null;
  const rp  = document.getElementById('rp-body');

  if (!el && !wire) {
    // 選択なし → 保存ファイル名 + 図面枠プロパティ
    let html = `<div class="pp-row"><label>保存ファイル名</label><input type="text" id="rp-savename" value="${state.saveFileName}" placeholder="例: 制御盤A回路図" onchange="state.saveFileName=this.value.trim()"></div>`;
    if (state.frameObj) {
      const f = state.frameObj;
      html += `<p style="font-size:10px;font-weight:600;color:var(--fg4);padding:6px 10px 2px">図面枠プロパティ</p>
        <div class="pp-row"><label>図面名称</label><input type="text" id="fp-title"  value="${f.title||''}"></div>
        <div class="pp-row"><label>図面番号</label><input type="text" id="fp-drawno" value="${f.drawno||''}"></div>
        <div class="pp-row"><label>作成者</label><input type="text" id="fp-author"  value="${f.author||''}"></div>
        <div class="pp-row"><label>日付</label><input type="text" id="fp-date"   value="${f.date||''}"></div>
        <div class="pp-row"><label>改訂番号</label><input type="text" id="fp-rev"    value="${f.rev||''}"></div>
        <button class="pp-apply" onclick="applyFrameProps()">適用</button>`;
    }
    rp.innerHTML = html; return;
  }

  const item = el || wire;
  let html = '';

  if (el && el.type === 'text') {
    html += `<div class="pp-row"><label>テキスト</label><textarea rows="2" id="pp-text">${el.text||''}</textarea></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-fs" value="${el.fs||14}" min="8" max="72"></div>`;
  } else if (wire || (el && el.pts)) {
    html += `<div class="pp-row"><label>線番</label><input type="text" id="pp-wireno" value="${item.wireNo||''}"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${item.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
  } else if (el) {
    const def = getDef(el.type) || {};
    html += `<div class="pp-row"><label>ラベル</label><input type="text" id="pp-label" value="${el.label||''}"></div>`;
    if (def.isCoil)    html += `<div class="pp-row"><label>コイル名</label><input type="text" id="pp-coilname" value="${el.coilName||el.label||''}"></div>`;
    if (def.isContact) html += `<div class="pp-row"><label>参照コイル名</label><input type="text" id="pp-refcoil" value="${el.refCoil||''}"></div>`;
    html += `<div class="pp-row"><label>端子番号</label><input type="text" id="pp-term" value="${el.terminals||''}"></div>`;
    html += `<div class="pp-row"><label>線番</label><input type="text" id="pp-wireno" value="${el.wireNo||''}"></div>`;
    html += `<div class="pp-row"><label>回転(°)</label><input type="number" id="pp-rot" value="${el.rot||0}" step="90"></div>`;
    html += `<div class="pp-row"><label>ラベル位置X補正</label><input type="number" id="pp-lox" value="${el.labelOffX||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>ラベル位置Y補正</label><input type="number" id="pp-loy" value="${el.labelOffY||''}" placeholder="自動" step="5"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    if (def.jis) html += `<div class="pp-row"><label style="color:var(--fg4)">JIS規格</label><p style="font-size:10px;color:var(--fg3);padding:2px 5px">${def.jis}</p></div>`;
    html += `<div class="pp-row"><label>メモ</label><textarea rows="2" id="pp-note">${el.note||''}</textarea></div>`;
  }

  html += `<button class="pp-apply" onclick="applyRightPanel()">適用</button>`;
  rp.innerHTML = html; rp._el = el; rp._wire = wire;
}

function applyRightPanel() {
  const rp   = document.getElementById('rp-body');
  const el   = rp._el, wire = rp._wire;
  const item = el || wire;
  if (!item) return;
  pushH();
  const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  if (el && el.type === 'text') {
    el.text = v('pp-text'); el.fs = parseInt(v('pp-fs'))||14;
  } else if (wire) {
    wire.wireNo = v('pp-wireno'); wire.layer = v('pp-layer');
  } else if (el) {
    el.label     = v('pp-label');
    el.coilName  = v('pp-coilname');
    el.refCoil   = v('pp-refcoil');
    el.terminals = v('pp-term');
    el.wireNo    = v('pp-wireno');
    el.rot       = parseInt(v('pp-rot'))||0;
    el.labelOffX = parseInt(v('pp-lox'))||0;
    el.labelOffY = v('pp-loy') ? parseInt(v('pp-loy')) : undefined;
    el.layer     = v('pp-layer');
    el.note      = v('pp-note');
  }
  draw();
}

function applyFrameProps() {
  if (!state.frameObj) return;
  const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  state.frameObj.title  = v('fp-title');
  state.frameObj.drawno = v('fp-drawno');
  state.frameObj.author = v('fp-author');
  state.frameObj.date   = v('fp-date');
  state.frameObj.rev    = v('fp-rev');
  state.pages[state.currentPage].frameObj = state.frameObj;
  draw();
}

function showPropPanel() { if (state.sel.els.size >= 1 || state.sel.wires.size >= 1) updateRightPanel(); }

// ----------------------------------------------------------------
// コンテキストメニュー
// ----------------------------------------------------------------
function showCtx(cx, cy) {
  const menu = document.getElementById('ctxmenu');
  const hasSel = state.sel.els.size + state.sel.wires.size > 0;
  ['ctx-cut','ctx-copy','ctx-del','ctx-rot','ctx-fliph'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.toggle('disabled', !hasSel);
  });
  menu.style.left = cx + 'px'; menu.style.top = cy + 'px';
  menu.classList.add('open');
}

function hideCtx() { document.getElementById('ctxmenu').classList.remove('open'); }

document.addEventListener('click', () => hideCtx());

// ----------------------------------------------------------------
// ユーティリティ
// ----------------------------------------------------------------
function closeFP(id) { document.getElementById(id)?.classList.remove('open'); }

function updateHint() {
  const hints = {
    select: '左クリック選択/ドラッグ移動 | Sh+クリック複数選択 | ドラッグ空き:範囲選択',
    wire:   'クリック始点→クリック終点 | Escキャンセル | 右クリックキャンセル',
    text:   'クリックしてテキストを配置',
    rect:   '1点目クリック → 2点目クリック',
    circle: '中心クリック → 半径クリック',
    fline:  '1点目クリック → 2点目クリック',
    sym:    'クリックで配置 | Escでキャンセル',
  };
  const el = document.getElementById('s-hint');
  if (el) el.textContent = hints[state.mode] || '';
}

function toggleDark() {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle('dk', state.darkMode);
  draw();
}
