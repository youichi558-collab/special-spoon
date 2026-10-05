// 選択を外したあとの右パネル(保存ファイル名・図面枠プロパティ)を打っても、直前に選んでいた記号を書き換えない(2026-10-05)
//   node tests/test_rp_stale_apply.js
// 盛田さん「型式仕様が消える」。バックアップで、保存ファイル名を変えた回に CP1 のデバイス名・型番・仕様・端子番号が一度に空になっていた。
// 原因: js/ui.js updateRightPanel の「選択なし」の画面だけ rp._el を空にせず、即適用(rp.oninput/onchange・focusout)も残していた。
//       その画面の欄を打つと applyRightPanel() が直前の記号に対して走り、この画面に無い欄を空として読んで消していた。
// このテストが守るもの: 選択なし・複数選択の画面を出すときは、_el/_wire を空にし、即適用の仕掛けを外す。applyRightPanel は _el が無ければ何もしない
const fs = require('fs');
let ng = 0;
const ok = (c, m) => { if (c) console.log('  OK', m); else { ng++; console.log('  NG', m); } };
const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8').replace(/\r\n/g, '\n');
const body = ui.slice(ui.indexOf('function updateRightPanel()'), ui.indexOf('function applyRightPanel()'));

const noSel = body.slice(body.indexOf('if (!el && !wire) {'), body.indexOf('const item = el || wire;'));
const before = noSel.slice(0, noSel.indexOf('rp.innerHTML = html; return;'));
ok(/rp\._el = null; rp\._wire = null;/.test(before), '★選択なしの画面を出す前に _el/_wire を空にする');
ok(/rp\.oninput = rp\.onchange = null;/.test(before), '★選択なしの画面では即適用(oninput/onchange)を外す');
ok(/removeEventListener\('focusout', rp\._focusoutHandler\)/.test(before), '★選択なしの画面では focusout の即適用を外す');

const multi = body.slice(body.indexOf('if (totalSel >= 2 || selGroups.length > 0) {'), body.indexOf('if (!el && !wire) {'));
const mBefore = multi.slice(0, multi.indexOf('rp.innerHTML = `'));
ok(/rp\._el = null; rp\._wire = null;/.test(mBefore) && /rp\.oninput = rp\.onchange = null;/.test(mBefore), '複数選択の画面でも同じ');

const apply = ui.slice(ui.indexOf('function applyRightPanel()'), ui.indexOf('function applyRightPanel()') + 400);
ok(/const el\s+= rp\._el, wire = rp\._wire;[\s\S]*if \(!item\) return;/.test(apply), 'applyRightPanel は _el/_wire が無ければ何もしない');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
