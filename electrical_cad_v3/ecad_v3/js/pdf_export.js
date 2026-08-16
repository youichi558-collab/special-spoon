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
    else if (el.type==='junction') { const r=el.r||2; minX=Math.min(minX,el.x-r); minY=Math.min(minY,el.y-r); maxX=Math.max(maxX,el.x+r); maxY=Math.max(maxY,el.y+r); }
    else if (el.type==='bezier' && el.pts?.length) {
      // Catmull-Romスプラインをサンプリングして実際の範囲を計算
      const pts = el.pts;
      const steps = 20;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1, i+2)];
        for (let t = 0; t <= steps; t++) {
          const u = t / steps, u2 = u*u, u3 = u2*u;
          const x = 0.5*((2*p1.x)+(-p0.x+p2.x)*u+(2*p0.x-5*p1.x+4*p2.x-p3.x)*u2+(-p0.x+3*p1.x-3*p2.x+p3.x)*u3);
          const y = 0.5*((2*p1.y)+(-p0.y+p2.y)*u+(2*p0.y-5*p1.y+4*p2.y-p3.y)*u2+(-p0.y+3*p1.y-3*p2.y+p3.y)*u3);
          minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
        }
      }
    }
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

// 注: 旧ベクター方式のラスタライズ関数(rasterizeSymEl / rasterizeTextEl)は
// 2026-08-16に削除した。現在のPDF出力は _exportPDFPages() でキャンバス全体を
// JPEG画像として1枚埋め込む方式に変わっており、これらは定義だけが残って
// どこからも呼ばれていなかった(全ファイルgrepで呼び出し0件を確認)。
// 将来PDFをベクター化する際は git show で復元できる。

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
      // Canvas高解像度画像としてPDFに貼り付け（プレビューと完全同一の描画方式）
      // ================================================================
      {
        const dpi = 300;
        const pxPerMM = dpi / 25.4;
        // プレビューと同じ: pageW/pageH（world単位）を基準にzoom計算
        const fr2 = maskedFrame(pg.frameObj);
        let pageW2, pageH2;
        if (fr2) {
          pageW2 = (fr2.wMM || fr2.w || 297) * (fr2.sc || 1);
          pageH2 = (fr2.hMM || fr2.h || 210) * (fr2.sc || 1);
        } else {
          pageW2 = contentW; pageH2 = contentH;
        }
        // PDFページと同じ縦横比でCanvasを作る
        const imgW = Math.round(pdfW * pxPerMM);
        const imgH = Math.round(pdfH * pxPerMM);
        // zoomはpageW2/pageH2の縦横比を維持しつつCanvasに収まるように
        const sc2 = Math.min(imgW / pageW2, imgH / pageH2);

        const oc = document.createElement('canvas');
        oc.width = imgW; oc.height = imgH;
        const octx = oc.getContext('2d');
        octx.fillStyle = '#ffffff';
        octx.fillRect(0, 0, imgW, imgH);

        const origCv = cv, origCtx = ctx, origZoom = state.zoom;
        const origPan = { ...state.pan };
        const origSel = { els: new Set(state.sel.els), wires: new Set(state.sel.wires) };
        const origFrameObj = state.frameObj;
        cv = oc; ctx = octx;
        state.zoom = sc2;
        state.pdfMode = true;
        state.frameObj = maskedFrame(state.frameObj) || state.frameObj;
        state.sel.els.clear(); state.sel.wires.clear();

        if (fr2) {
          state.pan = { x: 0, y: 0 };
        } else {
          state.pan = { x: -b.minX * sc2, y: -b.minY * sc2 };
        }
        draw();

        state.pdfMode = false;
        state.frameObj = origFrameObj;
        cv = origCv; ctx = origCtx;
        state.zoom = origZoom;
        state.pan = origPan;
        state.sel.els = origSel.els; state.sel.wires = origSel.wires;

        const dataURL = oc.toDataURL('image/jpeg', 0.95);
        const actualW = pdf.internal.pageSize.getWidth();
        const actualH = pdf.internal.pageSize.getHeight();
        pdf.addImage(dataURL, 'JPEG', 0, 0, actualW, actualH, '', 'FAST');
      }

      // テキストはCanvasで描画済み（文字化け防止のためjsPDFテキストレイヤーは使わない）

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

// ================================================================
// SVGエクスポート
// ================================================================
function exportSVG() {
  _syncCurrentPage();
  const pg = state.pages[state.currentPage];
  const fr = pg.frameObj;
  const pdfW = fr ? (fr.wMM || 420) : 297;
  const pdfH = fr ? (fr.hMM || 297) : 210;

  // Canvas画像生成（高解像度600dpi）
  const dpi = 600;
  const pxPerMM = dpi / 25.4;
  const fr2 = maskedFrame(pg.frameObj);
  let pageW2, pageH2;
  if (fr2) {
    pageW2 = (fr2.wMM || fr2.w || 297) * (fr2.sc || 1);
    pageH2 = (fr2.hMM || fr2.h || 210) * (fr2.sc || 1);
  } else {
    const b = calcPageBounds(pg);
    pageW2 = b.maxX - b.minX;
    pageH2 = b.maxY - b.minY;
  }
  const imgW = Math.round(pdfW * pxPerMM);
  const imgH = Math.round(pdfH * pxPerMM);
  const sc2 = Math.min(imgW / pageW2, imgH / pageH2);

  const oc = document.createElement('canvas');
  oc.width = imgW; oc.height = imgH;
  const octx = oc.getContext('2d');
  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, imgW, imgH);

  const origCv = cv, origCtx = ctx, origZoom = state.zoom;
  const origPan = { ...state.pan };
  const origFrameObj = state.frameObj;
  const origSel = { els: new Set(state.sel.els), wires: new Set(state.sel.wires) };
  cv = oc; ctx = octx;
  state.zoom = sc2;
  state.pdfMode = true;
  state.frameObj = fr2 || state.frameObj;
  state.pan = fr2 ? { x: 0, y: 0 } : { x: -calcPageBounds(pg).minX * sc2, y: -calcPageBounds(pg).minY * sc2 };
  // テキストもCanvasで描画する（文字化け防止）
  state.sel.els.clear(); state.sel.wires.clear();

  draw();

  state.pdfMode = false;
  state.frameObj = origFrameObj;
  cv = origCv; ctx = origCtx;
  state.zoom = origZoom;
  state.pan = origPan;
  state.sel.els = origSel.els; state.sel.wires = origSel.wires;

  const dataURL = oc.toDataURL('image/png');

  // SVG生成（画像埋め込みのみ：テキストはCanvas描画済み）
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${pdfW}mm" height="${pdfH}mm" viewBox="0 0 ${pdfW} ${pdfH}">
  <image x="0" y="0" width="${pdfW}" height="${pdfH}" xlink:href="${dataURL}"/>
</svg>`;

  dl(svg, (state.saveFileName || '図面') + '.svg', 'image/svg+xml');
}

function escSVG(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
