// 矩形(rect)の当たり判定は辺の近くだけ(2026-10-06 js/hit_test.js hitTest)
//   node tests/test_rect_hit.js
// 盛田さん「一点鎖線で囲った中をクリックしても中のシンボルにクリックできない、ヒット判定がおかしなことになっていないか」。
// 原因: 矩形は四角の内側全体で当たり、後から描いた枠(Sheet3 の一点鎖線の囲み=要素50)が中の LS1(44)・LS2(45)より先に当たっていた。
// → 案1「辺の近くだけで当たる(円と同じ)」。塗りつぶしの四角(fillColor)は内側も当たる。
// 盛田さんの図面 drawings/仕様２1002_Sheet3.json で確かめる。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };

const src = fs.readFileSync(__dirname + '/../js/hit_test.js', 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('function hitTest('), e = src.indexOf('\nfunction hitTestWire(');
const pg = JSON.parse(fs.readFileSync(__dirname + '/../drawings/仕様２1002_Sheet3.json', 'utf8').replace(/\r\n/g, '\n')).pages[0];
const defs = {};   // 図面に入っているシンボルの写し(大きさだけ使う)
for (const d of JSON.parse(fs.readFileSync(__dirname + '/../drawings/仕様２1002_Sheet3.json', 'utf8').replace(/\r\n/g, '\n')).customSymbols || []) defs[d.type] = d;
const sb = { console, LAYERS: [], state: { zoom: 1, elements: pg.elements, showPartRef: true }, getDef: t => defs[t] || null, distToSeg() { return Infinity; } };
vm.createContext(sb);
vm.runInContext(src.slice(s, e), sb);
const who = (x, y) => { const el = sb.hitTest(x, y); return el ? (el.partRef || el.type) : null; };

eq(!!defs.custom_msekru4r_trn, true, 'LS1・LS2 のシンボル(リミット)の写しが図面にある(図面の前提)');
console.log('【Sheet3 の一点鎖線の囲み(x340 y270 幅110 高さ40)】');
eq(pg.elements[50].type + '/' + pg.elements[50].lineStyle, 'rect/dashdot', '要素50が一点鎖線の矩形(図面の前提)');
eq(who(360, 290), 'LS1', '★囲みの中の LS1 をクリックすると LS1');
eq(who(420, 290), 'LS2', '★囲みの中の LS2 をクリックすると LS2');
eq(who(390, 292), null, '★囲みの中の何も無い所は何も選ばない(以前は囲みが選ばれた)');
eq(who(342, 300), 'rect', '★左の辺の近くは囲み');
eq(who(450, 285), 'rect', '右の辺の上は囲み');

console.log('\n【塗りつぶし・向き】');
sb.state.elements = [{ type: 'rect', x: 0, y: 0, w: 100, h: 50, fillColor: '#ff0' }];
eq(who(50, 25), 'rect', '★塗りつぶしの四角は内側も当たる');
sb.state.elements = [{ type: 'rect', x: 100, y: 50, w: -100, h: -50 }];
eq([who(50, 25), who(1, 25), who(50, 49)], [null, 'rect', 'rect'], '幅・高さが負の四角も辺で当たる');
sb.state.zoom = 4;
eq(who(5, 25), null, '当たる幅は画面の8px(拡大すると狭くなる)');

console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
