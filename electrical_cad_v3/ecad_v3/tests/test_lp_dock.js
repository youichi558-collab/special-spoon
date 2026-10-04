// ================================================================
// 左パネルの「固定」(ドッキング)(2026-10-02)
//
// UIレビュー「左パネルをドッキング可能に」→ 盛田さん「左パネルも進めて」。
//   ・ONのとき、シンボル一覧・レイヤー・部品DBの窓を縦タブのすぐ右に並べ、キャンバスはその右から(一覧が開いているときだけ)
//   ・右端のドラッグで幅(180〜600、画面の幅から400はキャンバスなどに残す)。ON/OFFと幅は前回値を覚える。既定はOFF(従来の浮いた窓)
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const ui = R('js/ui.js');
const pick = name => { const i = ui.indexOf('function ' + name + '('); return ui.slice(i, ui.indexOf('\n}\n', i) + 2); };

const mkCls = () => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, f) => { if (f === undefined ? !s.has(c) : f) s.add(c); else s.delete(c); } }; };
const panels = { 'sym-float': { style: { display: 'none' } }, 'lay-float': { style: { display: 'none' } }, 'prt-float': { style: { display: 'none' } } };
const cw = { style: {} }, bar = { style: {}, classList: mkCls() }, dockBtn = { classList: mkCls() };
const lp = { classList: mkCls(), getBoundingClientRect: () => ({ right: 52 }) };
const mr = { getBoundingClientRect: () => ({ top: 111, height: 743 }) };
const vars = {};
let saved = {};
const els = Object.assign({ cw, lp, 'main-row': mr, 'lpd-resizer': bar, 'lt-dock': dockBtn }, panels);
const sb = { window: { innerWidth: 1500 }, document: { getElementById: id => els[id] || null, body: { classList: mkCls() },
  documentElement: { style: { setProperty: (k, v) => { vars[k] = v; } } } },
  resize() {}, draw() {}, stSetPref: (k, v) => { saved[k] = v; } };
vm.createContext(sb);
vm.runInContext(ui.slice(ui.indexOf('const LPD_W_DEF'), ui.indexOf('let _lpdW')) + 'let _lpdW = LPD_W_DEF;\n'
  + ['_lpdOpenPanel', 'applyLpLayout', '_lpdRelayout', 'toggleLpDock', 'lpdSetWidth'].map(pick).join('\n'), sb);

console.log('【固定OFF(既定)は従来どおり】');
panels['sym-float'].style.display = 'flex';
sb.applyLpLayout();
eq(cw.style.marginLeft, '0', 'OFFでは一覧が開いていてもキャンバスは動かさない(浮いた窓)');
console.log('【固定ON】');
sb.toggleLpDock();
eq([sb.document.body.classList.contains('lp-docked'), saved.lpDocked], [true, 1], 'ONにして覚える');
eq([cw.style.marginLeft, vars['--lpd-left'], vars['--lpd-w'], vars['--lpd-top'], vars['--lpd-h']], ['280px', '52px', '280px', '111px', '743px'], '縦タブの右に280で置き、キャンバスはその右から');
eq([bar.style.display, bar.style.left], ['block', '329px'], '右端にドラッグの取っ手');
panels['sym-float'].style.display = 'none'; sb.applyLpLayout();
eq([cw.style.marginLeft, bar.style.display], ['0', 'none'], '一覧を畳むとキャンバスは全幅');
panels['prt-float'].style.display = 'flex';
sb.lpdSetWidth(400, true);
eq([cw.style.marginLeft, saved.lpDockW], ['400px', 400], '幅を変えて覚える');
eq((sb.lpdSetWidth(5000, false), cw.style.marginLeft), '600px', '幅の上限600');
sb.window.innerWidth = 800; sb.applyLpLayout();
eq(cw.style.marginLeft, '400px', '画面の幅から400は残す(800なら最大400)');
sb.window.innerWidth = 1500;
sb.document.body.classList.add('fullscreen'); sb.applyLpLayout();
eq(cw.style.marginLeft, '0', '大画面ではキャンバス全幅');
sb.document.body.classList.remove('fullscreen');
sb.toggleLpDock();
eq([cw.style.marginLeft, saved.lpDocked], ['0', ''], 'OFFに戻すとキャンバスは元どおり・覚えた値も消す');

console.log('【つながり】');
ok(/body\.lp-docked #sym-float, body\.lp-docked #prt-float, body\.lp-docked #lay-float, body\.lp-docked #prj-float\{/.test(R('css/style.css')), '4つの窓(シンボル・レイヤー・部品DB・プロジェクト)を固定の位置に置くCSS');
ok(/id="lt-dock" onclick="toggleLpDock\(\)"/.test(R('index.html')) && /id="lpd-resizer" onmousedown="lpdStartResize\(event\)"/.test(R('index.html')), '固定ボタンと幅の取っ手');
ok(/_lpdRelayout\(\);   \/\/ 固定\(ドッキング\)のときは/.test(ui), 'タブの切替でキャンバスを合わせる');
ok(/if \(document\.body\.classList\.contains\('lp-docked'\)\) return;   \/\/ 固定\(ドッキング\)中は動かさない/.test(ui), '固定中は窓をドラッグで動かさない');
ok(/toggleLpDock\(!!p\.lpDocked\)/.test(R('js/settings.js')), '起動時に前回のON/OFFと幅を戻す');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
