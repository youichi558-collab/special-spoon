// ================================================================
// ui.js — UI操作（state参照版）
// ================================================================

// デバイス/型式/仕様の「書式コピー」用クリップボード(2026-08-03追加)。
// 同じ役割の機器(例:CR1)を、形の違う複数のシンボル(a接点/b接点等)に配置し直すたびに
// デバイス名・型番・文字サイズ/位置を全部手打ちし直すのが非効率、という指摘への対応。
// シンボルの種類(type)に関係なく、この一式だけをコピー→他のシンボルへまとめて貼り付けできる。
let deviceClipboard = null;

// ----------------------------------------------------------------
// リボンタブ
// ----------------------------------------------------------------
function switchRibbon(name, el) {
  document.querySelectorAll('.rg-wrap').forEach(e => e.style.display = 'none');
  const t = document.getElementById('rp-' + name); if (t) t.style.display = 'flex';
  document.querySelectorAll('.rtab').forEach(e => e.classList.remove('on'));
  el.classList.add('on');
  syncRibbonHeight();
}

// リボンは折り返し表示のためタブごとに実際の高さが変わる。#rp(右パネル)は position:fixed で
// top:var(--ribbon-h)に依存しているため、ズレないようリボンの実測高さを都度反映する。
function syncRibbonHeight() {
  const rb = document.getElementById('ribbon');
  if (!rb) return;
  requestAnimationFrame(() => {
    equalizeRibbonHeight();
    // offsetHeight(リボンの高さ)ではなく画面上の下端を使う。
    // 警告の帯(#banner-area)が出るとリボンごと下がるため、高さだけ見ていると
    // #rp(右パネル)が帯の分だけ上にズレる。2026-09-19
    document.documentElement.style.setProperty(
      '--ribbon-h', Math.round(rb.getBoundingClientRect().bottom) + 'px');
  });
}

// 全タブの中で一番高いものに合わせて、リボンの高さを固定する。
//
// 【2026-09-19】タブを切り替えるたびに作図領域が最大48px上下していた
// (盛田さん実機・幅1365pxでの実測: ホーム126 / 作図132 / 登録82 …)。
// 原因は #ribbon-content が flex-wrap で折り返すこと。ホームは9グループで
// 必要幅1838px、作図は1477pxあり、1365pxの画面では2段になる。一方それ以外の
// タブは1段で収まるため、切り替えるたびに段数＝高さが変わる。
//
// 画面幅で折り返しの有無が変わるので、CSSの固定値では対応できない。
// 読み込み時とリサイズ時に**全タブを実測して最大値を min-height にする**。
// 広い画面(全タブ1段)では最大値も1段ぶんになるので、余白は生まれない。
//
// measure のために隠れているタブを一瞬表示するが、visibility:hidden で
// 測るので画面にはちらつかない。測り終えたら元の表示状態へ必ず戻す。
//
// 測るのは**パネル(.rg-wrap)ではなくコンテナ(#ribbon-content)の高さ**。
// コンテナは box-sizing:border-box なので min-height に padding が含まれる。
// パネルの高さをそのまま min-height にすると padding(上下8px)のぶん足りず、
// 背の高いタブだけ8px高いままになる(実測で確認済み)。
function equalizeRibbonHeight() {
  const content = document.getElementById('ribbon-content');
  if (!content) return;
  const panels = [...document.querySelectorAll('.rg-wrap')];
  if (!panels.length) return;
  const visible = panels.find(p => p.style.display !== 'none');

  content.style.minHeight = '';          // 前回の固定値を外して素の高さを測る
  panels.forEach(p => { p.style.display = 'none'; });

  let max = 0;
  panels.forEach(p => {
    p.style.visibility = 'hidden';
    p.style.display = 'flex';
    max = Math.max(max, content.getBoundingClientRect().height);
    p.style.display = 'none';
    p.style.visibility = '';
  });

  if (visible) visible.style.display = 'flex';
  if (max > 0) content.style.minHeight = Math.ceil(max) + 'px';
}
window.addEventListener('resize', syncRibbonHeight);

// ----------------------------------------------------------------
// 【2026-10-02】左パネルの「固定」(ドッキング)(UIレビュー「左パネルをドッキング可能に」、盛田さん「左パネルも進めて」)
//   ・ONのとき、シンボル一覧・レイヤー・部品DBの窓(sym/lay/prt-float)を縦タブのすぐ右に並べて置き、キャンバスはその右から始める
//   ・タブで中身を切替(従来どおり1つだけ開く)。開いているタブを押す/×で畳む(=キャンバス全幅)
//   ・右端のドラッグで幅(180〜600)。ON/OFFと幅は前回値を覚える(ecad_prefs の lpDocked・lpDockW)。既定はOFF(従来どおりの浮いた窓)
// ----------------------------------------------------------------
const LPD_W_DEF = 280, LPD_W_MIN = 180, LPD_W_MAX = 600;
let _lpdW = LPD_W_DEF;
function _lpdOpenPanel() {
  return ['sym-float', 'lay-float', 'prt-float', 'prj-float'].map(id => document.getElementById(id))
    .find(p => p && p.style.display && p.style.display !== 'none') || null;
}
function applyLpLayout() {
  const body = document.body, cw = document.getElementById('cw'), lp = document.getElementById('lp');
  const mr = document.getElementById('main-row'), bar = document.getElementById('lpd-resizer');
  if (!body || !cw) return;
  const docked = body.classList.contains('lp-docked');
  const open = docked && !body.classList.contains('fullscreen') && _lpdOpenPanel();
  const max = Math.max(LPD_W_MIN, Math.min(LPD_W_MAX, (window.innerWidth || 1200) - 400));
  _lpdW = Math.round(Math.max(LPD_W_MIN, Math.min(max, +_lpdW || LPD_W_DEF)));
  const left = (lp && !lp.classList.contains('hide')) ? lp.getBoundingClientRect().right : 0;
  const r = mr ? mr.getBoundingClientRect() : { top: 90, height: 600 };
  const st = document.documentElement.style;
  st.setProperty('--lpd-left', left + 'px'); st.setProperty('--lpd-top', r.top + 'px');
  st.setProperty('--lpd-h', r.height + 'px'); st.setProperty('--lpd-w', _lpdW + 'px');
  cw.style.marginLeft = open ? _lpdW + 'px' : '0';
  if (bar) {
    bar.style.display = open ? 'block' : 'none';
    bar.style.left = (left + _lpdW - 3) + 'px'; bar.style.top = r.top + 'px'; bar.style.height = r.height + 'px';
  }
  document.getElementById('lt-dock')?.classList.toggle('on', docked);
}
function _lpdRelayout() { applyLpLayout(); if (typeof resize === 'function') resize(); if (typeof draw === 'function') draw(); }
function toggleLpDock(on) {
  const docked = (on === undefined) ? !document.body.classList.contains('lp-docked') : !!on;
  document.body.classList.toggle('lp-docked', docked);
  if (on === undefined && typeof stSetPref === 'function') stSetPref('lpDocked', docked ? 1 : '');
  _lpdRelayout();
}
function lpdSetWidth(w, save) {
  _lpdW = w;
  _lpdRelayout();
  if (save && typeof stSetPref === 'function') stSetPref('lpDockW', _lpdW);
}
function lpdStartResize(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const bar = document.getElementById('lpd-resizer');
  if (bar) bar.classList.add('on');
  const lp = document.getElementById('lp');
  const left = (lp && !lp.classList.contains('hide')) ? lp.getBoundingClientRect().right : 0;
  const move = ev => lpdSetWidth(ev.clientX - left, false);
  const up = () => {
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
    if (bar) bar.classList.remove('on');
    if (typeof stSetPref === 'function') stSetPref('lpDockW', _lpdW);
  };
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}

function switchLTab(name, el) {
  const panelMap = { sym:'sym-float', lay:'lay-float', prt:'prt-float', prj:'prj-float' };
  const fp = document.getElementById(panelMap[name]);
  if (!fp) return;
  const hidden = fp.style.display === 'none' || fp.style.display === '';

  // 他のパネルは常に閉じる(排他表示)
  Object.entries(panelMap).forEach(([n, id]) => {
    if (n === name) return;
    const other = document.getElementById(id);
    if (other) other.style.display = 'none';
  });
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));

  if (hidden) {
    // 対象パネルを開く
    fp.style.display = 'flex';
    el.classList.add('on');
    if (name === 'sym') renderSymFloat();
    if (name === 'lay') { renderLayers(); }
    if (name === 'prt') renderPartsFloat();
    if (name === 'prj' && typeof ptreeRender === 'function') ptreeRender();
  } else {
    // 既に開いていたタブを再クリック → 閉じる
    fp.style.display = 'none';
  }
  _lpdRelayout();   // 固定(ドッキング)のときは、開いた/畳んだ一覧に合わせてキャンバスの左を空ける
}
// closeLayFloat は下で定義

function closeSym() {
  document.getElementById('sym-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  _lpdRelayout();
}
function closePrt() {
  document.getElementById('prt-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  _lpdRelayout();
}
function closePrj() {
  document.getElementById('prj-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  _lpdRelayout();
}
function closeLayFloat() {
  document.getElementById('lay-float').style.display = 'none';
  document.querySelectorAll('.lt').forEach(e => e.classList.remove('on'));
  _lpdRelayout();
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
        <td></td>
        <td style="padding:4px 6px;text-align:center;cursor:pointer" onclick="bulkLayVis()" title="全表示/非表示切替">
          <span style="font-size:13px;color:${allVis?'var(--fg)':'var(--fg3)'}">${allVis?'●':'○'}</span>
        </td>
        <td style="padding:4px 6px;text-align:center;cursor:pointer" onclick="bulkLayLock()" title="全ロック/解除切替">
          <span style="font-size:13px;color:${allLocked?'#e55':'var(--fg3)'}">${allLocked?'🔒':'🔓'}</span>
        </td>
        <td colspan="7"></td>
      </tr>`;
    tbody.innerHTML = bulkRow + LAYERS.map((l, i) => `
      <tr draggable="true" data-layidx="${i}" style="background:${l.active?'var(--acc-dim,rgba(0,103,192,0.12))':'var(--bg2)'};border-bottom:1px solid var(--bd2);cursor:pointer" onclick="setActLayer(${i})" ondragstart="layDragStart(event,${i})" ondragover="layDragOver(event)" ondrop="layDrop(event,${i})" ondragend="layDragEnd(event)">
        <td style="padding:4px 6px;text-align:center;cursor:grab;color:var(--fg3);touch-action:none" title="ドラッグで並び替え" onpointerdown="layRowPointerDown(event,${i})">⠿</td>
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
            ${['solid','dashed','dotted','dashdot'].map(d=>`<option value="${escH(d)}"${(l.lineDash||'solid')===d?' selected':''}>${dashLabels[d]}</option>`).join('')}
          </select>
        </td>
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <input type="number" min="0.5" max="10" step="0.5" value="${escH(l.lineWidth||1)}"
            style="width:80px;font-size:12px;padding:2px 4px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:2px"
            onchange="LAYERS[${i}].lineWidth=parseFloat(this.value)||1;draw()">
        </td>
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <input type="number" min="6" max="72" step="1" placeholder="個別" ${l.fontSize!=null?`value="${escH(l.fontSize)}"`:''}
            style="width:80px;font-size:12px;padding:2px 4px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:2px"
            onchange="applyLayerFontSize(${i},this.value)" oninput="if(!this.value){applyLayerFontSize(${i},null)}">
        </td>
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <input type="text" placeholder="属性（例:200V）" value="${escH(l.attr||'')}"
            style="width:90px;font-size:11px;padding:2px 4px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:2px"
            onchange="LAYERS[${i}].attr=this.value">
        </td>
        <td style="padding:4px 10px;text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
          <button onclick="renameLayer(${i})" title="名前変更" style="font-size:11px;padding:1px 6px;margin-right:4px;cursor:pointer;border:1px solid var(--bd2);border-radius:3px;background:var(--bg3);color:var(--fg)">名前</button>
          ${LAYERS.length>1?`<button onclick="deleteLayer(${i})" title="削除" style="font-size:11px;padding:1px 6px;cursor:pointer;border:1px solid var(--bd2);border-radius:3px;background:var(--bg3);color:var(--red)">削除</button>`:''}
        </td>
      </tr>`).join('');
  }
  document.getElementById('s-lay').textContent = LAYERS.find(l => l.active)?.name || '回路';
  // リボンのアクティブレイヤードロップダウンを同期
  const sel = document.getElementById('active-layer-sel');
  if (sel) {
    const activeLayer = LAYERS.find(l => l.active);
    const activeName = activeLayer?.name || '';
    sel.innerHTML = LAYERS.map(l =>
      `<option value="${escH(l.name)}" ${l.name===activeName?'selected':''}>${escH(l.name)}</option>`
    ).join('');
    const colorBox = document.getElementById('qb-layer-color');
    if (colorBox) colorBox.style.background = activeLayer?.color || '#888';
  }
}
// レイヤー並び替えドラッグ（タッチ用：HTML5 DnD(draggable)はiOS/Android共に指では発火しないため、
// pointerdown/move/upで独自実装。マウスは従来通りHTML5 DnD(下のlayDragStart等)を使用する）
function layRowPointerDown(e, i) {
  if (e.pointerType !== 'touch') return; // マウス/ペンは既存のdraggable DnDに任せる
  e.preventDefault();
  let dragIdx = i;
  let pushed = false;
  const onMove = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = el && el.closest ? el.closest('tr[data-layidx]') : null;
    if (!row) return;
    const toIdx = parseInt(row.dataset.layidx, 10);
    if (isNaN(toIdx) || toIdx === dragIdx) return;
    if (!pushed) { pushH(); pushed = true; }
    const moved = LAYERS.splice(dragIdx, 1)[0];
    LAYERS.splice(toIdx, 0, moved);
    dragIdx = toIdx;
    renderLayers();
  };
  const onUp = () => {
    if (pushed) draw();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

let _layDragFrom = -1;
function layDragStart(e, i) {
  _layDragFrom = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.5';
}
function layDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function layDrop(e, toIdx) {
  e.preventDefault();
  if (_layDragFrom < 0 || _layDragFrom === toIdx) return;
  pushH();
  const moved = LAYERS.splice(_layDragFrom, 1)[0];
  LAYERS.splice(toIdx, 0, moved);
  _layDragFrom = -1;
  renderLayers(); draw();
}
function layDragEnd(e) {
  e.currentTarget.style.opacity = '';
  _layDragFrom = -1;
}

function setActLayer(i) { LAYERS.forEach((l,j) => l.active = j===i); renderLayers(); }
function setActLayerByName(name) { LAYERS.forEach(l => l.active = l.name===name); renderLayers(); }
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
  // 【バグ④修正 2026-08-14】旧実装は現在ページのstate.elements/wires(getter経由で
  // this.page.elementsのみ)しか付け替えておらず、複数ページで同じレイヤーを使って
  // いる場合、他ページの要素が旧レイヤー名のまま孤立していた。孤立するとLAYERS参照が
  // 引けず色・線幅がfgC()等のフォールバックになり、「シンボル/配線が1個だけ突然
  // 壊れたように灰色/白っぽくなる」症状として現れる。deleteLayer()と同じ全ページ
  // 付け替え方式に統一。
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  state.pages.forEach(pg => {
    (pg.elements||[]).forEach(el=>{ if(el.layer===oldName) el.layer=newName; });
    (pg.wires||[]).forEach(w=>{ if(w.layer===oldName) w.layer=newName; });
  });
  LAYERS[i].name = newName;
  renderLayers();
  draw();
}
function deleteLayer(i) {
  const l = LAYERS[i];
  // 【バグ修正】LAYERSは全ページ共通のグローバル配列だが、旧実装はstate.elements/wires(現在ページのみ)
  // しか付け替えていなかった。他ページに同名レイヤーの要素が残ったままLAYERSからは削除されるため、
  // そのページをDXF書き出しするとLAYERテーブルに存在しないレイヤーをENTITIESが参照する不正な
  // ファイルになる(TrueView等の正規AutoCAD系リーダーが開けない実例で発覚 2026-07-23)。
  // 全ページを対象に付け替えるよう修正。
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  let total = 0;
  state.pages.forEach(pg => {
    total += (pg.elements||[]).filter(e=>e.layer===l.name).length;
    total += (pg.wires||[]).filter(w=>w.layer===l.name).length;
  });
  if (total > 0) {
    if (!confirm(`レイヤー「${l.name}」には全ページで${total}個のオブジェクトがあります。\n削除すると別レイヤーに移動します。\n続けますか？`)) return;
    const fallback = LAYERS.find((l2,j)=>j!==i)?.name || '回路';
    state.pages.forEach(pg => {
      (pg.elements||[]).forEach(el=>{ if(el.layer===l.name) el.layer=fallback; });
      (pg.wires||[]).forEach(w=>{ if(w.layer===l.name) w.layer=fallback; });
    });
  } else {
    if (!confirm(`レイヤー「${l.name}」を削除しますか？`)) return;
  }
  LAYERS.splice(i, 1);
  if (!LAYERS.find(l=>l.active)) LAYERS[0].active = true;
  renderLayers();
  draw();
}

// 【救済策】過去にdeleteLayerのバグで生じた「LAYERS未登録だが要素が参照している」孤立レイヤー名を
// 全ページから検出し、LAYERSに復元登録する。既存図面ファイルの補修用。
function repairOrphanLayers() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const known = new Set(LAYERS.map(l=>l.name));
  const orphans = new Set();
  state.pages.forEach(pg => {
    (pg.elements||[]).forEach(el=>{ if(el.layer && !known.has(el.layer)) orphans.add(el.layer); });
    (pg.wires||[]).forEach(w=>{ if(w.layer && !known.has(w.layer)) orphans.add(w.layer); });
  });
  if (!orphans.size) { alert('孤立レイヤー参照は見つかりませんでした。'); return; }
  pushH();
  orphans.forEach(name => LAYERS.push({ name, color:'#888888', visible:true, locked:false, active:false, lineWidth:DEFAULT_LINE_WIDTH, lineDash:'solid', fontSize:null, attr:'' }));
  renderLayers(); draw();
  alert(`${orphans.size}件のレイヤーを復元登録しました:\n${[...orphans].join(', ')}`);
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
  LAYERS.push({ name:n, color:'#888888', visible:true, locked:false, active:false, lineWidth:DEFAULT_LINE_WIDTH, lineDash:'solid', fontSize:null, attr:'' });
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

// 【2026-09-21】recordRecentSym(内蔵シンボルの使用履歴)を削除した。
// BUILTIN_SYMS(標準シンボル20種)専用の機能で、標準シンボルの削除に伴い
// 呼んでも常に何もしない状態になっていた。localStorageの
// 'recentBuiltinSyms' は読み書きしなくなるだけで、残っていても害は無い。

// ----------------------------------------------------------------
// 部品DB
// ----------------------------------------------------------------
function allParts() {
  // 【2026-10-03】標準部品2件(BUILTIN_PARTS)はやめた。部品はすべて部品DBから
  return [
    ...state.customParts.map(p => ({ ...p, custom:true })),
  ];
}
function renderPartsAll()  { renderMakerTabs(); renderPartsTable2(); renderPartsDbCount(); }

// 部品DBパネルの見出しに件数を常時出す。
// 2026-09-01: 約440型番が欠落していたのに気づくのが遅れた原因の一つが
// 「合計件数がどこにも出ていない」ことだった。開けば必ず目に入る場所に出す。
//
// 【2026-09-03】CADは部品DBを読むだけになったので「未保存」の概念は無い。
// 代わりに、サーバーから読めているか(partsDb.hasFile())を出す
// ——読めていなければ0件のまま図面を描いていることになるため。
function renderPartsDbCount() {
  const el = document.getElementById('prt-float-count');
  if (!el) return;
  const n = state.customParts ? state.customParts.length : 0;
  const connected = !(typeof partsDb !== 'undefined' && partsDb.hasFile && !partsDb.hasFile());
  el.textContent = connected ? `${n}件` : `${n}件・未接続`;
  el.style.color = connected ? 'var(--fg3)' : 'var(--red)';
  el.title = connected ? '部品DBに登録されている部品の件数'
    : '部品DBを読み込めていません。ローカルサーバー(start.bat)が動いているか確認してください';
}
// filterParts は下で定義
// 部品DBの部品をクリックしたときの動作（2026-08-21に変更）。
//
// 以前は種別(p.type)をそのままシンボル種別として配置モードに入っていたが、
// これは誤り。同じS-T21でも主回路では接点、制御回路ではコイルを描くので、
// 部品と図記号は1対1ではない。種別コードを細分化したこともあり、
// 対応する図記号が無い種別(plc/hmi/contactor等)では描けもしなかった。
//
// ============================================================
// 端子番号の「名前付きグループ」対応（2026-08-22）
// ------------------------------------------------------------
// 【背景】盛田さんの指摘で判明した構造的な問題。
// 部品DBの端子番号欄はフラットなカンマ区切り1本で、シンボルの端子点に頭から
// 順に割り当てる仕様だった。ところが1つの型式が複数のシンボルに分かれて図面に
// 現れる部品がある:
//   ・電磁接触器 …… コイルシンボル(A1,A2) + 主接点シンボル(1,3,5,2,4,6) + 補助接点(13,14)
//   ・ブレーカ …… 主回路(1〜6) + 補助スイッチ(11,12,14) + 警報スイッチ(91,92,94)
//                  + 漏電動作出力(71,72,74)
// フラット1本だと「A1,A2,1,3,5,2,4,6」が主接点シンボル(6点)に頭から入って
// 「A1,A2,1,3,5,2」という無意味な並びになる。たまたまコイルシンボルに当てた
// ときだけ正しく、それ以外は壊れていた。
//
// 【対応】端子番号欄を「名前:番号,番号 / 名前:番号,番号」形式にする。
//   例) コイル:A1,A2 / 主回路:1,3,5,2,4,6 / 補助:13,14
//   例) 主回路:1,2,3,4,5,6 / 補助:11,12,14 / 警報:91,92,94
// 「:」が無い従来データは名前なしの単一グループとして扱う（後方互換）。
// CSV・SQLiteの列は増やさない（terminals列の書き方が変わるだけ）ので、
// 取り込み経路(catalog_db.py)は無改修で済む。
// ============================================================

// 端子番号欄を解析してグループの配列にする。
// 戻り値: [{ name:'主回路', list:['1','2',...] }, ...]
// 「:」を含まない場合は name:'' の1グループ（従来どおりの動作）。
function parseTerminalGroups(str) {
  const s = String(str || '').trim();
  if (!s) return [];
  // 「/」区切り。ただし従来データに「/」が入っている可能性を考えて、
  // グループ名(「:」)が1つも無いときは分割せずそのまま1グループとする。
  if (s.indexOf(':') < 0 && s.indexOf('：') < 0) {
    return [{ name: '', list: s.split(',').map(x => x.trim()).filter(x => x) }];
  }
  // 【2026-09-20】区切りの「/」は、**直後にグループ名＋コロンが続くもの**だけ。
  //
  // 三菱インバータの主回路端子は R/L1・S/L2・T/L3、オプションは P/+・N/- と、
  // **端子記号そのものにスラッシュが入る**。素朴に '/' で割ると「R」と「L1」に
  // 砕けてしまう。
  // かといって「前後の空白」で見分けると、既存のPLC用データ
  // (`入力:X0,X1,X2,COM/出力:Y0,Y1,COM` = 空白なし)が割れなくなる。
  // 区切りの「/」の後には必ず「名前:」が来る、という違いで見分ける。
  //   割る : ...COM/出力:Y0...      (「出力」+「:」が続く)
  //   割らぬ: 主回路:R/L1,S/L2...   (「L1」の後は「,」でコロンが来ない)
  return s.split(/\/(?=\s*[^/:：,]+[:：])/).map(part => {
    const t = part.trim();
    if (!t) return null;
    const m = t.match(/^([^:：]+)[:：](.*)$/);
    const name = m ? m[1].trim() : '';
    const body = m ? m[2] : t;
    const list = body.split(',').map(x => x.trim()).filter(x => x);
    if (!list.length) return null;
    return { name, list };
  }).filter(g => g);
}

// 【2026-10-03】c接点(3端子)のグループ名に書いた端子の並び「接点1(NC・NO・共通):1,5,9」を読み、
// { com, no, nc } を返す。並びが書いていない・3端子でない・共通/NO/NCが揃っていないときは null。
// 並びは型式ごとに違う(MYは NC・NO・共通、H3CR-Aの接点2は 共通・NC・NO)ので、カタログで確かめてCSVの名前に書く。
// a接点のシンボルに割り当てると 共通,NO、b接点なら 共通,NC を入れる(doPlacePart)。クロスリファレンスの空き接点の枠も読む(xref.js)
function cContactRoles(name, list) {
  const m = String(name || '').match(/[(（]([^)）]*)[)）]/);
  if (!m || !list || list.length !== 3) return null;
  const toks = m[1].split(/[・,、\/]/).map(t => t.trim().toUpperCase());
  if (toks.length !== 3) return null;
  const out = {};
  toks.forEach((t, i) => {
    const k = t === '共通' || t === 'COM' || t === 'C' ? 'com' : t === 'NO' ? 'no' : t === 'NC' ? 'nc' : '';
    if (k) out[k] = String(list[i]).trim();
  });
  return (out.com && out.no && out.nc) ? out : null;
}

// 選択中のシンボルの端子点の数を返す（グループ自動判定に使う）。
// カスタムシンボル以外・端子未設定は0。
function symTerminalCount(el) {
  if (!el) return 0;
  const cS = (state.customSymbols || []).find(s => s.type === el.type);
  return (cS && cS.terminals) ? cS.terminals.length : 0;
}

// 端子番号の位置補正UI(プロパティの「端子番号」欄の直下)を組み立てる。
//
// カンマ区切り1行の「端子番号」欄だけでは、どの番号がどの端子点に付くのかが
// 画面から判らない。ここで端子点を1つずつ並べ、そこに出る番号と位置補正を
// 並べて見せる。番号そのものはカンマ区切りの欄が一次情報なので、ここでは
// 読み取り専用で表示する(二重の入力欄を作ると食い違いの元になるため)。
//
// 端子点の並び・番号の決まり方は draw.js の symTermPoints と同一。
// 表示していない番号の補正欄を出しても意味が無いので、番号が1つも無いときは
// 欄ごと出さない。
function symTermOffHtml(el) {
  if (typeof symTermPoints !== 'function') return '';
  const cS  = (state.customSymbols || []).find(s => s.type === el.type);
  const pts = symTermPoints(el, cS, (typeof getDef === 'function' ? getDef(el.type) : null) || {});
  // 【2026-09-20】以前は「番号が1つも無ければ欄ごと出さない」にしていたが、
  // それだと空の状態から手で入れられなかった。端子点があれば必ず出す。
  if (!pts.length) return '';

  const list = String(el.terminals || '').split(',').map(s => s.trim());
  const extra = list.slice(pts.length).filter(x => x);   // 端子点より多い分

  let h = `<div class="pp-group"><details open><summary style="font-size:11px;cursor:pointer;padding:2px 5px;color:var(--fg3)">端子番号（${pts.length}点）</summary>`;
  if (!state.showTermNo) {
    h += `<p style="font-size:10px;color:var(--fg3);padding:2px 5px;line-height:1.4">図面には出ていません。［表示］タブの「端子番号」をONにすると出ます。</p>`;
  }
  if (extra.length) {
    h += `<p style="font-size:10px;color:var(--red);padding:2px 5px;line-height:1.4">`
      +  `番号が端子点より${extra.length}個多いです（余り: ${escH(extra.join(','))}）。`
      +  `部品DBの端子番号は1台ぶんの全端子なので、このシンボルの分だけ下の欄で選び直してください。`
      +  `下の欄を編集すると余りは消えます。</p>`;
  }
  h += `<div class="pp-row"><label>文字サイズ</label><input type="number" id="pp-tfs" value="${escH(el.termFs || 9)}" step="1" min="5" max="24" oninput="previewTermNo()"></div>`;
  // X,Yの刻み幅は1(2026-09-24、盛田さん「端子だけ1」)。仕様・デバイス・型式の
  // 位置補正は5のまま。9-22に5へ揃えたが、端子番号の微調整には粗すぎた。
  pts.forEach(p => {
    const o = (el.termOff || [])[p.i] || [0, 0];
    h += `<div class="pp-row" style="align-items:center">`
      +  `<label style="white-space:nowrap;font-size:10px">${p.i + 1} ${escH(symTermPosHint(p, pts))}</label>`
      +  `<span style="display:flex;gap:3px;align-items:center;font-size:10px;color:var(--fg3)">`
      +  `<input type="text" class="pp-tnum" data-ti="${p.i}" value="${escH(p.label || '')}" placeholder="番号" title="この端子に書く番号。空にすると何も出ません" oninput="previewTermNum()">`
      +  `X<input type="number" class="pp-toff-x" data-ti="${p.i}" value="${escH(Number(o[0]) || 0)}" step="1" title="右へずらすと＋、左へずらすと－" oninput="previewTermNo()">`
      +  `Y<input type="number" class="pp-toff-y" data-ti="${p.i}" value="${escH(Number(o[1]) || 0)}" step="1" title="下へずらすと＋、上へずらすと－" oninput="previewTermNo()">`
      +  `</span></div>`;
  });
  h += `<div class="pp-row" style="gap:6px"><button onclick="resetTermNoOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button>`
    +  `<button onclick="clearTermNums()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">番号を全部消す</button></div>`;
  h += `</details></div>`;
  return h;
}

// 端子がシンボルのどこにあるかを日本語で返す（「左上」「中下」等）。
//
// 【なぜ要るか・2026-09-20】盛田さん「自動で端子番号入れると単純に左から
// 入ってる時点で問題あり、現状だと自動で入れて修正がいるが修正ができない」。
// 主接点は接点3個を並べて1つのシンボルに登録されているため、端子点が6つある。
// 番号欄だけ並べても「3番目の欄」がどの端子か画面から分からず、直しようがない。
function symTermPosHint(p, pts) {
  const maxR = Math.max(1, ...pts.map(q => Math.hypot(q.rx || 0, q.ry || 0)));
  const th = maxR * 0.2;
  const v = (p.ry < -th) ? '上' : (p.ry > th) ? '下' : '';
  const hh = (p.rx < -th) ? '左' : (p.rx > th) ? '右' : (v ? '中' : '');
  return (hh + v) || '中央';
}

// 入力のたびに図面へ反映する(既存の previewLabelOff 等と同じ流儀)。
// 確定は他の項目と同じく「適用」で行われるが、押す前に位置が見えないと
// 数値を決めようがないため、ここで先に描いて見せる。
function previewTermNo() {
  const el = document.getElementById('rp-body')?._el;
  if (!el) return;
  const fs = document.getElementById('pp-tfs');
  el.termFs  = fs ? (parseInt(fs.value) || undefined) : el.termFs;
  const t = _readTermOff();
  if (t) el.termOff = t; else delete el.termOff;
  drawWithoutSel();
}

// 端子番号の欄(1端子ずつ)を編集したとき。
//
// **カンマ区切りの「端子番号」欄(pp-term)が唯一の保存先**で、ここはその
// 読み書きの窓口。二重管理にしないため、入力のたびに pp-term へ書き戻す。
// 端子点より多かった余りの番号はここで落ちる(欄に赤字で予告してある)。
function previewTermNum() {
  const el = document.getElementById('rp-body')?._el;
  if (!el) return;
  const nums = _readTermNums();
  if (nums === null) return;
  // 末尾の空欄は切り詰める(「A1,,,,,」のような無意味な尻尾を残さない)
  const arr = nums.slice();
  while (arr.length && !arr[arr.length - 1]) arr.pop();
  const s = arr.join(',');
  el.terminals = s;
  const pt = document.getElementById('pp-term');
  if (pt) pt.value = s;
  drawWithoutSel();
}

// カンマ区切りの欄を直接いじったとき、1端子ずつの欄を追随させる。
// どちらから編集しても食い違わないようにするため。
function syncTermNumInputs() {
  const pt = document.getElementById('pp-term');
  if (!pt) return;
  const list = String(pt.value || '').split(',').map(s => s.trim());
  document.querySelectorAll('.pp-tnum').forEach(inp => {
    const i = parseInt(inp.dataset.ti);
    inp.value = list[i] || '';
  });
  const el = document.getElementById('rp-body')?._el;
  if (el) { el.terminals = pt.value; drawWithoutSel(); }
}

function _readTermNums() {
  const ins = [...document.querySelectorAll('.pp-tnum')];
  if (!ins.length) return null;
  const arr = [];
  ins.forEach(inp => { arr[parseInt(inp.dataset.ti)] = (inp.value || '').trim(); });
  for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = '';
  return arr;
}

function clearTermNums() {
  const el = document.getElementById('rp-body')?._el;
  document.querySelectorAll('.pp-tnum').forEach(i => { i.value = ''; });
  const pt = document.getElementById('pp-term');
  if (pt) pt.value = '';
  if (el) { el.terminals = ''; drawWithoutSel(); }
}

function resetTermNoOff() {
  const el = document.getElementById('rp-body')?._el;
  if (!el) return;
  document.querySelectorAll('.pp-toff-x, .pp-toff-y').forEach(i => { i.value = 0; });
  delete el.termOff;
  drawWithoutSel();
}

// 入力欄から termOff を組み立てる。全部0なら undefined を返し、
// 既存図面に無意味な配列を焼き込まない(保存サイズと差分を増やさないため)。
function _readTermOff() {
  const xs = [...document.querySelectorAll('.pp-toff-x')];
  if (!xs.length) return undefined;
  const arr = [];
  let any = false;
  xs.forEach(ix => {
    const i  = parseInt(ix.dataset.ti);
    const iy = document.querySelector(`.pp-toff-y[data-ti="${i}"]`);
    const dx = parseInt(ix.value) || 0;
    const dy = iy ? (parseInt(iy.value) || 0) : 0;
    arr[i] = [dx, dy];
    if (dx || dy) any = true;
  });
  return any ? arr : undefined;
}

// 割り当てるグループを決める。
// シンボルの端子点数と一致するグループが1つだけならそれを自動採用する
// （主回路6点 / 補助接点3点 のように数が違えば迷わない）。
// 一致が0個または2個以上なら null を返し、呼び出し側で選ばせる。
function pickTerminalGroup(groups, termCount) {
  if (!groups.length) return null;
  if (groups.length === 1) return groups[0];
  if (!termCount) return null;
  const hit = groups.filter(g => g.list.length === termCount);
  return hit.length === 1 ? hit[0] : null;
}

// 割り当て待ちの情報（グループを選ばせている間の一時保持）
let _pendingAssign = null;

// グループ選択パネルを出す。選ぶと applyPartAssign() が呼ばれる。
// narrowed=true は「シンボルの種別に当たるグループが2つ以上あったので、
// 当たったものだけに絞って出している」ことを示す。全グループを出す通常の呼び方と
// 見た目が同じだと、なぜこの並びなのかが分からないため一言添える。
function askTerminalGroup(type, ref, groups, narrowed) {
  _pendingAssign = { type, ref, groups };
  const box = document.getElementById('tg-list');
  if (!box) {   // パネルが無い環境では先頭グループで進める（安全側）
    applyPartAssign(0);
    return;
  }
  document.getElementById('tg-ref').textContent = ref;
  const note = document.getElementById('tg-note');
  if (note) {
    note.textContent = narrowed
      ? `このシンボルの種別に当てはまるグループが${groups.length}つあります。どれを入れますか。`
      : '';
    note.style.display = narrowed ? '' : 'none';
  }
  box.innerHTML = groups.map((g, i) =>
    `<button class="fp-btn" style="display:block;width:100%;text-align:left;margin-bottom:4px"
       onclick="applyPartAssign(${i})">${escH(g.name || '(名前なし)')}　<span style="color:var(--fg3)">${escH(g.list.join(','))}</span></button>`
  ).join('');
  openFP('term-group-p');
}

function applyPartAssign(idx) {
  if (!_pendingAssign) return;
  const { type, ref, groups } = _pendingAssign;
  const g = groups[idx];
  _pendingAssign = null;
  closeFP('term-group-p');
  if (g) doPlacePart(type, ref, g.list.join(','), g.name);
}

// 正しくは「シンボルを置いてから部品を割り当てる」。ここでは選択中の
// シンボルに型番・端子番号・コイル電圧を書き込む。
//
// 端子番号が名前付きグループ形式のときは、シンボルの端子点数から自動判定し、
// 決まらなければ選択パネルを出す。
function placePart(type, ref, terminals) {
  const targets = state.elements.filter(e => state.sel.els.has(e.id) && e.type !== 'junction');
  if (!targets.length) {
    const hint = document.getElementById('s-hint');
    if (hint) hint.textContent = `「${ref}」を割り当てるシンボルを先に選択してください`;
    alert(`「${ref}」を割り当てるシンボルを先に選択してください。\n\n`
        + `部品DBは図記号を持ちません。図面にシンボルを置いてから、\n`
        + `そのシンボルを選択した状態でこの部品をクリックしてください。`);
    return;
  }
  if (typeof recordRecentPart === 'function') recordRecentPart(ref);   // 最近使った(段階4)
  const groups = parseTerminalGroups(terminals);
  if (groups.length <= 1) {
    doPlacePart(type, ref, groups.length ? groups[0].list.join(',') : '', '');
    return;
  }
  // 【2026-09-20】まずシンボルの種別(コイル/主接点/補助接点)で選ぶ。
  //
  // 盛田さん「このシンボルは主接点、コイル、補助で選べれて図面のシンボルは
  // 自動で入ったほうが修正入れるにしても端子番号を調べなくていいから都合がいい」。
  // 端子点数での判定(下の従来ロジック)は、主接点6点と補助接点が3点…のように
  // 数がたまたま一致してしまうと外すし、端子点が未設定のシンボル(数が0)では
  // 一切効かない。種別で選べるならそちらの方が確実。
  //
  // 選択中のシンボルの種別が揃っているときだけ使う。混ざっているときは
  // 1つの端子番号を全部に入れることになり、どれかが必ず間違うため従来どおりに落とす。
  const roles = [...new Set(targets.map(symTermRole))];
  if (roles.length === 1 && roles[0]) {
    const hit = matchGroupsByRole(groups, roles[0]);
    if (hit.length === 1) { doPlacePart(type, ref, hit[0].list.join(','), hit[0].name); return; }
    // 【2026-09-20】2つ以上当たったときは、従来は「決まらない」として
    // 端子点数判定→全グループの一覧へ落ちていた。
    // 可逆電磁接触器の「正転コイル」「逆転コイル」のように、どちらも正しくて
    // 人が選ぶしかないものが実際にある(部品DB実測で34件)。
    // 全グループを並べ直すより、当たったものだけを出す方が選びやすく間違えにくい。
    if (hit.length > 1) { askTerminalGroup(type, ref, hit, true); return; }
  }
  // 選択中シンボルの端子点数（複数選択時は全部同じ数のときだけ自動判定に使う）
  const counts = [...new Set(targets.map(symTerminalCount))];
  const g = counts.length === 1 ? pickTerminalGroup(groups, counts[0]) : null;
  if (g) doPlacePart(type, ref, g.list.join(','), g.name);
  else askTerminalGroup(type, ref, groups);
}

// 配置済みシンボルの種別(シンボル登録/端子編集で指定した role)を返す。
// report.js の symRole と同じ判定。あちらは帳票専用なので、部品割り当てからも
// 使えるようここに同じ入口を置く（判定の中身は1箇所に寄せたいが、report.js は
// 帳票を開いたときにしか読まれない前提の作りなので、今回は呼び分けない）。
//
// 【2026-09-21】標準シンボルの isCoil / isContact + contactType による判定を
// 削除した。標準シンボル自体を削除したため、この経路は到達しない。
function symTermRole(el) {
  if (!el) return '';
  const cS = (state.customSymbols || []).find(s => s.type === el.type);
  if (cS && cS.role) return cS.role;
  const d = (typeof getDef === 'function' ? getDef(el.type) : null) || {};
  if (d.role) return d.role;
  return '';
}

// 種別に対応する端子グループ名の書き方。部品DBのCSVは人が手で書くので、
// 「コイル」「操作コイル」「主接点」「主回路」のような揺れを吸収する。
// 該当が1つに決まらないときは null を返し、従来の端子点数判定へ落とす
// （推測で入れて外すより、聞いた方がよい）。
const TERM_GROUP_PATTERNS = {
  coil:         [/コイル/, /操作/],
  contact_main: [/主接点/, /主回路/, /^\s*主/],
  // 【2026-10-03】三菱ブレーカの警報スイッチ(AL)も接点(「警報(a接点)」等)。AXと両方当たるので選択パネルで選ぶ
  // 【2026-10-03】リレー・タイマのc接点は名前に端子の並びを書いた「接点1(NC・NO・共通)」等。a・bどちらにも使えるので両方に当てる
  contact_a:    [/補助/i, /^aux/i, /警報/, /[(（][^)）]*N[CO][^)）]*[)）]/],
  contact_b:    [/補助/i, /^aux/i, /警報/, /[(（][^)）]*N[CO][^)）]*[)）]/],
};

