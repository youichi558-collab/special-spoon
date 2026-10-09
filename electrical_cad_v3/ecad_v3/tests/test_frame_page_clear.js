// ================================================================
// 図面枠の「ページ」欄を空にして配置したら、空(=表題欄は自動の「n / 総数」)に戻る(2026-10-01)
//
// 以前は applyFrame(js/frame.js)が `欄の値 || 前の値` だったので、一度入れた頁番号を空欄に戻せなかった。
// 頁番号はクロスリファレンス等の位置(elLocation)にも使うので、戻せないと分割ファイルで困る。
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const src = fs.readFileSync(__dirname + '/../js/frame.js', 'utf8').replace(/\r\n/g, '\n');
const pick = name => { const i = src.indexOf('function ' + name + '('); return src.slice(i, src.indexOf('\n}\n', i) + 2); };

const vals = { 'frame-scale': '2', 'frame-w': '420', 'frame-h': '297', 'frame-mg': '10', 'frame-th': '30', 'frame-cols': '12', 'frame-rows': '4', 'frame-tbtpl': 'standard' };
['drawno', 'title', 'company', 'equip', 'author', 'approve', 'date', 'scale2', 'rev', 'chghist', 'page'].forEach(k => { vals['f-' + k] = ''; });
const el = id => (id in vals) ? { get value() { return vals[id]; }, set value(v) { vals[id] = v; } } : null;
const sb = { state: { frameObj: null }, document: { getElementById: el }, pushH() {}, closeFP() {}, resetView() {}, draw() {}, openFP() {},
  refreshFrameTplSel() {}, refreshTitleBlockSel() {} };
vm.createContext(sb);
vm.runInContext(pick('applyFrame') + '\n' + pick('showFramePanel'), sb);

vals['f-page'] = '12';
sb.applyFrame();
eq(sb.state.frameObj.page, '12', '頁番号を入れて配置すると入る');
sb.showFramePanel();
eq(vals['f-page'], '12', 'パネルを開き直すと欄に今の頁番号が入っている');
vals['f-page'] = '';
sb.applyFrame();
eq(sb.state.frameObj.page, '', '欄を空にして配置すると空(自動)に戻る');
vals['f-page'] = ' 7 ';
sb.applyFrame();
eq(sb.state.frameObj.page, '7', '前後の空白は取る');

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
