// ================================================================
// search.js — 全ページ横断検索（Ctrl+F / クイックバー🔍）
// 対象: デバイス(partRef)・線番(wireNo)・仕様(label)・テキスト・
//       指示線/寸法テキスト・端子番号・メモ
// 依存: state, cv, draw, switchPage, updateRightPanel, _syncCurrentPage
// ================================================================
(function(){
  let panel = null;

  // 全角/半角・大小文字の表記ゆれを吸収
  function nrm(s){
    try { return String(s ?? '').normalize('NFKC').toLowerCase(); }
    catch(e){ return String(s ?? '').toLowerCase(); }
  }

  function escHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // 全ページから検索対象レコードを収集
  function collectSearchIndex(){
    if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
    const rows = [];
    state.pages.forEach((pg, pi) => {
      const pname = pg.name || ('Sheet'+(pi+1));
      (pg.elements||[]).forEach(el => {
        const cx = (el.x !== undefined) ? el.x : ((el.x1+el.x2)/2 || 0);
        const cy = (el.y !== undefined) ? el.y : ((el.y1+el.y2)/2 || 0);
        [
          ['デバイス', el.partRef],
          ['仕様',     el.label],
          ['テキスト', el.text],
          ['指示線',   el.leaderText],
          ['寸法',     el.dimText],
          ['端子番号', el.terminals],
          ['線番',     el.wireNo],
          ['メモ',     el.note],
        ].forEach(([kind, val]) => {
          if (val) rows.push({ page: pi, pname, kind, val: String(val),
                               id: el.id, isWire: false, x: cx, y: cy });
        });
      });
      (pg.wires||[]).forEach(w => {
        if (!w.wireNo) return;
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        const a = pts[Math.floor((pts.length-1)/2)], b = pts[Math.ceil((pts.length-1)/2)];
        rows.push({ page: pi, pname, kind:'線番', val: String(w.wireNo),
                    id: w.id, isWire: true, x:(a.x+b.x)/2, y:(a.y+b.y)/2 });
      });
    });
    return rows;
  }

  function runSearch(q){
    const res = document.getElementById('search-results');
    if (!res) return;
    const query = nrm((q||'').trim());
    if (!query) {
      res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--fg3)">デバイス・線番・テキストを入力（全ページ横断）</div>';
      return;
    }
    const rows = collectSearchIndex().filter(r => nrm(r.val).includes(query));
    if (!rows.length) {
      res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--fg3)">見つかりません</div>';
      return;
    }
    const MAX = 60;
    const shown = rows.slice(0, MAX);
    res.innerHTML = shown.map((r, i) =>
      `<div class="srch-row" data-i="${i}" style="display:flex;gap:6px;align-items:center;padding:4px 8px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--bd)">
        <span class="badge badge-b" style="flex-shrink:0">${r.kind}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.val)}</span>
        <span style="color:var(--fg3);flex-shrink:0">${escHtml(r.pname)}</span>
      </div>`).join('')
      + (rows.length > MAX ? `<div style="padding:4px 8px;font-size:10px;color:var(--fg3)">他${rows.length - MAX}件 — キーワードで絞り込んでください</div>` : '');
    res.querySelectorAll('.srch-row').forEach(el => {
      el.onmouseover = () => { el.style.background = 'var(--abg)'; };
      el.onmouseout  = () => { el.style.background = ''; };
      el.onclick = () => jumpToHit(shown[parseInt(el.dataset.i)]);
    });
  }

  function jumpToHit(r){
    if (r.page !== state.currentPage && typeof switchPage === 'function') switchPage(r.page);
    if (state.zoom < 1) state.zoom = 1;
    state.pan.x = cv.width  / 2 - r.x * state.zoom;
    state.pan.y = cv.height / 2 - r.y * state.zoom;
    // 対象を選択状態にする（プロパティ確認がすぐできる）
    state.sel.els.clear(); state.sel.wires.clear();
    if (r.isWire) state.sel.wires.add(r.id); else state.sel.els.add(r.id);
    if (typeof updateRightPanel === 'function') updateRightPanel();
    // 点滅ハイライト（2秒）
    state.searchHit = { x: r.x, y: r.y, t0: Date.now() };
    const anim = () => {
      if (!state.searchHit) return;
      if (Date.now() - state.searchHit.t0 > 2000) { state.searchHit = null; draw(); return; }
      draw();
      requestAnimationFrame(anim);
    };
    anim();
  }

  function toggleSearchPanel(){
    if (panel && panel.style.display !== 'none') { panel.style.display = 'none'; return; }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'search-panel';
      panel.style.cssText = 'position:fixed;top:100px;right:222px;width:280px;max-height:60vh;background:var(--bg2);border:1px solid var(--bd2);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.35);z-index:1500;display:flex;flex-direction:column;overflow:hidden';
      panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--bd)">
          <span style="font-size:12px">🔍</span>
          <input id="search-input" type="text" placeholder="デバイス・線番・テキスト" autocomplete="off"
            style="flex:1;font-size:12px;padding:3px 6px;background:var(--bg);color:var(--fg);border:1px solid var(--bd2);border-radius:3px;outline:none">
          <span id="search-close" style="cursor:pointer;color:var(--fg3);font-size:13px;padding:0 2px">✕</span>
        </div>
        <div id="search-results" style="flex:1;overflow-y:auto"></div>`;
      document.body.appendChild(panel);
      panel.querySelector('#search-close').onclick = () => { panel.style.display = 'none'; };
      const inp = panel.querySelector('#search-input');
      inp.addEventListener('input', () => runSearch(inp.value));
      inp.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); panel.style.display = 'none'; }
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = panel.querySelector('.srch-row');
          if (first) first.click();
        }
      });
    }
    panel.style.display = 'flex';
    const inp = panel.querySelector('#search-input');
    inp.focus(); inp.select();
    runSearch(inp.value);
  }

  window.toggleSearchPanel = toggleSearchPanel;
})();
