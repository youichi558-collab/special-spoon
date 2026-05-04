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
    if      (el.type==='rect')   { minX=Math.min(minX,el.x); minY=Math.min(minY,el.y); maxX=Math.max(maxX,el.x+(el.w||0)); maxY=Math.max(maxY,el.y+(el.h||0)); }
    else if (el.type==='circle') { minX=Math.min(minX,el.x-(el.r||0)); minY=Math.min(minY,el.y-(el.r||0)); maxX=Math.max(maxX,el.x+(el.r||0)); maxY=Math.max(maxY,el.y+(el.r||0)); }
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

  draw();

  // 復元
  cv  = origCv;
  ctx = origCtx;
  state.zoom        = origZoom;
  state.pan         = origPan;
  state.currentPage = origPage;
  state.darkMode    = origDark;
  if (origDark) document.body.classList.add('dk');
  state.sel.els   = origSelEls;
  state.sel.wires = origSelWires;
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
  const pad = 10;
  const wW = (def.w * sc || 40) + pad*2;
  const hW = (def.h * sc || 40) + pad*2;
  const zoom = s * dpi / 25.4;
  const pxW = Math.max(4, Math.round(wW * zoom));
  const pxH = Math.max(4, Math.round(hW * zoom));
  const dispW = wW * s;
  const dispH = hW * s;

  const oc = document.createElement('canvas');
  oc.width = pxW; oc.height = pxH;
  const octx = oc.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, pxW, pxH);

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

  const tmpCv = document.createElement('canvas');
  tmpCv.width = 1; tmpCv.height = 1;
  const tmpCtx = tmpCv.getContext('2d');
  tmpCtx.font = `${fsPx}px sans-serif`;
  const pxW = Math.max(4, Math.ceil(tmpCtx.measureText(text).width + 4));
  const pxH = Math.max(4, Math.ceil(fsPx * 1.5));

  const oc = document.createElement('canvas');
  oc.width = pxW; oc.height = pxH;
  const octx = oc.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, pxW, pxH);
  octx.fillStyle = el.color || '#000000';
  octx.font = `${fsPx}px sans-serif`;
  octx.textBaseline = 'alphabetic';
  octx.fillText(text, 2, fsPx);
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
    // pdf.triangle() が一部ビルドで未定義のため pdf.lines() で代替
    const p1x = x - ax*size + nx*size*0.35, p1y = y - ay*size + ny*size*0.35;
    const p2x = x - ax*size - nx*size*0.35, p2y = y - ay*size - ny*size*0.35;
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

      // スケール: mm per world unit（アスペクト比を保って中央揃え）
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

      // ---- ワイヤー（ベクター） ----
      (pg.wires||[]).forEach(w => {
        const lay = LAYERS.find(l => l.name===w.layer);
        if (lay && !lay.visible) return;
        const lw  = w.lineWidth || 2;
        const wColor = w.color || (lay ? lay.color : '#000000');
        applyColor(wColor);
        pdf.setLineWidth(Math.max(0.05, lw * s));
        applyDash(w.lineStyle || lay?.lineDash, s);
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        for (let i=0; i<pts.length-1; i++) {
          pdf.line(tx(pts[i].x), ty(pts[i].y), tx(pts[i+1].x), ty(pts[i+1].y));
        }
        pdf.setLineDashPattern([], 0);

        // arrowStart / arrowEnd
        if (w.arrowStart && w.arrowStart !== 'none' && pts.length >= 2) {
          const dx=pts[0].x-pts[1].x, dy=pts[0].y-pts[1].y, len=Math.hypot(dx,dy);
          if (len>0.1) pdfArrow(pdf, tx(pts[0].x), ty(pts[0].y), dx/len*s, dy/len*s, 2.5, wColor);
        }
        if (w.arrowEnd && w.arrowEnd !== 'none' && pts.length >= 2) {
          const p1=pts[pts.length-2], p2=pts[pts.length-1];
          const dx=p2.x-p1.x, dy=p2.y-p1.y, len=Math.hypot(dx,dy);
          if (len>0.1) pdfArrow(pdf, tx(p2.x), ty(p2.y), dx/len*s, dy/len*s, 2.5, wColor);
        }

        // wireNo
        if (w.wireNo) {
          const n = pts.length;
          const i = Math.floor((n-1)/2), j = Math.ceil((n-1)/2);
          const mp = n >= 2 ? { x:(pts[i].x+pts[j].x)/2, y:(pts[i].y+pts[j].y)/2 } : pts[0];
          const noEl = { text: w.wireNo, color: '#1e40af' };
          const noRes = rasterizeTextEl(noEl, 2.8);
          if (noRes) pdf.addImage(noRes.dataURL, 'PNG', tx(mp.x)-noRes.wMM/2, ty(mp.y)-noRes.hMM-1.5, noRes.wMM, noRes.hMM, '', 'FAST');
        }
      });

      // ---- 要素 ----
      (pg.elements||[]).forEach(el => {
        try {
        const lay = LAYERS.find(l => l.name===el.layer);
        if (lay && !lay.visible) return;
        // 枠レイヤーの要素はframeObjが別途描画するのでスキップ
        if (el.layer && (el.layer==='図面枠'||el.layer.toLowerCase().includes('frame')||el.layer.toLowerCase().includes('border')||el.layer==='defpoints')) return;
        const lc = lay ? lay.color : '#000000';

        if (el.type==='fline') {
          const lw = el.lineWidth || 1.5;
          const fc = el.color || lc;
          applyColor(fc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle || lay?.lineDash, s);
          pdf.line(tx(el.x1), ty(el.y1), tx(el.x2), ty(el.y2));
          pdf.setLineDashPattern([], 0);
          if (el.arrowStart && el.arrowStart !== 'none') {
            const dx=el.x1-el.x2, dy=el.y1-el.y2, len=Math.hypot(dx,dy);
            if (len>0.1) pdfArrow(pdf, tx(el.x1), ty(el.y1), dx/len*s, dy/len*s, 2.5, fc);
          }
          if (el.arrowEnd && el.arrowEnd !== 'none') {
            const dx=el.x2-el.x1, dy=el.y2-el.y1, len=Math.hypot(dx,dy);
            if (len>0.1) pdfArrow(pdf, tx(el.x2), ty(el.y2), dx/len*s, dy/len*s, 2.5, fc);
          }

        } else if (el.type==='rect') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle || lay?.lineDash, s);
          if (el.fillColor) {
            const m = el.fillColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
            if (m) { pdf.setFillColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)); pdf.rect(tx(el.x), ty(el.y), tm(el.w||0), tm(el.h||0), 'FD'); }
            else pdf.rect(tx(el.x), ty(el.y), tm(el.w||0), tm(el.h||0), 'S');
          } else {
            pdf.rect(tx(el.x), ty(el.y), tm(el.w||0), tm(el.h||0), 'S');
          }
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='circle') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle || lay?.lineDash, s);
          if (el.fillColor) {
            const m = el.fillColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
            if (m) { pdf.setFillColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)); pdf.circle(tx(el.x), ty(el.y), tm(el.r||1), 'FD'); }
            else pdf.circle(tx(el.x), ty(el.y), tm(el.r||1), 'S');
          } else {
            pdf.circle(tx(el.x), ty(el.y), tm(el.r||1), 'S');
          }
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='text') {
          // テキスト: el.fsはスクリーンpx → 0.35mm/px で変換（72dpi相当）
          const fsMM = (el.fs || 14) * 0.35;
          const res = rasterizeTextEl(el, fsMM);
          if (res) {
            pdf.addImage(res.dataURL, 'PNG', tx(el.x)-2*s, ty(el.y) - res.hMM * 0.72, res.wMM, res.hMM, '', 'FAST');
          }

        } else if (el.type === 'dim') {
          // 寸法線
          const dx=el.x2-el.x1, dy=el.y2-el.y1, len=Math.hypot(dx,dy);
          if (len >= 0.1) {
            const sign=el.offsetSign||1, off=(el.offset||30)*sign;
            const ux=dx/len, uy=dy/len, px=-uy*sign, py=ux*sign;
            const absOff=Math.abs(off);
            const gap=el.gap!=null?el.gap:3, ext=el.ext!=null?el.ext:5;
            const ax1=el.x1+px*absOff, ay1=el.y1+py*absOff;
            const ax2=el.x2+px*absOff, ay2=el.y2+py*absOff;
            const dc = el.color || '#744da9';
            applyColor(dc);
            pdf.setLineWidth(Math.max(0.05, 0.3));
            // 引出し線（gap空け・ext伸び）
            pdf.line(tx(el.x1+px*gap), ty(el.y1+py*gap), tx(el.x1+px*(absOff+ext)), ty(el.y1+py*(absOff+ext)));
            pdf.line(tx(el.x2+px*gap), ty(el.y2+py*gap), tx(el.x2+px*(absOff+ext)), ty(el.y2+py*(absOff+ext)));
            pdf.line(tx(ax1), ty(ay1), tx(ax2), ty(ay2));
            pdfArrow(pdf, tx(ax1), ty(ay1),  ux*s,  uy*s, 2, dc);
            pdfArrow(pdf, tx(ax2), ty(ay2), -ux*s, -uy*s, 2, dc);
            const mx=(ax1+ax2)/2, my=(ay1+ay2)/2;
            const txt = el.dimText || String(Math.round(len));
            const dimEl = { text: txt, color: dc };
            const dimRes = rasterizeTextEl(dimEl, 2.5);
            if (dimRes) pdf.addImage(dimRes.dataURL, 'PNG', tx(mx)-dimRes.wMM/2, ty(my)-dimRes.hMM*0.6, dimRes.wMM, dimRes.hMM, '', 'FAST');
          }

        } else if (el.type === 'leader') {
          // 引き出し線
          const bx=el.bx??el.x2, by=el.by??el.y2;
          const lc2 = el.color || '#744da9';
          applyColor(lc2);
          pdf.setLineWidth(Math.max(0.05, 0.3));
          pdf.line(tx(el.x1), ty(el.y1), tx(bx), ty(by));
          if (el.bx != null) pdf.line(tx(bx), ty(by), tx(el.x2), ty(el.y2));
          const dx=bx-el.x1, dy=by-el.y1, len=Math.hypot(dx,dy);
          if (len>0.1) pdfArrow(pdf, tx(el.x1), ty(el.y1), (bx-el.x1)/len*s, (by-el.y1)/len*s, 2, lc2);
          if (el.leaderText) {
            const ltEl = { text: el.leaderText, color: lc2 };
            const ltRes = rasterizeTextEl(ltEl, 2.8);
            if (ltRes) pdf.addImage(ltRes.dataURL, 'PNG', tx(bx)+0.5, ty(by)-ltRes.hMM*0.9, ltRes.wMM, ltRes.hMM, '', 'FAST');
          }

        } else {
          // 電気シンボル: ラスタライズ（アスペクト比修正済み）
          const res = rasterizeSymEl(el, s);
          pdf.addImage(res.dataURL, 'PNG', tx(el.x)-res.dispW/2, ty(el.y)-res.dispH/2, res.dispW, res.dispH, '', 'FAST');

          // シンボルラベル（el.label）を別途描画 — 3.5mm固定
          if (el.label) {
            const def2 = getDef(el.type) || { w:64, h:34 };
            const lox = el.labelOffX || 0;
            const loy = el.labelOffY || (def2.h/2+15);
            const rot = (el.rot||0) * Math.PI/180;
            const lx = el.x + lox*Math.cos(rot) - loy*Math.sin(rot);
            const ly = el.y + lox*Math.sin(rot) + loy*Math.cos(rot);
            const lblEl2 = { text: el.label, color: '#555555' };
            const lblRes2 = rasterizeTextEl(lblEl2, 3.5);
            if (lblRes2) pdf.addImage(lblRes2.dataURL, 'PNG', tx(lx) - lblRes2.wMM/2, ty(ly) - lblRes2.hMM*0.72, lblRes2.wMM, lblRes2.hMM, '', 'FAST');
          }
        }
        } catch(e) { console.warn('PDF element render error:', el.type, e); }
      });

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
