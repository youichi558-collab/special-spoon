// ================================================================
// クロスリファレンス(コイルと接点の相互参照)を図面に出す(2026-09-29、js/xref.js)
//
// 盛田さんの決定(HANDOFF.md)を実コードで確かめる:
//   ・コイル側: 図の中身の一番下より下に、デバイス名→型式→電圧→接点(a/b別行)。端子番号つき。使っていない接点は位置を空欄
//   ・接点側: デバイス名の真下に、コイルの位置を括弧付きで (1/6C)
//   ・対象はコイルとa接点・b接点だけ。「空き」「未使用」の文字は書かない
// 期待値は盛田さんの実図面Sheet3のCR1(MY4N)と同じ。区画は列=数字・行=英字。
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

const sb = { console, window: {}, document: { getElementById: () => null }, escH: require('./_esch.js').escH,
  getDef: t => ({ coil: { w: 96, h: 80, role: 'coil' }, ca: { w: 40, h: 40, role: 'contact_a' }, cb: { w: 40, h: 40, role: 'contact_b' },
                  cm: { w: 40, h: 40, role: 'contact_main' }, lamp: { w: 40, h: 40, role: '' } }[t] || { w: 20, h: 20 }) };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
const frame = R('js/frame.js');
vm.runInContext([pick(frame, /function frameGeom\([\s\S]*?\n\}/), pick(frame, /function zoneColLabel[^\n]*/), pick(frame, /function zoneRowLabel[^\n]*/),
  pick(R('js/ui.js'), /function parseTerminalGroups\([\s\S]*?\n\}/)].join('\n'), sb);
vm.runInContext(R('js/xref.js'), sb);

const FRAME = { sc: 2, wMM: 420, hMM: 297, mg: 10, thMM: 30, cols: 12, rows: 4 };
const MY4N = { ref: 'MY4N', type: 'coil', terminals: 'コイル:13,14 / 接点1:1,5,9 / 接点2:2,6,10 / 接点3:3,7,11 / 接点4:4,8,12' };
const SDT21 = { ref: 'SD-T21', type: 'contactor', terminals: 'コイル:A1,A2 / 主接点:1,3,5,2,4,6 / 補助:13,14,21,22,43,44,31,32' };
let id = 0;
const E = (type, x, y, o) => Object.assign({ id: 'e' + (++id), type, x, y, layer: '回路' }, o);
const coil = (ref, x, y, o) => E('coil', x, y, Object.assign({ partRef: ref, partModel: 'MY4N', partVolt: 'AC100V', terminals: '13,14', devFs: 7 }, o));
const cont = (t, ref, x, y, terms, o) => E(t, x, y, Object.assign({ partRef: ref, partModel: 'MY4N', terminals: terms, devFs: 6, devOffX: 10, devOffY: 0 }, o));
function setup(els, wires, parts) {
  sb.state = { pages: [{ name: 'P', elements: els, wires: wires || [], frameObj: FRAME }], currentPage: 0, customSymbols: [],
    customParts: parts || [MY4N, SDT21], showXref: true, showPartRef: true };
  return sb.xrefCompute();
}
const outerBox = E('fline', 0, 0, { x1: 40, y1: 420, x2: 800, y2: 420 });   // 外枠の下辺(Sheet3と同じ)

console.log('【コイル側: 実図面Sheet3のCR1と同じ並び】');
{
  const els = [coil('CR1', 360, 375), outerBox,
    cont('ca', 'CR1', 390, 191, '9,5'), cont('ca', 'CR1', 480, 181, '10,6'),
    cont('cb', 'CR1', 540, 181, '10,2'), cont('cb', 'CR1', 420, 334, '11,3')];
  const L = setup(els);
  eq(L.blocks.length, 1, 'コイル1個に1つ');
  eq(L.blocks[0].lines.map(l => l.t), ['CR1', 'MY4N', 'AC100V',
    'a 9-5 1/6B', 'b 9-1', 'a 10-6 1/7B', 'b 10-2 1/8B', 'a 11-7', 'b 11-3 1/7C', 'a 12-8', 'b 12-4'],
    'デバイス名・型式・電圧・接点(使っていない接点は位置が空欄)');
  eq(L.blocks[0].lines[0].bold, true, 'デバイス名は太字');
  eq(L.blocks[0].lines.some(l => /空き|未使用/.test(l.t)), false, '「空き」「未使用」の文字は書かない');
  eq(L.blocks[0].y, 420 + 12, '図の中身の一番下(外枠の下辺y=420)から12空けて書き始める');
  eq(L.blocks[0].x, 360, 'まとまりの中央はコイルと同じ横位置');
  eq(L.blocks[0].left, L.blocks[0].x - L.blocks[0].w / 2, '行の頭は左そろえ(左端=中央-幅/2)');
  eq(L.contacts.get(els[2].id).text, '(1/6C)', '接点側はコイルの位置を括弧付きで');
  eq(L.contacts.get(els[2].id).y > 191, true, '接点のデバイス名の下に出る');
  eq(L.contacts.get(els[2].id).x, 400, '接点のデバイス名と同じ横位置');
}

