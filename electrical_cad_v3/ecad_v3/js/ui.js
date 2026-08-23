// ================================================================
// ui.js — UI操作（state参照版）
// ================================================================

// デバイス/型式/仕様の「書式コピー」用クリップボード(2026-08-03追加)。
// 同じ役割の機器(例:CR1)を、形の違う複数のシンボル(a接点/b接点等)に配置し直すたびに
// デバイス名・型番・文字サイズ/位置を全部手打ちし直すのが非効率、という指摘への対応。
// シンボルの種類(type)に関係なく、この一式だけをコピー→他のシンボルへまとめて貼り付けできる。
let deviceClipboard = null;
// 端子(junction)専用のコピー貼付け用クリップボード(2026-08-23)。
// deviceClipboardと別にする理由: 対象フィールドが違う(デバイス識別情報を
// 含まない)ため、混同すると意図しないフィールドが貼り付けられる事故になる。
let junctionClipboard = null;

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
    document.documentElement.style.setProperty('--ribbon-h', rb.offsetHeight + 'px');
  });
}
window.addEventListener('resize', syncRibbonHeight);

function switchLTab(name, el) {
  const panelMap = { sym:'sym-float', lay:'lay-float', prt:'prt-float' };
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
  } else {
    // 既に開いていたタブを再クリック → 閉じる
    fp.style.display = 'none';
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
        <td style="padding:4px 4px" onclick="event.stopPropagation()">
          <input type="text" placeholder="属性（例:200V）" value="${l.attr||''}"
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
      `<option value="${l.name}" ${l.name===activeName?'selected':''}>${l.name}</option>`
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
  recordRecentSym(type);
  updateHint();
}

// 内蔵シンボルの使用履歴（最大6件・シンボルパネル最上部に表示）
function recordRecentSym(type) {
  if (typeof BUILTIN_SYMS === 'undefined' || !BUILTIN_SYMS.some(s => s.type === type)) return;
  let rec = [];
  try { rec = JSON.parse(localStorage.getItem('recentBuiltinSyms') || '[]'); } catch(e) {}
  const i = rec.indexOf(type);
  if (i >= 0) rec.splice(i, 1);
  rec.unshift(type);
  if (rec.length > 6) rec.length = 6;
  try { localStorage.setItem('recentBuiltinSyms', JSON.stringify(rec)); } catch(e) {}
  const float = document.getElementById('sym-float');
  if (float && float.style.display === 'flex') renderSymFloat();
}

// ----------------------------------------------------------------
// 部品DB
// ----------------------------------------------------------------
function allParts() {
  const hidden = new Set(state.hiddenBuiltinRefs || []);
  return [
    ...BUILTIN_PARTS.filter(p => !hidden.has(p.ref)),
    ...state.customParts.map(p => ({ ...p, custom:true })),
  ];
}
function renderPartsAll()  { renderMakerTabs(); renderPartsTable2(applyPartsFilters()); }
// filterParts は下で定義
// 標準部品(BUILTIN_PARTS)を一覧から非表示にする（コード埋め込みのため削除は不可、非表示扱いのみ）
function hideBuiltinPart(ref) {
  if (!confirm(`標準部品「${ref}」を一覧から非表示にしますか？（後で復元できます）`)) return;
  state.hiddenBuiltinRefs = state.hiddenBuiltinRefs || [];
  if (!state.hiddenBuiltinRefs.includes(ref)) state.hiddenBuiltinRefs.push(ref);
  renderPartsAll();
  partsDb.scheduleSave();
}
function unhideBuiltinPart(ref) {
  state.hiddenBuiltinRefs = (state.hiddenBuiltinRefs || []).filter(r => r !== ref);
  renderPartsAll();
  partsDb.scheduleSave();
  showHiddenBuiltinParts(); // 一覧を再表示して更新
}
// 非表示にした標準部品の一覧をアラートではなくパネルで表示・復元できるようにする
function showHiddenBuiltinParts() {
  const refs = state.hiddenBuiltinRefs || [];
  showPartReg();
  // 2026-08-17: 旧カタログ型式検索パネル撤去時に "cs-result" 要素ごと消えてしまい、
  // このボタンが無反応になっていた不具合を修正。専用のhidden-parts-resultを使う。
  const resultEl = document.getElementById('hidden-parts-result');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = refs.length
    ? refs.map(ref => `<div style="display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--bg4);padding:2px 0">
        <span>${ref}</span>
        <span onclick="unhideBuiltinPart('${ref}')" style="color:var(--acc);cursor:pointer;text-decoration:underline">再表示する</span>
      </div>`).join('')
    : '非表示の標準部品はありません。';
}
function deletePart(ref) {
  if (!confirm(`「${ref}」を削除しますか？`)) return;
  state.customParts = state.customParts.filter(p => p.ref !== ref);
  renderPartsAll();
  partsDb.scheduleSave();
}
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
  return s.split('/').map(part => {
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

// 選択中のシンボルの端子点の数を返す（グループ自動判定に使う）。
// カスタムシンボル以外・端子未設定は0。
function symTerminalCount(el) {
  if (!el) return 0;
  const cS = (state.customSymbols || []).find(s => s.type === el.type);
  return (cS && cS.terminals) ? cS.terminals.length : 0;
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
function askTerminalGroup(type, ref, groups) {
  _pendingAssign = { type, ref, groups };
  const box = document.getElementById('tg-list');
  if (!box) {   // パネルが無い環境では先頭グループで進める（安全側）
    applyPartAssign(0);
    return;
  }
  document.getElementById('tg-ref').textContent = ref;
  box.innerHTML = groups.map((g, i) =>
    `<button class="fp-btn" style="display:block;width:100%;text-align:left;margin-bottom:4px"
       onclick="applyPartAssign(${i})">${g.name || '(名前なし)'}　<span style="color:var(--fg3)">${g.list.join(',')}</span></button>`
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
  const groups = parseTerminalGroups(terminals);
  if (groups.length <= 1) {
    doPlacePart(type, ref, groups.length ? groups[0].list.join(',') : '', '');
    return;
  }
  // 選択中シンボルの端子点数（複数選択時は全部同じ数のときだけ自動判定に使う）
  const counts = [...new Set(targets.map(symTerminalCount))];
  const g = counts.length === 1 ? pickTerminalGroup(groups, counts[0]) : null;
  if (g) doPlacePart(type, ref, g.list.join(','), g.name);
  else askTerminalGroup(type, ref, groups);
}

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
  targets.forEach(el => {
    el.partModel = ref;
    if (terminals) el.terminals = terminals;
    applyDefaultVolt(el);          // AC200V優先で代表値を入れる
    // 仕様欄に主要項目（電圧・電流・接点構成）を入れる。
    // 図面には「AC100V」のように1つだけ書くので、電圧は選択肢の羅列ではなく
    // 選ばれた1つを入れる。要らない行はその場で消してもらう前提。
    // 備考・出典は長すぎて図面に出すものではないので入れない。
    // 【重要】既に仕様欄に何か入っている場合は一切上書きしない（手書き内容の保護）。
    if (p) {
      if ((el.label || '').trim()) {
        labelSkipped++;
      } else {
        const lines = [el.partVolt || '', p.amp || '', p.contacts || '']
          .map(x => String(x).trim())
          .filter(x => x && x !== '-');
        if (lines.length) { el.label = lines.join('\n'); labelFilled++; }
      }
    }
  });
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
// 既存のカスタム部品を登録フォームに読み込んで編集できるようにする(2026-08-17)。
// 従来は同じ型番で全項目を打ち直すか削除して作り直すしかなく不便だった。
// 保存時(saveCusPart)は型番一致で上書きするので、ここでは値を詰めるだけでよい。
function editPart(ref) {
  const p = state.customParts.find(x => x.ref === ref);
  if (!p) { alert('編集対象が見つかりません（標準部品は編集できません）'); return; }
  showPartReg();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('pr-name', p.name || p.ref);
  set('pr-maker', p.maker);
  set('pr-ref', p.ref);
  set('pr-type', p.type);
  set('pr-volt', p.volt);
  set('pr-amp', p.amp);
  set('pr-term', p.terminals);
  set('pr-contacts', p.contacts);
  set('pr-note', p.note);
  set('pr-source', p.source);
  const statusEl = document.getElementById('pr-outline-status');
  if (statusEl) statusEl.textContent = p.outlineDxf ? `外形図: ${p.outlineDxfName || 'あり'}(保持されます)` : '';
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
  return `<div class="pp-row"><label>コイル電圧</label><select id="pp-partvolt">`
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
}

// ----------------------------------------------------------------
// デバイス記号の候補と引き継ぎ（2026-08-21）
//
// MC1のようなデバイスは主接点・コイル・補助接点と図面上の複数箇所に置かれる。
// 2つ目以降で型番・仕様を打ち直すのは手間なので、既にあるデバイスを候補から
// 選ぶだけで型番・仕様・端子番号が引き継がれるようにする。
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
    const cur = map.get(ref) || { model:'', spec:'', terminals:'', volt:'', zone:'' };
    // 端子台(junction)の label は「端子番号」で、シンボルの label(仕様)とは別物。
    // ここで拾ってしまうと、TB1の端子番号「1」がデバイスTB1の仕様として扱われ、
    // デバイス引き継ぎで他の端子へ番号がコピーされて全部同じ番号になる。
    const isJunction = src.type === 'junction';
    if (!cur.model     && src.partModel)             cur.model     = src.partModel;
    if (!cur.spec      && src.label && !isJunction)  cur.spec      = src.label;
    if (!cur.terminals && src.terminals)             cur.terminals = src.terminals;
    if (!cur.volt      && src.partVolt)              cur.volt      = src.partVolt;
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
  let n = 0;
  (state.pages || [{ elements: state.elements }]).forEach(pg => {
    (pg.elements || []).forEach(e => {
      if (e.type === 'junction' && (e.partRef || '').trim() === ref && e !== el) {
        e.partModel = model; n++;
      }
    });
  });
  if (n) console.log(`[端子台] ${ref} の端子 ${n} 個に型式「${model}」を反映`);
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

// デバイスを選び直したら、そのデバイスの型番・仕様・端子番号を引き継ぐ。
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
  if (info.terminals) { el.terminals = info.terminals; setVal('pp-term',      info.terminals); }
  if (info.volt)      { el.partVolt  = info.volt; }
  if (info.zone)      { el.panelZone = info.zone;
                        const _z = document.getElementById('pp-zone');
                        if (_z) _z.checked = (info.zone === '外'); }
  el.partRef = ref;

  // コイル電圧は型番によって選択肢が変わるので、欄ごと作り直してから値を入れる
  onPartModelChanged();
  const pv = document.getElementById('pp-partvolt');
  if (pv && info.volt) pv.value = info.volt;

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
        <input type="number" id="gp-devfs" value="${g.devFs||11}" step="1" min="6" max="32"></div>
      <div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
        <input type="color" id="gp-devcolor" value="${g.devColor||'#333333'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('gp-devcolor','gp-devcolorcode')">
        <input type="text" id="gp-devcolorcode" value="${g.devColor||'#333333'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('gp-devcolorcode','gp-devcolor')">
        ${colorCodeBtns('gp-devcolorcode','gp-devcolor')}</div></div>
      <div class="pp-row"><label>位置X補正</label>
        <input type="number" id="gp-devox" value="${g.devOffX!==undefined?g.devOffX:''}" placeholder="自動" step="5"></div>
      <div class="pp-row"><label>位置Y補正</label>
        <input type="number" id="gp-devoy" value="${g.devOffY!==undefined?g.devOffY:''}" placeholder="自動" step="5"></div>
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
  g.partRef   = val('gp-partref')   || undefined;
  g.partModel = val('gp-partmodel') || undefined;
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
    return `<option value="${v}"${c === v ? ' selected' : ''}>${lbl}</option>`;
  }).join('');
}

function showPartReg() {
  openFP('part-reg-p');
  refreshPendingCsvList();
  catalogRefreshStatus();
}

// ----------------------------------------------------------------
// カタログDB検索(2026-08-20)
//
// Google Drive上のメーカー別CSVから作ったSQLiteを、server.py経由で検索する。
// 選んだ型番だけを部品DBに追加する = カタログ全数を部品DBに流し込まない。
//
// 【重要】カタログDBが無い環境(外部PC等)でもCADは普通に使えること。
// APIが available:false を返したら、この欄を無効化して案内を出すだけにする。
// ----------------------------------------------------------------
let _catalogResults = [];

async function catalogRefreshStatus() {
  const st = document.getElementById('cat-status');
  const setup = document.getElementById('cat-setup');
  const chg = document.getElementById('cat-change-wrap');
  if (!st) return;
  st.style.whiteSpace = 'pre-line';  // 現在のフォルダを2行目に出すため
  try {
    const res = await fetch('/api/catalog/stats');
    const d = await res.json();
    if (!d.available) {
      st.textContent = 'カタログDB機能は未導入です（CADの他の機能には影響しません）';
      if (setup) setup.style.display = 'none';
      if (chg) chg.style.display = 'none';
      return;
    }
    if (!d.configured) {
      if (d.built && d.count) {
        st.textContent = `前回取り込んだ ${d.count}件で検索できます`
          + `（最新のCSVを反映するには「再取込」を押してください）`;
      } else {
        st.textContent = 'カタログDBフォルダが未選択です。下の「フォルダの選択」から選んでください';
      }
      if (setup) setup.style.display = 'block';
      if (chg) chg.style.display = 'none';
      _catShowPickStatus();
      return;
    }
    // 設定済み。設定欄は畳んでおくが、選び直せるようにボタンは常に出す
    if (setup) setup.style.display = 'none';
    if (chg) chg.style.display = 'block';
    const makers = (d.makers || []).map(m => `${m.maker} ${m.count}`).join(' / ');
    const label = d.source_label ? `${d.source_label} — ` : '';
    st.textContent = `${label}登録 ${d.count}件（CSV ${d.csv_files.length}個）`
      + `${makers ? '\n' + makers : ''}`;
  } catch (e) {
    st.textContent = 'サーバーが応答しません（start.batを最新版で起動してください）';
    if (setup) setup.style.display = 'none';
    if (chg) chg.style.display = 'none';
  }
}

// 設定済みでも設定欄を開けるようにする(フォルダ変更・自動検出の確認用)
function catalogShowSetup() {
  const setup = document.getElementById('cat-setup');
  if (!setup) return;
  const show = setup.style.display === 'none';
  setup.style.display = show ? 'block' : 'none';
  if (show) _catShowPickStatus();
}

// 設定欄を開いたとき、選択済みフォルダ名を表示する
async function _catShowPickStatus() {
  const pick = document.getElementById('cat-pick-status');
  if (!pick) return;
  const handle = await _catLoadHandle();
  pick.textContent = handle ? `選択中: ${handle.name}` : 'フォルダが選択されていません';
}

// --- フォルダ選択(File System Access API) ---
// 部品DB(parts_db.js)と同じ方式。Windowsのフォルダ選択ダイアログが開く。
// このAPIはセキュリティ上フォルダの絶対パスをJSに渡さないため、
// パスではなくCSVの「中身」を読んでサーバーに送り、取り込んでもらう。
// フォルダのハンドルはIndexedDBに保存するので、次回以降は選び直し不要。

function _catOpenHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('catalogDirHandleDB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function _catSaveHandle(handle) {
  try {
    const db = await _catOpenHandleDB();
    db.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'catalogDir');
  } catch (e) {}
}
async function _catLoadHandle() {
  try {
    const db = await _catOpenHandleDB();
    return await new Promise(r => {
      const req = db.transaction('handles', 'readonly').objectStore('handles').get('catalogDir');
      req.onsuccess = () => r(req.result);
      req.onerror = () => r(null);
    });
  } catch (e) { return null; }
}

