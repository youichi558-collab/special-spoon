// ================================================================
// 線番の書式(2026-10-04 盛田さんの決定。HANDOFF.md「線番の再設計」)
//   node tests/test_wire_no_fmt.js
//
// 以前は「番号のルール」が無く、末尾が数字なら何でも連番とみなして詰めていた(Sheet3で L1 を消すと L2 が L1 になった)。
// このテストが守るもの:
//   1. 書式(表題欄のページ番号の桁数＋連番の桁数)に合う番号だけが自動の対象。L1・R・E などの名前は触らない
//   2. ページ番号は表題欄(frameObj.page、「3 / 12」なら 3)。空・数字でない・桁に収まらないなら振らずに知らせる
//   3. 割付は番号の無い線だけ、位置の順(左の列から、列の中は上から)に空いている番号
//   4. 「このページを振り直す」: 未採番と、このページの書式の番号を位置の順に 1 から。名前・別ページの番号・チェックを外した線は変えない
//   5. ネットに違う番号が混ざっていたら振り直さない(2026-09-25 決定A)
//   6. ×で消してもほかの線番は動かない。手で打った番号の繰り上げは書式の番号だけ
// report.js を丸ごと実行して確かめる。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (c, m) => eq(!!c, true, m);

const log = { alert: [], confirm: [], table: '' };
const domEls = {};
['report-tabs', 'report-title', 'report-body', 'report-csv-btn', 'wn-page-digits', 'wn-seq-digits', 'wn-info'].forEach(id => { domEls[id] = { innerHTML: '', textContent: '', style: {} }; });
const sb = {
  document: { getElementById: id => domEls[id] || null },
  console, window: {},
  escH: require('./_esch.js').escH,
  confirm: m => { log.confirm.push(m); return true; }, alert: m => { log.alert.push(m); },
  openFP: () => {}, closeFP: () => {}, draw: () => {}, pushH: () => {},
  dl: () => {}, _csvName: p => p + '.csv', getDef: () => ({ w: 20 }),
};
vm.createContext(sb);
const R = f => fs.readFileSync(__dirname + '/../js/' + f, 'utf8').replace(/\r\n/g, '\n');
vm.runInContext(R('report.js'), sb);
const realTable = sb.wireNoTable;
sb.wireNoTable = m => { log.table = m || ''; };

// 縦の配線1本 = 1ネット(x が列、y が上下)
const V = (id, x, y, no, extra) => Object.assign({ id, x1: x, y1: y, x2: x, y2: y + 30, wireNo: no || '' }, extra);
function setup(wires, fmt, page) {
  log.alert = []; log.confirm = []; log.table = '';
  sb.state = { wireNoFmt: fmt, customSymbols: [], currentPage: 0,
    pages: [{ name: 'P1', elements: [], wires, frameObj: page === undefined ? null : { page } }] };
  return wires;
}
const nos = w => w.map(x => x.wireNo);

console.log('【書式に合う番号だけが対象】');
{
  setup([], { pageDigits: 0, seqDigits: 2 });
  eq(['01', '16', 'L1', 'R', 'E', '101', 'W001'].map(v => !!sb.wnParse(v)), [true, true, false, false, false, false, false], '★ページ番号なし・2桁: 01・16 だけ。L1・R・E は名前');
  setup([], { pageDigits: 1, seqDigits: 2 });
  eq(sb.wnParse('305'), { part: '3', seq: 5 }, 'ページ1桁+連番2桁: 305 = 3ページの5');
  eq(sb.wnParse('05'), null, '桁が合わなければ対象外');
}

console.log('\n【ページ番号は表題欄から】');
{
  setup([], { pageDigits: 2, seqDigits: 2 }, '3 / 12');
  eq(sb.wnPagePart(0), { part: '03' }, '「3 / 12」→ 03(2桁にそろえる)');
  setup([], { pageDigits: 1, seqDigits: 2 }, '');
  ok(/自動\(1 \/ 1\)になっています/.test(sb.wnPagePart(0).err) && /線番には使いません/.test(sb.wnPagePart(0).err), '★空(表題欄は自動の「1 / 1」)なら使わず、その理由を知らせる');
  setup([], { pageDigits: 1, seqDigits: 2 }, 'A');
  ok(/数字ではありません/.test(sb.wnPagePart(0).err), '数字でなければ知らせる');
  setup([], { pageDigits: 1, seqDigits: 2 }, '12');
  ok(/収まりません/.test(sb.wnPagePart(0).err), '桁に収まらなければ知らせる');
  setup([], { pageDigits: 0, seqDigits: 2 }, '');
  eq(sb.wnPagePart(0), { part: '' }, 'ページ番号なしの書式なら表題欄は見ない');
}

