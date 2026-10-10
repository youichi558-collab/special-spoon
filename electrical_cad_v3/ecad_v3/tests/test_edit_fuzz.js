// 実際の図面に編集をランダムな順番で何百回もかけて、データが壊れないかを見る(2026-10-10)
//   node tests/test_edit_fuzz.js            … 決まった種で回す(run_all.js から)
//   node tests/test_edit_fuzz.js 12345 2000 … 種と回数を指定して回す(落ちたときの再現・長く回すとき)
//
// 【背景】外部のレビューで「編集を繰り返してもデータが壊れず、保存・復元まで一貫するか」が挙がった。
// 部品ごとのテストはあるが、操作を混ぜて重ねるテストが無かった。盛田さん「そのテストを作って」。
// 未再現のまま残っている「保存/出力時に図形が1個だけ壊れる」(HANDOFF_詳細.md)の手がかりにもなる。
//
// 動かすもの(どれも本物のコード。js/state.js・js/sym_store.js・js/edit.js をそのまま読み込む):
//   キー操作 … edit.js が登録した keydown の処理にそのまま渡す
//              矢印(移動)・Delete・r(回転)・h/v(反転)・Ctrl+C/X(コピー/切り取り)・Ctrl+G/Ctrl+Shift+G(グループ/解除)・
//              Ctrl+Z/Y(Undo/Redo)・Ctrl+A(全選択)
//   貼り付け … Ctrl+V のあと、クリックで確定するのと同じ commitPaste(dx, dy)(js/input.js から呼ばれるもの)
//   分解     … explodeSelected
//   保存と開き直し … _saveData → _saveJSON → JSON.parse → applyProjectData
//
// 毎回の操作のあとに見ること(壊れていないこと):
//   ①図形・配線の ID が重複しない ②グループが、無い図形・配線を指していない ③図形・配線のレイヤーが LAYERS にある
//   ④座標に NaN・undefined が無い ⑤配線は2点以上で、x1/y1・x2/y2 が端の点と同じ
// 区切りごとに見ること:
//   ⑥Undo を最後まで押すと、区切りの最初の状態にぴったり戻る ⑦そこから Redo を全部押すと、区切りの最後の状態にぴったり戻る
//   ⑧保存して開き直しても中身が変わらない
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SEED = Number(process.argv[2]) || 20261010;
const STEPS = Number(process.argv[3]) || 600;
const ROUND = 60;   // 区切りの長さ(Undo は 80 回分まで持つので、それより短くする)

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

