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
  const panelMap = { sym:'sym-float', lay:'lay-float', prt:'prt-float' };
  const fp = document.getElementById(panelMap[name]);
  if (!fp) return;
  const hidden = fp.style.display === 'none' || fp.style.display === '';
  // 全パネルを閉じてから対象を開閉
  if (hidden) {
    fp.style.display = 'flex';
    if (name === 'sym') renderSymFloat();
    if (name === 'lay') { renderLayers(); }
    if (name === 'prt') renderPartsFloat();
  } else {
    fp.style.display = 'none';
    el.classList.remove('on');
  }
}
// closeLayFloat は下で定義

function closeSym() {
  document.getElementById('sym-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
}
function closePrt() {
  document.getElementById('prt-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
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
        <td colspan="6"></td>
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
        <td style="padding:4px 10px;text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
          <button onclick="renameLayer(${i})" title="名前変更" style="font-size:11px;padding:1px 6px;margin-right:4px;cursor:pointer;border:1px solid var(--bd2);border-radius:3px;background:var(--bg3);color:var(--fg)">名前</button>
          ${LAYERS.length>1?`<button onclick="deleteLayer(${i})" title="削除" style="font-size:11px;padding:1px 6px;cursor:pointer;border:1px solid var(--bd2);border-radius:3px;background:var(--bg3);color:var(--red)">削除</button>`:''}
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
  state.pendingRef  = null;
  state.pendingTerm = null;
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
// filterParts は下で定義
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
// カスタムシンボルエディタ
// ----------------------------------------------------------------
let _srShapes = [];
let _srTerms  = [];
let _srTool   = null;
let _srDraw   = null;
let _srFirst  = null;
let _srMouse  = { x:0, y:0 };
const SR_SCALE = 2;   // canvas px per coord unit
const SR_GRID  = 5;   // grid snap unit (coord)
const SR_CX    = 160; // canvas center x
const SR_CY    = 130; // canvas center y

function showSymReg() {
  srClear();
  openFP('sym-reg-p');
  requestAnimationFrame(srRender);
  const cv = document.getElementById('sym-reg-cv');
  cv.onmousedown = srOnDown;
  cv.onmousemove = srOnMove;
  cv.onmouseup   = srOnUp;
  cv.setAttribute('tabindex', '0');
  cv.focus();
  cv.onkeydown = e => {
    const step = e.shiftKey ? SR_GRID : 1;
    let dx=0, dy=0;
    if (e.key==='ArrowLeft')  dx=-step;
    else if (e.key==='ArrowRight') dx=step;
    else if (e.key==='ArrowUp')    dy=-step;
    else if (e.key==='ArrowDown')  dy=step;
    else return;
    e.preventDefault();
    _srShapes.forEach(s => {
      if (s.t==='L') { s.x1+=dx; s.y1+=dy; s.x2+=dx; s.y2+=dy; }
      else if (s.t==='C') { s.cx+=dx; s.cy+=dy; }
      else if (s.t==='R') { s.x+=dx; s.y+=dy; }
      else if (s.t==='T') { s.x+=dx; s.y+=dy; }
    });
    _srTerms.forEach(t => { t.x+=dx; t.y+=dy; });
    srRender();
  };
}

function srPasteFromClipboard() {
  const cb = state.clipboard;
  if (!cb?.els?.length && !cb?.wires?.length) { alert('先にCADで図形を選択してCtrl+Cでコピーしてください'); return; }

  // バウンディングボックス計算
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const addPt = (x,y) => { minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); };
  cb.els.forEach(el => {
    if (el.type==='fline'||el.type==='dim'||el.type==='leader') { addPt(el.x1,el.y1); addPt(el.x2,el.y2); }
    else if (el.type==='circle'||el.type==='arc') { addPt(el.x-(el.r||0),el.y-(el.r||0)); addPt(el.x+(el.r||0),el.y+(el.r||0)); }
    else if (el.type==='rect') { addPt(el.x,el.y); addPt(el.x+(el.w||0),el.y+(el.h||0)); }
    else if (el.type==='triangle') { addPt(el.x1,el.y1); addPt(el.x2,el.y2); addPt(el.x3,el.y3); }
    else if (el.x!=null) addPt(el.x,el.y);
  });
  cb.wires.forEach(w => { (w.pts||[]).forEach(p => addPt(p.x, p.y)); });
  if (!isFinite(minX)) return;

  const bW = maxX-minX || 1, bH = maxY-minY || 1;
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
  // W/H入力値に合わせてスケール
  const symW = parseFloat(document.getElementById('sr-w')?.value)||80;
  const symH = parseFloat(document.getElementById('sr-h')?.value)||60;
  const scale = Math.min(symW/bW, symH/bH) * 0.9;
  const tx = wx => Math.round((wx - cx) * scale);
  const ty = wy => Math.round((wy - cy) * scale);

  // 変換してSR形式に
  const shapes = [];
  cb.els.forEach(el => {
    if (el.type==='fline') shapes.push({t:'L', x1:tx(el.x1),y1:ty(el.y1),x2:tx(el.x2),y2:ty(el.y2)});
    else if (el.type==='circle') shapes.push({t:'C', cx:tx(el.x),cy:ty(el.y),r:Math.round(el.r*scale)});
    else if (el.type==='rect') shapes.push({t:'R', x:tx(el.x),y:ty(el.y),w:Math.round(el.w*scale),h:Math.round(el.h*scale)});
    else if (el.type==='triangle') {
      shapes.push({t:'L',x1:tx(el.x1),y1:ty(el.y1),x2:tx(el.x2),y2:ty(el.y2)});
      shapes.push({t:'L',x1:tx(el.x2),y1:ty(el.y2),x2:tx(el.x3),y2:ty(el.y3)});
      shapes.push({t:'L',x1:tx(el.x3),y1:ty(el.y3),x2:tx(el.x1),y2:ty(el.y1)});
    } else if (el.type==='arc') {
      // 弧を複数の直線に近似
      const steps=8, r=Math.round(el.r*scale), ccx=tx(el.x), ccy=ty(el.y);
      for (let i=0;i<steps;i++) {
        const a0=el.startA+(el.endA-el.startA)*i/steps;
        const a1=el.startA+(el.endA-el.startA)*(i+1)/steps;
        shapes.push({t:'L',x1:Math.round(ccx+Math.cos(a0)*r),y1:Math.round(ccy+Math.sin(a0)*r),
                         x2:Math.round(ccx+Math.cos(a1)*r),y2:Math.round(ccy+Math.sin(a1)*r)});
      }
    }
  });

  // ワイヤーを直線として変換
  cb.wires.forEach(w => {
    const pts = w.pts || [];
    for (let i=0; i<pts.length-1; i++) {
      shapes.push({t:'L', x1:tx(pts[i].x),y1:ty(pts[i].y), x2:tx(pts[i+1].x),y2:ty(pts[i+1].y)});
    }
  });
  _srShapes = shapes;
  srRender();
}

function srClear() {
  _srShapes = []; _srTerms = []; _srTool = null; _srDraw = null; _srFirst = null;
  document.querySelectorAll('.sr-tool').forEach(b => b.classList.remove('active'));
  const n = document.getElementById('sr-name'); if (n) n.value = '';
  const c = document.getElementById('sr-cat'); if (c) c.value = 'カスタム';
  const w = document.getElementById('sr-w'); if (w) w.value = 80;
  const h = document.getElementById('sr-h'); if (h) h.value = 60;
  srUpdateTermList(); srRender();
}

function registerAsSymbol() { showSymReg(); }

function srSnap(clientX, clientY) {
  const cv = document.getElementById('sym-reg-cv');
  const r  = cv.getBoundingClientRect();
  const px = (clientX - r.left) * (cv.width  / r.width);
  const py = (clientY - r.top)  * (cv.height / r.height);
  const wx = Math.round((px - SR_CX) / SR_SCALE / SR_GRID) * SR_GRID;
  const wy = Math.round((py - SR_CY) / SR_SCALE / SR_GRID) * SR_GRID;
  return { x: wx, y: wy };
}

function srRender() {
  const cv = document.getElementById('sym-reg-cv');
  if (!cv) return;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);

  // Grid
  c.strokeStyle = '#e8e8e8'; c.lineWidth = 0.5;
  const gPx = SR_GRID * SR_SCALE;
  for (let x = ((SR_CX % gPx) + gPx) % gPx; x < cv.width; x += gPx) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,cv.height); c.stroke(); }
  for (let y = ((SR_CY % gPx) + gPx) % gPx; y < cv.height; y += gPx) { c.beginPath(); c.moveTo(0,y); c.lineTo(cv.width,y); c.stroke(); }

  // Axes
  c.strokeStyle = '#bbb'; c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(SR_CX,0); c.lineTo(SR_CX,cv.height); c.stroke();
  c.beginPath(); c.moveTo(0,SR_CY); c.lineTo(cv.width,SR_CY); c.stroke();

  // Bounding box (dashed)
  const bw = (parseInt(document.getElementById('sr-w')?.value)||80) * SR_SCALE;
  const bh = (parseInt(document.getElementById('sr-h')?.value)||60) * SR_SCALE;
  c.strokeStyle = '#aac'; c.lineWidth = 1; c.setLineDash([5,4]);
  c.strokeRect(SR_CX - bw/2, SR_CY - bh/2, bw, bh);
  c.setLineDash([]);

  // Shapes
  c.strokeStyle = '#222'; c.fillStyle = '#222'; c.lineWidth = 1.5;
  _srShapes.forEach(s => srDrawShape(c, s, '#222'));

  // Preview
  if (_srDraw) { c.save(); c.setLineDash([5,4]); srDrawShape(c, _srDraw, '#888'); c.restore(); }

  // Terminals
  _srTerms.forEach((t, i) => {
    const px = SR_CX + t.x * SR_SCALE, py = SR_CY + t.y * SR_SCALE;
    c.fillStyle = '#0067c0'; c.fillRect(px-5,py-5,10,10);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px-3,py-3); c.lineTo(px+3,py+3); c.stroke();
    c.beginPath(); c.moveTo(px+3,py-3); c.lineTo(px-3,py+3); c.stroke();
    c.fillStyle = '#0067c0'; c.font = '8px sans-serif'; c.textAlign = 'left';
    c.fillText(`T${i}`, px+6, py+3);
  });

  // Mouse cursor
  const mpx = SR_CX + _srMouse.x * SR_SCALE, mpy = SR_CY + _srMouse.y * SR_SCALE;
  c.strokeStyle = '#ccc'; c.lineWidth = 0.5; c.setLineDash([3,3]);
  c.beginPath(); c.moveTo(mpx,0); c.lineTo(mpx,cv.height); c.stroke();
  c.beginPath(); c.moveTo(0,mpy); c.lineTo(cv.width,mpy); c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#555'; c.font = '9px monospace'; c.textAlign = 'left';
  c.fillText(`(${_srMouse.x},${_srMouse.y})`, 4, cv.height-4);

  // First point highlight
  if (_srFirst) {
    const fx = SR_CX + _srFirst.x * SR_SCALE, fy = SR_CY + _srFirst.y * SR_SCALE;
    c.fillStyle = '#0aa'; c.beginPath(); c.arc(fx,fy,4,0,Math.PI*2); c.fill();
  }
}

