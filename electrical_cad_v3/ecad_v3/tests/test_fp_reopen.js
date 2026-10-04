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
function run(el, o) {
  const sb = { _fpStack: [], fpEnsureClose() {}, window: { innerWidth: 1500, innerHeight: 900 }, document: { getElementById: id => (id === 'p' ? el
    : id === 'quickbar' ? { getBoundingClientRect: () => ({ bottom: sb._qb || 108 }) }
    : id === 'page-bar' ? { getBoundingClientRect: () => ({ top: sb._pb || 860 }) } : null) } };
  if (o) Object.assign(sb, o);
  vm.createContext(sb); vm.runInContext(src, sb); sb.openFP('p'); return sb;
}

console.log('【動かしていないパネル: 上端はどのパネルも同じ位置(2026-10-04)】');
// 盛田さん「フロートパネルの出る高さがタブごとに変わるのはやめてくれ、外面に出すとき上部の位置は同じにしろ」。
// 以前は高さの真ん中で合わせていたので、タブで中身の高さが変わると上端が上下した
{ const tops = [675, 300, 120].map(h => { const el = panel({ left: 230, top: 105, w: 1040, h }); run(el); return el.style.top; });
  ok(tops.every(t => t === '120px'), `★高さが違っても上端は同じ(#quickbar下端108+12=120。実際 ${tops.join(',')})`); }
{ const el = panel({ left: 0, top: 0, w: 1040, h: 576 }); run(el, { _pb: 728 });
  ok(el.style.top === '120px' && el.style.maxHeight === '600px', `下は下のバーから8px空けた所まで(超えたら中でスクロール。実際 max ${el.style.maxHeight})`);
  ok(el.classList.contains('open'), '開く'); }

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
