// シンボルの文字(デバイス名・型式・仕様)を縦一列に揃える(2026-10-06 js/edit.js alignSymTexts・_symTextItems)
//   node tests/test_align_sym_texts.js
// 盛田さん「デバイスと型式、仕様の文字を縦列できれいに並べるとかはかなり使える」「xyの数値をそろえるとかだが、シンボルによって違うよな」
// 「それでいい、残して進めて」(基準=最初に選んだシンボルのデバイス名の左端・縦列だけ・仕様は左揃えに・プロパティの文字揃えは残す)
// このテストが守るもの:
//   1. 補正の数値ではなく、図面の上の文字の左端で揃う(シンボルの大きさ・揃え・文字の長さが違っても)
//   2. 動かすのは左右だけ(行の高さ=Y補正は変えない)。仕様は左揃えにする
//   3. 図面に出ていない文字・回転させた文字は動かさない。確認でやめたら何も変えない。Ctrl+Z 用に pushH してから変える
//   4. 独立テキストだけを選んだときは今までどおり(alignTexts の入口)
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const E = fs.readFileSync(__dirname + '/../js/edit.js', 'utf8').replace(/\r\n/g, '\n');
const pick = re => { const m = E.match(re); if (!m) throw new Error('見つからない ' + re); return m[0]; };

// 文字幅は「文字数×サイズ×0.6」(bold は 0.7)で測る作り物
let font = '';
const ctx = { set font(f) { font = f; }, get font() { return font; }, measureText: t => { const fsz = +(/(\d+)px/.exec(font) || [0, 10])[1]; return { width: t.length * fsz * (/bold/.test(font) ? 0.7 : 0.6) }; } };
let answer = true, pushed = 0, asked = '';
const defs = { tall: { w: 20, h: 80 }, short: { w: 14, h: 54 }, wide: { w: 96, h: 80 } };
const sb = { console, ctx, getDef: t => defs[t] || null, draw() {}, updateRightPanel() {}, requestAnimationFrame() {}, alert: m => { asked = m; },
  confirm: m => { asked = m; return answer; }, pushH: () => { pushed++; }, setTimeout: (f) => f() };
vm.createContext(sb);
vm.runInContext([pick(/const _ALIGN_SKIP = [^\n]*/), pick(/function _symTextItems\([\s\S]*?\n\}/), pick(/function alignSymTexts\([\s\S]*?\n\}/)].join('\n') + '\nthis._symTextItems=_symTextItems;this.alignSymTexts=alignSymTexts;', sb);

const lefts = el => sb._symTextItems(el).map(t => t.kind + ':' + Math.round(t.left * 10) / 10);
const mk = () => {
  const A = { id: 'A', type: 'tall', x: 300, y: 150, partRef: 'ELB1', showModel: true, partModel: 'NV32-SV', label: '3P\n30AF/30AT 30mA', devOffX: 40, devOffY: -10, labelOffX: 30, labelAlign: 'left', labelOffY: 50 };
  const B = { id: 'B', type: 'short', x: 310, y: 300, partRef: 'MCCB2', showModel: true, partModel: 'NF32-SV', label: '3P\n30AF/10AT', devOffX: 15, devOffY: 0 };
  const C = { id: 'C', type: 'wide', x: 280, y: 450, partRef: 'MC1', label: 'AC100V' };
  sb.state = { showPartRef: true, elements: [A, B, C], sel: { els: new Set(['A', 'B', 'C']) } };
  return [A, B, C];
};