// 上のパターンに当たってしまうが、その種別ではないもの。
//
// 【2026-09-20】三菱インバータFR-D700の「主回路オプション」(P/+,PR,N/-,P1)は
// 回生抵抗器やDCリアクトルをつなぐ端子で、主接点ではない。
// /^\s*主/ が拾ってしまい「主回路」と2つ当たるため、30件で自動選択が効かなかった。
const TERM_GROUP_EXCLUDE = {
  contact_main: [/オプション/],
  // 【2026-10-03】三菱ブレーカの補助スイッチ(AX)は「補助(a接点):11,14 / 補助(b接点):11,12」と書いた
  // (総合カタログp.203 表6-3)。a接点のシンボルには a接点の組、b接点のシンボルには b接点の組を自動で入れる
  contact_a: [/b接点/],
  contact_b: [/a接点/],
};

// 種別に当たるグループを全部返す。1つに決まらないときの扱いは呼び出し側で決める。
function matchGroupsByRole(groups, role) {
  const pats = TERM_GROUP_PATTERNS[role];
  if (!pats) return [];
  const ng = TERM_GROUP_EXCLUDE[role] || [];
  return (groups || []).filter(g => {
    const name = g.name || '';
    return pats.some(re => re.test(name)) && !ng.some(re => re.test(name));
  });
}
function pickGroupByRole(groups, role) {
  const hit = matchGroupsByRole(groups, role);
  return hit.length === 1 ? hit[0] : null;
}

// 定格電圧欄が「選択肢の羅列」ではなく型式で一意に決まる単一値である種別。
// 例: FR-D720系は三相200V固定、FR-D740系は三相400V固定。
// これらは選択の手間なしに定格電圧欄をそのまま仕様欄へ使ってよい(doPlacePart参照)。
const DIRECT_VOLT_TYPES = ['inverter', 'servo', 'servo_motor'];

// 実際に書き込む処理。
//
// 【2026-08-22修正】盛田さんの指摘: 既に書いた図面（仕様欄に手書きでデバイス名・注記等を
// 入力済み）に対して端子番号だけ足したくて部品DBをクリックしても、以下のel.labelへの
// 無条件上書きのせいで仕様欄が丸ごと[電圧/電流/接点構成]に置き換わり、手書き内容が
// 消えていた。「型番を割り当てるたびに全シンボル書き直しになるので使えない」という
// 実害が出ていたバグ。型番・端子番号は元々「値がある時だけ」上書きする配慮があったのに
// 仕様欄だけ無条件上書きだったのが原因。→ 仕様欄が空のときだけ自動入力するよう変更し、
// 既に何か書かれている場合は一切触らない（過去のoutlineDxf破壊バグと同じ教訓: 割り当て系の
// 操作は既存データを問答無用で上書きしない）。
function doPlacePart(type, ref, terminals, groupName) {
  const p = (state.customParts || []).find(x => x.ref === ref);
  const targets = state.elements.filter(e => state.sel.els.has(e.id) && e.type !== 'junction');
  if (!targets.length) return;
  pushH();                         // 変更前の状態を履歴に積む
  let labelFilled = 0, labelSkipped = 0;
  // デバイス台帳(js/devices.js): 割り当てる前のデバイスの仕様。デバイスに既に仕様があれば、自動の仕様は入れない(手書きの保護)
  const specBefore = new Map();
  if (typeof deviceLedger === 'function') deviceLedger().forEach(d => { if (d.vals.label) specBefore.set(d.key, d.vals.label); });
  // 【2026-10-03】c接点(3端子)のグループを a接点のシンボルに割り当てたら 共通,NO、b接点なら 共通,NC だけを入れる
  const cc = (terminals && typeof cContactRoles === 'function') ? cContactRoles(groupName, String(terminals).split(',')) : null;
  targets.forEach(el => {
    el.partModel = ref;
    if (terminals) {
      const r = cc ? symTermRole(el) : '';
      el.terminals = r === 'contact_a' ? cc.com + ',' + cc.no : r === 'contact_b' ? cc.com + ',' + cc.nc : terminals;
    }
    applyDefaultVolt(el);          // AC200V優先で代表値を入れる
    applyDefaultChoices(el);       // ブレーカ系: 極数は2P(電流・特性は未選択)
    // 仕様欄に主要項目（電圧・電流・接点構成）を入れる。
    // 図面には「AC100V」のように1つだけ書くので、電圧は選択肢の羅列ではなく
    // 選ばれた1つを入れる。要らない行はその場で消してもらう前提。
    // 備考・出典は長すぎて図面に出すものではないので入れない。
    // 【重要】既に仕様欄に何か入っている場合は一切上書きしない（手書き内容の保護）。
    if (p) {
      if ((el.label || '').trim() || (typeof devKey === 'function' && specBefore.has(devKey(el.partRef)))) {
        labelSkipped++;
      } else {
        // インバータ・サーボは型式自体で電圧が決まる(例: FR-D720系は200V固定)ので、
        // コイル電圧のような選択(el.partVolt)を経由せず、定格電圧欄をそのまま使う。
        if (partChoices(ref)) {
          // 選択項目のある部品(ブレーカ系): 選択肢の一覧ではなく、選んだ値だけを入れる
          const t = partChoiceLabel(el);
          if (t) { el.label = t; labelFilled++; }
        } else {
          const voltLine = el.partVolt || (DIRECT_VOLT_TYPES.includes(p.type) ? (p.volt || '') : '');
          const lines = [voltLine, p.amp || '', p.contacts || '']
            .map(x => String(x).trim())
            .filter(x => x && x !== '-');
          if (lines.length) { el.label = lines.join('\n'); labelFilled++; }
        }
      }
    }
  });
  // デバイス台帳: 割り当てた型番・電圧・選択はデバイスの全部の記号へ(同じデバイスで値が違うことは無い)。
  // 仕様は、デバイスに元から仕様があればそれ、無ければ今入れた自動の仕様を、デバイスの仕様にする
  if (typeof devSetField === 'function') {
    const done = new Set();
    targets.forEach(el => {
      const key = devKey(el.partRef);
      if (!key || done.has(key)) return;
      done.add(key);
      ['partModel', 'partVolt', 'partPoles', 'partAmp', 'partChar'].forEach(f => devSetField(key, f, el[f] || ''));
      const spec = specBefore.get(key) || String(el.label || '').trim();
      if (spec) devSetField(key, 'label', spec);
    });
  }
  draw();
  updateRightPanel();
  const hint = document.getElementById('s-hint');
  if (hint) {
    let msg = `「${ref}」を${targets.length}個のシンボルに割り当てました`;
    if (groupName) msg += `［端子:${groupName}］`;
    if (labelSkipped) msg += `（仕様欄は既存${labelSkipped}件を保護、未入力${labelFilled}件のみ自動入力）`;
    hint.textContent = msg;
  }
}
// ----------------------------------------------------------------
// コイル電圧（2026-08-20）
//
// カタログの定格電圧欄には選べる電圧が全部入っている（例:「AC100V・AC200V」）。
// 実際にどれを使うかは盤ごとの設計判断なので、部品DBではなく
// 図面に配置した要素(el.partVolt)に持たせる。
// これにより同じ型番を別電圧で使う盤も作れる。
// 部品表はこの値を型番と一緒に出し、型番＋電圧が同じものだけを1行にまとめる。
// ----------------------------------------------------------------

// 定格電圧欄の文字列から選択肢を取り出す。
// 「AC100V・AC200V」「DC24V(標準、他DC12~220V選択可)」のような表記に対応。
//
// 手順の順番が重要:
//  1. 先に括弧書き(補足説明)を落とす。括弧の中にも読点やスラッシュが入るため、
//     先に分割すると「DC24V(標準」「他DC12~220V選択可」のように壊れる。
//  2. 「・」「、」「,」で分割する。スラッシュは選択肢の区切りではなく
//     「AC100/110/120」のようにまとめ書きに使われるため、ここでは分けない。
//  3. まとめ書きをAC/DCの別を保ったまま展開する(AC100/110/120 → AC100V・AC110V・AC120V)。
// コイル電圧の選択対象にする種別。
// PLCのアナログユニット等は定格電圧欄に入出力レンジ(「電圧-10~+10V」等)が
// 入っていることがあり、これをコイル電圧として拾うと誤りになるため、
// 操作コイルを持つ機器に限定する。
const COIL_VOLT_TYPES = ['contactor','starter','coil','timer'];

function partVoltOptions(model) {
  if (!model) return [];
  const p = (state.customParts || []).find(x => x.ref === model);
  if (!p || !p.volt) return [];
  if (!COIL_VOLT_TYPES.includes(p.type)) return [];
  const out = [];
  let prefix = '';   // 直前に出てきたAC/DCを覚えておく
  String(p.volt)
    .replace(/[（(][^)）]*[)）]/g, '')      // 1. 括弧書きを先に落とす
    // 2. 選択肢の区切りで分割。
    //    「AC100/110」のようなまとめ書きと区別するため、スラッシュは
    //    前後に空白があるとき(「AC200/220 / DC12」のAC群とDC群の区切り)だけ分割に使う。
    .split(/[・、,]|\s+\/\s+/)
    .forEach(tok => {
      let t = tok.trim();
      if (!t || !/\d/.test(t)) return;
      // 3. 「AC12・24・100/110」のようにAC/DCが省略されることがあるので、
      //    直前の接頭辞を引き継ぐ(そうしないと「24」が何Vか分からなくなる)。
      const pm = t.match(/^(AC|DC)/i);
      if (pm) prefix = pm[1].toUpperCase();
      else if (prefix) t = prefix + t;
      // 4. 「AC100/110/120」形式を展開する
      const m = t.match(/^(AC|DC)\s*([\d./]+)\s*V?$/i);
      if (m && m[2].includes('/')) {
        m[2].split('/').forEach(n => { if (n) out.push(`${m[1].toUpperCase()}${n}V`); });
      } else {
        out.push(/V$/i.test(t) ? t : t + 'V');
      }
    });
  return [...new Set(out)];   // 同じ電圧が重複しても1つにする
}

// 実務でよく使う制御電圧の優先順（盛田さん確認: AC200V > AC100V > DC24V）。
// 単純に選択肢の先頭を代表値にすると、カタログの表は電圧の低い順に並ぶため
// S-T21ならAC24Vが既定で入ってしまう。AC24Vは小容量フレームでは実在するが
// 国内の制御盤ではまず使わないので、よく使うものを優先する。
const COMMON_VOLTS = ['AC200V', 'AC100V', 'DC24V'];

// 型番から代表電圧（既定値）を決める。未選択のまま部品表に空欄が出て
// 発注漏れになるのを防ぐため、必ず何かを入れる。
function defaultPartVolt(model) {
  const o = partVoltOptions(model);
  if (!o.length) return '';
  // 【2026-09-29】前回選んだ電圧(型番に関係なく)が、この型番でも選べるならそれ(settings.js)
  const last = (typeof stPrefs === 'function') ? stPrefs().partVolt : '';
  if (last && o.includes(last)) return last;
  for (const v of COMMON_VOLTS) if (o.includes(v)) return v;
  return o[0];        // よく使う電圧が無ければ先頭
}

// 型番を設定・変更したときに電圧の既定値を入れる。
// 既に選ばれている値が新しい型番でも選べるならそのまま残す。
function applyDefaultVolt(el) {
  if (!el || !el.partModel) return;
  const opts = partVoltOptions(el.partModel);
  if (!opts.length) { delete el.partVolt; return; }
  // 既に選ばれていて、その電圧が新しい型番でも選べるならそのまま残す
  if (!el.partVolt || !opts.includes(el.partVolt)) el.partVolt = defaultPartVolt(el.partModel);
}

// プロパティパネルの電圧欄。選択肢が複数ならプルダウン、
// 1つだけなら自動で決まるので読み取り専用で見せる（選ばせる意味がないため）。
function partVoltRowHtml(el) {
  const opts = partVoltOptions(el.partModel);
  if (!opts.length) return '';
  const cur = el.partVolt && opts.includes(el.partVolt) ? el.partVolt : opts[0];
  if (opts.length === 1) {
    return `<div class="pp-row"><label>コイル電圧</label>`
      + `<input type="text" id="pp-partvolt" value="${_esc(cur)}" readonly`
      + ` style="background:var(--bg3);color:var(--fg2)" title="この型番は1種類のみです"></div>`;
  }
  return `<div class="pp-row"><label>コイル電圧</label><select id="pp-partvolt" onchange="stSetPref('partVolt',this.value)">`
    + opts.map(o => `<option value="${_esc(o)}"${o === cur ? ' selected' : ''}>${_esc(o)}</option>`).join('')
    + `</select></div>`;
}

// 型番を打ち替えたら電圧の選択肢も入れ替える。
// 前の型番の電圧が残ったまま部品表に出るのを防ぐ。
function onPartModelChanged() {
  const el = state.sel.els.size === 1
    ? state.elements.find(e => state.sel.els.has(e.id)) : null;
  if (!el) return;
  const model = document.getElementById('pp-partmodel')?.value.trim() || '';
  const opts = partVoltOptions(model);
  const row = document.getElementById('pp-partvolt')?.closest('.pp-row');
  const tmp = { partModel: model, partVolt: el.partVolt };
  applyDefaultVolt(tmp);
  const html = partVoltRowHtml(tmp);
  if (row) {
    if (html) row.outerHTML = html; else row.remove();
  } else if (html) {
    document.getElementById('pp-partmodel')?.closest('.pp-row')
      ?.insertAdjacentHTML('afterend', html);
  }
  refreshPartChoiceRows(el, model);
}

// ----------------------------------------------------------------
// ブレーカ系の選択項目: 極数・定格電流・動作特性(2026-09-29)
//
// 盛田さん「プルダウンでいい」「仕様のコピーも忘れるなよ」。サーキットプロテクタ(CP)は
// 極数・定格電流・動作特性を選んで初めて型式が決まる。選択肢を部品DBの電流列に全部書くと、
// 配置した図面の仕様欄にも一覧がそのまま入って使えない(補助リレーと同じ「羅列」)。
// そこでコイル電圧(el.partVolt)と同じく、選択肢は部品DBに持ち、図面の要素が1つ選ぶ。
//
// 【書き方】部品DBの電流列(amp)に次の形で書く(列・画面・CSVの作りは変えていない)。
//   極数:1P・2P / 電流:0.1A・0.25A・…・30A / 特性:瞬時形(I)・中速形(M)
// この書き方の行だけがプルダウンになる。従来の書き方(「3,5,10A」等)の行は今までどおり。
// 選んだ値は el.partPoles / el.partAmp / el.partChar に持つ。
// 【コピー】3項目とも DEVICE_PROP_KEYS と、デバイス引き継ぎ(collectDeviceInfo)に入れてある。
// 入れ忘れると貼り付け・デバイス選び直しで選択が消える(2026-09-24に specHide が同じ理由で漏れた)。
// 【既存の「構成子」(js/part_options.js)とは別物】あちらは段階1(ロジックのみ)で画面につながって
// おらず、CSVも通らない。将来つなぐときは、この書き方を構成子へ移す形になる。
// ----------------------------------------------------------------
const PART_CHOICES = [
  { name: '極数',     opt: 'poles', field: 'partPoles', id: 'pp-partpoles', dflt: '2P' },
  { name: '定格電流', opt: 'amp',   field: 'partAmp',   id: 'pp-partamp' },
  { name: '動作特性', opt: 'char',  field: 'partChar',  id: 'pp-partchar' },
];
const PART_CHOICE_SEG = { '極数': 'poles', '電流': 'amp', '特性': 'char' };

// 型番 → { poles:[], amp:[], char:[] }。この書き方でない部品(型番なし・未登録も)は null。
function partChoices(model) {
  if (!model) return null;
  const p = (state.customParts || []).find(x => x.ref === model);
  if (!p || !p.amp) return null;
  const out = { poles: [], amp: [], char: [] };
  let hit = false;
  String(p.amp).split(/\s*\/\s*/).forEach(seg => {
    const m = seg.match(/^(極数|電流|特性)\s*[:：]\s*(.+)$/);
    if (!m) return;
    hit = true;
    out[PART_CHOICE_SEG[m[1]]] = m[2].split(/[・、,]/).map(s => s.trim()).filter(Boolean);
  });
  return hit ? out : null;
}

// 要素の選択を、その型番で選べる値だけに整える。極数は既定の2P。
// 電流・特性は決め打ちしない(間違った既定が図面と発注に黙って出るより、未選択の方が気づける)。
// 選択肢が1つだけならそれが確定値。選べない型番なら3項目とも消す。
function applyDefaultChoices(el) {
  if (!el) return;
  const ch = el.partModel ? partChoices(el.partModel) : null;
  PART_CHOICES.forEach(c => {
    const opts = ch ? ch[c.opt] : [];
    if (!opts.length) { delete el[c.field]; return; }
    if (el[c.field] && opts.includes(el[c.field])) return;
    // 【2026-09-29】前回選んだ値(型番に関係なく)が、この型番でも選べるならそれ(settings.js)
    const last = (typeof stPrefs === 'function') ? stPrefs()['part_' + c.opt] : '';
    const d = (last && opts.includes(last)) ? last
            : (c.dflt && opts.includes(c.dflt)) ? c.dflt : (opts.length === 1 ? opts[0] : '');
    if (d) el[c.field] = d; else delete el[c.field];
  });
}

// 仕様欄に入れる文字。1行目「2P 5A」、2行目に動作特性。未選択の項目は入れない。
function partChoiceLabel(el) {
  const l1 = [el.partPoles, el.partAmp].filter(Boolean).join(' ');
  return [l1, el.partChar].filter(Boolean).join('\n');
}

// プロパティパネルの選択欄。選択肢が複数ならプルダウン、1つだけなら読み取り専用。
function partChoiceRowsHtml(el) {
  const ch = partChoices(el.partModel);
  if (!ch) return '';
  return PART_CHOICES.map(c => {
    const opts = ch[c.opt];
    if (!opts.length) return '';
    if (opts.length === 1) {
      return `<div class="pp-row"><label>${c.name}</label>`
        + `<input type="text" id="${c.id}" value="${_esc(opts[0])}" readonly`
        + ` style="background:var(--bg3);color:var(--fg2)" title="この型番は1種類のみです"></div>`;
    }
    const cur = el[c.field] || ((c.dflt && opts.includes(c.dflt)) ? c.dflt : '');
    return `<div class="pp-row"><label>${c.name}</label><select id="${c.id}" onchange="stSetPref('part_${c.opt}',this.value)">`
      + (c.dflt ? '' : `<option value=""${cur ? '' : ' selected'}>(未選択)</option>`)
      + opts.map(o => `<option value="${_esc(o)}"${o === cur ? ' selected' : ''}>${_esc(o)}</option>`).join('')
      + `</select></div>`;
  }).join('');
}

// 型番を打ち替えたら選択欄も入れ替える(前の型番の選択が残らないように)。
function refreshPartChoiceRows(el, model) {
  PART_CHOICES.forEach(c => document.getElementById(c.id)?.closest('.pp-row')?.remove());
  const tmp = { partModel: model };
  PART_CHOICES.forEach(c => { tmp[c.field] = el[c.field]; });
  const html = partChoiceRowsHtml(tmp);
  if (!html) return;
  const anchor = document.getElementById('pp-partvolt')?.closest('.pp-row')
              || document.getElementById('pp-partmodel')?.closest('.pp-row');
  anchor?.insertAdjacentHTML('afterend', html);
}

// パネルの選択を要素へ書く。仕様欄が「前の選択から自動で作った文字」のままなら新しい選択に
// 合わせて作り直し、人が手で書き換えていれば触らない(手書きを守る。doPlacePartと同じ考え方)。
function applyPartChoicesFromPanel(el) {
  const before = partChoiceLabel(el);
  if (!(el.partModel && partChoices(el.partModel))) {
    PART_CHOICES.forEach(c => { delete el[c.field]; });
    return;
  }
  PART_CHOICES.forEach(c => {
    const node = document.getElementById(c.id);
    if (!node) return;
    if (node.value) el[c.field] = node.value; else delete el[c.field];
  });
  applyDefaultChoices(el);
  const after = partChoiceLabel(el);
  if (after === before) return;
  const cur = (el.label || '').trim();
  if (cur && cur !== before) return;
  el.label = after;
  const t = document.getElementById('pp-label');
  if (t) t.value = after;     // 欄が古いままだと、次の適用で元の文字に書き戻される
}

// ----------------------------------------------------------------
// デバイス記号の候補と引き継ぎ（2026-08-21）
//
// MC1のようなデバイスは主接点・コイル・補助接点と図面上の複数箇所に置かれる。
// 2つ目以降で型番・仕様を打ち直すのは手間なので、既にあるデバイスを候補から
// 選ぶだけで型番・仕様が引き継がれるようにする(端子番号は2026-09-24から引き継がない)。
// 候補は「図面上で実際に使われているデバイス記号」だけ（別途の登録画面は持たない）。
// ----------------------------------------------------------------

// 図面上の全ページから、使われているデバイス記号を集める。
// 型番・仕様を持つ要素を代表として覚えておき、引き継ぎ元にする。
function collectDeviceInfo() {
  const map = new Map();   // partRef -> {model, spec, terminals, volt}
  const pages = state.pages || [{ elements: state.elements }];
  const put = (ref, src) => {
    ref = (ref || '').trim();
    if (!ref) return;
    const cur = map.get(ref) || { model:'', spec:'', terminals:'', volt:'', zone:'', poles:'', amp:'', char:'' };
    // 端子台(junction)の label は「端子番号」で、シンボルの label(仕様)とは別物。
    // ここで拾ってしまうと、TB1の端子番号「1」がデバイスTB1の仕様として扱われ、
    // デバイス引き継ぎで他の端子へ番号がコピーされて全部同じ番号になる。
    const isJunction = src.type === 'junction';
    if (!cur.model     && src.partModel)             cur.model     = src.partModel;
    if (!cur.spec      && src.label && !isJunction)  cur.spec      = src.label;
    if (!cur.terminals && src.terminals)             cur.terminals = src.terminals;
    if (!cur.volt      && src.partVolt)              cur.volt      = src.partVolt;
    if (!cur.poles     && src.partPoles)             cur.poles     = src.partPoles;
    if (!cur.amp       && src.partAmp)               cur.amp       = src.partAmp;
    if (!cur.char      && src.partChar)              cur.char      = src.partChar;
    if (!cur.zone      && src.panelZone)             cur.zone      = src.panelZone;
    map.set(ref, cur);
  };
  pages.forEach(pg => {
    (pg.elements || []).forEach(el => put(el.partRef, el));
    // 部品外形図はグループ側がデバイスを持つので、そちらも候補に含める
    (pg.groups || []).forEach(g => put(g.partRef, g));
  });
  return map;
}

// 端子台の端子でデバイス(TB1等)を入れ直したときに、その台の型式を引き継ぐ。
// 端子台は「台」という実体を持たず、同じデバイス名の端子が集計時に1台として
// 束ねられる作り。そのため型式を台ごとに1回書けば済むようにここで揃える。
// 端子番号(label)は端子ごとに違うので絶対に引き継がないこと。
function onJunctionRefChanged() {
  const el = state.sel.els.size === 1
    ? state.elements.find(e => state.sel.els.has(e.id)) : null;
  if (!el || el.type !== 'junction') return;
  const ref = document.getElementById('pp-jref')?.value.trim() || '';
  if (!ref) return;
  const info = collectDeviceInfo().get(ref);
  el.partRef = ref;
  if (!info || (!info.model && !info.zone)) { draw(); return; }   // 新規デバイスならそのまま
  pushH();
  if (info.model) {
    el.partModel = info.model;
    // 適用時に入力欄の値が要素へ書き戻されるため、欄も同時に更新する
    const m = document.getElementById('pp-jmodel');
    if (m) m.value = info.model;
  }
  if (info.zone) {
    // 2026-08-23: セレクトからチェックボックスに変更したので checked を立てる
    el.panelZone = info.zone;
    const z = document.getElementById('pp-jzone');
    if (z) z.checked = (info.zone === '外');
  }
  draw();
}

// 端子台の型式を変えたら、同じデバイスの端子すべてに同じ型式を入れる。
// 「デバイスで統一できるなら問題ない」(盛田さん)という要件に対応するもので、
// TB1の端子が20個あっても型式の手入力は1回で済む。全ページを対象にする。
function onJunctionModelChanged() {
  const el = state.sel.els.size === 1
    ? state.elements.find(e => state.sel.els.has(e.id)) : null;
  if (!el || el.type !== 'junction') return;
  const ref = (el.partRef || '').trim();
  const model = document.getElementById('pp-jmodel')?.value.trim() || '';
  el.partModel = model;
  if (!ref) return;                              // デバイス未設定なら自分だけ
  pushH();
  // デバイスの全部の記号(端子・綴りの違う端子・同じデバイスのシンボルも)に入れる(js/devices.js)
  const n = devSetField(devKey(ref), 'partModel', model);
  if (n) console.log(`[端子台] ${ref} の ${n} か所に型式「${model}」を反映`);
  draw();
}

