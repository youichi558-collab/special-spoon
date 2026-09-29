// ================================================================
// ブレーカ系の選択項目: 極数・定格電流・動作特性(2026-09-29)
//
// 盛田さん「プルダウンでいい」「仕様のコピーも忘れるなよ」。
//   ・部品DBの電流列に `極数:1P・2P / 電流:… / 特性:…` と書いた行だけプルダウンになる
//   ・仕様欄には一覧ではなく選んだ値(例: 2P 5A / 中速形(M))だけが入る
//   ・選んだ値はコピー貼り付けとデバイス選び直しで引き継がれる(入れ忘れの前例: specHide)
//   ・手で書いた仕様欄は上書きしない
// ui.js の実コードと、catalog_pending の実際のCSV行(CP30-BA・NF32-SV)を使う。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const ui = R('js/ui.js');
const pick = re => { const m = ui.match(re); if (!m) throw new Error('実装が見つかりません: ' + re); return m[0]; };

// 実際のCSV行(ヘッダなし: メーカー,型番,種別,電圧,電流,端子,接点,備考,出典,URL)
function csvRow(file, ref) {
  const rows = []; let cur = [], f = '', q = false;
  const s = R('catalog_pending/' + file);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i+1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { cur.push(f); f = ''; }
    else if (c === '\n') { cur.push(f); rows.push(cur); cur = []; f = ''; }
    else f += c;
  }
  const r = rows.find(x => x[1] === ref);
  if (!r) throw new Error(ref + ' がCSVに無い');
  return { maker: r[0], ref: r[1], type: r[2], volt: r[3], amp: r[4], terminals: r[5], contacts: r[6] };
}
const CP = csvRow('mitsubishi_cp_batch1.csv', 'CP30-BA');
const NF = csvRow('mitsubishi_breaker_batch1.csv', 'NF32-SV');
const MY = csvRow('omron_my_relay_batch1.csv', 'MY2N');

// ---- 実コードを読み込む ----
const nodes = {};
const domRp = { _el: null };
const sb = {
  console, alert: () => {},
  state: { customParts: [CP, NF, MY], customSymbols: [], elements: [], sel: { els: new Set() }, pages: [] },
  getDef: () => ({}),
  document: { getElementById: id => id === 'rp-body' ? domRp : (nodes[id] || null) },
  draw: () => {}, updateRightPanel: () => {}, applyRightPanel: () => {},
  pushH: () => {}, deviceClipboard: null, _pushed: 0,
  hintEl: { textContent: '' },
  applyDefaultVolt: () => {},
  escH: require('./_esch.js').escH,   // 実体は js/state.js のもの
};
sb.document.getElementById = id => id === 'rp-body' ? domRp : id === 's-hint' ? sb.hintEl : (nodes[id] || null);
sb.state.elements = [];
vm.createContext(sb);
vm.runInContext([
  pick(/function _esc\([\s\S]*?\n\}/),
  pick(/const DIRECT_VOLT_TYPES = \[[\s\S]*?\];/),
  pick(/const PART_CHOICES = \[[\s\S]*?\n\];/),
  pick(/const PART_CHOICE_SEG = \{[\s\S]*?\};/),
  pick(/function partChoices\([\s\S]*?\n\}/),
  pick(/function applyDefaultChoices\([\s\S]*?\n\}/),
  pick(/function partChoiceLabel\([\s\S]*?\n\}/),
  pick(/function partChoiceRowsHtml\([\s\S]*?\n\}/),
  pick(/function applyPartChoicesFromPanel\([\s\S]*?\n\}/),
  pick(/function doPlacePart\([\s\S]*?\n\}/),
  // 端子番号(グループ形式の自動選択)。placePart が使う
  pick(/function parseTerminalGroups\([\s\S]*?\n\}/),
  pick(/function symTerminalCount\([\s\S]*?\n\}/),
  pick(/function pickTerminalGroup\([\s\S]*?\n\}/),
  pick(/function symTermRole\([\s\S]*?\n\}/),
  pick(/const TERM_GROUP_PATTERNS = \{[\s\S]*?\n\};/),
  pick(/const TERM_GROUP_EXCLUDE = \{[\s\S]*?\n\};/),
  pick(/function matchGroupsByRole\([\s\S]*?\n\}/),
  'function askTerminalGroup() { globalThis._asked = true; }',
  pick(/function placePart\([\s\S]*?\n\}/),
  pick(/function collectDeviceInfo\([\s\S]*?\n\}/),
  pick(/const DEVICE_PROP_KEYS = \[[\s\S]*?\n\];/),
  pick(/function copyDeviceProps\([\s\S]*?\n\}/),
  pick(/function pasteDeviceProps\([\s\S]*?\n\}/),
  'this.DEVICE_PROP_KEYS = DEVICE_PROP_KEYS;',
].join('\n'), sb);

