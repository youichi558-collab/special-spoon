// ================================================================
// 接点Ref(接点・コイル リファレンス)に配線の分岐点(●)を載せないことの確認
//
// 【2026-09-25】盛田さんの Sheet3 で接点Refを開くと、分岐点24個が
// 「(デバイス未設定)」の行に「他」バッジで並び、⚠デバイス未設定まで出ていた。
// 分岐点は部品ではないので外す(盛田さん「分岐点を外して」)。
// 端子台の端子(○ circle / ◎ dbl)は端子台デバイスの位置として残す。
// style 未設定の junction は●扱い(draw.js の drawJunctionEl と同じ)。
//
// report.js を丸ごと実行し、本物の showRefPanel() が作る表を検査する。
// ================================================================
const fs = require('fs');
const vm = require('vm');
const { escHSrc } = require('./_esch.js');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const src = fs.readFileSync(__dirname + '/../js/report.js', 'utf8').replace(/\r\n/g, '\n');

function run(elements) {
  let html = null;
  const sb = {
    console,
    state: { pages: [{ name: 'Sheet1', elements, wires: [] }] },
    getDef: t => ({ sym_coil: { role: 'coil' }, sym_a: { role: 'contact_a' } }[t] || null),
    document: { getElementById: () => null },
    openFP: () => {},
  };
  vm.createContext(sb);
  vm.runInContext(escHSrc + '\n' + src, sb);
  sb._reportOpen = (key, title, body) => { html = body; };
  vm.runInContext('showRefPanel()', sb);
  return html || '';
}

console.log('【分岐点(●)は載せない】');
{
  const html = run([
    { id: 'c1', type: 'sym_coil', x: 10, y: 10, partRef: 'CR1' },
    { id: 'a1', type: 'sym_a',    x: 20, y: 10, partRef: 'CR1' },
    { id: 'j1', type: 'junction', x: 30, y: 10, style: 'dot' },
    { id: 'j2', type: 'junction', x: 40, y: 10 },               // style未設定=●
    { id: 'j3', type: 'junction', x: 50, y: 10, style: 'dot', partRef: 'X9' },
  ]);
  ok(/CR1/.test(html), 'CR1 は載る');
  ok(!/デバイス未設定/.test(html), '分岐点による「(デバイス未設定)」行が出ない');
  ok(!/X9/.test(html), 'デバイス名が入っていても分岐点は載らない');
}

console.log('\n【端子台の端子(○/◎)は残す】');
{
  const html = run([
    { id: 't1', type: 'junction', x: 10, y: 10, style: 'circle', partRef: 'TB1', label: '1' },
    { id: 't2', type: 'junction', x: 20, y: 10, style: 'dbl',    partRef: 'TB2', label: '1' },
    { id: 'j1', type: 'junction', x: 30, y: 10, style: 'dot' },
  ]);
  ok(/TB1/.test(html), '○ の端子台 TB1 は載る');
  ok(/TB2/.test(html), '◎ の端子台 TB2 は載る');
  ok(!/デバイス未設定/.test(html), '分岐点の行は出ない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