console.log('\n【割付: 番号の無い線だけ・位置の順・空いている番号】');
{
  const w = setup([V('a', 200, 0), V('b', 0, 50), V('c', 0, 0), V('d', 100, 0, '302'), V('e', 300, 0, 'L1')], { pageDigits: 1, seqDigits: 2 }, '3');
  sb.autoWireNumber('page');
  eq(nos(w), ['303', '301', '304', '302', 'L1'].map((v, i) => v).slice(0, 5).length && nos(w), nos(w), '');
  // 左の列から: c(0,0) → b(0,50) → a(200,0)。302 は使用中なので飛ばす
  eq(nos(w), ['304', '303', '301', '302', 'L1'], '★左の列から・列の中は上から、空いている番号(302 は飛ばす)。L1 は触らない');
  const w2 = setup([V('a', 0, 0)], { pageDigits: 1, seqDigits: 2 }, '');
  sb.autoWireNumber('page');
  eq(nos(w2), [''], '★表題欄のページ番号が空なら振らない');
  ok(/自動\(1 \/ 1\)/.test(log.table), 'そのことを線番表で知らせる');
}

console.log('\n【このページを振り直す】');
{
  const w = setup([V('a', 0, 0), V('b', 100, 0, '305'), V('c', 200, 0, '301'), V('d', 50, 0, '303', { noAutoNum: true }),
                   V('e', 300, 0, 'L1'), V('f', 400, 0, '405')], { pageDigits: 1, seqDigits: 2 }, '3');
  sb.wireNoRenumberPage(0);
  eq(nos(w), ['301', '302', '304', '303', 'L1', '405'], '★位置の順に 301,302,…。チェックを外した 303 は残して避ける。L1・別ページの 405 は変えない');
  ok(log.confirm.length === 1 && /305 → 302/.test(log.confirm[0]) && /\(未採番\) → 301/.test(log.confirm[0]), '変わる番号を見せて確かめる');
  const w2 = setup([V('a', 0, 0, '01'), V('b', 0, 50, '03'), V('c', 0, 100, 'L2')], { pageDigits: 0, seqDigits: 2 });
  sb.wireNoRenumberPage(0);
  eq(nos(w2), ['01', '02', 'L2'], '★飛んだ番号を詰める(ページ番号なしの書式)。L2 は変えない');
  // 1ファイルに複数シート(ページ番号なしの書式)でも、振り直しはそのシートだけ。他のシートの番号は変えずに避ける(2026-10-04)
  {
    log.confirm = [];
    sb.state = { wireNoFmt: { pageDigits: 0, seqDigits: 2 }, customSymbols: [], currentPage: 0, pages: [
      { name: 'P1', elements: [], wires: [V('a', 0, 0, '05'), V('b', 0, 50, '')], frameObj: null },
      { name: 'P2', elements: [], wires: [V('c', 0, 0, '01'), V('d', 0, 50, '09')], frameObj: null } ] };
    sb.wireNoRenumberPage(0);
    eq([nos(sb.state.pages[0].wires), nos(sb.state.pages[1].wires)], [['02', '03'], ['01', '09']], '★複数シートのファイルでも振り直しはそのシートだけ(P2 の 01・09 は変えず、01 は避ける)');
  }
  setup([V('a', 0, 0, '01'), V('b', 0, 50, '02')], { pageDigits: 0, seqDigits: 2 });
  sb.wireNoRenumberPage(0);
  ok(log.confirm.length === 0 && /今のままで揃っています/.test(log.table), '変わらなければ確かめずに知らせるだけ');
}

console.log('\n【ネットに違う番号が混ざっていたら振り直さない(決定A)】');
{
  const w = setup([
    { id: 'a', x1: 0, y1: 0, x2: 100, y2: 0, wireNo: '01' },
    { id: 'b', x1: 50, y1: 0, x2: 50, y2: 50, wireNo: '02' },   // ●で a とつながる
    { id: 'c', x1: 500, y1: 0, x2: 600, y2: 0, wireNo: '05' },
  ], { pageDigits: 0, seqDigits: 2 });
  sb.state.pages[0].elements = [{ type: 'junction', x: 50, y: 0, style: 'dot' }];
  sb.wireNoRenumberPage(0);
  eq(nos(w), ['01', '02', '05'], '★1本も変わらない');
  ok(log.alert.length === 1 && log.confirm.length === 0, '理由を知らせ、確認の前に止まる');
}