function srDrawShape(c, s, color) {
  const T  = v => SR_CX + v * SR_SCALE;
  const TY = v => SR_CY + v * SR_SCALE;
  c.save(); c.strokeStyle = color || '#222'; c.fillStyle = color || '#222';
  if (s.t==='L') {
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(T(s.x1),TY(s.y1)); c.lineTo(T(s.x2),TY(s.y2)); c.stroke();
  } else if (s.t==='C') {
    c.lineWidth = 1.5; c.beginPath(); c.arc(T(s.cx),TY(s.cy),Math.max(1,s.r*SR_SCALE),0,Math.PI*2); c.stroke();
  } else if (s.t==='R') {
    c.lineWidth = 1.5; c.strokeRect(T(s.x),TY(s.y),s.w*SR_SCALE,s.h*SR_SCALE);
  } else if (s.t==='T') {
    c.font = `${(s.fs||14)*SR_SCALE/2}px sans-serif`; c.textAlign = 'center';
    c.fillText(s.text, T(s.x), TY(s.y));
  }
  c.restore();
}

function srOnDown(e) {
  if (e.button !== 0) return;
  const { x, y } = srSnap(e.clientX, e.clientY);
  if (_srTool === 'erase') {
    let minD = 12, minI = -1;
    _srShapes.forEach((s, i) => {
      let d = Infinity;
      if (s.t==='L') d = distToSeg(x,y,s.x1,s.y1,s.x2,s.y2);
      else if (s.t==='C') d = Math.abs(Math.hypot(x-s.cx,y-s.cy)-s.r);
      else if (s.t==='R') { const cx=(s.x+s.w/2), cy=(s.y+s.h/2); d=Math.hypot(x-cx,y-cy); }
      else if (s.t==='T') d = Math.hypot(x-s.x, y-s.y);
      if (d < minD) { minD = d; minI = i; }
    });
    let minTD = 8, minTI = -1;
    _srTerms.forEach((t, i) => { const d=Math.hypot(x-t.x,y-t.y); if(d<minTD){minTD=d;minTI=i;} });
    if (minTI >= 0) { _srTerms.splice(minTI,1); srUpdateTermList(); srRender(); return; }
    if (minI  >= 0) { _srShapes.splice(minI,1); srRender(); return; }
    return;
  }
  if (_srTool === 'term') {
    _srTerms.push({ x, y });
    srUpdateTermList(); srRender(); return;
  }
  if (_srTool === 'text') {
    const txt = prompt('テキスト:','');
    if (!txt) return;
    _srShapes.push({ t:'T', text:txt, x, y, fs:14 });
    srRender(); return;
  }
  // line/circle/rect: 2クリック確定
  if (!_srFirst) {
    _srFirst = { x, y };
  } else {
    const f = _srFirst;
    if (_srTool==='line') {
      _srShapes.push({ t:'L', x1:f.x, y1:f.y, x2:x, y2:y });
    } else if (_srTool==='circle') {
      const r = Math.round(Math.hypot(x-f.x,y-f.y));
      if (r>0) _srShapes.push({ t:'C', cx:f.x, cy:f.y, r });
    } else if (_srTool==='rect') {
      const rw=Math.abs(x-f.x), rh=Math.abs(y-f.y);
      if (rw>0&&rh>0) _srShapes.push({ t:'R', x:Math.min(f.x,x), y:Math.min(f.y,y), w:rw, h:rh });
    }
    _srFirst=null; _srDraw=null; srRender();
  }
}

