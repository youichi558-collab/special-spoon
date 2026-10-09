// 自動保存・バックアップが止まったことを、画面の上の赤い帯にも出す(2026-10-09)
//   node tests/test_save_fail_banner.js
//
// 【背景】外部のレビュー「保存失敗時にユーザーが確実に気付けるか」。調べると、止まった知らせは
// 下のバーの案内の欄(#s-hint)に1回書くだけで、その欄は F8 の直交・コピーの終わり・割り当ての案内など
// 30か所あまりから書き換えられる。書き換わると、止まっていることに気づけなかった
// (自動保存は止まると二度と知らせない。バックアップは同じ失敗を二度書かない)。
// 盛田さん「その案で進めて」→ 止まった知らせは state.js の showTopBanner(部品DBが読めないときと同じ赤い帯)にも出す。
//   ・自動保存: 止まったらリロードするまで止まったままなので、帯も消さない
//   ・バックアップ: 次に取れたら消す。バックアップを切っても消す
//   ・止まったわけではない知らせ(前回の作業を自動復元しました 等)は帯にしない
//   ・自動保存データが壊れていて復元できなかったときは、別の帯(autosave-broken-banner)。図面を開いたら消す(盛田さん「赤い帯でいい」)
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const stateSrc = R('js/state.js');
const showTopBannerSrc = stateSrc.match(/function showTopBanner\([\s\S]*?\n\}/)[0];

// 画面のスタブ。#s-hint と、赤い帯の置き場所(#banner-area)だけ持つ
function makeDoc() {
  const hint = { textContent: '' };
  const nodes = {};   // id → 帯
  const doc = {
    hint, nodes,
    getElementById: id => id === 's-hint' ? hint : id === 'banner-area' ? area : (nodes[id] || null),
    createElement: () => { const el = { style: {}, setAttribute() {}, remove() { delete nodes[el.id]; } }; return el; },
    addEventListener() {},
  };
  const area = { appendChild: el => { nodes[el.id] = el; } };
  return doc;
}
const banner = (doc, id) => doc.nodes[id] ? doc.nodes[id].textContent : null;

function makeLS(init, opts) {
  const store = Object.assign({}, init);
  return {
    store,
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (opts && opts.quota && k === 'ecad_autosave') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = String(v);
    },
    removeItem: k => { delete store[k]; },
  };
}
const PAGE = n => ({ elements: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, type: 'fline' })), wires: [], guides: [], groups: [] });

// ---- 自動保存 ---------------------------------------------------------------
function autosaveSandbox(pages, lsInit, lsOpts) {
  const doc = makeDoc();
  const sb = {
    // わざと失敗させるので console.error は出さない
    console: { ...console, error() {} }, localStorage: makeLS(lsInit, lsOpts), document: doc, window: { addEventListener() {} },
    state: { pages, currentPage: 0, zoom: 1, pan: { x: 0, y: 0 }, darkMode: false, saveFileName: '', customSymbols: [], customParts: [], wireNoRule: {} },
    LAYERS: [], DEFS: {}, _syncCurrentPage() {}, setTimeout: fn => fn(), clearTimeout() {},
  };
  vm.createContext(sb);
  vm.runInContext(showTopBannerSrc, sb);
  vm.runInContext(R('js/autosave.js'), sb);
  return { sb, doc };
}
const AS = 'autosave-banner';

console.log('【自動保存: 容量超過で止まったら赤い帯が出て、案内の欄が書き換わっても残る】');
{
  const { sb, doc } = autosaveSandbox([PAGE(3)], {}, { quota: true });
  sb.doAutosave();
  ok(/容量超過で停止/.test(banner(doc, AS) || ''), '帯に「容量超過で停止」が出る');
  ok(/容量超過で停止/.test(doc.hint.textContent), '下のバーの案内の欄にも今まで通り出る');
  doc.hint.textContent = '';   // F8 で直交を切ったとき等(js/input.js toggleOrtho)
  sb.doAutosave();             // 止まったあとは何もしない(二度と知らせない)
  ok(doc.hint.textContent === '', '(前提)止まったあとは案内の欄に二度と書かない');
  ok(/容量超過で停止/.test(banner(doc, AS) || ''), '★案内の欄が消えても、帯は残る');
}

console.log('【自動保存: 容量超過以外の失敗でも帯が出る】');
{
  const { sb, doc } = autosaveSandbox([PAGE(3)], {});
  sb.localStorage.setItem = () => { throw new Error('書けない'); };
  sb.doAutosave();
  ok(/失敗したため停止/.test(banner(doc, AS) || '') && /書けない/.test(banner(doc, AS)), '帯に「失敗したため停止」と理由が出る');
}

