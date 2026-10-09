// ================================================================
// 前回値を覚える(2026-09-29)
//
// 盛田さん「プルダウンの部分は一度選んだら、前回値記憶できないか？」「型番関係なくだな」「全部で」。
//   ・部品の選択(コイル電圧・極数・定格電流・動作特性)は、型番に関係なく最後に選んだ値を覚え、
//     次に割り当てるとき、その型番で選べる値なら最初から選ぶ
//   ・グリッド・端点Snap・中点Snap・線幅(作図)・PDFの解像度・形式は起動時に戻す
//   ・置き場所は localStorage の専用キー ecad_prefs(図面データには入れない)
// settings.js / ui.js の実コードを動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const ui = R('js/ui.js'), st = R('js/settings.js');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const sel = (vals, v) => ({ value: v, options: vals.map(x => ({ value: x })), classList: { toggle() {} } });
const dom = {
  'grid-sel': sel(['1', '2', '5', '10', '20', '40'], '10'),
  'draw-lw': sel(['', '0.13', '0.18', '0.25', '0.35', '0.5'], ''),
  'rb-snapend': { classList: { toggle(c, on) { dom['rb-snapend'].on = on; } } },
  'rb-snapmid': { classList: { toggle(c, on) { dom['rb-snapmid'].on = on; } } },
};
const CP = { ref: 'CP30-BA', type: 'breaker', amp: '極数:1P・2P / 電流:0.1A・5A・10A / 特性:瞬時形(I)・中速形(M)' };
const MC = { ref: 'S-T10', type: 'contactor', volt: 'AC24V・AC100V・AC200V' };
const MY = { ref: 'MY2N', type: 'coil', volt: 'AC100V・DC24V' };
const sb = {
  console, localStorage,
  document: { getElementById: id => dom[id] || null },
  state: { G: 10, snapEnd: true, snapMid: true, drawLineWidth: null, customParts: [CP, MC, MY] },
};
vm.createContext(sb);
vm.runInContext([
  pick(st, /const ST_PREFS_KEY = [^\n]*/),
  pick(st, /function stPrefs\([\s\S]*?\n\}/),
  pick(st, /function stSetPref\([\s\S]*?\n\}/),
  pick(st, /function stApplyPrefs\([\s\S]*?\n\}/),
  pick(ui, /const COIL_VOLT_TYPES = \[[\s\S]*?\];/),
  pick(ui, /const COMMON_VOLTS = \[[\s\S]*?\];/),
  pick(ui, /function partVoltOptions\([\s\S]*?\n\}/),
  pick(ui, /function defaultPartVolt\([\s\S]*?\n\}/),
  pick(ui, /const PART_CHOICES = \[[\s\S]*?\n\];/),
  pick(ui, /const PART_CHOICE_SEG = \{[\s\S]*?\};/),
  pick(ui, /function partChoices\([\s\S]*?\n\}/),
  pick(ui, /function applyDefaultChoices\([\s\S]*?\n\}/),
].join('\n'), sb);

console.log('【部品の選択: 型番に関係なく前回値】');
{
  eq(sb.defaultPartVolt('S-T10'), 'AC200V', '覚えていなければ従来どおりAC200V');
  sb.stSetPref('partVolt', 'AC100V');
  eq(sb.defaultPartVolt('S-T10'), 'AC100V', 'AC100Vを選んだ後はAC100V');
  eq(sb.defaultPartVolt('MY2N'), 'AC100V', '別の型番(MY2N)でもAC100V(型番に関係なく)');
  sb.stSetPref('partVolt', 'DC24V');
  eq(sb.defaultPartVolt('S-T10'), 'AC200V', '前回値(DC24V)がその型番で選べなければ従来の既定');

  const e1 = { partModel: 'CP30-BA' }; sb.applyDefaultChoices(e1);
  eq([e1.partPoles, e1.partAmp, e1.partChar], ['2P', undefined, undefined], '覚えていなければ2Pだけ');
  sb.stSetPref('part_poles', '1P'); sb.stSetPref('part_amp', '5A'); sb.stSetPref('part_char', '中速形(M)');
  const e2 = { partModel: 'CP30-BA' }; sb.applyDefaultChoices(e2);
  eq([e2.partPoles, e2.partAmp, e2.partChar], ['1P', '5A', '中速形(M)'], '選んだ後は極数・電流・特性とも前回値');
  sb.stSetPref('part_amp', '30A');
  const e3 = { partModel: 'CP30-BA' }; sb.applyDefaultChoices(e3);
  ok(e3.partAmp === undefined, '前回値(30A)がその型番に無ければ未選択のまま');
  const e4 = { partModel: 'CP30-BA', partAmp: '10A' }; sb.applyDefaultChoices(e4);
  eq(e4.partAmp, '10A', '既に選んである値は前回値で上書きしない');
  sb.stSetPref('part_amp', '');
  ok(!('part_amp' in sb.stPrefs()), '未選択を選ぶと覚えた値を消す');
}

console.log('\n【作図・出力: 起動時に戻す】');
{
  sb.stSetPref('grid', 5); sb.stSetPref('snapEnd', false); sb.stSetPref('snapMid', true);
  sb.stSetPref('drawLw', '0.5');
  sb.stApplyPrefs();
  eq([sb.state.G, dom['grid-sel'].value], [5, '5'], 'グリッド');
  eq([sb.state.snapEnd, dom['rb-snapend'].on], [false, false], '端点Snap(OFF)とボタンの表示');
  eq([sb.state.snapMid, dom['rb-snapmid'].on], [true, true], '中点Snap');
  eq([sb.state.drawLineWidth, dom['draw-lw'].value], [0.5, '0.5'], '線幅(作図)');
  // PDFの解像度・形式は 2026-10-09 に消した(画像の PDF をやめた。js/pdf_vector.js)
  sb.stSetPref('grid', 7); sb.state.G = 10; dom['grid-sel'].value = '10'; sb.stApplyPrefs();
  eq(sb.state.G, 10, '画面に無い値(G:7)が残っていても使わない');
}

console.log('\n【置き場所・つなぎ込み】');
{
  ok(Object.keys(store).join() === 'ecad_prefs', 'localStorageの専用キー ecad_prefs だけに書く');
  const as = R('js/autosave.js');
  ok(!/ecad_prefs|stPrefs/.test(as), '自動保存(図面データ)には入れない');
  const html = R('index.html');
  ['grid-sel', 'draw-lw', 'pdf-color'].forEach(id =>
    ok(new RegExp(`id="${id}"[^>]*stSetPref`).test(html), `${id} を変えたら覚える`));
  const inp = R('js/input.js');
  ok(/state\.snapEnd = !state\.snapEnd;[\s\S]{0,200}stSetPref\('snapEnd'/.test(inp), '端点Snapを切り替えたら覚える');
  ok(/state\.snapMid = !state\.snapMid;[\s\S]{0,200}stSetPref\('snapMid'/.test(inp), '中点Snapを切り替えたら覚える');
  ok(/id="pp-partvolt" onchange="stSetPref\('partVolt'/.test(ui), 'コイル電圧を選んだら覚える');
  ok(/onchange="stSetPref\('part_\$\{c\.opt\}'/.test(ui), '極数・電流・特性を選んだら覚える');
  ok(/stSetPref\('partVolt',volt\)/.test(R('js/report.js')), '部品表でコイル電圧を変えたら覚える');
  ok(/stApplyPrefs/.test(R('js/boot.js')), '起動時に戻す');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
