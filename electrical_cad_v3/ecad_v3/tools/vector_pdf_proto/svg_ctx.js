// 試作(2026-10-08): canvas の 2D コンテキストと同じ形で描いたものを SVG に書き留める。アプリには組み込んでいない(tools/vector_pdf_proto/make_proto.js から読む)
// 試作: canvas の 2D コンテキストと同じ形で、描いたものを SVG として書き留める ctx。
// draw() の ctx をこれに差し替えれば、画面と同じ描画がベクター(SVG)になる。
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
  moveTo(x, y) { const [X, Y] = this._p(x, y); this._path.push(`M${r(X)} ${r(Y)}`); this._cur = [X, Y]; this._start = [X, Y]; }
  lineTo(x, y) { const [X, Y] = this._p(x, y); if (!this._cur) { this.moveTo(x, y); return; } this._path.push(`L${r(X)} ${r(Y)}`); this._cur = [X, Y]; }
  closePath() { this._path.push('Z'); if (this._start) this._cur = this._start; }
  bezierCurveTo(x1, y1, x2, y2, x, y) { const a = this._p(x1, y1), b = this._p(x2, y2), c = this._p(x, y);
    this._path.push(`C${r(a[0])} ${r(a[1])} ${r(b[0])} ${r(b[1])} ${r(c[0])} ${r(c[1])}`); this._cur = c; }
  quadraticCurveTo(x1, y1, x, y) { const a = this._p(x1, y1), c = this._p(x, y); this._path.push(`Q${r(a[0])} ${r(a[1])} ${r(c[0])} ${r(c[1])}`); this._cur = c; }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  arc(cx, cy, rad, a0, a1, ccw) {
    let sweep = a1 - a0;
    const full = Math.abs(sweep) >= Math.PI * 2 - 1e-9;
    if (!ccw) { if (!full) { while (sweep < 0) sweep += Math.PI * 2; } else sweep = Math.PI * 2; }
    else { if (!full) { while (sweep > 0) sweep -= Math.PI * 2; } else sweep = -Math.PI * 2; }
    // 細かい折れ線ではなく、円弧(A)で書く。変形が縦横同じ倍率・回転だけなので円は円のまま
    const pt = t => this._p(cx + rad * Math.cos(t), cy + rad * Math.sin(t));
    const s = pt(a0);
    if (this._cur) this._path.push(`L${r(s[0])} ${r(s[1])}`); else this._path.push(`M${r(s[0])} ${r(s[1])}`);
    const R = rad * this._sc();
    const [a, b, c, d] = this._st.m; const flip = (a * d - b * c) < 0;
    const steps = Math.abs(sweep) > Math.PI ? 2 : 1;
    for (let i = 1; i <= steps; i++) {
      const t = a0 + sweep * i / steps, e = pt(t);
      const sweepFlag = ((sweep > 0) !== flip) ? 1 : 0;
      this._path.push(`A${r(R)} ${r(R)} 0 0 ${sweepFlag} ${r(e[0])} ${r(e[1])}`);
      this._cur = e;
    }
  }
  // ---- 描く ----
  _alpha() { return this._st.alpha < 1 ? ` opacity="${this._st.alpha}"` : ''; }
  _strokeAttrs() {
    const k = this._sc(), st = this._st;
    return ` stroke="${col(st.stroke)}" stroke-width="${r(st.lw * k)}" stroke-linecap="${st.cap}" stroke-linejoin="${st.join}"`
      + (st.dash.length ? ` stroke-dasharray="${st.dash.map(v => r(v * k)).join(' ')}"` : '');
  }
  stroke() { if (this._path.length) this.out.push(`<path d="${this._path.join('')}" fill="none"${this._strokeAttrs()}${this._alpha()}/>`); }
  fill(rule) { if (this._path.length) this.out.push(`<path d="${this._path.join('')}" fill="${col(this._st.fill)}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${this._alpha()}/>`); }
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
    const paint = mode === 'stroke' ? `fill="none"${this._strokeAttrs()}` : `fill="${col(this._st.fill)}"`;
    this.out.push(`<text transform="matrix(${[a, b, c, d, e, f].map(r).join(' ')})" x="${r(x)}" y="${r(y)}" font-size="${r(size)}"${bold ? ' font-weight="bold"' : ''} font-family="${this.fontFamily}" text-anchor="${anchor}" dominant-baseline="${base}" xml:space="preserve" ${paint}${this._alpha()}>${esc(t)}</text>`);
  }
  fillText(t, x, y) { this._text(t, x, y, 'fill'); }
  strokeText(t, x, y) { this._text(t, x, y, 'stroke'); }
  svg(wmm, hmm) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="0 0 ${this.width} ${this.height}">\n${this.out.join('\n')}\n</svg>`;
  }
}
function r(v) { return Math.round(v * 100) / 100; }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function col(c) { return (typeof c === 'string' && c) ? c : '#000000'; }
window.SvgCtx = SvgCtx;