function srOnMove(e) {
  const { x, y } = srSnap(e.clientX, e.clientY);
  _srMouse = { x, y };
  if (_srFirst) {
    const f = _srFirst;
    if      (_srTool==='line')   _srDraw = { t:'L', x1:f.x,y1:f.y,x2:x,y2:y };
    else if (_srTool==='circle') { const r=Math.max(1,Math.round(Math.hypot(x-f.x,y-f.y))); _srDraw={t:'C',cx:f.x,cy:f.y,r}; }
    else if (_srTool==='rect')   _srDraw = { t:'R', x:Math.min(f.x,x),y:Math.min(f.y,y),w:Math.abs(x-f.x),h:Math.abs(y-f.y) };
  }
  srRender();
}

function srOnUp(e) {}

function srSetTool(t) {
  _srTool=t; _srFirst=null; _srDraw=null;
  document.querySelectorAll('.sr-tool').forEach(b => b.classList.toggle('active', b.dataset.tool===t));
  srRender();
}

function srUndo() {
  if (_srFirst) { _srFirst=null; _srDraw=null; srRender(); return; }
  if (_srShapes.length) { _srShapes.pop(); srRender(); }
}

function srUpdateTermList() {
  const el = document.getElementById('sr-term-list');
  if (!el) return;
  if (!_srTerms.length) { el.textContent = '（端子点なし）'; return; }
  el.innerHTML = _srTerms.map((t,i) =>
    `<div>T${i}: (${t.x}, ${t.y}) <span onclick="_srTerms.splice(${i},1);srUpdateTermList();srRender()" style="cursor:pointer;color:var(--red)">×</span></div>`
  ).join('');
}

