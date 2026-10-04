// フロートパネルの「×」とEsc(2026-10-04 盛田さん「全般閉じるが使いづらい」→「Aで直していいが、×は必ず出るように設計」)
//   node tests/test_fp_close.js
// このテストが守るもの:
//   1. 「×」は openFP の中で差し込む(パネルの HTML に書かない)= openFP で開くパネルには必ず出る。.fp を openFP 以外で開いていない
//   2. 「×」・Esc は、パネルの一番下の「閉じる」「キャンセル」を押したのと同じ(ボタンの処理を通す)。ボタンが無ければ閉じるだけ
//   3. Esc は一番手前(最後に開いた)パネルから閉じる。作図中の Esc より先(js/edit.js)
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const ui = R('js/ui.js');

console.log('【「×」は必ず出る】');
const openSrc = ui.match(/function openFP\([\s\S]*?\n\}/)[0];
ok(/fpEnsureClose\(el\)/.test(openSrc), '★openFP が開くたびに「×」を差し込む(パネルごとの HTML に頼らない)');
const jsFiles = fs.readdirSync(__dirname + '/../js').filter(f => f.endsWith('.js') && !/\.min\.js$/.test(f));
const bad = jsFiles.filter(f => {
  const s = R('js/' + f);
  // openFP の本体と、右クリックメニュー(.fp ではない)以外で 'open' を付けていないか
  return (s.match(/classList\.add\('open'\)/g) || []).length > (f === 'ui.js' ? 2 : 0);
});
ok(bad.length === 0, `★フロートパネルを openFP 以外で開いていない(開くと「×」が出ない)${bad.length ? ' : ' + bad.join(',') : ''}`);
ok(/\.fp-x-wrap\{position:sticky/.test(R('css/style.css')), '「×」は中をスクロールしても上に残る(sticky)');
ok(!/class="fp-x/.test(R('index.html')), 'パネルの HTML に「×」を手で書いていない(二重に出さない)');

console.log('\n【「×」・Esc はパネルの閉じる/キャンセルと同じ動き】');
const pick = n => ui.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'))[0];
function btn(text, onClick) { return { textContent: text, classList: { contains: () => false }, click: onClick }; }
function panel(id, buttons) {
  const cls = new Set(['open']);
  return { id, buttons, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
    querySelectorAll: () => buttons };
}
const els = {};
const sb = { document: { getElementById: id => els[id] || null, querySelectorAll: () => Object.values(els).filter(e => e.classList.contains('open')) } };
vm.createContext(sb);
vm.runInContext('var _fpStack = [];\nfunction closeFP(id){ const e=document.getElementById(id); if(e) e.classList.remove("open"); }\n'
  + ['fpCloseButton', 'fpClose', 'fpCloseTop'].map(pick).join('\n'), sb);
{
  let cancelled = 0;
  els.a = panel('a', [btn('OK'), btn('キャンセル', () => { cancelled++; els.a.classList.remove('open'); })]);
  sb.fpClose('a');
  ok(cancelled === 1 && !els.a.classList.contains('open'), '★一番下の「キャンセル」の処理を通して閉じる(部品の割り当ての取り消し等)');
  els.b = panel('b', [btn('保存')]);
  sb.fpClose('b');
  ok(!els.b.classList.contains('open'), 'ボタンが無いパネルは閉じるだけ');
  els.c = panel('c', [btn('閉じる', () => {})]);   // ボタンが閉じなくても
  sb.fpClose('c');
  ok(!els.c.classList.contains('open'), '★ボタンの処理が閉じなくても必ず閉じる(×を押して閉じないことが無い)');
}
{
  els.a = panel('a', []); els.b = panel('b', []);
  vm.runInContext('_fpStack = ["b", "a"]', sb);
  sb.fpCloseTop();
  ok(!els.a.classList.contains('open') && els.b.classList.contains('open'), '★Esc は最後に開いたパネルから閉じる');
  sb.fpCloseTop();
  ok(!els.b.classList.contains('open'), '続けて押すと次のパネル');
  ok(sb.fpCloseTop() === false, '開いているパネルが無ければ何もしない(作図の Esc に回す)');
}
ok(/case 'Escape':\s*\/\/[^\n]*\n\s*if \(typeof fpCloseTop === 'function' && fpCloseTop\(\)\)/.test(R('js/edit.js')), '作図中の Esc より先にパネルを閉じる');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