console.log('\n【×で消してもほかの線番は動かない・繰り上げは書式の番号だけ】');
{
  const w = setup([V('a', 0, 0, 'L1'), V('b', 100, 0, 'L2'), V('c', 200, 0, '01'), V('d', 300, 0, '02')], { pageDigits: 0, seqDigits: 2 });
  sb.deleteNetFromList(0, [0]);
  eq(nos(sb.state.pages[0].wires), ['L2', '01', '02'], '★L1 を消しても L2 は L2 のまま(以前は L1 になった)');
  const w2 = setup([V('a', 0, 0, 'L1'), V('b', 100, 0, 'L2'), V('c', 200, 0, ''), V('d', 300, 0, '01'), V('e', 400, 0, '02'), V('f', 500, 0, '')], { pageDigits: 0, seqDigits: 2 });
  sb.applyNetWireNo(0, [2], 'L1');
  eq(nos(w2), ['L1', 'L2', 'L1', '01', '02', ''], '★名前(L1)を重ねて打っても L1・L2 は繰り上げない');
  sb.applyNetWireNo(0, [5], '01');
  eq(nos(w2), ['L1', 'L2', 'L1', '02', '03', '01'], '書式の番号(01)は今まで通り割り込んで繰り上げる');
}

console.log('\n【書式を変えたら、前の書式の番号を書き換えるか聞く】');
{
  const w = setup([V('a', 0, 0, '01'), V('b', 0, 50, '03'), V('c', 0, 100, 'L1')], { pageDigits: 0, seqDigits: 2 }, '3');
  domEls['wn-page-digits'].value = '1'; domEls['wn-seq-digits'].value = '2';
  sb.setWireNoFmt();
  eq(nos(w), ['301', '303', 'L1'], '★01→301・03→303(連番はそのまま、ページ番号を付ける)。L1 は変えない');
  ok(/01 → 301/.test(log.confirm[0] || ''), '書き換える前に確かめる');
  eq(sb.wnFmt(), { pageDigits: 1, seqDigits: 2, mainBranch: 'pos', mainMotor: 'pos' }, '書式が変わる');
  const w2 = setup([V('a', 0, 0, '01')], { pageDigits: 0, seqDigits: 2 }, '');
  domEls['wn-page-digits'].value = '1';
  sb.setWireNoFmt();
  eq([nos(w2), sb.wnFmt(), domEls['wn-page-digits'].value], [['01'], { pageDigits: 0, seqDigits: 2, mainBranch: 'pos', mainMotor: 'pos' }, '0'], '★表題欄のページ番号が空で書き換えられないなら、書式を変えない(後から書き換える手段が無くなるため)');
  ok(/書式は変えていません/.test(log.alert[0] || ''), 'そのことを知らせる');
}

console.log('\n【チェックの一覧(線番の再設計③)】');
{
  setup([V('a', 0, 0, '301'), V('b', 100, 0, '301'), V('c', 200, 0, ''), V('d', 300, 0, 'L1')], { pageDigits: 1, seqDigits: 2 }, '');
  const k = sb.wireNoChecks();
  const kinds = k.map(c => c.kind).sort();
  eq(kinds, ['dup', 'dup', 'none', 'page'], '★重複(2か所とも)・未採番・表題欄のページ番号なし');
  ok(k.filter(c => c.kind === 'dup').every(c => c.idxs && c.idxs.length), '重複は押すとその線へ飛べる');
  setup([V('a', 0, 0, '01'), V('b', 100, 0, '02')], { pageDigits: 0, seqDigits: 2 });
  eq(sb.wireNoChecks(), [], '問題が無ければ空');
  sb.wireNoTable = realTable;
  sb.wireNoTable();
  ok(/問題はありません/.test(domEls['report-body'].innerHTML), '線番表に「問題はありません」');
  setup([V('a', 0, 0, '01'), V('b', 100, 0, '01')], { pageDigits: 0, seqDigits: 2 });
  sb.wireNoTable();
  ok(/チェック 2件/.test(domEls['report-body'].innerHTML) && /onclick="jumpToNet\(0,\[/.test(domEls['report-body'].innerHTML), '★線番表の上に一覧、押すと飛ぶ');
  sb.wireNoTable = m => { log.table = m || ''; };
}

console.log('\n【線番表の案内】');
{
  sb.wireNoTable = realTable;
  setup([V('a', 0, 0)], { pageDigits: 1, seqDigits: 2 }, '3');
  sb.wireNoTable();
  const html = domEls['report-body'].innerHTML;
  ok(/このページを振り直す/.test(html) && !/欠番を詰める/.test(html), '「欠番を詰める」は無く「このページを振り直す」');
  ok(/線番の書式: 表題欄のページ番号1桁＋連番2桁\(例 305\)/.test(html), '今の書式を出す');
}

const src = R('report.js');
ok(!/function compactAllWireNumbers|function compactWireNumbersAfterRemoval/.test(src), '末尾が数字なら何でも詰める処理は無い');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
