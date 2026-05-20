// ================================================================
// symbol_lib.js — シンボルライブラリビューア
// ================================================================

const symLib = (() => {
  let zipData = null;
  let indexData = null;
  let filtered = [];
  let previewEntry = null;
  let previewShapes = [];
  let favorites = JSON.parse(localStorage.getItem('symLibFav') || '[]');
  let activeTab = 'list'; // 'list' | 'fav'
  let thumbObserver = null;

  // ── パネル生成 ──────────────────────────────────────────────
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'symLibPanel';
    panel.style.cssText = 'position:fixed;top:50px;right:10px;width:340px;height:calc(100vh - 60px);background:#1e1e1e;border:1px solid #444;border-radius:6px;display:flex;flex-direction:column;z-index:9000;color:#ddd;font-family:sans-serif;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    panel.innerHTML = `
<div style="padding:8px 10px;background:#2a2a2a;border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #444;flex-shrink:0">
  <b style="font-size:13px;">📚 シンボルライブラリ</b>
  <button id="symLibClose" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;">✕</button>
</div>
<div style="display:flex;border-bottom:1px solid #444;flex-shrink:0">
  <button id="symTabList" style="flex:1;padding:6px;background:#252525;border:none;border-bottom:2px solid #0067c0;color:#ddd;cursor:pointer;font-size:12px;">一覧</button>
  <button id="symTabFav"  style="flex:1;padding:6px;background:#1e1e1e;border:none;border-bottom:2px solid transparent;color:#888;cursor:pointer;font-size:12px;">⭐ お気に入り</button>
</div>
<div id="symListPane" style="display:flex;flex-direction:column;flex:1;min-height:0;">
  <div style="padding:6px 8px;border-bottom:1px solid #333;flex-shrink:0;">
    <div style="margin-bottom:4px;">
      <label style="font-size:10px;color:#aaa;">ZIP:</label>
      <input type="file" id="symLibZip" accept=".zip" style="font-size:10px;color:#ccc;width:100%;">
    </div>
    <div id="symLibStatus" style="font-size:10px;color:#888;">ZIPを選択してください</div>
  </div>
  <div style="padding:5px 6px;border-bottom:1px solid #333;display:flex;gap:3px;flex-wrap:wrap;flex-shrink:0;">
    <select id="symLibStd" style="flex:1;background:#333;color:#ddd;border:1px solid #555;border-radius:3px;padding:2px;font-size:10px;">
      <option value="">規格（全て）</option>
      <option value="JIS_C_0617">JIS C 0617</option>
      <option value="JSIA_118">JSIA 118</option>
    </select>
    <select id="symLibCat" style="flex:1;background:#333;color:#ddd;border:1px solid #555;border-radius:3px;padding:2px;font-size:10px;">
      <option value="">図面種別（全て）</option>
      <option value="単線図用">単線図用</option>
      <option value="展開図用">展開図用</option>
      <option value="複線図用">複線図用</option>
    </select>
    <select id="symLibType3" style="flex:1 1 100%;background:#333;color:#ddd;border:1px solid #555;border-radius:3px;padding:2px;font-size:10px;">
      <option value="">種類（全て）</option>
    </select>
    <input id="symLibSearch" type="text" placeholder="🔍 シンボル名検索..."
      style="flex:1 1 100%;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:3px 5px;font-size:10px;">
  </div>
  <div id="symLibCount" style="padding:2px 8px;font-size:10px;color:#888;border-bottom:1px solid #333;flex-shrink:0;"></div>
  <div id="symLibList" style="flex:1;overflow-y:auto;padding:4px;"></div>
</div>
<div id="symFavPane" style="display:none;flex-direction:column;flex:1;min-height:0;">
  <div style="padding:5px 8px;font-size:11px;color:#888;border-bottom:1px solid #333;flex-shrink:0;">
    ⭐ お気に入り <span id="symFavCount" style="color:#aaa;"></span>
  </div>
  <div id="symFavList" style="flex:1;overflow-y:auto;padding:4px;"></div>
</div>
<div id="symLibPreview" style="border-top:1px solid #333;display:none;flex-direction:column;flex-shrink:0;">
  <div style="padding:5px 8px;background:#252525;display:flex;align-items:center;gap:4px;">
    <span id="symLibPreviewName" style="font-size:11px;color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
    <button id="symLibFavBtn" title="お気に入り" style="background:none;border:none;cursor:pointer;font-size:14px;flex-shrink:0;">☆</button>
    <button id="symLibAdd" style="background:#0067c0;border:none;color:#fff;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:11px;flex-shrink:0;">追加</button>
  </div>
  <canvas id="symLibCanvas" width="320" height="130" style="background:#111;display:block;margin:4px auto;"></canvas>
</div>`;
    document.body.appendChild(panel);

    document.getElementById('symLibClose').onclick = () => { panel.style.display = 'none'; };
    document.getElementById('symLibZip').onchange = onZipSelected;
    document.getElementById('symLibStd').onchange = applyFilter;
    document.getElementById('symLibCat').onchange = applyFilter;
    document.getElementById('symLibType3').onchange = applyFilter;
    document.getElementById('symLibSearch').oninput = applyFilter;
    document.getElementById('symLibAdd').onclick = addToCanvas;
    document.getElementById('symLibFavBtn').onclick = toggleFavorite;
    document.getElementById('symTabList').onclick = () => switchTab('list');
    document.getElementById('symTabFav').onclick = () => switchTab('fav');
    return panel;
  }

  function switchTab(tab) {
    activeTab = tab;
    const listPane = document.getElementById('symListPane');
    const favPane  = document.getElementById('symFavPane');
    const btnList  = document.getElementById('symTabList');
    const btnFav   = document.getElementById('symTabFav');
    if (tab === 'list') {
      listPane.style.display = 'flex'; favPane.style.display = 'none';
      btnList.style.borderBottomColor = '#0067c0'; btnList.style.color = '#ddd'; btnList.style.background = '#252525';
      btnFav.style.borderBottomColor = 'transparent'; btnFav.style.color = '#888'; btnFav.style.background = '#1e1e1e';
    } else {
      listPane.style.display = 'none'; favPane.style.display = 'flex';
      btnFav.style.borderBottomColor = '#f5a623'; btnFav.style.color = '#ddd'; btnFav.style.background = '#252525';
      btnList.style.borderBottomColor = 'transparent'; btnList.style.color = '#888'; btnList.style.background = '#1e1e1e';
      renderFavList();
    }
  }

  // ── ZIP ──────────────────────────────────────────────────────
  async function onZipSelected(e) {
    const file = e.target.files[0]; if (!file) return;
    setStatus('読み込み中...');
    try {
      const buf = await file.arrayBuffer();
      if (typeof JSZip === 'undefined') { setStatus('JSZipが読み込まれていません'); return; }
      zipData = await JSZip.loadAsync(buf);
      const cnt = Object.keys(zipData.files).filter(f => f.endsWith('.dxf')).length;
      setStatus(`ZIP読込完了 (DXF: ${cnt}件)`);
      await loadIndex();
    } catch (err) { setStatus('エラー: ' + err.message); }
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
          return `<div class="slItem" data-idx="${i}" style="border:1px solid #333;border-radius:4px;cursor:pointer;background:#252525;padding:4px;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative;">
            <span class="favStar" data-idx="${i}" style="position:absolute;top:2px;right:3px;font-size:11px;cursor:pointer;color:${isFav?'#f5a623':'#555'};">${isFav?'★':'☆'}</span>
            <canvas class="thumbCanvas" data-idx="${i}" width="90" height="60" style="background:#111;border-radius:2px;display:block;"></canvas>
            <div style="font-size:9px;color:#9ec6f7;text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.label}">${e.label}</div>
          </div>`;
        }).join('') + `</div>`;

      // クリックイベント
      list.querySelectorAll('.slItem').forEach(el => {
        el.onmouseover = () => { el.style.background = '#2d3a4a'; };
        el.onmouseout  = () => { el.style.background = '#252525'; };
        el.onclick = (ev) => {
          if (ev.target.classList.contains('favStar')) return;
          selectEntry(filtered[parseInt(el.dataset.idx)]);
        };
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
        return `<div class="slItem" data-idx="${i}" style="padding:5px 6px;margin:2px 0;border-radius:3px;cursor:pointer;background:#252525;border:1px solid #333;display:flex;align-items:center;gap:4px;">
          <div style="flex:1;">
            <div style="font-weight:bold;color:#9ec6f7;font-size:11px;">${e.label}</div>
            <div style="color:#777;font-size:10px;">${e.std.replace('_',' ')} / ${e.cat} / ${e.fname}</div>
          </div>
          <span class="favStar" data-idx="${i}" style="font-size:13px;cursor:pointer;color:${isFav?'#f5a623':'#555'};flex-shrink:0;">${isFav?'★':'☆'}</span>
        </div>`;
      }).join('');
      if (filtered.length > 200) {
        list.innerHTML += `<div style="padding:6px;color:#888;font-size:11px;text-align:center;">※ ${filtered.length-200}件省略。絞り込んでください。</div>`;
      }
      list.querySelectorAll('.slItem').forEach(el => {
        el.onmouseover = () => { el.style.background = '#2d3a4a'; };
        el.onmouseout  = () => { el.style.background = '#252525'; };
        el.onclick = (ev) => {
          if (ev.target.classList.contains('favStar')) return;
          selectEntry(filtered[parseInt(el.dataset.idx)]);
        };
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
    const zFile = zipData.file(`${entry.path}.dxf`); if (!zFile) return;
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
      list.innerHTML = '<div style="padding:16px;color:#666;font-size:11px;text-align:center;">⭐ をクリックして追加してください</div>';
      return;
    }

    if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }

    list.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:2px;">` +
      favorites.map((e, i) =>
        `<div class="favItem" data-idx="${i}" style="border:1px solid #554400;border-radius:4px;cursor:pointer;background:#2a2400;padding:4px;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative;">
          <span class="favRemove" data-idx="${i}" style="position:absolute;top:2px;right:3px;font-size:10px;cursor:pointer;color:#f5a623;">★</span>
          <canvas class="favThumb" data-idx="${i}" width="90" height="60" style="background:#111;border-radius:2px;display:block;"></canvas>
          <div style="font-size:9px;color:#f5c842;text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.label}">${e.label}</div>
        </div>`
      ).join('') + `</div>`;

    list.querySelectorAll('.favItem').forEach(el => {
      el.onmouseover = () => { el.style.background = '#3a3200'; };
      el.onmouseout  = () => { el.style.background = '#2a2400'; };
      el.onclick = (ev) => {
        if (ev.target.classList.contains('favRemove')) return;
        selectEntry(favorites[parseInt(el.dataset.idx)]);
      };
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
    const zFile = zipData.file(`${entry.path}.dxf`);
    if (!zFile) { return; }
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
    let shapes = previewShapes;
    if (!shapes.length && zipData) {
      const zFile = zipData.file(`${previewEntry.path}.dxf`);
      if (zFile) { const buf=await zFile.async('arraybuffer'); shapes=parseDxfShapes(new TextDecoder('shift-jis').decode(buf)); }
    }
    if (!shapes.length) { alert('シンボルデータが空です'); return; }

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

    const symType = 'lib_' + previewEntry.path.replace(/[^a-zA-Z0-9_\-]/g, '_');

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

    const symDef={type:symType, name:previewEntry.label, label:previewEntry.label,
      cat:previewEntry.type3||'ライブラリ', w:dxfW*SCALE, h:dxfH*SCALE,
      shapes:canvasShapes, terminals:[], preview};
    const existing=state.customSymbols.findIndex(s=>s.type===symType);
    if(existing>=0) state.customSymbols[existing]=symDef;
    else state.customSymbols.push(symDef);

    if(typeof DEFS!=='undefined')
      DEFS[symType]={w:dxfW*SCALE,h:dxfH*SCALE,cat:symDef.cat,name:previewEntry.label,label:previewEntry.label,jis:'',terminals:[]};

    pushH();
    const cx=(window.innerWidth/2-state.pan.x)/state.zoom;
    const cy=(window.innerHeight/2-state.pan.y)/state.zoom;
    state.elements.push({
      id:genId('el'), type:symType,
      x:cx, y:cy, rot:0, flipH:false, flipV:false,
      label:previewEntry.label,
      layer: activeLayer(),
      source: 'library', sourcePath: previewEntry.path,
      labelOffX:0, labelOffY:dxfH*SCALE/2+14,
      color:null, lineStyle:null,
      w:dxfW*SCALE, h:dxfH*SCALE
    });

    if(typeof renderCustomSymbols==='function') renderCustomSymbols();
    draw();
    alert(`「${previewEntry.label}」を追加しました`);
  }

  // ── パブリック ────────────────────────────────────────────────
  let panel=null;
  async function toggle() {
    if(!panel) panel=createPanel();
    const vis=panel.style.display!=='none'&&panel.style.display!=='';
    panel.style.display=vis?'none':'flex';
    if(!vis&&!indexData) {
      setStatus('インデックス読み込み中...');
      const res=await fetch('./js/symbol_index.json');
      indexData=await res.json();
      buildType3Select(); applyFilter();
      setStatus('ZIPを選択してください');
    }
    // お気に入りタブのバッジ更新
    const tabBtn=document.getElementById('symTabFav');
    if(tabBtn) tabBtn.textContent=`⭐ お気に入り${favorites.length?' ('+favorites.length+')':''}`;
  }

  return { toggle };
})();
