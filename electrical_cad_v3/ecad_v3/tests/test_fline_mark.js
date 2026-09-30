// 作図線(配線ではない線)を目立たせる表示(2026-09-30、盛田さん「配線か作図線か分かるようにせんといかん」→案1)
//   node tests/test_fline_mark.js
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const draw = R('js/draw.js');
const src = draw.match(/function drawFlineMarks\(\)[\s\S]*?\n\}/)[0];
const lines = [];
const ctx = { save() {}, restore() {}, setLineDash() {}, beginPath() {}, stroke() {}, moveTo(x, y) { lines.push([x, y]); }, lineTo() {} };
const sb = { ctx, LAYERS: [{ name: '回路', visible: true }, { name: '隠す', visible: false }],
  state: { zoom: 1, elements: [
    { type: 'fline', x1: 1, y1: 2, x2: 3, y2: 4, layer: '回路' },
    { type: 'fline', x1: 9, y1: 9, x2: 9, y2: 20, layer: '隠す' },
    { type: 'rect', x: 0, y: 0, w: 5, h: 5, layer: '回路' } ] } };
vm.createContext(sb); vm.runInContext(src, sb);
sb.drawFlineMarks();
ok(lines.length === 1 && lines[0][0] === 1, '作図線だけに目印を描く(配線・他の図形・非表示レイヤーは描かない)');
ok(/if \(!state\.pdfMode && state\.showFlineMark\) drawFlineMarks\(\);/.test(draw), '画面だけ(PDFには出さない)・ボタンがONのときだけ');
ok(!/drawFlineMarks|showFlineMark/.test(R('js/dxf_export.js')), 'DXFには出さない');
ok(/showFlineMark: false/.test(R('js/state.js')) && !/showFlineMark/.test(R('js/autosave.js')) && !/showFlineMark/.test(R('js/settings.js')), '既定OFF・保存しない');
ok(/id="qb-flines"[^>]*>✏作図線</.test(R('index.html').replace(/\n\s*/g, ' ')) && /function toggleFlineMarkDisp/.test(R('js/ui.js')), 'ツールバーのボタン');
console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
