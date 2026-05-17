// ================================================================
// pdf_export.js — PDF出力
// 依存: state, LAYERS, getDef, drawSym, cv, ctx, dl
// ================================================================
function calcPageBounds(pg) {
  if (pg.frameObj) {
    const f = pg.frameObj;
    const W = (f.wMM || f.w || 297) * (f.sc || 1);
    const H = (f.hMM || f.h || 210) * (f.sc || 1);
    return { minX:0, minY:0, maxX:W, maxY:H };
  }
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const pad = 40;
  (pg.elements||[]).forEach(el => {
    const d = getDef(el.type) || {};
    const hw=(d.w||20)/2, hh=(d.h||20)/2;
    if      (el.type==='rect')     { minX=Math.min(minX,el.x); minY=Math.min(minY,el.y); maxX=Math.max(maxX,el.x+(el.w||0)); maxY=Math.max(maxY,el.y+(el.h||0)); }
    else if (el.type==='circle')   { minX=Math.min(minX,el.x-(el.r||0)); minY=Math.min(minY,el.y-(el.r||0)); maxX=Math.max(maxX,el.x+(el.r||0)); maxY=Math.max(maxY,el.y+(el.r||0)); }
    else if (el.type==='arc')      { minX=Math.min(minX,el.x-(el.r||0)); minY=Math.min(minY,el.y-(el.r||0)); maxX=Math.max(maxX,el.x+(el.r||0)); maxY=Math.max(maxY,el.y+(el.r||0)); }
    else if (el.type==='triangle') { minX=Math.min(minX,el.x1,el.x2,el.x3); minY=Math.min(minY,el.y1,el.y2,el.y3); maxX=Math.max(maxX,el.x1,el.x2,el.x3); maxY=Math.max(maxY,el.y1,el.y2,el.y3); }
    else if (el.type==='junction') { const r=el.r||4; minX=Math.min(minX,el.x-r); minY=Math.min(minY,el.y-r); maxX=Math.max(maxX,el.x+r); maxY=Math.max(maxY,el.y+r); }
    else if (el.type==='dim') {
      const off = (el.offset||30) + 20;
      minX=Math.min(minX,el.x1,el.x2)-off; minY=Math.min(minY,el.y1,el.y2)-off;
      maxX=Math.max(maxX,el.x1,el.x2)+off; maxY=Math.max(maxY,el.y1,el.y2)+off;
    }
    else if (el.type==='leader') {
      const bx=el.bx??el.x2, by=el.by??el.y2;
      minX=Math.min(minX,el.x1,bx,el.x2); minY=Math.min(minY,el.y1,by,el.y2);
      maxX=Math.max(maxX,el.x1,bx,el.x2); maxY=Math.max(maxY,el.y1,by,el.y2);
    }
    else if (el.x1!=null) { minX=Math.min(minX,el.x1,el.x2); minY=Math.min(minY,el.y1,el.y2); maxX=Math.max(maxX,el.x1,el.x2); maxY=Math.max(maxY,el.y1,el.y2); }
    else if (el.x!=null)  { const sc=el.scale||1; minX=Math.min(minX,el.x-hw*sc); minY=Math.min(minY,el.y-hh*sc); maxX=Math.max(maxX,el.x+hw*sc); maxY=Math.max(maxY,el.y+hh*sc); }
  });
  (pg.wires||[]).forEach(w => {
    (w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(p => {
      minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
      maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
    });
  });
  if (!isFinite(minX)) return { minX:0, minY:0, maxX:297, maxY:210 };
  return { minX:minX-pad, minY:minY-pad, maxX:maxX+pad, maxY:maxY+pad };
}

// ================================================================
// PDFプレビュー
// ================================================================
let _pvPage = 0;

function showPDFPreview() {
  _pvPage = state.currentPage;
  _renderPVPage();
  const ov = document.getElementById('pdf-preview-overlay');
  ov.style.display = 'flex';
}

function closePDFPreview() {
  document.getElementById('pdf-preview-overlay').style.display = 'none';
}

function pvChangePage(dir) {
  _pvPage = Math.max(0, Math.min(state.pages.length - 1, _pvPage + dir));
  _renderPVPage();
}

function _renderPVPage() {
  const pvc = document.getElementById('pdf-preview-canvas');
  const info = document.getElementById('pv-page-info');
  if (!pvc) return;

  const pg = state.pages[_pvPage];
  if (!pg) return;
  info.textContent = `${_pvPage + 1} / ${state.pages.length}  (${pg.name || 'Sheet'})`;

  // ページ寸法
  const fr = pg.frameObj;
  let pageW, pageH;
  if (fr) {
    pageW = (fr.wMM || fr.w || 297) * (fr.sc || 1);
    pageH = (fr.hMM || fr.h || 210) * (fr.sc || 1);
  } else {
    const b = calcPageBounds(pg);
    pageW = b.maxX - b.minX;
    pageH = b.maxY - b.minY;
  }

  // キャンバスサイズ（最大800px幅に収める）
  const maxW = Math.min(window.innerWidth * 0.82, 1000);
  const maxH = window.innerHeight * 0.78;
  const sc = Math.min(maxW / pageW, maxH / pageH);
  pvc.width  = Math.round(pageW * sc);
  pvc.height = Math.round(pageH * sc);

  const octx = pvc.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, pvc.width, pvc.height);

  // 既存のdraw系グローバルを一時退避して描画
  const origPage  = state.currentPage;
  const origDark  = state.darkMode;
  const origSelEls   = new Set(state.sel.els);
  const origSelWires = new Set(state.sel.wires);
  const origCv    = cv, origCtx = ctx;
  const origZoom  = state.zoom;
  const origPan   = { ...state.pan };

  state.currentPage = _pvPage;
  state.darkMode    = false;
  document.body.classList.remove('dk');
  state.sel.els.clear();
  state.sel.wires.clear();

  cv  = pvc;
  ctx = octx;
  state.zoom = sc;

  // 座標原点をページ左上に合わせる
  if (fr) {
    state.pan = { x: 0, y: 0 };
  } else {
    const b = calcPageBounds(pg);
    state.pan = { x: -b.minX * sc, y: -b.minY * sc };
  }

  try {
    draw();
  } finally {
    // 必ず復元
    cv  = origCv;
    ctx = origCtx;
    state.zoom        = origZoom;
    state.pan         = origPan;
    state.currentPage = origPage;
    state.darkMode    = origDark;
    if (origDark) document.body.classList.add('dk');
    else document.body.classList.remove('dk');
    state.sel.els   = origSelEls;
    state.sel.wires = origSelWires;
  }
  draw();
}

