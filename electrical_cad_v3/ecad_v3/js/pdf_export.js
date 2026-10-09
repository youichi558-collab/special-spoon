// ================================================================
// pdf_export.js — PDF出力
// 依存: state, LAYERS, getDef, drawSym, cv, ctx, dl
// ================================================================
// 【2026-10-06】PDF(と、そのプレビュー・SVG)の色。盛田さん「pdfは単色で出すのが楽だが、色付けたいときどうするかだな」→「それでいい」。
// 発端: 画面で白にしたデバイス名・仕様が、白い紙の PDF で消えていた(盛田さんの 仕様２ 1006_Sheet3.pdf で PB1・CR1・上昇・CP1 等が抜けていた)。
//   ・白黒(既定): 線・記号・文字・線番・図面枠をすべて黒。白(とほぼ白)の塗り=紙の背景・端子台の○の中・線番のふちどりは白のまま。塗りつぶしの色は黒になる
//   ・カラー: 画面と同じ色(レイヤー・文字の色)。ただし白(とほぼ白)の文字だけは黒で描く(白い紙で消えないため)
// 描く処理のあちこちを直さず、紙に描くキャンバスの「色を入れる口」(fillStyle/strokeStyle/fillText)だけを差し替える=描き忘れの抜けが出ない。
// 図面のデータの色・画面の見た目は変えない
function _pdfIsWhiteish(c) {
  if (typeof c !== 'string') return false;
  const v = c.trim().toLowerCase();
  if (v === 'white') return true;
  let r, g, b, m;
  if ((m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/))) { r = parseInt(m[1] + m[1], 16); g = parseInt(m[2] + m[2], 16); b = parseInt(m[3] + m[3], 16); }
  else if ((m = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/))) { r = parseInt(m[1], 16); g = parseInt(m[2], 16); b = parseInt(m[3], 16); }
  else if ((m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/))) { r = +m[1]; g = +m[2]; b = +m[3]; }
  else return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.88;
}
function pdfWrapCtx(c, mode) {
  mode = mode || ((typeof state !== 'undefined' && state.pdfColor === 'color') ? 'color' : 'mono');
  const P = Object.getPrototypeOf(c);
  const fsD = Object.getOwnPropertyDescriptor(P, 'fillStyle'), ssD = Object.getOwnPropertyDescriptor(P, 'strokeStyle');
  if (!fsD || !ssD) return c;
  delete c.fillStyle; delete c.strokeStyle; delete c.fillText;   // 使い回すキャンバス(プレビュー)で前の差し替えを残さない
  const black = v => (typeof v === 'string' && !_pdfIsWhiteish(v)) ? '#000000' : v;
  if (mode === 'mono') {
    Object.defineProperty(c, 'fillStyle', { configurable: true, get() { return fsD.get.call(c); }, set(v) { fsD.set.call(c, black(v)); } });
    Object.defineProperty(c, 'strokeStyle', { configurable: true, get() { return ssD.get.call(c); }, set(v) { ssD.set.call(c, black(v)); } });
  }
  const ft = P.fillText;
  c.fillText = function (...a) {
    const cur = fsD.get.call(c);
    const need = mode === 'mono' || _pdfIsWhiteish(cur);   // 文字は白でも黒に(白黒は全部・カラーは白い文字だけ)
    if (need) fsD.set.call(c, '#000000');
    try { return ft.apply(c, a); } finally { if (need) fsD.set.call(c, cur); }
  };
  return c;
}

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
  pdfWrapCtx(octx);   // PDF の色(白黒/カラー。上の pdfWrapCtx)
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
  // 【2026-10-06】プレビューも PDF と同じ「紙の描き方」(方眼なし・端子台の○の中は白)。以前は画面の方眼・背景色で描いていて、
  // 白黒(pdfWrapCtx)だと方眼と○の中まで黒くなった。PDF 本体(_buildPDF)は前から pdfMode
  const origPdfMode = state.pdfMode;
  state.pdfMode = true;

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
    state.pdfMode     = origPdfMode;
    if (origDark) document.body.classList.add('dk');
    else document.body.classList.remove('dk');
    state.sel.els   = origSelEls;
    state.sel.wires = origSelWires;
  }
  draw();
}

function _pageFileBase(pg, idx) {
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = (pg.name || ('Sheet'+(idx+1))).replace(/[\\/:*?"<>|]/g, '_');
  return `${base}_${name}`;
}

// 【2026-10-09】画像の PDF(jsPDF で 300dpi の画像を貼る runExportPDF・confirmAllPDF・runExportAllPDF・runExportAllPDFSeparate・
// _exportPDFPages・_buildPDF)は消した。盛田さん「古いpdf出力いらなくないか？」→「それでいい、消して」。
// PDF はベクター(js/pdf_vector.js exportVectorPDF。ブラウザの印刷で「PDF に保存」)だけ。古い処理が要るときは git の履歴から。
// 画像の PDF にしかできなかったのは「印刷の窓を通さずにそのまま保存」だけだった(解像度・形式の設定は元から効いていなかった)

// ================================================================
// SVGエクスポート
// ================================================================
// 【2026-10-09】SVG もベクターにした(盛田さん「svgもベクターで」)。以前は 600dpi の画像1枚を SVG に入れていただけだった。
// PDF と同じ js/pdf_vector.js vecPDFPageSVG(描く先を SVG に書き留める ctx に差し替えて draw())で、線・文字がそのまま SVG の図形・文字になる。
// 紙の色で描く(ダークモードを外す)・色は PDF出力設定の「色」(白黒/カラー)に従うのは前と同じ。文字の書体は開いたソフトの sans-serif
function exportSVG() {
  _syncCurrentPage();
  const origDark = state.darkMode;
  let p = null;
  state.darkMode = false;
  try { p = vecPDFPageSVG(state.currentPage); }
  finally { state.darkMode = origDark; draw(); }
  if (!p) { alert('出力できるものがありませんでした。'); return; }
  dl('<?xml version="1.0" encoding="UTF-8"?>\n' + p.svg, (state.saveFileName || '図面') + '.svg', 'image/svg+xml');
}

function escSVG(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['pdf_export.js'] = 1;
