// プロパティの「部品表の対象外」を目立たせる(2026-10-06 js/ui.js _ppZoneHtml・css/style.css .pp-zone)
//   node tests/test_pp_zone.js
// 盛田さん「プロパティの部品表対象外のチェックボックスをもっと目立つようにできないか」→ 案1:
//   枠で囲んだ1行・大きめのチェックボックス。チェックを入れたら枠と背景を赤にして「この部品は部品表に出ません」
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const U = R('js/ui.js');
const sb = {};
vm.createContext(sb);
vm.runInContext(U.match(/function _ppZoneHtml\([\s\S]*?\n\}/)[0], sb);

const off = sb._ppZoneHtml('pp-zone', false), on = sb._ppZoneHtml('pp-zone', true);
ok(/^<label class="pp-zone"[^>]*><input type="checkbox" id="pp-zone">/.test(off), '★枠(pp-zone)で囲んだ1行・欄の id は従来どおり(保存側はそのまま)');
ok(/id="pp-zone" checked>/.test(on) && /この部品は部品表に出ません/.test(on), 'チェックを入れたときの説明文');
ok((U.match(/_ppZoneHtml\('pp-zone', el\.panelZone==='外'\)/g) || []).length === 1 && (U.match(/_ppZoneHtml\('pp-jzone', el\.panelZone==='外'\)/g) || []).length === 1, '★シンボル(pp-zone)と端子台(pp-jzone)の両方');
ok(!/<label>部品表の対象外<\/label><input type="checkbox"/.test(U), '前の小さいチェックボックスの行は残っていない');
const C = R('css/style.css');
ok(/\.pp-zone:has\(input:checked\)\{[^}]*border-color:var\(--red\);[^}]*background:var\(--rbg\)/.test(C), '★チェックを入れたら枠と背景が赤(CSS で切り替え=型式の引き継ぎでプログラムからチェックしても色が追いつく)');
ok(/\.pp-zone input\[type=checkbox\]\{width:16px;height:16px/.test(C), 'チェックボックスを大きく');
ok(/\.pp-zone \.pp-zone-on\{display:none/.test(C) && /\.pp-zone:has\(input:checked\) \.pp-zone-on\{display:block;\}/.test(C), '説明文はチェックを入れたときだけ');

console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