function partRefOptionsHtml(current) {
  // (デバイス記号は一意なので判別に不要で、かえって選びにくくなる)。
  return [...collectDeviceInfo().keys()]
    .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }))
    .map(ref => `<option value="${_escAttr(ref)}"></option>`).join('');
}

// 端子(junction)の端子番号の候補リスト。
// 【2026-08-23】PLC・インバータ・サーボアンプは端子数が多いので、型式が
// 部品DBにあればその端子番号欄から候補を出す。名前付きグループ形式
// ("入力:X0,X1,COM/出力:Y0,Y1,COM")なら、グループ名を説明として添える。
// 同じデバイスの他の端子で既に使われている番号には印を付けて、重複に
// 気づけるようにする(禁止はしない。COM等は複数箇所に出るのが普通のため)。
function junctionTermOptionsHtml(el) {
  const model = (el && el.partModel || '').trim();
  if (!model) return '';
  const p = (state.customParts || []).find(x => x.ref === model);
  if (!p || !p.terminals) return '';

  // 同じデバイスで使用済みの端子番号を集める(自分自身は除く)
  const ref = (el.partRef || '').trim();
  const used = new Set();
  if (ref) {
    (state.pages || []).forEach(pg => (pg.elements || []).forEach(e => {
      if (e === el) return;
      if (e.type !== 'junction') return;
      if ((e.partRef || '').trim() !== ref) return;
      const v = (e.label || '').trim();
      if (v) used.add(v);
    }));
  }

  const out = [];
  (typeof parseTerminalGroups === 'function' ? parseTerminalGroups(p.terminals) : [])
    .forEach(g => g.list.forEach(t => {
      const note = [g.name, used.has(t) ? '使用済み' : ''].filter(x => x).join(' / ');
      out.push(`<option value="${_escAttr(t)}">${_escAttr(note)}</option>`);
    }));
  return out.join('');
}

// デバイスを選び直したら、そのデバイスの型番・仕様を引き継ぐ(端子番号は引き継がない、下記)。
// 【重要】型式の表示ON/OFF(showModel)は引き継がない。MC1は図面上に複数あるが
// 型番を出すのは代表の1つだけなので、引き継ぐと全部に型番が出てしまう。
function onPartRefChanged() {
  const el = state.sel.els.size === 1
    ? state.elements.find(e => state.sel.els.has(e.id)) : null;
  if (!el) return;
  const ref = document.getElementById('pp-partref')?.value.trim() || '';
  if (!ref) return;
  const info = collectDeviceInfo().get(ref);
  if (!info) return;                       // 新規デバイスなら何もしない
  pushH();                                 // 変更前の状態を履歴に積む

  // 要素に書くだけでは足りない。プロパティパネルは「適用」で入力欄の値を
  // 丸ごと要素へ書き戻すため、入力欄が空のままだと引き継いだ値が即座に
  // 消されてしまう。要素と入力欄の両方を更新すること。
  const setVal = (id, val) => {
    const e = document.getElementById(id);
    if (e && val !== undefined && val !== '') e.value = val;
  };
  if (info.model)     { el.partModel = info.model;     setVal('pp-partmodel', info.model); }
  if (info.spec)      { el.label     = info.spec;      setVal('pp-label',     info.spec); }
  // 【2026-09-24】端子番号は引き継がない(盛田さん「同じデバイスでも端子番号は違う」)。
  // コイル(A1,A2)と接点(13,14)のように、同じデバイスでもシンボルごとに番号が違う。
  // 引き継ぐと、貼り付けた番号や打った番号が別シンボルの番号で上書きされていた。
  // 端子台側(onJunctionRefChanged)も端子番号は引き継がない作りで、これで揃う。
  if (info.volt)      { el.partVolt  = info.volt; }
  // 極数・定格電流・動作特性も引き継ぐ(選び直しの手間と、仕様欄とのずれを防ぐ)
  if (info.poles)     { el.partPoles = info.poles; }
  if (info.amp)       { el.partAmp   = info.amp; }
  if (info.char)      { el.partChar  = info.char; }
  if (info.zone)      { el.panelZone = info.zone;
                        const _z = document.getElementById('pp-zone');
                        if (_z) _z.checked = (info.zone === '外'); }
  el.partRef = ref;

  // コイル電圧は型番によって選択肢が変わるので、欄ごと作り直してから値を入れる
  onPartModelChanged();
  const pv = document.getElementById('pp-partvolt');
  if (pv && info.volt) pv.value = info.volt;
  // 選択欄は onPartModelChanged で要素の値から作り直されている
  // デバイスの値とそろえる(この記号にしか無い値はデバイスの値にする。js/devices.js)
  if (typeof devSyncFromEl === 'function') devSyncFromEl(el);

  draw();
}

// ----------------------------------------------------------------
// グループのデバイス（2026-08-21）
//
// 部品外形図は数十本の線の集まりで、配置時にグループ化される。
// デバイス記号を線の1本1本に持たせると図面に文字が何度も出てしまうので、
// グループ自体が持つ。線を消してもデバイスが失われないという利点もある。
// 部品表はグループのデバイスも集計対象にする(展開接続図のMC1と
// 配置図のMC1は同じ1台なので、partRefが同じなら1台にまとまる)。
// ----------------------------------------------------------------
function groupDevicePropsHtml(g, count) {
  if (!g) return '';
  // グループが複数選ばれていると、どれに入れるのか決められない。
  // 黙って先頭に書き込むと事故になるので、1つに絞ってもらう。
  if (count > 1) {
    return `<hr style="margin:6px 10px;border-color:var(--border)">
      <p style="font-size:10px;color:var(--fg3);padding:2px 10px">
        グループが${count}個選ばれています。デバイスを設定するには1つだけ選択してください。</p>`;
  }
  return `<hr style="margin:6px 10px;border-color:var(--border)">
    <p style="font-size:10px;font-weight:600;color:var(--fg4);padding:2px 10px">グループのデバイス</p>
    <div class="pp-row"><label>デバイス</label>
      <input type="text" id="gp-partref" list="pp-partref-list" value="${_escAttr(g.partRef||'')}" placeholder="例: MC1"></div>
    <datalist id="pp-partref-list">${partRefOptionsHtml(g.partRef)}</datalist>
    <div class="pp-row"><label>型番</label>
      <input type="text" id="gp-partmodel" value="${_escAttr(g.partModel||'')}" placeholder="例: MSO-T12"></div>
    <div class="pp-row"><label>デバイスを図面に表示</label>
      <input type="checkbox" id="gp-showdev"${g.showDev===false?'':' checked'} title="グループの左上にデバイス記号を描きます"></div>
    <div class="pp-row"><label>型番を図面に表示</label>
      <input type="checkbox" id="gp-showmodel"${g.showModel===false?'':' checked'} title="型番の描画だけを切ります。値は保持されるので部品表には出ます。密集した箇所で1つだけ書いて他は省略する、といった使い方ができます"></div>
    <details class="pp-details"><summary>文字の詳細（サイズ・色・位置）</summary>
      <div class="pp-row"><label>サイズ</label>
        <input type="number" id="gp-devfs" value="${escH(g.devFs||11)}" step="1" min="6" max="32"></div>
      <div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
        <input type="color" id="gp-devcolor" value="${escH(g.devColor||'#333333')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('gp-devcolor','gp-devcolorcode')">
        <input type="text" id="gp-devcolorcode" value="${escH(g.devColor||'#333333')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('gp-devcolorcode','gp-devcolor')">
        ${colorCodeBtns('gp-devcolorcode','gp-devcolor')}</div></div>
      <div class="pp-row"><label>位置X補正</label>
        <input type="number" id="gp-devox" value="${escH(g.devOffX!==undefined?g.devOffX:'')}" placeholder="自動" step="5"></div>
      <div class="pp-row"><label>位置Y補正</label>
        <input type="number" id="gp-devoy" value="${escH(g.devOffY!==undefined?g.devOffY:'')}" placeholder="自動" step="5"></div>
    </details>
    <button class="pp-apply" onclick="applyGroupDevice()">デバイスを適用</button>`;
}

function applyGroupDevice() {
  const hit = (state.page.groups || []).filter(x =>
    x.elIds.some(id => state.sel.els.has(id)) || x.wireIds.some(id => state.sel.wires.has(id)));
  if (hit.length !== 1) return;    // 複数選択時は書き込まない(どれに入れるか決められないため)
  const g = hit[0];
  pushH();                         // 変更前の状態を履歴に積む
  const val = id => document.getElementById(id)?.value.trim() || '';
  const gBefore = { ref: g.partRef, model: g.partModel || '' };
  g.partRef   = val('gp-partref')   || undefined;
  g.partModel = val('gp-partmodel') || undefined;
  // 型番はデバイスに1つ(js/devices.js): デバイスが同じまま型番を直したらデバイス全体へ。デバイスを変えたら、そのデバイスの型番にそろえる
  if (typeof devKey === 'function' && devKey(g.partRef)) {
    if (devKey(gBefore.ref) === devKey(g.partRef)) { if ((g.partModel || '') !== gBefore.model) devSetField(devKey(g.partRef), 'partModel', g.partModel || ''); }
    else { const dv = deviceLedger().get(devKey(g.partRef)); const others = dv ? dv.items.filter(it => it.el !== g) : [];
      const m = others.map(it => String(it.el.partModel || '').trim()).find(Boolean);
      if (m) g.partModel = m; else if (g.partModel) devSetField(devKey(g.partRef), 'partModel', g.partModel); }
  }
  const c = document.getElementById('gp-showdev');
  g.showDev = c ? c.checked : true;
  // 型番は値を保持したまま表示だけ切れるようにする(消すと部品表からも消えるため)
  const cm = document.getElementById('gp-showmodel');
  g.showModel = cm ? cm.checked : true;
  const num = id => { const v = val(id); return v === '' ? undefined : parseInt(v); };
  g.devFs    = num('gp-devfs');
  g.devColor = val('gp-devcolorcode') || val('gp-devcolor') || undefined;
  g.devOffX  = num('gp-devox');
  g.devOffY  = num('gp-devoy');
  draw();
  updateRightPanel();
}

// 線幅の選択肢（JIS / ISO 128 の標準線幅）。
// 0.13 / 0.18 / 0.25 / 0.35 / 0.5 / 0.7 / 1.0 / 1.4 / 2.0 の9種が規格値で、
// 細線:太線:極太線 = 1:2:4 の比で組み合わせて使う。
// 以前は 0.5/1/1.5/2/3 だったが、1.5と3は規格に無く、0.5未満が選べないため
// 部品外形図のような細かい図で線が太すぎて潰れていた。
const LINE_WIDTHS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];
const DEFAULT_LINE_WIDTH = 0.5;

// 任意の値を規格値に丸める。DXFから読み込んだ中途半端な太さが図面に混ざると、
// 線同士を繋いだときに段差が出るため、必ず選択肢のいずれかに寄せる。
function snapLineWidth(v) {
  const n = parseFloat(v);
  if (!isFinite(n) || n <= 0) return DEFAULT_LINE_WIDTH;
  return LINE_WIDTHS.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a);
}

// 線幅プルダウンのoption群を作る。現在値が規格外(旧データの1.5/3等)なら
// その値も選択肢に足して、開いただけで勝手に変わらないようにする。
function lineWidthOptions(cur) {
  const vals = [...LINE_WIDTHS];
  const c = parseFloat(cur);
  if (isFinite(c) && c > 0 && !vals.includes(c)) { vals.push(c); vals.sort((a,b)=>a-b); }
  return vals.map(v => {
    const lbl = v === DEFAULT_LINE_WIDTH ? `${v}（標準）`
              : (LINE_WIDTHS.includes(v) ? String(v) : `${v}（規格外）`);
    return `<option value="${escH(v)}"${c === v ? ' selected' : ''}>${lbl}</option>`;
  }).join('');
}

// 【2026-09-19・移設】カタログDB(検索用データベース)の機能一式
// (catalogRefreshStatus 等。2026-09-29以降はDriveではなく catalog_pending を読む)を
// 部品DB単独画面(js/parts_page.js)へ移した。カタログDBを「使う」のは
// 単独画面(検索・全件作り直し)なのに「取り込む」側だけがCADにあり、
// 使う画面が自分でデータを更新できない状態だったため。
// これでCADから部品DB・カタログDB関連のUIは無くなった(CADは読むだけ)。

// 全体共通のHTMLエスケープ(state.js の escH)への別名。
// 呼び出し箇所が多いのでこの名前は残すが、実装は1箇所に寄せてある。
function _esc(s) { return escH(s); }
// onclick属性の中に埋め込むパス用。Windowsのパスは「\」を含むので必ずエスケープする
// (G:\マイドライブ\... がそのままJS文字列に入ると壊れるため)。
function _escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// 部品DBに紐付いた外形図DXFをキャンバスに配置するモードへ
function placePartOutline(ref) {
  const part = allParts().find(p => p.ref === ref);
  if (!part || !part.outlineDxf) { alert('この部品には外形図が登録されていません'); return; }
  const parsed = parseOutlineDXF(part.outlineDxf);
  if (!parsed.elements.length) { alert('外形図DXFから図形を読み取れませんでした'); return; }
  // 部品DBから配置しているので型番は分かっている。配置時にグループへ入れる
  // (手で打ち直させない)。デバイス記号は盤ごとに決まるので配置後に入力する。
  parsed.partModel = ref;
  state.pendingOutline = parsed;
  setMode('outline');
  document.getElementById('s-hint').textContent = `「${ref}」外形図 → クリックで配置  [ESC] 終了`;
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
// 【2026-10-05】登録範囲(盛田さん「範囲が見えてないからどう登録されるかが見えない」「上下左右で登録範囲を出す」
// 「10刻みか5刻みで狭くしてはみ出たら自動で切れればいい」)。{x1,y1,x2,y2}(シンボルの座標)。図形が入ると全体を囲む
// グリッドの線に合わせて出す。辺をドラッグで刻み(5/10)ごとに動かし、範囲の外は登録するときに切る(srClipShapes)
let _srRange = null;
let _srRangeDrag = null;   // 'x1'|'x2'|'y1'|'y2'
const SR_SCALE = 2;   // canvas px per coord unit
let _srZoom = SR_SCALE;
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
  cv.onwheel = e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 1/1.2;
    _srZoom = Math.max(0.5, Math.min(10, _srZoom * factor));
    srRender();
  };
  cv.setAttribute('tabindex', '0');
  cv.focus();
  srEnsureKeyHandler();
}

// シンボル登録パネルの矢印キー移動。
// 以前はcanvasにフォーカスがある時だけ効いていたため、ボタンを押すと
// フォーカスが移って動かなくなり、さらに矢印キーが裏の図面に届いて
// 選択中の要素を動かしてしまっていた。documentのキャプチャ段階で
// 受け取り、パネルが開いている間は他のハンドラへ渡さない。
let _srKeyBound = false;
function srEnsureKeyHandler() {
  if (_srKeyBound) return;
  _srKeyBound = true;
  document.addEventListener('keydown', e => {
    const p = document.getElementById('sym-reg-p');
    if (!p || !p.classList.contains('open')) return;
    // 幅/高さ/シンボル名などの入力欄では通常のカーソル移動を優先
    const ae = document.activeElement;
    if (ae && ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName)) return;

    const step = e.shiftKey ? SR_GRID : 1;
    let dx = 0, dy = 0;
    if      (e.key === 'ArrowLeft')  dx = -step;
    else if (e.key === 'ArrowRight') dx =  step;
    else if (e.key === 'ArrowUp')    dy = -step;
    else if (e.key === 'ArrowDown')  dy =  step;
    else return;

    e.preventDefault();
    e.stopPropagation();   // 裏の図面へ矢印キーを渡さない
    _srShapes.forEach(s => {
      if      (s.t==='L') { s.x1+=dx; s.y1+=dy; s.x2+=dx; s.y2+=dy; }
      else if (s.t==='C') { s.cx+=dx; s.cy+=dy; }
      else if (s.t==='A') { s.cx+=dx; s.cy+=dy; }
      else if (s.t==='R') { s.x+=dx;  s.y+=dy; }
      else if (s.t==='T') { s.x+=dx;  s.y+=dy; }
      else if (s.t==='P' && s.pts) s.pts = s.pts.map(pt => [pt[0]+dx, pt[1]+dy]);
    });
    _srTerms.forEach(t => { t.x+=dx; t.y+=dy; });
    srUpdateTermList();
    srRender();
  }, true);
}

// ローカル座標点を、配置済み要素(el)のx/y/rot/flipH/flipV/scaleで変換する
function srXformPt(lx, ly, el) {
  let x = lx, y = ly;
  if (el.flipH) x = -x;
  if (el.flipV) y = -y;
  const rad = (el.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const sc = el.scale || 1;
  const rx = (x * cos - y * sin) * sc;
  const ry = (x * sin + y * cos) * sc;
  return { x: el.x + rx, y: el.y + ry };
}
// 角度(度)を、配置済み要素(el)のflipH/flipV/rotで変換する
function srXformAngle(aDeg, el) {
  const rad = aDeg * Math.PI / 180;
  let vx = Math.cos(rad), vy = Math.sin(rad);
  if (el.flipH) vx = -vx;
  if (el.flipV) vy = -vy;
  const rot = (el.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const nx = vx * cos - vy * sin, ny = vx * sin + vy * cos;
  return Math.atan2(ny, nx) * 180 / Math.PI;
}
// 配置済みシンボルインスタンス(el)を、登録済みカスタム/ライブラリシンボル(cS)の
// shapes定義を実際の配置(位置・回転・反転・拡大率)で変換して平坦化する
function flattenSymbolElToShapes(el, cS) {
  const flipped = !!el.flipH !== !!el.flipV; // 反転が奇数回→弧の向きが逆転
  const sc = el.scale || 1;
  const out = [];
  (cS.shapes || []).forEach(s => {
    if (s.t === 'L') {
      const p1 = srXformPt(s.x1, s.y1, el), p2 = srXformPt(s.x2, s.y2, el);
      out.push({ t:'L', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, lineWidth:s.lineWidth, lineStyle:s.lineStyle });
    } else if (s.t === 'C') {
      const c = srXformPt(s.cx, s.cy, el);
      out.push({ t:'C', cx:c.x, cy:c.y, r: s.r * sc, lineWidth:s.lineWidth, lineStyle:s.lineStyle });
    } else if (s.t === 'A') {
      const c = srXformPt(s.cx, s.cy, el);
      let sa = srXformAngle(s.sa, el), ea = srXformAngle(s.ea, el);
      let ccw = !!s.ccw;
      // 反転(flipH/flipVが奇数回)は弧の回る向き(ccw)だけを反転させる。始点・終点はそれぞれ写した点のまま。
      // 【2026-10-05】以前は sa/ea を入れ替えた上で ccw も反転していて、2つ合わせると残りの側の弧(反対側)になっていた
      // (反転したシンボルを登録し直すと弧が反対側に出る。tests/test_arc_explode.js で点を比べて確認)
      if (flipped) { ccw = !ccw; }
      out.push({ t:'A', cx:c.x, cy:c.y, r: s.r * sc, sa, ea, ccw, lineWidth:s.lineWidth, lineStyle:s.lineStyle });
    } else if (s.t === 'P' && s.pts) {
      // 【2026-08-23修正】lineWidth/lineStyleがそもそも渡されておらず、ポリライン形状は
      // 平坦化すると太さ・線種が既定値に戻ってしまっていた(ccw/lineStyle調査中に発見)
      out.push({ t:'P', pts: s.pts.map(p => { const q = srXformPt(p[0], p[1], el); return [q.x, q.y]; }), cl: s.cl, lineWidth:s.lineWidth, lineStyle:s.lineStyle });
    } else if (s.t === 'R') {
      const p1 = srXformPt(s.x, s.y, el), p2 = srXformPt(s.x+s.w, s.y, el);
      const p3 = srXformPt(s.x+s.w, s.y+s.h, el), p4 = srXformPt(s.x, s.y+s.h, el);
      if ((el.rot||0) % 360 === 0) {
        const minX=Math.min(p1.x,p3.x), maxX=Math.max(p1.x,p3.x);
        const minY=Math.min(p1.y,p3.y), maxY=Math.max(p1.y,p3.y);
        out.push({ t:'R', x:minX, y:minY, w:maxX-minX, h:maxY-minY, lineWidth:s.lineWidth, lineStyle:s.lineStyle });
      } else {
        out.push({ t:'P', pts:[[p1.x,p1.y],[p2.x,p2.y],[p3.x,p3.y],[p4.x,p4.y]], cl:true, lineWidth:s.lineWidth, lineStyle:s.lineStyle });
      }
    } else if (s.t === 'T') {
      const p = srXformPt(s.x, s.y, el);
      out.push({ t:'T', text:s.text, x:p.x, y:p.y, fs:s.fs });
    }
  });
  return out;
}
// クリップボード要素1つを「ワールド座標の生shape配列」(sa/eaは度数法で統一)に変換する。
// 未対応(標準シンボル・junction・bezier・dim等)はnullを返す。
// 要素の実効的な太さを解決する。
// 要素自身がlineWidthを持っていればそれを、無ければ描かれているレイヤーの
// 既定太さ(LAYERSのlineWidth)を使う(draw.js各所の `el.lineWidth || lay?.lineWidth || 1.0` と同じ考え方)。
// カスタムシンボルの内部shapesにはレイヤーという概念が無いため、
// ここで解決して数値として焼き込んでおかないと、登録した瞬間にレイヤー既定の
// 太さの情報が失われ、配置後は既定値1.0に戻ってしまう。
function srEffectiveLW(el) {
  if (el.lineWidth) return el.lineWidth;
  const lay = (typeof LAYERS !== 'undefined') ? LAYERS.find(l => l.name === el.layer) : null;
  return lay?.lineWidth || 1.0;
}

function srWorldShapesForEl(el) {
  // 【2026-08-23修正】lineStyle(破線/点線/一点鎖線)を拾っていなかったバグ。
  // 盛田さんの指摘(「点線と実線の違いは？」)で判明。lineWidthは拾うのにlineStyleは
  // 無視していたため、点線で描いた線をシンボル登録すると実線として登録されていた。
  if (el.type === 'fline') return [{ t:'L', x1:el.x1, y1:el.y1, x2:el.x2, y2:el.y2, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle }];
  if (el.type === 'circle') return [{ t:'C', cx:el.x, cy:el.y, r:el.r||0, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle }];
  if (el.type === 'rect') return [{ t:'R', x:el.x, y:el.y, w:el.w||0, h:el.h||0, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle }];
  if (el.type === 'triangle') return [
    { t:'L', x1:el.x1, y1:el.y1, x2:el.x2, y2:el.y2, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle },
    { t:'L', x1:el.x2, y1:el.y2, x2:el.x3, y2:el.y3, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle },
    { t:'L', x1:el.x3, y1:el.y3, x2:el.x1, y2:el.y1, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle },
  ];
  if (el.type === 'arc') return [{ t:'A', cx:el.x, cy:el.y, r:el.r||0, sa:(el.startA||0)*180/Math.PI, ea:(el.endA||0)*180/Math.PI, ccw:!!el.ccw, lineWidth:srEffectiveLW(el), lineStyle:el.lineStyle }];
  if (el.type === 'text') return [{ t:'T', text:el.text||'', x:el.x, y:el.y, fs:el.fs||14 }];
  // 端子台(junction)。
  //
  // 【2026-09-21】盛田さんがインバータを「四角の上に端子台を並べて」描き、
  // それをシンボル登録へ貼り付けたら全部スキップされた
  // （「8個の要素は貼り付けに対応していないため…」）。
  //
  // シンボル側では「絵(shapes)」と「配線がつながる点(terminals)」が別物なので、
  // 端子台1個を **円の図形 + 端子点** の2つに分解して持ち込む。
  // 端子点の方は srPasteFromClipboard が同じ座標変換で拾う（ここでは絵だけ返す）。
  //
  // シンボルの図形は輪郭のみで塗りつぶしを持たないため、塗り丸(style:'dot'、
  // 配線の分岐点)も輪郭の円になる。端子台として使う白丸('circle')・二重丸('dbl')は
  // 元々輪郭なので見た目は変わらない。
  if (el.type === 'junction') {
    const r = el.r || 5;
    const lw = srEffectiveLW(el);
    const out = [{ t:'C', cx:el.x, cy:el.y, r, lineWidth:lw }];
    if (el.style === 'dbl') out.push({ t:'C', cx:el.x, cy:el.y, r: r*0.55, lineWidth:lw });
    return out;
  }
  // 配置済みシンボル(カスタム/ライブラリ)インスタンス → 実際の配置で平坦化
  const cS = state.customSymbols.find(s => s.type === el.type);
  if (cS && cS.shapes && cS.shapes.length) return flattenSymbolElToShapes(el, cS);
  return null; // 標準シンボル・bezier・dim等は非対応
}

function srPasteFromClipboard() {
  const cb = state.clipboard;
  if (!cb?.els?.length && !cb?.wires?.length) { alert('先にCADで図形を選択してCtrl+Cでコピーしてください'); return; }

  // バウンディングボックス計算
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const addPt = (x,y) => { minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); };
  const skipped = {};       // 種類名 → 個数。「8個」だけでは何が落ちたか分からない
  cb.els.forEach(el => {
    const ws = srWorldShapesForEl(el);
    if (!ws) { const k = srElKindName(el); skipped[k] = (skipped[k]||0)+1; return; }
    ws.forEach(s => {
      if (s.t==='L') { addPt(s.x1,s.y1); addPt(s.x2,s.y2); }
      else if (s.t==='C'||s.t==='A') { addPt(s.cx-s.r,s.cy-s.r); addPt(s.cx+s.r,s.cy+s.r); }
      else if (s.t==='R') { addPt(s.x,s.y); addPt(s.x+s.w,s.y+s.h); }
      else if (s.t==='P'&&s.pts) s.pts.forEach(p=>addPt(p[0],p[1]));
      else if (s.t==='T') addPt(s.x,s.y);
    });
  });
  cb.wires.forEach(w => { (w.pts||[]).forEach(p => addPt(p.x, p.y)); });
  // 全部スキップされた場合。ここも「何が落ちたか」を名前で出す。
  // 【2026-09-21】以前は「対応していない図形のみが選択されています(標準シンボル・
  // 接続点・寸法線等)」という固定文だった。接続点(端子台)は貼り付けられるように
  // なったので文面が嘘になっていたうえ、何が落ちたのかも分からなかった。
  if (!isFinite(minX)) { alert(srSkipMessage(skipped, true)); return; }

  // (bW/bH はフィット縮小をやめたため未使用)
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
  // 等倍(1:1)で貼り付ける。
  // 以前はW/H入力欄(初期値64x40)に収まるよう縮小していたため、
  // コピー元より大幅に小さいシンボルが登録されてしまっていた。
  // 配置時の描画(symbols.js)はshapes座標をそのまま使う1:1描画なので、
  // ここで等倍にすることでコピー元と同じ大きさになる。
  // 【2026-08-23修正】以前はtx/tyが各点ごとにMath.roundしていた。cx/cyは選択範囲の
  // 中心なので一般に整数にならず、その結果「端点1つあたり最大±0.5単位の誤差が
  // 独立に乗る」状態だった。×印のような短い斜め線は4端点がそれぞれ別方向にずれる
  // ため、角度も長さも目に見えて変わってしまう(盛田さん報告「✕の部分がズレてる」)。
  //
  // これは1672〜1675行のコメントにある「各点を整数へ丸めていて歪んでいた」不具合と
  // 全く同じもので、弧だけ対処して直線・矩形・ポリラインが直し残されていた。
  //
  // 対策: 丸めるのは「平行移動量」だけにする。全点を同じ整数量だけ動かすので、
  // 図形どうしの相対位置も個々の図形の形状も一切変わらない。元の座標が整数なら
  // 結果も整数のままなので、後段のsrGridAlignShapes(グリッドに乗る点の数を数える)
  // も従来どおり機能する。
  const ox = Math.round(cx), oy = Math.round(cy);
  const tx = wx => wx - ox;
  const ty = wy => wy - oy;
  const scale = 1;

  // 変換してSR形式に
  const shapes = [];
  const terms  = [];        // 端子台から起こす端子点(絵とは別に持つ)
  cb.els.forEach(el => {
    if (el.type === 'junction') terms.push({ x: tx(el.x), y: ty(el.y), label: '' });
    const ws = srWorldShapesForEl(el);
    if (!ws) return;
    ws.forEach(s => {
      // 線幅は規格値(JIS標準の9種)に丸めてから焼き込む。DXFから貼り付けた図形が
      // 中途半端な太さを持っていると、そのままシンボルに残って配線と繋いだときに
      // 段差が出るため。未設定(レイヤー既定に従う)の場合は未設定のまま残す。
      const _lw = s.lineWidth != null ? snapLineWidth(s.lineWidth) : undefined;
      if (s.t==='L') shapes.push({t:'L', x1:tx(s.x1),y1:ty(s.y1),x2:tx(s.x2),y2:ty(s.y2), lineWidth:_lw, lineStyle:s.lineStyle});
      // 半径・幅・高さもMath.roundしない。中心/左上は整数量だけ平行移動しているので、
      // ここを丸めると円が最大0.5単位太ったり細ったりして元の図形と一致しなくなる。
      else if (s.t==='C') shapes.push({t:'C', cx:tx(s.cx),cy:ty(s.cy),r:s.r*scale, lineWidth:_lw, lineStyle:s.lineStyle});
      else if (s.t==='R') shapes.push({t:'R', x:tx(s.x),y:ty(s.y),w:s.w*scale,h:s.h*scale, lineWidth:_lw, lineStyle:s.lineStyle});
      else if (s.t==='P' && s.pts) shapes.push({t:'P', pts:s.pts.map(p=>[tx(p[0]),ty(p[1])]), cl:s.cl, lineWidth:_lw, lineStyle:s.lineStyle});
      else if (s.t==='T') shapes.push({t:'T', text:s.text, x:tx(s.x), y:ty(s.y), fs:s.fs});
      else if (s.t==='A') {
        // 以前は弧を8本の直線に分解し、さらに各点を整数へ丸めていた。
        // 半径が小さい弧ほど丸め誤差が相対的に大きくなり、歪んで見える不具合があった。
        // 配置時の描画(symbols.js)は弧をネイティブでサポートしているので、
        // 分解せずそのまま持たせる(丸めは一切しない。半径の丸めも2026-08-23に撤廃)。
        shapes.push({t:'A', cx:tx(s.cx), cy:ty(s.cy), r:s.r*scale, sa:s.sa, ea:s.ea, ccw:!!s.ccw, lineWidth:_lw, lineStyle:s.lineStyle});
      }
    });
  });

  // ワイヤーを直線として変換
  cb.wires.forEach(w => {
    const pts = w.pts || [];
    for (let i=0; i<pts.length-1; i++) {
      shapes.push({t:'L', x1:tx(pts[i].x),y1:ty(pts[i].y), x2:tx(pts[i+1].x),y2:ty(pts[i+1].y)});
    }
  });
  // グリッドに乗せるための平行移動は図形と端子点で同じだけ動かす
  // (別々にすると端子点が絵からずれる)
  const g = srGridAlignShapes(shapes);
  terms.forEach(t => { t.x += g.dx; t.y += g.dy; });
  _srShapes = shapes;
  _srTerms  = terms;
  srUpdateTermList();
  srFitToContent();
  srRender();

  if (Object.keys(skipped).length) alert(srSkipMessage(skipped, false));
}

// スキップした要素の知らせ。all=true は「1つも貼り付けられなかった」場合。
function srSkipMessage(skipped, all) {
  const names = Object.keys(skipped);
  return (all ? '貼り付けられる要素がありませんでした:\n  '
              : '貼り付けに対応していない要素をスキップしました:\n  ')
    + (names.length ? names.map(k => `${k} ${skipped[k]}個`).join('\n  ') : '(不明)')
    + '\n\n図形(線・円・四角・三角・円弧・文字)、端子台、'
    + '登録済みカスタムシンボルは貼り付けられます。';
}

// スキップした要素を人に分かる名前で返す。
// 【2026-09-21】以前は「8個の要素は…」と数だけ出していた。盛田さんが端子台を
// 7個置いたのに8個と出て、残り1個が何なのか画面からは分からなかった。
function srElKindName(el) {
  if (!el || !el.type) return '不明';
  const named = { junction:'端子台', bezier:'ベジェ曲線', dim:'寸法線',
                  angle_dim:'角度寸法', leader:'引出線' };
  if (named[el.type]) return named[el.type];
  // カスタムシンボルが落ちるのは2通りある。どちらかで手の打ち方が変わるので分ける。
  // 【2026-09-21】盛田さんの画面に `custom_ms9yggdu_zfx 1個` と型番だけ出て、
  // それが何なのか分からなかった。
  const cS = (state.customSymbols || []).find(x => x.type === el.type);
  if (cS) return `カスタムシンボル「${cS.name || cS.label || el.type}」(図形が登録されていません)`;
  if (/^custom_/.test(el.type)) return `登録が見つからないシンボル(${el.type})`;
  const d = (typeof getDef === 'function' ? getDef(el.type) : null);
  if (d && d.name) return `標準シンボル「${d.name}」`;
  return el.type;
}

// 貼り付けた図形群を「形を変えずに」整数平行移動し、
// 端点・中心がグリッド(SR_GRID)に乗る個数が最大になるオフセットを選ぶ。
// X/Yは独立に効くので軸ごとに最良を求める。同点なら移動量が小さい方を優先。
function srGridAlignShapes(shapes) {
  const xs = [], ys = [];
  shapes.forEach(s => {
    if (s.t==='L') { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }
    else if (s.t==='C') { xs.push(s.cx); ys.push(s.cy); }
    else if (s.t==='R') { xs.push(s.x, s.x+s.w); ys.push(s.y, s.y+s.h); }
    else if (s.t==='T') { xs.push(s.x); ys.push(s.y); }
    else if (s.t==='P' && s.pts) s.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); });
    else if (s.t==='A') { xs.push(s.cx); ys.push(s.cy); }
  });
  if (!xs.length) return { dx:0, dy:0, hit:0, total:0 };

  // 移動量の小さい順に候補を並べる: 0, 1, -1, 2, -2 ...
  const cands = [0];
  for (let k = 1; k <= Math.floor(SR_GRID/2); k++) { cands.push(k); cands.push(-k); }
  if (SR_GRID % 2 === 0) cands.push(SR_GRID/2);

  const best = vals => {
    let bd = 0, bc = -1;
    cands.forEach(d => {
      let n = 0;
      vals.forEach(v => { if ((((v + d) % SR_GRID) + SR_GRID) % SR_GRID === 0) n++; });
      if (n > bc) { bc = n; bd = d; }
    });
    return { d: bd, c: bc };
  };
  const bx = best(xs), by = best(ys);
  const dx = bx.d, dy = by.d;

  if (dx || dy) {
    shapes.forEach(s => {
      if (s.t==='L') { s.x1+=dx; s.y1+=dy; s.x2+=dx; s.y2+=dy; }
      else if (s.t==='C') { s.cx+=dx; s.cy+=dy; }
      else if (s.t==='R') { s.x+=dx; s.y+=dy; }
      else if (s.t==='T') { s.x+=dx; s.y+=dy; }
      else if (s.t==='P' && s.pts) s.pts = s.pts.map(p => [p[0]+dx, p[1]+dy]);
      else if (s.t==='A') { s.cx+=dx; s.cy+=dy; }
    });
  }
  return { dx, dy, hitX:bx.c, hitY:by.c, total:xs.length };
}

