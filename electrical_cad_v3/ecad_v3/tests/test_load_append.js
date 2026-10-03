// 保存データの読込で「今のデータを消さずに、ページとして後ろに足す」(2026-09-29、js/edit.js の appendProjectData)
//   node tests/test_load_append.js
// 盛田さん「保存データ読込で今のデータを全部消して読み込んでるのを、消す場合と消さない場合に選べるか」
//   → 読込のたびにダイアログで「置き換える／今の図面の後ろにページとして追加／キャンセル」を選ぶ。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const edit = fs.readFileSync(__dirname + '/../js/edit.js', 'utf8').replace(/\r\n/g, '\n');
const pick = re => { const m = edit.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

let seq = 0;
const sb = { console, genId: p => p + '_' + (++seq), renderSymFloat() {}, renderPartsAll() {}, renderPageTabs() {}, draw() {}, updateRightPanel() {},
  LAYERS: [{ name: '回路', color: '#00f', visible: true }, { name: '配線', color: '#0f0', visible: true }], DEFS: {} };
vm.createContext(sb);
vm.runInContext([pick(/function _syncCurrentPage\(\)[\s\S]*?\n\}/), pick(/function stripLegacyColors\([\s\S]*?\n\}/), pick(/function repairLayers\([\s\S]*?\n\}/),
  pick(/function removeZeroLengthWires\([\s\S]*?\n\}/), pick(/function dedupeIds\([\s\S]*?\n\}/), pick(/function pruneGroups\([\s\S]*?\n\}/),
  pick(/function _legacyProjectPages\([\s\S]*?\n\}/), pick(/function appendProjectData\([\s\S]*?\n\}\n/)].join('\n'), sb);

const el = (id, layer) => ({ id, type: 'k', x: 0, y: 0, layer: layer || '回路' });
function cur() {
  const pg = { name: 'Sheet1', elements: [el('e1'), el('e2')], wires: [{ id: 'w1', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], layer: '配線' }], groups: [], guides: [], dirty: false };
  sb.state = { pages: [pg], currentPage: 0, customSymbols: [{ type: 'sym1', name: '今のsym1' }], customParts: [{ ref: 'P1' }], hiddenBuiltinRefs: ['H1'], wireNoRule: 'W001', saveFileName: '今の図面',
    get page() { return this.pages[this.currentPage]; }, get elements() { return this.page.elements; }, get wires() { return this.page.wires; }, get frameObj() { return this.page.frameObj; } };
  return pg;
}

console.log('【今の図面はそのまま、ファイルのページが最後に付く】');
{
  const pg = cur();
  const before = JSON.stringify(pg);
  const file = { version: 2, saveFileName: '別の図面', wireNoRule: 'X001', layers: [{ name: '回路', color: '#f00', visible: false }, { name: '新レイヤー', color: '#abc', visible: true }],
    customSymbols: [{ type: 'sym1', name: 'ファイルのsym1' }, { type: 'sym2', name: 'sym2' }], customParts: [{ ref: 'P1', maker: '別' }, { ref: 'P2' }], hiddenBuiltinRefs: ['H1', 'H2'],
    pages: [{ name: 'Sheet1', elements: [el('e1'), el('e3', '新レイヤー')], wires: [], groups: [], guides: [] }, { name: 'B', elements: [el('e4', '消えたレイヤー')], wires: [{ id: 'w1', pts: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }], groups: [] }] };
  const r = sb.appendProjectData(file);
  ok(sb.state.pages.length === 3 && sb.state.pages[0] === pg, 'ページが3つになり、今のページはそのまま(同じ物)');
  ok(JSON.stringify(pg) === before, '今のページの中身(要素・配線・未保存マーク)は変わらない');
  ok(sb.state.currentPage === 0 && sb.state.saveFileName === '今の図面' && sb.state.wireNoRule === 'W001', '現在のページ・保存ファイル名・線番の規則は変わらない');
  ok(r.added === 2 && sb.state.pages[1].name === 'Sheet1(2)' && sb.state.pages[2].name === 'B', 'ページ名が今と同じなら(2)を付ける');
  ok(sb.state.pages[1].dirty === true && sb.state.pages[2].dirty === true, '追加したページは未保存マーク');
  const ids = sb.state.pages.flatMap(p => p.elements.map(e => e.id));
  ok(new Set(ids).size === ids.length, '図形IDが重複しない');
  ok(pg.elements[0].id === 'e1' && pg.elements[1].id === 'e2', '今のページのIDは残る');
  ok(sb.state.pages[1].elements[0].id !== 'e1' && r.fixedIds >= 1, '重複していた追加側のIDを付け替える');
  const wids = sb.state.pages.flatMap(p => p.wires.map(w => w.id));
  ok(new Set(wids).size === wids.length, '配線IDも重複しない');
  ok(sb.state.pages[2].wires.length === 0 && r.zeroWires === 1, '追加したページの長さ0の配線は消す');
  ok(sb.LAYERS.find(l => l.name === '回路').color === '#00f' && sb.LAYERS.find(l => l.name === '回路').visible === true, '今のレイヤーの色・表示は変えない');
  ok(sb.LAYERS.some(l => l.name === '新レイヤー') && r.layersAdded === 1, 'ファイルにだけあるレイヤーは足す');
  ok(sb.state.pages[1].elements[1].layer === '新レイヤー', '足したレイヤーの要素はそのレイヤーのまま(最初のレイヤーに戻されない)');
  ok(sb.state.pages[2].elements[0].layer === '回路', 'どこにも無いレイヤーは従来どおり最初のレイヤーへ');
  ok(sb.state.customSymbols.length === 2 && sb.state.customSymbols[0].name === '今のsym1' && sb.state.customSymbols[1].type === 'sym2', 'シンボル: 新しいtypeだけ足し、同じtypeは今のものを使う');
  ok(r.symAdded === 1 && r.symKept === 1 && sb.DEFS.sym2 && !sb.DEFS.sym1, 'シンボルの件数と DEFS への登録');
  ok(sb.state.customParts.length === 2 && sb.state.customParts[0].maker === undefined && r.partsAdded === 1, '部品DB: 無い ref だけ足す(今のものは上書きしない)');
  ok(sb.state.hiddenBuiltinRefs.join() === 'H1', '非表示の内蔵部品(2026-10-03に機能ごと廃止): 図面からは足さない');
}