function saveCustomSymbol() {
  const name = document.getElementById('sr-name').value.trim();
  if (!name) { alert('シンボル名を入力してください'); return; }
  if (!_srShapes.length) { alert('図形を少なくとも1つ描いてください'); return; }
  const cat = document.getElementById('sr-cat').value.trim() || 'カスタム';
  const w   = parseInt(document.getElementById('sr-w').value) || 80;
  const h   = parseInt(document.getElementById('sr-h').value) || 60;
  const type = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,5);
  const sym = { type, name, label:name, cat, w, h, shapes:[..._srShapes], terminals:[..._srTerms] };
  state.customSymbols.push(sym);
  if (typeof DEFS !== 'undefined') {
    DEFS[type] = { w, h, cat, name, jis:'',
      terminals: _srTerms.map((t,i) => ({ id:`t${i}`, x:t.x, y:t.y })) };
  }
  closeFP('sym-reg-p');
  renderCustomSymbols();
  alert(`「${name}」を登録しました。シンボルパレットのカスタムタブから配置できます。`);
}

function renderCustomSymbols() {
  const el = document.getElementById('cus-list');
  if (!el) return;
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
    `<div class="page-tab${i===state.currentPage?' active':''}" onclick="switchPage(${i})" ondblclick="renamePage(${i})" style="display:flex;align-items:center;gap:4px">${p.name||('Sheet'+(i+1))}${p.dirty?'<span style="color:var(--red);font-size:10px">●</span>':''}${state.pages.length>1?`<span onclick="event.stopPropagation();deletePage(${i})" style="font-size:10px;color:var(--fg3);cursor:pointer;line-height:1" title="削除">×</span>`:''}</div>`
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
  pushH();
  state.pages[state.currentPage].elements = state.elements;
  state.pages[state.currentPage].wires    = state.wires;
  state.pages[state.currentPage].frameObj = state.frameObj;
  state.pages.push({ name:'Sheet'+(state.pages.length+1), elements:[], wires:[], groups:[], frameObj:null });
  switchPage(state.pages.length - 1);
}