console.log('\n【母線しか無い図面: 一番下の線のすぐ下】');
{
  const els = [coil('K1', 100, 200)];
  const L = setup(els, [{ id: 'w1', pts: [{ x: 60, y: 300 }, { x: 140, y: 300 }] }]);
  eq(L.blocks[0].y, 312, '配線(y=300)の12下');
}

console.log('\n【並んだコイルは文字がぶつからない】');
{
  const els = [coil('CR1', 360, 375), coil('CR1A', 390, 375), outerBox];
  const L = setup(els);
  const [a, b] = L.blocks.sort((p, q) => p.x - q.x);
  eq(b.x - a.x >= (a.w + b.w) / 2, true, '間隔が文字の幅より広い');
}

console.log('\n【型式が無い・部品DBに無い: 使用中の接点だけ出す】');
{
  const els = [coil('R9', 100, 100, { partModel: '', partVolt: '' }), cont('ca', 'R9', 200, 50, '13,14', { partModel: '' }),
    cont('cb', 'R9', 240, 50, '')];
  const L = setup(els);
  eq(L.blocks[0].lines.map(l => l.t), ['R9', 'a 13-14 1/3A', 'b 1/4A'], '型式・電圧の行は詰め、使用中だけ(端子番号が無い接点は a/b と位置)');
}

console.log('\n【補助接点の端子の組(JISの番号: 下1桁3・4=a, 1・2=b)】');
{
  const els = [coil('MC1', 100, 100, { partModel: 'SD-T21', partVolt: 'AC200V' }), cont('ca', 'MC1', 200, 50, '13,14', { partModel: 'SD-T21' })];
  const L = setup(els);
  eq(L.blocks[0].lines.map(l => l.t), ['MC1', 'SD-T21', 'AC200V', 'a 13-14 1/3A', 'b 21-22', 'a 43-44', 'b 31-32'], '補助の4組をa/bに分ける');
}

console.log('\n【対象外】');
{
  const els = [coil('CR1', 100, 100), E('cm', 150, 100, { partRef: 'CR1' }), E('lamp', 200, 100, { partRef: 'CR1' })];
  const L = setup(els);
  eq(L.contacts.size, 0, '主接点・その他には出さない');
  const L2 = setup([cont('ca', 'X1', 100, 100, '13,14')]);
  eq([L2.blocks.length, L2.contacts.size], [0, 0], 'コイルが無いデバイスは何も出さない');
  const L3 = setup([coil('CR1', 100, 100), cont('ca', 'CR1', 200, 50, '9,5', { devHide: true })]);
  eq(L3.contacts.size, 0, '接点のデバイス名を出していないなら、その下にも出さない');
  sb.state.showXref = false;
  const off = sb.xrefGet();
  eq([off.blocks.length, off.contacts.size], [0, 0], '表示OFFなら何も出さない');
}

console.log('\n【文字の大きさ(既定は0.7倍=盛田さんの選択)】');
{
  const els = [coil('CR1', 360, 375, { devFs: 10 }), cont('ca', 'CR1', 390, 191, '9,5', { devFs: 10 })];
  const L = setup(els);
  eq([L.blocks[0].nameFs, L.blocks[0].fs].map(v => Math.round(v * 1e6) / 1e6), [7, 5.25], 'コイル側: デバイス名=devFsの0.7倍、他の行はその0.75倍');
  eq(Math.abs(L.contacts.get(els[1].id).fs - 5.95) < 1e-9, true, '接点側: devFsの0.85倍の0.7倍');
  sb.state.xrefScale = 1;
  const big = sb.xrefCompute();
  eq(big.blocks[0].nameFs, 10, '倍率1なら等倍');
  sb.state.xrefScale = 'abc';
  eq(sb.xrefCompute().blocks[0].nameFs, 7, '数字でなければ既定0.7に戻す');
}

console.log('\n【組み込み(片方だけ消えて黙って出なくなるのを防ぐ)】');
{
  ok(/<script src="js\/xref\.js"><\/script>/.test(R('index.html')), 'index.htmlが xref.js を読む');
  ok(/drawXref\(\);/.test(R('js/draw.js')), 'draw()が drawXref を呼ぶ');
  ok(/xrefGet\(\)/.test(R('js/dxf_export.js')), 'DXF出力が xrefGet を使う(画面と同じ内容・位置)');
  ok(/zoneColLabel\(c\)/.test(R('js/dxf_export.js')) && /zoneRowLabel\(r\)/.test(R('js/dxf_export.js')),
    'DXFの枠の区画ラベルは画面と同じ(列=数字・行=英字)。以前はDXFだけ 列=英字・行=数字 だった');
  ok(/showXref/.test(R('js/settings.js')) && /rb-xref/.test(R('index.html')), '表示の入切と前回値がある');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