(async () => {
  console.log('【図面の上の左端で揃える】');
  let [A, B, C] = mk();
  const L = sb._symTextItems(A)[0].left;   // ELB1 のデバイス名の左端
  const yBefore = [A, B, C].map(e => [e.devOffY, e.modelOffY, e.labelOffY]);
  eq(await sb.alignSymTexts([A, B, C]), true, '実行した');
  eq([A, B, C].every(e => sb._symTextItems(e).every(t => Math.abs(t.left - L) < 1e-6)), true, '★3つのシンボルのデバイス名・型式・仕様の左端が全部、ELB1 のデバイス名の左端に揃う(大きさ・揃え・文字の長さが違っても)');
  eq([B.labelAlign, C.labelAlign], ['left', 'left'], '★仕様は左揃えにする(2行の仕様で短い行がへこまない)');
  eq([A, B, C].map(e => [e.devOffY, e.modelOffY, e.labelOffY]), yBefore, '★行の高さ(Y補正)は変えない');
  eq(B.devOffX !== C.devOffX, true, '補正の数値はシンボルごとに違う値になる(数値を揃えても揃わないため)');
  eq(pushed, 1, 'Ctrl+Z で戻せるよう、変える前に1回だけ記録');
  eq(/「ELB1」のデバイス名の左端/.test(asked) && /動かす文字: 7個/.test(asked), true, '確認で基準と動かす数を出す');

  console.log('\n【基準は最初に選んだシンボル】');
  [A, B, C] = mk(); sb.state.sel.els = new Set(['C', 'A', 'B']);
  const LC = sb._symTextItems(C)[0].left;
  await sb.alignSymTexts([A, B, C]);
  eq([A, B, C].every(e => sb._symTextItems(e).every(t => Math.abs(t.left - LC) < 1e-6)), true, '★最初に選んだ MC1 のデバイス名の左端に揃う');

  console.log('\n【動かさないもの】');
  [A, B, C] = mk(); B.devHide = true; C.textRot = 90; answer = true;
  const bDev = B.devOffX, cAll = JSON.stringify(C);
  await sb.alignSymTexts([A, B, C]);
  eq(B.devOffX, bDev, '★図面に出していないデバイス名は動かさない');
  eq(JSON.stringify(C), cAll, '★文字を回転させたシンボルは動かさない');
  [A, B, C] = mk(); answer = false; const snap = JSON.stringify([A, B, C]); pushed = 0;
  eq(await sb.alignSymTexts([A, B, C]), false, '確認でやめた');
  eq([JSON.stringify([A, B, C]) === snap, pushed], [true, 0], '★やめたら何も変えない');
  answer = true;

  console.log('\n【記号の中に置いたデバイス名は動かさない(盛田さん「コイルとモーターのデバイスまで引っ張る」→(1))】');
  [A, B, C] = mk(); C.devOffY = 0;   // コイルの中央にデバイス名(新しく置いたコイルの初期位置)
  const M = { id: 'M', type: 'wide', x: 300, y: 600, partRef: 'M', devOffX: 0, devOffY: 10, label: 'AC200V\n2.2kW', labelOffX: -20 };
  sb.state.elements.push(M); sb.state.sel.els = new Set(['A', 'B', 'C', 'M']);
  const L2 = sb._symTextItems(A)[0].left;
  await sb.alignSymTexts([A, B, C, M]);
  eq([M.devOffX, C.devOffX], [0, undefined], '★記号の中のデバイス名(モーターの M・コイルの中央の MC1)は動かさない');
  eq(sb._symTextItems(C).map(t => t.kind).join(), 'spec', 'コイルは仕様だけ揃える');
  eq(sb._symTextItems(M).every(t => Math.abs(t.left - L2) < 1e-6) && sb._symTextItems(M).map(t => t.kind).join(), true && 'spec', '★そのシンボルの仕様は揃える');
  eq(sb._symTextItems(B).every(t => Math.abs(t.left - L2) < 1e-6), true, '記号の外のデバイス名は今までどおり揃う');

  console.log('\n【入口: シンボルを選んだら新しい揃え、独立テキストだけなら今までどおり】');
  const at = pick(/function alignTexts\(\) \{[\s\S]{0,400}/);
  eq(/_symTextItems\(el\)\.length\);\n  if \(syms\.length\) \{ alignSymTexts\(syms\); return; \}/.test(at), true, '★シンボル(文字を出しているもの)を選んでいれば alignSymTexts');
  eq(/const texts = state\.elements\.filter\(el => state\.sel\.els\.has\(el\.id\) && el\.type === 'text'\);/.test(at), true, '独立テキストの揃えはそのまま残す');
  eq(/<input[^>]*id="pp-lalign"|labelAlign/.test(fs.readFileSync(__dirname + '/../js/ui.js', 'utf8').replace(/\r\n/g, '\n')), true, 'プロパティの仕様の「文字揃え」も残す');

  console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