console.log('【CSVの書き方を読み取る】');
{
  const ch = sb.partChoices('CP30-BA');
  eq(ch.poles, ['1P', '2P'], '極数は1P・2Pだけ(3Pは入れない)');
  eq(ch.amp.length, 13, '定格電流は13段階');
  ok(ch.amp[0] === '0.1A' && ch.amp[7] === '5A' && ch.amp[12] === '30A', '電流の値に単位が付いている');
  eq(ch.char, ['瞬時形(I)', '中速形(M)', '低速形(S)', '高速形(F)'], '動作特性');
  eq(sb.partChoices('NF32-SV'), null, '従来の書き方のブレーカ(NF32-SV)は選択項目なし');
  eq(sb.partChoices('MY2N'), null, '補助リレーも選択項目なし');
  eq(sb.partChoices('未登録'), null, '未登録の型番は選択項目なし');
  eq(sb.partChoices(''), null, '型番なしは選択項目なし');
}

console.log('\n【補助リレー(MY)の仕様欄に電流が入らない】');
{
  eq(MY.amp, '-', 'MY2Nの電流列は「-」(接点定格は備考へ移した)');
  const el = { id: 1, type: 'coil' }; sb.state.elements = [el]; sb.state.sel.els = new Set([1]);
  sb.doPlacePart('coil', 'MY2N', '', '');
  eq(el.label, '2c', '仕様欄は接点構成だけ(コイル電圧は別に選ぶ)');
}

console.log('\n【CPの端子番号: ブレーカと同じ決まり(電源側=奇数/負荷側=偶数)】');
{
  eq(CP.terminals, '1P:1,2 / 2P:1,3,2,4', 'CSVの端子欄(1P・2Pの2グループ)');
  const groups = sb.parseTerminalGroups(CP.terminals);
  eq(groups.map(g => g.name), ['1P', '2P'], '2つのグループ');
  eq(sb.pickTerminalGroup(groups, 4).list, ['1', '3', '2', '4'], '端子点4つ → 2P');
  eq(sb.pickTerminalGroup(groups, 2).list, ['1', '2'], '端子点2つ → 1P');
  eq(sb.parseTerminalGroups(NF.terminals)[0].list, ['1', '3', '5', '2', '4', '6'], '(比較)NF32-SVは電源側の奇数が先');

  // Sheet3のCPシンボルと同じ形: 端子点4つ・種別はcontact_a(補助接点a)
  sb.state.customSymbols = [
    { type: 'sym_cp2', role: 'contact_a', terminals: [{}, {}, {}, {}] },
    { type: 'sym_cp1', role: 'contact_a', terminals: [{}, {}] },
  ];
  const e2 = { id: 30, type: 'sym_cp2' }, e1 = { id: 31, type: 'sym_cp1' };
  sb.state.elements = [e2, e1];
  sb._asked = false;
  sb.state.sel.els = new Set([30]); sb.placePart('breaker', 'CP30-BA', CP.terminals);
  eq(e2.terminals, '1,3,2,4', '端子点4つのシンボルには 1,3,2,4 が自動で入る(選択パネルは出ない)');
  sb.state.sel.els = new Set([31]); sb.placePart('breaker', 'CP30-BA', CP.terminals);
  eq(e1.terminals, '1,2', '端子点2つのシンボルには 1,2 が自動で入る');
  ok(!sb._asked, '種別が補助接点(contact_a)でも、選択パネルで止まらない');
}

console.log('\n【配置: 仕様欄は選んだ値だけ】');
{
  const el = { id: 2, type: 'cp' }; sb.state.elements = [el]; sb.state.sel.els = new Set([2]);
  sb.doPlacePart('breaker', 'CP30-BA', '', '');
  eq(el.partPoles, '2P', '極数は既定で2P');
  ok(el.partAmp === undefined && el.partChar === undefined, '電流・特性は決め打ちしない(未選択)');
  eq(el.label, '2P', '仕様欄には一覧ではなく「2P」だけ');
  ok(!/0\.1A/.test(el.label), '選択肢の一覧(0.1A・0.25A…)が入らない');

  const keep = { id: 3, type: 'cp', label: '手書きの仕様' }; sb.state.elements = [keep]; sb.state.sel.els = new Set([3]);
  sb.doPlacePart('breaker', 'CP30-BA', '', '');
  eq(keep.label, '手書きの仕様', '手で書いた仕様欄は上書きしない');

  const nf = { id: 4, type: 'nf' }; sb.state.elements = [nf]; sb.state.sel.els = new Set([4]);
  sb.doPlacePart('breaker', 'NF32-SV', '', '');
  eq(nf.label, '3,5,10,15,20,30,32A', '従来の書き方の部品(NF32-SV)は今までどおり(変えていない)');
  ok(nf.partPoles === undefined, 'NF32-SVに極数は入らない');
}

