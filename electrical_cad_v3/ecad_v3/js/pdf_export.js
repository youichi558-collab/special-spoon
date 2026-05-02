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
    else if (el.type==='dim' || el.type==='leader') {
      const off = (el.offset||30) + 20;
      minX=Math.min(minX,el.x1,el.x2)-off; minY=Math.min(minY,el.y1,el.y2)-off;
      maxX=Math.max(maxX,el.x1,el.x2)+off; maxY=Math.max(maxY,el.y1,el.y2)+off;
    }
    else if (el.x1!=null) { minX=Math.min(minX,el.x1,el.x2); minY=Math.min(minY,el.y1,el.y2); maxX=Math.max(maxX,el.x1,el.x2); maxY=Math.max(maxY,el.y1,el.y2); }
    else if (el.x!=null)  { minX=Math.min(minX,el.x-hw); minY=Math.min(minY,el.y-hh); maxX=Math.max(maxX,el.x+hw); maxY=Math.max(maxY,el.y+hh); }
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

function exportPDF() {
  document.getElementById('pdf-opt-p').classList.add('open');
}

// シンボル要素をオフスクリーンキャンバスでラスタライズ → dataURL
function rasterizeSymEl(el, s) {
  const dpi = 200;
  const def = getDef(el.type) || { w:40, h:40 };
  const pad = 10;
  const wW = (def.w||40) + pad*2;
  const hW = (def.h||40) + pad*2;
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
  // zoom=1にするとdrawSym内の N/state.zoom がN pxになりcanvasスケールで拡大される
  // → フォントが適切なサイズになる
  state.zoom = 1;

  octx.save();
  octx.translate(pxW/2, pxH/2);
  octx.scale(zoom, zoom);
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
  octx.fillStyle = el.color || '#000000';
  octx.font = `${fsPx}px sans-serif`;
  octx.textBaseline = 'alphabetic';
  octx.fillText(text, 2, fsPx);
  return { dataURL: oc.toDataURL('image/png'), wMM: pxW / pxPerMM, hMM: pxH / pxPerMM };
}

function runExportPDF() {
  closeFP('pdf-opt-p');
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
    if      (style==='dash')    pdf.setLineDashPattern([8*s, 4*s], 0);
    else if (style==='dot')     pdf.setLineDashPattern([2*s, 4*s], 0);
    else if (style==='dashdot') pdf.setLineDashPattern([8*s, 3*s, 2*s, 3*s], 0);
    else                        pdf.setLineDashPattern([], 0);
  }

  try {
    for (let idx = 0; idx < state.pages.length; idx++) {
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
        applyColor(lay ? lay.color : '#000000');
        pdf.setLineWidth(Math.max(0.05, lw * s));
        applyDash(w.lineStyle, s);
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        for (let i=0; i<pts.length-1; i++) {
          pdf.line(tx(pts[i].x), ty(pts[i].y), tx(pts[i+1].x), ty(pts[i+1].y));
        }
        pdf.setLineDashPattern([], 0);
      });

      // ---- 要素 ----
      (pg.elements||[]).forEach(el => {
        const lay = LAYERS.find(l => l.name===el.layer);
        if (lay && !lay.visible) return;
        // 枠レイヤーの要素はframeObjが別途描画するのでスキップ
        if (el.layer && (el.layer==='図面枠'||el.layer.toLowerCase().includes('frame')||el.layer.toLowerCase().includes('border')||el.layer.toLowerCase().includes('図面')||/[^\x00-\x7F]/.test(el.layer))) return;
        const lc = lay ? lay.color : '#000000';

        if (el.type==='fline') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle, s);
          pdf.line(tx(el.x1), ty(el.y1), tx(el.x2), ty(el.y2));
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='rect') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle, s);
          pdf.rect(tx(el.x), ty(el.y), tm(el.w||0), tm(el.h||0), 'S');
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='circle') {
          const lw = el.lineWidth || 1.5;
          applyColor(el.color || lc);
          pdf.setLineWidth(Math.max(0.05, lw * s));
          applyDash(el.lineStyle, s);
          pdf.circle(tx(el.x), ty(el.y), tm(el.r||1), 'S');
          pdf.setLineDashPattern([], 0);

        } else if (el.type==='text') {
          // テキスト: el.fsはスクリーンpx → 0.35mm/px で変換（72dpi相当）
          const fsMM = (el.fs || 14) * 0.35;
          const res = rasterizeTextEl(el, fsMM);
          if (res) {
            pdf.addImage(res.dataURL, 'PNG', tx(el.x)-2*s, ty(el.y) - res.hMM * 0.72, res.wMM, res.hMM, '', 'FAST');
          }

        } else if (el.type!=='dim' && el.type!=='leader') {
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
      pdf.save((state.saveFileName || '回路図') + '.pdf');
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