console.log('\n【古い形式(v1)のファイル・ページが無いファイル】');
{
  cur();
  const r = sb.appendProjectData({ elements: [{ type: 'k', x: 1, y: 1, layer: '回路' }], wires: [{ pts: [{ x: 0, y: 0 }, { x: 9, y: 9 }] }] });
  ok(r.added === 1 && sb.state.pages.length === 2 && sb.state.pages[1].elements[0].id && sb.state.pages[1].wires[0].id, 'v1形式は今の形に直して足す(IDも付く)');
  cur();
  let err = ''; try { sb.appendProjectData({ version: 2, pages: [] }); } catch (e) { err = e.message; }
  ok(/ページがありません/.test(err) && sb.state.pages.length === 1, 'ページが無いファイルは何も足さずエラー');
}

console.log('\n【読込方法のダイアログ】');
{
  const btns = {}; let removed = false, keydown = null;
  const ov = { style: {}, set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; }, addEventListener() {}, remove() { removed = true; },
    querySelector: id => (btns[id] = btns[id] || { focused: false, focus() { this.focused = true; } }) };
  const doc = { createElement: () => ov, body: { appendChild() {} }, addEventListener: (t, f) => { keydown = f; }, removeEventListener() {} };
  const sb2 = { document: doc, String };
  vm.createContext(sb2);
  vm.runInContext(pick(/function _askLoadMode\([\s\S]*?\n\}\n/), sb2);
  let got = [];
  sb2.window = {}; sb2._askLoadMode({ name: 'a<b>.json', filePages: 3, curPages: 2 }, m => got.push(m));
  ok(/a&lt;b&gt;\.json/.test(ov.innerHTML) && /3ページ/.test(ov.innerHTML) && /2ページ/.test(ov.innerHTML), 'ファイル名(エスケープ済み)・ページ数を出す');
  ok(/置き換える/.test(ov.innerHTML) && /後ろにページとして追加/.test(ov.innerHTML) && /キャンセル/.test(ov.innerHTML), '3つの選択肢がある');
  btns['#lm-append'].onclick(); ok(got.join() === 'append' && removed, '「追加」で cb(append) を呼び、ダイアログを閉じる');
  removed = false; btns['#lm-replace'].onclick(); ok(got.join() === 'append,replace' && removed, '「置き換える」で cb(replace)');
  removed = false; btns['#lm-cancel'].onclick(); ok(got.length === 2 && removed, '「キャンセル」は何も呼ばずに閉じる');
  removed = false; keydown({ key: 'Escape', stopPropagation() {} }); ok(got.length === 2 && removed, 'Escapeもキャンセル');
}

console.log('\n【呼び出し側】');
{
  ok(/_askLoadMode\(\{ name: f\.name/.test(edit) && /mode === 'append'/.test(edit) && /appendProjectData\(d\)/.test(edit), 'loadProject が、選ばれた方法で置き換え／追加を呼び分ける');
  ok(/const \{ fixedIds, zeroWires \} = applyProjectData\(d\)/.test(edit), '置き換えは従来どおり applyProjectData');
  ok(/const cur = state\.page, wasDirty = cur\.dirty;\s*pushH\(\);\s*cur\.dirty = wasDirty;/.test(edit), '追加では今のページに未保存マークを付けない');
  const backup = fs.readFileSync(__dirname + '/../js/backup.js', 'utf8');
  ok(/applyProjectData\(j\.data\)/.test(backup), 'バックアップの復元は、これまでどおり置き換え(applyProjectData)');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
