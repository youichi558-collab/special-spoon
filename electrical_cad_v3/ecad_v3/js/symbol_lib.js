// ================================================================
// symbol_lib.js — シンボルライブラリビューア
// ZIPファイルから選択した DXF シンボルを customSymbols に登録する
// ================================================================

const symLib = (() => {
  let zipData = null;
  let indexData = null;
  let filtered = [];
  let previewEntry = null;
  let previewShapes = [];

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'symLibPanel';
    panel.style.cssText = [
      'position:fixed','top:50px','right:10px','width:320px',
      'height:calc(100vh - 60px)','background:#1e1e1e',
      'border:1px solid #444','border-radius:6px',
      'display:flex','flex-direction:column','z-index:9000',
      'color:#ddd','font-family:sans-serif','font-size:12px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.5)'
    ].join(';');
    panel.innerHTML = `
<div style="padding:8px 10px;background:#2a2a2a;border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #444;">
  <b style="font-size:13px;">📚 シンボルライブラリ</b>
  <button id="symLibClose" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;">✕</button>
</div>
<div style="padding:8px;border-bottom:1px solid #333;">
  <label style="font-size:11px;color:#aaa;">ZIPファイル選択：</label><br>
  <input type="file" id="symLibZip" accept=".zip" style="font-size:11px;color:#ccc;width:100%;margin-top:3px;">
  <div id="symLibStatus" style="font-size:11px;color:#888;margin-top:4px;">ZIPを選択してください</div>
</div>
<div style="padding:6px 8px;border-bottom:1px solid #333;display:flex;gap:4px;flex-wrap:wrap;">
  <select id="symLibStd" style="flex:1;background:#333;color:#ddd;border:1px solid #555;border-radius:3px;padding:3px;font-size:11px;">
    <option value="">規格（全て）</option>
    <option value="JIS_C_0617">JIS C 0617</option>
    <option value="JSIA_118">JSIA 118</option>
  </select>
  <select id="symLibCat" style="flex:1;background:#333;color:#ddd;border:1px solid #555;border-radius:3px;padding:3px;font-size:11px;">
    <option value="">図面種別（全て）</option>
    <option value="単線図用">単線図用</option>
    <option value="展開図用">展開図用</option>
    <option value="複線図用">複線図用</option>
  </select>
  <select id="symLibType3" style="flex:1 1 100%;background:#333;color:#ddd;border:1px solid #555;border-radius:3px;padding:3px;font-size:11px;">
    <option value="">種類（全て）</option>
  </select>
  <input id="symLibSearch" type="text" placeholder="🔍 シンボル名検索..."
    style="flex:1 1 100%;background:#2a2a2a;color:#ddd;border:1px solid #555;border-radius:3px;padding:4px 6px;font-size:11px;">
</div>
<div id="symLibCount" style="padding:3px 8px;font-size:10px;color:#888;border-bottom:1px solid #333;"></div>
<div id="symLibList" style="flex:1;overflow-y:auto;padding:4px;"></div>
<div id="symLibPreview" style="border-top:1px solid #333;display:none;flex-direction:column;">
  <div style="padding:6px 8px;background:#252525;display:flex;align-items:center;justify-content:space-between;">
    <span id="symLibPreviewName" style="font-size:11px;color:#ccc;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
    <button id="symLibAdd" style="background:#0067c0;border:none;color:#fff;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;flex-shrink:0;margin-left:6px;">追加</button>
  </div>
  <canvas id="symLibCanvas" width="300" height="120" style="background:#111;display:block;margin:4px auto;"></canvas>
</div>`;
    document.body.appendChild(panel);
    document.getElementById('symLibClose').onclick = () => { panel.style.display = 'none'; };
    document.getElementById('symLibZip').onchange = onZipSelected;
    document.getElementById('symLibStd').onchange = applyFilter;
    document.getElementById('symLibCat').onchange = applyFilter;
    document.getElementById('symLibType3').onchange = applyFilter;
    document.getElementById('symLibSearch').oninput = applyFilter;
    document.getElementById('symLibAdd').onclick = addToCanvas;
    return panel;
  }

  async function onZipSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('読み込み中...');
    try {
      const buf = await file.arrayBuffer();
      if (typeof JSZip === 'undefined') { setStatus('JSZipが読み込まれていません'); return; }
      zipData = await JSZip.loadAsync(buf);
      const cnt = Object.keys(zipData.files).filter(f => f.endsWith('.dxf')).length;
      setStatus(`ZIP読み込み完了 (DXF: ${cnt}ファイル)`);
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

  function setStatus(msg) {
    const el = document.getElementById('symLibStatus');
    if (el) el.textContent = msg;
  }

  function buildType3Select() {
    if (!indexData) return;
    const sel = document.getElementById('symLibType3');
    if (!sel) return;
    const types = [...new Set(indexData.map(e => e.type3))].sort();
    sel.innerHTML = '<option value="">種類（全て）</option>' +
      types.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  function applyFilter() {
    if (!indexData) return;
    const std = document.getElementById('symLibStd').value;
    const cat = document.getElementById('symLibCat').value;
    const type3 = document.getElementById('symLibType3').value;
    const q = (document.getElementById('symLibSearch').value || '').trim();

    filtered = indexData.filter(e => {
      if (std && e.std !== std) return false;
      if (cat && e.cat !== cat) return false;
      if (type3 && e.type3 !== type3) return false;
      if (q && !e.label.includes(q) && !e.fname.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

    const countEl = document.getElementById('symLibCount');
    if (countEl) countEl.textContent = `${filtered.length} 件`;
    renderList();
  }

  function renderList() {
    const list = document.getElementById('symLibList');
    if (!list) return;
    const show = filtered.slice(0, 200);
    list.innerHTML = show.map((e, i) =>
      `<div class="slItem" data-idx="${i}" style="padding:5px 6px;margin:2px 0;border-radius:3px;cursor:pointer;background:#252525;border:1px solid #333;">
        <div style="font-weight:bold;color:#9ec6f7;font-size:11px;">${e.label}</div>
        <div style="color:#777;font-size:10px;">${e.std.replace('_',' ')} / ${e.cat} / ${e.fname}</div>
      </div>`
    ).join('');
    if (filtered.length > 200) {
      list.innerHTML += `<div style="padding:6px;color:#888;font-size:11px;text-align:center;">※ ${filtered.length-200}件省略。絞り込んでください。</div>`;
    }
    list.querySelectorAll('.slItem').forEach(el => {
      el.onmouseover = () => { el.style.background = '#2d3a4a'; };
      el.onmouseout = () => { el.style.background = '#252525'; };
      el.onclick = () => selectEntry(filtered[parseInt(el.dataset.idx)]);
    });
  }

  async function selectEntry(entry) {
    previewEntry = entry;
    previewShapes = [];
    const previewDiv = document.getElementById('symLibPreview');
    const nameEl = document.getElementById('symLibPreviewName');
    if (previewDiv) previewDiv.style.display = 'flex';
    if (nameEl) nameEl.textContent = `${entry.label}  (${entry.fname})`;

    if (!zipData) { renderPreviewCanvas([]); return; }
    const zipPath = `${entry.path}.dxf`;
    const zFile = zipData.file(zipPath);
    if (!zFile) { renderPreviewCanvas([]); return; }
    try {
      const buf = await zFile.async('arraybuffer');
      const text = new TextDecoder('shift-jis').decode(buf);
      previewShapes = parseDxfShapes(text);
      renderPreviewCanvas(previewShapes);
    } catch (err) { renderPreviewCanvas([]); }
  }

  function parseDxfShapes(text) {
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l=>l.trim());
    const shapes = [];
    const STOP = new Set(['LINE','CIRCLE','ARC','HATCH','LWPOLYLINE','ELLIPSE','ENDSEC','VIEWPORT','INSERT','SPLINE','TEXT','MTEXT']);
    let inEntities = false;
    let i = 0;
    while (i < lines.length) {
      if (!inEntities) {
        if (lines[i] === 'ENTITIES') inEntities = true;
        i++; continue;
      }
      if (lines[i] === 'ENDSEC') break;
      if (lines[i] === '0' && i+1 < lines.length) {
        const etype = lines[i+1];
        if (!STOP.has(etype)) { i += 2; continue; }
        const props = {}, pts = [];
        let j = i+2;
        while (j < lines.length-1) {
          const code = lines[j];
          if (code === '0' && STOP.has(lines[j+1])) break;
          const val = lines[j+1];
          if (code === '10') {
          pts.push([parseFloat(val)||0, 0]);
          if (!('10' in props)) props['10'] = val;  // LINEのx1用
        }
        else if (code === '20' && pts.length) {
          pts[pts.length-1][1] = parseFloat(val)||0;
          if (!('20' in props)) props['20'] = val;  // LINEのy1用
        }
        else if (!(code in props)) props[code] = val;
          j += 2;
        }
        const g = k => parseFloat(props[k]||0);
        try {
          if (etype === 'LINE') shapes.push({t:'L',x1:g('10'),y1:g('20'),x2:g('11'),y2:g('21')});
          else if (etype === 'CIRCLE') shapes.push({t:'C',cx:g('10'),cy:g('20'),r:g('40')});
          else if (etype === 'ARC') shapes.push({t:'A',cx:g('10'),cy:g('20'),r:g('40'),sa:g('50'),ea:g('51')});
          else if (etype === 'LWPOLYLINE' && pts.length) shapes.push({t:'P',pts,cl:(parseInt(props['70']||0)&1)===1});
        } catch(e) {}
        i = j;
      } else i++;
    }
    return shapes;
  }

  function getBBox(shapes) {
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    shapes.forEach(s => {
      if (s.t==='L') { mnX=Math.min(mnX,s.x1,s.x2);mxX=Math.max(mxX,s.x1,s.x2);mnY=Math.min(mnY,s.y1,s.y2);mxY=Math.max(mxY,s.y1,s.y2); }
      else if (s.t==='C'||s.t==='A') { mnX=Math.min(mnX,s.cx-s.r);mxX=Math.max(mxX,s.cx+s.r);mnY=Math.min(mnY,s.cy-s.r);mxY=Math.max(mxY,s.cy+s.r); }
      else if (s.t==='P') { s.pts.forEach(p=>{mnX=Math.min(mnX,p[0]);mxX=Math.max(mxX,p[0]);mnY=Math.min(mnY,p[1]);mxY=Math.max(mxY,p[1]);}); }
    });
    return {mnX,mnY,mxX,mxY};
  }

  function renderPreviewCanvas(shapes) {
    const canvas = document.getElementById('symLibCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#111'; ctx.fillRect(0,0,canvas.width,canvas.height);
    if (!shapes.length) {
      ctx.fillStyle='#666'; ctx.font='12px sans-serif'; ctx.textAlign='center';
      ctx.fillText('プレビュー取得失敗', canvas.width/2, canvas.height/2); return;
    }
    const {mnX,mnY,mxX,mxY} = getBBox(shapes);
    const pad=15, W=canvas.width-pad*2, H=canvas.height-pad*2;
    const dw=mxX-mnX||1, dh=mxY-mnY||1;
    const scale=Math.min(W/dw,H/dh)*0.85;
    const ox=pad+(W-dw*scale)/2-mnX*scale;
    const oy=pad+(H-dh*scale)/2+mxY*scale;
    const tx=x=>ox+x*scale, ty=y=>oy-y*scale;
    ctx.strokeStyle='#9ec6f7'; ctx.lineWidth=1.5; ctx.lineCap='round';
    shapes.forEach(s => {
      ctx.beginPath();
      if (s.t==='L') { ctx.moveTo(tx(s.x1),ty(s.y1)); ctx.lineTo(tx(s.x2),ty(s.y2)); ctx.stroke(); }
      else if (s.t==='C') { ctx.arc(tx(s.cx),ty(s.cy),s.r*scale,0,Math.PI*2); ctx.stroke(); }
      else if (s.t==='A') {
        // DXFのARCはCCW(Y上向き)→Y反転でCW(canvas Y下向き)
        // 角度数値はそのまま（Y反転で方向だけ変わる）、anticlockwise=false
        ctx.arc(tx(s.cx),ty(s.cy),s.r*scale,s.sa*Math.PI/180,s.ea*Math.PI/180,false); ctx.stroke();
      }
      else if (s.t==='P') {
        if (!s.pts.length) return;
        ctx.moveTo(tx(s.pts[0][0]),ty(s.pts[0][1]));
        for (let k=1;k<s.pts.length;k++) ctx.lineTo(tx(s.pts[k][0]),ty(s.pts[k][1]));
        if (s.cl) ctx.closePath(); ctx.stroke();
      }
    });
  }

  async function addToCanvas() {
    if (!previewEntry) return;
    let shapes = previewShapes;
    if (!shapes.length && zipData) {
      const zFile = zipData.file(`${previewEntry.path}.dxf`);
      if (zFile) {
        const buf = await zFile.async('arraybuffer');
        const text = new TextDecoder('shift-jis').decode(buf);
        shapes = parseDxfShapes(text);
      }
    }
    if (!shapes.length) { alert('シンボルデータが空です'); return; }

    const {mnX,mnY,mxX,mxY} = getBBox(shapes);
    const dxfW=Math.max(mxX-mnX,1), dxfH=Math.max(mxY-mnY,1);
    const SCALE = 8;

    // Y軸反転してcanvas座標系に変換
    const canvasShapes = shapes.map(s => {
      if (s.t==='L') return {t:'L',x1:s.x1*SCALE,y1:-s.y1*SCALE,x2:s.x2*SCALE,y2:-s.y2*SCALE};
      if (s.t==='C') return {t:'C',cx:s.cx*SCALE,cy:-s.cy*SCALE,r:s.r*SCALE};
      if (s.t==='A') return {t:'A',cx:s.cx*SCALE,cy:-s.cy*SCALE,r:s.r*SCALE,sa:s.sa,ea:s.ea};
      if (s.t==='P') return {t:'P',pts:s.pts.map(p=>[p[0]*SCALE,-p[1]*SCALE]),cl:s.cl};
      return s;
    });

    const symType = 'lib_' + previewEntry.fname;

    // プレビュー画像を生成
    let preview = '';
    try {
      const pv = document.createElement('canvas');
      pv.width = 80; pv.height = 60;
      const pc = pv.getContext('2d');
      pc.fillStyle = '#fff'; pc.fillRect(0,0,80,60);
      const {mnX:bx1,mnY:by1,mxX:bx2,mxY:by2} = getBBox(shapes);
      const pad=5, pw=70, ph=50;
      const sc=Math.min(pw/Math.max(bx2-bx1,1), ph/Math.max(by2-by1,1))*0.85;
      const ox=pad+(pw-(bx2-bx1)*sc)/2-bx1*sc;
      const oy=pad+(ph-(by2-by1)*sc)/2+by2*sc;
      pc.strokeStyle='#222'; pc.lineWidth=1.2; pc.lineCap='round';
      shapes.forEach(s => {
        const tx=x=>ox+x*sc, ty=y=>oy-y*sc;
        pc.beginPath();
        if (s.t==='L') { pc.moveTo(tx(s.x1),ty(s.y1)); pc.lineTo(tx(s.x2),ty(s.y2)); pc.stroke(); }
        else if (s.t==='C') { pc.arc(tx(s.cx),ty(s.cy),s.r*sc,0,Math.PI*2); pc.stroke(); }
        else if (s.t==='A') { pc.arc(tx(s.cx),ty(s.cy),s.r*sc,s.sa*Math.PI/180,s.ea*Math.PI/180,false); pc.stroke(); }
        else if (s.t==='P' && s.pts.length) {
          pc.moveTo(tx(s.pts[0][0]),ty(s.pts[0][1]));
          for(let k=1;k<s.pts.length;k++) pc.lineTo(tx(s.pts[k][0]),ty(s.pts[k][1]));
          if(s.cl) pc.closePath(); pc.stroke();
        }
      });
      preview = pv.toDataURL('image/png');
    } catch(e) {}

    const symDef = {
      type: symType,
      name: previewEntry.label,
      label: previewEntry.label,
      cat: previewEntry.type3 || 'ライブラリ',
      w: dxfW*SCALE, h: dxfH*SCALE,
      shapes: canvasShapes,
      terminals: [],
      preview
    };
    const existing = state.customSymbols.findIndex(s => s.type === symType);
    if (existing >= 0) state.customSymbols[existing] = symDef;
    else state.customSymbols.push(symDef);

    // DEFSに登録
    if (typeof DEFS !== 'undefined') {
      DEFS[symType] = { w: dxfW*SCALE, h: dxfH*SCALE, cat: symDef.cat, name: previewEntry.label, jis:'', terminals:[] };
    }

    pushH();
    const cx = (window.innerWidth/2 - state.pan.x) / state.zoom;
    const cy = (window.innerHeight/2 - state.pan.y) / state.zoom;
    state.elements.push({
      id: Date.now(), type: symType,   // ← symTypeをtypeに直接セット
      x: cx, y: cy, rot: 0, flipH: false, flipV: false,
      label: previewEntry.label,
      labelOffX: 0, labelOffY: dxfH*SCALE/2+14,
      color: null, lineStyle: null,
      w: dxfW*SCALE, h: dxfH*SCALE
    });

    if (typeof renderCustomSymbols === 'function') renderCustomSymbols();
    draw();
    alert(`「${previewEntry.label}」を追加しました`);
  }

  let panel = null;

  async function toggle() {
    if (!panel) panel = createPanel();
    const vis = panel.style.display !== 'none' && panel.style.display !== '';
    panel.style.display = vis ? 'none' : 'flex';
    if (!vis && !indexData) {
      setStatus('インデックス読み込み中...');
      const res = await fetch('./js/symbol_index.json');
      indexData = await res.json();
      buildType3Select();
      applyFilter();
      setStatus('ZIPを選択してください');
    }
  }

  return { toggle };
})();
