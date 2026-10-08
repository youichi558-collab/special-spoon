// 試作(2026-10-08): Sheet3 をベクター PDF にする。アプリには組み込んでいない。
//   1) ecad_v3 で  python -m http.server 8765  2) node make_proto.js <出力先フォルダ/>
// 出力: vec_Sheet3.svg/.html/.pdf(ベクター)と old_Sheet3.pdf(今の画像の方式)。HANDOFF.md の「ベクターPDF 試作」参照
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
const SP = process.argv[2] || (__dirname + '/'); // 出力先(svg_ctx.js もここから読む)
(async () => {
  const s3 = fs.readFileSync('/home/user/special-spoon/electrical_cad_v3/ecad_v3/drawings/仕様２1002_Sheet3.json', 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
  await p.evaluate(t => loadProjectText(t, '仕様２1002_Sheet3.seqzu', 'replace'), s3); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('dev-resolve-dlg')?.remove());
  await p.addScriptTag({ path: __dirname + '/svg_ctx.js' });
  const res = await p.evaluate(async () => {
    // 今の PDF(画像)も比べるために作る
    const old = _buildPDF([state.currentPage]);
    const oldB64 = old.output('datauristring').split(',')[1];
    // ベクター: _buildPDF と同じ計算で、ctx を SvgCtx に差し替えて draw()
    const pg = state.pages[state.currentPage];
    const b = calcPageBounds(pg);
    const contentW = b.maxX - b.minX, contentH = b.maxY - b.minY;
    const pdfW = pg.frameObj ? (pg.frameObj.wMM || pg.frameObj.w || 297) : (contentW >= contentH ? 297 : 210);
    const pdfH = pg.frameObj ? (pg.frameObj.hMM || pg.frameObj.h || 210) : (contentW >= contentH ? 210 : 297);
    const pxPerMM = 300 / 25.4;
    const fr2 = maskedFrame(pg.frameObj);
    const pageW2 = fr2 ? (fr2.wMM || fr2.w || 297) * (fr2.sc || 1) : contentW;
    const pageH2 = fr2 ? (fr2.hMM || fr2.h || 210) * (fr2.sc || 1) : contentH;
    const imgW = Math.round(pdfW * pxPerMM), imgH = Math.round(pdfH * pxPerMM);
    const sc2 = Math.min(imgW / pageW2, imgH / pageH2);
    const sctx = new SvgCtx(imgW, imgH, 'sans-serif');
    pdfWrapCtx(sctx);
    const origDark = state.darkMode, origCv = cv, origCtx = ctx, origZoom = state.zoom, origPan = { ...state.pan }, origFrame = state.frameObj;
    state.darkMode = false; document.body.classList.remove('dk');
    cv = sctx.canvas; ctx = sctx; state.zoom = sc2; state.pdfMode = true;
    state.frameObj = maskedFrame(state.frameObj) || state.frameObj;
    state.sel.els.clear(); state.sel.wires.clear();
    state.pan = fr2 ? { x: 0, y: 0 } : { x: -b.minX * sc2, y: -b.minY * sc2 };
    let err = null;
    try { draw(); } catch (e) { err = String(e && e.stack || e); }
    state.pdfMode = false; state.frameObj = origFrame; cv = origCv; ctx = origCtx; state.zoom = origZoom; state.pan = origPan;
    state.darkMode = origDark; if (origDark) document.body.classList.add('dk');
    draw();
    return { svg: sctx.svg(pdfW, pdfH), pdfW, pdfH, oldB64, err, n: sctx.out.length };
  });
  console.log('elements', res.n, 'err', res.err, 'size', res.pdfW, res.pdfH);
  fs.writeFileSync(SP + 'vec_Sheet3.svg', res.svg);
  fs.writeFileSync(SP + 'old_Sheet3.pdf', Buffer.from(res.oldB64, 'base64'));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${res.pdfW}mm ${res.pdfH}mm;margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${res.svg}</body></html>`;
  fs.writeFileSync(SP + 'vec_Sheet3.html', html);
  const q = await b.newPage();
  await q.setContent(html, { waitUntil: 'load' });
  await q.pdf({ path: SP + 'vec_Sheet3.pdf', preferCSSPageSize: true, printBackground: true });
  console.log('errors', errs);
  await b.close();
})();
