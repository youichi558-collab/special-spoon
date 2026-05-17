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

        // draw.jsの描画関数を使ってオフスクリーンcanvasに描画（テキストなし）
        const origCv = cv, origCtx = ctx, origZoom = state.zoom;
        const origOffX = state.offsetX, origOffY = state.offsetY;
        cv = oc; ctx = octx;

        const zoom = imgW / contentW;
        state.zoom = zoom;
        state.offsetX = -b.minX * zoom;
        state.offsetY = -b.minY * zoom;
        state.pdfSkipText = true;  // テキストをスキップ

        draw();

        state.pdfSkipText = false;
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
      function pdfVecText(wx, wy, text, color, fsPt, align) {
        if (!text) return;
        const m = (color||'#000').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (m) pdf.setTextColor(parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16));
        else pdf.setTextColor(0,0,0);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fsPt || 8);
        pdf.text(String(text), tx(wx), ty(wy), { align: align||'center' });
        pdf.setTextColor(0,0,0);
      }

      const baseFsPt = 10 * s * 2.835;

      // 線番
      (pg.wires||[]).forEach(w => {
        if (!w.wireNo) return;
        const pts2 = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        if (pts2.length < 2) return;
        const n2 = pts2.length;
        const i2 = Math.floor((n2-1)/2), j2 = Math.ceil((n2-1)/2);
        const mp = { x:(pts2[i2].x+pts2[j2].x)/2, y:(pts2[i2].y+pts2[j2].y)/2 };
        const wireFs = 10;
        const wireOff = wireFs + 6;
        pdfVecText(mp.x, mp.y - wireOff, w.wireNo, '#1e40af', wireFs * s * 2.835);
      });

      // テキスト要素
      (pg.elements||[]).forEach(el => {
        const lay2 = LAYERS.find(l => l.name===el.layer);
        if (lay2 && !lay2.visible) return;
        const elColor = el.color || (lay2 ? lay2.color : '#000000');
        const sc2 = el.scale || 1;

        if (el.type === 'text') {
          const fsPt = (el.fs || 12) * s * 2.835;
          const lines2 = (el.text || '').split('\n');
          lines2.forEach((line, li) => {
            pdfVecText(el.x, el.y + li * (el.fs||12) * s, line, elColor, fsPt);
          });
        } else if (el.label) {
          const def2 = getDef(el.type) || { w:40, h:20 };
          const hw2 = (def2.w * sc2) / 2;
          const rot2 = el.rot || 0;
          const lox = el.labelOffX || 0;
          const loy = el.labelOffY || (def2.h * sc2 / 2 + 15 * sc2);
          const ang = rot2 * Math.PI / 180;
          const lx2 = el.x + (lox * Math.cos(ang) - loy * Math.sin(ang));
          const ly2 = el.y + (lox * Math.sin(ang) + loy * Math.cos(ang));
          const fsPt2 = (el.labelFs || 11) * sc2 * s * 2.835;
          pdfVecText(lx2, ly2, el.label, elColor, fsPt2);
        }

        // 寸法テキスト
        if (el.type === 'dim' && el.dimText) {
          const dx2=el.x2-el.x1, dy2=el.y2-el.y1, len2=Math.hypot(dx2,dy2);
          if (len2 > 0.1) {
            const sign2=el.offsetSign||1, off2=(el.offset||30)*sign2;
            const ux2=dx2/len2, uy2=dy2/len2;
            const mx2=(el.x1+el.x2)/2 - uy2*off2 + (el.dimTx||0);
            const my2=(el.y1+el.y2)/2 + ux2*off2 + (el.dimTy||0);
            const fsPt3 = (el.dimFs||11) * s * 2.835;
            pdfVecText(mx2, my2, el.dimText, el.color||'#744da9', fsPt3);
          }
        }

        // 引き出し線テキスト
        if (el.type === 'leader' && el.leaderText) {
          const ltx2 = el.x2 + (el.leaderTx||0);
          const lty2 = el.y2 + (el.leaderTy||0);
          const fsPt4 = (el.leaderFs||11) * s * 2.835;
          pdfVecText(ltx2, lty2, el.leaderText, el.color||'#744da9', fsPt4, 'left');
        }

        // 角度寸法テキスト
        if (el.type === 'angle_dim' && el.dimText) {
          const a1_2 = Math.atan2(el.y1-el.cy, el.x1-el.cx);
          const a2_2 = Math.atan2(el.y2-el.cy, el.x2-el.cx);
          let da2 = a2_2 - a1_2;
          if (da2 < 0) da2 += Math.PI*2;
          const aMid2 = a1_2 + (da2 > Math.PI ? -(Math.PI*2-da2)/2 : da2/2);
          const r2 = (el.r||30) + 14;
          const dtx2 = el.cx + Math.cos(aMid2)*r2 + (el.dimTx||0);
          const dty2 = el.cy + Math.sin(aMid2)*r2 + (el.dimTy||0);
          const fsPt5 = (el.dimFs||11) * s * 2.835;
          pdfVecText(dtx2, dty2, el.dimText, el.color||'#744da9', fsPt5);
        }
      });



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