// ---- 登録範囲で切る(2026-10-05) ------------------------------------------
// 図形の外形(弧・円は中心±半径。文字は位置)
function srContentBox(shapes) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  (shapes || []).forEach(s => {
    if (s.t === 'L') { add(s.x1, s.y1); add(s.x2, s.y2); }
    else if (s.t === 'C' || s.t === 'A') { add(s.cx - s.r, s.cy - s.r); add(s.cx + s.r, s.cy + s.r); }
    else if (s.t === 'R') { add(s.x, s.y); add(s.x + s.w, s.y + s.h); }
    else if (s.t === 'T') add(s.x, s.y);
    else if (s.t === 'P' && s.pts) s.pts.forEach(p => add(p[0], p[1]));
  });
  return isFinite(x1) ? { x1, y1, x2, y2 } : null;
}
function srRangeStep() { const v = parseInt(document.getElementById('sr-rstep')?.value); return v === 10 ? 10 : 5; }
// 図形全体を囲む、刻みの線に乗った範囲
function srRangeFit(shapes, step) {
  const b = srContentBox(shapes);
  if (!b) return null;
  const e = 1e-6;
  return { x1: Math.floor(b.x1 / step + e) * step, y1: Math.floor(b.y1 / step + e) * step,
           x2: Math.ceil(b.x2 / step - e) * step,  y2: Math.ceil(b.y2 / step - e) * step };
}
const _srIn = (R, x, y) => x >= R.x1 - 1e-6 && x <= R.x2 + 1e-6 && y >= R.y1 - 1e-6 && y <= R.y2 + 1e-6;
// 線分を範囲で切る(Liang–Barsky)。全部外なら null
function srClipSeg(R, ax, ay, bx, by) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const ps = [-dx, dx, -dy, dy], qs = [ax - R.x1, R.x2 - ax, ay - R.y1, R.y2 - ay];
  for (let i = 0; i < 4; i++) {
    const p = ps[i], q = qs[i];
    if (Math.abs(p) < 1e-12) { if (q < -1e-9) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t1 - t0 < 1e-9 && Math.hypot(dx, dy) > 1e-9) return null;
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
}
// 円・弧を範囲で切る。戻り値: 残る弧の並び(円が全部残るなら円そのもの)
function srClipArc(R, s) {
  const TAU = Math.PI * 2, norm = a => ((a % TAU) + TAU) % TAU;
  let a0, L;
  if (s.t === 'C') { a0 = 0; L = TAU; }
  else {
    const sa = (s.sa || 0) * Math.PI / 180, ea = (s.ea || 0) * Math.PI / 180;
    if (s.ccw) { a0 = ea; L = norm(sa - ea); } else { a0 = sa; L = norm(ea - sa); }
    if (L < 1e-9) return [];
  }
  const cuts = [];
  [R.x1, R.x2].forEach(X => { const d = (X - s.cx) / s.r; if (Math.abs(d) <= 1) { const t = Math.acos(d); cuts.push(t, -t); } });
  [R.y1, R.y2].forEach(Y => { const d = (Y - s.cy) / s.r; if (Math.abs(d) <= 1) { const t = Math.asin(d); cuts.push(t, Math.PI - t); } });
  const rel = [...new Set(cuts.map(c => norm(c - a0)).filter(v => v > 1e-9 && v < L - 1e-9).map(v => +v.toFixed(12)))].sort((a, b) => a - b);
  const edges = [0, ...rel, L];
  const keep = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const m = a0 + (edges[i] + edges[i + 1]) / 2;
    if (_srIn(R, s.cx + s.r * Math.cos(m), s.cy + s.r * Math.sin(m))) {
      if (keep.length && Math.abs(keep[keep.length - 1][1] - edges[i]) < 1e-9) keep[keep.length - 1][1] = edges[i + 1];
      else keep.push([edges[i], edges[i + 1]]);
    }
  }
  if (keep.length === 1 && keep[0][0] < 1e-9 && keep[0][1] > L - 1e-9) return [s];   // 全部残る
  const deg = a => a * 180 / Math.PI;
  return keep.map(([u, v]) => ({ t: 'A', cx: s.cx, cy: s.cy, r: s.r, sa: deg(a0 + u), ea: deg(a0 + v), ccw: false, lineWidth: s.lineWidth, lineStyle: s.lineStyle }));
}
// 図形を範囲で切る(範囲の外にはみ出た所を落とす)
function srClipShapes(shapes, R) {
  if (!R) return shapes.slice();
  const out = [];
  const seg = (ax, ay, bx, by, s) => { const c = srClipSeg(R, ax, ay, bx, by); if (c) out.push({ t: 'L', x1: c[0], y1: c[1], x2: c[2], y2: c[3], lineWidth: s.lineWidth, lineStyle: s.lineStyle }); };
  shapes.forEach(s => {
    if (s.t === 'L') {
      if (_srIn(R, s.x1, s.y1) && _srIn(R, s.x2, s.y2)) { out.push(s); return; }
      const c = srClipSeg(R, s.x1, s.y1, s.x2, s.y2);
      if (c) out.push(Object.assign({}, s, { x1: c[0], y1: c[1], x2: c[2], y2: c[3] }));
    } else if (s.t === 'P' && s.pts) {
      if (s.pts.every(p => _srIn(R, p[0], p[1]))) { out.push(s); return; }
      const pts = s.pts.slice(); if (s.cl && pts.length > 2) pts.push(pts[0]);
      for (let k = 0; k + 1 < pts.length; k++) seg(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], s);
    } else if (s.t === 'R') {
      if (_srIn(R, s.x, s.y) && _srIn(R, s.x + s.w, s.y + s.h)) { out.push(s); return; }
      const xa = s.x, ya = s.y, xb = s.x + s.w, yb = s.y + s.h;
      seg(xa, ya, xb, ya, s); seg(xb, ya, xb, yb, s); seg(xb, yb, xa, yb, s); seg(xa, yb, xa, ya, s);
    } else if (s.t === 'C' || s.t === 'A') {
      srClipArc(R, s).forEach(a => out.push(a));
    } else if (s.t === 'T') {
      if (_srIn(R, s.x, s.y)) out.push(s);
    } else out.push(s);
  });
  return out;
}
// 図形が入ったとき(貼り付け・描き始め)に範囲を出す。W/H 欄は範囲の大きさ(表示だけ)
function srRangeInit() { _srRange = srRangeFit(_srShapes, srRangeStep()); srRangeShow(); }
function srRangeShow() {
  const w = document.getElementById('sr-w'), h = document.getElementById('sr-h');
  if (w) w.value = _srRange ? Math.round((_srRange.x2 - _srRange.x1) * 100) / 100 : '';
  if (h) h.value = _srRange ? Math.round((_srRange.y2 - _srRange.y1) * 100) / 100 : '';
}
function srRangeStepChanged() { if (_srRange) srRangeInit(); srRender(); }
// 範囲の辺の近く(画面で6px)か。戻り値 'x1'|'x2'|'y1'|'y2'|null
function srRangeEdgeAt(wx, wy) {
  const R = _srRange; if (!R) return null;
  const tol = 6 / _srZoom;
  const inY = wy >= R.y1 - tol && wy <= R.y2 + tol, inX = wx >= R.x1 - tol && wx <= R.x2 + tol;
  const c = [['x1', Math.abs(wx - R.x1), inY], ['x2', Math.abs(wx - R.x2), inY], ['y1', Math.abs(wy - R.y1), inX], ['y2', Math.abs(wy - R.y2), inX]]
    .filter(e => e[2] && e[1] <= tol).sort((a, b) => a[1] - b[1]);
  return c.length ? c[0][0] : null;
}
function srRaw(e) {
  const cv = document.getElementById('sym-reg-cv');
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * (cv.width / r.width) - SR_CX) / _srZoom, y: ((e.clientY - r.top) * (cv.height / r.height) - SR_CY) / _srZoom };
}

// 貼り付け後、実際の図形サイズをW/H欄に反映し、
// キャンバスに収まるようズーム倍率を合わせる。
function srFitToContent() {
  const bb = calcCustomSymBBox(_srShapes);
  srRangeInit();   // 2026-10-05 登録範囲を出す(W/H 欄は範囲の大きさ)

  const cv = document.getElementById('sym-reg-cv');
  if (!cv) return;
  // 中心が原点なので、必要な表示半径は幅/高さの半分
  const needX = (bb.w / 2) || 1, needY = (bb.h / 2) || 1;
  const z = Math.min((cv.width / 2 - 12) / needX, (cv.height / 2 - 12) / needY);
  _srZoom = Math.max(0.5, Math.min(10, z));
}

function srClear() {
  _srShapes = []; _srTerms = []; _srTool = null; _srDraw = null; _srFirst = null;
  _srZoom = SR_SCALE; _srRange = null; _srRangeDrag = null;
  const roleEl = document.getElementById('sr-role'); if (roleEl) roleEl.value = '';
  document.querySelectorAll('.sr-tool').forEach(b => b.classList.remove('active'));
  const n = document.getElementById('sr-name'); if (n) n.value = '';
  const c = document.getElementById('sr-cat'); if (c) c.value = 'カスタム';
  srRangeShow();
  srUpdateTermList(); srRender();
}

function registerAsSymbol() { showSymReg(); }

function srSnap(clientX, clientY) {
  const cv = document.getElementById('sym-reg-cv');
  const r  = cv.getBoundingClientRect();
  const px = (clientX - r.left) * (cv.width  / r.width);
  const py = (clientY - r.top)  * (cv.height / r.height);
  const wx = Math.round((px - SR_CX) / _srZoom / SR_GRID) * SR_GRID;
  const wy = Math.round((py - SR_CY) / _srZoom / SR_GRID) * SR_GRID;
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
  const gPx = SR_GRID * _srZoom;
  for (let x = ((SR_CX % gPx) + gPx) % gPx; x < cv.width; x += gPx) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,cv.height); c.stroke(); }
  for (let y = ((SR_CY % gPx) + gPx) % gPx; y < cv.height; y += gPx) { c.beginPath(); c.moveTo(0,y); c.lineTo(cv.width,y); c.stroke(); }

  // Axes
  c.strokeStyle = '#bbb'; c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(SR_CX,0); c.lineTo(SR_CX,cv.height); c.stroke();
  c.beginPath(); c.moveTo(0,SR_CY); c.lineTo(cv.width,SR_CY); c.stroke();

  // Shapes: 登録範囲があれば、範囲の外(切られる所)は薄く、残る所を濃く描く(2026-10-05)
  if (_srRange) {
    _srShapes.forEach(s => srDrawShape(c, s, '#ccc'));
    srClipShapes(_srShapes, _srRange).forEach(s => srDrawShape(c, s, '#222'));
  } else {
    c.strokeStyle = '#222'; c.fillStyle = '#222'; c.lineWidth = 1.5;
    _srShapes.forEach(s => srDrawShape(c, s, '#222'));
  }

  // 登録範囲(上下左右の辺をドラッグで動かす。外は登録するとき切る)
  if (_srRange) {
    const R = _srRange, X = v => SR_CX + v * _srZoom, Y = v => SR_CY + v * _srZoom;
    c.save();
    c.strokeStyle = '#e07000'; c.lineWidth = 1.5; c.setLineDash([6, 3]);
    c.strokeRect(X(R.x1), Y(R.y1), (R.x2 - R.x1) * _srZoom, (R.y2 - R.y1) * _srZoom);
    c.setLineDash([]); c.fillStyle = '#e07000';
    const mx = (X(R.x1) + X(R.x2)) / 2, my = (Y(R.y1) + Y(R.y2)) / 2;
    [[mx, Y(R.y1)], [mx, Y(R.y2)], [X(R.x1), my], [X(R.x2), my]].forEach(([hx, hy]) => c.fillRect(hx - 4, hy - 4, 8, 8));
    c.font = '9px monospace'; c.textAlign = 'left';
    c.fillText(`登録範囲 ${R.x2 - R.x1}×${R.y2 - R.y1}`, X(R.x1) + 2, Y(R.y1) - 3);
    c.restore();
  }

  // Preview
  if (_srDraw) { c.save(); c.setLineDash([5,4]); srDrawShape(c, _srDraw, '#888'); c.restore(); }

  // Terminals
  _srTerms.forEach((t, i) => {
    const px = SR_CX + t.x * _srZoom, py = SR_CY + t.y * _srZoom;
    c.fillStyle = (_srRange && !_srIn(_srRange, t.x, t.y)) ? '#c99' : '#0067c0';   // 範囲の外の端子は登録しない(薄い赤)
    c.fillRect(px-5,py-5,10,10);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px-3,py-3); c.lineTo(px+3,py+3); c.stroke();
    c.beginPath(); c.moveTo(px+3,py-3); c.lineTo(px-3,py+3); c.stroke();
    c.fillStyle = '#0067c0'; c.font = '8px sans-serif'; c.textAlign = 'left';
    c.fillText(t.label ? `T${i}:${t.label}` : `T${i}`, px+6, py+3);
  });

  // Mouse cursor
  const mpx = SR_CX + _srMouse.x * _srZoom, mpy = SR_CY + _srMouse.y * _srZoom;
  c.strokeStyle = '#ccc'; c.lineWidth = 0.5; c.setLineDash([3,3]);
  c.beginPath(); c.moveTo(mpx,0); c.lineTo(mpx,cv.height); c.stroke();
  c.beginPath(); c.moveTo(0,mpy); c.lineTo(cv.width,mpy); c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#555'; c.font = '9px monospace'; c.textAlign = 'left';
  c.fillText(`(${_srMouse.x},${_srMouse.y})`, 4, cv.height-4);

  // First point highlight
  if (_srFirst) {
    const fx = SR_CX + _srFirst.x * _srZoom, fy = SR_CY + _srFirst.y * _srZoom;
    c.fillStyle = '#0aa'; c.beginPath(); c.arc(fx,fy,4,0,Math.PI*2); c.fill();
  }
}

function srDrawShape(c, s, color) {
  const T  = v => SR_CX + v * _srZoom;
  const TY = v => SR_CY + v * _srZoom;
  // 配置時(symbols.js)の既定太さ1.0に合わせ、図形ごとのlineWidthがあればそれを使う。
  // パネル内は座標を_srZoom倍に拡大して表示しているので、太さも同じ倍率をかけて
  // 見た目の比率を保つ(拡大表示なのに線だけ細く見える/太く見えるのを防ぐ)。
  const lw = (s.lineWidth || 1.0) * _srZoom;
  c.save(); c.strokeStyle = color || '#222'; c.fillStyle = color || '#222';
  // 【2026-08-23修正】図形ごとのlineStyle(破線/点線/一点鎖線)を登録パネルの
  // プレビューにも反映する。以前はここで常に実線で描いていたため、点線を
  // 登録してもパネル上は実線に見えており見た目だけでは気づけなかった
  if (s.t!=='T') c.setLineDash(s.lineStyle==='dash'?[8*_srZoom/2,4*_srZoom/2]:s.lineStyle==='dot'?[2*_srZoom/2,4*_srZoom/2]:s.lineStyle==='dashdot'?[8*_srZoom/2,3*_srZoom/2,2*_srZoom/2,3*_srZoom/2]:[]);
  if (s.t==='L') {
    c.lineWidth = lw; c.beginPath(); c.moveTo(T(s.x1),TY(s.y1)); c.lineTo(T(s.x2),TY(s.y2)); c.stroke();
  } else if (s.t==='C') {
    c.lineWidth = lw; c.beginPath(); c.arc(T(s.cx),TY(s.cy),Math.max(1,s.r*_srZoom),0,Math.PI*2); c.stroke();
  } else if (s.t==='R') {
    c.lineWidth = lw; c.strokeRect(T(s.x),TY(s.y),s.w*_srZoom,s.h*_srZoom);
  } else if (s.t==='T') {
    c.font = `${Math.max(4,(s.fs||14)*_srZoom/2)}px sans-serif`; c.textAlign = 'center';
    c.fillText(s.text, T(s.x), TY(s.y));
  } else if (s.t==='A') {
    c.lineWidth = lw; c.beginPath();
    c.arc(T(s.cx),TY(s.cy),Math.max(1,s.r*_srZoom), (s.sa||0)*Math.PI/180, (s.ea||0)*Math.PI/180, !!s.ccw);
    c.stroke();
  } else if (s.t==='P' && s.pts && s.pts.length) {
    c.lineWidth = lw; c.beginPath();
    c.moveTo(T(s.pts[0][0]),TY(s.pts[0][1]));
    for (let k=1;k<s.pts.length;k++) c.lineTo(T(s.pts[k][0]),TY(s.pts[k][1]));
    if (s.cl) c.closePath();
    c.stroke();
  }
  c.restore();
}

function srOnDown(e) {
  if (e.button !== 0) return;
  // 登録範囲の辺をつかんだら、その辺を動かす(作図中・消去ツールのときは図形の操作を優先)
  if (_srRange && !_srFirst && _srTool !== 'erase') {
    const r = srRaw(e), edge = srRangeEdgeAt(r.x, r.y);
    if (edge) { _srRangeDrag = edge; return; }
  }
  const { x, y } = srSnap(e.clientX, e.clientY);
  // 【2026-08-03修正】盛田さんの指摘: 自動検出で出た端子点を消すのに「✕消去」ツールへの
  // 切り替えが必要で分かりにくかった(📍アイコン側の端子編集パネルはツール切り替え不要で
  // クリックだけで足し引きできるため、動きが違って混乱した)。ツールが何であっても、
  // 端子点の近くをクリックしたら最優先で削除するようにする(erase専用の判定より前に置く)。
  {
    let minTD = 8, minTI = -1;
    _srTerms.forEach((t, i) => { const d = Math.hypot(x-t.x, y-t.y); if (d < minTD) { minTD = d; minTI = i; } });
    if (minTI >= 0) { _srTerms.splice(minTI, 1); srUpdateTermList(); srRender(); return; }
  }
  if (_srTool === 'erase') {
    let minD = 12, minI = -1;
    _srShapes.forEach((s, i) => {
      let d = Infinity;
      if (s.t==='L') d = distToSeg(x,y,s.x1,s.y1,s.x2,s.y2);
      else if (s.t==='C') d = Math.abs(Math.hypot(x-s.cx,y-s.cy)-s.r);
      else if (s.t==='R') { const cx=(s.x+s.w/2), cy=(s.y+s.h/2); d=Math.hypot(x-cx,y-cy); }
      else if (s.t==='T') d = Math.hypot(x-s.x, y-s.y);
      else if (s.t==='A') {
        // 弧の中心からの距離が半径付近にあり、かつ角度が弧の範囲内なら当たりとする。
        // 範囲外なら弧の両端点までの距離を使う(端をクリックしても消せるように)。
        let ang = Math.atan2(y-s.cy, x-s.cx)*180/Math.PI;
        const norm = a => ((a%360)+360)%360;
        let sa=norm(s.sa), ea=norm(s.ea), an=norm(ang);
        const inRange = sa<=ea ? (an>=sa && an<=ea) : (an>=sa || an<=ea);
        if (inRange) {
          d = Math.abs(Math.hypot(x-s.cx,y-s.cy)-s.r);
        } else {
          const p0x=s.cx+Math.cos(s.sa*Math.PI/180)*s.r, p0y=s.cy+Math.sin(s.sa*Math.PI/180)*s.r;
          const p1x=s.cx+Math.cos(s.ea*Math.PI/180)*s.r, p1y=s.cy+Math.sin(s.ea*Math.PI/180)*s.r;
          d = Math.min(Math.hypot(x-p0x,y-p0y), Math.hypot(x-p1x,y-p1y));
        }
      }
      else if (s.t==='P' && s.pts) {
        for (let k=0;k<s.pts.length-1;k++) d = Math.min(d, distToSeg(x,y,s.pts[k][0],s.pts[k][1],s.pts[k+1][0],s.pts[k+1][1]));
      }
      if (d < minD) { minD = d; minI = i; }
    });
    let minTD = 8, minTI = -1;
    _srTerms.forEach((t, i) => { const d=Math.hypot(x-t.x,y-t.y); if(d<minTD){minTD=d;minTI=i;} });
    if (minTI >= 0) { _srTerms.splice(minTI,1); srUpdateTermList(); srRender(); return; }
    if (minI  >= 0) { _srShapes.splice(minI,1); srRender(); return; }
    return;
  }
  if (_srTool === 'term') {
    _srTerms.push({ x, y, label: '' });
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
    _srFirst=null; _srDraw=null;
    if (!_srRange) srRangeInit(); else { const b = srContentBox(_srShapes.slice(-1)), R = _srRange, st = srRangeStep();   // 描いた図形が範囲の外なら範囲を広げる
      if (b) { R.x1 = Math.min(R.x1, Math.floor(b.x1 / st) * st); R.y1 = Math.min(R.y1, Math.floor(b.y1 / st) * st); R.x2 = Math.max(R.x2, Math.ceil(b.x2 / st) * st); R.y2 = Math.max(R.y2, Math.ceil(b.y2 / st) * st); srRangeShow(); } }
    srRender();
  }
}

function srOnMove(e) {
  const { x, y } = srSnap(e.clientX, e.clientY);
  _srMouse = { x, y };
  const cvEl = document.getElementById('sym-reg-cv');
  if (_srRangeDrag) {
    const r = srRaw(e), st = srRangeStep(), R = _srRange, k = _srRangeDrag;
    const v = Math.round((k[0] === 'x' ? r.x : r.y) / st) * st;
    if (k === 'x1') R.x1 = Math.min(v, R.x2 - st); else if (k === 'x2') R.x2 = Math.max(v, R.x1 + st);
    else if (k === 'y1') R.y1 = Math.min(v, R.y2 - st); else R.y2 = Math.max(v, R.y1 + st);
    srRangeShow(); srRender(); return;
  }
  if (cvEl && _srRange && !_srFirst) {
    const r = srRaw(e), edge = srRangeEdgeAt(r.x, r.y);
    cvEl.style.cursor = edge ? (edge[0] === 'x' ? 'ew-resize' : 'ns-resize') : 'crosshair';
  }
  if (_srFirst) {
    const f = _srFirst;
    if      (_srTool==='line')   _srDraw = { t:'L', x1:f.x,y1:f.y,x2:x,y2:y };
    else if (_srTool==='circle') { const r=Math.max(1,Math.round(Math.hypot(x-f.x,y-f.y))); _srDraw={t:'C',cx:f.x,cy:f.y,r}; }
    else if (_srTool==='rect')   _srDraw = { t:'R', x:Math.min(f.x,x),y:Math.min(f.y,y),w:Math.abs(x-f.x),h:Math.abs(y-f.y) };
  }
  srRender();
}

function srOnUp(e) { _srRangeDrag = null; }

function srSetTool(t) {
  _srTool=t; _srFirst=null; _srDraw=null;
  document.querySelectorAll('.sr-tool').forEach(b => b.classList.toggle('active', b.dataset.tool===t));
  srRender();
}

function srUndo() {
  if (_srFirst) { _srFirst=null; _srDraw=null; srRender(); return; }
  if (_srShapes.length) { _srShapes.pop(); srRender(); }
}

// 【2026-09-20 削除】端子番号(label)の入力欄はシンボル登録からも外した。
// 理由は js/pin_editor.js の peUpdateList の直前に書いた通り。
// データとしての label は残し、図面で読むのも続けている。

function srUpdateTermList() {
  const el = document.getElementById('sr-term-list');
  if (!el) return;
  if (!_srTerms.length) { el.textContent = '（端子点なし）'; return; }
  el.innerHTML = _srTerms.map((t,i) =>
    `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">`
    + `<span>T${i}: (${t.x}, ${t.y})</span>`
    + `<span onclick="_srTerms.splice(${i},1);srUpdateTermList();srRender()" style="cursor:pointer;color:var(--red)">×</span>`
    + `</div>`
  ).join('');
}

// 【2026-08-03追加】盛田さんの指摘: 「登録時に自動検出を走らせて選ぶようにした方が良い」
// 登録済み後に別パネル(pin_editor.js)で直す2度手間ではなく、登録画面のその場で
// 開放端候補を検出→プレビューで見ながら要らないものをクリックで消す、という流れにする。
// 検出ロジック自体はpin_editor.jsのpeCollectCandidatePoints()をそのまま再利用する
// (電磁接触器やモーター等、装飾線が多い形では誤検出も混ざるため、全自動で確定はせず
// 必ずプレビューで見て選べるようにする。単純な2本足の接点シンボルなら候補=正解になることが多い)。
function srAutoDetectTerms() {
  if (!_srShapes.length) { alert('先に図形を描いてください'); return; }
  if (typeof peCollectCandidatePoints !== 'function') return;
  const candidates = peCollectCandidatePoints(_srShapes);
  if (!candidates.length) { alert('開放端(未接続の線端)が見つかりませんでした。手動でクリックして端子を追加してください。'); return; }
  let added = 0;
  candidates.forEach(cand => {
    const dup = _srTerms.some(t => Math.hypot(t.x-cand.x, t.y-cand.y) < 3);
    if (!dup) { _srTerms.push({ x: Math.round(cand.x), y: Math.round(cand.y), label: '' }); added++; }
  });
  srUpdateTermList(); srRender();
  if (added === 0) alert('候補はすべて既存の端子と重複していました。');
  else alert(`候補を${added}件追加しました。違うものがあればプレビュー上でクリックして削除してください。`);
}

function calcCustomSymBBox(shapes) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  shapes.forEach(s => {
    if (s.t==='L') {
      minX=Math.min(minX,s.x1,s.x2); maxX=Math.max(maxX,s.x1,s.x2);
      minY=Math.min(minY,s.y1,s.y2); maxY=Math.max(maxY,s.y1,s.y2);
    } else if (s.t==='C') {
      minX=Math.min(minX,s.cx-s.r); maxX=Math.max(maxX,s.cx+s.r);
      minY=Math.min(minY,s.cy-s.r); maxY=Math.max(maxY,s.cy+s.r);
    } else if (s.t==='R') {
      minX=Math.min(minX,s.x,s.x+s.w); maxX=Math.max(maxX,s.x,s.x+s.w);
      minY=Math.min(minY,s.y,s.y+s.h); maxY=Math.max(maxY,s.y,s.y+s.h);
    } else if (s.t==='A') {
      minX=Math.min(minX,s.cx-s.r); maxX=Math.max(maxX,s.cx+s.r);
      minY=Math.min(minY,s.cy-s.r); maxY=Math.max(maxY,s.cy+s.r);
    } else if (s.t==='P' && s.pts) {
      s.pts.forEach(p => {
        minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]);
        minY=Math.min(minY,p[1]); maxY=Math.max(maxY,p[1]);
      });
    } else if (s.t==='T') {
      minX=Math.min(minX,s.x); maxX=Math.max(maxX,s.x);
      minY=Math.min(minY,s.y); maxY=Math.max(maxY,s.y);
    }
  });
  if (!isFinite(minX)) return { w:80, h:60 };
  return { w: Math.max(10, maxX-minX), h: Math.max(10, maxY-minY) };
}

function saveCustomSymbol() {
  const name = document.getElementById('sr-name').value.trim();
  if (!name) { alert('シンボル名を入力してください'); return; }
  if (!_srShapes.length) { alert('図形を少なくとも1つ描いてください'); return; }
  // 2026-10-05 登録範囲の外を切る。範囲の外の端子は登録しない
  const shapesR = srClipShapes(_srShapes, _srRange);
  const termsR = _srRange ? _srTerms.filter(t => _srIn(_srRange, t.x, t.y)) : _srTerms.slice();
  if (!shapesR.length) { alert('登録範囲の中に図形がありません'); return; }
  const cat = document.getElementById('sr-cat').value.trim() || 'カスタム';
  const bbox = calcCustomSymBBox(shapesR);
  const w = bbox.w;
  const h = bbox.h;
  const type = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,5);
  // プレビュー画像を小さなcanvasに縮小して生成
  const cv = document.getElementById('sym-reg-cv');
  let preview = null;
  if (cv) {
    const thumbCv = document.createElement('canvas');
    thumbCv.width = 64; thumbCv.height = 48;
    const tctx = thumbCv.getContext('2d');
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, 64, 48);
    // グリッドなし・図形のみを描画
    const cx = 32, cy = 24, scale = Math.min(64/((_srZoom*160)||64), 48/((_srZoom*130)||48));
    tctx.save();
    tctx.translate(cx, cy);
    tctx.scale(scale * _srZoom, scale * _srZoom);
    tctx.strokeStyle = '#222'; tctx.lineWidth = 1.5 / (scale * _srZoom);
    shapesR.forEach(s => {
      if (s.t==='L') { tctx.beginPath(); tctx.moveTo(s.x1,s.y1); tctx.lineTo(s.x2,s.y2); tctx.stroke(); }
      else if (s.t==='C') { tctx.beginPath(); tctx.arc(s.cx,s.cy,s.r,0,Math.PI*2); tctx.stroke(); }
      else if (s.t==='A') { tctx.beginPath(); tctx.arc(s.cx,s.cy,s.r,(s.sa||0)*Math.PI/180,(s.ea||0)*Math.PI/180,!!s.ccw); tctx.stroke(); }
      else if (s.t==='R') { tctx.strokeRect(s.x,s.y,s.w,s.h); }
      else if (s.t==='P' && s.pts && s.pts.length) {
        tctx.beginPath(); tctx.moveTo(s.pts[0][0],s.pts[0][1]);
        for (let k=1;k<s.pts.length;k++) tctx.lineTo(s.pts[k][0],s.pts[k][1]);
        if (s.cl) tctx.closePath();
        tctx.stroke();
      }
      else if (s.t==='T') { tctx.font=`${(s.fs||14)/2}px sans-serif`; tctx.textAlign='center'; tctx.fillText(s.text,s.x,s.y); }
    });
    tctx.restore();
    preview = thumbCv.toDataURL('image/png');
  }
  const role = document.getElementById('sr-role')?.value || '';
  const sym = { type, name, label:name, cat, role, w, h, shapes:shapesR, terminals:termsR, preview };
  state.customSymbols.push(sym);
  if (typeof DEFS !== 'undefined') DEFS[type] = sym;
  closeFP('sym-reg-p');
  renderSymFloat();
  // 【2026-10-03 段階3】保存先はライブラリ(読めていなければブラウザの中。js/sym_store.js)
  symStorePut([sym]).then(ok => { if (ok) alert(`「${name}」を登録しました。シンボルパレットのカスタムタブから配置できます。`); });
}

