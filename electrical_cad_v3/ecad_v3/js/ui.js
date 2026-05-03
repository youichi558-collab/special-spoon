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
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  if (name === 'lay') {
    ['sym','lay','prt','cus'].forEach(n => document.getElementById('lt-'+n).style.display = 'none');
    const fp = document.getElementById('lay-float');
    const hidden = !fp || fp.style.display === '' || fp.style.display === 'none';
    if (fp) {
      fp.style.display = hidden ? 'block' : 'none';
      if (hidden) { renderLayers(); initLayFloat(); }
    }
    return;
  }
  ['sym','lay','prt','cus'].forEach(n => document.getElementById('lt-'+n).style.display = n===name ? 'block' : 'none');
  if (name==='prt') renderPartsAll();
  if (name==='cus') renderCustomSymbols();
}
function closeLayFloat() {
  document.getElementById('lay-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  // シンボルタブに戻す
  const symTab = document.querySelector('.lt');
  if (symTab) { symTab.classList.add('on'); document.getElementById('lt-sym').style.display = 'block'; }
}

// ----------------------------------------------------------------
// レイヤー
// ----------------------------------------------------------------
function renderLayers() {
  const dashLabels = { solid:'実線', dashed:'破線', dotted:'点線', dashdot:'一点鎖線' };
  // フローティングパネルのテーブル
  const tbody = document.getElementById('lay-float-body');
  if (tbody) {
    const allVis    = LAYERS.every(l => l.visible);
    const allLocked = LAYERS.every(l => l.locked);
    const bulkRow = `
      <tr style="background:var(--bg3);border-bottom:2px solid var(--bd2)">
        <td style="padding:4px 6px;text-align:center;cursor:pointer" onclick="bulkLayVis()" title="全表示/非表示切替">
          <span style="font-size:13px;color:${allVis?'var(--fg)':'var(--fg3)'}">${allVis?'●':'○'}</span>
        </td>
        <td style="padding:4px 6px;text-align:center;cursor:pointer" onclick="bulkLayLock()" title="全ロック/解除切替">
          <span style="font-size:13px;color:${allLocked?'#e55':'var(--fg3)'}">${allLocked?'🔒':'🔓'}</span>
        </td>
        <td colspan="6" style="padding:4px 6px;font-size:10px;color:var(--fg3)">← 一括切替</td>
      </tr>`;
    tbody.innerHTML = bulkRow + LAYERS.map((l, i) => `
      <tr style="background:${l.active?'var(--acc-dim,rgba(0,103,192,0.12))':'var(--bg2)'};border-bottom:1px solid var(--bd2);cursor:pointer" onclick="setActLayer(${i})">
        <td style="padding:4px 6px;text-align:center" onclick="event.stopPropagation();togLayVis(${i})" title="表示切替">
          <span style="font-size:13px;color:${l.visible?'var(--fg)':'var(--fg3)'}">${l.visible?'●':'○'}</span>
        </td>
        <td style="padding:4px 6px;text-align:center" onclick="event.stopPropagation();togLayLock(${i})" title="ロック切替">
          <span style="font-size:13px;color:${l.locked?'#e55':'var(--fg3)'}">${l.locked?'🔒':'🔓'}</span>
        </td>
        <td style="padding:4px 8px;text-align:center" onclick="event.stopPropagation();changeLayColor(${i})" title="色変更">
          <div style="width:20px;height:20px;background:${l.color};border-radius:3px;border:1px solid var(--bd2);cursor:pointer;margin:auto"></div>
        </td>
        <td style="padding:4px 6px;color:var(--fg);text-decoration:${l.visible?'none':'line-through'};white-space:nowrap;font-weight:${l.active?'600':'400'}">
          ${l.name}${l.locked?' 🔒':''}
        </td>
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <select style="font-size:10px;padding:2px 3px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:2px;width:80px"
            onchange="LAYERS[${i}].lineDash=this.value;draw()">
            ${['solid','dashed','dotted','dashdot'].map(d=>`<option value="${d}"${(l.lineDash||'solid')===d?' selected':''}>${dashLabels[d]}</option>`).join('')}
          </select>
        </td>
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <input type="number" min="0.5" max="10" step="0.5" value="${l.lineWidth||1}"
            style="width:80px;font-size:12px;padding:2px 4px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:2px"
            onchange="LAYERS[${i}].lineWidth=parseFloat(this.value)||1;draw()">
        </td>
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <input type="number" min="6" max="72" step="1" placeholder="個別" ${l.fontSize!=null?`value="${l.fontSize}"`:''}
            style="width:80px;font-size:12px;padding:2px 4px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:2px"
            onchange="applyLayerFontSize(${i},this.value)" oninput="if(!this.value){applyLayerFontSize(${i},null)}">
        </td>
        <td style="padding:4px 6px;text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
          <span onclick="renameLayer(${i})" title="名前変更" style="cursor:pointer;color:var(--fg3);margin-right:6px">✏</span>
          ${LAYERS.length>1?`<span onclick="deleteLayer(${i})" title="削除" style="cursor:pointer;color:var(--red)">×</span>`:''}
        </td>
      </tr>`).join('');
  }
  // サイドバーの旧リストも更新（互換）
  const ll = document.getElementById('layer-list');
  if (ll) ll.innerHTML = '';
  document.getElementById('s-lay').textContent = LAYERS.find(l => l.active)?.name || '回路';
}
function setActLayer(i) { LAYERS.forEach((l,j) => l.active = j===i); renderLayers(); }
function togLayVis(i)   { LAYERS[i].visible = !LAYERS[i].visible; renderLayers(); draw(); }
function togLayLock(i)  {
  if (LAYERS[i].active && !LAYERS[i].locked) {
    const next = LAYERS.findIndex((l,j)=>j!==i&&!l.locked);
    if (next>=0) { LAYERS.forEach((l,j)=>l.active=j===next); }
  }
  LAYERS[i].locked = !LAYERS[i].locked;
  renderLayers();
}
function changeLayColor(i) {
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = LAYERS[i].color;
  inp.oninput = () => { LAYERS[i].color = inp.value; renderLayers(); draw(); };
  inp.click();
}
function renameLayer(i) {
  const oldName = LAYERS[i].name;
  const newName = prompt('レイヤー名:', oldName);
  if (!newName || newName === oldName) return;
  if (LAYERS.find((l,j)=>j!==i&&l.name===newName)) { alert('同じ名前のレイヤーが既にあります'); return; }
  state.elements.forEach(el=>{ if(el.layer===oldName) el.layer=newName; });
  state.wires.forEach(w=>{ if(w.layer===oldName) w.layer=newName; });
  LAYERS[i].name = newName;
  renderLayers();
  draw();
}
function deleteLayer(i) {
  const l = LAYERS[i];
  const elCount = state.elements.filter(e=>e.layer===l.name).length;
  const wCount  = state.wires.filter(w=>w.layer===l.name).length;
  const total = elCount + wCount;
  if (total > 0) {
    if (!confirm(`レイヤー「${l.name}」には${total}個のオブジェクトがあります。\n削除すると別レイヤーに移動します。\n続けますか？`)) return;
    const fallback = LAYERS.find((l2,j)=>j!==i)?.name || '回路';
    state.elements.forEach(el=>{ if(el.layer===l.name) el.layer=fallback; });
    state.wires.forEach(w=>{ if(w.layer===l.name) w.layer=fallback; });
  } else {
    if (!confirm(`レイヤー「${l.name}」を削除しますか？`)) return;
  }
  LAYERS.splice(i, 1);
  if (!LAYERS.find(l=>l.active)) LAYERS[0].active = true;
  renderLayers();
  draw();
}
function applyLayerFontSize(i, val) {
  const fs = val ? parseInt(val) : null;
  if (fs !== null && (isNaN(fs) || fs < 6 || fs > 72)) return;
  LAYERS[i].fontSize = fs;
  if (fs !== null) {
    // そのレイヤーの全テキスト要素に適用
    state.elements.forEach(el => { if (el.type === 'text' && el.layer === LAYERS[i].name) el.fs = fs; });
  }
  draw();
}
function bulkLayVis() {
  const allVis = LAYERS.every(l => l.visible);
  LAYERS.forEach(l => l.visible = !allVis);
  renderLayers(); draw();
}
function bulkLayLock() {
  const allLocked = LAYERS.every(l => l.locked);
  LAYERS.forEach((l, i) => {
    l.locked = !allLocked;
    // 全ロック時はアクティブレイヤーを維持（ロック解除後に操作可能に）
  });
  if (!allLocked) {
    // 全ロックになった→アクティブを最初のレイヤーに（ロックされているが表示上の問題なし）
  } else {
    // 全解除→アクティブレイヤーはそのまま
  }
  renderLayers();
}
function addLayer() {
  const n = prompt('レイヤー名:');
  if (!n) return;
  if (LAYERS.find(l=>l.name===n)) { alert('同じ名前のレイヤーが既にあります'); return; }
  LAYERS.push({ name:n, color:'#888888', visible:true, locked:false, active:false, lineWidth:1, lineDash:'solid', fontSize:null });
  renderLayers();
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
function showPartReg() { openFP('part-reg-p'); }
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
    `<div class="page-tab${i===state.currentPage?' active':''}" onclick="switchPage(${i})" ondblclick="renamePage(${i})">${p.name||('Sheet'+(i+1))}${p.dirty?'<span style="color:var(--red);margin-left:3px;font-size:10px">●</span>':''}</div>`
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
    html += `<div class="pp-row"><label>線幅</label><select id="pp-lw"><option value="1"${(item.lineWidth||2)==1?' selected':''}>細(1)</option><option value="2"${(item.lineWidth||2)==2?' selected':''}>標準(2)</option><option value="3"${(item.lineWidth||2)==3?' selected':''}>太(3)</option><option value="4"${(item.lineWidth||2)==4?' selected':''}>極太(4)</option></select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-ls"><option value=""${!item.lineStyle?' selected':''}>実線</option><option value="dash"${item.lineStyle==='dash'?' selected':''}>破線</option><option value="dashdot"${item.lineStyle==='dashdot'?' selected':''}>一点鎖線</option><option value="dot"${item.lineStyle==='dot'?' selected':''}>点線</option></select></div>`;
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
    if (['fline','rect','circle'].includes(el.type)) {
      html += `<div class="pp-row"><label>線幅</label><select id="pp-lw"><option value="0.5"${(el.lineWidth||1.5)==0.5?' selected':''}>極細(0.5)</option><option value="1"${(el.lineWidth||1.5)==1?' selected':''}>細(1)</option><option value="1.5"${(el.lineWidth||1.5)==1.5?' selected':''}>標準(1.5)</option><option value="2"${(el.lineWidth||1.5)==2?' selected':''}>太(2)</option><option value="3"${(el.lineWidth||1.5)==3?' selected':''}>極太(3)</option></select></div>`;
      html += `<div class="pp-row"><label>線種</label><select id="pp-ls"><option value=""${!el.lineStyle?' selected':''}>実線</option><option value="dash"${el.lineStyle==='dash'?' selected':''}>破線</option><option value="dashdot"${el.lineStyle==='dashdot'?' selected':''}>一点鎖線</option><option value="dot"${el.lineStyle==='dot'?' selected':''}>点線</option></select></div>`;
    }
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
    wire.wireNo    = v('pp-wireno'); wire.layer = v('pp-layer');
    if (v('pp-lw')) wire.lineWidth = parseFloat(v('pp-lw'));
    if (v('pp-ls') !== undefined) wire.lineStyle = v('pp-ls') || undefined;
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
    if (['fline','rect','circle'].includes(el.type)) {
      if (v('pp-lw')) el.lineWidth = parseFloat(v('pp-lw'));
      el.lineStyle = v('pp-ls') || undefined;
    }
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
function openFP(id) {
  const el = document.getElementById(id); if (!el) return;
  const ribbonH = document.getElementById('ribbon')?.offsetHeight || 0;
  el.style.top = `calc(50% - ${ribbonH * 0.1}px)`;
  el.classList.add('open');
}
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

// ----------------------------------------------------------------
// パネル表示切替
// ----------------------------------------------------------------
function toggleLeftPanel() {
  const lp = document.getElementById('lp');
  if (lp) lp.classList.toggle('hide');
  resize(); draw();
}

function toggleRightPanel() {
  const rp = document.getElementById('rp');
  if (rp) rp.classList.toggle('hide');
  resize(); draw();
}

function toggleExpand() {
  document.body.classList.toggle('fullscreen');
  const label = document.getElementById('exp-label');
  if (label) label.textContent = document.body.classList.contains('fullscreen') ? '元に戻す' : '大画面';
  resize(); draw();
}

function toggleAI() {
  const p = document.getElementById('ai-panel');
  if (p) p.style.display = p.style.display === 'none' ? 'flex' : 'none';
}

function saveApiKey() {
  const key = document.getElementById('ai-key')?.value?.trim();
  if (key) { state.apiKey = key; alert('APIキーを保存しました'); }
}

function sendAI() {
  const input = document.getElementById('ai-input');
  if (!input?.value?.trim()) return;
  alert('AI機能は現在準備中です');
  input.value = '';
}

// ----------------------------------------------------------------
// フローティングレイヤーパネル ドラッグ
// ----------------------------------------------------------------
let _lfOx = 0, _lfOy = 0;
function layFloatDown(e) {
  if (e.target.tagName === 'BUTTON' || e.target.onclick) return;
  e.preventDefault();
  e.stopPropagation();
  const p = document.getElementById('lay-float');
  const r = p.getBoundingClientRect();
  _lfOx = e.clientX - r.left;
  _lfOy = e.clientY - r.top;
  const title = e.currentTarget || e.target;
  function onMove(ev) {
    p.style.left = (ev.clientX - _lfOx) + 'px';
    p.style.top  = (ev.clientY - _lfOy) + 'px';
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
function initLayFloat() {}