console.log('【自動保存: JS が読み込めていないとき・前回を復元できなかったとき】');
{
  const { sb, doc } = autosaveSandbox([PAGE(3)], {});
  vm.runInContext("_asMissingScripts = () => ['frame.js']", sb);
  sb.doAutosave();
  ok(/JSが読み込めていない/.test(banner(doc, AS) || '') && /frame\.js/.test(banner(doc, AS)), 'JS が欠けたときは帯にファイル名と一緒に出る');
}
{
  const { sb, doc } = autosaveSandbox([PAGE(3)], {});
  vm.runInContext('_asRestoreFailed = true; _asBlockedCount = 7;', sb);
  sb.doAutosave();
  ok(/復元できなかったため自動保存を停止/.test(banner(doc, AS) || ''), '前回を復元できなかったときは帯が出る');
}
{
  // 読めるデータなのに、復元の途中で落ちた(コードの不具合のとき)
  const stored = JSON.stringify({ version: 2, pages: [PAGE(4)] });
  const { sb, doc } = autosaveSandbox([PAGE(0)], { ecad_autosave: stored });
  sb.stripLegacyColors = () => { throw new Error('わざと'); };
  sb.restoreAutosave();
  ok(/復元処理でエラー/.test(banner(doc, AS) || ''), '復元処理で落ちたときも帯が出る');
  ok(sb.localStorage.getItem('ecad_autosave') === stored, '(前提)保存済みのデータには触らない');
}

console.log('【自動保存: データが壊れていて復元できなかったら、別の赤い帯を出し、図面を開いたら消す】');
{
  const { sb, doc } = autosaveSandbox([PAGE(0)], { ecad_autosave: '{"version":2,"pages":[壊れ', ecad_autosave_prev: JSON.stringify({ version: 2, pages: [PAGE(4)] }) });
  sb.restoreAutosave();
  const t = banner(doc, 'autosave-broken-banner') || '';
  ok(/壊れていたため/.test(t), '★壊れていたら帯が出る(盛田さん「赤い帯でいい」)');
  ok(/設定 → バックアップ/.test(t) && /図面ファイルを開いて/.test(t), '★自分で開き直す先(バックアップ・図面ファイル)を帯に書く');
  ok(banner(doc, AS) === null, '自動保存は止まっていないので、止まった帯は出さない');
  ok(sb.localStorage.getItem('ecad_autosave_broken') === '{"version":2,"pages":[壊れ', '(前提)壊れたデータは消さずに退避してある');
  ok(!!sb.localStorage.getItem('ecad_autosave_prev'), '(前提)1つ前の版も消えずに残る');
  // 図面を開いたら(ファイル・バックアップのどちらも js/edit.js applyProjectData を通る)帯は消える
  const edit = R('js/edit.js');
  const ap = edit.match(/function applyProjectData\([\s\S]*?\n\}/)[0];
  const noop = () => 0;
  Object.assign(sb, { stripLegacyColors: noop, repairLayers: noop, dedupeIds: noop, removeZeroLengthWires: noop, pruneGroups: noop,
    _mergeOrSetCustomParts: noop, renderSymFloat: noop, renderPartsAll: noop, renderPageTabs: noop, draw: noop, updateRightPanel: noop });
  sb.state.sel = { els: new Set(), wires: new Set() };
  vm.runInContext(ap, sb);
  sb.applyProjectData({ version: 2, pages: [PAGE(2)] });
  ok(banner(doc, 'autosave-broken-banner') === null, '★図面を開いたら「壊れていた」の帯は消える');
}
{
  // 止まった帯は、図面を開いても消さない(自動保存は止まったまま)
  const { sb, doc } = autosaveSandbox([PAGE(3)], {}, { quota: true });
  sb.doAutosave();
  const ap = R('js/edit.js').match(/function applyProjectData\([\s\S]*?\n\}/)[0];
  const noop = () => 0;
  Object.assign(sb, { stripLegacyColors: noop, repairLayers: noop, dedupeIds: noop, removeZeroLengthWires: noop, pruneGroups: noop,
    _mergeOrSetCustomParts: noop, renderSymFloat: noop, renderPartsAll: noop, renderPageTabs: noop, draw: noop, updateRightPanel: noop });
  sb.state.sel = { els: new Set(), wires: new Set() };
  vm.runInContext(ap, sb);
  sb.applyProjectData({ version: 2, pages: [PAGE(2)] });
  ok(/容量超過で停止/.test(banner(doc, AS) || ''), '止まった帯は、図面を開いても消えない');
}