function renamePage(idx) {
  const name = prompt('ページ名:', state.pages[idx].name || ('Sheet'+(idx+1)));
  if (name !== null && name.trim()) { state.pages[idx].name = name.trim(); renderPageTabs(); }
}
function deletePage(idx) {
  if (state.pages.length <= 1) return;
  const name = state.pages[idx].name || ('Sheet'+(idx+1));
  if (!confirm(`「${name}」を削除しますか？`)) return;
  pushH();
  // 現在ページのデータを先に保存
  state.pages[state.currentPage].elements = state.elements;
  state.pages[state.currentPage].wires    = state.wires;
  state.pages[state.currentPage].frameObj = state.frameObj;
  // ページを削除
  state.pages.splice(idx, 1);
  // currentPageのインデックスを補正
  let newIdx = state.currentPage;
  if (idx < state.currentPage) newIdx--;
  if (newIdx >= state.pages.length) newIdx = state.pages.length - 1;
  // switchPageを使わず直接切り替え
  state.currentPage = newIdx;
  const pg = state.pages[newIdx];
  state.sel.els.clear(); state.sel.wires.clear();
  renderPageTabs(); draw(); updateRightPanel();
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
  } else if (el && el.type === 'dim') {
    const len = Math.round(Math.hypot(el.x2-el.x1, el.y2-el.y1));
    html += `<div class="pp-row"><label>寸法テキスト</label><input type="text" id="pp-dimtext" value="${el.dimText||len}"></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-dimfs" value="${el.dimFs||11}" min="8" max="72"></div>`;
    html += `<div class="pp-row"><label>テキストX補正</label><input type="number" id="pp-dimtx" value="${el.dimTx||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストY補正</label><input type="number" id="pp-dimty" value="${el.dimTy||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>矢印スタイル</label><select id="pp-arrstyle">
      <option value="filled" ${(el.arrowStyle||'filled')==='filled'?'selected':''}>▶ 塗りつぶし</option>
      <option value="open"   ${el.arrowStyle==='open'  ?'selected':''}>▷ 開き矢印</option>
      <option value="tick"   ${el.arrowStyle==='tick'  ?'selected':''}>/ 斜め線</option>
      <option value="dot"    ${el.arrowStyle==='dot'   ?'selected':''}>● 丸</option>
      <option value="none"   ${el.arrowStyle==='none'  ?'selected':''}>なし</option>
    </select></div>`;
    html += `<div class="pp-row"><label>矢印サイズ</label><input type="number" id="pp-arrsz" value="${el.arrowSz||8}" min="2" max="30" step="1"></div>`;
    html += `<div class="pp-row"><label>引出しgap</label><input type="number" id="pp-gap" value="${el.gap!=null?el.gap:state.G}" min="0" max="20"></div>`;
    html += `<div class="pp-row"><label>伸び(ext)</label><input type="number" id="pp-ext" value="${el.ext!=null?el.ext:state.G}" min="0" max="20"></div>`;
    html += `<div class="pp-row"><label>線幅</label><select id="pp-dimlw">
      <option value="0.5" ${(el.lineWidth||1)==0.5?'selected':''}>極細(0.5)</option>
      <option value="1"   ${(el.lineWidth||1)==1  ?'selected':''}>細(1)</option>
      <option value="1.5" ${(el.lineWidth||1)==1.5?'selected':''}>標準(1.5)</option>
      <option value="2"   ${(el.lineWidth||1)==2  ?'selected':''}>太(2)</option>
    </select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-dimls">
      <option value=""        ${!el.lineStyle          ?'selected':''}>実線</option>
      <option value="dash"    ${el.lineStyle==='dash'   ?'selected':''}>破線</option>
      <option value="dashdot" ${el.lineStyle==='dashdot'?'selected':''}>一点鎖線</option>
      <option value="dot"     ${el.lineStyle==='dot'    ?'selected':''}>点線</option>
    </select></div>`;
    html += `<div class="pp-row"><label>色</label><input type="color" id="pp-color" value="${el.color||'#744da9'}"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    html += `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
      <button class="fp-btn primary" onclick="applyRightPanel()">適用</button>
      <button class="fp-btn" onclick="applyDimToAll()">全て適用</button>
      <button class="fp-btn" onclick="saveDimDef()">デフォルト保存</button>
      <button class="fp-btn danger" onclick="resetDimDef()">初期値に戻す</button>
    </div>`;
  } else if (el && el.type === 'leader') {
    html += `<div class="pp-row"><label>引出しテキスト</label><input type="text" id="pp-ldrtext" value="${el.leaderText||''}"></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-ldrfs" value="${el.leaderFs||11}" min="8" max="72"></div>`;
    html += `<div class="pp-row"><label>テキストX補正</label><input type="number" id="pp-ldrtx" value="${el.leaderTx||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストY補正</label><input type="number" id="pp-ldrty" value="${el.leaderTy||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>色</label><input type="color" id="pp-color" value="${el.color||'#744da9'}"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
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
  } else if (el && el.type === 'dim') {
    el.dimText  = v('pp-dimtext');
    el.dimFs    = parseInt(v('pp-dimfs')) || 11;
    el.dimFixed = document.getElementById('pp-dimfixed')?.checked || false;
    el.dimTx    = parseInt(v('pp-dimtx')) || 0;
    el.dimTy    = parseInt(v('pp-dimty')) || 0;
    el.arrowStyle = v('pp-arrstyle') || 'filled';
    el.arrowSz    = parseInt(v('pp-arrsz')) || 8;
    if (document.getElementById('pp-offset')) el.offset = (parseInt(v('pp-offset'))||30) * (el.offsetSign||1);
    el.lineWidth  = parseFloat(v('pp-dimlw')) || 1;
    el.lineStyle  = v('pp-dimls') || undefined;
    el.gap      = parseInt(v('pp-gap'));
    el.ext      = parseInt(v('pp-ext'));
    el.color    = v('pp-color') || undefined;
    el.layer    = v('pp-layer');
  } else if (el && el.type === 'leader') {
    el.leaderText = v('pp-ldrtext');
    el.leaderFs   = parseInt(v('pp-ldrfs')) || 11;
    el.leaderTx   = parseInt(v('pp-ldrtx')) || 0;
    el.leaderTy   = parseInt(v('pp-ldrty')) || 0;
    el.color      = v('pp-color') || undefined;
    el.layer      = v('pp-layer');
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

// 全寸法線に現在の設定を適用
function applyDimToAll() {
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  if (!el || el.type !== 'dim') return;
  applyRightPanel();
  const fs=el.dimFs, tx=el.dimTx, ty=el.dimTy, fixed=el.dimFixed, color=el.color, gap=el.gap, ext=el.ext;
  pushH();
  state.elements.filter(e => e.type==='dim').forEach(e => {
    e.dimFs=fs; e.dimTx=tx; e.dimTy=ty; e.dimFixed=fixed; e.color=color;
    if (gap!=null) e.gap=gap; if (ext!=null) e.ext=ext;
  });
  draw();
}

// 現在の設定をデフォルトとして保存
function saveDimDef() {
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  if (!el || el.type !== 'dim') return;
  applyRightPanel();
  state.dimDef = { fs:el.dimFs||11, tx:el.dimTx||0, ty:el.dimTy||0,
    color:el.color||'#744da9', gap:el.gap!=null?el.gap:null, ext:el.ext!=null?el.ext:null,
    arrowStyle:el.arrowStyle||'filled', arrowSz:el.arrowSz||8 };
  alert('デフォルト設定を保存しました');
}

// デフォルト設定をリセット
function resetDimDef() {
  state.dimDef = { fs:11, tx:0, ty:-8, gap:null, ext:null, color:'#744da9', arrowStyle:'filled', arrowSz:8 };
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  if (!el || el.type !== 'dim') return;
  pushH();
  el.dimFs=11; el.dimTx=0; el.dimTy=-8; el.color='#744da9';
  el.gap=null; el.ext=null; el.arrowStyle='filled'; el.arrowSz=8;
  draw();
  updateRightPanel();
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
  const key = document.getElementById('ai-apikey')?.value?.trim();
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

// ----------------------------------------------------------------
// シンボルフローティングパネル
// ----------------------------------------------------------------
function renderSymFloat() {
  const body = document.getElementById('sym-float-body');
  if (!body) return;
  // カテゴリーごとにグループ化
  const _hiddenSyms = JSON.parse(localStorage.getItem('hiddenSyms')||'[]');
  const visibleSyms = BUILTIN_SYMS.filter(s => !_hiddenSyms.includes(s.type));
  const cats = {};
  visibleSyms.forEach(s => { if (!cats[s.cat]) cats[s.cat]=[]; cats[s.cat].push(s); });
  let html = '';
  if (_hiddenSyms.length > 0) {
    html += `<div style="text-align:right;margin-bottom:4px"><span onclick="restoreAllSyms()" style="font-size:9px;color:var(--acc);cursor:pointer">すべて復元</span></div>`;
  }
  Object.entries(cats).forEach(([cat, syms]) => {
    html += `<div style="font-size:9px;color:var(--fg3);font-weight:700;margin:6px 0 3px;text-transform:uppercase;letter-spacing:.06em">${cat}</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-bottom:4px">`;
    syms.forEach(s => {
      html += `<div class="sym-item" onclick="pickSym(this,'${s.type}')" style="flex-direction:column;align-items:center;padding:5px 3px;gap:3px;position:relative">
        <span onclick="event.stopPropagation();hideBuiltinSym('${s.type}')" style="position:absolute;top:2px;right:2px;font-size:9px;color:var(--fg3);cursor:pointer;line-height:1">×</span>
        ${s.svg}
        <span style="font-size:9px;text-align:center;line-height:1.2">${s.label}</span>
      </div>`;
    });
    html += `</div>`;
  });
  // カスタムシンボル
  if (state.customSymbols && state.customSymbols.length) {
    html += `<div style="font-size:9px;color:var(--fg3);font-weight:700;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid var(--bd2);padding-top:6px">カスタム</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px">`;
    state.customSymbols.forEach(s => {
      html += `<div class="sym-item" onclick="pickSym(this,'${s.type}')" style="flex-direction:column;align-items:center;padding:5px 3px;gap:3px;position:relative">
        <svg width="36" height="28" viewBox="-50 -30 100 60" style="overflow:visible">${s.paths||''}</svg>
        <span style="font-size:9px;text-align:center;line-height:1.2">${s.label||s.type}</span>
        <span onclick="event.stopPropagation();delCusSym('${s.type}')" style="position:absolute;top:2px;right:2px;font-size:9px;color:var(--red);cursor:pointer">×</span>
      </div>`;
    });
    html += `</div>`;
  }
  body.innerHTML = html;
}
// renderCustomSymbols は上で定義済み

