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
const HH54P = { ref: 'HH54P', type: 'coil', terminals: 'コイル:13,14 / 接点1:1,5,9 / 接点2:2,6,10 / 接点3:3,7,11 / 接点4:4,8,12' };
const H3CR = { ref: 'H3CR-A', type: 'timer', terminals: 'コイル:2,7 / 接点1:1,3,4 / 接点2:11,8,9' };
const SDT21 = { ref: 'SD-T21', type: 'contactor', terminals: 'コイル:A1,A2 / 主接点:1,3,5,2,4,6 / 補助:13,14,21,22,43,44,31,32' };
let id = 0;
const E = (type, x, y, o) => Object.assign({ id: 'e' + (++id), type, x, y, layer: '回路' }, o);
const coil = (ref, x, y, o) => E('coil', x, y, Object.assign({ partRef: ref, partModel: 'MY4N', partVolt: 'AC100V', terminals: '13,14', devFs: 7 }, o));
const cont = (t, ref, x, y, terms, o) => E(t, x, y, Object.assign({ partRef: ref, partModel: 'MY4N', terminals: terms, devFs: 6, devOffX: 10, devOffY: 0 }, o));
function setup(els, wires, parts) {
  sb.state = { pages: [{ name: 'P', elements: els, wires: wires || [], frameObj: FRAME }], currentPage: 0, customSymbols: [],
    customParts: parts || [MY4N, SDT21, H3CR, HH54P], showXref: true, showPartRef: true };
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
    'a 9-5 (1/6B)', 'b 9-1', 'a 10-6 (1/7B)', 'b 10-2 (1/8B)', 'a 11-7', 'b 11-3 (1/7C)', 'a 12-8', 'b 12-4'],
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

console.log('\n【端子番号がシンボル定義の既定ラベルだけにある接点(手で打っていない)】');
{
  const els = [coil('CR1', 360, 375), cont('ca', 'CR1', 390, 191, '', {})];
  const L0 = setup(els);
  ok(L0.blocks[0].lines.some(l => l.t === 'a 9-5') && !L0.blocks[0].lines.some(l => l.t === 'a 9-5 (1/6B)'), '端子番号が無ければ a 9-5 の枠は空欄のまま(接点は別の行に出る)');
  sb.state.customSymbols = [{ type: 'ca', terminals: [{ label: '9' }, { label: '5' }] }];
  const L1 = sb.xrefCompute();
  ok(L1.blocks[0].lines.some(l => l.t === 'a 9-5 (1/6B)'), 'シンボル定義の既定の番号(9,5)を使って枠に当たる');
  sb.state.customSymbols = [];
}

console.log('\n【型式が無い・部品DBに無い: 使用中の接点だけ出す】');
{
  const els = [coil('R9', 100, 100, { partModel: '', partVolt: '' }), cont('ca', 'R9', 200, 50, '13,14', { partModel: '' }),
    cont('cb', 'R9', 240, 50, '')];
  const L = setup(els);
  eq(L.blocks[0].lines.map(l => l.t), ['R9', 'a 13-14 (1/3A)', 'b (1/4A)'], '型式・電圧の行は詰め、使用中だけ(端子番号が無い接点は a/b と位置)');
}

console.log('\n【タイマ(オムロンH3CR-A): カタログで確認した端子の役割の表を使う(部品DBの登録に依存しない)】');
{
  // 実カタログ: 限時接点 NC=⑪-⑧(①-④)、NO=⑪-⑨(①-③)。DBの並びは接点ごとに逆(1,3,4 / 11,8,9)なので、並びから機械的には決まらない
  const els = [coil('T1', 100, 100, { partModel: 'H3CR-A', partVolt: 'AC200V' }), cont('ca', 'T1', 200, 50, '11,9', { partModel: 'H3CR-A' }), cont('cb', 'T1', 240, 50, '11,8', { partModel: 'H3CR-A' })];
  const L = setup(els, [], []);          // 部品DBは空(手打ち運用)でも出る
  eq(L.blocks[0].lines.map(l => l.t), ['T1', 'H3CR-A', 'AC200V', 'a 1-3', 'b 1-4', 'a 11-9 (1/3A)', 'b 11-8 (1/4A)'],
    'H3CR-A: 接点1(共通1・NO3・NC4)は空き、接点2(共通11・NO9・NC8)は使用中');
  const s8 = setup([coil('T2', 100, 100, { partModel: 'H3CR-A8' })], [], []);
  eq(s8.blocks[0].lines.slice(3).map(l => l.t), ['a 1-3', 'b 1-4', 'a 8-6', 'b 8-5'], 'H3CR-A8(8ピン): 接点2は共通8・NO6・NC5');
  const fn = setup([coil('T3', 100, 100, { partModel: 'H3CR-FN' })], [], []);
  eq(fn.blocks[0].lines.slice(3).map(l => l.t), ['a 1-3', 'b 1-4', 'a 11-9', 'b 11-8'], 'H3CR-FN(11ピン)もH3CR-Aと同じ');
}