function exportPDF() {
  openFP('pdf-opt-p');
}

function _pageFileBase(pg, idx) {
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = (pg.name || ('Sheet'+(idx+1))).replace(/[\\/:*?"<>|]/g, '_');
  return `${base}_${name}`;
}

// シンボル要素をオフスクリーンキャンバスでラスタライズ → dataURL
function rasterizeSymEl(el, s) {
  const dpi = 200;
  const def = getDef(el.type) || { w:40, h:40 };
  const sc  = el.scale || 1;
  const pad = 8;
  // 回転を考慮して正方形ベースで確保（90°/270°でw/hが入れ替わるため）
  const rot = el.rot || 0;
  const isSwapped = (rot === 90 || rot === 270 || rot === -90);
  const rawW = (def.w * sc || 40);
  const rawH = (def.h * sc || 40);
  const boxW = isSwapped ? rawH : rawW;
  const boxH = isSwapped ? rawW : rawH;
  const wW = boxW + pad*2;
  const hW = boxH + pad*2;
  const zoom = s * dpi / 25.4;
  const pxW = Math.max(4, Math.round(wW * zoom));
  const pxH = Math.max(4, Math.round(hW * zoom));
  const dispW = wW * s;
  const dispH = hW * s;

  const oc = document.createElement('canvas');
  oc.width = pxW; oc.height = pxH;
  const octx = oc.getContext('2d');
  octx.clearRect(0, 0, pxW, pxH);

  const origCv = cv, origCtx = ctx, origZoom = state.zoom;
  cv = oc; ctx = octx;
  state.zoom = 1;

  octx.save();
  octx.translate(pxW/2, pxH/2);
  octx.scale(zoom * sc, zoom * sc);
  drawSym(el.type, 0, 0, false, el.rot||0, el.flipH, el.flipV, '#000000');
  octx.restore();

  cv = origCv; ctx = origCtx; state.zoom = origZoom;
  return { dataURL: oc.toDataURL('image/png'), dispW, dispH };
}

// テキスト要素をオフスクリーンキャンバスでラスタライズ（日本語対応）
// fsMM: フォントサイズ(mm)。el.fsはスクリーンpx単位なので呼び出し側で変換すること
function rasterizeTextEl(el, fsMM) {
  const dpi = 200;
  const text = el.text || '';
  if (!text) return null;
  const pxPerMM = dpi / 25.4;
  const fsPx = fsMM * pxPerMM;
  const fontStr = `${el.bold ? 'bold ' : ''}${fsPx}px sans-serif`;

  const tmpCv = document.createElement('canvas');
  tmpCv.width = 1; tmpCv.height = 1;
  const tmpCtx = tmpCv.getContext('2d');
  tmpCtx.font = fontStr;
  const pxW = Math.max(4, Math.ceil(tmpCtx.measureText(text).width + 4));
  const pxH = Math.max(4, Math.ceil(fsPx * 1.5));

  const oc = document.createElement('canvas');
  oc.width = pxW; oc.height = pxH;
  const octx = oc.getContext('2d');
  // 背景は透明（白塗りしない）
  octx.fillStyle = el.color || '#000000';
  octx.font = fontStr;
  octx.textBaseline = 'middle';
  octx.fillText(text, 2, pxH / 2);
  return { dataURL: oc.toDataURL('image/png'), wMM: pxW / pxPerMM, hMM: pxH / pxPerMM };
}

function runExportPDF() {
  // 現在ページのみ
  closeFP('pdf-opt-p');
  const pg = state.pages[state.currentPage];
  _exportPDFPages([state.currentPage], _pageFileBase(pg, state.currentPage) + '.pdf');
}

function confirmAllPDF() {
  const n = state.pages.length;
  if (confirm(`全${n}ページを1つのPDFファイルで出力します。\nよろしいですか？`)) {
    runExportAllPDF();
  }
}



function runExportAllPDF() {
  // 全ページ1ファイル
  _syncCurrentPage();
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  _exportPDFPages(state.pages.map((_,i)=>i), base + '_全ページ.pdf');
}

function runExportAllPDFSeparate() {
  // 全ページ別ファイル（順番に連続ダウンロード）
  _syncCurrentPage();
  state.pages.forEach((pg, idx) => {
    setTimeout(() => {
      _exportPDFPages([idx], _pageFileBase(pg, idx) + '.pdf');
    }, idx * 400);
  });
}

function _exportPDFPages(indices, filename) {
  if (!window.jspdf?.jsPDF) {
    alert('PDF出力ライブラリが読み込まれていません。\nネット接続を確認してページを再読み込みしてください。');
    return;
  }
  const { jsPDF } = window.jspdf;

  const origPage = state.currentPage;
  const origDark = state.darkMode;
  const origSelEls   = new Set(state.sel.els);
  const origSelWires = new Set(state.sel.wires);

  state.darkMode = false;
  document.body.classList.remove('dk');
  state.sel.els.clear();
  state.sel.wires.clear();

  let pdf = null;


  // jsPDFで直接テキスト描画（数字・英字用、位置が正確）
  function pdfText(x, y, text, fsMM, color, bold, align) {
    const m = (color||'#000').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) pdf.setTextColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16));
    else pdf.setTextColor(0,0,0);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(fsMM * 2.835);
    pdf.text(text, x, y + fsMM * 2.0, { align: align||'center' });
    pdf.setTextColor(0,0,0);
  }

  // 色文字列 → jsPDF setDrawColor
  function applyColor(color) {
    if (!color) { pdf.setDrawColor(0); return; }
    const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) pdf.setDrawColor(parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16));
    else    pdf.setDrawColor(0);
  }

  // lineStyle → jsPDF setLineDashPattern
  function applyDash(style, s) {
    if      (style==='dash'||style==='dashed')     pdf.setLineDashPattern([8*s, 4*s], 0);
    else if (style==='dot'||style==='dotted')      pdf.setLineDashPattern([2*s, 4*s], 0);
    else if (style==='dashdot')                    pdf.setLineDashPattern([8*s, 3*s, 2*s, 3*s], 0);
    else                                           pdf.setLineDashPattern([], 0);
  }

  // 矢印を PDF に描画（ux/uy は矢印方向の単位ベクトル×s、size は mm）
  function pdfArrow(pdf, x, y, ux, uy, size, color) {
    const m = (color||'#000000').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) pdf.setFillColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16));
    else   pdf.setFillColor(0,0,0);
    const h = Math.hypot(ux,uy);
    if (h < 1e-9) return;
    const ax=ux/h, ay=uy/h;
    const nx=-ay, ny=ax;
    // キャンバスと同じ向き：baseをtipの+ax方向（進行方向）に置く
    const p1x = x + ax*size + nx*size*0.35, p1y = y + ay*size + ny*size*0.35;
    const p2x = x + ax*size - nx*size*0.35, p2y = y + ay*size - ny*size*0.35;
    pdf.lines(
      [[p1x-x, p1y-y], [p2x-p1x, p2y-p1y]],
      x, y, [1, 1], 'F', true
    );
  }

  try {
    for (const idx of indices) {
      const pg = state.pages[idx];
      state.currentPage = idx;

      const b = calcPageBounds(pg);
      const contentW = b.maxX - b.minX;
      const contentH = b.maxY - b.minY;
      if (contentW < 1 || contentH < 1) continue;

      let pdfW, pdfH;
      if (pg.frameObj) {
        pdfW = pg.frameObj.wMM || pg.frameObj.w || 297;
        pdfH = pg.frameObj.hMM || pg.frameObj.h || 210;
      } else {
        pdfW = contentW >= contentH ? 297 : 210;
        pdfH = contentW >= contentH ? 210 : 297;
      }

      if (!pdf) {
        pdf = new jsPDF({ unit:'mm', format:[pdfW, pdfH], orientation: pdfW>=pdfH ? 'l' : 'p' });
      } else {
        pdf.addPage([pdfW, pdfH], pdfW>=pdfH ? 'l' : 'p');
      }

      // スケール: mm per world unit
      const sx = pdfW / contentW, sy = pdfH / contentH;
      const s = Math.min(sx, sy);
      const ox = (pdfW - s * contentW) / 2;
      const oy = (pdfH - s * contentH) / 2;
      const tx = wx => ox + (wx - b.minX) * s;
      const ty = wy => oy + (wy - b.minY) * s;
      const tm = v  => v * s;

      // 白背景
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdfW, pdfH, 'F');

      // ================================================================
      // Canvas高解像度画像としてPDFに貼り付け（プレビューと完全一致）
      // ================================================================
      {
        const dpi = 300;
        const pxPerMM = dpi / 25.4;
        const imgW = Math.round(pdfW * pxPerMM);
        const imgH = Math.round(pdfH * pxPerMM);

        // オフスクリーンcanvasに描画
        const oc = document.createElement('canvas');
        oc.width = imgW; oc.height = imgH;
        const octx = oc.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, imgW, imgH);

        // draw.jsの描画関数を使ってオフスクリーンcanvasに描画
        const origCv = cv, origCtx = ctx, origZoom = state.zoom;
        const origOffX = state.offsetX, origOffY = state.offsetY;
        cv = oc; ctx = octx;

        // ズーム・オフセットを設定（contentの左上がcanvasの(0,0)に来るように）
        const zoom = imgW / contentW;
        state.zoom = zoom;
        state.offsetX = -b.minX * zoom;
        state.offsetY = -b.minY * zoom;

        draw();

        cv = origCv; ctx = origCtx;
        state.zoom = origZoom;
        state.offsetX = origOffX; state.offsetY = origOffY;

        // PDFに貼り付け
        const dataURL = oc.toDataURL('image/png');
        pdf.addImage(dataURL, 'PNG', 0, 0, pdfW, pdfH, '', 'FAST');
      }

      // ================================================================
      // テキストレイヤー（検索可能なベクターテキスト）
      // ================================================================
      // 各要素のラベル・テキスト・線番をjsPDFのtext()で重ねる
      const fsMM_base = 3.5 * s;

      function pdfVecText(wx, wy, text, color, fsMM, align) {
        if (!text) return;
        const m = (color||'#000').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (m) pdf.setTextColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16));
        else pdf.setTextColor(0,0,0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize((fsMM||fsMM_base) * 2.835);
        pdf.text(String(text), tx(wx), ty(wy), { align: align||'center' });
        pdf.setTextColor(0,0,0);
      }

      // 線番
      (pg.wires||[]).forEach(w => {
        if (!w.wireNo) return;
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        if (pts.length < 2) return;
        const mx = (pts[0].x + pts[pts.length-1].x) / 2;
        const my = (pts[0].y + pts[pts.length-1].y) / 2;
        pdfVecText(mx, my - 4, w.wireNo, '#0f6e56', fsMM_base * 0.85);
      });

      // 要素ラベル・テキスト
      (pg.elements||[]).forEach(el => {
        const lay = LAYERS.find(l => l.name===el.layer);
        if (lay && !lay.visible) return;
        const elColor = el.color || (lay ? lay.color : '#000000');

        if (el.type === 'text') {
          // テキスト要素
          const fsMM = (el.fs || 12) * s;
          pdfVecText(el.x, el.y, el.text || el.label, elColor, fsMM);
        } else if (el.label) {
          // シンボルのラベル
          const fsMM = fsMM_base;
          const def = getDef(el.type) || { w:40, h:20 };
          const hw = (def.w * (el.scale||1)) / 2;
          const rot = el.rot || 0;
          let lx = el.x, ly = el.y;
          if (rot === 0)   { lx = el.x + hw + 6; ly = el.y; }
          else if (rot === 90)  { lx = el.x + 6; ly = el.y - hw - 4; }
          else if (rot === 180) { lx = el.x - hw - 6; ly = el.y; }
          else if (rot === 270) { lx = el.x - 6; ly = el.y + hw + 4; }
          pdfVecText(lx, ly, el.label, elColor, fsMM, 'left');
        }
      });

      // 白背景・ベクター枠線は後述の図面枠処理で行う

            // ---- 図面枠・表題欄（ベクター＋ラスタライズテキスト） ----
      if (pg.frameObj) {
        const fr = pg.frameObj;
        const mg = fr.mg || 10;
        const thMM = fr.thMM || 30;
        const cols = fr.cols || 8;
        const rows = fr.rows || 4;
        const innerW = pdfW - mg * 2;
        const innerH = pdfH - mg * 2;
        const drawH = innerH - thMM;
        const tbY = mg + drawH;
        const colW = innerW / cols;
        const rowH = drawH / rows;

        pdf.setDrawColor(0);
        pdf.setLineDashPattern([], 0);

        // 外枠
        pdf.setLineWidth(0.7);
        pdf.rect(0, 0, pdfW, pdfH, 'S');
        // 内枠
        pdf.setLineWidth(0.5);
        pdf.rect(mg, mg, innerW, innerH, 'S');

        // ゾーン分割線（余白部分のみ、表題欄内には描かない）
        pdf.setLineWidth(0.2);
        pdf.setDrawColor(150, 150, 150);
        for (let c = 1; c < cols; c++) {
          const x = mg + c * colW;
          pdf.line(x, 0, x, mg);                    // 上余白
          pdf.line(x, mg + innerH, x, pdfH);        // 下余白（内枠の下〜用紙端）
        }
        for (let r = 1; r < rows; r++) {
          const y = mg + r * rowH;
          pdf.line(0, y, mg, y);                     // 左余白
          pdf.line(mg + innerW, y, pdfW, y);         // 右余白
        }

        // ゾーンラベル（列アルファベット・行番号）
        const zoneFsMM = Math.min(mg * 0.45, 3.5);
        for (let c = 0; c < cols; c++) {
          const lbl = { text: String.fromCharCode(65 + c % 26), color: '#444444' };
          const res = rasterizeTextEl(lbl, zoneFsMM);
          if (res) {
            const x = mg + c * colW + colW / 2 - res.wMM / 2;
            pdf.addImage(res.dataURL, 'PNG', x, mg / 2 - res.hMM / 2, res.wMM, res.hMM, '', 'FAST');
          }
        }
        for (let r = 0; r < rows; r++) {
          const lbl = { text: String(r + 1), color: '#444444' };
          const res = rasterizeTextEl(lbl, zoneFsMM);
          if (res) {
            const y = mg + r * rowH + rowH / 2 - res.hMM / 2;
            pdf.addImage(res.dataURL, 'PNG', mg / 2 - res.wMM / 2, y, res.wMM, res.hMM, '', 'FAST');
            pdf.addImage(res.dataURL, 'PNG', mg + innerW + mg / 2 - res.wMM / 2, y, res.wMM, res.hMM, '', 'FAST');
          }
        }

        pdf.setDrawColor(0);

        // 表題欄外枠
        pdf.setLineWidth(0.5);
        pdf.rect(mg, tbY, innerW, thMM, 'S');

        // 表題欄セル
        const cells = [
          {x:0,y:0,w:.25,h:.5,key:'drawno',lbl:'図面番号'},
          {x:.25,y:0,w:.35,h:.5,key:'title',lbl:'図面名称'},
          {x:.6,y:0,w:.2,h:.5,key:'company',lbl:'会社名'},
          {x:.8,y:0,w:.2,h:.5,key:'equip',lbl:'設備名'},
          {x:0,y:.5,w:.12,h:.5,key:'author',lbl:'作成'},
          {x:.12,y:.5,w:.12,h:.5,key:'approve',lbl:'承認'},
          {x:.24,y:.5,w:.2,h:.5,key:'date',lbl:'日付'},
          {x:.44,y:.5,w:.1,h:.5,key:'scale2',lbl:'縮尺'},
          {x:.54,y:.5,w:.06,h:.5,key:'rev',lbl:'Rev'},
          {x:.6,y:.5,w:.35,h:.5,key:'chghist',lbl:'変更履歴'},
          {x:.95,y:.5,w:.05,h:.5,key:'_page',lbl:'ページ'},
        ];

        pdf.setLineWidth(0.2);
        pdf.setDrawColor(100, 100, 100);
        const lblFsMM = thMM * 0.12;   // ラベル: セル高の約12%
        const valFsMM = thMM * 0.22;   // 値: セル高の約22%
        cells.forEach(c => {
          const cx = mg + c.x * innerW;
          const cy = tbY + c.y * thMM;
          const cw = c.w * innerW;
          const ch = c.h * thMM;
          pdf.rect(cx, cy, cw, ch, 'S');

          // ラベルテキスト
          const lblEl = { text: c.lbl, color: '#777777' };
          const lblRes = rasterizeTextEl(lblEl, lblFsMM);
          if (lblRes) pdf.addImage(lblRes.dataURL, 'PNG', cx+1, cy+1, lblRes.wMM, lblRes.hMM, '', 'FAST');

          // 値テキスト
          const val = c.key === '_page'
            ? (fr.page || `${idx+1} / ${state.pages.length}`)
            : (fr[c.key] || '');
          if (val) {
            const valEl = { text: val, color: '#111111' };
            // 変更履歴はセル幅に収まるようフォントサイズを自動縮小
            let fsMM2 = valFsMM;
            if (c.key === 'chghist' || c.key === '_page') {
              const testC = document.createElement('canvas');
              const testX = testC.getContext('2d');
              const pxPerMM = 200/25.4;
              while (fsMM2 > 1.5) {
                testX.font = `${fsMM2 * pxPerMM}px sans-serif`;
                if (testX.measureText(val).width <= (cw - 2) * pxPerMM) break;
                fsMM2 -= 0.2;
              }
            }
            const valRes = rasterizeTextEl(valEl, fsMM2);
            if (valRes) pdf.addImage(valRes.dataURL, 'PNG', cx+2, cy + ch - valRes.hMM * 0.8, valRes.wMM, valRes.hMM, '', 'FAST');
          }
        });

        // セル描画後に枠線を再描画（線が切れるのを防ぐ）
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.5);
        pdf.rect(mg, mg, innerW, innerH, 'S');
        pdf.rect(mg, tbY, innerW, thMM, 'S');
        pdf.setLineWidth(0.7);
        pdf.rect(0, 0, pdfW, pdfH, 'S');
      }
    }  // end for loop

    if (pdf) {
      pdf.save(filename);
    } else {
      alert('出力できるページがありませんでした。');
    }
  } finally {
    state.currentPage = origPage;
    state.darkMode    = origDark;
    if (origDark) document.body.classList.add('dk');
    state.sel.els   = origSelEls;
    state.sel.wires = origSelWires;
    draw();
  }
}
