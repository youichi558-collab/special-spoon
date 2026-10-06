// 文字の初期位置・サイズ(2026-10-06 js/tools.js applyDefaultTextPos・js/report.js wnDefaultPos)
//   node tests/test_text_default_pos.js
// 盛田さん「シンボル、端子の文字関連、デバイス、型式、線番、端子番号などのデフォルト位置を見直せるか」
// → 盛田さんの図面(Sheet3)で手で動かしていた位置・サイズの真ん中に合わせる(「Aで進めて、数字は真ん中でいい」「1で、デバイス名は6」):
//   ・デバイス名: サイズ6。接点・ランプ等は右(+10)・高さ中央(0)、コイルは中央
//   ・端子番号: サイズ5。リレーの接点・コイルの縦向きの端子は線の左(-10)、文字の下端は記号の中心から 上=-7・下=+13
//   ・線番: サイズ6。縦の線は線のすぐ右(文字の中心が線から右へ8)。横の線は今までどおり上
//   ・**新しく置く/新しく線番を入れるときだけ値を入れる(案A)**。表示の初期位置は変えない=既存の図面の文字は動かない
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つからない ' + re); return m[0]; };

const defs = {
  a:    { role: 'contact_a', w: 14, h: 54, terminals: [{ x: 0, y: -25 }, { x: 0, y: 25 }] },
  b:    { role: 'contact_b', w: 20, h: 80, terminals: [{ x: 0, y: -40 }, { x: 0, y: 40 }] },
  coil: { role: 'coil', w: 96, h: 80, terminals: [{ x: 0, y: -40 }, { x: 0, y: 40 }] },
  lamp: { role: '', w: 40, h: 60, terminals: [{ x: 0, y: -30 }, { x: 0, y: 30 }] },
  side: { role: 'contact_a', w: 60, h: 20, terminals: [{ x: -30, y: 0 }, { x: 30, y: 0 }] },
};
const sb = { console, getDef: t => defs[t] || null, SYM_TERM_SEP: 2 };
vm.createContext(sb);
const T = R('js/tools.js'), REP = R('js/report.js');
vm.runInContext(pick(T, /function applyDefaultTextPos\([\s\S]*?\n\}/) + '\n' + pick(REP, /function wnDefaultPos\([\s\S]*?\n\}/) + '\n' + pick(REP, /function _setNetWireNo\([\s\S]*?\n\}/), sb);
const put = type => { const el = { type }; sb.applyDefaultTextPos(el); return el; };

console.log('【デバイス名】');
const a = put('a');
eq([a.devFs, a.devOffX, a.devOffY], [6, 10, 0], '★接点はサイズ6・右(+10)・高さ中央');
const c = put('coil');
eq([c.devFs, c.devOffX, c.devOffY], [6, undefined, 0], '★コイルはサイズ6・中央(コイルの中)');
eq([put('lamp').devOffX, put('lamp').devOffY], [10, 0], 'ランプも右・中央(Sheet3 のランプと同じ)');

console.log('\n【端子番号】');
eq([a.termFs, a.termOff], [5, [[-10, 20], [-10, -10]]], '★a接点(高さ54): サイズ5・線の左・上の番号は+20/下は-10(Sheet3 の CR1 a接点 [-8,20],[-8,-10] と同じ高さ)');
eq(put('b').termOff, [[-10, 35], [-10, -25]], '★b接点(高さ80): 上+35/下-25(Sheet3 の b接点 [-11,35],[-10,-25] と同じ高さ)');
eq(c.termOff, [[-10, 35], [-10, -25]], '★コイル: b接点と同じ(Sheet3 は [-12,34],[-12,-24])');
eq(put('lamp').termOff, undefined, 'ランプ等(種別なし)の端子番号の位置は変えない(Sheet3 でも動かしていない)');
eq(put('side').termOff, [[0, 0], [0, 0]], '横向きの端子は今までどおり');

