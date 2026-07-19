// ================================================================
// symbol_lib.js — シンボルライブラリビューア
// ================================================================

const symLib = (() => {
  let zipData = null;
  let zipIndex = {}; // lowercase path (拡張子なし) → 実際のZIPキー（大文字小文字対応）
  let indexData = null;
  let filtered = [];
  let previewEntry = null;
  let previewShapes = [];
  let favorites = JSON.parse(localStorage.getItem('symLibFav') || '[]');
  let recent = JSON.parse(localStorage.getItem('symLibRecent') || '[]');
  let activeTab = 'list'; // 'list' | 'fav' | 'recent'
  let thumbObserver = null;

  // ── パネル生成 ──────────────────────────────────────────────
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'symLibPanel';
    panel.style.cssText = 'position:fixed;top:50px;right:10px;width:340px;height:calc(100vh - 60px);background:var(--bg2,#1e1e1e);border:1px solid var(--bd2,#444);border-radius:6px;display:flex;flex-direction:column;z-index:9000;color:var(--fg,#ddd);font-family:sans-serif;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    panel.innerHTML = `
<div style="padding:8px 10px;background:var(--bg3,#2a2a2a);border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd2,#444);flex-shrink:0">
  <b style="font-size:13px;">📚 シンボルライブラリ</b>
  <button id="symLibClose" style="background:none;border:none;color:var(--fg3,#aaa);cursor:pointer;font-size:16px;">✕</button>
</div>
<div style="display:flex;border-bottom:1px solid var(--bd2,#444);flex-shrink:0">
  <button id="symTabList" style="flex:1;padding:6px;background:var(--bg3,#252525);border:none;border-bottom:2px solid #0067c0;color:var(--fg,#ddd);cursor:pointer;font-size:12px;">一覧</button>
  <button id="symTabFav"  style="flex:1;padding:6px;background:var(--bg2,#1e1e1e);border:none;border-bottom:2px solid transparent;color:var(--fg3,#888);cursor:pointer;font-size:12px;">⭐ お気に入り</button>
  <button id="symTabRecent" style="flex:1;padding:6px;background:var(--bg2,#1e1e1e);border:none;border-bottom:2px solid transparent;color:var(--fg3,#888);cursor:pointer;font-size:12px;">🕒 最近</button>
</div>
<div id="symListPane" style="display:flex;flex-direction:column;flex:1;min-height:0;">
  <div style="padding:6px 8px;border-bottom:1px solid var(--bd,#333);flex-shrink:0;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <button id="symLibZipBtn" style="background:#0067c0;border:none;color:#fff;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;flex-shrink:0;">📂 ZIPを選択</button>
      <input type="file" id="symLibZip" accept=".zip" style="display:none;">
    </div>
    <div id="symLibStatus" style="font-size:10px;color:var(--fg3,#888);">ZIPを選択してください</div>
  </div>
  <div style="padding:5px 6px;border-bottom:1px solid var(--bd,#333);display:flex;gap:3px;flex-wrap:wrap;flex-shrink:0;">
    <select id="symLibStd" style="flex:1;background:var(--bg3,#333);color:var(--fg,#ddd);border:1px solid var(--bd2,#555);border-radius:3px;padding:2px;font-size:10px;">
      <option value="">規格（全て）</option>
      <option value="JIS_C_0617">JIS C 0617</option>
      <option value="JSIA_118">JSIA 118</option>
    </select>
    <select id="symLibCat" style="flex:1;background:var(--bg3,#333);color:var(--fg,#ddd);border:1px solid var(--bd2,#555);border-radius:3px;padding:2px;font-size:10px;">
      <option value="">図面種別（全て）</option>
      <option value="単線図用">単線図用</option>
      <option value="展開図用">展開図用</option>
      <option value="複線図用">複線図用</option>
    </select>
    <select id="symLibType3" style="flex:1 1 100%;background:var(--bg3,#333);color:var(--fg,#ddd);border:1px solid var(--bd2,#555);border-radius:3px;padding:2px;font-size:10px;">
      <option value="">種類（全て）</option>
    </select>
    <input id="symLibSearch" type="text" placeholder="🔍 シンボル名検索..."
      style="flex:1 1 100%;background:var(--bg3,#2a2a2a);color:var(--fg,#ddd);border:1px solid var(--bd2,#555);border-radius:3px;padding:3px 5px;font-size:10px;">
  </div>
  <div id="symLibCount" style="padding:2px 8px;font-size:10px;color:var(--fg3,#888);border-bottom:1px solid var(--bd,#333);flex-shrink:0;"></div>
  <div id="symLibList" style="flex:1;overflow-y:auto;padding:4px;"></div>
</div>
<div id="symFavPane" style="display:none;flex-direction:column;flex:1;min-height:0;">
  <div style="padding:5px 8px;font-size:11px;color:var(--fg3,#888);border-bottom:1px solid var(--bd,#333);flex-shrink:0;">
    ⭐ お気に入り <span id="symFavCount" style="color:var(--fg3,#aaa);"></span>
  </div>
  <div id="symFavList" style="flex:1;overflow-y:auto;padding:4px;"></div>
</div>
<div id="symRecentPane" style="display:none;flex-direction:column;flex:1;min-height:0;">
  <div style="padding:5px 8px;font-size:11px;color:var(--fg3,#888);border-bottom:1px solid var(--bd,#333);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">
    <span>🕒 最近使った <span id="symRecentCount" style="color:var(--fg3,#aaa);"></span></span>
    <button id="symRecentClear" style="background:none;border:1px solid var(--bd2,#555);color:var(--fg3,#888);border-radius:3px;cursor:pointer;font-size:10px;padding:1px 6px;">全消去</button>
  </div>
  <div id="symRecentList" style="flex:1;overflow-y:auto;padding:4px;"></div>
</div>
<div id="symLibPreview" style="border-top:1px solid var(--bd,#333);display:none;flex-direction:column;flex-shrink:0;">
  <div style="padding:5px 8px;background:var(--bg3,#252525);display:flex;align-items:center;gap:4px;">
    <span id="symLibPreviewName" style="font-size:11px;color:var(--fg2,#ccc);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
    <button id="symLibFavBtn" title="お気に入り" style="background:none;border:none;cursor:pointer;font-size:14px;flex-shrink:0;">☆</button>
    <button id="symLibAdd" style="background:#0067c0;border:none;color:#fff;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px;flex-shrink:0;">追加</button>
  </div>
  <canvas id="symLibCanvas" width="320" height="130" style="background:#111;display:block;margin:4px auto;"></canvas>
</div>`;
    document.body.appendChild(panel);

    document.getElementById('symLibClose').onclick = () => { panel.style.display = 'none'; };
    document.getElementById('symLibZipBtn').onclick = onZipPickerClick;
    document.getElementById('symLibZip').onchange = onZipSelected;
    document.getElementById('symLibStd').onchange = applyFilter;
    document.getElementById('symLibCat').onchange = applyFilter;
    document.getElementById('symLibType3').onchange = applyFilter;
    document.getElementById('symLibSearch').oninput = applyFilter;
    document.getElementById('symLibAdd').onclick = addToCanvas;
    document.getElementById('symLibFavBtn').onclick = toggleFavorite;
    document.getElementById('symTabList').onclick = () => switchTab('list');
    document.getElementById('symTabFav').onclick = () => switchTab('fav');
    document.getElementById('symTabRecent').onclick = () => switchTab('recent');
    document.getElementById('symRecentClear').onclick = () => {
      if (!recent.length) return;
      if (confirm('最近使った履歴を全て消去しますか?')) { recent = []; saveRecent(); renderRecentList(); }
    };
    return panel;
  }

  function switchTab(tab) {
    activeTab = tab;
    const panes = { list: 'symListPane', fav: 'symFavPane', recent: 'symRecentPane' };
    const btns  = { list: ['symTabList', '#0067c0'], fav: ['symTabFav', '#f5a623'], recent: ['symTabRecent', '#6fbf6f'] };
    Object.keys(panes).forEach(k => {
      const pane = document.getElementById(panes[k]);
      const btn  = document.getElementById(btns[k][0]);
      const on = (k === tab);
      if (pane) pane.style.display = on ? 'flex' : 'none';
      if (btn) {
        btn.style.borderBottomColor = on ? btns[k][1] : 'transparent';
        btn.style.color = on ? 'var(--fg,#ddd)' : 'var(--fg3,#888)';
        btn.style.background = on ? 'var(--bg3,#252525)' : 'var(--bg2,#1e1e1e)';
      }
    });
    if (tab === 'fav') renderFavList();
    if (tab === 'recent') renderRecentList();
  }

  // ── ZIP ──────────────────────────────────────────────────────
  async function onZipSelected(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      await loadZipFromFile(file);
      // input[type=file] 経由ではFileSystemFileHandleが取れないので保存不可
      // File System Access API が使える場合はボタン経由で保存済み
    } catch (err) { setStatus('エラー: ' + err.message); }
  }

  async function onZipPickerClick() {
    if (!window.showOpenFilePicker) {
      document.getElementById('symLibZip')?.click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] });
      await saveFileHandle(handle);
      const file = await handle.getFile();
      await loadZipFromFile(file);
    } catch(e) { if (e.name !== 'AbortError') setStatus('エラー: ' + e.message); }
  }

  async function loadIndex() {
    if (!indexData) {
      const res = await fetch('./js/symbol_index.json');
      indexData = await res.json();
    }
    buildType3Select();
    applyFilter();
  }

  function setStatus(msg) { const el = document.getElementById('symLibStatus'); if (el) el.textContent = msg; }

  // 大文字小文字・パス構造を吸収したZIPファイル検索
  function findZipFile(path) {
    if (!zipData) return null;
    // 完全一致（小文字.dxf）
    let f = zipData.file(path + '.dxf');
    if (f) return f;
    // 大文字.DXF
    f = zipData.file(path + '.DXF');
    if (f) return f;
    // zipIndexで大文字小文字非依存検索
    const lower = path.toLowerCase();
    const actualKey = zipIndex[lower];
    if (actualKey) return zipData.file(actualKey);
    // ファイル名だけで検索（ディレクトリ構造が違う場合）
    const fname = path.split('/').pop().toLowerCase();
    const fallbackKey = Object.keys(zipIndex).find(k => k.split('/').pop() === fname);
    if (fallbackKey) return zipData.file(zipIndex[fallbackKey]);
    return null;
  }

  function buildType3Select() {
    if (!indexData) return;
    const sel = document.getElementById('symLibType3'); if (!sel) return;
    const types = [...new Set(indexData.map(e => e.type3))].sort();
    sel.innerHTML = '<option value="">種類（全て）</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  function applyFilter() {
    if (!indexData) return;
    const std   = document.getElementById('symLibStd').value;
    const cat   = document.getElementById('symLibCat').value;
    const type3 = document.getElementById('symLibType3').value;
    const q     = (document.getElementById('symLibSearch').value || '').trim();
    filtered = indexData.filter(e => {
      if (std   && e.std   !== std)   return false;
      if (cat   && e.cat   !== cat)   return false;
      if (type3 && e.type3 !== type3) return false;
      if (q && !e.label.includes(q) && !e.fname.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const countEl = document.getElementById('symLibCount');
    if (countEl) countEl.textContent = `${filtered.length} 件${filtered.length <= 50 ? ' — サムネイル表示' : ''}`;
    renderList();
  }

  // ── リスト / サムネイルグリッド ────────────────────────────────
  function renderList() {
    const list = document.getElementById('symLibList'); if (!list) return;
    if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }

    if (filtered.length <= 50 && zipData) {
      // サムネイルグリッド表示
      const show = filtered.slice(0, 100);
      list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:2px;">` +
        show.map((e, i) => {
          const isFav = favorites.some(f => f.path === e.path);
          return `<div class="slItem" data-idx="${i}" style="border:1px solid var(--bd,#333);border-radius:4px;cursor:pointer;background:var(--bg3,#252525);padding:4px;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative;">
            <span class="addBtn" data-idx="${i}" title="キャンバスへ追加" style="position:absolute;top:1px;left:3px;font-size:13px;cursor:pointer;color:#6fbf6f;font-weight:bold;">＋</span>
            <span class="favStar" data-idx="${i}" style="position:absolute;top:2px;right:3px;font-size:11px;cursor:pointer;color:${isFav?'#f5a623':'#555'};">${isFav?'★':'☆'}</span>
            <canvas class="thumbCanvas" data-idx="${i}" width="90" height="60" style="background:#111;border-radius:2px;display:block;"></canvas>
            <div style="font-size:9px;color:var(--acc,#9ec6f7);text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.label}">${e.label}</div>
          </div>`;
        }).join('') + `</div>`;

      // クリックイベント
      list.querySelectorAll('.slItem').forEach(el => {
        el.onmouseover = () => { el.style.filter = 'brightness(1.2)'; };
        el.onmouseout  = () => { el.style.filter = ''; };
        el.onclick = (ev) => {
          if (ev.target.classList.contains('favStar') || ev.target.classList.contains('addBtn')) return;
          selectEntry(filtered[parseInt(el.dataset.idx)]);
        };
        el.ondblclick = () => addEntry(filtered[parseInt(el.dataset.idx)]);
      });
      list.querySelectorAll('.addBtn').forEach(btn => {
        btn.onclick = (ev) => { ev.stopPropagation(); addEntry(filtered[parseInt(btn.dataset.idx)]); };
      });
      list.querySelectorAll('.favStar').forEach(star => {
        star.onclick = (ev) => {
          ev.stopPropagation();
          const e = filtered[parseInt(star.dataset.idx)];
          toggleFavEntry(e);
          star.textContent = favorites.some(f => f.path === e.path) ? '★' : '☆';
          star.style.color = favorites.some(f => f.path === e.path) ? '#f5a623' : '#555';
        };
      });

      // 遅延サムネイル生成
      if (typeof IntersectionObserver !== 'undefined') {
        thumbObserver = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const cv = entry.target;
            const idx = parseInt(cv.dataset.idx);
            if (cv.dataset.loaded) return;
            cv.dataset.loaded = '1';
            thumbObserver.unobserve(cv);
            generateThumb(cv, filtered[idx]);
          });
        }, { root: list, rootMargin: '60px' });
        list.querySelectorAll('.thumbCanvas').forEach(cv => thumbObserver.observe(cv));
      } else {
        // フォールバック: 全部生成
        list.querySelectorAll('.thumbCanvas').forEach(cv => {
          const idx = parseInt(cv.dataset.idx);
          generateThumb(cv, filtered[idx]);
        });
      }
    } else {
      // テキストリスト表示
      const show = filtered.slice(0, 200);
      list.innerHTML = show.map((e, i) => {
        const isFav = favorites.some(f => f.path === e.path);
        return `<div class="slItem" data-idx="${i}" style="padding:5px 6px;margin:2px 0;border-radius:3px;cursor:pointer;background:var(--bg3,#252525);border:1px solid var(--bd,#333);display:flex;align-items:center;gap:4px;">
          <div style="flex:1;">
            <div style="font-weight:bold;color:var(--acc,#9ec6f7);font-size:11px;">${e.label}</div>
            <div style="color:var(--fg3,#777);font-size:10px;">${e.std.replace('_',' ')} / ${e.cat} / ${e.fname}</div>
          </div>
          <span class="addBtn" data-idx="${i}" title="キャンバスへ追加" style="font-size:15px;cursor:pointer;color:#6fbf6f;font-weight:bold;flex-shrink:0;">＋</span>
          <span class="favStar" data-idx="${i}" style="font-size:13px;cursor:pointer;color:${isFav?'#f5a623':'#555'};flex-shrink:0;">${isFav?'★':'☆'}</span>
        </div>`;
      }).join('');
      if (filtered.length > 200) {
        list.innerHTML += `<div style="padding:6px;color:var(--fg3,#888);font-size:11px;text-align:center;">※ ${filtered.length-200}件省略。絞り込んでください。</div>`;
      }
      list.querySelectorAll('.slItem').forEach(el => {
        el.onmouseover = () => { el.style.filter = 'brightness(1.2)'; };
        el.onmouseout  = () => { el.style.filter = ''; };
        el.onclick = (ev) => {
          if (ev.target.classList.contains('favStar') || ev.target.classList.contains('addBtn')) return;
          selectEntry(filtered[parseInt(el.dataset.idx)]);
        };
        el.ondblclick = () => addEntry(filtered[parseInt(el.dataset.idx)]);
      });
      list.querySelectorAll('.addBtn').forEach(btn => {
        btn.onclick = (ev) => { ev.stopPropagation(); addEntry(filtered[parseInt(btn.dataset.idx)]); };
      });
      list.querySelectorAll('.favStar').forEach(star => {
        star.onclick = (ev) => {
          ev.stopPropagation();
          const e = filtered[parseInt(star.dataset.idx)];
          toggleFavEntry(e);
          star.textContent = favorites.some(f => f.path === e.path) ? '★' : '☆';
          star.style.color = favorites.some(f => f.path === e.path) ? '#f5a623' : '#555';
        };
      });
    }
  }

  // ── サムネイル生成 ────────────────────────────────────────────
  async function generateThumb(canvas, entry) {
    if (!zipData || !entry) return;
    const zFile = findZipFile(entry.path); if (!zFile) return;
    try {
      const buf = await zFile.async('arraybuffer');
      const text = new TextDecoder('shift-jis').decode(buf);
      const shapes = parseDxfShapes(text);
      drawOnCanvas(canvas, shapes, '#9ec6f7', 1.0);
    } catch(e) {}
  }

  // ── お気に入りリスト ──────────────────────────────────────────
  function renderFavList() {
    const list = document.getElementById('symFavList'); if (!list) return;
    const countEl = document.getElementById('symFavCount');
    if (countEl) countEl.textContent = `(${favorites.length}件)`;

    if (!favorites.length) {
      list.innerHTML = '<div style="padding:16px;color:var(--fg3,#666);font-size:11px;text-align:center;">⭐ をクリックして追加してください</div>';
      return;
    }

    if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }

    list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:2px;">` +
      favorites.map((e, i) =>
        `<div class="favItem" data-idx="${i}" style="border:1px solid var(--ora,#554400);border-radius:4px;cursor:pointer;background:var(--obg,#2a2400);padding:4px;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative;">
          <span class="favAdd" data-idx="${i}" title="キャンバスへ追加" style="position:absolute;top:1px;left:3px;font-size:13px;cursor:pointer;color:#6fbf6f;font-weight:bold;">＋</span>
          <span class="favRemove" data-idx="${i}" style="position:absolute;top:2px;right:3px;font-size:10px;cursor:pointer;color:#f5a623;">★</span>
          <canvas class="favThumb" data-idx="${i}" width="90" height="60" style="background:#111;border-radius:2px;display:block;"></canvas>
          <div style="font-size:9px;color:var(--ofg,#f5c842);text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.label}">${e.label}</div>
        </div>`
      ).join('') + `</div>`;

    list.querySelectorAll('.favItem').forEach(el => {
      el.onmouseover = () => { el.style.filter = 'brightness(1.2)'; };
      el.onmouseout  = () => { el.style.filter = ''; };
      el.onclick = (ev) => {
        if (ev.target.classList.contains('favRemove') || ev.target.classList.contains('favAdd')) return;
        selectEntry(favorites[parseInt(el.dataset.idx)]);
      };
      el.ondblclick = () => addEntry(favorites[parseInt(el.dataset.idx)]);
    });
    list.querySelectorAll('.favAdd').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); addEntry(favorites[parseInt(btn.dataset.idx)]); };
    });
    list.querySelectorAll('.favRemove').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        favorites.splice(idx, 1);
        saveFavorites();
        renderFavList();
      };
    });

    // 遅延サムネイル
    if (typeof IntersectionObserver !== 'undefined') {
      thumbObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const cv = entry.target;
          if (cv.dataset.loaded) return;
          cv.dataset.loaded = '1';
          thumbObserver.unobserve(cv);
          generateThumb(cv, favorites[parseInt(cv.dataset.idx)]);
        });
      }, { root: list, rootMargin: '60px' });
      list.querySelectorAll('.favThumb').forEach(cv => thumbObserver.observe(cv));
    } else {
      list.querySelectorAll('.favThumb').forEach(cv => {
        generateThumb(cv, favorites[parseInt(cv.dataset.idx)]);
      });
    }
  }

  // ── 最近使ったリスト ──────────────────────────────────────────
  function renderRecentList() {
    const list = document.getElementById('symRecentList'); if (!list) return;
    const countEl = document.getElementById('symRecentCount');
    if (countEl) countEl.textContent = `(${recent.length}件)`;

    if (!recent.length) {
      list.innerHTML = '<div style="padding:16px;color:var(--fg3,#666);font-size:11px;text-align:center;">シンボルを追加すると履歴が表示されます</div>';
      return;
    }

    if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }

    list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:2px;">` +
      recent.map((e, i) =>
        `<div class="recItem" data-idx="${i}" style="border:1px solid var(--grn,#2e4a38);border-radius:4px;cursor:pointer;background:var(--gbg,#1e2a22);padding:4px;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative;">
          <span class="recAdd" data-idx="${i}" title="キャンバスへ追加" style="position:absolute;top:1px;left:3px;font-size:13px;cursor:pointer;color:#6fbf6f;font-weight:bold;">＋</span>
          <span class="recRemove" data-idx="${i}" title="履歴から削除" style="position:absolute;top:2px;right:3px;font-size:10px;cursor:pointer;color:var(--fg3,#777);">✕</span>
          <canvas class="recThumb" data-idx="${i}" width="90" height="60" style="background:#111;border-radius:2px;display:block;"></canvas>
          <div style="font-size:9px;color:var(--gfg,#9ed6b0);text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.label}">${e.label}</div>
        </div>`
      ).join('') + `</div>`;

    list.querySelectorAll('.recItem').forEach(el => {
      el.onmouseover = () => { el.style.filter = 'brightness(1.2)'; };
      el.onmouseout  = () => { el.style.filter = ''; };
      el.onclick = (ev) => {
        if (ev.target.classList.contains('recRemove') || ev.target.classList.contains('recAdd')) return;
        selectEntry(recent[parseInt(el.dataset.idx)]);
      };
      el.ondblclick = () => addEntry(recent[parseInt(el.dataset.idx)]);
    });
    list.querySelectorAll('.recAdd').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); addEntry(recent[parseInt(btn.dataset.idx)]); };
    });
    list.querySelectorAll('.recRemove').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        recent.splice(parseInt(btn.dataset.idx), 1);
        saveRecent();
        renderRecentList();
      };
    });

    // 遅延サムネイル
    if (typeof IntersectionObserver !== 'undefined') {
      thumbObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const cv = entry.target;
          if (cv.dataset.loaded) return;
          cv.dataset.loaded = '1';
          thumbObserver.unobserve(cv);
          generateThumb(cv, recent[parseInt(cv.dataset.idx)]);
        });
      }, { root: list, rootMargin: '60px' });
      list.querySelectorAll('.recThumb').forEach(cv => thumbObserver.observe(cv));
    } else {
      list.querySelectorAll('.recThumb').forEach(cv => generateThumb(cv, recent[parseInt(cv.dataset.idx)]));
    }
  }

  function pushRecent(entry) {
    const idx = recent.findIndex(r => r.path === entry.path);
    if (idx >= 0) recent.splice(idx, 1);
    recent.unshift({ path: entry.path, label: entry.label, fname: entry.fname, std: entry.std, cat: entry.cat, type3: entry.type3 });
    if (recent.length > 30) recent.length = 30;
    saveRecent();
    if (activeTab === 'recent') renderRecentList();
  }

  function saveRecent() {
    try { localStorage.setItem('symLibRecent', JSON.stringify(recent)); } catch(e) {}
    const c = document.getElementById('symRecentCount');
    if (c) c.textContent = `(${recent.length}件)`;
  }

  // ── お気に入り操作 ────────────────────────────────────────────
  function toggleFavEntry(entry) {
    const idx = favorites.findIndex(f => f.path === entry.path);
    if (idx >= 0) favorites.splice(idx, 1);
    else favorites.push(entry);
    saveFavorites();
    updateFavBtn();
  }

  function toggleFavorite() {
    if (!previewEntry) return;
    toggleFavEntry(previewEntry);
    renderList();
  }

  function saveFavorites() {
    localStorage.setItem('symLibFav', JSON.stringify(favorites));
    const countEl = document.getElementById('symFavCount');
    if (countEl) countEl.textContent = `(${favorites.length}件)`;
    const tabBtn = document.getElementById('symTabFav');
    if (tabBtn) tabBtn.textContent = `⭐ お気に入り${favorites.length ? ' ('+favorites.length+')' : ''}`;
  }

  function updateFavBtn() {
    const btn = document.getElementById('symLibFavBtn');
    if (!btn || !previewEntry) return;
    const isFav = favorites.some(f => f.path === previewEntry.path);
    btn.textContent = isFav ? '★' : '☆';
    btn.style.color = isFav ? '#f5a623' : '#aaa';
  }

  // ── エントリ選択 ──────────────────────────────────────────────
  async function selectEntry(entry) {
    previewEntry = entry;
    previewShapes = [];
    const previewDiv = document.getElementById('symLibPreview');
    const nameEl     = document.getElementById('symLibPreviewName');
    if (previewDiv) previewDiv.style.display = 'flex';
    if (nameEl) nameEl.textContent = `${entry.label}  (${entry.fname})`;
    updateFavBtn();

    if (!zipData) { drawOnCanvas(document.getElementById('symLibCanvas'), [], '#9ec6f7', 1.5); return; }
    const zFile = findZipFile(entry.path);
    if (!zFile) {
      const allFiles = Object.keys(zipIndex).slice(0, 3).join(', ');
      setStatus(`ファイル不一致: ${entry.path} | ZIP例: ${allFiles||'(なし)'}`);
      return;
    }
    try {
      const buf = await zFile.async('arraybuffer');
      const text = new TextDecoder('shift-jis').decode(buf);
      previewShapes = parseDxfShapes(text);
      drawOnCanvas(document.getElementById('symLibCanvas'), previewShapes, '#9ec6f7', 1.5);
    } catch (err) {}
  }

  // ── DXFパース ────────────────────────────────────────────────
  function parseDxfShapes(text) {
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l=>l.trim());
    const shapes = [];
    const STOP = new Set(['LINE','CIRCLE','ARC','HATCH','LWPOLYLINE','ELLIPSE','ENDSEC','VIEWPORT','INSERT','SPLINE','TEXT','MTEXT']);
    let inEntities = false, i = 0;
    while (i < lines.length) {
      if (!inEntities) { if (lines[i]==='ENTITIES') inEntities=true; i++; continue; }
      if (lines[i]==='ENDSEC') break;
      if (lines[i]==='0' && i+1<lines.length) {
        const etype = lines[i+1];
        if (!STOP.has(etype)) { i+=2; continue; }
        const props={}, pts=[];
        let j=i+2;
        while (j<lines.length-1) {
          const code=lines[j];
          if (code==='0' && STOP.has(lines[j+1])) break;
          const val=lines[j+1];
          if (code==='10') { pts.push([parseFloat(val)||0,0]); if(!('10' in props)) props['10']=val; }
          else if (code==='20' && pts.length) { pts[pts.length-1][1]=parseFloat(val)||0; if(!('20' in props)) props['20']=val; }
          else if (!(code in props)) props[code]=val;
          j+=2;
        }
        const g=k=>parseFloat(props[k]||0);
        try {
          if (etype==='LINE') shapes.push({t:'L',x1:g('10'),y1:g('20'),x2:g('11'),y2:g('21')});
          else if (etype==='CIRCLE') shapes.push({t:'C',cx:g('10'),cy:g('20'),r:g('40')});
          else if (etype==='ARC') shapes.push({t:'A',cx:g('10'),cy:g('20'),r:g('40'),sa:g('50'),ea:g('51')});
          else if (etype==='LWPOLYLINE'&&pts.length) shapes.push({t:'P',pts,cl:(parseInt(props['70']||0)&1)===1});
        } catch(e) {}
        i=j;
      } else i++;
    }
    return shapes;
  }

  // ── canvas描画（共通） ────────────────────────────────────────
  function getBBox(shapes) {
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    shapes.forEach(s=>{
      if (s.t==='L'){mnX=Math.min(mnX,s.x1,s.x2);mxX=Math.max(mxX,s.x1,s.x2);mnY=Math.min(mnY,s.y1,s.y2);mxY=Math.max(mxY,s.y1,s.y2);}
      else if(s.t==='C'||s.t==='A'){mnX=Math.min(mnX,s.cx-s.r);mxX=Math.max(mxX,s.cx+s.r);mnY=Math.min(mnY,s.cy-s.r);mxY=Math.max(mxY,s.cy+s.r);}
      else if(s.t==='P'){s.pts.forEach(p=>{mnX=Math.min(mnX,p[0]);mxX=Math.max(mxX,p[0]);mnY=Math.min(mnY,p[1]);mxY=Math.max(mxY,p[1]);});}
    });
    return {mnX,mnY,mxX,mxY};
  }

  function drawOnCanvas(canvas, shapes, color, lw) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#111'; ctx.fillRect(0,0,canvas.width,canvas.height);
    if (!shapes.length) return;
    const {mnX,mnY,mxX,mxY}=getBBox(shapes);
    const pad=8, W=canvas.width-pad*2, H=canvas.height-pad*2;
    const sc=Math.min(W/Math.max(mxX-mnX,1),H/Math.max(mxY-mnY,1))*0.85;
    const ox=pad+(W-(mxX-mnX)*sc)/2-mnX*sc;
    const oy=pad+(H-(mxY-mnY)*sc)/2+mxY*sc;
    const tx=x=>ox+x*sc, ty=y=>oy-y*sc;
    ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.lineCap='round';
    shapes.forEach(s=>{
      ctx.beginPath();
      if(s.t==='L'){ctx.moveTo(tx(s.x1),ty(s.y1));ctx.lineTo(tx(s.x2),ty(s.y2));ctx.stroke();}
      else if(s.t==='C'){ctx.arc(tx(s.cx),ty(s.cy),s.r*sc,0,Math.PI*2);ctx.stroke();}
      else if(s.t==='A'){ctx.arc(tx(s.cx),ty(s.cy),s.r*sc,s.sa*Math.PI/180,s.ea*Math.PI/180,false);ctx.stroke();}
      else if(s.t==='P'&&s.pts.length){
        ctx.moveTo(tx(s.pts[0][0]),ty(s.pts[0][1]));
        for(let k=1;k<s.pts.length;k++) ctx.lineTo(tx(s.pts[k][0]),ty(s.pts[k][1]));
        if(s.cl)ctx.closePath(); ctx.stroke();
      }
    });
  }

  // ── キャンバスに追加 ──────────────────────────────────────────
  async function addToCanvas() {
    if (!previewEntry) return;
    await addEntry(previewEntry);
  }

  // 非ブロッキング通知(連続配置でもOKクリック不要)
  function toast(msg) {
    let t = document.getElementById('symLibToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'symLibToast';
      t.style.cssText = 'position:fixed;bottom:34px;left:50%;transform:translateX(-50%);background:var(--bg3,#2a2a2a);color:var(--acc,#9ec6f7);border:1px solid var(--acc,#0067c0);border-radius:4px;padding:6px 14px;font-size:12px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.style.opacity = '0'; }, 1800);
  }

  async function addEntry(entry) {
    if (!entry) return;
    let shapes = (previewEntry && entry.path === previewEntry.path && previewShapes.length) ? previewShapes : [];
    if (!shapes.length && zipData) {
      const zFile = findZipFile(entry.path);
      if (zFile) { const buf=await zFile.async('arraybuffer'); shapes=parseDxfShapes(new TextDecoder('shift-jis').decode(buf)); }
    }
    if (!shapes.length) { alert('シンボルデータが空です（ZIP未読込の可能性があります）'); return; }

    const {mnX,mnY,mxX,mxY}=getBBox(shapes);
    const dxfW=Math.max(mxX-mnX,1), dxfH=Math.max(mxY-mnY,1);
    const SCALE=8;
    const cxDxf=(mnX+mxX)/2, cyDxf=(mnY+mxY)/2;

    const canvasShapes=shapes.map(s=>{
      if(s.t==='L') return {t:'L',x1:(s.x1-cxDxf)*SCALE,y1:-(s.y1-cyDxf)*SCALE,x2:(s.x2-cxDxf)*SCALE,y2:-(s.y2-cyDxf)*SCALE};
      if(s.t==='C') return {t:'C',cx:(s.cx-cxDxf)*SCALE,cy:-(s.cy-cyDxf)*SCALE,r:s.r*SCALE};
      if(s.t==='A') return {t:'A',cx:(s.cx-cxDxf)*SCALE,cy:-(s.cy-cyDxf)*SCALE,r:s.r*SCALE,sa:s.sa,ea:s.ea};
      if(s.t==='P') return {t:'P',pts:s.pts.map(p=>[(p[0]-cxDxf)*SCALE,-(p[1]-cyDxf)*SCALE]),cl:s.cl};
      return s;
    });

    const symType = 'lib_' + entry.path.replace(/[^a-zA-Z0-9_\-]/g, '_');

    // プレビュー画像生成
    let preview='';
    try {
      const pv=document.createElement('canvas'); pv.width=80; pv.height=60;
      const pc=pv.getContext('2d'); pc.fillStyle='#fff'; pc.fillRect(0,0,80,60);
      const sc=Math.min(70/dxfW,50/dxfH)*0.85;
      const ox=5+(70-dxfW*sc)/2-mnX*sc, oy=5+(50-dxfH*sc)/2+mxY*sc;
      pc.strokeStyle='#222'; pc.lineWidth=1.2; pc.lineCap='round';
      shapes.forEach(s=>{
        const tx=x=>ox+x*sc, ty=y=>oy-y*sc;
        pc.beginPath();
        if(s.t==='L'){pc.moveTo(tx(s.x1),ty(s.y1));pc.lineTo(tx(s.x2),ty(s.y2));pc.stroke();}
        else if(s.t==='C'){pc.arc(tx(s.cx),ty(s.cy),s.r*sc,0,Math.PI*2);pc.stroke();}
        else if(s.t==='A'){pc.arc(tx(s.cx),ty(s.cy),s.r*sc,s.sa*Math.PI/180,s.ea*Math.PI/180,false);pc.stroke();}
        else if(s.t==='P'&&s.pts.length){
          pc.moveTo(tx(s.pts[0][0]),ty(s.pts[0][1]));
          for(let k=1;k<s.pts.length;k++) pc.lineTo(tx(s.pts[k][0]),ty(s.pts[k][1]));
          if(s.cl)pc.closePath(); pc.stroke();
        }
      });
      preview=pv.toDataURL('image/png');
    } catch(e) {}

    const symDef={type:symType, name:entry.label, label:entry.label,
      cat:entry.type3||'ライブラリ', w:dxfW*SCALE, h:dxfH*SCALE,
      shapes:canvasShapes, terminals:[], preview};
    const existing=state.customSymbols.findIndex(s=>s.type===symType);
    if(existing>=0) state.customSymbols[existing]=symDef;
    else state.customSymbols.push(symDef);

    if(typeof DEFS!=='undefined')
      DEFS[symType]={w:dxfW*SCALE,h:dxfH*SCALE,cat:symDef.cat,name:entry.label,label:entry.label,jis:'',terminals:[]};

    pushH();
    const cx=(window.innerWidth/2-state.pan.x)/state.zoom;
    const cy=(window.innerHeight/2-state.pan.y)/state.zoom;
    state.elements.push({
      id:genId('el'), type:symType,
      x:cx, y:cy, rot:0, flipH:false, flipV:false,
      label:entry.label,
      layer: activeLayer(),
      source: 'library', sourcePath: entry.path,
      labelOffX:0, labelOffY:dxfH*SCALE/2+14,
      color:null, lineStyle:null,
      w:dxfW*SCALE, h:dxfH*SCALE
    });

    pushRecent(entry);
    if(typeof renderCustomSymbols==='function') renderCustomSymbols();
    draw();
    toast(`「${entry.label}」を追加しました`);
  }

  // ── FileSystemFileHandle をIndexedDBに保存・復元 ──────────────
  function openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('symLibHandleDB', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveFileHandle(handle) {
    try { const db=await openHandleDB(); const tx=db.transaction('handles','readwrite'); tx.objectStore('handles').put(handle,'zipHandle'); } catch(e){}
  }
  async function loadSavedHandle() {
    try { const db=await openHandleDB(); return await new Promise(r=>{ const tx=db.transaction('handles','readonly'); const req=tx.objectStore('handles').get('zipHandle'); req.onsuccess=()=>r(req.result); req.onerror=()=>r(null); }); } catch(e){ return null; }
  }

  // ── ZIP読み込み共通処理 ────────────────────────────────────────
  async function loadZipFromFile(file) {
    setStatus('読み込み中...');
    const buf = await file.arrayBuffer();
    if (typeof JSZip === 'undefined') { setStatus('JSZipが読み込まれていません'); return; }
    zipData = await JSZip.loadAsync(buf);
    zipIndex = {};
    Object.keys(zipData.files).forEach(k => {
      if (zipData.files[k].dir) return;
      const lower = k.toLowerCase().replace(/\.dxf$/, '');
      zipIndex[lower] = k;
    });
    const cnt = Object.keys(zipIndex).length;
    setStatus(`ZIP読込完了 (DXF: ${cnt}件)  ${file.name}`);
    await loadIndex();
  }

  // ── パブリック ────────────────────────────────────────────────
  let panel=null;
  async function toggle() {
    if(!panel) panel=createPanel();
    const vis=panel.style.display!=='none'&&panel.style.display!=='';
    panel.style.display=vis?'none':'flex';
    if(!vis) {
      if(!indexData) {
        setStatus('インデックス読み込み中...');
        const res=await fetch('./js/symbol_index.json');
        indexData=await res.json();
        buildType3Select(); applyFilter();
      }
      // 前回のZIPを自動復元
      if(!zipData) {
        const handle = await loadSavedHandle();
        if (handle) {
          try {
            let perm = await handle.queryPermission({mode:'read'});
            if (perm !== 'granted') perm = await handle.requestPermission({mode:'read'});
            if (perm === 'granted') {
              const file = await handle.getFile();
              await loadZipFromFile(file);
            } else {
              setStatus('ZIPを選択してください（前回のファイルへのアクセスが拒否されました）');
            }
          } catch(e) { setStatus('ZIPを選択してください'); }
        } else {
          setStatus('ZIPを選択してください');
        }
      }
    }
    // お気に入りタブのバッジ更新
    const tabBtn=document.getElementById('symTabFav');
    if(tabBtn) tabBtn.textContent=`⭐ お気に入り${favorites.length?' ('+favorites.length+')':''}`;
  }

  return { toggle };
})();