// 任意のshapes配列からプレビュー画像(64x48 PNG dataURL)を生成する。
// saveCustomSymbol()内の生成ロジックを、登録済みシンボルの再スケール後にも
// 使い回せるよう独立させたもの(元のコードは_srShapes/_srZoom前提で使い回せなかった)。
function generateSymPreview(shapes, bbox) {
  const thumbCv = document.createElement('canvas');
  thumbCv.width = 64; thumbCv.height = 48;
  const tctx = thumbCv.getContext('2d');
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, 64, 48);
  const bw = Math.max(bbox.w, 1), bh = Math.max(bbox.h, 1);
  const scale = Math.min(56/bw, 40/bh) || 1;
  const cx = 32 - (bbox.cx||0) * scale, cy = 24 - (bbox.cy||0) * scale;
  tctx.save();
  tctx.translate(cx, cy);
  tctx.scale(scale, scale);
  tctx.strokeStyle = '#222'; tctx.lineWidth = 1.5 / scale;
  shapes.forEach(s => {
    if (s.t==='L') { tctx.beginPath(); tctx.moveTo(s.x1,s.y1); tctx.lineTo(s.x2,s.y2); tctx.stroke(); }
    else if (s.t==='C') { tctx.beginPath(); tctx.arc(s.cx,s.cy,s.r,0,Math.PI*2); tctx.stroke(); }
    else if (s.t==='A') { tctx.beginPath(); tctx.arc(s.cx,s.cy,s.r,(s.sa||0)*Math.PI/180,(s.ea||0)*Math.PI/180,!!s.ccw); tctx.stroke(); }
    else if (s.t==='R') { tctx.strokeRect(s.x,s.y,s.w,s.h); }
    else if (s.t==='P' && s.pts && s.pts.length) {
      tctx.beginPath(); tctx.moveTo(s.pts[0][0],s.pts[0][1]);
      for (let k=1;k<s.pts.length;k++) tctx.lineTo(s.pts[k][0],s.pts[k][1]);
      if (s.cl) tctx.closePath();
      tctx.stroke();
    }
    else if (s.t==='T') { tctx.font=`${(s.fs||14)/2}px sans-serif`; tctx.textAlign='center'; tctx.fillText(s.text,s.x,s.y); }
  });
  tctx.restore();
  return thumbCv.toDataURL('image/png');
}

// 登録済みカスタムシンボルを、比率を保ったまま指定の幅(または高さ)に
// 一括拡大縮小する。「異なるシンボルを同じスケール1.0で配置しても実際の
// 大きさが揃わない」問題(登録時の図形自体の大きさがバラバラ)への対応。
// 登録済み一覧でw×hを見比べ、ズレているものだけ個別に直す運用を想定。
function rescaleCustomSym(type) {
  const sym = state.customSymbols.find(s => s.type === type);
  if (!sym) return;
  const curW = Math.round(sym.w * 10) / 10, curH = Math.round(sym.h * 10) / 10;
  const input = prompt(`「${sym.name||sym.type}」現在のサイズ: 幅${curW} × 高さ${curH}\n新しい幅を入力してください(高さは比率を保って自動計算されます):`, curW);
  if (input === null) return;
  const newW = parseFloat(input);
  if (!newW || newW <= 0) { alert('正の数値を入力してください'); return; }
  const factor = newW / sym.w;
  if (Math.abs(factor - 1) < 1e-6) return;
  // 2026-10-05 シンボルは1つ: 端子の位置が変わるので、使っている図面の数を見せて確かめる(js/sym_store.js)
  if (typeof symConfirmTermMove === 'function' && !symConfirmTermMove(type, sym, (sym.terminals || []).map(t => ({ x: t.x * factor, y: t.y * factor })))) return;
  sym.shapes.forEach(s => {
    if (s.t === 'L') { s.x1*=factor; s.y1*=factor; s.x2*=factor; s.y2*=factor; }
    else if (s.t === 'C' || s.t === 'A') { s.cx*=factor; s.cy*=factor; s.r*=factor; }
    else if (s.t === 'R') { s.x*=factor; s.y*=factor; s.w*=factor; s.h*=factor; }
    else if (s.t === 'P' && s.pts) { s.pts = s.pts.map(p => [p[0]*factor, p[1]*factor]); }
    else if (s.t === 'T') { s.x*=factor; s.y*=factor; if (s.fs) s.fs*=factor; }
  });
  (sym.terminals||[]).forEach(t => { t.x*=factor; t.y*=factor; });
  sym.w *= factor; sym.h *= factor;
  const bbox = calcCustomSymBBox(sym.shapes);
  sym.preview = generateSymPreview(sym.shapes, bbox);
  if (typeof DEFS !== 'undefined' && DEFS[type]) {
    DEFS[type].w = sym.w; DEFS[type].h = sym.h;
    DEFS[type].terminals = (sym.terminals||[]).map((t,i) => ({ id:`t${i}`, x:t.x, y:t.y, label:t.label||'' }));
  }
  renderSymFloat();
  symStorePut([sym]);   // ライブラリへ(段階3)
}

// 【2026-10-03 段階3】ライブラリから消す。図面で使っているシンボルは、図面の中には残る(置いた要素が描けなくならない)
function delCusSym(type) {
  const inUse = (state.pages || []).some(pg => (pg.elements || []).some(e => e.type === type));
  if (!confirm(inUse ? 'ライブラリから削除しますか？\n（この図面で使っているので、この図面の中には残ります）' : 'ライブラリから削除しますか？')) return;
  symStoreDelete(type);
}

// ----------------------------------------------------------------
// ページタブ
// ----------------------------------------------------------------
function renderPageTabs() {
  const el = document.getElementById('page-tabs'); if (!el) return;
  el.innerHTML = state.pages.map((p,i) =>
    `<div class="page-tab${i===state.currentPage?' active':''}" draggable="true" onclick="switchPage(${i})" ondblclick="renamePage(${i})" ondragstart="pageDragStart(event,${i})" ondragover="pageDragOver(event)" ondrop="pageDrop(event,${i})" style="display:flex;align-items:center;gap:4px" title="ドラッグで並び替え／ダブルクリックで名前変更">${escH(p.name||('Sheet'+(i+1)))}${p.dirty?'<span style="color:var(--red);font-size:10px">●</span>':''}${state.pages.length>1?`<span onclick="event.stopPropagation();deletePage(${i})" style="font-size:10px;color:var(--fg3);cursor:pointer;line-height:1" title="削除">×</span>`:''}</div>`
  ).join('') + `<div class="page-tab-add" onclick="addPage()">＋</div>`;
}

// ── ページタブ ドラッグ並び替え ──
let _pgDragFrom = null;
function pageDragStart(ev, i) {
  _pgDragFrom = i;
  ev.dataTransfer.effectAllowed = 'move';
}
function pageDragOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
}
function pageDrop(ev, to) {
  ev.preventDefault();
  const from = _pgDragFrom; _pgDragFrom = null;
  if (from === null || from === to) return;
  movePage(from, to);
}
function movePage(from, to) {
  if (from < 0 || from >= state.pages.length || to < 0 || to >= state.pages.length) return;
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  pushH();
  if (typeof xrefReset === 'function') xrefReset();   // ページの並びが変わるので、クロスリファレンスの結果は捨てる
  const cur = state.pages[state.currentPage];
  const [pg] = state.pages.splice(from, 1);
  state.pages.splice(to, 0, pg);
  state.currentPage = state.pages.indexOf(cur);
  renderPageTabs(); draw(); updateRightPanel();
}

function switchPage(idx) {
  if (idx < 0 || idx >= state.pages.length) return;
  state.pages[state.currentPage].elements = state.elements;
  state.pages[state.currentPage].wires    = state.wires;
  state.pages[state.currentPage].frameObj = state.frameObj;
  state.currentPage = idx;
  state.sel.els.clear(); state.sel.wires.clear();
  // 選択ボックス(リサイズハンドル)も消す。選択を消しただけでは
  // state.resizeHandles に前のページのハンドルが残り、移動先のページに
  // 選択ボックスだけが描かれてしまう。
  updateResizeHandles();
  renderPageTabs(); draw(); updateRightPanel();
}

