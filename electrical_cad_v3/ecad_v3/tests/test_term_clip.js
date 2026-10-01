// ================================================================
// 端子台の端子(○◎)の円の中を通る線(2026-10-01)
//
// 盛田さん「端子台は後からのせるのはできないか」「dxf,pdfの◯は中が見えて線が貫通するように見える」。
//   ・clipPolylineByCircles(js/draw.js): 折れ線から円の中の部分を取り除く
//   ・splitWiresAtTerminal(js/tools.js): 端子を線の上に置いたら、その線を円のところで切って分ける
//     (端子台表・接続チェック・線番表は「円に線の端が乗っている」でつなぐ。貫通したままだと未接続扱いだった)
//   ・DXF出力は円の中の線を出さない / PDF・SVGは円の中を紙の色(白)で塗る
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const pick = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) throw new Error('無い: ' + name); return src.slice(i, src.indexOf('\n}\n', i) + 2); };
const r1 = pts => pts.map(pl => pl.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]));

let gid = 0;
const sb = { state: { wires: [] }, genId: k => k + '_new' + (++gid) };
vm.createContext(sb);
vm.runInContext([pick(R('js/draw.js'), 'termCircles'), pick(R('js/draw.js'), 'clipPolylineByCircles'), pick(R('js/tools.js'), 'splitWiresAtTerminal')].join('\n'), sb);
const C = [{ x: 200, y: 100, r: 4 }];

console.log('【円の中の部分を取り除く】');
eq(r1(sb.clipPolylineByCircles([{ x: 100, y: 100 }, { x: 300, y: 100 }], C)), [[[100, 100], [196, 100]], [[204, 100], [300, 100]]], '円を貫通する線は、円周で2本に切れる');
eq(r1(sb.clipPolylineByCircles([{ x: 100, y: 100 }, { x: 200, y: 100 }], C)), [[[100, 100], [196, 100]]], '円の中心まで引いた線は円周で止まる');
eq(r1(sb.clipPolylineByCircles([{ x: 100, y: 100 }, { x: 196, y: 100 }], C)), [[[100, 100], [196, 100]]], '円周で止めてある線はそのまま');
eq(r1(sb.clipPolylineByCircles([{ x: 100, y: 50 }, { x: 300, y: 50 }], C)), [[[100, 50], [300, 50]]], '円に掛からない線はそのまま');
eq(r1(sb.clipPolylineByCircles([{ x: 100, y: 100 }, { x: 250, y: 100 }, { x: 250, y: 200 }], C)), [[[100, 100], [196, 100]], [[204, 100], [250, 100], [250, 200]]], '折れ線: 円より先の角はつながったまま');
eq(sb.termCircles([{ type: 'junction', style: 'circle', x: 1, y: 2, r: 3 }, { type: 'junction', style: 'dot', x: 0, y: 0 }, { type: 'junction', style: 'dbl', x: 5, y: 6 }]),
  [{ x: 1, y: 2, r: 3 }, { x: 5, y: 6, r: 5 }], '対象は端子(○◎)だけ。分岐点●は対象外');

console.log('【端子を線の上に置いたら線を分ける】');
sb.state.wires = [
  { id: 'w1', x1: 100, y1: 100, x2: 300, y2: 100, pts: [{ x: 100, y: 100 }, { x: 300, y: 100 }], wireNo: 'W001', wireNoOffX: 3, layer: '回路', noAutoNum: true },
  { id: 'w2', x1: 100, y1: 50, x2: 300, y2: 50, wireNo: 'W002', layer: '回路' },
];
const keep = sb.state.wires;
eq(sb.splitWiresAtTerminal({ x: 230, y: 100, r: 4 }), 1, '貫通していた線1本を分けた');
eq(sb.state.wires === keep, true, '配線の配列はそのまま(ページの配列を差し替えない)');
eq(sb.state.wires.map(w => [w.id, Math.round(w.x1), Math.round(w.x2), w.wireNo]), [['w1', 100, 226, 'W001'], ['w_new1', 234, 300, ''], ['w2', 100, 300, 'W002']],
  '長い方が元のIDと線番を持ち、短い方は線番なし(1ネット1か所)。関係ない線はそのまま');
eq([sb.state.wires[0].wireNoOffX, sb.state.wires[1].wireNoOffX], [3, undefined], '線番の位置補正も長い方だけ');
eq(sb.state.wires[1].noAutoNum, true, 'ほかの設定(自動採番の対象外など)は両方に写す');
eq(sb.state.wires[1].pts.length, 2, '分けた線も pts を持つ');
eq(sb.splitWiresAtTerminal({ x: 500, y: 500, r: 4 }), 0, '線の無い所に置いたら何もしない');

console.log('【DXF・PDFで円の中の線を見せない】');
ok(/clipPolylineByCircles\(pts, _tbCircles\)/.test(R('js/dxf_export.js')), 'DXF: 配線は円の中の部分を出さない');
ok(/state\.pdfMode \? '#ffffff'/.test(R('js/draw.js')), 'PDF・SVG: 端子の円の中は紙の色(白)で塗る');
ok(/splitWiresAtTerminal\(_jn\)/.test(R('js/tools.js')), '端子(○◎)を置いたときに線を分ける');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