// ----------------------------------------------------------------
// 部品DBフローティングパネル
// ----------------------------------------------------------------
function renderPartsFloat() {
  renderPartsTable2(allParts());
}
function renderPartsTable2(parts) {
  const el = document.getElementById('parts-table2');
  if (!el) return;
  el.innerHTML = parts.map(p => `
    <div style="padding:4px 3px;border-bottom:1px solid var(--bg4);cursor:pointer" onclick="placePart('${p.type}','${p.ref}','${p.terminals||''}')">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;font-weight:600;color:var(--fg)">${p.ref}</span>
        ${p.custom?`<span onclick="event.stopPropagation();deletePart('${p.ref}')" style="font-size:9px;color:var(--red);cursor:pointer">×</span>`:''}
      </div>
      <div style="font-size:10px;color:var(--fg3)">${p.maker} ${p.volt||''} ${p.amp||''}</div>
      ${p.contacts?`<div style="font-size:10px;color:var(--acc)">接点:${p.contacts}</div>`:''}
    </div>`).join('');
}
function filterParts(q) {
  const parts = allParts().filter(p => !q || p.ref.toLowerCase().includes(q.toLowerCase()) || p.maker.toLowerCase().includes(q.toLowerCase()));
  renderPartsTable(parts);
  renderPartsTable2(parts);
}

