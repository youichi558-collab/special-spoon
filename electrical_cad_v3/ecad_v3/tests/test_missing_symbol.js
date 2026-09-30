// シンボル登録が無い(消えた)記号: 画面に印を出し、クリックで選べる(=消せる)(2026-09-30)
//   node tests/test_missing_symbol.js
// 盛田さん「部品表の未設定が消えんな」: Sheet3 の登録の無い記号(custom_ms9yggdu_zfx)は描かれず・選べず、
// INVの枠の中にあったためクリックするとINVが選ばれ、消す手段が無かった。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

const DEFS = { inv: { w: 240, h: 120 } };
const sb = { console, LAYERS: [{ name: '回路' }], getDef: t => DEFS[t], distToSeg: () => 1e9 };
vm.createContext(sb);
vm.runInContext('const MISSING_SYM_HALF = 10;\n' + pick(R('js/hit_test.js'), /function hitTest\([\s\S]*?\n\}\n/), sb);
const miss = { id: 'm', type: 'custom_gone', x: 120, y: 300, layer: '回路' };
const inv = { id: 'i', type: 'inv', x: 130, y: 280, layer: '回路' };
sb.state = { zoom: 1, elements: [miss, inv] };   // INV が後(上)に描かれる=以前は INV が先に当たった
ok(sb.hitTest(120, 300) === miss, '印の所をクリックすると、INVの枠の中でも登録の無い記号が選ばれる');
ok(sb.hitTest(200, 260) === inv, '印から離れた所(INVの本体)をクリックすればINVが選ばれる');
sb.state.elements = [inv];
ok(sb.hitTest(130, 280) === inv, '登録の無い記号が無ければ従来どおり');

const draw = R('js/draw.js');
ok(/function drawSymEl\(el, sel, lc\) \{\n  if \(!getDef\(el\.type\)\) drawMissingSymMark\(el, sel\);/.test(draw), '登録の無い記号には印を描く');
ok(/function drawMissingSymMark[\s\S]*?if \(state\.pdfMode\) return;/.test(draw), '印は画面だけ(PDFには出さない)');
ok(!/drawMissingSymMark/.test(R('js/dxf_export.js')), 'DXFにも出さない');
console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