console.log('【自動保存: 止まっていないときは帯を出さない】');
{
  const { sb, doc } = autosaveSandbox([PAGE(3)], {});
  sb.doAutosave();
  ok(banner(doc, AS) === null, '普通に保存できたときは帯なし');
}
{
  const stored = JSON.stringify({ version: 2, pages: [PAGE(4)] });
  const { sb, doc } = autosaveSandbox([PAGE(0)], { ecad_autosave: stored });
  sb.restoreAutosave();
  ok(/前回の作業を自動復元しました/.test(doc.hint.textContent) && banner(doc, AS) === null, '「前回の作業を自動復元しました」は案内の欄だけ(帯にしない)');
}
{
  const good = JSON.stringify({ version: 2, pages: [PAGE(5)] });
  const { sb, doc } = autosaveSandbox([PAGE(0)], { ecad_autosave: good });
  sb.doAutosave();
  ok(/中止/.test(doc.hint.textContent) && banner(doc, AS) === null, '図面が空で中止したとき(止まってはいない)は案内の欄だけ');
}

// ---- バックアップ ------------------------------------------------------------
function backupSandbox(conf) {
  const doc = makeDoc();
  const sb = {
    console, JSON, Date, document: doc,
    localStorage: makeLS(conf ? { ecad_backup_conf: JSON.stringify(conf) } : {}),
    state: { pages: [PAGE(3)], currentPage: 0, saveFileName: '図面', wireNoRule: {}, customSymbols: [] },
    LAYERS: [], fetch: null,
  };
  vm.createContext(sb);
  vm.runInContext(showTopBannerSrc, sb);
  vm.runInContext(R('js/backup.js'), sb);
  return { sb, doc };
}
const BK = 'backup-banner';
const down = () => Promise.reject(new Error('Failed to fetch'));
const up = () => Promise.resolve({ json: () => Promise.resolve({ ok: true, file: 'x.json', deleted: [] }) });

(async () => {
  console.log('\n【バックアップ: 取れないと帯が出て、案内の欄が書き換わっても残り、取れたら消える】');
  {
    const { sb, doc } = backupSandbox();
    sb.fetch = down;
    let r = await sb.bkRun(true);
    ok(r.reason === 'error' && /バックアップを取れませんでした/.test(banner(doc, BK) || ''), '取れないと帯が出る');
    ok(/start\.bat/.test(banner(doc, BK)), '帯に start.bat を確かめる案内がある');
    doc.hint.textContent = '';
    sb.state.pages[0].elements.push({ id: 'n', type: 'fline' });
    r = await sb.bkRun(true);   // 同じ失敗をもう一度
    ok(doc.hint.textContent === '', '(前提)同じ失敗は案内の欄に二度書かない');
    ok(/バックアップを取れませんでした/.test(banner(doc, BK) || ''), '★案内の欄が消えても、帯は残る');
    sb.fetch = up;
    r = await sb.bkRun(true);
    ok(r.save === true && banner(doc, BK) === null, '★次に取れたら帯が消える');
  }
  {
    const { sb, doc } = backupSandbox();
    sb.fetch = down;
    await sb.bkRun(true);
    ok(banner(doc, BK) !== null, '(前提)失敗の帯が出ている');
    sb.localStorage.setItem('ecad_backup_conf', JSON.stringify({ enabled: false, intervalMin: 10, keep: 30 }));
    await sb.bkRun(false);
    ok(banner(doc, BK) === null, '★バックアップを切ったら、前の失敗の帯は消える');
  }
  {
    const { sb, doc } = backupSandbox();
    sb.fetch = up;
    await sb.bkRun(true);
    ok(banner(doc, BK) === null, '普通に取れたときは帯なし');
  }
  {
    // 自動保存とバックアップの帯は別々(片方が直っても、もう片方を消さない)
    const doc = makeDoc();
    const sb = { document: doc };
    vm.createContext(sb);
    vm.runInContext(showTopBannerSrc, sb);
    sb.showTopBanner(AS, 'A'); sb.showTopBanner(BK, 'B'); sb.showTopBanner(BK, '');
    ok(banner(doc, AS) === 'A' && banner(doc, BK) === null, '自動保存の帯とバックアップの帯は別に出し消しする');
  }

  console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
  process.exit(ng ? 1 : 0);
})();