console.log('\n【プルダウンで選ぶと仕様欄が追随する(手書きは守る)】');
{
  const setNodes = (poles, amp, chr, label) => {
    Object.keys(nodes).forEach(k => delete nodes[k]);
    nodes['pp-partpoles'] = { value: poles }; nodes['pp-partamp'] = { value: amp };
    nodes['pp-partchar'] = { value: chr }; nodes['pp-label'] = { value: label };
  };
  const el = { partModel: 'CP30-BA', partPoles: '2P', label: '2P' };
  setNodes('2P', '5A', '', '2P');
  sb.applyPartChoicesFromPanel(el);
  eq(el.partAmp, '5A', '電流5Aを選ぶ');
  eq(el.label, '2P 5A', '仕様欄が「2P 5A」になる');
  eq(nodes['pp-label'].value, '2P 5A', '画面の仕様欄も更新される(古いままだと次の適用で戻る)');

  setNodes('2P', '5A', '中速形(M)', '2P 5A');
  sb.applyPartChoicesFromPanel(el);
  eq(el.label, '2P 5A\n中速形(M)', '特性を選ぶと2行目に入る');

  el.label = 'CP30-BA 2P 5A 操作回路用'; setNodes('2P', '10A', '中速形(M)', el.label);
  sb.applyPartChoicesFromPanel(el);
  eq(el.partAmp, '10A', '電流は10Aに変わる');
  eq(el.label, 'CP30-BA 2P 5A 操作回路用', '手で書いた仕様欄は書き換えない');

  const other = { partModel: 'NF32-SV', partPoles: '2P', partAmp: '5A', label: 'x' };
  setNodes('', '', '', 'x');
  sb.applyPartChoicesFromPanel(other);
  ok(other.partPoles === undefined && other.partAmp === undefined, '選択項目のない型番に替えたら前の選択は消える');
}

console.log('\n【パネルの選択欄】');
{
  const html = sb.partChoiceRowsHtml({ partModel: 'CP30-BA', partPoles: '2P', partAmp: '5A' });
  ok(/id="pp-partpoles"/.test(html) && /id="pp-partamp"/.test(html) && /id="pp-partchar"/.test(html), '3つの選択欄が出る');
  ok(/<option value="5A" selected>/.test(html), '選択済みの電流が選ばれている');
  ok(/<option value="2P" selected>/.test(html) && !/<option value="3P"/.test(html), '極数は2Pが選ばれ、3Pは無い');
  eq(sb.partChoiceRowsHtml({ partModel: 'NF32-SV' }), '', '選択項目のない型番は何も出ない');
}

console.log('\n【仕様のコピー(コピー→貼り付け)】');
{
  ok(['partPoles', 'partAmp', 'partChar'].every(k => sb.DEVICE_PROP_KEYS.includes(k)),
     '3項目ともDEVICE_PROP_KEYSに入っている');
  const src = { id: 10, partRef: 'CP1', partModel: 'CP30-BA', label: '2P 5A\n中速形(M)',
                partPoles: '2P', partAmp: '5A', partChar: '中速形(M)' };
  const dst = { id: 11, partRef: '', partModel: '', label: '', partPoles: '1P', partAmp: '30A' };
  sb.state.elements = [src, dst];
  domRp._el = src; sb.copyDeviceProps();
  sb.state.sel.els = new Set([11]); domRp._el = null; sb.pasteDeviceProps();
  eq([dst.partPoles, dst.partAmp, dst.partChar], ['2P', '5A', '中速形(M)'], '貼り付け先に極数・電流・特性が入る(前の値は上書き)');
  eq(dst.label, '2P 5A\n中速形(M)', '仕様欄も一緒に貼り付く');

  const none = { id: 12, partRef: 'CP2', partModel: 'CP30-BA', label: '2P', partPoles: '2P' };
  const dst2 = { id: 13, partAmp: '30A', partChar: '低速形(S)' };
  sb.state.elements = [none, dst2]; domRp._el = none; sb.copyDeviceProps();
  sb.state.sel.els = new Set([13]); domRp._el = null; sb.pasteDeviceProps();
  ok(dst2.partAmp === undefined && dst2.partChar === undefined, '未選択のまま貼り付けると、貼り付け先の古い選択も消える(選択がずれない)');
}

console.log('\n【デバイスを選び直したときの引き継ぎ】');
{
  sb.state.pages = [{ elements: [
    { id: 20, partRef: 'CP1', partModel: 'CP30-BA', label: '2P 5A', partPoles: '2P', partAmp: '5A', partChar: '中速形(M)' },
    { id: 21, partRef: 'CP1' },
  ] }];
  const info = sb.collectDeviceInfo().get('CP1');
  eq([info.poles, info.amp, info.char], ['2P', '5A', '中速形(M)'], '同じデバイスの極数・電流・特性を拾う');
  ok(/info\.poles[\s\S]{0,80}partPoles[\s\S]*info\.amp[\s\S]{0,80}partAmp[\s\S]*info\.char[\s\S]{0,80}partChar/.test(
       pick(/function onPartRefChanged\([\s\S]*?\n\}/)), 'onPartRefChangedが3項目を要素へ入れる');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
