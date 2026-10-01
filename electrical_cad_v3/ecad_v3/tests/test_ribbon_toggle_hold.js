// ================================================================
// リボンのON/OFFボタンの点灯が、モードを変えても消えない(2026-10-01)
//
// 盛田さん「タブの色替え全体おかしくないか？ホールドされてないような」。
// syncModeButtons(js/input.js)が `rb-` で始まるリボンのボタン全部の点灯を消していたため、
// クロスリファレンス・端子番号などは、ONのままでもEsc・選択に戻るだけで色が消えた。
// index.html の実際のボタンで、モードを切り替えるボタンだけが消えることを確かめる。
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

// index.html の rb- ボタンを、classList と onclick だけ持つ偽のDOMにする
const html = R('index.html');
const btns = [];
html.replace(/<div class="rb[^"]*" id="(rb-[a-z0-9-]+)"([^>]*)>/g, (m, id, rest) => {
  const oc = (rest.match(/onclick="([^"]*)"/) || [])[1] || '';
  const set = new Set();
  btns.push({ id, onclick: oc, getAttribute: k => (k === 'onclick' ? oc : null),
    classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c),
                 toggle: (c, f) => { if (f === undefined ? !set.has(c) : f) set.add(c); else set.delete(c); } } });
});
const byId = id => btns.find(b => b.id === id) || null;
const src = R('js/input.js');
const fn = src.slice(src.indexOf('function syncModeButtons(m) {'), src.indexOf('\nfunction toggleOrtho()'));
const sb = { state: {}, document: { querySelectorAll: () => btns, getElementById: byId } };
vm.createContext(sb);
vm.runInContext(fn, sb);

eq(btns.length > 10, true, 'index.html から rb- のボタンを読めた');
const on = id => byId(id).classList.contains('on');
console.log('【ON/OFFボタンはモードを変えても点灯したまま】');
['rb-xref', 'rb-termno'].forEach(id => byId(id).classList.add('on'));
sb.syncModeButtons('select');
eq(on('rb-xref'), true, 'クロスリファレンスはON のまま');
eq(on('rb-termno'), true, '端子番号はON のまま');
console.log('【モードのボタンは今のモードだけ点く】');
sb.syncModeButtons('rect');
eq(on('rb-rect'), true, '四角形モードで四角形が点く');
sb.syncModeButtons('select');
eq(on('rb-rect'), false, '選択に戻ると四角形は消える');
byId('rb-junction-dot').classList.add('on');
sb.syncModeButtons('select');
eq(on('rb-junction-dot'), false, '接続点の形のボタン(押すと接続点モード)は、ほかのモードで消える(従来どおり)');
console.log('【モード以外のボタンは一つも消さない】');
const toggles = btns.filter(b => !/setMode\(|setJunctionStyle\(/.test(b.onclick));
toggles.forEach(b => b.classList.add('on'));
sb.state = { ortho: true, snapEnd: true, snapMid: true, maskMode: true, textBoxDefault: true };
sb.syncModeButtons('wire');
eq(toggles.filter(b => !b.classList.contains('on')).map(b => b.id), [], 'モードを変えても、モード以外のボタンの点灯は消えない');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