// フォルダ内のCSVをすべて読んでサーバーに送る
async function _catImportFromHandle(handle, silent) {
  const st = document.getElementById('cat-status');
  const pick = document.getElementById('cat-pick-status');
  const setMsg = m => { if (st) st.textContent = m; if (pick) pick.textContent = m; };
  setMsg('読み込み中...');
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file' || !name.toLowerCase().endsWith('.csv')) continue;
    if (name.startsWith('~$')) continue;
    const f = await entry.getFile();
    files.push({ name, text: await f.text() });
  }
  if (!files.length) {
    setMsg(`「${handle.name}」にCSVがありません`);
    return false;
  }
  setMsg(`取り込み中... (CSV ${files.length}個)`);
  let d;
  try {
    const res = await fetch('/api/catalog/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, label: handle.name }),
    });
    d = await res.json();
  } catch (e) {
    // 「Failed to fetch」は通信そのものが失敗したとき。POST未対応の古いserver.pyは
    // 本文を読まずに接続を切るため、404ではなくこの形で失敗する。
    setMsg('サーバーとの通信に失敗しました。server.py(start.bat)を起動し直してください');
    return false;
  }
  if (!d.ok) { setMsg('エラー: ' + (d.error || '取り込みに失敗しました')); return false; }
  const br = document.getElementById('cat-setup');
  if (br && !silent) br.style.display = 'none';
  catalogRefreshStatus();
  return true;
}

async function catalogPickFolder() {
  const st = document.getElementById('cat-status');
  if (!window.showDirectoryPicker) {
    if (st) st.textContent = 'このブラウザはフォルダ選択に対応していません（Chrome/Edge推奨）';
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await _catSaveHandle(handle);
    await _catImportFromHandle(handle);
  } catch (e) {
    if (e.name !== 'AbortError' && st) st.textContent = 'エラー: ' + (e.message || e);
  }
}

// 保存済みハンドルからDriveのフォルダを読み直す(Driveの内容を更新したとき)
async function catalogReimport() {
  const st = document.getElementById('cat-status');
  const handle = await _catLoadHandle();
  if (!handle) {
    if (st) st.textContent = 'フォルダが未選択です。「フォルダを変更」から選んでください';
    catalogShowSetup();
    return;
  }
  try {
    let perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') {
      if (st) st.textContent = 'フォルダへのアクセスが許可されませんでした';
      return;
    }
    await _catImportFromHandle(handle, true);
  } catch (e) {
    if (st) st.textContent = 'エラー: ' + (e.message || e);
  }
}

// カタログDBの全件で部品DBを作り直す（2026-08-20）
//
// 部品DBに何が入っていて何が最新か分からなくなったため、素性の分かる
// カタログDBを唯一の出所として作り直す、という盛田さんの判断による機能。
// 既存の内容は破棄されるので、実行前に必ずバックアップを書き出す。
async function catalogResetPartsDb() {
  const st = document.getElementById('cat-status');
  const setMsg = m => { if (st) st.textContent = m; };
  try {
    // 先にDriveを読み直す。「再取込」を押し忘れると古いカタログで作り直してしまい、
    // 種別が空欄のまま入る等の分かりにくい失敗になるため、順番を人に意識させない。
    const handle = await _catLoadHandle();
    if (handle) {
      try {
        let perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
          setMsg('Driveのカタログを読み直しています...');
          await _catImportFromHandle(handle, true);
        }
      } catch (e) { /* 読み直せなくても、既存のカタログDBで続行する */ }
    }

    const res = await fetch('/api/catalog/all');
    const d = await res.json();
    if (!d.ok) { setMsg('エラー: ' + (d.error || '取得に失敗しました')); return; }
    const rows = d.results || [];
    if (!rows.length) { setMsg('カタログDBが空です。先にフォルダを選んで取り込んでください'); return; }

    const noType = rows.filter(r => !r.type).length;
    const now = state.customParts.length;
    if (!confirm(
      `部品DBの中身を破棄し、カタログDBの${rows.length}件で作り直します。\n\n`
      + `　現在の部品DB: ${now}件 → 破棄されます\n`
      + `　作り直し後　: ${rows.length}件\n`
      + (noType ? `　うち種別が空欄: ${noType}件\n` : '')
      + `\n手作業で登録した部品・外形図DXFの紐付けもすべて失われます。\n`
      + `実行前に現在の内容をバックアップファイルへ書き出します。\n\n`
      + `続けますか？`)) return;

    setMsg('バックアップ中...');
    const backup = await partsDb.backupNow();
    if (!backup && now > 0) {
      if (!confirm('バックアップを書き出せませんでした。\nこのまま作り直すと現在の内容は戻せません。続けますか？')) {
        setMsg('中止しました');
        return;
      }
    }

    setMsg('作り直し中...');
    state.customParts = rows.map(r => ({
      maker: r.maker || '', ref: r.ref, type: r.type || '',
      volt: r.volt || '', amp: r.amp || '', terminals: r.terminals || '',
      contacts: r.contacts || '', note: r.note || '', source: r.source || '', custom: true,
    }));
    state.hiddenBuiltinRefs = state.hiddenBuiltinRefs || [];
    renderPartsAll();
    await partsDb.writeNow();
    setMsg(`部品DBを${rows.length}件で作り直しました`
      + (backup ? `（バックアップ: ${backup}）` : '')
      + (d.truncated ? `　※カタログは${d.total}件ありますが上限まで取り込みました` : ''));
    alert(`部品DBを${rows.length}件で作り直しました。`
      + (backup ? `\n\n以前の内容は「${backup}」に退避してあります。` : ''));
  } catch (e) {
    setMsg('エラー: ' + (e.message || e));
  }
}