function addPage() {
  pushH();
  state.pages[state.currentPage].elements = state.elements;
  state.pages[state.currentPage].wires    = state.wires;
  state.pages[state.currentPage].frameObj = state.frameObj;
  state.pages.push({ name:'Sheet'+(state.pages.length+1), elements:[], wires:[], groups:[], guides:[], frameObj:null });
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
  if (typeof xrefReset === 'function') xrefReset();   // ページ番号がずれるので、クロスリファレンスの結果は捨てる
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
  // 部品パネルが開いていれば、選択中のシンボルの役割(コイル)で種別の絞り込みを付け直す(段階4)
  const pf = document.getElementById('prt-float');
  if (pf && pf.style.display !== 'none' && typeof renderPartsTable2 === 'function') { try { renderPartsTable2(); } catch (e) {} }
  const el  = state.sel.els.size  === 1 ? state.elements.find(e => state.sel.els.has(e.id))   : null;
  const wire= state.sel.wires.size === 1 ? state.wires.find(w    => state.sel.wires.has(w.id)) : null;
  const rp  = document.getElementById('rp-body');

  // 複数選択 or グループ選択チェック
  const totalSel = state.sel.els.size + state.sel.wires.size;
  const selGroups = (state.page.groups || []).filter(g =>
    g.elIds.some(id => state.sel.els.has(id)) ||
    g.wireIds.some(id => state.sel.wires.has(id))
  );
  if (totalSel >= 2 || selGroups.length > 0) {
    // バウンディングボックスを計算
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    const addP = (x,y) => { if(x==null||y==null)return; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; };
    state.elements.filter(e => state.sel.els.has(e.id)).forEach(e => {
      addP(e.x,e.y); addP(e.x1,e.y1); addP(e.x2,e.y2);
      if(e.w!=null){addP(e.x+e.w,e.y); addP(e.x,e.y+e.h);}
      if(e.r!=null){addP(e.x+e.r,e.y); addP(e.x-e.r,e.y); addP(e.x,e.y+e.r); addP(e.x,e.y-e.r);}
      if(e.pts)e.pts.forEach(p=>addP(p.x,p.y));
    });
    state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w => {
      if(w.pts)w.pts.forEach(p=>addP(p.x,p.y));
    });
    const gx = minX===Infinity ? 0 : Math.round(minX*100)/100;
    const gy = minY===Infinity ? 0 : Math.round(minY*100)/100;
    const gw = maxX===Infinity ? 0 : Math.round((maxX-minX)*100)/100;
    const gh = maxY===Infinity ? 0 : Math.round((maxY-minY)*100)/100;
    // 【2026-09-24】複数選択パネルでも _el/_wire を空にする(下の単一選択側と同じ対策)。
    // 以前はここで空にしておらず、直前に1つだけ選んでいた要素(=多くはコピー元)を
    // 指したまま残っていた。貼り付けボタンで画面を作り直すと focusout が発火して
    // applyRightPanel() が走り、この画面に無い欄を空として読んでコピー元の
    // デバイス名・仕様を消し、表示チェックもOFFにしていた(盛田さん「貼り付けた後に
    // 別の数値が上書きされる」)。複数選択パネルの操作は rp._el を使わない。
    rp._el = null; rp._wire = null;
    rp.oninput = rp.onchange = null;   // 2026-10-05 即適用の仕掛けも外す(選択なしの側の説明)
    if (rp._focusoutHandler) { rp.removeEventListener('focusout', rp._focusoutHandler); rp._focusoutHandler = null; }
    const isGrouped = selGroups.length > 0;
    const label = isGrouped ? `グループ選択 (${selGroups.length}個)` : `複数選択 (${totalSel}個)`;
    const groupBtn = isGrouped
      ? `<button class="pp-apply" style="margin-top:4px;background:#e55" onclick="ungroupSelected();updateRightPanel()">グループ解除</button>`
      : `<button class="pp-apply" onclick="groupSelected();updateRightPanel()">グループ化 (G)</button>`;
    rp.innerHTML = `
      <p style="font-size:10px;font-weight:600;color:var(--fg4);padding:6px 10px 2px">${label}</p>
      <div class="pp-row"><label>X (左端)</label><input type="number" id="gp-x" value="${escH(gx)}" step="any"></div>
      <div class="pp-row"><label>Y (上端)</label><input type="number" id="gp-y" value="${escH(gy)}" step="any"></div>
      <div class="pp-row"><label>幅</label><span style="padding:2px 0;color:var(--fg2)">${gw}</span></div>
      <div class="pp-row"><label>高さ</label><span style="padding:2px 0;color:var(--fg2)">${gh}</span></div>
      <hr style="margin:6px 10px;border-color:var(--border)">
      <p style="font-size:10px;font-weight:600;color:var(--fg4);padding:2px 10px">移動量</p>
      <div class="pp-row"><label>ΔX</label><input type="number" id="gp-dx" value="0" step="any"></div>
      <div class="pp-row"><label>ΔY</label><input type="number" id="gp-dy" value="0" step="any"></div>
      <button class="pp-apply" onclick="applyGroupMove()">移動適用</button>
      ${groupBtn}
      ${isGrouped ? groupDevicePropsHtml(selGroups[0], selGroups.length) : ''}
      ${deviceClipboard ? `<button class="pp-apply" onclick="pasteDeviceProps()" title="コピー済みのデバイス名・型番・仕様・文字設定を、選択中の全要素(端子含む)へまとめて貼り付けます(種類が違ってもOK)">選択中の${state.sel.els.size}個へデバイス/型式/仕様を貼り付け</button>` : ''}
    `;
    document.getElementById('gp-x').addEventListener('change', function() {
      document.getElementById('gp-dx').value = +this.value - gx;
    });
    document.getElementById('gp-y').addEventListener('change', function() {
      document.getElementById('gp-dy').value = +this.value - gy;
    });
    return;
  }

  if (!el && !wire) {
    // 選択なし → 保存ファイル名 + 図面枠プロパティ
    let html = `<div class="pp-row"><label>保存ファイル名</label><input type="text" id="rp-savename" value="${escH(state.saveFileName)}" placeholder="例: 制御盤A回路図" onchange="state.saveFileName=this.value.trim()"></div>`;
    if (state.frameObj) {
      const f = state.frameObj;
      html += `<p style="font-size:10px;font-weight:600;color:var(--fg4);padding:6px 10px 2px">図面枠プロパティ</p>
        <div class="pp-row"><label>図面名称</label><input type="text" id="fp-title"  value="${escH(f.title||'')}"></div>
        <div class="pp-row"><label>図面番号</label><input type="text" id="fp-drawno" value="${escH(f.drawno||'')}"></div>
        <div class="pp-row"><label>作成者</label><input type="text" id="fp-author"  value="${escH(f.author||'')}"></div>
        <div class="pp-row"><label>日付</label><input type="text" id="fp-date"   value="${escH(f.date||'')}"></div>
        <div class="pp-row"><label>改訂番号</label><input type="text" id="fp-rev"    value="${escH(f.rev||'')}"></div>
        <button class="pp-apply" onclick="applyFrameProps()">適用</button>`;
    }
    // 【2026-10-05】ここでも _el/_wire を空にし、即適用の仕掛けを外す(複数選択・単一選択の側と同じ対策)。
    // 以前はここだけ空にしておらず、直前に選んでいた記号を指したまま「保存ファイル名」「図面枠プロパティ」の欄を出していた。
    // その欄を打つと、残っていた即適用(rp.oninput/onchange・focusout)が applyRightPanel() を呼び、この画面に無い欄を空として読んで
    // **直前に選んでいた記号のデバイス名・型番・仕様・端子番号を消していた**(盛田さん「型式仕様が消える」。バックアップで
    // 保存ファイル名を変えた回に CP1 の4つが一度に空になっていたのを確認、実アプリで再現)
    rp._el = null; rp._wire = null;
    rp.oninput = rp.onchange = null;
    if (rp._focusoutHandler) { rp.removeEventListener('focusout', rp._focusoutHandler); rp._focusoutHandler = null; }
    rp.innerHTML = html; return;
  }

  const item = el || wire;
  let html = '';

  if (el && el.type === 'junction') {
    const isTerm = (el.style === 'circle' || el.style === 'dbl'); // 白丸/二重丸のみ端子台の端子として扱う
    html += `<p style="font-size:10px;font-weight:600;color:var(--fg4);padding:6px 10px 2px">${isTerm ? '端子台の端子' : '接続点(分岐点)'}</p>`;
    // 【2026-08-23】X/Yの手入力欄は削除した(盛田さん判断)。端子・分岐点とも
    // 配線の端点にスナップして置くもので、座標を手打ちで直す場面が無い。
    // 動かすならドラッグの方が早い。半径と見た目は描くときに頻繁に触るので残す。
    // 端子(○/◎)・分岐点(●)の共通部分なので、削除は両方に効く。
    html += `<div class="pp-row"><label>半径</label><input type="number" id="pp-jr" value="${escH(el.r||2)}" min="1" max="30" step="1"></div>`;
    html += `<div class="pp-row"><label>見た目</label><select id="pp-jstyle"><option value="dot"${(el.style||'dot')==='dot'?' selected':''}>●塗りつぶし</option><option value="circle"${el.style==='circle'?' selected':''}>○白丸</option><option value="dbl"${el.style==='dbl'?' selected':''}>◎二重丸</option></select></div>`;
    if (isTerm) {
      // 【2026-08-23・最終形】盛田さん「シンボルと同じにしろと言ったはずだが？」。
      // 端子専用の別実装(copyJunctionProps等、フィールドを絞ったもの)を
      // 一度作ったが撤廃し、一般要素と全く同じ copyDeviceProps/pasteDeviceProps
      // をそのまま使う。label(端子番号)も貼り付け対象に含まれる点は把握した上での
      // 判断(端子番号の重複は既存の重複警告機能で検出できる)。
      html += `<div class="pp-row" style="gap:6px">
        <button onclick="copyDeviceProps()" title="このシンボルのデバイス名・型番・仕様・文字設定を丸ごとコピーします" style="flex:1;font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">一括コピー</button>
        <button onclick="pasteDeviceProps()" title="コピーした内容を、選択中の要素(複数可・種類が違ってもOK)へまとめて貼り付けます" style="flex:1;font-size:11px;padding:3px 6px;background:${deviceClipboard?'var(--accent,#1d6fb5)':'var(--bg3)'};border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:${deviceClipboard?'#fff':'var(--fg)'}"${deviceClipboard?'':' disabled'}>一括貼り付け</button>
      </div>`;
      // 【2026-08-23】一般要素側(◆デバイス/◆型式/◆仕様)と揃えた。盛田さん
      // 「その辺の項目はシンボルプロパティと合わせた方が良さそうだがどう思う？」
      // 「はい」。中身(常に使うもの)は枠の直下に、見た目調整(色・サイズ・位置)は
      // ▸詳細に畳んで隠す。端子は「仕様」に相当するものが無く、代わりに
      // 「端子番号」グループを置く。IDはすべて既存のまま(pp-jref等)なので
      // 保存側(applyRightPanel)は変更不要。
      //
      // 【2026-08-22の経緯、引き続き有効】盛田さんの「端子番号がうまく書けない」
      // 「調整が効かない」への対応。位置補正XYはあったが文字サイズ・色が無く、
      // 重なったり読めなかったりしても調整できなかった。シンボル側と同じ
      // devFs/devColor/labelFs/labelColor を持たせている。
      //
      // デバイス表示ON/OFFは、盛田さんの書き方に合わせるためのもの。
      // 「TB1-1,TB1-2 と全部書くと見づらいので TB1-1,-2 と書く」という運用で、
      // 全端子にTB1が出ると邪魔になる。先頭の端子だけONにして「TB1 1, 2, 3」と
      // 出す。ページを跨ぐ・同じページでも書いた位置で先頭が変わるため、
      // どれを先頭とみなすかは機械的に決められない。よって自動判定はせず手動。
      // 既定はOFF。同じデバイスで複数ONにしてよい(かたまりごとの先頭に出す)。
      // 集計側(端子台表・部品表)はこのON/OFFを見ないので、何個表示しても
      // TB1は1台として扱われる。
      const jDevC = el.devColor||(state.darkMode?'#4da3ff':'#1d6fb5');
      html += `<div class="pp-group" style="border-left:4px solid ${jDevC}"><div class="pp-group-cap" style="color:${jDevC}">◆ デバイス</div>`;
      html += `<div class="pp-row"><label>デバイス</label>`
        + `<input type="text" id="pp-jref" list="pp-jref-list" value="${escH(el.partRef||'')}"`
        + ` placeholder="例: TB1" onchange="onJunctionRefChanged()"></div>`
        + `<datalist id="pp-jref-list">${partRefOptionsHtml(el.partRef)}</datalist>`;
      html += `<div class="pp-row"><label>デバイスを図面に表示</label><input type="checkbox" id="pp-jrefshow" ${(el.showDev!==undefined?el.showDev:true)?'checked':''}></div>`;
      // 【2026-08-23】盤内/盤外の2択セレクトから「対象外」チェックに変更。
      // 既定が盤内なので実質フラグ1つで足り、選ばせる必要が無かった。
      // 内部表現(el.panelZone: 未設定 or '外')は変えていないので既存データも読める。
      html += `<div class="pp-row"><label>部品表の対象外</label><input type="checkbox" id="pp-jzone"${el.panelZone==='外'?' checked':''} title="チェックすると部品表に集計されません。現地調達品など、この図面で手配しないものに使います"></div>`;
      html += `<details class="pp-details" style="border-left:4px solid ${jDevC}"><summary>デバイス表示の詳細（色・サイズ・位置）</summary>`;
      html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-jdfs" value="${escH(el.devFs!==undefined?el.devFs:'')}" placeholder="自動" min="4" max="48" step="1" oninput="previewJDeviceOff()"></div>`;
      html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-jdcolor" value="${escH(el.devColor||'#555555')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-jdcolor','pp-jdcolorcode');previewJDeviceOff()"><input type="text" id="pp-jdcolorcode" value="${escH(el.devColor||'#555555')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-jdcolorcode','pp-jdcolor');previewJDeviceOff()">${colorCodeBtns('pp-jdcolorcode','pp-jdcolor')}</div></div>`;
      html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-jdox" value="${escH(el.devOffX!==undefined?el.devOffX:'')}" placeholder="自動" step="1" oninput="previewJDeviceOff()"></div>`;
      html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-jdoy" value="${escH(el.devOffY!==undefined?el.devOffY:'')}" placeholder="自動" step="1" oninput="previewJDeviceOff()"></div>`;
      html += `<div class="pp-row"><button onclick="resetJDeviceOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
      html += `</details></div>`;

      html += `<div class="pp-group" style="border-left:4px solid var(--fg3)"><div class="pp-group-cap" style="color:var(--fg3)">◆ 型式</div>`;
      html += `<div class="pp-row"><label>型番(BOM用)</label><input type="text" id="pp-jmodel" value="${escH(el.partModel||'')}" placeholder="例: 端子台 M4" onchange="onJunctionModelChanged()" title="同じデバイス(TB1等)の端子すべてに同じ型式が入ります。台ごとに1回書けば済みます"></div>`;
      html += `</div>`;

      // 【2026-08-23】端子番号は候補リスト付きにする。部品DBの端子番号欄
      // (カタログCSV 6列目)に登録されている端子を datalist で出す。
      // PLC・インバータ・サーボアンプは端子数が多く(X0〜X15/COM 等)、
      // 全部手打ちさせると打ち間違いのもとになるため。
      // 名前付きグループ形式("入力:X0,X1/出力:Y0,Y1")にも対応(parseTerminalGroups)。
      // 部品DBに無い型式・型式未設定なら候補は空になり、従来どおり自由入力。
      const jLblC = el.labelColor||'#555555';
      html += `<div class="pp-group" style="border-left:4px solid ${jLblC}"><div class="pp-group-cap" style="color:${jLblC}">◆ 端子番号</div>`;
      html += `<div class="pp-row"><label>端子番号</label>`
        + `<input type="text" id="pp-jlabel" list="pp-jlabel-list" value="${escH(el.label||'')}" placeholder="例: A, 1"></div>`
        + `<datalist id="pp-jlabel-list">${junctionTermOptionsHtml(el)}</datalist>`;
      html += `<details class="pp-details" style="border-left:4px solid ${jLblC}"><summary>端子番号表示の詳細（色・サイズ・位置）</summary>`;
      html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-jlfs" value="${escH(el.labelFs!==undefined?el.labelFs:'')}" placeholder="自動" min="4" max="48" step="1" oninput="previewJLabelOff()"></div>`;
      html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-jlcolor" value="${escH(el.labelColor||'#555555')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-jlcolor','pp-jlcolorcode');previewJLabelOff()"><input type="text" id="pp-jlcolorcode" value="${escH(el.labelColor||'#555555')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-jlcolorcode','pp-jlcolor');previewJLabelOff()">${colorCodeBtns('pp-jlcolorcode','pp-jlcolor')}</div></div>`;
      html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-jlox" value="${escH(el.labelOffX!==undefined?el.labelOffX:'')}" placeholder="自動" step="1" oninput="previewJLabelOff()"></div>`;
      html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-jloy" value="${escH(el.labelOffY!==undefined?el.labelOffY:'')}" placeholder="自動" step="1" oninput="previewJLabelOff()"></div>`;
      html += `<div class="pp-row"><button onclick="resetJLabelOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
      html += `</details></div>`;
    }
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
  } else if (el && el.type === 'text') {
    html += `<div class="pp-row"><label>テキスト</label><textarea rows="2" id="pp-text">${el.text||''}</textarea></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-fs" value="${escH(el.fs||14)}" min="8" max="72"></div>`;
    html += `<div class="pp-row"><label>枠</label><input type="checkbox" id="pp-textbox" ${el.textBox?'checked':''}><label for="pp-textbox" style="margin-left:4px">枠あり</label></div>`;
  } else if (el && el.type === 'angle_dim') {
    html += `<div class="pp-row"><label>角度テキスト</label><input type="text" id="pp-angtext" value="${escH(el.dimText||'')}"></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-angfs" value="${escH(el.dimFs||11)}" min="6" max="32"></div>`;
    html += `<div class="pp-row"><label>弧の半径</label><input type="number" id="pp-angr" value="${escH(el.r||30)}" min="10" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストX補正</label><input type="number" id="pp-angtx" value="${escH(el.dimTx||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストY補正</label><input type="number" id="pp-angty" value="${escH(el.dimTy||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
  } else if (el && el.type === 'dim') {
    const len = Math.round(Math.hypot(el.x2-el.x1, el.y2-el.y1));
    html += `<div class="pp-row"><label>寸法テキスト</label><input type="text" id="pp-dimtext" value="${escH(el.dimText||len)}"></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-dimfs" value="${escH(el.dimFs||11)}" min="8" max="72"></div>`;
    html += `<div class="pp-row"><label>テキストX補正</label><input type="number" id="pp-dimtx" value="${escH(el.dimTx||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストY補正</label><input type="number" id="pp-dimty" value="${escH(el.dimTy||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>矢印スタイル</label><select id="pp-arrstyle">
      <option value="filled" ${(el.arrowStyle||'filled')==='filled'?'selected':''}>▶ 塗りつぶし</option>
      <option value="open"   ${el.arrowStyle==='open'  ?'selected':''}>▷ 開き矢印</option>
      <option value="tick"   ${el.arrowStyle==='tick'  ?'selected':''}>/ 斜め線</option>
      <option value="dot"    ${el.arrowStyle==='dot'   ?'selected':''}>● 丸</option>
      <option value="none"   ${el.arrowStyle==='none'  ?'selected':''}>なし</option>
    </select></div>`;
    html += `<div class="pp-row"><label>矢印サイズ</label><input type="number" id="pp-arrsz" value="${escH(el.arrowSz||8)}" min="2" max="30" step="1"></div>`;
    html += `<div class="pp-row"><label>引出しgap</label><input type="number" id="pp-gap" value="${escH(el.gap!=null?el.gap:state.G)}" min="0" max="20"></div>`;
    html += `<div class="pp-row"><label>伸び(ext)</label><input type="number" id="pp-ext" value="${escH(el.ext!=null?el.ext:state.G)}" min="0" max="20"></div>`;
    html += `<div class="pp-row"><label>線幅</label><select id="pp-dimlw">${lineWidthOptions(el.lineWidth||DEFAULT_LINE_WIDTH)}</select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-dimls">
      <option value=""        ${!el.lineStyle          ?'selected':''}>実線</option>
      <option value="dash"    ${el.lineStyle==='dash'   ?'selected':''}>破線</option>
      <option value="dashdot" ${el.lineStyle==='dashdot'?'selected':''}>一点鎖線</option>
      <option value="dot"     ${el.lineStyle==='dot'    ?'selected':''}>点線</option>
    </select></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    html += `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
      <button class="fp-btn primary" onclick="applyRightPanel()">適用</button>
      <button class="fp-btn" onclick="applyDimToAll()">全て適用</button>
      <button class="fp-btn" onclick="saveDimDef()">デフォルト保存</button>
      <button class="fp-btn danger" onclick="resetDimDef()">初期値に戻す</button>
    </div>`;
  } else if (el && el.type === 'leader') {
    html += `<div class="pp-row"><label>引出しテキスト</label><input type="text" id="pp-ldrtext" value="${escH(el.leaderText||'')}"></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-ldrfs" value="${escH(el.leaderFs||11)}" min="8" max="72"></div>`;
    html += `<div class="pp-row"><label>テキストX補正</label><input type="number" id="pp-ldrtx" value="${escH(el.leaderTx||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストY補正</label><input type="number" id="pp-ldrty" value="${escH(el.leaderTy||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
  } else if (wire || (el && el.pts)) {
    const lay = LAYERS.find(l => l.name === item.layer);
    const wPts = item.pts || [{x:item.x1,y:item.y1},{x:item.x2,y:item.y2}];
    const wAng = wPts.length>=2 ? Math.round(Math.atan2(wPts[wPts.length-1].y-wPts[0].y, wPts[wPts.length-1].x-wPts[0].x)*180/Math.PI*10)/10 : 0;
    html += `<div class="pp-row"><label>角度(°)</label><input type="number" id="pp-wangle" value="${escH(wAng)}" step="1"></div>`;
    html += `<div class="pp-row"><label>線番</label><input type="text" id="pp-wireno" value="${escH(item.wireNo||'')}"></div>`;
    html += `<div class="pp-row"><label>線番サイズ</label><input type="number" id="pp-wno-fs" value="${escH(item.wireNoFs||10)}" step="1" min="6" max="32"></div>`;
    html += `<div class="pp-row"><label>線番X補正</label><input type="number" id="pp-wno-ox" value="${escH(item.wireNoOffX||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>線番Y補正</label><input type="number" id="pp-wno-oy" value="${escH(item.wireNoOffY||0)}" step="5"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${item.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    html += `<div class="pp-row"><label>線幅</label><select id="pp-lw">${lineWidthOptions(item.lineWidth||DEFAULT_LINE_WIDTH)}</select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-ls"><option value=""${!item.lineStyle?' selected':''}>実線</option><option value="dash"${item.lineStyle==='dash'?' selected':''}>破線</option><option value="dashdot"${item.lineStyle==='dashdot'?' selected':''}>一点鎖線</option><option value="dot"${item.lineStyle==='dot'?' selected':''}>点線</option></select></div>`;
    if (lay?.attr) html += `<div class="pp-row"><label>属性（レイヤー）</label><p style="font-size:11px;color:var(--fg3);padding:2px 5px">${lay.attr}</p></div>`;
  } else if (el && ['fline','rect','circle','arc','triangle'].includes(el.type)) {
    // 図形専用プロパティ
    if (el.type === 'fline') {
      const fAng = Math.round(Math.atan2(el.y2-el.y1, el.x2-el.x1)*180/Math.PI*10)/10;
      const fLen = Math.round(Math.hypot(el.x2-el.x1, el.y2-el.y1)*10)/10;
      html += `<div class="pp-row"><label>回転基準</label><select id="pp-fbase"><option value="p1">始点固定</option><option value="p2">終点固定</option></select></div>`;
      html += `<div class="pp-row"><label>角度(°)</label><input type="number" id="pp-fangle" value="${escH(fAng)}" step="1"></div>`;
      html += `<div class="pp-row"><label>長さ</label><input type="number" id="pp-flen" value="${escH(fLen)}" step="1" min="1"></div>`;
      html += `<div class="pp-row"><label>始点X</label><input type="number" id="pp-x1" value="${escH(Math.round(el.x1*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>始点Y</label><input type="number" id="pp-y1" value="${escH(Math.round(el.y1*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>終点X</label><input type="number" id="pp-x2" value="${escH(Math.round(el.x2*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>終点Y</label><input type="number" id="pp-y2" value="${escH(Math.round(el.y2*1000)/1000)}" step="any"></div>`;
    } else if (el.type === 'arc') {
      html += `<div class="pp-row"><label>中心X</label><input type="number" id="pp-x1" value="${escH(Math.round(el.x*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>中心Y</label><input type="number" id="pp-y1" value="${escH(Math.round(el.y*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>半径</label><input type="number" id="pp-arcr" value="${escH(Math.round((el.r||10)*10)/10)}" step="1" min="1"></div>`;
      html += `<div class="pp-row"><label>開始角(°)</label><input type="number" id="pp-arca1" value="${escH(Math.round(el.startA*180/Math.PI*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>終了角(°)</label><input type="number" id="pp-arca2" value="${escH(Math.round(el.endA*180/Math.PI*1000)/1000)}" step="any"></div>`;
    } else if (el.type === 'triangle') {
      html += `<div class="pp-row"><label>回転基準</label><select id="pp-tribase"><option value="p1">頂点1固定</option><option value="p2">頂点2固定</option><option value="p3">頂点3固定</option></select></div>`;
      html += `<div class="pp-row"><label>回転角(°)</label><input type="number" id="pp-triangle" value="0" step="1"></div>`;
      html += `<div class="pp-row"><label>頂点1 X</label><input type="number" id="pp-tx1" value="${escH(Math.round(el.x1*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点1 Y</label><input type="number" id="pp-ty1" value="${escH(Math.round(el.y1*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点2 X</label><input type="number" id="pp-tx2" value="${escH(Math.round(el.x2*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点2 Y</label><input type="number" id="pp-ty2" value="${escH(Math.round(el.y2*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点3 X</label><input type="number" id="pp-tx3" value="${escH(Math.round(el.x3*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点3 Y</label><input type="number" id="pp-ty3" value="${escH(Math.round(el.y3*1000)/1000)}" step="any"></div>`;
    } else if (el.type === 'rect') {
      html += `<div class="pp-row"><label>X</label><input type="number" id="pp-rx" value="${escH(Math.round(el.x*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>Y</label><input type="number" id="pp-ry" value="${escH(Math.round(el.y*1000)/1000)}" step="any"></div>`;
      html += `<div class="pp-row"><label>幅</label><input type="number" id="pp-rw" value="${escH(Math.round(el.w*1000)/1000)}" step="any" min="1"></div>`;
      html += `<div class="pp-row"><label>高さ</label><input type="number" id="pp-rh" value="${escH(Math.round(el.h*1000)/1000)}" step="any" min="1"></div>`;
    }
    html += `<div class="pp-row"><label>線幅</label><select id="pp-lw">${lineWidthOptions(el.lineWidth||DEFAULT_LINE_WIDTH)}</select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-ls"><option value=""${!el.lineStyle?' selected':''}>実線</option><option value="dash"${el.lineStyle==='dash'?' selected':''}>破線</option><option value="dot"${el.lineStyle==='dot'?' selected':''}>点線</option><option value="dashdot"${el.lineStyle==='dashdot'?' selected':''}>一点鎖線</option></select></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    html += `<div class="pp-row"><label>メモ</label><textarea rows="2" id="pp-note">${el.note||''}</textarea></div>`;
  } else if (el) {
    const def = getDef(el.type) || {};
    // 識別情報を先頭に置く。デバイス→型番→型式表示→仕様の順。
    // 「仕様」の内部フィールド名は label のまま(既存データ互換)。
    // 端子台(junction)では同じ label を端子番号として使っているので注意。
    // コイル名/参照コイル名は廃止。接点とコイルの紐づけはデバイス(partRef)で行う。
    // 【2026-08-03追加】形の違うシンボル間でもデバイス名/型番/文字設定をまとめて
    // 複製できるよう、コピー・貼り付けボタンを先頭に置く(複数選択への一括貼り付けも可)。
    html += `<div class="pp-row" style="gap:6px">
      <button onclick="copyDeviceProps()" title="このシンボルのデバイス名・型番・仕様・文字設定を丸ごとコピーします" style="flex:1;font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">一括コピー</button>
      <button onclick="pasteDeviceProps()" title="コピーした内容を、選択中のシンボル(複数可・形が違ってもOK)へまとめて貼り付けます" style="flex:1;font-size:11px;padding:3px 6px;background:${deviceClipboard?'var(--accent,#1d6fb5)':'var(--bg3)'};border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:${deviceClipboard?'#fff':'var(--fg)'}"${deviceClipboard?'':' disabled'}>一括貼り付け</button>
    </div>`;
    // 【2026-10-01】ページ跨ぎの矢印(送り・受け)は部品ではない。デバイス・型式の欄は隠し(欄は残す=適用処理が id で読むため)、
    // 「仕様」欄(el.label)を「名前」(相手を探す名前)として見せる。相手表示の位置・サイズ・表示はCRタブで直せるようにする
    // (盛田さん「ページ跨ぎのシンボルプロパティはおかしくないか」)
    const _isSig = ['sig_out', 'sig_in'].includes(symRole(el));
    const _hasCR = ['coil', 'contact_a', 'contact_b'].includes(symRole(el)) || _isSig;   // クロスリファレンスの対象(js/xref.js)
    html += `<div class="pp-row" style="gap:6px"><label>シンボル</label><span id="pp-symname" onclick="rpJumpToSymbol('${_escAttr(el.type)}')" style="padding:2px 0;color:var(--acc);font-size:11px;cursor:pointer;text-decoration:underline dotted" title="この要素の元になっている登録シンボルの名前と、接点Ref用の種別です。クリックで左のシンボル一覧のそのシンボルへ飛びます">${escH(rpSymbolLabel(el))}</span></div>`;
    html += rpTabsHeader(_hasCR) + rpPaneOpen('basic');
    if (_isSig) html += `<div style="display:none">`;   // 矢印: デバイス・型式は隠す(下の「名前」の前で閉じる)
    { const devC = el.devColor||(state.darkMode?'#4da3ff':'#1d6fb5');
    html += `<div class="pp-group" style="border-left:4px solid ${devC}"><div class="pp-group-cap" style="color:${devC}">◆ デバイス</div>`;
    // デバイス欄は入力欄＋候補リスト(datalist)。候補は図面上で実際に使われている
    // デバイス記号だけを出す。既存デバイスを選ぶと型番・仕様がそこから引き継がれる
    // (MC1は主接点・コイル・補助接点と複数箇所に置くため、2つ目以降は選ぶだけで済む)。
    html += `<div class="pp-row"><label>デバイス</label>`
      + `<input type="text" id="pp-partref" list="pp-partref-list" value="${escH(el.partRef||'')}"`
      + ` placeholder="例: MC1, NFB1" onchange="onPartRefChanged()"></div>`
      + `<datalist id="pp-partref-list">${partRefOptionsHtml(el.partRef)}</datalist>`;
    html += `<div class="pp-row"><label>デバイスを図面に表示</label><input type="checkbox" id="pp-devhide"${el.devHide?'':' checked'} title="3極品等、同じデバイスを複数のシンボルに分けて配置する場合に使います。デバイス名は全部の要素に同じ値を入れつつ、文字はどれか1つだけに絞れます"></div>`;
    html += `<div class="pp-row"><label>部品表の対象外</label><input type="checkbox" id="pp-zone"${el.panelZone==='外'?' checked':''} title="チェックすると部品表に集計されません。現地調達品など、この図面で手配しないものに使います"></div>`;
    html += `<details class="pp-details" style="border-left:4px solid ${devC}"><summary>デバイス表示の詳細（色・サイズ・位置）</summary>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-dfs" value="${escH(el.devFs||11)}" step="1" min="6" max="32" oninput="previewDeviceOff()"></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-dcolor" value="${escH(el.devColor||'#1d6fb5')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-dcolor','pp-dcolorcode');previewDeviceOff()"><input type="text" id="pp-dcolorcode" value="${escH(el.devColor||'#1d6fb5')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-dcolorcode','pp-dcolor');previewDeviceOff()">${colorCodeBtns('pp-dcolorcode','pp-dcolor')}</div></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-dox" value="${escH(el.devOffX!==undefined?el.devOffX:'')}" placeholder="自動" step="5" oninput="previewDeviceOff()"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-doy" value="${escH(el.devOffY!==undefined?el.devOffY:'')}" placeholder="自動" step="5" oninput="previewDeviceOff()"></div>`;
    html += `<div class="pp-row"><button onclick="resetDeviceOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
    html += `</details>`;
    html += `</div>`; }
    { const mdlC = el.modelColor||el.labelColor||'#555555';
    html += `<div class="pp-group" style="border-left:4px solid ${mdlC}"><div class="pp-group-cap" style="color:${mdlC}">◆ 型式</div>`;
    html += `<div class="pp-row"><label>型番</label><input type="text" id="pp-partmodel" value="${escH(el.partModel||'')}" placeholder="例: S-T10（メーカー型番）" onchange="onPartModelChanged()"></div>`;
    html += partVoltRowHtml(el);
    html += partChoiceRowsHtml(el);
    html += `<div class="pp-row"><label>型式を図面に表示</label><input type="checkbox" id="pp-showmodel"${el.showModel?' checked':''} title="チェックしたシンボルにだけ型番が描画されます。接点側はOFFのままにしてください"></div>`;
    html += `<details class="pp-details" style="border-left:4px solid ${mdlC}"><summary>型式表示の詳細（色・サイズ・位置）</summary>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-mfs" value="${escH(el.modelFs||el.labelFs||11)}" step="1" min="6" max="32" oninput="previewModelOff()"></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-mcolor" value="${escH(el.modelColor||el.labelColor||'#555555')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-mcolor','pp-mcolorcode');previewModelOff()"><input type="text" id="pp-mcolorcode" value="${escH(el.modelColor||el.labelColor||'#555555')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-mcolorcode','pp-mcolor');previewModelOff()">${colorCodeBtns('pp-mcolorcode','pp-mcolor')}</div></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-mox" value="${escH(el.modelOffX!==undefined?el.modelOffX:'')}" placeholder="自動" step="5" oninput="previewModelOff()"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-moy" value="${escH(el.modelOffY!==undefined?el.modelOffY:'')}" placeholder="自動" step="5" oninput="previewModelOff()"></div>`;
    html += `<div class="pp-row"><button onclick="resetModelOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
    html += `</details>`;
    html += `</div>`; }
    if (_isSig) html += `</div>`;
    { const lblC = el.labelColor||'#555555';
    const _spN = _isSig ? '名前' : '仕様';
    html += `<div class="pp-group" style="border-left:4px solid ${lblC}"><div class="pp-group-cap" style="color:${lblC}">◆ ${_spN}</div>`;
    html += `<div class="pp-row"><label>${_spN}</label><textarea rows="2" id="pp-label" style="text-align:${el.labelAlign||'center'}" placeholder="${_isSig ? '例: A1（同じ名前の送りと受けが相手になります）' : '例: AC200V 3.7kW&#10;冷却ファン用（改行可）'}">${el.label||''}</textarea></div>`;
    html += `<div class="pp-row"><label>${_spN}を図面に表示</label><input type="checkbox" id="pp-showspec"${el.specHide?'':' checked'} title="チェックしたシンボルにだけ仕様が描画されます。同じデバイスを複数のシンボルに分けて配置する場合、代表の1つだけONにしてください"></div>`;
    html += `<details class="pp-details" style="border-left:4px solid ${lblC}"><summary>${_spN}表示の詳細（揃え・色・サイズ・位置）</summary>`;
    html += `<div class="pp-row"><label>文字揃え</label><select id="pp-lalign" onchange="previewLabelStyle()">
      <option value="left"  ${el.labelAlign==='left'  ?'selected':''}>左揃え</option>
      <option value="center"${!el.labelAlign||el.labelAlign==='center'?'selected':''}>中央揃え</option>
      <option value="right" ${el.labelAlign==='right' ?'selected':''}>右揃え</option>
    </select></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-lcolor" value="${escH(el.labelColor||'#555555')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-lcolor','pp-lcolorcode');previewLabelStyle()"><input type="text" id="pp-lcolorcode" value="${escH(el.labelColor||'#555555')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-lcolorcode','pp-lcolor');previewLabelStyle()">${colorCodeBtns('pp-lcolorcode','pp-lcolor')}</div></div>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-lfs" value="${escH(el.labelFs||11)}" step="1" min="6" max="32" oninput="previewLabelStyle()"></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-lox" value="${escH(el.labelOffX||0)}" step="5" oninput="previewLabelOff()"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-loy" value="${escH(el.labelOffY||'')}" placeholder="自動" step="5" oninput="previewLabelOff()"></div>`;
    html += `<div class="pp-row"><button onclick="cancelLabelOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
    html += `</details>`;
    html += `</div>`; }
    html += rpPaneClose() + rpPaneOpen('term');
    html += `<div class="pp-row"><label>端子番号</label><input type="text" id="pp-term" value="${escH(el.terminals||'')}" placeholder="例: A1,A2,13,14" title="このシンボルの端子番号をカンマ区切りで。下の「端子番号」欄で1端子ずつ入れた方が確実です" oninput="syncTermNumInputs()"></div>`;
    html += symTermOffHtml(el);
    html += `<div class="pp-row"><label>線番</label><input type="text" id="pp-wireno" value="${escH(el.wireNo||'')}"></div>`;
    html += rpPaneClose() + rpPaneOpen('shape');
    html += `<div class="pp-row"><label>回転(°)</label><input type="number" id="pp-rot" value="${escH(el.rot||0)}" step="90"></div>`;
    html += `<div class="pp-row"><label>文字の回転角度(°)</label><input type="number" id="pp-trot" value="${escH(el.textRot||0)}" step="90" title="このシンボルのデバイス名・型式・仕様すべてに共通で効きます。シンボル自体の回転(上の「回転(°)」)とは連動しません。位置は各項目のオフセット(X/Y補正)で個別に指定してください"></div>`;
    html += `<div class="pp-row"><label>スケール</label><input type="number" id="pp-scale" value="${escH(el.scale||1)}" data-orig="${escH(el.scale||1)}" step="0.1" min="0.1" max="5" oninput="previewScale()"></div>`;
    // シンボル色ピッカーは撤去（2026-08-16）。62c94f0で完全BYLAYER化した際に
    // 描画側(draw.js)の el.color 参照を消したがUIだけ残っており、押しても画面に
    // 何も反映されない状態だった。さらに初期値が el.color||'#1d6fb5' だったため、
    // レイヤーに関係なく青が el.color へ焼き込まれる副作用もあった。
    // 色はレイヤーで分ける方針で確定（盛田さん判断）。
    html += `<div class="pp-row"><label>シンボル線種</label><select id="pp-symls"><option value=""${!el.lineStyle?' selected':''}>実線</option><option value="dash"${el.lineStyle==='dash'?' selected':''}>破線</option><option value="dot"${el.lineStyle==='dot'?' selected':''}>点線</option><option value="dashdot"${el.lineStyle==='dashdot'?' selected':''}>一点鎖線</option></select></div>`;
    html += `<div class="pp-row"><label>シンボル線幅</label><select id="pp-symlw" title="登録時の太さや標準シンボルの既定太さを、このシンボル1個だけ上書きします">
      <option value=""${!el.lineWidth?' selected':''}>個別（変更なし）</option>${lineWidthOptions(el.lineWidth)}
    </select></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${escH(l.name)}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    html += rpPaneClose() + rpPaneOpen('memo');
    // メモは既定では図面に出さない(従来どおり)。個別の注記を図面に書きたい
    // ときだけONにする。仕様(label)はデバイス単位で引き継がれて上書きされるため、
    // シンボル個別に書きたい文字(「運転」「停止」等)の逃げ道としてここを使う。
    html += `<div class="pp-row"><label>メモ</label><textarea rows="2" id="pp-note">${el.note||''}</textarea></div>`;
    html += `<div class="pp-row"><label>メモを図面に表示</label><input type="checkbox" id="pp-shownote"${el.showNote?' checked':''} title="ONにするとメモの内容が図面に描かれます。仕様と違いデバイスの引き継ぎで上書きされないので、シンボルごとに違う注記を書くのに使えます"></div>`;
    html += `<details class="pp-details"><summary>メモ表示の詳細（サイズ・色・位置）</summary>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-nfs" value="${escH(el.noteFs||el.labelFs||11)}" step="1" min="6" max="32"></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-ncolor" value="${escH(el.noteColor||'#555555')}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-ncolor','pp-ncolorcode')"><input type="text" id="pp-ncolorcode" value="${escH(el.noteColor||'#555555')}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-ncolorcode','pp-ncolor')">${colorCodeBtns('pp-ncolorcode','pp-ncolor')}</div></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-nox" value="${escH(el.noteOffX!==undefined?el.noteOffX:'')}" placeholder="自動" step="5"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-noy" value="${escH(el.noteOffY!==undefined?el.noteOffY:'')}" placeholder="自動" step="5"></div>`;
    html += `</details>`;
    html += rpPaneClose();
    // クロスリファレンスの個別設定(コイル・接点と、ページ跨ぎの矢印の相手表示)。空欄=自動。位置は自動の位置からのずれ、サイズは全体の倍率に掛ける倍率
    if (_hasCR) {
      html += rpPaneOpen('cr');
      html += `<div class="pp-row"><label>図面に表示</label><input type="checkbox" id="pp-xshow"${el.xrefHide?'':' checked'} title="OFFにするとこの要素のクロスリファレンスを出しません"></div>`;
      html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-xox" value="${escH(el.xrefOffX!==undefined?el.xrefOffX:'')}" placeholder="自動" step="1"></div>`;
      html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-xoy" value="${escH(el.xrefOffY!==undefined?el.xrefOffY:'')}" placeholder="自動" step="1"></div>`;
      html += `<div class="pp-row"><label>文字サイズ(倍率)</label><input type="number" id="pp-xmul" value="${escH(el.xrefMul!==undefined?el.xrefMul:'')}" placeholder="全体と同じ" step="0.1" min="0.3" max="3" title="表示タブの全体の倍率に、さらに掛ける倍率です。空欄なら全体と同じ"></div>`;
      html += `<div class="pp-row"><button onclick="resetXrefAdjust()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">自動に戻す</button></div>`;
      html += rpPaneClose();
    }
  }

  // rp.innerHTML を設定する前に _el/_wire をクリアする。
  // innerHTML 代入時に旧フォーカス要素の focusout が同期発火し、
  // 古い _el を参照したまま applyRightPanel() が呼ばれると
  // 存在しない pp-layer を '' で読んでコピー元のレイヤーを破壊するバグがあるため。
  rp._el = null; rp._wire = null;
  rp.innerHTML = html;
  rp._el = el; rp._wire = wire;
  if (typeof rpApplyTab === 'function') rpApplyTab();
  const applyBtn = document.getElementById('rp-apply-btn');
  if (applyBtn) applyBtn.style.display = 'none'; // 即適用モードでは非表示

  // 即適用：変更を検知して自動applyRightPanel
  let _autoApplyTimer = null;
  rp.oninput = rp.onchange = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (e.target.tagName === 'TEXTAREA') return; // テキストエリアはfocusoutで適用
    clearTimeout(_autoApplyTimer);
    const delay = e.target.tagName === 'SELECT' || e.target.type === 'color' || e.target.type === 'number' ? 0 : 400;
    _autoApplyTimer = setTimeout(() => applyRightPanel(), delay);
  };
  // パネル外にフォーカスが移った時（選択解除前）に即時保存
  // addEventListener は呼び出しごとに蓄積するため、_focusoutHandler で管理して重複登録を防ぐ
  if (rp._focusoutHandler) rp.removeEventListener('focusout', rp._focusoutHandler);
  rp._focusoutHandler = (e) => {
    if (rp.contains(e.relatedTarget)) return; // パネル内の移動はスキップ
    clearTimeout(_autoApplyTimer);
    applyRightPanel();
  };
  rp.addEventListener('focusout', rp._focusoutHandler);
}

function colorRow(label, pickerId, codeId, defaultColor, onInput) {
  const focusBlur = `onfocus="state.colorEditing=true;draw()"`;
  return `<div class="pp-row"><label>${label}</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">` +
    `<input type="color" id="${pickerId}" value="${escH(defaultColor)}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" ${focusBlur} oninput="syncColorCode('${pickerId}','${codeId}');${onInput||''}">` +
    `<input type="text" id="${codeId}" value="${escH(defaultColor)}" style="width:72px;font-size:11px" maxlength="7" ${focusBlur} oninput="syncColorPicker('${codeId}','${pickerId}');${onInput||''}">` +
    `${colorCodeBtns(codeId, pickerId)}</div></div>`;
}

function colorCodeBtns(codeId, pickerId) {
  return `<div style="display:flex;gap:2px"><button onclick="copyColorCode('${codeId}')" class="pp-cbtn">Copy</button>` +
         `<button onclick="pasteColorCode('${codeId}','${pickerId}')" class="pp-cbtn">Paste</button></div>`;
}

function copyColorCode(codeId) {
  const el = document.getElementById(codeId);
  if (!el) return;
  navigator.clipboard.writeText(el.value).catch(() => {});
}

async function pasteColorCode(codeId, pickerId) {
  try {
    const text = await navigator.clipboard.readText();
    const v = text.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
    const code = document.getElementById(codeId);
    const pick = document.getElementById(pickerId);
    if (code) code.value = v;
    if (pick) pick.value = v;
    // 文字色(仕様/型式/デバイス)のみプレビュー反映。シンボル本体色は廃止済み
    if (codeId === 'pp-lcolorcode') previewLabelStyle();
  } catch(e) {}
}

function syncColorCode(pickerId, codeId) {
  const picker = document.getElementById(pickerId);
  const code   = document.getElementById(codeId);
  if (picker && code) code.value = picker.value;
}

function syncColorPicker(codeId, pickerId) {
  const code   = document.getElementById(codeId);
  const picker = document.getElementById(pickerId);
  if (!code || !picker) return;
  const v = code.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
}

function drawWithoutSel() {
  const savedEls = new Set(state.sel.els);
  const savedWires = new Set(state.sel.wires);
  state.sel.els.clear(); state.sel.wires.clear();
  draw();
  state.sel.els = savedEls; state.sel.wires = savedWires;
}

// 注: previewSymColor/previewWireColor/previewElColor/previewJunctionColor は
// 個別色の廃止(62c94f0・完全BYLAYER化)で中身が空になったまま残っていたため
// 2026-08-16に撤去した。呼び出し元は全ファイルgrepでゼロ件を確認済み。

function previewLabelStyle() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  const lcolor = document.getElementById('pp-lcolor');
  const lfs    = document.getElementById('pp-lfs');
  const lalign = document.getElementById('pp-lalign');
  if (lcolor) el.labelColor = lcolor.value || undefined;
  if (lfs)    el.labelFs    = parseInt(lfs.value) || 11;
  if (lalign) {
    el.labelAlign = lalign.value || undefined;
    const ta = document.getElementById('pp-label');
    if (ta) ta.style.textAlign = lalign.value || 'center';
  }
  drawWithoutSel();
}

function previewScale() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  const sc = document.getElementById('pp-scale');
  if (sc) el.scale = Math.max(0.1, Math.min(5, parseFloat(sc.value)||1));
  draw();
  updateResizeHandles();
}

// デバイスの位置・サイズをその場でプレビューする
// 【2026-08-23】端子(junction)のプロパティを一般要素側と揃えるにあたり、
// previewDeviceOff/resetDeviceOff等と同じパターンが4組(端子のデバイス・
// 端子番号の、それぞれプレビュー・リセット)必要になった。丸写しは保守性が
// 落ちるので汎用化する。既存のpreviewDeviceOff等はリスクを避けるため変更せず
// 残し、この新設分だけで使う(一般要素側の呼び出し元を今回は一切触っていない)。
//
// ids: {ox,oy,fs,color} のDOM要素ID。fields: 対応するelのフィールド名。
function _previewTextStyle(ids, fields) {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  const g = id => document.getElementById(id);
  const ox = g(ids.ox), oy = g(ids.oy), fs = g(ids.fs), color = g(ids.color);
  if (ox)    el[fields.ox]    = ox.value    !== '' ? parseInt(ox.value)  : undefined;
  if (oy)    el[fields.oy]    = oy.value    !== '' ? parseInt(oy.value)  : undefined;
  if (fs)    el[fields.fs]    = parseInt(fs.value) || undefined;
  if (color) el[fields.color] = color.value || undefined;
  drawWithoutSel();
}
function _resetTextOffset(ids, fields) {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  el[fields.ox] = undefined;
  el[fields.oy] = undefined;
  const ox = document.getElementById(ids.ox), oy = document.getElementById(ids.oy);
  if (ox) ox.value = '';
  if (oy) oy.value = '';
  drawWithoutSel();
}
const _J_DEV_IDS    = { ox:'pp-jdox', oy:'pp-jdoy', fs:'pp-jdfs', color:'pp-jdcolor' };
const _J_DEV_FIELDS = { ox:'devOffX', oy:'devOffY', fs:'devFs',   color:'devColor'  };
const _J_LBL_IDS    = { ox:'pp-jlox', oy:'pp-jloy', fs:'pp-jlfs', color:'pp-jlcolor' };
const _J_LBL_FIELDS = { ox:'labelOffX', oy:'labelOffY', fs:'labelFs', color:'labelColor' };
function previewJDeviceOff() { _previewTextStyle(_J_DEV_IDS, _J_DEV_FIELDS); }
function resetJDeviceOff()   { _resetTextOffset(_J_DEV_IDS, _J_DEV_FIELDS); }
function previewJLabelOff()  { _previewTextStyle(_J_LBL_IDS, _J_LBL_FIELDS); }
function resetJLabelOff()    { _resetTextOffset(_J_LBL_IDS, _J_LBL_FIELDS); }

function previewDeviceOff() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  const g = id => document.getElementById(id);
  const dox = g('pp-dox'), doy = g('pp-doy'), dfs = g('pp-dfs');
  const dcolor = g('pp-dcolor');
  if (dox) el.devOffX = dox.value !== '' ? parseInt(dox.value) : undefined;
  if (doy) el.devOffY = doy.value !== '' ? parseInt(doy.value) : undefined;
  if (dfs) el.devFs   = parseInt(dfs.value) || undefined;
  if (dcolor) el.devColor = dcolor.value || undefined;
  drawWithoutSel();
}

// デバイスの位置補正を解除し、既定位置(シンボル上)へ戻す
function resetDeviceOff() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  el.devOffX = undefined;
  el.devOffY = undefined;
  const dox = document.getElementById('pp-dox'), doy = document.getElementById('pp-doy');
  if (dox) dox.value = '';
  if (doy) doy.value = '';
  drawWithoutSel();
}

// 型式の位置・サイズをその場でプレビューする
function previewModelOff() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  const g = id => document.getElementById(id);
  const mox = g('pp-mox'), moy = g('pp-moy'), mfs = g('pp-mfs'), mcolor = g('pp-mcolor');
  if (mox) el.modelOffX = mox.value !== '' ? parseInt(mox.value) : undefined;
  if (moy) el.modelOffY = moy.value !== '' ? parseInt(moy.value) : undefined;
  if (mfs) el.modelFs   = parseInt(mfs.value) || undefined;
  if (mcolor) el.modelColor = mcolor.value || undefined;
  drawWithoutSel();
}

// 型式の位置補正を解除し、ラベル基準の自動配置へ戻す
function resetModelOff() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  el.modelOffX = undefined;
  el.modelOffY = undefined;
  const mox = document.getElementById('pp-mox'), moy = document.getElementById('pp-moy');
  if (mox) mox.value = '';
  if (moy) moy.value = '';
  drawWithoutSel();
}

function previewLabelOff() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el) return;
  // 初回プレビュー時に元の値を保存
  if (rp._origLox === undefined) {
    rp._origLox = el.labelOffX;
    rp._origLoy = el.labelOffY;
  }
  const lox = document.getElementById('pp-lox');
  const loy = document.getElementById('pp-loy');
  if (lox) el.labelOffX = parseInt(lox.value)||0;
  if (loy) el.labelOffY = loy.value ? parseInt(loy.value) : undefined;
  drawWithoutSel();
}

function cancelLabelOff() {
  const rp = document.getElementById('rp-body');
  const el = rp?._el;
  if (!el || rp._origLox === undefined) return;
  el.labelOffX = rp._origLox;
  el.labelOffY = rp._origLoy;
  rp._origLox = undefined;
  rp._origLoy = undefined;
  // 入力欄も元の値に戻す
  const lox = document.getElementById('pp-lox');
  const loy = document.getElementById('pp-loy');
  if (lox) lox.value = el.labelOffX || 0;
  if (loy) loy.value = el.labelOffY !== undefined ? el.labelOffY : '';
  draw();
}

