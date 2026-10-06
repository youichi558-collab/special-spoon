// PDF の色: 白黒(既定)/カラー(2026-10-06 js/pdf_export.js pdfWrapCtx・_pdfIsWhiteish)
//   node tests/test_pdf_color.js
// 発端: 画面で白にしたデバイス名・仕様が、白い紙の PDF で消えていた(盛田さんの 仕様２ 1006_Sheet3.pdf で PB1・CR1・上昇・CP1 等が抜けた)。
// 盛田さん「pdfは単色で出すのが楽だが、色付けたいときどうするかだな」→ 案「PDF出力設定に色(白黒/カラー)」に「それでいい、進めて」。
// このテストが守るもの:
//   1. 白黒: 線・文字の色は全部黒。白(とほぼ白)の塗り(紙・○の中・線番のふちどり)は白のまま
//   2. カラー: 色はそのまま。白(とほぼ白)の文字だけ黒
//   3. 使い回すキャンバス(プレビュー)で前の差し替えが残らない。プレビューも紙の描き方(pdfMode)
//   4. 設定(PDF出力設定の「色」)を覚える
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const P = R('js/pdf_export.js');
const sb = { state: { pdfColor: 'mono' } };
vm.createContext(sb);
vm.runInContext(P.match(/function _pdfIsWhiteish\([\s\S]*?\n\}/)[0] + '\n' + P.match(/function pdfWrapCtx\([\s\S]*?\n\}/)[0], sb);

// キャンバスの作り物(本物と同じく、色は原型(prototype)のアクセサで持つ)
class Ctx {
  constructor() { this._f = '#000000'; this._s = '#000000'; this.log = []; }
  get fillStyle() { return this._f; } set fillStyle(v) { this._f = v; }
  get strokeStyle() { return this._s; } set strokeStyle(v) { this._s = v; }
  fillText(t) { this.log.push(['text', t, this._f]); }
  fillRect() { this.log.push(['rect', this._f]); }
}
console.log('【白(とほぼ白)の判定】');
eq(['#fff', '#ffffff', 'white', 'rgb(250,250,250)', '#eeeeee', '#aaa', '#555555', '#1d6fb5', '#d4d4cc'].map(sb._pdfIsWhiteish), [true, true, true, true, true, false, false, false, false], '白・ほぼ白だけ(画面の背景の明るい灰色 #d4d4cc は白ではない)');

console.log('\n【白黒】');
let c = new Ctx(); sb.pdfWrapCtx(c, 'mono');
c.fillStyle = '#ffffff'; c.fillRect(); c.fillStyle = '#1d6fb5'; c.fillRect(); c.strokeStyle = '#0F6E56'; const s1 = c.strokeStyle; c.strokeStyle = '#fff'; const s2 = c.strokeStyle;
c.fillStyle = '#ffffff'; c.fillText('PB1'); c.fillStyle = '#555555'; c.fillText('4C');
eq(c.log, [['rect', '#ffffff'], ['rect', '#000000'], ['text', 'PB1', '#000000'], ['text', '4C', '#000000']], '★文字は全部黒(白い文字も)・白の塗り(紙・○の中)は白・色の塗りは黒');
eq([s1, s2], ['#000000', '#fff'], '★線は黒・白い線(線番のふちどり)は白のまま');

console.log('\n【カラー】');
c = new Ctx(); sb.pdfWrapCtx(c, 'color');
c.fillStyle = '#1d6fb5'; c.fillText('INV'); c.fillStyle = '#ffffff'; c.fillText('CR1'); c.strokeStyle = '#0F6E56';
eq([c.log.map(l => l[2]), c.strokeStyle, c.fillStyle], [['#1d6fb5', '#000000'], '#0F6E56', '#ffffff'], '★色はそのまま・白い文字だけ黒(描いたあと色は元に戻す)');

console.log('\n【使い回すキャンバス】');
c = new Ctx(); sb.pdfWrapCtx(c, 'mono'); sb.pdfWrapCtx(c, 'color');
c.fillStyle = '#1d6fb5'; c.fillText('X');
eq(c.log[0][2], '#1d6fb5', '★白黒のあとカラーで描き直すと、白黒の差し替えは残らない');
sb.state.pdfColor = 'color'; c = new Ctx(); sb.pdfWrapCtx(c); c.fillStyle = '#123456'; c.fillText('Y');
eq(c.log[0][2], '#123456', '設定(state.pdfColor)に従う');

console.log('\n【組み込み】');
eq((P.match(/const octx = (pvc|oc)\.getContext\('2d'\);\n\s*pdfWrapCtx\(octx\);/g) || []).length, 3, '★プレビュー・PDF・SVG の3か所で使う');
eq(/const origPdfMode = state\.pdfMode;\n  state\.pdfMode = true;/.test(P) && /state\.pdfMode     = origPdfMode;/.test(P), true, '★プレビューも紙の描き方(方眼なし・○の中は白)で、終わったら戻す');
eq(/const origDarkSvg = state\.darkMode;\n  state\.darkMode = false;/.test(P) && /try \{ draw\(\); \} finally \{ state\.darkMode = origDarkSvg; \}/.test(P), true, '★SVG も紙の色(ダークモードを外す)で描く(以前は背景が暗い灰色→白黒で全面が黒になった。盛田さんの 仕様２ 1006.svg)');
const D = R('js/draw.js');
eq(/if \(!state\.pdfMode\) drawPreview\(\);\n  if \(!state\.pdfMode\) drawSnapMarker\(\);/.test(D), true, '★紙に描くときは、カーソルの印(＋)とシンボルの仮表示を描かない(PDF の C6 に＋が出た)');
const H = R('index.html');
eq(/<select id="pdf-color" onchange="state\.pdfColor=this\.value;stSetPref\('pdfColor',this\.value\)"[^>]*>\s*<option value="mono" selected>白黒/.test(H), true, '★PDF出力設定に「色」(初期は白黒)・選んだものを覚える');
eq(/p\.pdfColor === 'mono' \|\| p\.pdfColor === 'color'/.test(R('js/settings.js')) && /pdfColor: +'mono'/.test(R('js/state.js')), true, '次に開いたときも同じ設定');

console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