console.log('\n【線番】');
const W = (x1, y1, x2, y2) => ({ wireNo: '', pts: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
const down = W(0, 0, 0, 100), up = W(0, 100, 0, 0), hz = W(0, 0, 100, 0);
sb._setNetWireNo([down], [0], '01'); sb._setNetWireNo([up], [0], '02'); sb._setNetWireNo([hz], [0], '03');
// draw.js の式で文字の中心を出す
const center = w => { const p = w.pts, dx = p[1].x - p[0].x, dy = p[1].y - p[0].y, L = Math.hypot(dx, dy); let nx = -dy / L, ny = dx / L; if (ny > 0) { nx = -nx; ny = -ny; } const off = (w.wireNoFs || 10) + 6; return [nx * off + (w.wireNoOffX || 0), ny * off + (w.wireNoOffY || 0)]; };
eq([down.wireNoFs, center(down)], [6, [8, 0]], '★縦の線(上→下に描いた): サイズ6・文字の中心が線の右8');
eq(center(up), [8, 0], '★縦の線(下→上に描いた)でも同じ所(描いた向きで既定の側が変わるのを打ち消す)');
eq([hz.wireNoFs, hz.wireNoOffX, hz.wireNoOffY], [6, undefined, undefined], '横の線は位置を変えない(線の上)・サイズ6');
const moved = Object.assign(W(0, 0, 0, 100), { wireNo: '05', wireNoOffX: -5, wireNoOffY: 3 });
sb._setNetWireNo([moved], [0], '06');
eq([moved.wireNo, moved.wireNoOffX, moved.wireNoOffY, moved.wireNoFs], ['06', -5, 3, undefined], '★もう番号のある線は書き換えても位置・サイズを変えない');
// 【直し】線を選ぶとプロパティ欄が補正0・0・サイズ10を書き込む(盛田さん「垂直に引いた場合、位置が左だな」)
const touched = Object.assign(W(0, 0, 0, 100), { wireNoOffX: 0, wireNoOffY: 0, wireNoFs: 10 });
sb._setNetWireNo([touched], [0], '07');
eq([touched.wireNoFs, center(touched)], [6, [8, 0]], '★プロパティ欄で補正0・0・サイズ10が入った線でも、新しく線番を入れたら線の右・サイズ6');
const keep = Object.assign(W(0, 0, 0, 100), { wireNo: '08', wireNoOffX: 0, wireNoOffY: 0, wireNoFs: 10 });
sb._setNetWireNo([keep], [0], '09');
eq([keep.wireNoFs, keep.wireNoOffX], [10, 0], '★番号のある線の書き換えでは、補正0・0でも変えない(既存の図面は動かない)');
const own = Object.assign(W(0, 0, 0, 100), { wireNoOffX: -15, wireNoOffY: 0, wireNoFs: 8 });
sb._setNetWireNo([own], [0], '10');
eq([own.wireNoFs, own.wireNoOffX], [8, -15], '先に手で補正・サイズを入れてあれば、それを使う');

console.log('\n【新しく置くときだけ(既存の図面の文字は動かない)】');
const D = R('js/draw.js');
eq([/const dy = el\.devOffY !== undefined \? el\.devOffY : -\(d\.h\*sc\/2 \+ 6\);/.test(D), /const fs = Math\.round\(el\.devFs \|\| 11\);/.test(D), /const fs  = w\.wireNoFs \|\| 10;/.test(D), /const fs = el\.termFs \|\| 9;/.test(D)], [true, true, true, true], '★表示の初期位置・サイズは変えていない');
eq([/applyDefaultTextPos\(state\.elements\[state\.elements\.length - 1\]\);/.test(pick(T, /const symTool = \{[\s\S]*?\n\};/)), /applyDefaultTextPos\(state\.elements\[state\.elements\.length-1\]\)/.test(R('js/symbol_lib.js'))], [true, true], '★シンボルを置いたとき(パレット・シンボルライブラリ)に入れる');
eq([/wnDefaultPos\(w\)/.test(R('js/input.js')), /wnDefaultPos\(wire\)/.test(R('js/input.js')), /wnFresh[\s\S]{0,600}wnDefaultPos\(wire\)/.test(R('js/ui.js')), /const was = w\.wireNo;[^\n]*if \(!was &&/.test(R('js/input.js')), /const was = wire\.wireNo;[^\n]*if \(!was &&/.test(R('js/input.js'))], [true, true, true, true, true], '★線番を新しく入れる所(線番ツール・ダブルクリック・プロパティ)で入れる・番号のある線の書き換えでは入れない');

console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
