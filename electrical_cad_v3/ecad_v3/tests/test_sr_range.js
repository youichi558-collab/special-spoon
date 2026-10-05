// シンボル登録の「登録範囲」(2026-10-05 盛田さん「範囲が見えてないからどう登録されるかが見えない」
// 「上だけサイズ調整みたいに10刻みか5刻みで狭くしてはみ出たら自動で切れればいい」)
//   node tests/test_sr_range.js
// このテストが守るもの:
//   1. 範囲は図形全体を囲み、刻み(5/10)の線に乗る
//   2. 範囲の外を切る: 線は辺で切る・全部外は消す、弧・円は辺で切った弧になる、四角は辺で切った線になる、文字は外なら消す
//   3. 盛田さんの漏電ブレーカー(上の線の端 -27.7)を、範囲の上を -25 にすると、縦線の上の端が -25 になり、弧は変わらない
//   4. 登録するときに範囲で切り、範囲の外の端子は登録しない
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8').replace(/\r\n/g, '\n');
const pick = re => { const m = ui.match(re); if (!m) throw new Error('見つからない ' + re); return m[0]; };
const sb = { Math, console, document: { getElementById: () => null } };
vm.createContext(sb);
vm.runInContext(['srContentBox', 'srRangeFit', 'srClipSeg', 'srClipArc', 'srClipShapes'].map(n => pick(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'))).join('\n')
  + '\n' + pick(/const _srIn = [^\n]*/) + '\nthis._srIn = _srIn;', sb);
const r2 = v => Math.round(v * 100) / 100;

console.log('【範囲は図形全体を囲み、刻みに乗る】');
const elb = JSON.parse(fs.readFileSync(__dirname + '/fixtures/elb_shapes.json', 'utf8'));
eq(sb.srRangeFit(elb.shapes, 5), { x1: -40, y1: -30, x2: 40, y2: 30 }, '漏電ブレーカー: 5刻み');
eq(sb.srRangeFit(elb.shapes, 10), { x1: -40, y1: -30, x2: 40, y2: 30 }, '10刻み');
eq(sb.srClipShapes(elb.shapes, sb.srRangeFit(elb.shapes, 5)).length, elb.shapes.length, '最初の範囲では何も切らない');

console.log('\n【漏電ブレーカーの上だけ狭める】');
{
  const R = { x1: -40, y1: -25, x2: 40, y2: 30 };
  const out = sb.srClipShapes(elb.shapes, R);
  const tops = [-30, 0, 30].map(x => Math.min(...out.filter(s => s.t === 'L' && Math.abs(s.x1 - x) < 0.5 && Math.abs(s.x2 - x) < 0.5).flatMap(s => [s.y1, s.y2])));
  eq(tops.map(r2), [-25, -25, -25], '★縦線の上の端が -25 になる(端子をグリッドに置ける)');
  eq(out.filter(s => s.t === 'A'), elb.shapes.filter(s => s.t === 'A'), '弧(範囲の中)は変わらない');
  ok(out.every(s => s.t !== 'L' || (Math.min(s.y1, s.y2) >= -25 - 1e-6)), '範囲の外に線が残らない');
}

console.log('\n【線・四角・円・弧・文字の切り方】');
{
  const R = { x1: 0, y1: 0, x2: 10, y2: 10 };
  eq(sb.srClipShapes([{ t: 'L', x1: -5, y1: 5, x2: 5, y2: 5 }], R).map(s => [s.x1, s.y1, s.x2, s.y2]), [[0, 5, 5, 5]], '線は辺で切る');
  eq(sb.srClipShapes([{ t: 'L', x1: -5, y1: -5, x2: -1, y2: -1 }], R), [], '全部外の線は消す');
  eq(sb.srClipShapes([{ t: 'R', x: 5, y: 5, w: 10, h: 10 }], R).map(s => [s.x1, s.y1, s.x2, s.y2]), [[5, 5, 10, 5], [5, 10, 5, 5]], '四角は範囲の中に残る辺だけの線になる(右と下の辺は全部外)');
  const c = sb.srClipShapes([{ t: 'C', cx: 10, cy: 5, r: 2 }], R);
  ok(c.length === 1 && c[0].t === 'A' && r2(((c[0].ea - c[0].sa) % 360 + 360) % 360) === 180, '辺にかかった円は内側の半分の弧になる');
  const m = (c[0].sa + c[0].ea) / 2 * Math.PI / 180;
  ok(10 + 2 * Math.cos(m) < 10, '残った弧は範囲の内側(左)');
  const arc = { t: 'A', cx: 0, cy: 5, r: 3, sa: -90, ea: 90, ccw: true };   // 左にふくらむ弧(漏電ブレーカーと同じ向き)
  eq(sb.srClipShapes([arc], R), [], '全部外の弧は消す');
  eq(sb.srClipShapes([{ t: 'T', text: 'A', x: 20, y: 5 }, { t: 'T', text: 'B', x: 5, y: 5 }], R).map(s => s.text), ['B'], '文字は範囲の外なら消す');
}

console.log('\n【登録するとき範囲で切り、外の端子は登録しない】');
{
  const fn = pick(/function saveCustomSymbol\(\)[\s\S]*?\n\}/);
  ok(/const shapesR = srClipShapes\(_srShapes, _srRange\);/.test(fn) && /shapes:shapesR, terminals:termsR/.test(fn), '★登録する図形は範囲で切ったもの');
  ok(/_srTerms\.filter\(t => _srIn\(_srRange, t\.x, t\.y\)\)/.test(fn), '範囲の外の端子は登録しない');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  ok(/id="sr-rstep"[^>]*><option value="5">5<\/option><option value="10">10<\/option>/.test(html), '刻み 5/10 を選べる');
}

console.log('\n【置き換えて登録(2026-10-05 盛田さん「a でいい」「機能はそのまま残す」)】');
{
  const fn = pick(/function saveCustomSymbol\(\)[\s\S]*?\n\}/);
  ok(/const type = repOld \? repType :/.test(fn), '★置き換える先を選べば番号(type)はそのまま');
  ok(/state\.customSymbols\[i\] = sym;/.test(fn) && /symStorePut\(\[sym\], \{ register: true \}\)/.test(fn), '★中身を置き換えて登録シンボルに書く(新しく増やさない)');
  ok(/confirm\(`「\$\{nm\}」をこの形に置き換えます。/.test(fn) && /symConfirmTermMove\(repType, repOld, termsR\)/.test(fn), '置き換える前に確かめ、端子の位置が変わるなら使っている数を見せる');
  ok(/symMovedNotice\(\{ \[type\]: repOld \}, null, true\)/.test(fn), '置き換えで端子の位置が変わったら、この画面の記号を知らせる');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  ok(/<select id="sr-replace"[^>]*><option value="">新しいシンボルとして登録<\/option><\/select>/.test(html), '「登録のしかた」= 新しいシンボル/置き換える(新しい登録も残る)');
  ok(/srFillReplaceList\(\);/.test(pick(/function srClear\(\)[\s\S]*?\n\}/)), '登録画面を開くたびに置き換える先の一覧を作る');
}

console.log('\n【名前を重ねない・同じ形は確かめる(2026-10-05 欠陥1)】');
{
  const fn = pick(/function saveCustomSymbol\(\)[\s\S]*?\n\}/);
  ok(/同じ名前の登録シンボル「\$\{name\}」が既にあります。/.test(fn) && /others\.some\(x => String\(x\.name \|\| x\.label \|\| ''\)\.trim\(\) === name\)/.test(fn), '★同じ名前があれば登録しない(置き換えるか名前を変える)');
  ok(/同じ形・同じ端子の登録シンボル/.test(fn), '同じ形・同じ端子があれば確かめる');
  ok(/x\.type !== repType/.test(fn), '置き換える先そのものは同じ名前でも構わない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