async function catalogSearch() {
  const q = document.getElementById('cat-q')?.value.trim() || '';
  const st = document.getElementById('cat-status');
  const box = document.getElementById('cat-result');
  if (!q) { if (st) st.textContent = 'キーワードを入力してください'; return; }
  if (st) st.textContent = '検索中...';
  try {
    const res = await fetch('/api/catalog/search?q=' + encodeURIComponent(q) + '&limit=100');
    const d = await res.json();
    if (!d.ok) {
      if (st) st.textContent = 'エラー: ' + (d.error || '検索に失敗しました');
      if (box) box.style.display = 'none';
      return;
    }
    _catalogResults = d.results || [];
    if (st) {
      let msg = `${d.count}件ヒット${d.count >= 100 ? '（上位100件を表示）' : ''}`;
      if (d.warning) msg += ' ※' + d.warning;
      st.textContent = msg;
    }
    if (!box) return;
    if (!_catalogResults.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = _catalogResults.map((r, i) => {
      const already = state.customParts.some(p => p.ref === r.ref);
      const spec = [r.type, r.volt, r.amp, r.contacts].filter(Boolean).join(' / ');
      // 出典(カタログ名・ページ)を出す。調べられない情報は持つ意味がないため。
      const src = r.source ? `<div style="color:var(--fg3);font-size:10px">出典: ${_esc(r.source)}</div>` : '';
      return `<div style="display:flex;gap:6px;align-items:flex-start;padding:3px 0;border-bottom:1px solid var(--bd2)">
        <div style="flex:1;min-width:0">
          <div><b>${_esc(r.ref)}</b> <span style="color:var(--fg3)">${_esc(r.maker)}</span></div>
          <div style="color:var(--fg3);font-size:10px">${_esc(spec)}</div>
          ${src}
        </div>
        <button class="fp-btn" style="font-size:10px;padding:2px 6px;white-space:nowrap"
          onclick="catalogAddToParts(${i})">${already ? '上書き' : '部品DBへ'}</button>
      </div>`;
    }).join('');
  } catch (e) {
    if (st) st.textContent = 'エラー: ' + (e.message || e);
  }
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
// onclick属性の中に埋め込むパス用。Windowsのパスは「\」を含むので必ずエスケープする
// (G:\マイドライブ\... がそのままJS文字列に入ると壊れるため)。
function _escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// 検索結果の1件だけを部品DBに追加する。
// 外形図DXFは盛田さんが手で紐付けたものなので、上書き時も必ず引き継ぐ
// (CSV一括登録で全件消えた事故と同じ轍を踏まないこと)。
function catalogAddToParts(idx) {
  const r = _catalogResults[idx];
  if (!r) return;
  const part = {
    maker: r.maker || '', ref: r.ref, type: r.type || '',
    volt: r.volt || '', amp: r.amp || '', terminals: r.terminals || '',
    contacts: r.contacts || '', note: r.note || '', source: r.source || '', custom: true,
  };
  const existing = state.customParts.find(p => p.ref === r.ref);
  if (existing) {
    if (!confirm(`「${r.ref}」は既に部品DBにあります。カタログの内容で上書きしますか？\n（外形図DXFの紐付けは保持されます）`)) return;
    const keepDxf = existing.outlineDxf, keepDxfName = existing.outlineDxfName;
    Object.assign(existing, part);
    if (keepDxf !== undefined)     existing.outlineDxf     = keepDxf;
    if (keepDxfName !== undefined) existing.outlineDxfName = keepDxfName;
  } else {
    state.customParts.push(part);
  }
  renderPartsAll();
  partsDb.scheduleSave();
  const st = document.getElementById('cat-status');
  if (st) st.textContent = `「${r.ref}」を部品DBに${existing ? '上書き' : '追加'}しました`;
  catalogSearch();
}

// 保留CSV(catalog_pending/)の一覧を取得してプルダウンに反映
async function refreshPendingCsvList() {
  const sel = document.getElementById('pc-file');
  if (!sel) return;
  try {
    const res = await fetch('/api/pending_csv');
    const data = await res.json();
    const files = data.files || [];
    sel.innerHTML = files.length
      ? files.map(f => `<option value="${f}">${f}</option>`).join('')
      : '<option value="">(登録待ちCSVはありません)</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">(サーバー未対応・start.batを最新版で起動してください)</option>';
  }
}

// 選択した保留CSVを取得し、CSV一括登録欄に追記する(登録自体はボタンを押すまで実行しない)
async function loadPendingCsv() {
  const sel = document.getElementById('pc-file');
  const statusEl = document.getElementById('pc-status');
  const name = sel?.value;
  if (!name) { if (statusEl) statusEl.textContent = 'ファイルを選択してください'; return; }
  try {
    const res = await fetch('catalog_pending/' + encodeURIComponent(name));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    const csvEl = document.getElementById('pr-csv');
    if (csvEl) csvEl.value = csvEl.value.trim() ? (csvEl.value.trim() + '\n' + text) : text;
    if (statusEl) statusEl.textContent = `読み込みました(${text.split('\n').filter(l=>l.trim()).length}行)。内容を確認して「CSVから一括登録」を押してください`;
  } catch (e) {
    if (statusEl) statusEl.textContent = '読み込みに失敗しました: ' + (e.message || e);
  }
}

// 外形図DXFファイル読込（エンコーディング自動判定して文字列化）
function _readDxfFileAsText(file, cb) {
  const rd = new FileReader();
  rd.onload = ev => {
    const buf = ev.target.result;
    const u8 = new Uint8Array(buf);
    let enc = 'UTF-8';
    if (!(u8[0]===0xEF && u8[1]===0xBB && u8[2]===0xBF)) enc = _detectSjis(u8);
    let text;
    try { text = new TextDecoder(enc).decode(buf); }
    catch (err) { text = new TextDecoder('UTF-8').decode(buf); }
    cb(text);
  };
  rd.readAsArrayBuffer(file);
}

let _pendingOutlineDxf = null; // { text, filename } 登録フォーム用の一時保持
function handleOutlineFileSelect(e) {
  const f = e.target.files[0]; if (!f) return;
  _readDxfFileAsText(f, text => {
    _pendingOutlineDxf = { text, filename: f.name };
    document.getElementById('pr-outline-status').textContent = `添付予定: ${f.name}`;
  });
}

function saveCusPart() {
  const ref = document.getElementById('pr-ref').value.trim();
  if (!ref) { alert('型番を入力してください'); return; }
  const existing = state.customParts.find(p => p.ref === ref);
  // 外形図DXF: 今回新しく選択したファイルがあればそれを使う。無ければ、編集時に
  // 既存部品が持っていた外形図をそのまま残す(2026-08-17、編集機能追加時に
  // 「編集して保存すると外形図が消える」不具合を作り込みそうになったため対策)。
  const outlineDxf     = _pendingOutlineDxf?.text     ?? existing?.outlineDxf     ?? '';
  const outlineDxfName = _pendingOutlineDxf?.filename ?? existing?.outlineDxfName ?? '';
  const part = {
    maker: document.getElementById('pr-maker').value,
    ref, type: document.getElementById('pr-type').value,
    volt: document.getElementById('pr-volt').value, amp: document.getElementById('pr-amp').value,
    terminals: document.getElementById('pr-term').value, contacts: document.getElementById('pr-contacts').value,
    note: document.getElementById('pr-note').value,
    source: document.getElementById('pr-source').value, custom: true,
    outlineDxf, outlineDxfName,
  };
  if (existing) Object.assign(existing, part); else state.customParts.push(part);
  _pendingOutlineDxf = null;
  document.getElementById('pr-outline-status').textContent = '';
  document.getElementById('pr-outline-file').value = '';
  renderPartsAll(); closeFP('part-reg-p'); alert(`「${ref}」を登録しました`);
  partsDb.scheduleSave();
}

// 既存カスタム部品に外形図DXFを後から添付
function attachOutlineToPart(ref) {
  const part = state.customParts.find(p => p.ref === ref);
  if (!part) { alert('カスタム部品のみ外形図を添付できます（標準部品はコピーしてカスタム登録してください）'); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.dxf';
  input.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    _readDxfFileAsText(f, text => {
      part.outlineDxf = text; part.outlineDxfName = f.name;
      renderPartsAll();
      partsDb.scheduleSave();
      alert(`「${ref}」に外形図「${f.name}」を添付しました`);
    });
  };
  input.click();
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

// 簡易CSVパーサ（ダブルクォート内のカンマに対応）
function parseCSVLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}
const PART_TYPE_CODES = ['contactor','starter','coil','timer','thermal','pb','pb_lamp','pb_estop','selector','selector_key','selector_lamp','selector_pb','lever','contact_unit','lamp','breaker','fuse','transformer','terminal','inverter','servo','servo_motor','motor','plc','plc_unit','hmi','option'];

// 廃止した種別コード（2026-08-23）。
// sw_no(a接点)/sw_nc(b接点) は「接点構成」であって部品の分類ではないため廃止した。
// 接点構成は型式の中に含まれる（IDEC HW1B-M1P10 の P10 が 1a を表す）。
//
// 【自動変換はしない】これらは正式な種別コード(pb/selector系)が追加される前に
// 押ボタン・セレクタを暫定流用で登録したもので、実体はコンタクトユニットではない。
// 機械的に contact_unit へ置き換えると押ボタンがコンタクトユニットとして
// 登録されてしまう。人が中身を見て分類し直す必要がある。
//
// 取り込みは従来どおり通す（ここで弾くと既存CSVが再取込できなくなる）が、
// 件数を数えて「要再分類」として知らせる。
const LEGACY_PART_TYPES = { sw_no: 'a接点', sw_nc: 'b接点' };
function bulkImportParts() {
  const raw = document.getElementById('pr-csv').value;
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let added = 0, skipped = 0, updated = 0;
  const errors = [];
  const legacyRows = [];   // 廃止した種別(sw_no/sw_nc)で登録されている行。要再分類
  lines.forEach((line, i) => {
    // ヘッダー行らしき行はスキップ（「型番」「maker」等の文字を含む、または種別列が既知コードでない）
    if (/型番|メーカー|maker|ref/i.test(line)) return;
    const cols = parseCSVLine(line);
    // 9列目=出典(カタログ名・ページ)。将来列が増えても壊れないよう、
    // 足りない列は空として扱う(「ちょうどN列」では判定しない)。2026-08-21
    const [maker, ref, type, volt, amp, terminals, contacts, note, source] = cols;
    if (!ref) { errors.push(`${i+1}行目: 型番が空です`); skipped++; return; }
    if (type && !PART_TYPE_CODES.includes(type)) {
      // 廃止した種別(sw_no/sw_nc)は弾かずに通す。ここで弾くと、これらで
      // 登録済みのCSV(IDEC ø22の16型番等)が再取込できなくなるため。
      // 中身の分類し直しは人がやる必要があるので、件数だけ数えて後で知らせる。
      if (LEGACY_PART_TYPES[type]) {
        legacyRows.push(`${i+1}行目: ${ref}（現在の種別: ${LEGACY_PART_TYPES[type]}）`);
      } else {
        errors.push(`${i+1}行目: 種別「${type}」が不正です（${PART_TYPE_CODES.join('/')}のいずれか）`);
        skipped++; return;
      }
    }
    // 種別が空欄の場合、以前は coil に強制していたが、それだとPLC・タッチパネル等の
    // 「該当種別なし」で登録した部品が全部リレーコイル扱いになってしまうため、
    // 2026-08-19に空欄のまま(未分類)を許容するよう変更した。
    const part = { maker: maker||'', ref, type: type||'', volt: volt||'', amp: amp||'', terminals: terminals||'', contacts: contacts||'', note: note||'', source: source||'', custom: true };
    const existing = state.customParts.find(p => p.ref === ref);
    if (existing) {
      // 外形図DXFはCSVに列が無いため、Object.assignで丸ごと上書きすると
      // 手作業で紐付けた外形図が消えてしまう(実際に消失事故が起きた)。
      // 単品登録のsaveCusPartと同じく、既存の外形図は必ず引き継ぐ。2026-08-19
      const keepDxf     = existing.outlineDxf;
      const keepDxfName = existing.outlineDxfName;
      Object.assign(existing, part);
      if (keepDxf !== undefined)     existing.outlineDxf     = keepDxf;
      if (keepDxfName !== undefined) existing.outlineDxfName = keepDxfName;
      updated++;
    }
    else { state.customParts.push(part); added++; }
  });
  renderPartsAll();
  partsDb.scheduleSave();
  let msg = `登録完了: 新規${added}件`;
  if (updated) msg += `・更新${updated}件`;
  if (skipped) msg += `・スキップ${skipped}件`;
  if (errors.length) msg += `\n\n【エラー詳細】\n${errors.join('\n')}`;
  if (legacyRows.length) {
    // 2026-08-23: sw_no/sw_nc は廃止した種別。取り込みは通すが、実体に合わせて
    // 分類し直してもらう必要がある(押ボタンなら pb、セレクタなら selector、
    // 接点ブロック単体なら contact_unit)。自動変換すると誤分類になるためしない。
    msg += `\n\n【要再分類 ${legacyRows.length}件】\n`
        + `a接点/b接点は「接点構成」であって部品の分類ではないため、種別から廃止しました。\n`
        + `接点構成は型式の中に含まれます(例: IDEC HW1B-M1P10 の P10 が 1a)。\n`
        + `下記は実体に合わせて種別を選び直してください。\n`
        + `　押ボタン → pb / セレクタ → selector / 接点ブロック単体 → contact_unit\n\n`
        + legacyRows.join('\n');
  }
  alert(msg);
  if (added || updated) document.getElementById('pr-csv').value = '';
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
      // 反転(flipH/flipVが奇数回)は弧の向きも反転させる。sa/eaの入れ替えだけでは
      // 足りず、回転方向(ccw)も一緒に反転させないと弧が反対側に描かれる。
      if (flipped) { const tmp = sa; sa = ea; ea = tmp; ccw = !ccw; }
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
  // 配置済みシンボル(カスタム/ライブラリ)インスタンス → 実際の配置で平坦化
  const cS = state.customSymbols.find(s => s.type === el.type);
  if (cS && cS.shapes && cS.shapes.length) return flattenSymbolElToShapes(el, cS);
  return null; // 標準シンボル・junction・bezier・dim等は非対応
}

function srPasteFromClipboard() {
  const cb = state.clipboard;
  if (!cb?.els?.length && !cb?.wires?.length) { alert('先にCADで図形を選択してCtrl+Cでコピーしてください'); return; }

  // バウンディングボックス計算
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const addPt = (x,y) => { minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); };
  let skipped = 0;
  cb.els.forEach(el => {
    const ws = srWorldShapesForEl(el);
    if (!ws) { skipped++; return; }
    ws.forEach(s => {
      if (s.t==='L') { addPt(s.x1,s.y1); addPt(s.x2,s.y2); }
      else if (s.t==='C'||s.t==='A') { addPt(s.cx-s.r,s.cy-s.r); addPt(s.cx+s.r,s.cy+s.r); }
      else if (s.t==='R') { addPt(s.x,s.y); addPt(s.x+s.w,s.y+s.h); }
      else if (s.t==='P'&&s.pts) s.pts.forEach(p=>addPt(p[0],p[1]));
      else if (s.t==='T') addPt(s.x,s.y);
    });
  });
  cb.wires.forEach(w => { (w.pts||[]).forEach(p => addPt(p.x, p.y)); });
  if (!isFinite(minX)) { alert('対応していない図形のみが選択されています(標準シンボル・接続点・寸法線等は貼り付け非対応)'); return; }

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
  cb.els.forEach(el => {
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
  srGridAlignShapes(shapes);
  _srShapes = shapes;
  srFitToContent();
  srRender();
  if (skipped > 0) alert(`${skipped}個の要素は貼り付けに対応していないためスキップされました(標準シンボル・接続点・寸法線・ベジェ曲線等)`);
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

// 貼り付け後、実際の図形サイズをW/H欄に反映し、
// キャンバスに収まるようズーム倍率を合わせる。
function srFitToContent() {
  const bb = calcCustomSymBBox(_srShapes);
  const wEl = document.getElementById('sr-w'), hEl = document.getElementById('sr-h');
  if (wEl) wEl.value = Math.max(10, Math.min(300, Math.round(bb.w)));
  if (hEl) hEl.value = Math.max(10, Math.min(300, Math.round(bb.h)));

  const cv = document.getElementById('sym-reg-cv');
  if (!cv) return;
  // 中心が原点なので、必要な表示半径は幅/高さの半分
  const needX = (bb.w / 2) || 1, needY = (bb.h / 2) || 1;
  const z = Math.min((cv.width / 2 - 12) / needX, (cv.height / 2 - 12) / needY);
  _srZoom = Math.max(0.5, Math.min(10, z));
}

function srClear() {
  _srShapes = []; _srTerms = []; _srTool = null; _srDraw = null; _srFirst = null;
  _srZoom = SR_SCALE;
  const roleEl = document.getElementById('sr-role'); if (roleEl) roleEl.value = '';
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

  // Bounding box (dashed)
  const bw = (parseInt(document.getElementById('sr-w')?.value)||80) * _srZoom;
  const bh = (parseInt(document.getElementById('sr-h')?.value)||60) * _srZoom;
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
    const px = SR_CX + t.x * _srZoom, py = SR_CY + t.y * _srZoom;
    c.fillStyle = '#0067c0'; c.fillRect(px-5,py-5,10,10);
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

function srSetTermLabel(i, v) {
  if (!_srTerms[i]) return;
  _srTerms[i].label = v;
  srRender();
}

function srUpdateTermList() {
  const el = document.getElementById('sr-term-list');
  if (!el) return;
  if (!_srTerms.length) { el.textContent = '（端子点なし）'; return; }
  el.innerHTML = _srTerms.map((t,i) =>
    `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">`
    + `<span>T${i}: (${t.x}, ${t.y})</span>`
    + `<input type="text" value="${(t.label||'').replace(/"/g,'&quot;')}" placeholder="端子番号(例:A1)" style="width:70px;font-size:11px" onchange="srSetTermLabel(${i}, this.value)">`
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
  const cat = document.getElementById('sr-cat').value.trim() || 'カスタム';
  const bbox = calcCustomSymBBox(_srShapes);
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
    _srShapes.forEach(s => {
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
  const sym = { type, name, label:name, cat, role, w, h, shapes:[..._srShapes], terminals:[..._srTerms], preview };
  state.customSymbols.push(sym);
  saveSymbolsToStorage();
  if (typeof DEFS !== 'undefined') {
    DEFS[type] = { w, h, cat, name, jis:'', role,
      terminals: _srTerms.map((t,i) => ({ id:`t${i}`, x:t.x, y:t.y, label:t.label||'' })) };
  }
  closeFP('sym-reg-p');
  renderSymFloat();
  alert(`「${name}」を登録しました。シンボルパレットのカスタムタブから配置できます。`);
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
  saveSymbolsToStorage();
  renderSymFloat();
}

function delCusSym(type) {
  if (!confirm('削除しますか？')) return;
  state.customSymbols = state.customSymbols.filter(s => s.type !== type);
  saveSymbolsToStorage();
  delete DEFS[type];
  renderSymFloat();
}

// ----------------------------------------------------------------
// ページタブ
// ----------------------------------------------------------------
function renderPageTabs() {
  const el = document.getElementById('page-tabs'); if (!el) return;
  el.innerHTML = state.pages.map((p,i) =>
    `<div class="page-tab${i===state.currentPage?' active':''}" draggable="true" onclick="switchPage(${i})" ondblclick="renamePage(${i})" ondragstart="pageDragStart(event,${i})" ondragover="pageDragOver(event)" ondrop="pageDrop(event,${i})" style="display:flex;align-items:center;gap:4px" title="ドラッグで並び替え／ダブルクリックで名前変更">${p.name||('Sheet'+(i+1))}${p.dirty?'<span style="color:var(--red);font-size:10px">●</span>':''}${state.pages.length>1?`<span onclick="event.stopPropagation();deletePage(${i})" style="font-size:10px;color:var(--fg3);cursor:pointer;line-height:1" title="削除">×</span>`:''}</div>`
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
    const isGrouped = selGroups.length > 0;
    const label = isGrouped ? `グループ選択 (${selGroups.length}個)` : `複数選択 (${totalSel}個)`;
    const groupBtn = isGrouped
      ? `<button class="pp-apply" style="margin-top:4px;background:#e55" onclick="ungroupSelected();updateRightPanel()">グループ解除</button>`
      : `<button class="pp-apply" onclick="groupSelected();updateRightPanel()">グループ化 (G)</button>`;
    rp.innerHTML = `
      <p style="font-size:10px;font-weight:600;color:var(--fg4);padding:6px 10px 2px">${label}</p>
      <div class="pp-row"><label>X (左端)</label><input type="number" id="gp-x" value="${gx}" step="any"></div>
      <div class="pp-row"><label>Y (上端)</label><input type="number" id="gp-y" value="${gy}" step="any"></div>
      <div class="pp-row"><label>幅</label><span style="padding:2px 0;color:var(--fg2)">${gw}</span></div>
      <div class="pp-row"><label>高さ</label><span style="padding:2px 0;color:var(--fg2)">${gh}</span></div>
      <hr style="margin:6px 10px;border-color:var(--border)">
      <p style="font-size:10px;font-weight:600;color:var(--fg4);padding:2px 10px">移動量</p>
      <div class="pp-row"><label>ΔX</label><input type="number" id="gp-dx" value="0" step="any"></div>
      <div class="pp-row"><label>ΔY</label><input type="number" id="gp-dy" value="0" step="any"></div>
      <button class="pp-apply" onclick="applyGroupMove()">移動適用</button>
      ${groupBtn}
      ${isGrouped ? groupDevicePropsHtml(selGroups[0], selGroups.length) : ''}
      ${deviceClipboard ? `<button class="pp-apply" onclick="pasteDeviceProps()" title="コピー済みのデバイス名・型番・仕様・文字設定を、選択中の全シンボルへまとめて貼り付けます(形が違うシンボル同士でもOK)">選択中の${state.sel.els.size}個へデバイス/型式/仕様を貼り付け</button>` : ''}
      ${(() => {
        // 【2026-08-23】端子(junction)の見た目コピー・貼り付けは、当初
        // isTermブロック(単一の端子を選んだときのパネル)にしかボタンを
        // 置いていなかった。複数選択すると別のこのパネルに切り替わるため、
        // 「コピーしたのに貼り付ける場所がどこにも無い」状態になっていた
        // (盛田さん「コピーはどうなった？」)。一般要素のpasteDevicePropsと
        // 同じ場所に、端子用のボタンも追加する。選択に端子が1つも無ければ
        // 出しても無意味なので、含まれるときだけ表示する。
        if (!junctionClipboard) return '';
        const selJCount = state.elements.filter(e => state.sel.els.has(e.id) && e.type === 'junction').length;
        if (!selJCount) return '';
        return `<button class="pp-apply" onclick="pasteJunctionProps()" title="コピー済みの端子の見た目(色・サイズ・位置補正)を、選択中の端子へまとめて貼り付けます">選択中の端子${selJCount}個へ見た目を貼り付け</button>`;
      })()}
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

  if (el && el.type === 'junction') {
    const isTerm = (el.style === 'circle' || el.style === 'dbl'); // 白丸/二重丸のみ端子台の端子として扱う
    html += `<p style="font-size:10px;font-weight:600;color:var(--fg4);padding:6px 10px 2px">${isTerm ? '端子台の端子' : '接続点(分岐点)'}</p>`;
    // 【2026-08-23】X/Yの手入力欄は削除した(盛田さん判断)。端子・分岐点とも
    // 配線の端点にスナップして置くもので、座標を手打ちで直す場面が無い。
    // 動かすならドラッグの方が早い。半径と見た目は描くときに頻繁に触るので残す。
    // 端子(○/◎)・分岐点(●)の共通部分なので、削除は両方に効く。
    html += `<div class="pp-row"><label>半径</label><input type="number" id="pp-jr" value="${el.r||2}" min="1" max="30" step="1"></div>`;
    html += `<div class="pp-row"><label>見た目</label><select id="pp-jstyle"><option value="dot"${(el.style||'dot')==='dot'?' selected':''}>●塗りつぶし</option><option value="circle"${el.style==='circle'?' selected':''}>○白丸</option><option value="dbl"${el.style==='dbl'?' selected':''}>◎二重丸</option></select></div>`;
    if (isTerm) {
      // 【2026-08-23】盛田さん「端子台プロパティにもコピー貼付けがいる」への対応。
      // 一般要素側(2026-08-03)と同じ考え方だが、対象フィールドは絞ってある:
      //   ・partRef/partModel/panelZone(デバイス識別情報)は含めない。
      //     これらは既にonJunctionRefChanged(デバイス名を打つと引き継ぐ)で
      //     扱う仕組みがあり、コピー貼り付けで混ぜると別デバイスの端子に
      //     device名を誤って上書きする事故になりやすい
      //   ・label(端子番号)は絶対に含めない。端子ごとに違う値であり、
      //     貼り付けで上書きすると全部同じ番号になってしまう
      //     (collectDeviceInfo/onJunctionRefChangedと同じ注意点)
      // 対象は表示ON/OFFと、色・サイズ・位置補正(見た目)のみ。異なるデバイス間で
      // 「見た目だけ揃える」ための機能として割り切っている。
      html += `<div class="pp-row" style="gap:6px">
        <button onclick="copyJunctionProps()" title="この端子の表示ON/OFF・文字色・サイズ・位置補正をコピーします(デバイス名・型式・端子番号は含みません)" style="flex:1;font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">端子の見た目をコピー</button>
        <button onclick="pasteJunctionProps()" title="コピーした見た目を、選択中の端子(複数可)へまとめて貼り付けます" style="flex:1;font-size:11px;padding:3px 6px;background:${junctionClipboard?'var(--accent,#1d6fb5)':'var(--bg3)'};border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:${junctionClipboard?'#fff':'var(--fg)'}"${junctionClipboard?'':' disabled'}>貼り付け</button>
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
        + `<input type="text" id="pp-jref" list="pp-jref-list" value="${el.partRef||''}"`
        + ` placeholder="例: TB1" onchange="onJunctionRefChanged()"></div>`
        + `<datalist id="pp-jref-list">${partRefOptionsHtml(el.partRef)}</datalist>`;
      html += `<div class="pp-row"><label>デバイスを図面に表示</label><input type="checkbox" id="pp-jrefshow" ${(el.showDev!==undefined?el.showDev:true)?'checked':''}></div>`;
      // 【2026-08-23】盤内/盤外の2択セレクトから「対象外」チェックに変更。
      // 既定が盤内なので実質フラグ1つで足り、選ばせる必要が無かった。
      // 内部表現(el.panelZone: 未設定 or '外')は変えていないので既存データも読める。
      html += `<div class="pp-row"><label>部品表の対象外</label><input type="checkbox" id="pp-jzone"${el.panelZone==='外'?' checked':''} title="チェックすると部品表に集計されません。現地調達品など、この図面で手配しないものに使います"></div>`;
      html += `<details class="pp-details" style="border-left:4px solid ${jDevC}"><summary>デバイス表示の詳細（色・サイズ・位置）</summary>`;
      html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-jdfs" value="${el.devFs!==undefined?el.devFs:''}" placeholder="自動" min="4" max="48" step="1" oninput="previewJDeviceOff()"></div>`;
      html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-jdcolor" value="${el.devColor||'#555555'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-jdcolor','pp-jdcolorcode');previewJDeviceOff()"><input type="text" id="pp-jdcolorcode" value="${el.devColor||'#555555'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-jdcolorcode','pp-jdcolor');previewJDeviceOff()">${colorCodeBtns('pp-jdcolorcode','pp-jdcolor')}</div></div>`;
      html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-jdox" value="${el.devOffX!==undefined?el.devOffX:''}" placeholder="自動" step="1" oninput="previewJDeviceOff()"></div>`;
      html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-jdoy" value="${el.devOffY!==undefined?el.devOffY:''}" placeholder="自動" step="1" oninput="previewJDeviceOff()"></div>`;
      html += `<div class="pp-row"><button onclick="resetJDeviceOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
      html += `</details></div>`;

      html += `<div class="pp-group" style="border-left:4px solid var(--fg3)"><div class="pp-group-cap" style="color:var(--fg3)">◆ 型式</div>`;
      html += `<div class="pp-row"><label>型番(BOM用)</label><input type="text" id="pp-jmodel" value="${el.partModel||''}" placeholder="例: 端子台 M4" onchange="onJunctionModelChanged()" title="同じデバイス(TB1等)の端子すべてに同じ型式が入ります。台ごとに1回書けば済みます"></div>`;
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
        + `<input type="text" id="pp-jlabel" list="pp-jlabel-list" value="${el.label||''}" placeholder="例: A, 1"></div>`
        + `<datalist id="pp-jlabel-list">${junctionTermOptionsHtml(el)}</datalist>`;
      html += `<details class="pp-details" style="border-left:4px solid ${jLblC}"><summary>端子番号表示の詳細（色・サイズ・位置）</summary>`;
      html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-jlfs" value="${el.labelFs!==undefined?el.labelFs:''}" placeholder="自動" min="4" max="48" step="1" oninput="previewJLabelOff()"></div>`;
      html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-jlcolor" value="${el.labelColor||'#555555'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-jlcolor','pp-jlcolorcode');previewJLabelOff()"><input type="text" id="pp-jlcolorcode" value="${el.labelColor||'#555555'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-jlcolorcode','pp-jlcolor');previewJLabelOff()">${colorCodeBtns('pp-jlcolorcode','pp-jlcolor')}</div></div>`;
      html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-jlox" value="${el.labelOffX!==undefined?el.labelOffX:''}" placeholder="自動" step="1" oninput="previewJLabelOff()"></div>`;
      html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-jloy" value="${el.labelOffY!==undefined?el.labelOffY:''}" placeholder="自動" step="1" oninput="previewJLabelOff()"></div>`;
      html += `<div class="pp-row"><button onclick="resetJLabelOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
      html += `</details></div>`;
    }
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
  } else if (el && el.type === 'text') {
    html += `<div class="pp-row"><label>テキスト</label><textarea rows="2" id="pp-text">${el.text||''}</textarea></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-fs" value="${el.fs||14}" min="8" max="72"></div>`;
    html += `<div class="pp-row"><label>枠</label><input type="checkbox" id="pp-textbox" ${el.textBox?'checked':''}><label for="pp-textbox" style="margin-left:4px">枠あり</label></div>`;
  } else if (el && el.type === 'angle_dim') {
    html += `<div class="pp-row"><label>角度テキスト</label><input type="text" id="pp-angtext" value="${el.dimText||''}"></div>`;
    html += `<div class="pp-row"><label>フォントサイズ</label><input type="number" id="pp-angfs" value="${el.dimFs||11}" min="6" max="32"></div>`;
    html += `<div class="pp-row"><label>弧の半径</label><input type="number" id="pp-angr" value="${el.r||30}" min="10" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストX補正</label><input type="number" id="pp-angtx" value="${el.dimTx||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>テキストY補正</label><input type="number" id="pp-angty" value="${el.dimTy||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
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
    html += `<div class="pp-row"><label>線幅</label><select id="pp-dimlw">${lineWidthOptions(el.lineWidth||DEFAULT_LINE_WIDTH)}</select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-dimls">
      <option value=""        ${!el.lineStyle          ?'selected':''}>実線</option>
      <option value="dash"    ${el.lineStyle==='dash'   ?'selected':''}>破線</option>
      <option value="dashdot" ${el.lineStyle==='dashdot'?'selected':''}>一点鎖線</option>
      <option value="dot"     ${el.lineStyle==='dot'    ?'selected':''}>点線</option>
    </select></div>`;
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
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
  } else if (wire || (el && el.pts)) {
    const lay = LAYERS.find(l => l.name === item.layer);
    const wPts = item.pts || [{x:item.x1,y:item.y1},{x:item.x2,y:item.y2}];
    const wAng = wPts.length>=2 ? Math.round(Math.atan2(wPts[wPts.length-1].y-wPts[0].y, wPts[wPts.length-1].x-wPts[0].x)*180/Math.PI*10)/10 : 0;
    html += `<div class="pp-row"><label>角度(°)</label><input type="number" id="pp-wangle" value="${wAng}" step="1"></div>`;
    html += `<div class="pp-row"><label>線番</label><input type="text" id="pp-wireno" value="${item.wireNo||''}"></div>`;
    html += `<div class="pp-row"><label>線番サイズ</label><input type="number" id="pp-wno-fs" value="${item.wireNoFs||10}" step="1" min="6" max="32"></div>`;
    html += `<div class="pp-row"><label>線番X補正</label><input type="number" id="pp-wno-ox" value="${item.wireNoOffX||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>線番Y補正</label><input type="number" id="pp-wno-oy" value="${item.wireNoOffY||0}" step="5"></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${item.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    html += `<div class="pp-row"><label>線幅</label><select id="pp-lw">${lineWidthOptions(item.lineWidth||DEFAULT_LINE_WIDTH)}</select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-ls"><option value=""${!item.lineStyle?' selected':''}>実線</option><option value="dash"${item.lineStyle==='dash'?' selected':''}>破線</option><option value="dashdot"${item.lineStyle==='dashdot'?' selected':''}>一点鎖線</option><option value="dot"${item.lineStyle==='dot'?' selected':''}>点線</option></select></div>`;
    if (lay?.attr) html += `<div class="pp-row"><label>属性（レイヤー）</label><p style="font-size:11px;color:var(--fg3);padding:2px 5px">${lay.attr}</p></div>`;
  } else if (el && ['fline','rect','circle','arc','triangle'].includes(el.type)) {
    // 図形専用プロパティ
    if (el.type === 'fline') {
      const fAng = Math.round(Math.atan2(el.y2-el.y1, el.x2-el.x1)*180/Math.PI*10)/10;
      const fLen = Math.round(Math.hypot(el.x2-el.x1, el.y2-el.y1)*10)/10;
      html += `<div class="pp-row"><label>回転基準</label><select id="pp-fbase"><option value="p1">始点固定</option><option value="p2">終点固定</option></select></div>`;
      html += `<div class="pp-row"><label>角度(°)</label><input type="number" id="pp-fangle" value="${fAng}" step="1"></div>`;
      html += `<div class="pp-row"><label>長さ</label><input type="number" id="pp-flen" value="${fLen}" step="1" min="1"></div>`;
      html += `<div class="pp-row"><label>始点X</label><input type="number" id="pp-x1" value="${Math.round(el.x1*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>始点Y</label><input type="number" id="pp-y1" value="${Math.round(el.y1*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>終点X</label><input type="number" id="pp-x2" value="${Math.round(el.x2*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>終点Y</label><input type="number" id="pp-y2" value="${Math.round(el.y2*1000)/1000}" step="any"></div>`;
    } else if (el.type === 'arc') {
      html += `<div class="pp-row"><label>中心X</label><input type="number" id="pp-x1" value="${Math.round(el.x*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>中心Y</label><input type="number" id="pp-y1" value="${Math.round(el.y*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>半径</label><input type="number" id="pp-arcr" value="${Math.round((el.r||10)*10)/10}" step="1" min="1"></div>`;
      html += `<div class="pp-row"><label>開始角(°)</label><input type="number" id="pp-arca1" value="${Math.round(el.startA*180/Math.PI*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>終了角(°)</label><input type="number" id="pp-arca2" value="${Math.round(el.endA*180/Math.PI*1000)/1000}" step="any"></div>`;
    } else if (el.type === 'triangle') {
      html += `<div class="pp-row"><label>回転基準</label><select id="pp-tribase"><option value="p1">頂点1固定</option><option value="p2">頂点2固定</option><option value="p3">頂点3固定</option></select></div>`;
      html += `<div class="pp-row"><label>回転角(°)</label><input type="number" id="pp-triangle" value="0" step="1"></div>`;
      html += `<div class="pp-row"><label>頂点1 X</label><input type="number" id="pp-tx1" value="${Math.round(el.x1*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点1 Y</label><input type="number" id="pp-ty1" value="${Math.round(el.y1*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点2 X</label><input type="number" id="pp-tx2" value="${Math.round(el.x2*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点2 Y</label><input type="number" id="pp-ty2" value="${Math.round(el.y2*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点3 X</label><input type="number" id="pp-tx3" value="${Math.round(el.x3*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>頂点3 Y</label><input type="number" id="pp-ty3" value="${Math.round(el.y3*1000)/1000}" step="any"></div>`;
    } else if (el.type === 'rect') {
      html += `<div class="pp-row"><label>X</label><input type="number" id="pp-rx" value="${Math.round(el.x*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>Y</label><input type="number" id="pp-ry" value="${Math.round(el.y*1000)/1000}" step="any"></div>`;
      html += `<div class="pp-row"><label>幅</label><input type="number" id="pp-rw" value="${Math.round(el.w*1000)/1000}" step="any" min="1"></div>`;
      html += `<div class="pp-row"><label>高さ</label><input type="number" id="pp-rh" value="${Math.round(el.h*1000)/1000}" step="any" min="1"></div>`;
    }
    html += `<div class="pp-row"><label>線幅</label><select id="pp-lw">${lineWidthOptions(el.lineWidth||DEFAULT_LINE_WIDTH)}</select></div>`;
    html += `<div class="pp-row"><label>線種</label><select id="pp-ls"><option value=""${!el.lineStyle?' selected':''}>実線</option><option value="dash"${el.lineStyle==='dash'?' selected':''}>破線</option><option value="dot"${el.lineStyle==='dot'?' selected':''}>点線</option><option value="dashdot"${el.lineStyle==='dashdot'?' selected':''}>一点鎖線</option></select></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
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
      <button onclick="copyDeviceProps()" title="このシンボルのデバイス名・型番・仕様・文字設定を丸ごとコピーします" style="flex:1;font-size:11px;padding:3px 6px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">デバイス/型式/仕様をコピー</button>
      <button onclick="pasteDeviceProps()" title="コピーした内容を、選択中のシンボル(複数可・形が違ってもOK)へまとめて貼り付けます" style="flex:1;font-size:11px;padding:3px 6px;background:${deviceClipboard?'var(--accent,#1d6fb5)':'var(--bg3)'};border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:${deviceClipboard?'#fff':'var(--fg)'}"${deviceClipboard?'':' disabled'}>貼り付け</button>
    </div>`;
    { const devC = el.devColor||(state.darkMode?'#4da3ff':'#1d6fb5');
    html += `<div class="pp-group" style="border-left:4px solid ${devC}"><div class="pp-group-cap" style="color:${devC}">◆ デバイス</div>`;
    // デバイス欄は入力欄＋候補リスト(datalist)。候補は図面上で実際に使われている
    // デバイス記号だけを出す。既存デバイスを選ぶと型番・仕様がそこから引き継がれる
    // (MC1は主接点・コイル・補助接点と複数箇所に置くため、2つ目以降は選ぶだけで済む)。
    html += `<div class="pp-row"><label>デバイス</label>`
      + `<input type="text" id="pp-partref" list="pp-partref-list" value="${el.partRef||''}"`
      + ` placeholder="例: MC1, NFB1" onchange="onPartRefChanged()"></div>`
      + `<datalist id="pp-partref-list">${partRefOptionsHtml(el.partRef)}</datalist>`;
    html += `<div class="pp-row"><label>デバイスを図面に表示</label><input type="checkbox" id="pp-devhide"${el.devHide?'':' checked'} title="3極品等、同じデバイスを複数のシンボルに分けて配置する場合に使います。デバイス名は全部の要素に同じ値を入れつつ、文字はどれか1つだけに絞れます"></div>`;
    html += `<div class="pp-row"><label>部品表の対象外</label><input type="checkbox" id="pp-zone"${el.panelZone==='外'?' checked':''} title="チェックすると部品表に集計されません。現地調達品など、この図面で手配しないものに使います"></div>`;
    html += `<details class="pp-details" style="border-left:4px solid ${devC}"><summary>デバイス表示の詳細（色・サイズ・位置）</summary>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-dfs" value="${el.devFs||11}" step="1" min="6" max="32" oninput="previewDeviceOff()"></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-dcolor" value="${el.devColor||'#1d6fb5'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-dcolor','pp-dcolorcode');previewDeviceOff()"><input type="text" id="pp-dcolorcode" value="${el.devColor||'#1d6fb5'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-dcolorcode','pp-dcolor');previewDeviceOff()">${colorCodeBtns('pp-dcolorcode','pp-dcolor')}</div></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-dox" value="${el.devOffX!==undefined?el.devOffX:''}" placeholder="自動" step="5" oninput="previewDeviceOff()"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-doy" value="${el.devOffY!==undefined?el.devOffY:''}" placeholder="自動" step="5" oninput="previewDeviceOff()"></div>`;
    html += `<div class="pp-row"><button onclick="resetDeviceOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
    html += `</details>`;
    html += `</div>`; }
    { const mdlC = el.modelColor||el.labelColor||'#555555';
    html += `<div class="pp-group" style="border-left:4px solid ${mdlC}"><div class="pp-group-cap" style="color:${mdlC}">◆ 型式</div>`;
    html += `<div class="pp-row"><label>型番</label><input type="text" id="pp-partmodel" value="${el.partModel||''}" placeholder="例: S-T10（メーカー型番）" onchange="onPartModelChanged()"></div>`;
    html += partVoltRowHtml(el);
    html += `<div class="pp-row"><label>型式を図面に表示</label><input type="checkbox" id="pp-showmodel"${el.showModel?' checked':''} title="チェックしたシンボルにだけ型番が描画されます。接点側はOFFのままにしてください"></div>`;
    html += `<details class="pp-details" style="border-left:4px solid ${mdlC}"><summary>型式表示の詳細（色・サイズ・位置）</summary>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-mfs" value="${el.modelFs||el.labelFs||11}" step="1" min="6" max="32" oninput="previewModelOff()"></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-mcolor" value="${el.modelColor||el.labelColor||'#555555'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-mcolor','pp-mcolorcode');previewModelOff()"><input type="text" id="pp-mcolorcode" value="${el.modelColor||el.labelColor||'#555555'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-mcolorcode','pp-mcolor');previewModelOff()">${colorCodeBtns('pp-mcolorcode','pp-mcolor')}</div></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-mox" value="${el.modelOffX!==undefined?el.modelOffX:''}" placeholder="自動" step="5" oninput="previewModelOff()"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-moy" value="${el.modelOffY!==undefined?el.modelOffY:''}" placeholder="自動" step="5" oninput="previewModelOff()"></div>`;
    html += `<div class="pp-row"><button onclick="resetModelOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
    html += `</details>`;
    html += `</div>`; }
    { const lblC = el.labelColor||'#555555';
    html += `<div class="pp-group" style="border-left:4px solid ${lblC}"><div class="pp-group-cap" style="color:${lblC}">◆ 仕様</div>`;
    html += `<div class="pp-row"><label>仕様</label><textarea rows="2" id="pp-label" style="text-align:${el.labelAlign||'center'}" placeholder="例: AC200V 3.7kW&#10;冷却ファン用（改行可）">${el.label||''}</textarea></div>`;
    html += `<div class="pp-row"><label>仕様を図面に表示</label><input type="checkbox" id="pp-showspec"${el.specHide?'':' checked'} title="チェックしたシンボルにだけ仕様が描画されます。同じデバイスを複数のシンボルに分けて配置する場合、代表の1つだけONにしてください"></div>`;
    html += `<details class="pp-details" style="border-left:4px solid ${lblC}"><summary>仕様表示の詳細（揃え・色・サイズ・位置）</summary>`;
    html += `<div class="pp-row"><label>文字揃え</label><select id="pp-lalign" onchange="previewLabelStyle()">
      <option value="left"  ${el.labelAlign==='left'  ?'selected':''}>左揃え</option>
      <option value="center"${!el.labelAlign||el.labelAlign==='center'?'selected':''}>中央揃え</option>
      <option value="right" ${el.labelAlign==='right' ?'selected':''}>右揃え</option>
    </select></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-lcolor" value="${el.labelColor||'#555555'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-lcolor','pp-lcolorcode');previewLabelStyle()"><input type="text" id="pp-lcolorcode" value="${el.labelColor||'#555555'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-lcolorcode','pp-lcolor');previewLabelStyle()">${colorCodeBtns('pp-lcolorcode','pp-lcolor')}</div></div>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-lfs" value="${el.labelFs||11}" step="1" min="6" max="32" oninput="previewLabelStyle()"></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-lox" value="${el.labelOffX||0}" step="5" oninput="previewLabelOff()"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-loy" value="${el.labelOffY||''}" placeholder="自動" step="5" oninput="previewLabelOff()"></div>`;
    html += `<div class="pp-row"><button onclick="cancelLabelOff()" style="font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--bd2);border-radius:3px;cursor:pointer;color:var(--fg)">位置リセット</button></div>`;
    html += `</details>`;
    html += `</div>`; }
    html += `<div class="pp-row"><label>端子番号</label><input type="text" id="pp-term" value="${el.terminals||''}" placeholder="例: A1,A2,13,14"></div>`;
    html += `<div class="pp-row"><label>線番</label><input type="text" id="pp-wireno" value="${el.wireNo||''}"></div>`;
    html += `<div class="pp-row"><label>回転(°)</label><input type="number" id="pp-rot" value="${el.rot||0}" step="90"></div>`;
    html += `<div class="pp-row"><label>文字の回転角度(°)</label><input type="number" id="pp-trot" value="${el.textRot||0}" step="90" title="このシンボルのデバイス名・型式・仕様すべてに共通で効きます。シンボル自体の回転(上の「回転(°)」)とは連動しません。位置は各項目のオフセット(X/Y補正)で個別に指定してください"></div>`;
    html += `<div class="pp-row"><label>スケール</label><input type="number" id="pp-scale" value="${el.scale||1}" step="0.1" min="0.1" max="5" oninput="previewScale()"></div>`;
    // シンボル色ピッカーは撤去（2026-08-16）。62c94f0で完全BYLAYER化した際に
    // 描画側(draw.js)の el.color 参照を消したがUIだけ残っており、押しても画面に
    // 何も反映されない状態だった。さらに初期値が el.color||'#1d6fb5' だったため、
    // レイヤーに関係なく青が el.color へ焼き込まれる副作用もあった。
    // 色はレイヤーで分ける方針で確定（盛田さん判断）。
    html += `<div class="pp-row"><label>シンボル線種</label><select id="pp-symls"><option value=""${!el.lineStyle?' selected':''}>実線</option><option value="dash"${el.lineStyle==='dash'?' selected':''}>破線</option><option value="dot"${el.lineStyle==='dot'?' selected':''}>点線</option><option value="dashdot"${el.lineStyle==='dashdot'?' selected':''}>一点鎖線</option></select></div>`;
    html += `<div class="pp-row"><label>シンボル線幅</label><select id="pp-symlw" title="登録時の太さや標準シンボルの既定太さを、このシンボル1個だけ上書きします">
      <option value=""${!el.lineWidth?' selected':''}>個別（変更なし）</option>${lineWidthOptions(el.lineWidth)}
    </select></div>`;
    html += `<div class="pp-row"><label>レイヤー</label><select id="pp-layer">${LAYERS.map(l=>`<option value="${l.name}"${el.layer===l.name?' selected':''}>${l.name}</option>`).join('')}</select></div>`;
    if (def.jis) html += `<div class="pp-row"><label style="color:var(--fg4)">JIS規格</label><p style="font-size:10px;color:var(--fg3);padding:2px 5px">${def.jis}</p></div>`;
    // メモは既定では図面に出さない(従来どおり)。個別の注記を図面に書きたい
    // ときだけONにする。仕様(label)はデバイス単位で引き継がれて上書きされるため、
    // シンボル個別に書きたい文字(「運転」「停止」等)の逃げ道としてここを使う。
    html += `<div class="pp-row"><label>メモ</label><textarea rows="2" id="pp-note">${el.note||''}</textarea></div>`;
    html += `<div class="pp-row"><label>メモを図面に表示</label><input type="checkbox" id="pp-shownote"${el.showNote?' checked':''} title="ONにするとメモの内容が図面に描かれます。仕様と違いデバイスの引き継ぎで上書きされないので、シンボルごとに違う注記を書くのに使えます"></div>`;
    html += `<details class="pp-details"><summary>メモ表示の詳細（サイズ・色・位置）</summary>`;
    html += `<div class="pp-row"><label>サイズ</label><input type="number" id="pp-nfs" value="${el.noteFs||el.labelFs||11}" step="1" min="6" max="32"></div>`;
    html += `<div class="pp-row"><label>色</label><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap"><input type="color" id="pp-ncolor" value="${el.noteColor||'#555555'}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" oninput="syncColorCode('pp-ncolor','pp-ncolorcode')"><input type="text" id="pp-ncolorcode" value="${el.noteColor||'#555555'}" style="width:72px;font-size:11px" maxlength="7" oninput="syncColorPicker('pp-ncolorcode','pp-ncolor')">${colorCodeBtns('pp-ncolorcode','pp-ncolor')}</div></div>`;
    html += `<div class="pp-row"><label>位置X補正</label><input type="number" id="pp-nox" value="${el.noteOffX!==undefined?el.noteOffX:''}" placeholder="自動" step="5"></div>`;
    html += `<div class="pp-row"><label>位置Y補正</label><input type="number" id="pp-noy" value="${el.noteOffY!==undefined?el.noteOffY:''}" placeholder="自動" step="5"></div>`;
    html += `</details>`;
  }

  // rp.innerHTML を設定する前に _el/_wire をクリアする。
  // innerHTML 代入時に旧フォーカス要素の focusout が同期発火し、
  // 古い _el を参照したまま applyRightPanel() が呼ばれると
  // 存在しない pp-layer を '' で読んでコピー元のレイヤーを破壊するバグがあるため。
  rp._el = null; rp._wire = null;
  rp.innerHTML = html;
  rp._el = el; rp._wire = wire;
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
    `<input type="color" id="${pickerId}" value="${defaultColor}" style="width:36px;height:24px;padding:1px;border:1px solid var(--bd2);border-radius:3px;cursor:pointer;flex-shrink:0" ${focusBlur} oninput="syncColorCode('${pickerId}','${codeId}');${onInput||''}">` +
    `<input type="text" id="${codeId}" value="${defaultColor}" style="width:72px;font-size:11px" maxlength="7" ${focusBlur} oninput="syncColorPicker('${codeId}','${pickerId}');${onInput||''}">` +
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
    el.showNote  = !!document.getElementById('pp-shownote')?.checked;
    el.noteFs    = parseInt(v('pp-nfs')) || undefined;
    el.noteColor = v('pp-ncolorcode') || v('pp-ncolor') || undefined;
    el.noteOffX  = v('pp-nox') !== '' ? parseInt(v('pp-nox')) : undefined;
    el.noteOffY  = v('pp-noy') !== '' ? parseInt(v('pp-noy')) : undefined;
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
    el.scale      = Math.max(0.1, Math.min(5, parseFloat(v('pp-scale'))||1));
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
  draw();
}

// デバイス/型式/仕様の書式コピー・貼り付け(2026-08-03追加)。
// シンボルの種類(type)が変わっても、デバイス名・型番・文字サイズ/色/位置一式を
// まとめて他のシンボルへ複製できるようにする。1個コピー→複数選択へまとめて貼り付け、も可能。
const DEVICE_PROP_KEYS = [
  'label','labelAlign','labelColor','labelFs','labelOffX','labelOffY',
  'partRef','devHide','showDev','devFs','devColor','devOffX','devOffY',
  'partModel','partVolt','showModel','modelFs','modelColor','modelOffX','modelOffY',
  'textRot',
];
// 端子(junction)の見た目コピー・貼り付け(2026-08-23)。対象は表示ON/OFFと
// 色・サイズ・位置補正のみ。デバイス識別情報(partRef/partModel/panelZone)と
// label(端子番号)は意図的に含めない(上のHTML生成部のコメント参照)。
const JUNCTION_PROP_KEYS = [
  'showDev','devFs','devColor','devOffX','devOffY',
  'labelFs','labelColor','labelOffX','labelOffY',
];
function copyJunctionProps() {
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  if (!el || el.type !== 'junction') { alert('コピー元の端子を1つ選択してください'); return; }
  applyRightPanel(); // パネルの未確定編集を先に反映してからコピーする
  junctionClipboard = {};
  JUNCTION_PROP_KEYS.forEach(k => { if (el[k] !== undefined) junctionClipboard[k] = el[k]; });
  updateRightPanel();
}
function pasteJunctionProps() {
  if (!junctionClipboard) { alert('先に「コピー」で端子の見た目をコピーしてください'); return; }
  const targets = state.sel.els.size
    ? state.elements.filter(e => state.sel.els.has(e.id) && e.type === 'junction')
    : (document.getElementById('rp-body')._el?.type === 'junction' ? [document.getElementById('rp-body')._el] : []);
  if (!targets.length) { alert('貼り付け先の端子を選択してください'); return; }
  pushH();
  targets.forEach(el => {
    JUNCTION_PROP_KEYS.forEach(k => {
      if (junctionClipboard[k] === undefined) delete el[k]; else el[k] = junctionClipboard[k];
    });
  });
  draw();
  updateRightPanel();
}

function copyDeviceProps() {
  const rp = document.getElementById('rp-body');
  const el = rp._el;
  if (!el || el.type === 'junction') { alert('コピー元のシンボルを1つ選択してください'); return; }
  applyRightPanel(); // パネルの未確定編集を先に反映してからコピーする
  deviceClipboard = {};
  DEVICE_PROP_KEYS.forEach(k => { if (el[k] !== undefined) deviceClipboard[k] = el[k]; });
  updateRightPanel();
}
function pasteDeviceProps() {
  if (!deviceClipboard) { alert('先に「コピー」でデバイス/型式/仕様をコピーしてください'); return; }
  const targets = state.sel.els.size
    ? state.elements.filter(e => state.sel.els.has(e.id) && e.type !== 'junction')
    : (document.getElementById('rp-body')._el ? [document.getElementById('rp-body')._el] : []);
  if (!targets.length) { alert('貼り付け先のシンボルを選択してください'); return; }
  pushH();
  targets.forEach(el => {
    DEVICE_PROP_KEYS.forEach(k => {
      if (deviceClipboard[k] === undefined) delete el[k]; else el[k] = deviceClipboard[k];
    });
  });
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
  resize(); draw();
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
  resize(); draw();
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
function saveSymbolsToStorage() {
  try { localStorage.setItem('ecad_customSymbols', JSON.stringify(state.customSymbols)); } catch(e) {}
}

function loadSymbolsFromStorage() {
  try {
    const data = localStorage.getItem('ecad_customSymbols');
    if (!data) return;
    const syms = JSON.parse(data);
    if (!Array.isArray(syms)) return;
    // プロジェクトのシンボルとマージ（typeが重複しないように）
    const existing = new Set(state.customSymbols.map(s => s.type));
    syms.forEach(s => {
      if (!existing.has(s.type)) {
        state.customSymbols.push(s);
        if (typeof DEFS !== 'undefined') DEFS[s.type] = s;
      }
    });
  } catch(e) {}
}

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
        syms.forEach(s => {
          if (!existing.has(s.type)) {
            state.customSymbols.push(s);
            if (typeof DEFS !== 'undefined') DEFS[s.type] = s;
          }
        });
        saveSymbolsToStorage();
        renderSymFloat();
        alert(`${syms.length}件のシンボルを読み込みました`);
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
        <span style="font-size:9px;text-align:center;line-height:1.2">${s.label||s.type}</span>
        <span style="font-size:8px;color:var(--fg3);line-height:1">${wDisp}×${hDisp}</span>
        <span onclick="event.stopPropagation();openPinEditor('${s.type}')" title="端子(ピン)編集: ${termCount}点定義済み" style="position:absolute;top:2px;left:2px;font-size:9px;color:${termCount?'#0067c0':'var(--fg3)'};cursor:pointer">📍${termCount||''}</span>
        <span onclick="event.stopPropagation();rescaleCustomSym('${s.type}')" title="サイズ調整: 比率を保って幅×高さを変更" style="position:absolute;top:2px;right:14px;font-size:9px;color:var(--fg3);cursor:pointer">⇔</span>
        <span onclick="event.stopPropagation();delCusSym('${s.type}')" style="position:absolute;top:2px;right:2px;font-size:9px;color:var(--red);cursor:pointer">×</span>
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
  saveSymbolsToStorage();
  renderSymFloat();
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
    if (moved) saveSymbolsToStorage();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// 種別コード→表示名。CSV一括登録欄のヘルプ文言(js/ui.js内 別箇所)と揃えること。
const PART_TYPE_LABELS = {
  // 開閉器類。electromagnetic contactor(単体)とstarter(サーマル一体)は
  // 型番自体が変わる別部品なので分けている(S-T21 と MSO-T21 等)。
  contactor: '電磁接触器', starter: '電磁開閉器(サーマル一体)',
  coil: 'リレーコイル', timer: 'タイマ', thermal: 'サーマルリレー',
  // 操作機器。押ボタンとセレクタはa接点/b接点とは別物なので専用コードにした。
  pb: '押ボタン', pb_lamp: '照光押ボタン', pb_estop: '非常停止',
  selector: 'セレクタ', selector_key: '鍵付セレクタ', selector_lamp: '照光セレクタ',
  selector_pb: 'セレクタ押ボタン', lever: 'モノレバー',
  // コンタクトユニット(接点ブロック単体)。押ボタン・セレクタ共通の発注単位で、
  // 改造や接点追加のときに単体で購入する(IDEC HW-CNP10等)。
  // カタログの呼び方をそのまま使う(通称は誤解のもと、2026-08-23 盛田さん判断)。
  // 旧 sw_no(a接点)/sw_nc(b接点) を置き換えたもの。a接点/b接点は接点構成であって
  // 部品の分類ではなく、型式の中(HW1B-M1P10のP10部分)に含まれるため種別で持たない。
  contact_unit: 'コンタクトユニット',
  lamp: 'ランプ・表示灯',
  breaker: 'ブレーカ', fuse: 'ヒューズ', transformer: 'トランス', terminal: '端子台',
  // インバータとサーボアンプは別物なので分ける(2026-08-23、盛田さん指示で新設)。
  // どちらも端子が図面に散らばる装置なのでDEVICE_PART_TYPES(report.js)にも入れる。
  inverter: 'インバータ',
  servo: 'サーボアンプ', servo_motor: 'サーボモータ', motor: 'モーター',
  plc: 'PLC(シーケンサ)', plc_unit: 'PLC増設ユニット', hmi: 'タッチパネル・表示器',
  option: '増設ユニット等(付属品)',
  '': '(種別未設定)',
};
const PART_TYPE_ORDER = ['breaker','contactor','starter','thermal','coil','timer','pb','pb_lamp','pb_estop','selector','selector_key','selector_lamp','selector_pb','lever','contact_unit','lamp','inverter','servo','servo_motor','motor','plc','plc_unit','hmi','terminal','fuse','transformer','option'];
// 折りたたみ状態。2026-08-19よりメーカーを第一階層、種別を第二階層とする2段構造に変更。
// キーはメーカー名(第一階層)、または「メーカー名\u0000種別」(第二階層)。
// 既定は全部閉じた状態。検索中は無視して全部展開する。リロードごとにリセット(永続化なし)。
state.partsCollapsed = state.partsCollapsed || {};
// 未知のキーは「閉じている」とみなすため、初期化で全部trueを詰める必要はない
// (partsCollapsed[key]がundefinedのときは閉じた扱いにする)
function _isCollapsed(key) {
  return state.partsCollapsed[key] !== false;
}
function togglePartsMaker(maker) {
  state.partsCollapsed[maker] = !_isCollapsed(maker) ? true : false;
  renderPartsTable2(_lastPartsList || allParts());
}
function togglePartsCategory(maker, type) {
  const key = maker + '\u0000' + type;
  state.partsCollapsed[key] = !_isCollapsed(key) ? true : false;
  renderPartsTable2(_lastPartsList || allParts());
}
// ----------------------------------------------------------------
// 部品DBフローティングパネル
// ----------------------------------------------------------------
function renderPartsFloat() {
  _lastPartsQuery = '';
  const searchEl = document.getElementById('part-search2');
  if (searchEl) searchEl.value = '';
  renderMakerTabs();
  renderPartsTable2(applyPartsFilters());
}
// メーカー別タブ(全て/三菱電機/...)。増える一方の部品DBを軸2つ(種別・メーカー)で
// 絞れるようにする(2026-08-17、種別グループ化だけでは「三菱だけ見たい」に対応できないため)。
state.partsMakerFilter = state.partsMakerFilter || '';
function renderMakerTabs() {
  const el = document.getElementById('parts-maker-tabs');
  if (!el) return;
  const makers = [...new Set(allParts().map(p => p.maker).filter(Boolean))].sort();
  if (makers.length <= 1) { el.innerHTML = ''; return; }
  const chip = (label, val) => `<span onclick="setPartsMakerFilter('${val.replace(/'/g, "\\'")}')" style="font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer;white-space:nowrap;${
    state.partsMakerFilter === val ? 'background:var(--acc);color:#fff' : 'background:var(--bg3);color:var(--fg3);border:1px solid var(--bd2)'
  }">${label}</span>`;
  el.innerHTML = chip('全て', '') + makers.map(m => chip(m, m)).join('');
}
function setPartsMakerFilter(m) {
  state.partsMakerFilter = m;
  renderMakerTabs();
  renderPartsTable2(applyPartsFilters());
}
// 検索欄(型番・メーカー文字列)とメーカータブ、両方の絞り込みをまとめて適用する
function applyPartsFilters() {
  const q = _lastPartsQuery;
  return allParts().filter(p => {
    if (state.partsMakerFilter && p.maker !== state.partsMakerFilter) return false;
    if (q && !p.ref.toLowerCase().includes(q.toLowerCase()) && !p.maker.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
}
let _lastPartsList = null;
let _lastPartsQuery = '';
function renderPartsTable2(parts) {
  const el = document.getElementById('parts-table2');
  if (!el) return;
  _lastPartsList = parts;
  const hiddenCount = (state.hiddenBuiltinRefs || []).length;
  const searching = !!_lastPartsQuery || !!state.partsMakerFilter;

  // メーカー(第一階層) → 種別(第二階層) の2段でグループ化する。
  // 部品数が数百件規模になり、種別だけの1段では一覧が長くなりすぎるため
  // 2026-08-19にこの構造へ変更した。検索中は絞り込み結果を見せたいので全部展開する。
  const byMaker = {};
  parts.forEach(p => {
    const mk = p.maker || '(メーカー未設定)';
    (byMaker[mk] = byMaker[mk] || []).push(p);
  });
  // メーカーは件数の多い順(同数なら名前順)で並べる
  const makersPresent = Object.keys(byMaker).sort((a, b) =>
    byMaker[b].length - byMaker[a].length || a.localeCompare(b, 'ja'));

  const cardHtml = p => `
    <div style="padding:4px 3px;border-bottom:1px solid var(--bg4);cursor:pointer" title="選択中のシンボルにこの部品を割り当てます（型番・端子番号・コイル電圧）" onclick="placePart('${p.type}','${p.ref}','${p.terminals||''}')">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;font-weight:600;color:var(--fg)">${p.ref}</span>
        ${p.custom
          ? `<span>
               <span onclick="event.stopPropagation();editPart('${p.ref}')" style="font-size:9px;color:var(--acc);cursor:pointer;margin-right:6px" title="編集">✎</span>
               <span onclick="event.stopPropagation();deletePart('${p.ref}')" style="font-size:9px;color:var(--red);cursor:pointer" title="削除">×</span>
             </span>`
          : `<span onclick="event.stopPropagation();hideBuiltinPart('${p.ref}')" style="font-size:9px;color:var(--fg3);cursor:pointer" title="一覧から非表示にする（標準部品は削除できないため）">×</span>`}
      </div>
      <div style="font-size:10px;color:var(--fg3)">${p.maker} ${p.volt||''} ${p.amp||''}</div>
      ${p.contacts?`<div style="font-size:10px;color:var(--acc)">接点:${p.contacts}</div>`:''}
      ${p.source?`<div style="font-size:9px;color:var(--fg3)" title="出典">📖 ${p.source}</div>`:''}
      ${p.outlineDxf
        ? `<div style="font-size:9px;color:var(--acc)">外形図: ${p.outlineDxfName||'あり'} <span onclick="event.stopPropagation();placePartOutline('${p.ref}')" style="cursor:pointer;text-decoration:underline">配置</span></div>`
        : (p.custom ? `<div style="font-size:9px;color:var(--fg3)">外形図なし <span onclick="event.stopPropagation();attachOutlineToPart('${p.ref}')" style="cursor:pointer;text-decoration:underline;color:var(--acc)">添付</span></div>` : '')}
    </div>`;

  el.innerHTML = makersPresent.map(mk => {
    const mkParts = byMaker[mk];
    const mkCollapsed = !searching && _isCollapsed(mk);
    // このメーカー内を種別でさらに分ける
    const groups = {};
    mkParts.forEach(p => { (groups[p.type] = groups[p.type] || []).push(p); });
    const typesPresent = PART_TYPE_ORDER.filter(t => groups[t]?.length);
    Object.keys(groups).forEach(t => { if (!typesPresent.includes(t)) typesPresent.push(t); });

    const inner = mkCollapsed ? '' : typesPresent.map(t => {
      const list = groups[t];
      const key = mk + '\u0000' + t;
      const collapsed = !searching && _isCollapsed(key);
      // 2026-08-23: 廃止した種別(sw_no/sw_nc)で登録されたままの部品は、
      // 生のコードではなく「a接点(要再分類)」のように表示して、直す必要が
      // あることが一覧を見ただけで分かるようにする。
      const label = PART_TYPE_LABELS[t]
        || (LEGACY_PART_TYPES[t] ? `${LEGACY_PART_TYPES[t]}（要再分類）` : t);
      return `<div class="parts-cat" style="margin-left:8px">
        <div onclick="togglePartsCategory('${mk.replace(/'/g,"\\'")}','${t}')" style="display:flex;justify-content:space-between;align-items:center;padding:4px;cursor:pointer;background:var(--bg2);border-radius:3px;margin-top:3px">
          <span style="font-size:10px;color:var(--fg2)">${label}（${list.length}）</span>
          <span style="font-size:9px;color:var(--fg3)">${collapsed ? '▶' : '▼'}</span>
        </div>
        ${collapsed ? '' : list.map(cardHtml).join('')}
      </div>`;
    }).join('');

    return `<div class="parts-maker">
      <div onclick="togglePartsMaker('${mk.replace(/'/g,"\\'")}')" style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;cursor:pointer;background:var(--bg3);border-radius:3px;margin-top:5px;border-left:3px solid var(--acc)">
        <span style="font-size:12px;font-weight:600;color:var(--fg)">${mk}（${mkParts.length}）</span>
        <span style="font-size:10px;color:var(--fg3)">${mkCollapsed ? '▶' : '▼'}</span>
      </div>
      ${inner}
    </div>`;
  }).join('')
    + (hiddenCount ? `<div style="padding:6px 3px;text-align:center"><span onclick="showHiddenBuiltinParts()" style="font-size:10px;color:var(--acc);cursor:pointer;text-decoration:underline">非表示にした標準部品(${hiddenCount}件)を確認・復元</span></div>` : '');
}
function filterParts(q) {
  _lastPartsQuery = q || '';
  renderPartsTable2(applyPartsFilters());
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
    function onUp() { window.removeEventListener('pointermove',onMove); window.removeEventListener('pointerup',onUp); window.removeEventListener('pointercancel',onUp); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
}
function symFloatDown(e) { _makeFloatDrag('sym-float')(e); }
function prtFloatDown(e) { _makeFloatDrag('prt-float')(e); }

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