// ---- 画面のスタブ -------------------------------------------------------------
const keyHandlers = [];
const dummyEl = () => ({ textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
const hint = dummyEl();
const document = {
  readyState: 'loading',
  addEventListener: (t, f) => { if (t === 'keydown') keyHandlers.push(f); },
  getElementById: id => id === 's-hint' ? hint : null,   // 案内の欄だけある(ほかの部品は無い扱い)
  querySelectorAll: () => [],
  activeElement: { tagName: 'BODY' },
  body: dummyEl(),
};
const noop = () => {};
const sb = {
  console: { ...console, warn: noop, log: noop },   // 修復の知らせ(dedupeIds 等)は出さない
  document, window: undefined,
  draw: noop, updateRightPanel: noop, renderPageTabs: noop, updateResizeHandles: noop, renderSymFloat: noop, renderPartsAll: noop,
  syncModeButtons: noop, updateHint: noop, setMode: noop,
  confirm: () => true, alert: noop, prompt: () => null,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  setTimeout: noop, fetch: () => Promise.reject(new Error('no server')),
  LAYERS: [], DEFS: {},
};
vm.createContext(sb);
// 乱数を種つきにする(genId の乱数部も含めて、同じ種なら同じ操作の順番になる)
vm.runInContext(`(() => { let s = ${SEED} >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();`, sb);
vm.runInContext(R('js/state.js'), sb);
vm.runInContext(R('js/sym_store.js'), sb);
vm.runInContext(R('js/edit.js'), sb);
vm.runInContext('this.__state = state;', sb);
const S = () => sb.__state;
const rnd = () => vm.runInContext('Math.random()', sb);
const pickOne = a => a[Math.floor(rnd() * a.length)];

function key(k, mods) {
  const e = Object.assign({ key: k, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, preventDefault: noop }, mods || {});
  keyHandlers.forEach(f => f(e));
}

// ---- 壊れていないかを見る ------------------------------------------------------
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const COORD = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'cx', 'cy', 'bx', 'by'];
function problems() {
  const out = [];
  const layers = new Set(sb.LAYERS.map(l => l.name));
  const allEl = new Set(), allW = new Set();
  S().pages.forEach((pg, pi) => {
    const els = pg.elements || [], ws = pg.wires || [];
    els.forEach(e => {
      if (!e.id) out.push(`p${pi} id の無い図形`);
      else if (allEl.has(e.id)) out.push(`p${pi} 図形の ID が重複 ${e.id}`); else allEl.add(e.id);
      if (!layers.has(e.layer)) out.push(`p${pi} 図形 ${e.id} のレイヤー「${e.layer}」が無い`);
      COORD.forEach(k => { if (k in e && e[k] != null && !isNum(e[k])) out.push(`p${pi} 図形 ${e.id} の ${k}=${e[k]}`); });
    });
    ws.forEach(w => {
      if (!w.id) out.push(`p${pi} id の無い配線`);
      else if (allW.has(w.id)) out.push(`p${pi} 配線の ID が重複 ${w.id}`); else allW.add(w.id);
      if (!layers.has(w.layer)) out.push(`p${pi} 配線 ${w.id} のレイヤー「${w.layer}」が無い`);
      const pts = w.pts || [];
      if (pts.length < 2) out.push(`p${pi} 配線 ${w.id} の点が ${pts.length} 個`);
      if (pts.some(p => !isNum(p.x) || !isNum(p.y))) out.push(`p${pi} 配線 ${w.id} の点に数でないものがある`);
      if (pts.length >= 2) {
        const a = pts[0], b = pts[pts.length - 1];
        if (w.x1 !== a.x || w.y1 !== a.y || w.x2 !== b.x || w.y2 !== b.y) out.push(`p${pi} 配線 ${w.id} の x1/y1・x2/y2 が端の点と違う`);
      }
    });
    const elIds = new Set(els.map(e => e.id)), wIds = new Set(ws.map(w => w.id));
    (pg.groups || []).forEach(g => {
      (g.elIds || []).forEach(id => { if (!elIds.has(id)) out.push(`p${pi} グループ ${g.id} が無い図形 ${id} を指している`); });
      (g.wireIds || []).forEach(id => { if (!wIds.has(id)) out.push(`p${pi} グループ ${g.id} が無い配線 ${id} を指している`); });
    });
  });
  return out;
}
// 比べる中身(未保存の印 dirty は Undo で戻すものではないので外す)
const snapPages = () => JSON.stringify(S().pages.map(({ dirty, ...pg }) => pg));

// 違うときに、どこが違うかを1か所だけ出す
function firstDiff(a, b, p) {
  p = p || '';
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], p + '.' + k); if (d) return d; }
  }
  return `${p || '(全体)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`.slice(0, 300);
}
// ---- 操作 ---------------------------------------------------------------------
function selectRandom() {
  const st = S(); st.sel.els.clear(); st.sel.wires.clear();
  const n = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.6 && st.elements.length) st.sel.els.add(pickOne(st.elements).id);
    else if (st.wires.length) st.sel.wires.add(pickOne(st.wires).id);
  }
  // グループの一部を選んだら、画面と同じくグループ全体に広げる(js/edit.js expandSelToGroups)
  if (typeof sb.expandSelToGroups === 'function' && rnd() < 0.7) sb.expandSelToGroups();
}
const OPS = {
  '移動':   () => key(pickOne(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']), { shiftKey: rnd() < 0.5 }),
  '削除':   () => key('Delete'),
  '回転':   () => key('r'),
  '左右反転': () => key('h'),
  '上下反転': () => key('v'),
  'コピー貼り付け': () => { key('c', { ctrlKey: true }); key('v', { ctrlKey: true }); if (S().mode === 'paste') sb.commitPaste(Math.round(rnd() * 200 - 100), Math.round(rnd() * 200 - 100)); },
  '切り取り貼り付け': () => { key('x', { ctrlKey: true }); key('v', { ctrlKey: true }); if (S().mode === 'paste') sb.commitPaste(Math.round(rnd() * 40 - 20), Math.round(rnd() * 40 - 20)); },
  'グループ': () => key('g', { ctrlKey: true }),
  'グループ解除': () => key('g', { ctrlKey: true, shiftKey: true }),
  '分解':   () => sb.explodeSelected(),
};
const OP_NAMES = Object.keys(OPS);

// ---- 図面を開く ---------------------------------------------------------------
function openDrawing(d) {
  S().hist = []; S().redoHist = []; S().clipboard = null; S().mode = 'select';
  S().sel.els.clear(); S().sel.wires.clear();
  sb.applyProjectData(JSON.parse(JSON.stringify(d)));
}
function saveAndReopen() {
  const text = sb._saveJSON(sb._saveData(S().pages, S().saveFileName));
  const hist = S().hist, redo = S().redoHist;
  sb.applyProjectData(JSON.parse(text));
  S().hist = hist; S().redoHist = redo;   // 開き直しは Undo の外(画面の「開く」でも履歴は別)
}

const DRAWINGS = fs.readdirSync(path.join(ROOT, 'drawings')).filter(f => /\.(json|seqzu)$/i.test(f)).sort();
ok(DRAWINGS.length > 0, `drawings/ に図面がある(${DRAWINGS.join('、')})`);
console.log(`  種 ${SEED}・操作 ${STEPS} 回(${ROUND} 回ごとに Undo/Redo と保存を確かめる)`);

for (const f of DRAWINGS) {
  console.log(`\n【${f}】`);
  openDrawing(JSON.parse(R('drawings/' + f)));
  const p0 = problems();
  ok(p0.length === 0, '開いた直後に壊れている所が無い' + (p0.length ? `\n       ${p0.slice(0, 5).join('\n       ')}` : ''));

  const counts = {}; const log = [];
  let firstBad = null, undoBad = null, redoBad = null, saveBad = null;
  for (let done = 0; done < STEPS && !firstBad; ) {
    const n = Math.min(ROUND, STEPS - done);
    S().hist = []; S().redoHist = [];
    const start = snapPages();
    let pushed = 0;
    for (let i = 0; i < n; i++, done++) {
      selectRandom();
      const op = pickOne(OP_NAMES);
      const before = S().hist.length;
      OPS[op]();
      if (S().hist.length > before) pushed += S().hist.length - before;
      counts[op] = (counts[op] || 0) + 1;
      log.push(`${done + 1}: ${op}`);
      const p = problems();
      if (p.length) { firstBad = { at: done + 1, op, p }; break; }
    }
    if (firstBad) break;
    // ⑥⑦ Undo で区切りの最初まで戻り、Redo で最後まで戻る
    const end = snapPages();
    const undos = S().hist.length;
    for (let i = 0; i < undos; i++) key('z', { ctrlKey: true });
    if (!undoBad && snapPages() !== start) undoBad = `操作 ${done - n + 1}〜${done} の区切り(Undo ${undos} 回)`;
    for (let i = 0; i < undos; i++) key('y', { ctrlKey: true });
    if (!redoBad && snapPages() !== end) redoBad = `操作 ${done - n + 1}〜${done} の区切り(Redo ${undos} 回)`;
    // ⑧ 保存して開き直す
    const beforeSave = snapPages();
    saveAndReopen();
    if (!saveBad && snapPages() !== beforeSave) saveBad = `操作 ${done} 回目のあと。違い(前 → 後) ${firstDiff(JSON.parse(beforeSave), JSON.parse(snapPages()))}`;
    const p = problems();
    if (p.length) firstBad = { at: done, op: '保存して開き直す', p };
  }

  const pg = S().pages[0];
  console.log('  やった操作:', OP_NAMES.map(k => `${k}${counts[k] || 0}`).join(' '), `/ 最後の図形 ${pg.elements.length}・配線 ${pg.wires.length}・グループ ${(pg.groups || []).length}`);
  ok(!firstBad, `①〜⑤ 操作を重ねても壊れない(${STEPS} 回)` + (firstBad
    ? `\n       ${firstBad.at} 回目「${firstBad.op}」で: ${firstBad.p.slice(0, 5).join(' / ')}\n       直前の操作: ${log.slice(-8).join(' → ')}\n       再現: node tests/test_edit_fuzz.js ${SEED} ${firstBad.at}`
    : ''));
  ok(!undoBad, '⑥ Undo を最後まで押すと、区切りの最初の状態にぴったり戻る' + (undoBad ? `\n       ${undoBad}` : ''));
  ok(!redoBad, '⑦ Redo を全部押すと、区切りの最後の状態にぴったり戻る' + (redoBad ? `\n       ${redoBad}` : ''));
  ok(!saveBad, '⑧ 区切りごとに保存して開き直しても、中身が変わらない' + (saveBad ? `\n       ${saveBad}` : ''));
}

console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
