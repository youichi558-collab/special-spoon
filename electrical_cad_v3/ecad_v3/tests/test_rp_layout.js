// ================================================================
// 右パネル(プロパティ)の幅とキャンバスの範囲(2026-10-02)
//
// UIレビュー「右プロパティ最優先」→ 盛田さん「右パネルから進めていい」。
// 以前は幅200px固定・position:fixed でキャンバスに重なり、キャンバスの右200px分の図面がパネルの下に隠れていた。
//   ・キャンバスの右端をパネルの左端までにする(折りたたみ・非表示・大画面ではキャンバス全幅)
//   ・パネルの左端をドラッグで幅を変える(200〜700、画面の幅から300はキャンバスに残す)。幅は前回値を覚える
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const ui = R('js/ui.js');
const pick = name => { const i = ui.indexOf('function ' + name + '('); return ui.slice(i, ui.indexOf('\n}\n', i) + 2); };

const cls = set => ({ contains: c => set.has(c) });
const rp = { style: {}, classList: cls(new Set()) }, cw = { style: {} };
const bodyCls = new Set();
let saved = null;
const sb = { window: { innerWidth: 1500 }, document: { getElementById: id => ({ rp, cw })[id] || null, body: { classList: cls(bodyCls) } },
  resize() {}, draw() {}, stSetPref: (k, v) => { saved = [k, v]; } };
vm.createContext(sb);
vm.runInContext(ui.slice(ui.indexOf('const RP_W_DEF'), ui.indexOf('let _rpW')) + 'let _rpW = RP_W_DEF;\n' + ['rpClampWidth', 'applyRpLayout', 'rpSetWidth'].map(pick).join('\n'), sb);

console.log('【キャンバスの右端をパネルに合わせる】');
sb.applyRpLayout();
eq([rp.style.width, cw.style.marginRight], ['200px', '200px'], '既定: パネル200・キャンバスの右を200空ける');
sb.rpSetWidth(320, true);
eq([rp.style.width, cw.style.marginRight, saved], ['320px', '320px', ['rpWidth', 320]], '幅を変えるとキャンバスも合わせ、幅を覚える');
rp.classList = cls(new Set(['collapsed'])); sb.applyRpLayout();
eq(cw.style.marginRight, '0', '折りたたみ: キャンバスは全幅');
rp.classList = cls(new Set(['hide'])); sb.applyRpLayout();
eq(cw.style.marginRight, '0', '非表示: キャンバスは全幅');
rp.classList = cls(new Set()); bodyCls.add('fullscreen'); sb.applyRpLayout(); bodyCls.delete('fullscreen');
eq(cw.style.marginRight, '0', '大画面: キャンバスは全幅');

console.log('【幅の範囲】');
eq([sb.rpClampWidth(50), sb.rpClampWidth(5000)], [200, 700], '200〜700');
sb.window.innerWidth = 800;
eq(sb.rpClampWidth(700), 500, '画面の幅から300はキャンバスに残す(800なら最大500)');

console.log('【つながり】');
ok(/#cw\{flex:1;min-width:0;/.test(R('css/style.css')), 'キャンバスの枠は中のキャンバスの幅に縛られず縮む(min-width:0)');
ok(/#rp\.collapsed\{transform:translateX\(100%\);\}/.test(R('css/style.css')), '折りたたみは自分の幅だけ外へ(幅が変わっても)');
ok(/id="rp-resizer" onmousedown="rpStartResize\(event\)"/.test(R('index.html')), 'パネルの左端にドラッグの取っ手');
ok(/rpSetWidth\(p\.rpWidth \|\| \(p\.uiV2 === true && typeof UIV2_RP_W !== 'undefined' \? UIV2_RP_W : RP_W_DEF\), false\)/.test(R('js/settings.js')), '起動時に前回の幅を戻す(前回値が無ければ 今の画面 200 / 新しい画面 272。2026-10-07)');
ok(/applyRpLayout\(\);\s*\/\/ キャンバスの右端をパネルに合わせる/.test(ui), '折りたたみの切替でキャンバスを合わせる');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
