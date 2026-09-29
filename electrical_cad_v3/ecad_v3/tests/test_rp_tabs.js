// ================================================================
// プロパティ(右パネル)のタブ分けと、タブ単位のコピー(2026-09-29、js/ui.js)
//
// 盛田さん「タブでいい、タブで分けてコピー変える、今の一括コピーとタブコピーを作ってくれ」。
//   ・シンボルの枠を 基本/端子/形/メモ の4タブに分ける。入力欄のIDは変えない(applyRightPanelが全部の欄を読めるように)
//   ・一括コピー(DEVICE_PROP_KEYS)は従来どおり残す
//   ・タブコピーは、そのタブの項目だけを運ぶ。他のタブの項目・線番は運ばない
// ui.js の実コードを動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '\n    期待', JSON.stringify(b), '\n    実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const ui = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8').replace(/\r\n/g, '\n');
const pick = re => { const m = ui.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

const hint = { textContent: '' };
let alerts = [], drawn = 0;
const sb = { console, alert: m => alerts.push(m), draw: () => { drawn++; }, updateRightPanel: () => {}, applyRightPanel: () => {}, pushH: () => { sb._pushed = (sb._pushed || 0) + 1; },
  document: { getElementById: id => (id === 's-hint' ? hint : id === 'rp-body' ? sb._rp : null) } };
vm.createContext(sb);
vm.runInContext([pick(/function rpSymbolLabel\([\s\S]*?\n\}/), pick(/const RP_TABS = \[[\s\S]*?\n\];/), pick(/const TAB_PROP_KEYS = \{[\s\S]*?\n\};/), pick(/const TAB_PROP_KEEP = [^\n]*/),
  'let tabClipboard = {};', pick(/function rpTabsHeader\([\s\S]*?\n\}/), pick(/function rpPaneOpen\([\s\S]*?\n\}/), pick(/function rpPaneClose\([^\n]*/),
  pick(/function copyTabProps\([\s\S]*?\n\}/), pick(/function pasteTabProps\([\s\S]*?\n\}/), pick(/const DEVICE_PROP_KEYS = \[[\s\S]*?\n\];/)].join('\n'), sb);

const G = name => vm.runInContext(name, sb);   // const/let はサンドボックスの外から直接は見えない
const mk = () => ({ id: 'e', type: 'sym', partRef: 'CR1', partModel: 'MY4N', label: 'L', terminals: '13,14', termOff: [[1, 2], [3, 4]], termFs: 5,
  note: 'メモ', showNote: true, noteFs: 8, rot: 90, scale: 0.5, textRot: 90, lineStyle: 'dash', lineWidth: 0.7, layer: '配線', wireNo: 'W1' });
function state(els, sel) { sb.state = { elements: els, sel: { els: new Set(sel) } }; sb._rp = { _el: els[0] }; }

console.log('【タブの構成】');
{
  eq(G('RP_TABS').map(t => t.label), ['基本', '端子', '形', 'メモ', 'CR'], '基本/端子/形/メモ/CRのタブ');
  ok(!sb.rpTabsHeader(false).includes('CR') && sb.rpTabsHeader(true).includes('CR'), 'CRタブはコイル・接点を選んだときだけ出る');
  const all = [].concat(...Object.values(G('TAB_PROP_KEYS')));
  eq(all.length, new Set(all).size, '同じ項目が2つのタブに入っていない');
  ok(!all.includes('wireNo'), '線番はコピーしない(同じ番号が重複するため)');
  const dev = new Set(G('DEVICE_PROP_KEYS'));
  ok(['label', 'partRef', 'partModel', 'terminals', 'termOff'].every(k => dev.has(k)), '一括コピー(DEVICE_PROP_KEYS)は従来どおり残っている');
  ok(sb.rpTabsHeader().includes('基本') && sb.rpTabsHeader().includes('メモ'), 'タブの見出しが作れる');
  ok(sb.rpPaneOpen('term').includes("copyTabProps('term')") && sb.rpPaneOpen('term').includes("pasteTabProps('term')"), '各タブにコピー・貼り付けボタンがある');
}

console.log('\n【シンボルの逆引き: 選んだ要素の登録シンボル名と役割】');
{
  sb.symRole = el => ({ a1: 'contact_a', c1: 'coil', z: '' }[el.type] || '');
  sb.state = { customSymbols: [{ type: 'a1', name: 'a接点' }, { type: 'c1', name: '補助継電器' }, { type: 'z', label: 'ランプ' }] };
  eq(sb.rpSymbolLabel({ type: 'a1' }), 'a接点／a接点', '名前と役割が出る');
  eq(sb.rpSymbolLabel({ type: 'c1' }), '補助継電器／コイル', 'コイル');
  eq(sb.rpSymbolLabel({ type: 'z' }), 'ランプ／種別なし', 'nameが無ければlabel、役割が無ければ「種別なし」');
  eq(sb.rpSymbolLabel({ type: 'nope' }), '(名前なし)／種別なし', '登録が無い要素でも落ちない');
  ok(/pp-symname/.test(ui), 'プロパティの上に1行出している');
  ok(/id="pp-symname" onclick="rpJumpToSymbol\(/.test(ui), '文字クリックでシンボル一覧へ飛ぶ');
}

console.log('\n【逆引きの文字クリック: シンボル一覧へ飛ぶ】');
{
  vm.runInContext(pick(/function rpJumpToSymbol\([\s\S]*?\n\}/), sb);
  const docSave = sb.document, stSave = sb.state;
  const cls = new Set(); let scrolled = 0, opened = 0, rendered = 0;
  const item = { classList: { add: c => cls.add(c), remove: c => cls.delete(c) }, offsetWidth: 1, scrollIntoView: () => { scrolled++; } };
  const fp = { style: { display: 'none' } };
  const tab = { getAttribute: () => "switchLTab('sym',this)" };
  sb.document = { getElementById: id => (id === 'sym-float' ? fp : null), querySelectorAll: () => [tab],
    querySelector: q => (q === '.sym-item[data-symidx="1"]' ? item : null) };
  sb.switchLTab = () => { opened++; fp.style.display = 'flex'; };
  sb.renderSymFloat = () => { rendered++; }; sb.setTimeout = () => 0;
  sb.state = { customSymbols: [{ type: 'a1' }, { type: 'c1' }] };
  ok(sb.rpJumpToSymbol('c1') === true, '登録シンボルには飛べる');
  ok(opened === 1 && scrolled === 1 && cls.has('sym-jump'), '閉じていれば開き、そこまでスクロールして点滅させる');
  ok(!cls.has('on'), '配置モード用の選択(.on)は付けない');
  opened = 0; ok(sb.rpJumpToSymbol('c1') === true && opened === 0, '既に開いていれば閉じない(トグルしない)');
  alerts = []; ok(sb.rpJumpToSymbol('nope') === false && alerts.length === 1, '登録が無ければ落ちずに知らせる');
  sb.document = docSave; sb.state = stSave;
}

console.log('\n【タブコピーは、そのタブの項目だけを運ぶ】');
{
  const a = mk(), b = { id: 'b', type: 'sym', partRef: 'X9', label: '別', terminals: '1,2', scale: 1, layer: '回路', wireNo: 'W9' };
  state([a, b], ['b']);
  sb._rp = { _el: a };
  sb.copyTabProps('memo');
  sb._rp = { _el: b };
  sb.pasteTabProps('memo');
  eq([b.note, b.showNote, b.noteFs], ['メモ', true, 8], 'メモタブの項目が貼り付く');
  eq([b.partRef, b.label, b.terminals, b.scale, b.wireNo], ['X9', '別', '1,2', 1, 'W9'], '他のタブの項目・線番は変わらない');
  sb._rp = { _el: a };
  sb.copyTabProps('shape');
  sb._rp = { _el: b };
  sb.pasteTabProps('shape');
  eq([b.rot, b.scale, b.textRot, b.lineStyle, b.lineWidth, b.layer], [90, 0.5, 90, 'dash', 0.7, '配線'], '形タブの項目が貼り付く');
  eq(b.wireNo, 'W9', '形タブでも線番は変わらない');
}

console.log('\n【コピー元に無い項目は貼り付け先から消す(layerだけは消さない)】');
{
  const a = { id: 'a', type: 'sym', scale: 2 };                      // 線種・線幅・レイヤーが無い
  const b = { id: 'b', type: 'sym', scale: 1, lineStyle: 'dot', lineWidth: 1, layer: '注記' };
  state([a, b], ['b']);
  sb._rp = { _el: a }; sb.copyTabProps('shape');
  sb._rp = { _el: b }; sb.pasteTabProps('shape');
  eq([b.scale, b.lineStyle, b.lineWidth, b.layer], [2, undefined, undefined, '注記'], '無い項目は消え、レイヤーは残る');
}

console.log('\n【termOffは複製して渡す(貼り付け先どうしで配列を共有しない)】');
{
  const a = mk(), b = { id: 'b' }, c = { id: 'c' };
  state([a, b, c], ['b', 'c']);
  sb._rp = { _el: a }; sb.copyTabProps('term');
  sb.pasteTabProps('term');
  b.termOff[0][0] = 99;
  eq([c.termOff[0][0], a.termOff[0][0]], [1, 1], '片方を変えても他に影響しない');
  eq([b.terminals, b.termFs], ['13,14', 5], '端子タブの項目が貼り付く');
}

console.log('\n【CRタブのコピー(位置補正・サイズ・表示を運ぶ)】');
{
  const a = { id: 'a', type: 'sym', xrefOffX: 5, xrefOffY: -8, xrefMul: 1.5, xrefHide: true, scale: 2 }, b = { id: 'b', type: 'sym', scale: 1 };
  state([a, b], ['b']);
  sb._rp = { _el: a }; sb.copyTabProps('cr');
  sb._rp = { _el: b }; sb.pasteTabProps('cr');
  eq([b.xrefOffX, b.xrefOffY, b.xrefMul, b.xrefHide, b.scale], [5, -8, 1.5, true, 1], 'CRの4項目だけが貼り付く');
}

console.log('\n【コピー前の貼り付け・選択なし】');
{
  vm.runInContext('tabClipboard = {}', sb); alerts = [];
  state([{ id: 'b' }], ['b']); sb.pasteTabProps('basic');
  ok(alerts.length === 1 && /コピー/.test(alerts[0]), 'コピー前は案内を出して何もしない');
}

console.log('\n【組み込み】');
{
  const s = ui;
  eq((s.match(/rpPaneOpen\('/g) || []).length >= 5, true, 'シンボルの枠に5つのペインがある');
  eq((s.match(/html \+= rpPaneClose\(\)/g) || []).length, 5, '5つとも閉じている(閉じ忘れると以降が崩れる)');
  ok(/pp-xshow[\s\S]*pp-xox[\s\S]*pp-xoy[\s\S]*pp-xmul/.test(s) && /el\.xrefHide = /.test(s) && /el\.xrefMul = /.test(s), 'CRタブの欄と、保存(applyRightPanel)がある');
  ok(/rpApplyTab\(\);/.test(s), '描画のあとに選択中のタブを反映する');
  ok(/\.rp-pane\{display:none\}/.test(fs.readFileSync(__dirname + '/../css/style.css', 'utf8')), 'CSSで非選択のタブを隠す(DOMには残す)');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