console.log('\n【確認していないタイマ(H3CR-H)は枠を作らない】');
{
  const els = [coil('T9', 100, 100, { partModel: 'H3CR-H8L' }), cont('ca', 'T9', 200, 50, '4,3', { partModel: 'H3CR-H8L' })];
  const L = setup(els, [], [{ ref: 'H3CR-H8L', type: 'timer', terminals: 'コイル:2,7 / 限時接点1:1,3,4 / 限時接点2:8,5,6' }]);
  eq(L.blocks[0].lines.map(l => l.t), ['T9', 'H3CR-H8L', 'AC100V', 'a 4-3 (1/3A)'], '並びを確認していない型式は、使用中の接点だけを出す');
}

console.log('\n【H3Y(MYとピンコンパチ)はMY系と同じ並びとして枠を作る】');
{
  const els = [coil('T4', 100, 100, { partModel: 'H3Y-2' })];
  const L = setup(els, [], [{ ref: 'H3Y-2', type: 'timer', terminals: 'コイル:13,14 / 限時接点1:1,5,9 / 限時接点2:4,8,12' }]);
  eq(L.blocks[0].lines.slice(3).map(l => l.t), ['a 9-5', 'b 9-1', 'a 12-8', 'b 12-4'], 'H3Y-2: 昇順でNC・NO・共通');
}

console.log('\n【富士 HH5 系はMY系と同じ並びとして枠を作る(盛田さんの判断: ソケット共用)】');
{
  const els = [coil('K5', 100, 100, { partModel: 'HH54P', partVolt: 'AC100V' }), cont('ca', 'K5', 200, 50, '9,5', { partModel: 'HH54P' })];
  const L = setup(els);
  eq(L.blocks[0].lines.slice(0, 6).map(l => l.t), ['K5', 'HH54P', 'AC100V', 'a 9-5 (1/3A)', 'b 9-1', 'a 10-6'], 'HH54Pでも 共通-NO / 共通-NC の枠ができる');
}

