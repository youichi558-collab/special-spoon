// ================================================================
// pdf_vector.js — ベクター PDF(2026-10-08 盛田さん「組み込んで」。HANDOFF「ベクターPDF」)
// ----------------------------------------------------------------
// 今の PDF(pdf_export.js)は図面を 300dpi の画像にして貼っているので、拡大すると粗く、文字も検索できない。
// ここでは描く先(ctx)を「描いたものを SVG として書き留める ctx」(SvgCtx)に差し替えて、いつもの draw() で描く
// (描く処理は1行も変えない。PDF と同じ pdfMode・ダークを外す・pdfWrapCtx の白黒/カラー)。
// できた SVG を全ページ並べてブラウザの印刷を開き、「PDFに保存」で保存してもらう(日本語フォントを埋め込んだベクター PDF になる)。
// 【2026-10-09】画像の PDF は消した(盛田さん「古いpdf出力いらなくないか？」)。PDF はここだけ。
// 描画が使う ctx の命令: beginPath/moveTo/lineTo/arc/closePath/stroke/fill/fillText/strokeText/fillRect/strokeRect/clearRect/
//   save/restore/translate/scale/rotate/setLineDash/measureText/globalAlpha/bezierCurveTo。clip・画像の貼り付けは使っていない(2026-10-08 確認)
// 試作(Sheet3)で今の PDF と画素で比べて、違いは紙の下端の1画素の丸めだけだった。
// ================================================================
class SvgCtx {
  constructor(w, h, fontFamily) {
    this.width = w; this.height = h;
    this.canvas = { width: w, height: h, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }) };
    this.fontFamily = fontFamily || 'sans-serif';
    this.out = [];
    this._st = { m: [1, 0, 0, 1, 0, 0], fill: '#000000', stroke: '#000000', lw: 1, dash: [], cap: 'butt', join: 'miter',
      font: '10px sans-serif', align: 'start', base: 'alphabetic', alpha: 1 };
    this._stack = [];
    this._path = [];
    const mc = document.createElement('canvas').getContext('2d');
    this._mc = mc;
  }
  // ---- 状態 ----
  get fillStyle() { return this._st.fill; } set fillStyle(v) { this._st.fill = v; }
  get strokeStyle() { return this._st.stroke; } set strokeStyle(v) { this._st.stroke = v; }
  get lineWidth() { return this._st.lw; } set lineWidth(v) { if (isFinite(v) && v > 0) this._st.lw = v; }
  get lineCap() { return this._st.cap; } set lineCap(v) { this._st.cap = v; }
  get lineJoin() { return this._st.join; } set lineJoin(v) { this._st.join = v; }
  get font() { return this._st.font; } set font(v) { this._st.font = v; }
  get textAlign() { return this._st.align; } set textAlign(v) { this._st.align = v; }
  get textBaseline() { return this._st.base; } set textBaseline(v) { this._st.base = v; }
  get globalAlpha() { return this._st.alpha; } set globalAlpha(v) { if (isFinite(v)) this._st.alpha = v; }
  setLineDash(a) { this._st.dash = (a || []).slice(); }
  getLineDash() { return this._st.dash.slice(); }
  save() { this._stack.push(Object.assign({}, this._st, { m: this._st.m.slice(), dash: this._st.dash.slice() })); }
  restore() { if (this._stack.length) this._st = this._stack.pop(); }
  // ---- 変形 ----
  _mul(n) { const [a, b, c, d, e, f] = this._st.m; const [A, B, C, D, E, F] = n;
    this._st.m = [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f]; }
  translate(x, y) { this._mul([1, 0, 0, 1, x, y]); }
  scale(x, y) { this._mul([x, 0, 0, y, 0, 0]); }
  rotate(t) { const c = Math.cos(t), s = Math.sin(t); this._mul([c, s, -s, c, 0, 0]); }
  transform(a, b, c, d, e, f) { this._mul([a, b, c, d, e, f]); }
  setTransform(a, b, c, d, e, f) { this._st.m = [a, b, c, d, e, f]; }
  resetTransform() { this._st.m = [1, 0, 0, 1, 0, 0]; }
  _p(x, y) { const [a, b, c, d, e, f] = this._st.m; return [a * x + c * y + e, b * x + d * y + f]; }
  _sc() { const [a, b] = this._st.m; return Math.hypot(a, b); }   // 線の太さ・破線の倍率(縦横同じ倍率の前提)
  // ---- 道筋 ----
  beginPath() { this._path = []; this._cur = null; this._start = null; }
  moveTo(x, y) { const [X, Y] = this._p(x, y); this._path.push(`M${_svR(X)} ${_svR(Y)}`); this._cur = [X, Y]; this._start = [X, Y]; }
  lineTo(x, y) { const [X, Y] = this._p(x, y); if (!this._cur) { this.moveTo(x, y); return; } this._path.push(`L${_svR(X)} ${_svR(Y)}`); this._cur = [X, Y]; }
  closePath() { this._path.push('Z'); if (this._start) this._cur = this._start; }
  bezierCurveTo(x1, y1, x2, y2, x, y) { const a = this._p(x1, y1), b = this._p(x2, y2), c = this._p(x, y);
    this._path.push(`C${_svR(a[0])} ${_svR(a[1])} ${_svR(b[0])} ${_svR(b[1])} ${_svR(c[0])} ${_svR(c[1])}`); this._cur = c; }
  quadraticCurveTo(x1, y1, x, y) { const a = this._p(x1, y1), c = this._p(x, y); this._path.push(`Q${_svR(a[0])} ${_svR(a[1])} ${_svR(c[0])} ${_svR(c[1])}`); this._cur = c; }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  arc(cx, cy, rad, a0, a1, ccw) {
    let sweep = a1 - a0;
    const full = Math.abs(sweep) >= Math.PI * 2 - 1e-9;
    if (!ccw) { if (!full) { while (sweep < 0) sweep += Math.PI * 2; } else sweep = Math.PI * 2; }
    else { if (!full) { while (sweep > 0) sweep -= Math.PI * 2; } else sweep = -Math.PI * 2; }
    // 細かい折れ線ではなく、円弧(A)で書く。変形が縦横同じ倍率・回転だけなので円は円のまま
    const pt = t => this._p(cx + rad * Math.cos(t), cy + rad * Math.sin(t));
    const s = pt(a0);
    if (this._cur) this._path.push(`L${_svR(s[0])} ${_svR(s[1])}`); else this._path.push(`M${_svR(s[0])} ${_svR(s[1])}`);
    const R = rad * this._sc();
    const [a, b, c, d] = this._st.m; const flip = (a * d - b * c) < 0;
    const steps = Math.abs(sweep) > Math.PI ? 2 : 1;
    for (let i = 1; i <= steps; i++) {
      const t = a0 + sweep * i / steps, e = pt(t);
      const sweepFlag = ((sweep > 0) !== flip) ? 1 : 0;
      this._path.push(`A${_svR(R)} ${_svR(R)} 0 0 ${sweepFlag} ${_svR(e[0])} ${_svR(e[1])}`);
      this._cur = e;
    }
  }
  // ---- 描く ----
  _alpha() { return this._st.alpha < 1 ? ` opacity="${this._st.alpha}"` : ''; }
  _strokeAttrs() {
    const k = this._sc(), st = this._st;
    return ` stroke="${_svCol(st.stroke)}" stroke-width="${_svR(st.lw * k)}" stroke-linecap="${st.cap}" stroke-linejoin="${st.join}"`
      + (st.dash.length ? ` stroke-dasharray="${st.dash.map(v => _svR(v * k)).join(' ')}"` : '');
  }
  stroke() { if (this._path.length) this.out.push(`<path d="${this._path.join('')}" fill="none"${this._strokeAttrs()}${this._alpha()}/>`); }
  fill(rule) { if (this._path.length) this.out.push(`<path d="${this._path.join('')}" fill="${_svCol(this._st.fill)}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${this._alpha()}/>`); }
  fillRect(x, y, w, h) { const p = this._path, c = this._cur; this.beginPath(); this.rect(x, y, w, h); this.fill(); this._path = p; this._cur = c; }
  strokeRect(x, y, w, h) { const p = this._path, c = this._cur; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this._path = p; this._cur = c; }
  clearRect() {}
  clip() {}
  drawImage() {}
  measureText(t) { this._mc.font = this._st.font; return this._mc.measureText(t); }
  _text(t, x, y, mode) {
    t = String(t == null ? '' : t);
    if (!t) return;
    const m = this._st.font.match(/(bold\s+)?([\d.]+)px/);
    const size = m ? parseFloat(m[2]) : 10, bold = !!(m && m[1]);
    const anchor = { center: 'middle', left: 'start', start: 'start', right: 'end', end: 'end' }[this._st.align] || 'start';
    const base = { middle: 'central', top: 'text-before-edge', hanging: 'hanging', bottom: 'text-after-edge', ideographic: 'ideographic' }[this._st.base] || 'alphabetic';
    const [a, b, c, d, e, f] = this._st.m;
    const paint = mode === 'stroke' ? `fill="none"${this._strokeAttrs()}` : `fill="${_svCol(this._st.fill)}"`;
    this.out.push(`<text transform="matrix(${[a, b, c, d, e, f].map(_svR).join(' ')})" x="${_svR(x)}" y="${_svR(y)}" font-size="${_svR(size)}"${bold ? ' font-weight="bold"' : ''} font-family="${this.fontFamily}" text-anchor="${anchor}" dominant-baseline="${base}" xml:space="preserve" ${paint}${this._alpha()}>${_svEsc(t)}</text>`);
  }
  fillText(t, x, y) { this._text(t, x, y, 'fill'); }
  strokeText(t, x, y) { this._text(t, x, y, 'stroke'); }
  svg(wmm, hmm) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="0 0 ${this.width} ${this.height}">\n${this.out.join('\n')}\n</svg>`;
  }
}
function _svR(v) { return Math.round(v * 100) / 100; }
function _svEsc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _svCol(c) { return (typeof c === 'string' && c) ? c : '#000000'; }

// ---- ページを SVG にする(消した画像の PDF _buildPDF と同じ計算・同じ状態の切り替え) ----
// 戻り値 { svg, wMM, hMM }。描くものが無いページは null
function vecPDFPageSVG(idx) {
  const pg = state.pages[idx];
  const b = calcPageBounds(pg);
  const contentW = b.maxX - b.minX, contentH = b.maxY - b.minY;
  if (!(contentW >= 1 && contentH >= 1)) return null;
  const wMM = pg.frameObj ? (pg.frameObj.wMM || pg.frameObj.w || 297) : (contentW >= contentH ? 297 : 210);
  const hMM = pg.frameObj ? (pg.frameObj.hMM || pg.frameObj.h || 210) : (contentW >= contentH ? 210 : 297);
  const pxPerMM = 300 / 25.4;   // 画像の PDF と同じ大きさで描く(線の太さ・文字の大きさが同じになる)
  const fr2 = maskedFrame(pg.frameObj);
  const pageW2 = fr2 ? (fr2.wMM || fr2.w || 297) * (fr2.sc || 1) : contentW;
  const pageH2 = fr2 ? (fr2.hMM || fr2.h || 210) * (fr2.sc || 1) : contentH;
  const imgW = Math.round(wMM * pxPerMM), imgH = Math.round(hMM * pxPerMM);
  const sc2 = Math.min(imgW / pageW2, imgH / pageH2);
  const sctx = new SvgCtx(imgW, imgH, 'sans-serif');
  pdfWrapCtx(sctx);   // 白黒/カラー(PDF出力設定の「色」)
  const save = { page: state.currentPage, cv, ctx, zoom: state.zoom, pan: { ...state.pan }, sel: { els: new Set(state.sel.els), wires: new Set(state.sel.wires) } };
  state.currentPage = idx;
  const origFrame = state.frameObj;
  try {
    cv = sctx.canvas; ctx = sctx;
    state.zoom = sc2; state.pdfMode = true;
    state.frameObj = maskedFrame(state.frameObj) || state.frameObj;
    state.sel.els.clear(); state.sel.wires.clear();
    state.pan = fr2 ? { x: 0, y: 0 } : { x: -b.minX * sc2, y: -b.minY * sc2 };
    draw();
  } finally {
    state.frameObj = origFrame;
    state.pdfMode = false;
    cv = save.cv; ctx = save.ctx; state.zoom = save.zoom; state.pan = save.pan;
    state.sel.els = save.sel.els; state.sel.wires = save.sel.wires;
    state.currentPage = save.page;
  }
  return { svg: sctx.svg(wMM, hMM), wMM, hMM };
}

// 印刷に渡す HTML(ページごとに用紙の大きさ。余白 0)
function vecPDFHtml(pages, title) {
  const sizes = [...new Set(pages.map(p => `${p.wMM}x${p.hMM}`))];
  // 既定の用紙は**いちばん大きいページ**に合わせる。合わせないと、ブラウザが既定の用紙幅で並べてから、はみ出す A3 のページを縮めて
  // 紙の左上に小さく出た(A3＋A4 の2ページで確認)
  const maxW = Math.max(...pages.map(p => p.wMM)), maxH = Math.max(...pages.map(p => p.hMM));
  const css = `@page{size:${maxW}mm ${maxH}mm;margin:0}html,body{margin:0;padding:0;background:#fff}svg{display:block}`
    + sizes.map(s => { const [w, h] = s.split('x'); return `@page p${s.replace('.', '_')}{size:${w}mm ${h}mm;margin:0}`; }).join('')
    + '.pg{break-after:page;overflow:hidden}.pg:last-child{break-after:auto}';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${_svEsc(title || '図面')}</title><style>${css}</style></head><body>`
    + pages.map(p => `<div class="pg" style="page:p${(p.wMM + 'x' + p.hMM).replace('.', '_')};width:${p.wMM}mm;height:${p.hMM}mm">${p.svg}</div>`).join('')
    + '</body></html>';
}

// ベクター PDF を出す(all: 全ページ1ファイル / それ以外: 今のページ)。ブラウザの印刷の窓で「PDFに保存」を選んでもらう
function exportVectorPDF(all) {
  if (typeof closeFP === 'function') closeFP('pdf-opt-p');
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const idxs = all ? state.pages.map((_, i) => i) : [state.currentPage];
  const origDark = state.darkMode;
  const pages = [];
  state.darkMode = false; document.body.classList.remove('dk');
  try {
    idxs.forEach(i => { const p = vecPDFPageSVG(i); if (p) pages.push(p); });
  } finally {
    state.darkMode = origDark; if (origDark) document.body.classList.add('dk');
    if (typeof draw === 'function') draw();
  }
  if (!pages.length) { alert('出力できるページがありませんでした。'); return; }
  const base = (state.saveFileName || '図面').replace(/\.(seqzu|json)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  const title = all ? `${base}_全ページ` : (typeof _pageFileBase === 'function' ? _pageFileBase(state.pages[state.currentPage], state.currentPage) : base);
  const old = document.getElementById('vec-pdf-frame');
  if (old) old.remove();
  const fr = document.createElement('iframe');
  fr.id = 'vec-pdf-frame';
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0';
  document.body.appendChild(fr);
  const docTitle = document.title;
  fr.onload = () => {
    // 保存の窓のファイル名はページの題名から付く
    document.title = title;
    if (typeof stToast === 'function') stToast('印刷の窓の送信先は「PDF に保存」を選んでください。「Microsoft Print to PDF」だと画像になり、A4 に縮みます', 'warn', { noHint: true });   // 案内の欄には残さない(盛田さん「これずっと出るのか？」)   // 2026-10-09 実機で取り違えた
    try { fr.contentWindow.focus(); fr.contentWindow.print(); }
    finally { setTimeout(() => { document.title = docTitle; fr.remove(); }, 1000); }
  };
  fr.srcdoc = vecPDFHtml(pages, title);
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['pdf_vector.js'] = 1;
