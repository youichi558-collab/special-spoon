// ベクター PDF(2026-10-08 js/pdf_vector.js SvgCtx・vecPDFHtml)
//   node tests/test_pdf_vector.js
// 描く先(ctx)を「描いたものを SVG に書き留める ctx」に差し替えて、いつもの draw() でベクターにする。
// このテストが守るもの:
//   1. ★円は beginPath のあとでも描ける(試作の最初の版は「今の位置」が残って、丸が全部抜けた)。全円は2つの円弧
//   2. 変形(平行移動・倍率・回転)・save/restore・線の太さ/破線は倍率を掛ける・文字の揃え/基準線/太字/文字のエスケープ
//   3. 白黒(pdfWrapCtx)が SvgCtx にも効く(線・文字が黒、白い塗りは白のまま)
//   4. 印刷の HTML: ページごとに用紙の大きさ(名前付きの @page)・余白 0・ページ区切り
//   5. index.html に読み込み・PDF出力設定に「このページ」「全ページ」
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const sb = { console, window: {}, state: { pdfColor: 'mono' },
  document: { createElement: () => ({ getContext: () => ({ font: '', measureText: t => ({ width: t.length * 5 }) }) }) } };
vm.createContext(sb);
vm.runInContext(R('js/pdf_export.js'), sb);
vm.runInContext(R('js/pdf_vector.js') + '\nthis.SvgCtx = SvgCtx;', sb);
const mk = () => new sb.SvgCtx(1000, 500, 'sans-serif');

console.log('【円・円弧】');
{
  const c = mk();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.stroke();
  c.beginPath(); c.arc(50, 50, 5, 0, Math.PI * 2); c.fill();
  const d = c.out[1].match(/d="([^"]+)"/)[1];
  eq([d.startsWith('M'), (d.match(/A/g) || []).length], [true, 2], '★beginPath のあとの円は M から始まり、全円は円弧2つ');
  ok(/A5 5 0 0 1 /.test(d), '半径5・時計回り');
  c.beginPath(); c.moveTo(0, 0); c.arc(10, 0, 10, Math.PI, 0, true); c.stroke();
  ok(/^M0 0L0 0A10 10 0 0 0 20 0/.test(c.out[2].match(/d="([^"]+)"/)[1]), '反時計回りの半円(続けて描く線は L でつなぐ)');
}

console.log('\n【変形・線・文字】');
{
  const c = mk();
  c.save(); c.translate(100, 50); c.scale(2, 2);
  c.lineWidth = 1.5; c.setLineDash([4, 2]); c.strokeStyle = '#123456';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.stroke();
  ok(/d="M100 50L120 50"/.test(c.out[0]) && /stroke-width="3"/.test(c.out[0]) && /stroke-dasharray="8 4"/.test(c.out[0]), '平行移動・倍率が座標と線の太さ・破線に掛かる');
  eq(/stroke="#000000"/.test(c.out[0]), false, '(pdfWrapCtx を掛けていなければ色はそのまま)');
  c.restore();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(1, 0); c.stroke();
  ok(/d="M0 0L1 0"/.test(c.out[1]) && /stroke-width="1"/.test(c.out[1]), 'restore で元に戻る');
  c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ff0000';
  c.translate(5, 5); c.rotate(Math.PI / 2);
  c.fillText('A<B&非常停止', 1, 2);
  const t = c.out[2];
  ok(/<text transform="matrix\(0 1 -1 0 5 5\)" x="1" y="2" font-size="12" font-weight="bold"/.test(t), '文字の変形(回転)・大きさ・太字');
  ok(/text-anchor="middle" dominant-baseline="central"/.test(t) && />A&lt;B&amp;非常停止<\/text>/.test(t), '揃え・基準線・エスケープ・日本語');
  eq(c.measureText('abc').width, 15, '文字の幅は本物のキャンバスで測る');
}

console.log('\n【白黒(pdfWrapCtx)】');
{
  const c = mk();
  sb.pdfWrapCtx(c, 'mono');
  c.strokeStyle = '#4da3ff'; c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(1, 1); c.stroke(); c.fill();
  c.fillStyle = '#ffffff'; c.fillText('白い文字', 0, 0);
  ok(/stroke="#000000"/.test(c.out[0]), '★線は黒');
  ok(/fill="#ffffff"/.test(c.out[1]), '白い塗りは白のまま(紙・端子台の○の中)');
  ok(/fill="#000000"[^>]*>白い文字/.test(c.out[2]), '白い文字も黒');
  const s = c.svg(420, 297);
  ok(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="420mm" height="297mm" viewBox="0 0 1000 500">/.test(s), 'SVG は mm の大きさと描いた大きさの viewBox');
}

console.log('\n【印刷の HTML】');
{
  const h = sb.vecPDFHtml([{ svg: '<svg/>', wMM: 420, hMM: 297 }, { svg: '<svg/>', wMM: 297, hMM: 210 }, { svg: '<svg/>', wMM: 420, hMM: 297 }], '図面<1>');
  ok(/@page p420x297\{size:420mm 297mm;margin:0\}/.test(h) && /@page p297x210\{size:297mm 210mm;margin:0\}/.test(h), '★用紙の大きさごとの @page(余白 0)');
  eq((h.match(/class="pg" style="page:p420x297/g) || []).length, 2, 'ページごとに用紙を指定');
  ok(/^[^]*<style>@page\{size:420mm 297mm;margin:0\}/.test(h), '★既定の用紙はいちばん大きいページ(A3＋A4 で A3 が縮まないように)');
  ok(/\.pg\{break-after:page/.test(h) && /<title>図面&lt;1&gt;<\/title>/.test(h), 'ページ区切り・題名(保存の窓のファイル名)');
}

console.log('\n【組み込み】');
{
  const html = R('index.html');
  ok(html.indexOf('<script src="js/pdf_export.js">') < html.indexOf('<script src="js/pdf_vector.js">') && html.indexOf('<script src="js/pdf_vector.js">') > 0, 'pdf_export.js のあとに読み込む');
  ok(/onclick="exportVectorPDF\(false\)">このページ/.test(html) && /onclick="exportVectorPDF\(true\)">全ページ/.test(html), 'PDF出力設定に「このページ」「全ページ（1ファイル）」');
  ok(/__ecadLoaded[^\n]*'pdf_vector.js'/.test(R('js/pdf_vector.js')), '読み込めた目印(自動保存の点検)');
  ok(!/\bctx\.\w+\s*=[^=]|\bdraw\s*=[^=]/.test(R('js/pdf_vector.js')), '描く処理(draw.js 等)には手を入れていない(ctx を差し替えるだけ)');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