// ----------------------------------------------------------------
// シンボル・部品DBパネル ドラッグ
// ----------------------------------------------------------------
function _makeFloatDrag(panelId) {
  let ox = 0, oy = 0;
  return function(e) {
    if (e.target.tagName === 'BUTTON' || e.target.onclick || e.target.tagName === 'INPUT') return;
    e.preventDefault(); e.stopPropagation();
    const p = document.getElementById(panelId);
    const r = p.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    function onMove(ev) { p.style.left=(ev.clientX-ox)+'px'; p.style.top=(ev.clientY-oy)+'px'; }
    function onUp() { window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
}
function symFloatDown(e) { _makeFloatDrag('sym-float')(e); }
function prtFloatDown(e) { _makeFloatDrag('prt-float')(e); }

// ----------------------------------------------------------------
// 標準シンボルの表示/非表示管理
// ----------------------------------------------------------------
function hideBuiltinSym(type) {
  const sym = BUILTIN_SYMS.find(s => s.type === type);
  if (!confirm(`「${sym?.label||type}」を非表示にしますか？`)) return;
  const hidden = JSON.parse(localStorage.getItem('hiddenSyms')||'[]');
  if (!hidden.includes(type)) hidden.push(type);
  localStorage.setItem('hiddenSyms', JSON.stringify(hidden));
  renderSymFloat();
}
function restoreAllSyms() {
  localStorage.removeItem('hiddenSyms');
  renderSymFloat();
}
