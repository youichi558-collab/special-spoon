// フローティングパネル(.fp。帳票パネルもこれ)を動かした後に、タブ切替・開き直しで位置が壊れない(2026-09-29)
//   node tests/test_fp_reopen.js
// 不具合: タイトルをドラッグすると transform:none・left/top(px) に固定されるが、openFP が毎回 top を「画面の中央」に戻していた。
// 帳票はタブを切り替えるたびに openFP を呼ぶので、動かした後にタブを押すとパネルの上端が画面の真ん中に来て、
// 下半分が画面外に出た(実アプリ 1500x900 で bottom=1117。CSV出力・閉じるが押せない)。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8').replace(/\r\n/g, '\n');
const src = ui.match(/function openFP\([\s\S]*?\n\}/)[0];

function panel(rect) {
  const cls = new Set();
  return { style: {}, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
    getBoundingClientRect: () => ({ left: parseFloat(rect.left), top: parseFloat(rect.top), width: rect.w, height: rect.h }) };
}
function run(el) {
  const sb = { window: { innerWidth: 1500, innerHeight: 900 }, document: { getElementById: id => (id === 'p' ? el : id === 'ribbon' ? { offsetHeight: 80 } : null) } };
  vm.createContext(sb); vm.runInContext(src, sb); sb.openFP('p');
}

console.log('【動かしていないパネル: 従来どおり中央寄せ】');
{ const el = panel({ left: 230, top: 105, w: 1040, h: 675 }); run(el);
  ok(el.style.top === 'calc(50% - 8px)' && el.classList.contains('open'), 'top を中央寄せにして開く'); }

console.log('【動かした後: 位置を保つ(タブ切替・開き直し)】');
{ const el = panel({ left: 330, top: 137, w: 1040, h: 675 }); el.style.transform = 'none'; el.style.left = '330px'; el.style.top = '137px'; run(el);
  ok(el.style.top === '137px' && el.style.left === '330px', 'top・left を変えない(以前は top が中央に戻って下が画面外に出た)');
  ok(el.style.transform === 'none', 'transform はそのまま'); }

console.log('【動かした後、画面からはみ出す位置だったら画面内に寄せる】');
{ const el = panel({ left: 900, top: 600, w: 1040, h: 675 }); el.style.transform = 'none'; run(el);
  ok(el.style.top === '225px', `下にはみ出すなら上へ寄せる(実際 ${el.style.top})`);
  ok(el.style.left === '460px', `右にはみ出すなら左へ寄せる(実際 ${el.style.left})`); }
{ const el = panel({ left: -50, top: -20, w: 300, h: 200 }); el.style.transform = 'none'; run(el);
  ok(el.style.top === '0px' && el.style.left === '0px', '左上にはみ出すなら0に寄せる'); }

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