let _lastApplyItem = null;
function applyRightPanel() {
  state.colorEditing = false;
  const rp   = document.getElementById('rp-body');
  const el   = rp._el, wire = rp._wire;
  const item = el || wire;
  if (!item) return;
  // 【デバイス台帳②】直す前のデバイスの値を控え、最後に変わった項目をデバイス全体へ入れる(js/devices.js)
  const devBefore = (el && typeof devSnap === 'function') ? devSnap(el) : null;
  // 同じ要素の連続変更はundoスタックをまとめる
  if (_lastApplyItem !== item) { pushH(); _lastApplyItem = item; setTimeout(()=>{ _lastApplyItem = null; }, 1000); }
  const v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  // レイヤーだけは「欄が無いときに空で上書きしない」。
  // 空にするとLAYERS.findが外れて描画色がfgC()(ダークで#ccc=ほぼ白)になり、
  // 「一か所だけ白く壊れる」という症状になる。過去に同じ原因で
  // 「存在しないpp-layerを''で読んでコピー元のレイヤーを破壊する」不具合が出ており、
  // そのときはrp._elのクリアで対処したが、v()側は空を返したままだった。
  // 根本を塞ぐため、欄が無い・値が空のときは現在のレイヤーを保つ。
  const vLayer = cur => {
    const e = document.getElementById('pp-layer');
    const val = e ? e.value : '';
    return val || cur;
  };
  // チェックボックスの状態を読む（欄が無ければfalse）
  const chk = id => { const e = document.getElementById(id); return e ? !!e.checked : false; };
  if (el && el.type === 'junction') {
    if (v('pp-jr')!=='') el.r = Math.max(1, parseFloat(v('pp-jr')));
    if (v('pp-jstyle')!=='') el.style = v('pp-jstyle');
    if (el.style === 'circle' || el.style === 'dbl') {
      el.label     = v('pp-jlabel');
      el.partRef   = v('pp-jref');
      el.partModel = v('pp-jmodel');
      el.panelZone = chk('pp-jzone') ? '外' : undefined;
      el.showDev   = !!chk('pp-jrefshow');
      if (v('pp-jdfs')!=='')   el.devFs = parseFloat(v('pp-jdfs'));     else delete el.devFs;
      if (v('pp-jlfs')!=='')   el.labelFs = parseFloat(v('pp-jlfs'));   else delete el.labelFs;
      el.devColor   = v('pp-jdcolor') || undefined;
      el.labelColor = v('pp-jlcolor') || undefined;
      if (v('pp-jdox')!=='') el.devOffX = parseFloat(v('pp-jdox')); else delete el.devOffX;
      if (v('pp-jdoy')!=='') el.devOffY = parseFloat(v('pp-jdoy')); else delete el.devOffY;
      if (v('pp-jlox')!=='') el.labelOffX = parseFloat(v('pp-jlox')); else delete el.labelOffX;
      if (v('pp-jloy')!=='') el.labelOffY = parseFloat(v('pp-jloy')); else delete el.labelOffY;
    } else {
      // 分岐点(●)には端子情報は不要
      delete el.label; delete el.partRef; delete el.partModel;
      delete el.devOffX; delete el.devOffY; delete el.labelOffX; delete el.labelOffY;
      delete el.showDev; delete el.devFs; delete el.labelFs;
      delete el.devColor; delete el.labelColor;
    }
    el.layer = vLayer(el.layer);
  } else if (el && el.type === 'text') {
    el.text = v('pp-text'); el.fs = parseInt(v('pp-fs'))||14;
    el.textBox = document.getElementById('pp-textbox')?.checked || false;
  } else if (el && el.type === 'angle_dim') {
    el.dimText = v('pp-angtext');
    el.dimFs   = parseInt(v('pp-angfs'))||11;
    el.r       = parseFloat(v('pp-angr'))||30;
    el.dimTx   = parseInt(v('pp-angtx'))||0;
    el.dimTy   = parseInt(v('pp-angty'))||0;
    el.layer   = vLayer(el.layer);
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
    el.layer    = vLayer(el.layer);
  } else if (el && el.type === 'leader') {
    el.leaderText = v('pp-ldrtext');
    el.leaderFs   = parseInt(v('pp-ldrfs')) || 11;
    el.leaderTx   = parseInt(v('pp-ldrtx')) || 0;
    el.leaderTy   = parseInt(v('pp-ldrty')) || 0;
    el.layer      = vLayer(el.layer);
  } else if (wire) {
    if (wire.wireNo !== v('pp-wireno')) wire.wireNoMain = false;   // 手で直したら主回路の自動の目印を外す(js/wire_no_main.js)
    wire.wireNo    = v('pp-wireno'); wire.layer = vLayer(wire.layer);
    wire.wireNoFs  = parseInt(v('pp-wno-fs')) || 10;
    wire.wireNoOffX = parseFloat(v('pp-wno-ox'))||0;
    wire.wireNoOffY = parseFloat(v('pp-wno-oy'))||0;
    if (v('pp-wangle') !== '') {
      const ang = parseFloat(v('pp-wangle')) * Math.PI / 180;
      const pts = wire.pts || [{x:wire.x1,y:wire.y1},{x:wire.x2,y:wire.y2}];
      const len = Math.hypot(pts[pts.length-1].x-pts[0].x, pts[pts.length-1].y-pts[0].y);
      wire.x2 = wire.x1 + Math.cos(ang)*len; wire.y2 = wire.y1 + Math.sin(ang)*len;
      wire.pts = [{x:wire.x1,y:wire.y1},{x:wire.x2,y:wire.y2}];
    }
    if (v('pp-lw')) wire.lineWidth = parseFloat(v('pp-lw'));
    if (v('pp-ls') !== undefined) wire.lineStyle = v('pp-ls') || undefined;
  } else if (el && ['fline','rect','circle','arc','triangle'].includes(el.type)) {
    delete el.color;  // 個別色は廃止（完全BYLAYER）。旧データの残骸をここで掃除する
    if (v('pp-lw')) el.lineWidth = parseFloat(v('pp-lw'));
    el.lineStyle = v('pp-ls') || undefined;
    if (el.type === 'fline') {
      if (v('pp-x1')!=='') { el.x1=parseFloat(v('pp-x1')); el.y1=parseFloat(v('pp-y1')); }
      if (v('pp-x2')!=='') { el.x2=parseFloat(v('pp-x2')); el.y2=parseFloat(v('pp-y2')); }
      if (v('pp-fangle')!=='') {
        const ang=parseFloat(v('pp-fangle'))*Math.PI/180;
        const len=parseFloat(v('pp-flen'))||Math.hypot(el.x2-el.x1,el.y2-el.y1);
        const base=v('pp-fbase');
        if (base==='p2') { el.x1=el.x2-Math.cos(ang)*len; el.y1=el.y2-Math.sin(ang)*len; }
        else             { el.x2=el.x1+Math.cos(ang)*len; el.y2=el.y1+Math.sin(ang)*len; }
      }
    } else if (el.type === 'arc') {
      if (v('pp-x1')!=='') { el.x=parseFloat(v('pp-x1')); el.y=parseFloat(v('pp-y1')); }
      if (v('pp-arcr')!=='') el.r=parseFloat(v('pp-arcr'));
      if (v('pp-arca1')!=='') el.startA=parseFloat(v('pp-arca1'))*Math.PI/180;
      if (v('pp-arca2')!=='') el.endA=parseFloat(v('pp-arca2'))*Math.PI/180;
    } else if (el.type === 'triangle') {
      if (v('pp-tx1')!=='') { el.x1=parseFloat(v('pp-tx1')); el.y1=parseFloat(v('pp-ty1')); }
      if (v('pp-tx2')!=='') { el.x2=parseFloat(v('pp-tx2')); el.y2=parseFloat(v('pp-ty2')); }
      if (v('pp-tx3')!=='') { el.x3=parseFloat(v('pp-tx3')); el.y3=parseFloat(v('pp-ty3')); }
      const trot=parseFloat(v('pp-triangle'))||0;
      if (trot!==0) {
        const rad=trot*Math.PI/180;
        const base=v('pp-tribase')||'p1';
        const bx=base==='p1'?el.x1:base==='p2'?el.x2:el.x3;
        const by=base==='p1'?el.y1:base==='p2'?el.y2:el.y3;
        const rot2=(x,y)=>({x:bx+(x-bx)*Math.cos(rad)-(y-by)*Math.sin(rad), y:by+(x-bx)*Math.sin(rad)+(y-by)*Math.cos(rad)});
        if (base!=='p1') { const p=rot2(el.x1,el.y1); el.x1=p.x; el.y1=p.y; }
        if (base!=='p2') { const p=rot2(el.x2,el.y2); el.x2=p.x; el.y2=p.y; }
        if (base!=='p3') { const p=rot2(el.x3,el.y3); el.x3=p.x; el.y3=p.y; }
      }
    } else if (el.type === 'rect') {
      if (v('pp-rx')!=='') { el.x=parseFloat(v('pp-rx')); el.y=parseFloat(v('pp-ry')); }
      if (v('pp-rw')!=='') { el.w=parseFloat(v('pp-rw')); el.h=parseFloat(v('pp-rh')); }
    }
    el.layer     = vLayer(el.layer);
    el.note      = v('pp-note');
  } else if (el) {
    el.label     = v('pp-label');
    el.labelAlign = v('pp-lalign') || undefined;
    el.partRef   = v('pp-partref');
    el.devHide   = !document.getElementById('pp-devhide')?.checked;
    el.panelZone = chk('pp-zone') ? '外' : undefined;
    el.partModel = v('pp-partmodel');
    { const pv = document.getElementById('pp-partvolt');
      if (pv) el.partVolt = pv.value || undefined; else applyDefaultVolt(el); }
    applyPartChoicesFromPanel(el);
    el.devFs     = parseInt(v('pp-dfs')) || undefined;
    el.devColor  = v('pp-dcolorcode') || v('pp-dcolor') || undefined;
    el.devOffX   = v('pp-dox') !== '' ? parseInt(v('pp-dox')) : undefined;
    el.devOffY   = v('pp-doy') !== '' ? parseInt(v('pp-doy')) : undefined;
    el.showModel = !!document.getElementById('pp-showmodel')?.checked;
    { const c = document.getElementById('pp-showspec');
      el.specHide = c ? !c.checked : el.specHide; }
    el.modelFs   = parseInt(v('pp-mfs')) || undefined;
    el.modelColor = v('pp-mcolorcode') || v('pp-mcolor') || undefined;
    el.modelOffX = v('pp-mox') !== '' ? parseInt(v('pp-mox')) : undefined;
    el.modelOffY = v('pp-moy') !== '' ? parseInt(v('pp-moy')) : undefined;
    el.terminals = v('pp-term');
    el.termFs    = parseInt(v('pp-tfs')) || undefined;
    { const t = _readTermOff(); if (t) el.termOff = t; else delete el.termOff; }
    el.showNote  = !!document.getElementById('pp-shownote')?.checked;
    el.noteFs    = parseInt(v('pp-nfs')) || undefined;
    el.noteColor = v('pp-ncolorcode') || v('pp-ncolor') || undefined;
    el.noteOffX  = v('pp-nox') !== '' ? parseInt(v('pp-nox')) : undefined;
    el.noteOffY  = v('pp-noy') !== '' ? parseInt(v('pp-noy')) : undefined;
    // クロスリファレンスの個別設定(CRタブがあるときだけ。空欄=自動)
    if (document.getElementById('pp-xshow')) {
      const xPrev = [el.xrefHide, el.xrefOffX, el.xrefOffY, el.xrefMul].join('|');
      el.xrefHide = document.getElementById('pp-xshow').checked ? undefined : true;
      const num = id => { const t = v(id); const n = parseFloat(t); return (t !== '' && Number.isFinite(n)) ? n : undefined; };
      el.xrefOffX = num('pp-xox');
      el.xrefOffY = num('pp-xoy');
      const m = num('pp-xmul'); el.xrefMul = (m > 0 && m <= 3) ? m : undefined;
      // CRタブを直したときだけ、表示中なら計算し直す(それ以外の編集では計算しない)
      if (state.showXref === true && xPrev !== [el.xrefHide, el.xrefOffX, el.xrefOffY, el.xrefMul].join('|')) xrefRefresh();
    }
    el.wireNo    = v('pp-wireno');
    // 回転系フィールド(pp-rot/pp-trot)は<input type=number>にmax指定が無いため、
    // スピナーの上矢印を連打すると際限なく増え続けてしまう不具合があった
    // (「無限に角度が増えている」、2026-08-17)。適用のたびに0-359へ正規化し、
    // 入力欄の表示値もその場で書き戻すことで、次のクリックからは正規化後の値を
    // 起点に90度刻みで回るようにする。
    const norm360 = (n) => ((n % 360) + 360) % 360;
    el.rot = norm360(parseInt(v('pp-rot')) || 0);
    const rotInput = document.getElementById('pp-rot');
    if (rotInput) rotInput.value = el.rot;
    // 【2026-10-04】倍率欄の値を実際に変えたときだけ、端子の間隔がグリッドの倍数になる倍率にそろえる(js/resize.js symScaleSnap)。
    // 他の欄を直して適用しただけなら、今の倍率をそのまま書き戻す(今の図面の倍率を勝手に変えない)
    {
      const scIn = document.getElementById('pp-scale');
      const want = Math.max(0.1, Math.min(5, parseFloat(v('pp-scale'))||1));
      const orig = scIn ? parseFloat(scIn.dataset.orig) : NaN;
      if (Number.isFinite(orig) && Math.abs(want - orig) < 1e-9) el.scale = orig;
      else {
        const sn = (typeof symScaleSnap === 'function') ? symScaleSnap(el, want) : null;
        el.scale = sn ? sn.scale : want;
        if (scIn) { scIn.value = el.scale; scIn.dataset.orig = el.scale; }
        const hint = document.getElementById('s-hint');
        if (hint && sn && Math.abs(sn.scale - want) > 1e-9) hint.textContent = `倍率を ${want} → ${sn.scale} にそろえました(端子の間隔 ${sn.pitch}。グリッドの倍数)。端子をグリッドに乗せるときは「基準点合わせ」`;
      }
    }
    delete el.color;  // 個別色は廃止（完全BYLAYER）。旧データの残骸をここで掃除する
    el.lineStyle  = v('pp-symls') || undefined;
    el.lineWidth  = v('pp-symlw') ? parseFloat(v('pp-symlw')) : undefined;
    el.labelColor = v('pp-lcolorcode') || v('pp-lcolor') || undefined;
    el.labelFs    = parseInt(v('pp-lfs'))||11;
    el.labelOffX  = parseInt(v('pp-lox'))||0;
    el.labelOffY  = v('pp-loy') ? parseInt(v('pp-loy')) : undefined;
    el.textRot    = norm360(parseInt(v('pp-trot')) || 0);
    const trotInput = document.getElementById('pp-trot');
    if (trotInput) trotInput.value = el.textRot;
    el.layer     = vLayer(el.layer);
    el.note      = v('pp-note');
  }
  // 型番・仕様・電圧・対象外などは、この記号だけでなくデバイスの全部の記号に入る(同じデバイスで値が違うことは無い)
  if (devBefore && typeof devCommitEl === 'function') devCommitEl(el, devBefore);
  draw();
}

// デバイス/型式/仕様の書式コピー・貼り付け(2026-08-03追加)。
// シンボルの種類(type)が変わっても、デバイス名・型番・文字サイズ/色/位置一式を
// まとめて他のシンボルへ複製できるようにする。1個コピー→複数選択へまとめて貼り付け、も可能。
//
// 【2026-08-23】端子(junction)にも同じ機能が必要という要望が出て、当初は
// 対象フィールドを絞った専用実装(JUNCTION_PROP_KEYS/copyJunctionProps/
// pasteJunctionProps)を別に用意した。しかし盛田さん「シンボルと同じにしろと
// 言ったはずだが？」の指示で、専用実装は撤廃してこの共通実装(DEVICE_PROP_KEYS/
// copyDeviceProps/pasteDeviceProps)を端子にもそのまま使うことにした。
//
// 【重要・項目(DEVICE_PROP_KEYS)自体は変更していない】盛田さんの指示は
// 「コピーの仕組みをシンボルと同じにしろ」であって「項目を変えろ」ではない
// (盛田さん「項目を変えろとは一言も言ってないぞ？」)。統一の過程で一度
// panelZoneをこの配列に追加してしまったが、これはシンボル側の既存の挙動まで
// 意図せず変えてしまう誤りだったため撤回した。DEVICE_PROP_KEYSは2026-08-03
// 時点の項目のまま、変更していない。
//
// labelフィールドは端子では「端子番号」を意味するため、端子どうしの貼り付けでは
// 全端子が同じ番号になる点は把握した上での判断(端子番号の重複は既存の
// 重複警告機能で検出できる)。この点は項目自体の話ではなく、シンボルと同じ
// 項目セットを使った結果として自然に生じる挙動。
// ================================================================
// プロパティ(右パネル)のタブ分け(2026-09-29)
//
// 盛田さん「先にプロパティ整理しろ、すでに項目が多くてスクロールになっている、折りたたみかタブ分けが必要」
// → 参考図を見て「タブでいい、タブで分けてコピー変える、今の一括コピーとタブコピーを作ってくれ」。
//
// シンボルの枠だけをタブに分ける(基本/端子/形/メモ)。入力欄のIDは変えていない。隠れているタブの欄も
// DOMには残るので、applyRightPanel は従来どおり全部の欄を読める(タブを切り替えても値は失われない)。
// 選んでいるタブは覚えておく(別のシンボルを選んでも同じタブのまま=同じ作業を続けやすい)。
//
// 【コピーは2種類】
//   一括コピー(パネルの一番上): 従来どおり DEVICE_PROP_KEYS(デバイス・型式・仕様・端子番号・文字設定)を丸ごと
//   タブコピー(各タブの上): そのタブの項目だけ。TAB_PROP_KEYS
// ================================================================
const RP_TABS = [
  { key: 'basic', label: '基本' },
  { key: 'term',  label: '端子' },
  { key: 'shape', label: '形' },
  { key: 'memo',  label: 'メモ' },
  { key: 'cr',    label: 'CR' },      // クロスリファレンスの個別設定。コイル・接点を選んだときだけ出る(js/xref.js)
];
// タブごとにコピーする項目(要素のプロパティ名)。線番(wireNo)は入れない(コピーすると同じ番号が重複するため)
const TAB_PROP_KEYS = {
  basic: [
    'partRef', 'devHide', 'showDev', 'devFs', 'devColor', 'devOffX', 'devOffY', 'panelZone',
    'partModel', 'partVolt', 'partPoles', 'partAmp', 'partChar', 'showModel', 'modelFs', 'modelColor', 'modelOffX', 'modelOffY',
    'label', 'labelAlign', 'labelColor', 'labelFs', 'labelOffX', 'labelOffY', 'specHide',
  ],
  term:  ['terminals', 'termOff', 'termFs'],
  shape: ['rot', 'textRot', 'scale', 'lineStyle', 'lineWidth', 'layer'],
  memo:  ['note', 'showNote', 'noteFs', 'noteColor', 'noteOffX', 'noteOffY'],
  cr:    ['xrefHide', 'xrefOffX', 'xrefOffY', 'xrefMul'],
};
const TAB_PROP_KEEP = ['layer'];      // コピー元に無くても貼り付け先から消さない項目
let tabClipboard = {};                // { タブ名: { 項目: 値 } }

// 選択中の要素が、どの登録シンボルか(名前と役割)。プロパティの一番上に1行で出す(逆引き)。
// 役割はシンボルの登録・端子編集で決めた種別(接点Ref用)。クロスリファレンスの対象かどうかもここで分かる。
function rpSymbolLabel(el) {
  if (!el) return '';
  const cS = (state.customSymbols || []).find(s => s.type === el.type);
  const name = (cS && (cS.name || cS.label)) || '';
  const roleName = { coil: 'コイル', contact_main: '主接点', contact_a: 'a接点', contact_b: 'b接点', tentative: '仮設定', sig_out: '送り矢印', sig_in: '受け矢印' };
  const role = symRole(el);
  const r = roleName[role] || (role ? role : '種別なし');
  if (!cS) return `(シンボル登録なし)／${r}`;   // 登録が消えた記号(図面に「登録なし」の印が出る)
  return `${name || '(名前なし)'}／${r}`;
}