console.log('\n【補助接点の端子の組(JISの番号: 下1桁3・4=a, 1・2=b)】');
{
  const els = [coil('MC1', 100, 100, { partModel: 'SD-T21', partVolt: 'AC200V' }), cont('ca', 'MC1', 200, 50, '13,14', { partModel: 'SD-T21' })];
  const L = setup(els);
  eq(L.blocks[0].lines.map(l => l.t), ['MC1', 'SD-T21', 'AC200V', 'a 13-14 (1/3A)', 'b 21-22', 'a 43-44', 'b 31-32'], '補助の4組をa/bに分ける');
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

console.log('\n【個別の調整(プロパティのCRタブ): 位置補正・サイズ倍率・表示OFF】');
{
  const c0 = coil('CR1', 360, 375, { devFs: 10 }), k0 = cont('ca', 'CR1', 390, 191, '9,5', { devFs: 10 });
  const base = setup([c0, k0, outerBox]);
  const b0 = base.blocks[0], t0 = base.contacts.get(k0.id);
  const c1 = coil('CR1', 360, 375, { devFs: 10, xrefOffX: 12, xrefOffY: -5, xrefMul: 2 }), k1 = cont('ca', 'CR1', 390, 191, '9,5', { devFs: 10, xrefOffX: 3, xrefOffY: 4, xrefMul: 2 });
  const adj = setup([c1, k1, outerBox]);
  const b1 = adj.blocks[0], t1 = adj.contacts.get(k1.id);
  eq([Math.round(b1.nameFs * 1e6) / 1e6, Math.round(b1.fs * 1e6) / 1e6], [Math.round(b0.nameFs * 2 * 1e6) / 1e6, Math.round(b0.fs * 2 * 1e6) / 1e6], 'コイル側: 文字サイズが倍率だけ変わる');
  eq(b1.y, b0.y - 5, 'コイル側: 上下の補正が自動の位置に足される');
  eq(Math.round((b1.left - (b1.x - b1.w / 2)) * 1e6) / 1e6, 12, 'コイル側: 左右の補正が足される');
  eq([t1.x - t0.x, t1.y - t0.y], [3, 4], '接点側: 位置の補正が足される');
  eq(Math.round(t1.fs / t0.fs * 1e6) / 1e6, 2, '接点側: 倍率が効く');
  const off = setup([coil('CR1', 360, 375, { xrefHide: true }), cont('ca', 'CR1', 390, 191, '9,5', { xrefHide: true }), outerBox]);
  eq([off.blocks.length, off.contacts.size], [0, 0], '表示OFF(xrefHide)なら出さない');
  const bad = setup([coil('CR1', 360, 375, { xrefMul: 'x', xrefOffX: 'y' }), outerBox]);
  eq([bad.blocks.length, bad.blocks[0].offX], [1, 0], '数字でない値は無視して自動にする');
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

console.log('\n【接点Refの確認列: 番号が出ない理由(xrefDiagnose)と、型式の書き戻し】');
{
  const dia = () => sb.xrefDiagnose(sb.xrefCollect().get('CR1')).map(x => x.msg);
  setup([coil('CR1', 100, 100), cont('ca', 'CR1', 100, 200, '9,5'), cont('cb', 'CR1', 150, 200, '9,1')]);
  eq(dia(), [], '型式MY4Nで端子も枠と合っていれば理由は出ない');
  setup([coil('CR1', 100, 100, { partModel: '' }), cont('ca', 'CR1', 100, 200, '9,5')]);
  eq(dia(), ['コイルに型式が無いため、空き接点の枠が出ません'], '型式が無い');
  setup([coil('CR1', 100, 100, { partModel: 'XYZ-1' }), cont('ca', 'CR1', 100, 200, '9,5')]);
  ok(/型式「XYZ-1」は空き接点の枠を出せません/.test(dia()[0]), '型式に端子の情報が無い(部品DBにも表にも無い)');
  setup([coil('CR1', 100, 100), cont('ca', 'CR1', 100, 200, '')]);
  const d1 = sb.xrefDiagnose(sb.xrefCollect().get('CR1'));
  ok(d1.length === 1 && /端子番号が未入力/.test(d1[0].msg) && d1[0].id && d1[0].pi === 0, '端子番号が未入力: 該当の接点へ飛べる(ページと要素ID)');
  setup([coil('CR1', 100, 100), cont('ca', 'CR1', 100, 200, '99,98')]);
  ok(/端子 99-98 はこの型式の枠に無い/.test(dia()[0]), '枠に無い端子番号');
  setup([coil('CR1', 100, 100), cont('ca', 'CR1', 100, 200, '9,5', { devHide: true })]);
  ok(/デバイス名を出していない/.test(dia()[0]), '接点のデバイス名を出していないと、接点側の(位置)が出ない');
  setup([cont('ca', 'CR1', 100, 200, '')]);
  eq(sb.xrefDiagnose(sb.xrefCollect().get('CR1')), [], 'コイルが無いデバイスは見ない(接点Refが別に「コイル未配置」を出す)');

  // 型式の書き戻し: そのデバイスの全要素(コイルも接点も)に入る。他のデバイス・電圧は触らない
  const els = [coil('CR1', 100, 100), cont('ca', 'CR1', 100, 200, '9,5'), coil('CR2', 300, 100), cont('ca', 'CR2', 300, 200, '9,5')];
  setup(els);
  let pushed = 0, drawn = 0;
  sb.pushH = () => { pushed++; }; sb.draw = () => { drawn++; }; sb.showRefPanel = () => {};
  sb.window._refKeys = ['CR1'];
  sb.setRefModel(0, ' MY2N ');
  eq([els[0].partModel, els[1].partModel, els[2].partModel, els[3].partModel], ['MY2N', 'MY2N', 'MY4N', 'MY4N'], 'CR1のコイルと接点に型式が入り、CR2は変わらない');
  eq(els[0].partVolt, 'AC100V', '電圧は触らない');
  ok(pushed === 1 && drawn === 1, '元に戻せる(pushH)ようにして、描き直す');
  sb.setRefModel(0, '');
  eq(els[0].partModel, undefined, '空にすれば型式を消す');
  const rep = R('js/report.js');
  ok(/クロスリファレンス確認/.test(rep) && /setRefModel\(\$\{ki\}/.test(rep) && /jumpToRefEl\(/.test(rep), '接点Refの表に確認列と、型式欄・飛ぶ操作がある');
}

console.log('\n【組み込み(片方だけ消えて黙って出なくなるのを防ぐ)】');
{
  ok(/<script src="js\/xref\.js"><\/script>/.test(R('index.html')), 'index.htmlが xref.js を読む');
  ok(/drawXref\(\);/.test(R('js/draw.js')), 'draw()が drawXref を呼ぶ');
  ok(/xrefGet\(\)/.test(R('js/dxf_export.js')), 'DXF出力が xrefGet を使う(画面と同じ内容・位置)');
  ok(/zoneColLabel\(c\)/.test(R('js/dxf_export.js')) && /zoneRowLabel\(r\)/.test(R('js/dxf_export.js')),
    'DXFの枠の区画ラベルは画面と同じ(列=数字・行=英字)。以前はDXFだけ 列=英字・行=数字 だった');
  ok(/renderPartsAll\(\);[\s\S]{0,400}draw\(\)/.test(R('js/parts_db.js')), '部品DBを読み込んだ後に描き直す(空き接点の枠は部品DBの端子欄から作るため)');
  ok(/showXref/.test(R('js/settings.js')) && /rb-xref/.test(R('index.html')), '表示の入切と前回値がある');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