// 逆引きの文字クリック → シンボル一覧を開き、そのシンボルまでスクロールして点滅させる。
// 配置モードは変えない(選択状態の .on は付けない。誤って配置モードに入らないため)。
function rpJumpToSymbol(type) {
  const fp = document.getElementById('sym-float');
  if (!fp) return false;
  if (fp.style.display === 'none' || fp.style.display === '') {
    const tab = Array.from(document.querySelectorAll('.lt')).find(e => /switchLTab\('sym'/.test(e.getAttribute('onclick') || ''));
    if (tab) switchLTab('sym', tab);
    else { fp.style.display = 'flex'; renderSymFloat(); }
  }
  const idx = (state.customSymbols || []).findIndex(s => s.type === type);
  const item = idx >= 0 ? document.querySelector(`.sym-item[data-symidx="${idx}"]`) : null;
  if (!item) { alert('このシンボルは登録一覧にありません(削除された可能性があります)'); return false; }
  if (item.scrollIntoView) item.scrollIntoView({ block: 'center' });
  item.classList.remove('sym-jump'); void item.offsetWidth; item.classList.add('sym-jump');
  setTimeout(() => item.classList.remove('sym-jump'), 1600);
  return true;
}

function rpTabsHeader(showCR) {
  return `<div class="rp-tabs">` + RP_TABS.filter(t => t.key !== 'cr' || showCR).map(t =>
    `<div class="rp-tab" data-tab="${t.key}" onclick="rpTab('${t.key}')">${t.label}</div>`).join('') + `</div>`;
}
function rpPaneOpen(tab) {
  const label = (RP_TABS.find(t => t.key === tab) || {}).label || '';
  return `<div class="rp-pane" data-tab="${tab}"><div class="rp-tabcopy">`
    + `<button onclick="copyTabProps('${tab}')" title="この「${label}」タブの項目だけをコピーします(他のタブの項目は運びません)">${label}をコピー</button>`
    + `<button onclick="pasteTabProps('${tab}')" title="コピーした「${label}」タブの項目を、選択中の要素(複数可)へ貼り付けます">貼り付け</button></div>`;
}
function rpPaneClose() { return `</div>`; }

function rpApplyTab() {
  const rp = document.getElementById('rp-body'); if (!rp) return;
  let cur = state.rpTab || 'basic';
  if (!rp.querySelector(`.rp-tab[data-tab="${cur}"]`)) cur = 'basic';   // CRタブが無い要素では「基本」に戻す
  rp.querySelectorAll('.rp-tab').forEach(e => e.classList.toggle('on', e.dataset.tab === cur));
  rp.querySelectorAll('.rp-pane').forEach(e => e.classList.toggle('on', e.dataset.tab === cur));
}
function rpTab(name) {
  state.rpTab = name;
  if (typeof rpApplyTab === 'function') rpApplyTab();
}

// CRタブの位置補正・サイズを空(自動)に戻す
function resetXrefAdjust() {
  ['pp-xox', 'pp-xoy', 'pp-xmul'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  applyRightPanel();
  draw();
}

function copyTabProps(tab) {
  const rp = document.getElementById('rp-body');
  const el = rp && rp._el;
  if (!el) { alert('コピー元の要素を1つ選択してください'); return; }
  applyRightPanel();   // パネルの未確定編集を先に反映してからコピーする(一括コピーと同じ)
  const clip = {};
  (TAB_PROP_KEYS[tab] || []).forEach(k => {
    if (el[k] === undefined) return;
    clip[k] = (k === 'termOff') ? el[k].map(o => [...o]) : el[k];
  });
  tabClipboard[tab] = clip;
  const label = (RP_TABS.find(t => t.key === tab) || {}).label || tab;
  const h = document.getElementById('s-hint');
  if (h) h.textContent = `「${label}」タブの項目をコピーしました`;
  updateRightPanel();
}
function pasteTabProps(tab) {
  const clip = tabClipboard[tab];
  const label = (RP_TABS.find(t => t.key === tab) || {}).label || tab;
  if (!clip) { alert(`先に「${label}をコピー」でコピーしてください`); return; }
  const rp = document.getElementById('rp-body');
  const targets = state.sel.els.size
    ? state.elements.filter(e => state.sel.els.has(e.id))
    : (rp && rp._el ? [rp._el] : []);
  if (!targets.length) { alert('貼り付け先の要素を選択してください'); return; }
  pushH();
  targets.forEach(el => {
    TAB_PROP_KEYS[tab].forEach(k => {
      if (clip[k] === undefined) { if (!TAB_PROP_KEEP.includes(k)) delete el[k]; return; }
      el[k] = (k === 'termOff') ? clip[k].map(o => [...o]) : clip[k];
    });
  });
  if (tab === 'basic' && typeof devSyncFromEl === 'function') targets.forEach(el => devSyncFromEl(el));   // デバイスの値とそろえる
  const h = document.getElementById('s-hint');
  if (h) h.textContent = `「${label}」タブの項目を ${targets.length}個に貼り付けました`;
  if (tab === 'cr' && state.showXref === true) xrefRefresh();
  draw();
  updateRightPanel();
}

const DEVICE_PROP_KEYS = [
  'label','labelAlign','labelColor','labelFs','labelOffX','labelOffY',
  'partRef','devHide','showDev','devFs','devColor','devOffX','devOffY',
  'partModel','partVolt','showModel','modelFs','modelColor','modelOffX','modelOffY',
  'textRot',
  // 【2026-09-22】盛田さん「端子番号も含めていい」の指示で追加。同じ形のシンボル
  // (リレー主接点3個並び等)を図面に何個も置くたびに、端子ごとの番号・位置補正・
  // 文字サイズをゼロから打ち直す/ずらす手間があったため。
  'terminals', 'termOff', 'termFs',
  // 【2026-09-24】「仕様を図面に表示」チェック。デバイス(devHide)・型式(showModel)の
  // 表示チェックは元から対象だったが、仕様だけ漏れていて、貼り付けのたびに
  // チェックを外し直す手間になっていた(盛田さん指摘)。
  'specHide',
  // 【2026-09-29】ブレーカ系の選択(極数・定格電流・動作特性)。盛田さん「仕様のコピーも忘れるなよ」。
  'partPoles', 'partAmp', 'partChar',
];

function copyDeviceProps() {
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  // 【2026-08-23】以前はel.type==='junction'を弾いて端子専用の別実装
  // (copyJunctionProps)を用意していたが、盛田さん「シンボルと同じにしろと
  // 言ったはずだが？」の指示で撤廃し、端子もこの関数をそのまま使う。
  if (!el) { alert('コピー元の要素を1つ選択してください'); return; }
  applyRightPanel(); // パネルの未確定編集を先に反映してからコピーする
  deviceClipboard = {};
  DEVICE_PROP_KEYS.forEach(k => {
    if (el[k] === undefined) return;
    // termOffは[x,y]の配列。参照をそのまま持たせると、貼り付け先どうしが
    // 同じ配列を共有してしまい、片方をいじると全部動く事故になる。複製する。
    deviceClipboard[k] = (k === 'termOff') ? el[k].map(o => [...o]) : el[k];
  });
  updateRightPanel();
}
function pasteDeviceProps() {
  if (!deviceClipboard) { alert('先に「一括コピー」でデバイス/型式/仕様をコピーしてください'); return; }
  // 【2026-08-23】端子(junction)も貼り付け対象に含める(上のcopyDevicePropsと同じ理由)。
  // labelフィールドは端子では「端子番号」を意味するため、端子どうしの貼り付けでは
  // 全端子が同じ番号になる。この点は把握した上で、盛田さんの指示どおりシンボルと
  // 完全に同じ挙動にする(端子番号の重複は既存の重複警告機能で検出できる)。
  const targets = state.sel.els.size
    ? state.elements.filter(e => state.sel.els.has(e.id))
    : (document.getElementById('rp-body')._el ? [document.getElementById('rp-body')._el] : []);
  if (!targets.length) { alert('貼り付け先の要素を選択してください'); return; }
  pushH();
  targets.forEach(el => {
    DEVICE_PROP_KEYS.forEach(k => {
      if (deviceClipboard[k] === undefined) { delete el[k]; return; }
      // 複数の貼り付け先が同じtermOff配列を共有しないよう、ここでも複製する。
      el[k] = (k === 'termOff') ? deviceClipboard[k].map(o => [...o]) : deviceClipboard[k];
    });
  });
  // 貼り付け先はコピー元のデバイスに加わる。デバイスの値とそろえる(js/devices.js)
  if (typeof devSyncFromEl === 'function') targets.forEach(el => devSyncFromEl(el));
  draw();
  updateRightPanel();
}

// 全寸法線に現在の設定を適用
function applyDimToAll() {
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  if (!el || el.type !== 'dim') return;
  applyRightPanel();
  const fs=el.dimFs, tx=el.dimTx, ty=el.dimTy, fixed=el.dimFixed, gap=el.gap, ext=el.ext;
  pushH();
  state.elements.filter(e => e.type==='dim').forEach(e => {
    e.dimFs=fs; e.dimTx=tx; e.dimTy=ty; e.dimFixed=fixed;
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
    gap:el.gap!=null?el.gap:null, ext:el.ext!=null?el.ext:null,
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
  el.dimFs=11; el.dimTx=0; el.dimTy=-8;
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
  // 画面下部・右端で見切れる場合は表示位置を補正する。
  // #ctxmenuを実際にクリッピングしているのは#main-row(overflow:hidden)。
  // #app全体だとリボン・ステータスバーの分だけ境界がずれるため、#main-rowの実境界と比較する。
  const pad = 4;
  const bound = document.getElementById('main-row')?.getBoundingClientRect()
    || document.getElementById('app')?.getBoundingClientRect()
    || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const rect = menu.getBoundingClientRect();
  let dx = 0, dy = 0;
  if (rect.right  > bound.right)  dx = bound.right  - rect.right  - pad;
  if (rect.bottom > bound.bottom) dy = bound.bottom - rect.bottom - pad;
  if (rect.left < bound.left) dx = bound.left - rect.left + pad;
  if (rect.top  < bound.top)  dy = bound.top  - rect.top  + pad;
  if (dx || dy) {
    menu.style.left = (cx + dx) + 'px';
    menu.style.top  = (cy + dy) + 'px';
  }
}

function hideCtx() { document.getElementById('ctxmenu').classList.remove('open'); }

document.addEventListener('click', e => { if (e.button === 0) hideCtx(); });

// ----------------------------------------------------------------
// ユーティリティ
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// フロートパネルの「×」とEsc(2026-10-04 盛田さん「全般閉じるが使いづらい」→ 案A「×は必ず出るように設計」)
//   ・どのパネルも openFP で開くときに右上へ「×」を差し込む(fpEnsureClose)。パネルの HTML に書かなくても必ず出る=新しく作ったパネルにも出る
//   ・「×」は中をスクロールしても上に残る(css .fp-x-wrap の sticky)
//   ・「×」とEscは、そのパネルの一番下の「閉じる」「キャンセル」ボタンを押したのと同じにする(部品の割り当ての取り消し等、ボタンの処理をそのまま通す)。
//     そのボタンが無いパネルは閉じるだけ
//   ・Escは一番手前(最後に開いた)パネルを閉じる。作図中の Esc(モードの取り消し)より先(js/edit.js の Escape)
// ----------------------------------------------------------------
const _fpStack = [];
function fpEnsureClose(el) {
  if (!el || el.querySelector(':scope > .fp-x-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'fp-x-wrap';
  const x = document.createElement('button');
  x.className = 'fp-x'; x.type = 'button'; x.title = '閉じる (Esc)'; x.textContent = '×';
  x.addEventListener('pointerdown', e => e.stopPropagation());   // タイトルのドラッグ移動を始めない
  x.addEventListener('click', e => { e.stopPropagation(); fpClose(el.id); });
  wrap.appendChild(x);
  el.insertBefore(wrap, el.firstChild);
}
// パネルの「閉じる」「キャンセル」ボタン(一番下にあるもの)。無ければ null
function fpCloseButton(el) {
  const bs = [...el.querySelectorAll('button:not(.fp-x)')].filter(b => /^(閉じる|キャンセル)$/.test((b.textContent || '').trim()));
  return bs.length ? bs[bs.length - 1] : null;
}
function fpClose(id) {
  const el = document.getElementById(id);
  if (!el || !el.classList.contains('open')) return false;
  const b = fpCloseButton(el);
  if (b) b.click(); else closeFP(id);
  if (el.classList.contains('open')) closeFP(id);   // ボタンが閉じなかったときも閉じる(×を押して閉じないことが無いように)
  return true;
}
// 一番手前のパネルを閉じる。閉じたら true
function fpCloseTop() {
  for (let i = _fpStack.length - 1; i >= 0; i--) {
    const el = document.getElementById(_fpStack[i]);
    if (el && el.classList.contains('open')) return fpClose(_fpStack[i]);
    _fpStack.splice(i, 1);
  }
  const any = [...document.querySelectorAll('.fp.open')].pop();
  return any ? fpClose(any.id) : false;
}
// 入力欄にカーソルがあると js/edit.js のキー処理は動かないので、パネルの中の入力欄からの Esc はここで閉じる
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest('.fp.open') && ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName)) { if (fpCloseTop()) e.preventDefault(); }
});

function openFP(id) {
  const el = document.getElementById(id); if (!el) return;
  fpEnsureClose(el);
  const k = _fpStack.indexOf(id); if (k >= 0) _fpStack.splice(k, 1);
  _fpStack.push(id);
  el.classList.add('open');
  // 【2026-09-29】タイトルをドラッグして動かした後(makeFpDraggable が transform:none・left/top を px で固定する)は、
  // 開き直しやタブ切替(帳票は切替のたびに openFP を呼ぶ)で top を中央寄せに戻さない。
  // 以前は動かした後でも top だけ「画面の真ん中」に戻したため、transform が無い状態で上端が画面の中央に来て、
  // 下半分が画面の外に出た(CSV出力・閉じるが押せない)。動かした後は今の位置を保ち、画面内に収まるよう寄せるだけにする。
  if (el.style.transform === 'none') {
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(0, Math.min(r.left, window.innerWidth  - r.width))  + 'px';
    el.style.top  = Math.max(0, Math.min(r.top,  window.innerHeight - r.height)) + 'px';
    return;
  }
  // 【2026-09-29】動かしていない最初の位置: リボンと、その下の「選択・配線」の行(#quickbar)に被らないよう、その下(キャンバスの領域)に置く
  // (盛田さん指摘。1366x768で上端がリボンの直下に食い込んでいた)。
  // 【2026-10-04】**上端はどのパネルも同じ位置**(キャンバス領域の上端から12px)。盛田さん「フロートパネルの出る高さがタブごとに変わるのはやめてくれ、
  // 外面に出すとき上部の位置は同じにしろ」。以前は高さの真ん中で合わせていた(translate(-50%,-50%))ので、帳票のタブや設定のタブで中身の高さが
  // 変わるたびに上端が上下した。今は横だけ中央(css .fp の translate(-50%,0))で、中身が増えると下に伸びる。下は下のバー(#page-bar)から8px空けた所まで(超えたら中でスクロール)
  const areaTop = document.getElementById('quickbar')?.getBoundingClientRect().bottom || 0;
  const barTop  = document.getElementById('page-bar')?.getBoundingClientRect().top || window.innerHeight;
  const top = areaTop + 12;
  el.style.top = top + 'px';
  el.style.maxHeight = Math.max(160, barTop - 8 - top) + 'px';
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
    partref:'シンボルをクリックでデバイスを割り当て（自動採番） | ESC終了',
    arc:      '半円: 端点1 → 端点2 → 膨らむ側 の順にクリック',
    arc3:     '弧: 始点 → 終点 → 通過点 の順にクリック',
    triangle: '三角形: 3点を順にクリック（3点目でShift＝正三角形）',
    bezier:   '曲線: クリックで点を追加 → Enterまたはダブルクリックで確定',
    dim:      '寸法: 測る1点目 → 2点目 → 引出位置 の順にクリック',
    angle_dim:'角度寸法: 頂点 → 1辺上の点 → もう1辺上の点 の順にクリック',
    leader:   '指示線: 指示先 → 折れ点 → 文字位置 の順にクリック',
    chain_dim:'連続寸法: 1点目 → 2点目 → 引出位置。以降クリックごとに連続追加 | Escで終了',
    junction: 'クリックで接続点を配置',
    guide_h:  'クリック位置に水平補助線を配置',
    guide_v:  'クリック位置に垂直補助線を配置',
    measure:  '測定: 1点目をクリック（図形は作成されません）',
  };
  const el = document.getElementById('s-hint');
  if (el) el.textContent = hints[state.mode] || '';
}

// ツール進行中の段階表示（ステータスバー右）
function setHint(msg) {
  const el = document.getElementById('s-hint');
  if (el) el.textContent = msg;
}

// ----------------------------------------------------------------
// ----------------------------------------------------------------
// 選択した図形・配線・シンボルの線幅を一括変更
// ----------------------------------------------------------------
// 図形・配線は el.lineWidth / wire.lineWidth に直接反映。
// シンボルは el.lineWidth を「シンボル線幅」の個別上書きとして使う
// (symbols.jsのdrawSymがこれを最優先で見る)ため、同じフィールド名で統一できる。
// 「レイヤー既定に戻す」を選んだ場合は el.lineWidth を削除し、
// シンボルは上書きなし(登録時の太さ)、図形・配線はレイヤー既定太さに戻る。
function bulkSetLineWidth(lwStr) {
  const lw = lwStr === '' ? undefined : parseFloat(lwStr);
  const els   = state.elements.filter(e => state.sel.els.has(e.id));
  const wires = state.wires.filter(w => state.sel.wires.has(w.id));
  if (!els.length && !wires.length) { alert('図形・配線・シンボルを選択してから実行してください。'); return; }
  pushH();
  els.forEach(e => { if (lw === undefined) delete e.lineWidth; else e.lineWidth = lw; });
  wires.forEach(w => { if (lw === undefined) delete w.lineWidth; else w.lineWidth = lw; });
  draw();
  alert(`${els.length + wires.length} 個の太さを変更しました。`);
}

// デバイス（partRef）表示は2026-08-07にトグル廃止・常時表示化(state.showPartRef=trueで固定)。
// togglePartRefDisp()/syncPartRefBtn()は削除。呼び出し元(edit.js)はtypeof関数チェック済みのため安全。

// 接続点の見た目(分岐点/端子○/端子◎)を選ぶと同時に配置モードに入る
function setJunctionStyle(style) {
  state.junctionStyle = style;
  // スタイルに応じた見やすいデフォルトサイズ(既にユーザーが変えていればそれを尊重)
  if (!state._junctionRTouched) {
    state.junctionR = (style === 'dot') ? 2 : 5;
  }
  setMode('junction'); // setModeが全rb-*の.onを一旦クリアするため、この後にsyncを呼ぶ
  syncJunctionStyleBtns();
}
function setJunctionSize(val) {
  const r = Math.max(1, parseFloat(val) || 2);
  state.junctionR = r;
  state._junctionRTouched = true; // 以後スタイル切替してもユーザー指定サイズを保持
}
function syncJunctionStyleBtns() {
  const sizeInput = document.getElementById('jst-size');
  if (sizeInput) sizeInput.value = state.junctionR || 2;
  const map = { dot:'rb-junction-dot', circle:'rb-junction-circle', dbl:'rb-junction-dbl' };
  Object.values(map).forEach(id => document.getElementById(id)?.classList.remove('on'));
  const activeId = map[state.junctionStyle || 'dot'];
  document.getElementById(activeId)?.classList.add('on');
}

// 【検証用/仮】端子(ピン)マーカー表示トグル
// 作図線の目印(橙の点線)の表示を切り替える。画面だけ・保存しない(draw.js drawFlineMarks)
function toggleFlineMarkDisp() {
  state.showFlineMark = !state.showFlineMark;
  const b = document.getElementById('qb-flines');
  if (b) {
    b.style.background = state.showFlineMark ? 'var(--acc)' : 'var(--bg)';
    b.style.color      = state.showFlineMark ? '#fff' : 'var(--fg)';
    b.style.fontWeight = state.showFlineMark ? '600' : '400';
  }
  draw();
}
function toggleSymPinsDisp() {
  state.showSymPins = !state.showSymPins;
  syncSymPinsBtn(); draw();
}
function syncSymPinsBtn() {
  const b = document.getElementById('qb-pins');
  if (!b) return;
  b.style.background = state.showSymPins ? 'var(--acc)' : 'var(--bg)';
  b.style.color      = state.showSymPins ? '#fff' : 'var(--fg)';
  b.style.fontWeight = state.showSymPins ? '600' : '400';
}

// シンボルの端子番号を図面に出すトグル(全体一括)。
// 【検証用/仮】の🔴端子(仮)と違い、これは図面の内容そのものなのでPDF・DXFにも出る。
// 番号ごとの位置は端子単位で補正できる(プロパティの「端子番号の位置」)。
function toggleTermNoDisp() {
  state.showTermNo = !state.showTermNo;
  syncTermNoBtn();
  draw();
  updateRightPanel();   // 位置補正欄は表示ONのときだけ出す
}
// コイルと接点の相互参照(js/xref.js)を図面に出す/隠す。前回値を覚える。
// **押したときだけ計算する**(js/xref.js の説明)。表示中に押すと隠して結果を捨てる。前回値は覚えない(起動時は必ずOFF)。
function toggleXrefDisp() {
  if (state.showXref !== true) { refreshXrefDisp(); return; }   // 表示ONにするときは「更新」と同じ(プロジェクトの図面も読み直す)
  xrefReset();
  syncXrefBtn();
  draw();
  updateRightPanel();   // CRタブの位置補正欄は表示ONのときだけ出す
}
// 「更新」: 図面を直したあとに、今の図面で計算し直して表示する(OFFなら表示ONにして計算)
async function refreshXrefDisp() {
  // 【2026-10-01】押したらすぐ色を変えて、今の図面(前に読んだ参照図面を含む)で出す。参照図面の読み直しはそのあと。
  // 以前は読み直しを待ってから色を変えていたので、押しても色がすぐ変わらず、待っている間にもう一度押すと
  // まだOFF扱いで再びONの処理が走り、色の変わり方がおかしくなった(盛田さん「クロスリファレンスタブの色変わりがおかしい」)
  state.showXref = true;
  xrefRefresh();
  syncXrefBtn();
  draw();
  updateRightPanel();
  if (typeof xprojReload === 'function') {
    let reloaded = false;
    try { reloaded = await xprojReload(); } catch (e) { console.warn('参照図面の読み直しに失敗', e); }
    if (state.showXref !== true) return;          // 読み直しの間に隠した(もう一度押した)なら、出し直さない
    if (reloaded) { xrefRefresh(); draw(); updateRightPanel(); }
  }
  if (typeof xprojCheckConflicts === 'function') xprojCheckConflicts();   // 別ファイルとデバイスの値が食い違っていれば、選ぶ画面
}
// 全体の文字サイズの倍率(0.3〜2)。前回値を覚える。範囲外・数字でなければ既定0.7に戻す。
function setXrefScale(v) {
  let n = parseFloat(v);
  if (!(n >= 0.3 && n <= 2)) n = 0.7;
  state.xrefScale = Math.round(n * 100) / 100;
  if (typeof stSetPref === 'function') stSetPref('xrefScale', state.xrefScale);
  if (state.showXref === true) xrefRefresh();   // 表示中なら、倍率を変えた結果をすぐ見せる
  syncXrefBtn();
  draw();
}
function syncXrefBtn() {
  document.getElementById('rb-xref')?.classList.toggle('on', state.showXref === true);
  const i = document.getElementById('xref-scale');
  if (i) i.value = state.xrefScale;
}
function syncTermNoBtn() {
  document.getElementById('rb-termno')?.classList.toggle('on', !!state.showTermNo);
}

function toggleDark() {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle('dk', state.darkMode);
  const lbl = document.getElementById('dk-label');
  if (lbl) lbl.textContent = state.darkMode ? 'ライト' : 'ダーク';
  draw();
}

// ----------------------------------------------------------------
// パネル表示切替
// ----------------------------------------------------------------
function toggleLeftPanel() {
  const lp = document.getElementById('lp');
  if (lp) lp.classList.toggle('hide');
  applyLpLayout();
  resize(); draw();
}

// ----------------------------------------------------------------
// 【2026-10-02】右パネル(プロパティ)の幅とキャンバスの範囲(UIレビューの「右プロパティ最優先」、盛田さん「右パネルから進めていい」)
//   ・以前は幅200px固定・position:fixed でキャンバスの上に重なり、**キャンバスの右200px分の図面がパネルの下に隠れていた**
//   ・今: キャンバスの右端をパネルの左端までにする(applyRpLayout。折りたたみ・非表示・大画面のときはキャンバスを全幅)
//   ・パネルの左端をドラッグで幅を変える(200〜700。画面の幅から300はキャンバスに残す)。幅は前回値を覚える(ecad_prefs の rpWidth)
//   ・中身(タブ・一括/タブごとのコピー)は変えていない
// ----------------------------------------------------------------
const RP_W_DEF = 200, RP_W_MIN = 200, RP_W_MAX = 700;
let _rpW = RP_W_DEF;
function rpClampWidth(w) {
  const max = Math.max(RP_W_MIN, Math.min(RP_W_MAX, (window.innerWidth || 1200) - 300));
  return Math.round(Math.max(RP_W_MIN, Math.min(max, +w || RP_W_DEF)));
}
function applyRpLayout() {
  const rp = document.getElementById('rp'), cw = document.getElementById('cw');
  if (!rp || !cw) return;
  _rpW = rpClampWidth(_rpW);
  rp.style.width = _rpW + 'px';
  const off = rp.classList.contains('collapsed') || rp.classList.contains('hide') || document.body.classList.contains('fullscreen');
  cw.style.marginRight = off ? '0' : _rpW + 'px';
}
function rpSetWidth(w, save) {
  _rpW = rpClampWidth(w);
  applyRpLayout();
  if (typeof resize === 'function') resize();
  if (typeof draw === 'function') draw();
  if (save && typeof stSetPref === 'function') stSetPref('rpWidth', _rpW);
}
function rpStartResize(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const bar = document.getElementById('rp-resizer');
  if (bar) bar.classList.add('on');
  const move = ev => rpSetWidth(window.innerWidth - ev.clientX, false);
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    if (bar) bar.classList.remove('on');
    if (typeof stSetPref === 'function') stSetPref('rpWidth', _rpW);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

let _rpAutoCollapsed = false; // 自動折りたたみ由来かどうか（手動操作を優先するため）
function toggleRightPanel(auto) {
  const rp = document.getElementById('rp');
  const btn = document.getElementById('rp-toggle');
  const expBtn = document.getElementById('rp-expand-btn');
  if (!rp) return;
  const collapsed = rp.classList.toggle('collapsed');
  if (btn) btn.textContent = collapsed ? '▶' : '◀';
  if (expBtn) expBtn.style.display = collapsed ? 'flex' : 'none';
  if (auto !== true) _rpAutoCollapsed = false; // 手動操作でフラグ解除
  applyRpLayout();   // キャンバスの右端をパネルに合わせる(折りたたんだらキャンバスを全幅に)
  resize(); draw();
}

// ウィンドウ幅に応じて自動折りたたみ（手動で閉じた場合は勝手に開かない）
window.addEventListener('resize', () => {
  const rp = document.getElementById('rp');
  if (!rp) return;
  const narrow = window.innerWidth < 700;
  const collapsed = rp.classList.contains('collapsed');
  if (narrow && !collapsed) { toggleRightPanel(true); _rpAutoCollapsed = true; }
  else if (!narrow && collapsed && _rpAutoCollapsed) { toggleRightPanel(true); _rpAutoCollapsed = false; }
});

function toggleExpand() {
  document.body.classList.toggle('fullscreen');
  const label = document.getElementById('exp-label');
  if (label) label.textContent = document.body.classList.contains('fullscreen') ? '元に戻す' : '大画面';
  applyRpLayout();
  resize(); draw();
}


// ----------------------------------------------------------------
// フローティングレイヤーパネル ドラッグ
// ----------------------------------------------------------------
let _lfOx = 0, _lfOy = 0;
function layFloatDown(e) {
  if (document.body.classList.contains('lp-docked')) return;   // 固定(ドッキング)中は動かさない
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
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
function initLayFloat() {}

// ----------------------------------------------------------------
// シンボルフローティングパネル
// ----------------------------------------------------------------
// 【2026-10-03 段階3】登録シンボルの保存先をブラウザの中(localStorage)からライブラリフォルダの
// symbols.json に移した。保存・読み込みは js/sym_store.js(saveSymbolsToStorage/loadSymbolsFromStorage は廃止)。
// ライブラリが読めていない間はブラウザの中に保存する(容量超過は知らせる。2026-09-01の教訓のまま)。

function exportCustomSymbols() {
  const json = JSON.stringify(state.customSymbols, null, 2);
  const a = document.createElement('a');
  a.href = 'data:application/json,' + encodeURIComponent(json);
  a.download = 'ecad_symbols.json';
  a.click();
}

function importCustomSymbols() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const syms = JSON.parse(ev.target.result);
        if (!Array.isArray(syms)) { alert('形式が正しくありません'); return; }
        const existing = new Set(state.customSymbols.map(s => s.type));
        const add = syms.filter(s => s && s.type && !existing.has(s.type));
        symStorePut(add).then(ok => { if (ok) alert(`${add.length}件のシンボルを読み込みました（同じものが既にある${syms.length - add.length}件は今のまま）`); });   // ライブラリへ(段階3)
      } catch(e) { alert('読み込みエラー'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function renderSymFloat() {
  const body = document.getElementById('sym-float-body');
  if (!body) return;
  // 標準シンボル(電源・受動素子・スイッチ・制御機器)は使用しないため一切表示しない。
  // カスタムシンボルのみを表示する。
  let html = '';
  if (state.customSymbols && state.customSymbols.length) {
    html += `<div style="font-size:9px;color:var(--fg3);font-weight:700;margin:2px 0 3px;text-transform:uppercase;letter-spacing:.06em">カスタム</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px">`;
    state.customSymbols.forEach((s, i) => {
      const img = s.preview ? `<img src="${s.preview}" style="width:64px;height:48px;object-fit:contain;background:#fff;border-radius:2px">` : `<svg width="36" height="28"></svg>`;
      const termCount = (s.terminals||[]).length;
      const wDisp = Math.round((s.w||0) * 10) / 10, hDisp = Math.round((s.h||0) * 10) / 10;
      html += `<div class="sym-item" draggable="true" data-symidx="${i}"
        onclick="pickSym(this,'${s.type}')"
        ondragstart="symDragStart(event,${i})" ondragover="symDragOver(event)" ondrop="symDrop(event,${i})" ondragend="symDragEnd(event)"
        onpointerdown="symRowPointerDown(event,${i})"
        style="flex-direction:column;align-items:center;padding:5px 3px;gap:2px;position:relative;cursor:grab">
        ${img}
        <span style="font-size:9px;text-align:center;line-height:1.2">${escH(s.label||s.type)}</span>
        <span style="font-size:8px;color:var(--fg3);line-height:1">${wDisp}×${hDisp}</span>
        <span onclick="event.stopPropagation();openPinEditor('${_escAttr(s.type)}')" title="端子(ピン)編集: ${termCount}点定義済み" style="position:absolute;top:2px;left:2px;font-size:9px;color:${termCount?'#0067c0':'var(--fg3)'};cursor:pointer">📍${termCount||''}</span>
        <span onclick="event.stopPropagation();rescaleCustomSym('${_escAttr(s.type)}')" title="サイズ調整: 比率を保って幅×高さを変更" style="position:absolute;top:2px;right:14px;font-size:9px;color:var(--fg3);cursor:pointer">⇔</span>
        <span onclick="event.stopPropagation();delCusSym('${_escAttr(s.type)}')" style="position:absolute;top:2px;right:2px;font-size:9px;color:var(--red);cursor:pointer">×</span>
      </div>`;
    });
    html += `</div>`;
  } else {
    html = `<p style="font-size:11px;color:var(--fg3);padding:4px">登録済みシンボルがありません</p>`;
  }
  body.innerHTML = html;
}

// ----------------------------------------------------------------
// 登録シンボル一覧の並べ替え(レイヤー一覧のドラッグ実装と同じ考え方)
// ----------------------------------------------------------------
let _symDragFrom = -1;
function symDragStart(e, i) {
  _symDragFrom = i;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.5';
}
function symDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function symDrop(e, toIdx) {
  e.preventDefault();
  if (_symDragFrom < 0 || _symDragFrom === toIdx) return;
  const moved = state.customSymbols.splice(_symDragFrom, 1)[0];
  state.customSymbols.splice(toIdx, 0, moved);
  _symDragFrom = -1;
  renderSymFloat();
  symStoreReorder();   // ライブラリの並びにする(段階3)
}
function symDragEnd(e) {
  e.currentTarget.style.opacity = '';
  _symDragFrom = -1;
}
function symRowPointerDown(e, i) {
  if (e.pointerType !== 'touch') return; // マウス/ペンは既存のdraggable DnDに任せる
  e.preventDefault();
  let dragIdx = i;
  let moved = false;
  const onMove = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const item = el && el.closest ? el.closest('[data-symidx]') : null;
    if (!item) return;
    const toIdx = parseInt(item.dataset.symidx, 10);
    if (isNaN(toIdx) || toIdx === dragIdx) return;
    moved = true;
    const m = state.customSymbols.splice(dragIdx, 1)[0];
    state.customSymbols.splice(toIdx, 0, m);
    dragIdx = toIdx;
    renderSymFloat();
  };
  const onUp = () => {
    if (moved) symStoreReorder();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ----------------------------------------------------------------
// 部品DBフローティングパネル
// ----------------------------------------------------------------
function renderPartsFloat() {
  _lastPartsQuery = '';
  const searchEl = document.getElementById('part-search2');
  if (searchEl) searchEl.value = '';
  // 中身の描画は renderPartsAll に任せる。ここで renderMakerTabs+renderPartsTable2 を
  // 直接呼ぶ形だと renderPartsAll と二重管理になり、片方だけ更新し忘れる
  // (2026-09-01: 件数表示を renderPartsAll に足したのに、パネルを開く経路は
  //  こちらを通るため表示されない、という不具合を実際に出した)
  renderPartsAll();
}
// メーカー別タブ(全て/三菱電機/...)。増える一方の部品DBを軸2つ(種別・メーカー)で
// 絞れるようにする(2026-08-17、種別グループ化だけでは「三菱だけ見たい」に対応できないため)。
state.partsMakerFilter = state.partsMakerFilter || '';
function renderMakerTabs() {
  const el = document.getElementById('parts-maker-tabs');
  if (!el) return;
  const makers = [...new Set(allParts().map(p => p.maker).filter(Boolean))].sort();
  if (makers.length <= 1) { el.innerHTML = ''; return; }
  // 【2026-10-03】「全て」ボタンは消した(盛田さん「分類が全ては全て出るんじゃないのか？」→案1)。
  // 段階4で、絞っていないときは★よく使う・最近使っただけを出す形にしたのに、「全て」が選ばれた見た目のまま
  // 全部は出ない、という矛盾になっていた。メーカーのボタンは押すとそのメーカーに絞り、もう一度押すと解除。
  const chip = val => `<span onclick="setPartsMakerFilter('${_escAttr(val)}')" title="${state.partsMakerFilter === val ? 'もう一度押すと解除' : 'このメーカーに絞る'}" style="font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;${
    state.partsMakerFilter === val ? 'background:var(--acc);color:#fff' : 'background:var(--bg3);color:var(--fg3);border:1px solid var(--bd2)'
  }">${escH(val)}</span>`;
  el.innerHTML = makers.map(chip).join('');
}
function setPartsMakerFilter(m) {
  state.partsMakerFilter = (state.partsMakerFilter === m) ? '' : m;   // 同じボタンをもう一度押したら解除
  renderMakerTabs();
  renderPartsTable2();
}
// 検索欄(型番・メーカー文字列)とメーカータブ、両方の絞り込みをまとめて適用する
let _lastPartsQuery = '';
// 【2026-10-03 再設計の段階4】部品DBはカタログの全件(数千〜数万件)になったので、全件をメーカー→種別の木で
// 並べるのをやめた(盛田さん「DBとしては全件持ってるのは普通だと思うが、CAD側で全件出るのはどうだろう」)。決定:
//   ・検索していないとき: ★よく使う(ライブラリの part_favorites.json。PC間で共通)と、最近使った(このPC)だけ
//   ・検索したとき: 当たったものを上限付きで
//   ・メーカーを選んだとき(検索していない): そのメーカーの部品を種別ごとの畳める見出しで、全件
//     (2026-10-03 盛田さん「三菱の中での分類はなくなったのか？」。上限100件で三菱505件の大半が出ていなかった)
//   ・選択中のシンボルの役割がコイル・接点なら、その役割を持つ種別だけに自動で絞る(解除できる。PART_ROLE_TYPES)
//   「この図面で使っている型式」の一覧は入れない(描き始めは型式が無く、型式は後半に決まるため)
const PARTS_LIST_LIMIT = 100;
const PART_RECENT_KEY = 'ecad_part_recent';
state.partsRoleFilterOff = state.partsRoleFilterOff || false;
function partRecentRefs() {
  try { const a = JSON.parse(localStorage.getItem(PART_RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function recordRecentPart(ref) {
  if (!ref) return;
  const a = [ref].concat(partRecentRefs().filter(r => r !== ref)).slice(0, 20);
  try { localStorage.setItem(PART_RECENT_KEY, JSON.stringify(a)); } catch (e) {}
}
function partFavs() { return (typeof ecadLib !== 'undefined') ? ecadLib.get('partfavs') : {}; }
async function toggleFavPart(ref) {
  const cur = Object.assign({}, partFavs());
  if (cur[ref]) delete cur[ref]; else cur[ref] = { at: Date.now() };
  const r = await ecadLib.save('partfavs', cur);
  if (!r.ok) { alert(r.error); return; }
  renderPartsTable2();
}
// 役割ごとに、その役割を持つ部品の種別。
// 【2026-10-03】接点を足した(盛田さん「接点の絞り込みも足して」)。カタログ636件の端子欄のグループで裏を取った:
//   主接点: 端子欄に「主接点」グループがある種別 = ブレーカ・電磁接触器・電磁開閉器
//   a/b接点: 接点のグループがある種別(電磁接触器・電磁開閉器の「補助」「サーマル接点」、リレーの「接点1〜4」、
//     タイマの「限時接点・瞬時接点」)と、部品そのものが接点のスイッチ類(押釦・セレクタ・レバー・接点ブロック・サーマル)
//   ブレーカ: 補助接点(AX・AL)の端子データはカタログに無いが、盛田さん「ブレーカの補助接点も入れて」で a/b接点にも入れた
//   PLC・インバータ・サーボ・HMI・ランプ等は入れない。外れていたら「解除」で全部出る
const PART_ROLE_TYPES = {
  coil:         { types: COIL_VOLT_TYPES, label: 'コイル' },
  contact_main: { types: ['breaker', 'contactor', 'starter'], label: '主接点' },
  contact_a:    { types: ['contactor', 'starter', 'coil', 'timer', 'thermal', 'breaker', 'pb', 'pb_lamp', 'pb_estop',
                          'selector', 'selector_key', 'selector_lamp', 'selector_pb', 'lever', 'contact_unit'], label: '接点' },
};
PART_ROLE_TYPES.contact_b = PART_ROLE_TYPES.contact_a;
// 選択中のシンボルの役割が揃っていれば、その役割を持つ種別だけに絞る({types, label})
function partsRoleFilter() {
  if (state.partsRoleFilterOff) return null;
  const sel = state.elements.filter(e => state.sel.els.has(e.id) && e.type !== 'junction');
  if (!sel.length) return null;
  const roles = [...new Set(sel.map(e => (typeof symTermRole === 'function') ? symTermRole(e) : ''))];
  return roles.length === 1 ? (PART_ROLE_TYPES[roles[0]] || null) : null;
}
function setPartsRoleFilterOff(v) { state.partsRoleFilterOff = !!v; renderPartsTable2(); }
// メーカーを選んだときの種別の見出しの開閉(既定は畳む。キーは「メーカー\u0000種別」。再読み込みで戻る)
state.partsTypeOpen = state.partsTypeOpen || {};
function togglePartsType(maker, type) {
  const k = maker + '\u0000' + type;
  state.partsTypeOpen[k] = !state.partsTypeOpen[k];
  renderPartsTable2();
}

function renderPartsTable2() {
  const el = document.getElementById('parts-table2');
  if (!el) return;
  const all = allParts();
  const q = (_lastPartsQuery || '').trim().toLowerCase();
  const maker = state.partsMakerFilter;
  const roleF = partsRoleFilter();
  const roleTypes = roleF ? roleF.types : null;
  const favs = partFavs();
  const fits = p => !roleTypes || roleTypes.includes(p.type);

  const cardHtml = p => `
    <div style="padding:4px 3px;border-bottom:1px solid var(--bg4);cursor:pointer" title="選択中のシンボルにこの部品を割り当てます（型番・端子番号・コイル電圧）" onclick="placePart('${_escAttr(p.type)}','${_escAttr(p.ref)}','${_escAttr(p.terminals||'')}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;font-weight:600;color:var(--fg)">${escH(p.ref)}</span>
        <span onclick="event.stopPropagation();toggleFavPart('${_escAttr(p.ref)}')" title="${favs[p.ref] ? 'よく使うから外す' : 'よく使うに入れる(どのPCでも出ます)'}" style="cursor:pointer;font-size:12px;color:${favs[p.ref] ? '#e0a800' : 'var(--fg3)'}">${favs[p.ref] ? '★' : '☆'}</span>
      </div>
      <div style="font-size:10px;color:var(--fg3)">${escH(p.maker)} ${escH(PART_TYPE_LABELS[p.type] || p.type || '')} ${escH(p.volt||'')} ${escH(p.amp||'')}</div>
      ${p.contacts?`<div style="font-size:10px;color:var(--acc)">接点:${escH(p.contacts)}</div>`:''}
      ${p.source?`<div style="font-size:9px;color:var(--fg3)" title="出典">📖 ${
        /^https?:\/\//.test(p.catalogUrl||'')
          ? `<a href="${escH(p.catalogUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--acc)" title="カタログのページを開く">${escH(p.source)}</a>`
          : escH(p.source)
      }</div>`:''}
      ${p.outlineDxf
        ? `<div style="font-size:9px;color:var(--acc)">外形図: ${escH(p.outlineDxfName||'あり')} <span onclick="event.stopPropagation();placePartOutline('${_escAttr(p.ref)}')" style="cursor:pointer;text-decoration:underline">配置</span></div>`
        : ''}
    </div>`;
  const head = t => `<div style="font-size:10px;color:var(--fg2);font-weight:600;margin:6px 0 2px;padding:2px 4px;background:var(--bg3);border-radius:3px">${t}</div>`;
  const note = t => `<div style="font-size:10px;color:var(--fg3);padding:4px">${t}</div>`;

  let html = roleTypes
    ? `<div style="font-size:10px;color:var(--acc);padding:2px 4px">選択中のシンボルが${roleF.label}なので、${roleF.label}を持つ種別だけ出しています <a href="javascript:void(0)" onclick="setPartsRoleFilterOff(true)" style="color:var(--acc)">解除</a></div>`
    : (state.partsRoleFilterOff ? `<div style="font-size:10px;color:var(--fg3);padding:2px 4px">種別の自動の絞り込みを解除中 <a href="javascript:void(0)" onclick="setPartsRoleFilterOff(false)" style="color:var(--acc)">戻す</a></div>` : '');
  if (!q && !maker) {
    const byRef = new Map(all.map(p => [p.ref, p]));
    const favList = Object.keys(favs).map(r => byRef.get(r)).filter(Boolean).filter(fits);
    const recList = partRecentRefs().map(r => byRef.get(r)).filter(Boolean).filter(fits);
    html += head(`★ よく使う（${favList.length}）`)
      + (favList.length ? favList.map(cardHtml).join('') : note('部品の ☆ を押すと、ここに出ます（ライブラリに入るので、どのPCでも出ます）'));
    html += head(`最近使った（${recList.length}）`)
      + (recList.length ? recList.map(cardHtml).join('') : note('割り当てた部品が、ここに出ます（このPCだけ）'));
    html += note(`ほかの部品は、上の欄で型番・メーカーを検索するか、メーカーを選んでください（全${all.length}件）`);
  } else if (maker && !q) {
    // メーカーを選んだ(検索していない): 種別ごとの見出し(件数付き・畳める)で全件
    const mine = all.filter(p => p.maker === maker && fits(p));
    const groups = {};
    mine.forEach(p => { (groups[p.type || ''] = groups[p.type || ''] || []).push(p); });
    const order = PART_TYPE_ORDER.filter(t => groups[t]).concat(Object.keys(groups).filter(t => !PART_TYPE_ORDER.includes(t)));
    html += head(`${escH(maker)}（${mine.length}件）`);
    html += order.map(t => {
      const open = !!state.partsTypeOpen[maker + '\u0000' + t];
      const label = PART_TYPE_LABELS[t] || ((typeof LEGACY_PART_TYPES !== 'undefined' && LEGACY_PART_TYPES[t]) ? `${LEGACY_PART_TYPES[t]}（要再分類）` : (t || '(種別未設定)'));
      return `<div onclick="togglePartsType('${_escAttr(maker)}','${_escAttr(t)}')" style="display:flex;justify-content:space-between;align-items:center;padding:4px;cursor:pointer;background:var(--bg2);border-radius:3px;margin-top:3px">
          <span style="font-size:10px;color:var(--fg2)">${escH(label)}（${groups[t].length}）</span>
          <span style="font-size:9px;color:var(--fg3)">${open ? '▼' : '▶'}</span>
        </div>` + (open ? groups[t].map(cardHtml).join('') : '');
    }).join('') || note('当たる部品がありません');
  } else {
    const hits = all.filter(p => (!maker || p.maker === maker) && fits(p)
      && (!q || [p.ref, p.maker, p.note, p.type, PART_TYPE_LABELS[p.type]].some(v => String(v || '').toLowerCase().includes(q))));
    // 型番の前方一致を先に
    if (q) hits.sort((a, b) => (String(b.ref).toLowerCase().startsWith(q) ? 1 : 0) - (String(a.ref).toLowerCase().startsWith(q) ? 1 : 0));
    html += head(`検索結果（${hits.length}件${hits.length > PARTS_LIST_LIMIT ? `・上位${PARTS_LIST_LIMIT}件を表示。絞り込んでください` : ''}）`)
      + (hits.length ? hits.slice(0, PARTS_LIST_LIMIT).map(cardHtml).join('') : note('当たる部品がありません'));
  }
  el.innerHTML = html;
}
function filterParts(q) {
  _lastPartsQuery = q || '';
  renderPartsTable2();
}

// ----------------------------------------------------------------
// シンボル・部品DBパネル ドラッグ
// ----------------------------------------------------------------
function _makeFloatDrag(panelId) {
  let ox = 0, oy = 0;
  return function(e) {
    if (document.body.classList.contains('lp-docked')) return;   // 固定(ドッキング)中は動かさない
    if (e.target.tagName === 'BUTTON' || e.target.onclick || e.target.tagName === 'INPUT') return;
    e.preventDefault(); e.stopPropagation();
    const p = document.getElementById(panelId);
    const r = p.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    function onMove(ev) { p.style.left=(ev.clientX-ox)+'px'; p.style.top=(ev.clientY-oy)+'px'; }
    function onUp() { window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp); window.removeEventListener('pointercancel',onUp); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
}
function symFloatDown(e) { _makeFloatDrag('sym-float')(e); }
function prtFloatDown(e) { _makeFloatDrag('prt-float')(e); }
function prjFloatDown(e) { _makeFloatDrag('prj-float')(e); }

// ----------------------------------------------------------------
// 標準シンボルの表示/非表示管理
// ----------------------------------------------------------------


// ----------------------------------------------------------------
// フローティングパネル(.fp)をタイトル(h3)ドラッグで移動可能に
// ----------------------------------------------------------------
function makeFpDraggable() {
  document.querySelectorAll('.fp').forEach(fp => {
    const handle = fp.querySelector('h3');
    if (!handle || handle._fpDrag) return;
    handle._fpDrag = true;
    handle.style.cursor = 'move';
    handle.title = 'ドラッグで移動';
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('button,input,select,[onclick]')) return;
      e.preventDefault();
      const r = fp.getBoundingClientRect();
      // transform中央寄せ・right固定をやめて絶対座標に切替
      fp.style.transform = 'none';
      fp.style.left = r.left + 'px';
      fp.style.top = r.top + 'px';
      fp.style.right = 'auto';
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = ev => {
        fp.style.left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - ox)) + 'px';
        fp.style.top  = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - oy)) + 'px';
      };
      const up = () => {
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
      };
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
  });
}
makeFpDraggable();

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['ui.js'] = 1;
