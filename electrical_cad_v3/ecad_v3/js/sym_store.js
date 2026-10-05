// ================================================================
// sym_store.js — 登録シンボルの置き場所(2026-10-03 再設計の段階3)
//
// 以前はブラウザの中(localStorage の ecad_customSymbols)が正で、図面ファイルには
// その時のシンボル一覧が丸ごと入っていた。別のPCでは使えず、ブラウザのデータを消すと無くなった。
// 今はライブラリフォルダの symbols.json が正(js/library.js の 'symbols'。{type: 定義}、キーの順がパレットの並び)。
//
// ■ パレット(state.customSymbols)の中身 = rebuildSymbolPalette()
//     ライブラリ(並びはライブラリの順) ＋ 図面の中のシンボル ＋ ブラウザの中にだけ残っている旧データ
//     同じ type が図面とライブラリの両方にあれば**図面の中を使う**(盛田さんの決定(3)・2026-10-03)。
//     違っていても開いたときには聞かない(2026-10-05。窓がループしたため)。揃えたいときは symCompareDialog(シンボルパネルの「登録シンボルと比べる」)
// ■ 書き込み(登録・サイズ調整・端子の編集・削除・並べ替え・読込)= symStorePut / symStoreDelete / symStoreReorder
//     ライブラリへ保存する。**ライブラリが読めていない間は、従来どおりブラウザの中に保存する**
//     (登録したシンボルを閉じたら消える、を作らない)。ライブラリが読めたら「移しますか？」で移せる。
// ■ 図面ファイルに入れるのは、図面で使っているシンボルだけ(usedSymbolsForSave。原則③)
// ================================================================
const SYM_LEGACY_KEY = 'ecad_customSymbols';

function _symLibObj() { return (typeof ecadLib !== 'undefined') ? ecadLib.get('symbols') : {}; }
function _symLibReady() { return typeof ecadLib !== 'undefined' && ecadLib.isReady('symbols'); }
function _symLegacyArr() {
  try { const a = JSON.parse(localStorage.getItem(SYM_LEGACY_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function _symTypesUsed(pages) {
  const used = new Set();
  (pages || []).forEach(pg => (pg.elements || []).forEach(e => { if (e && e.type) used.add(e.type); }));
  return used;
}

// 図面ファイルに入れるシンボル(図面で使っているものだけ)
function usedSymbolsForSave(pages) {
  const used = _symTypesUsed(pages);
  return (state.customSymbols || []).filter(s => s && used.has(s.type));
}

// パレットを組み直す。図面を開いたとき・ライブラリを読んだとき・ライブラリへ書いたときに呼ぶ
function rebuildSymbolPalette() {
  const used = _symTypesUsed(state.pages);
  const drawing = Object.assign({}, state.drawingSymbols || {});
  // 今の図面で使っている定義は、どこから来たものでも手放さない(置いた要素が描けなくならないように)
  (state.customSymbols || []).forEach(s => { if (s && used.has(s.type) && !(s.type in drawing)) drawing[s.type] = s; });
  const lib = _symLibObj();
  const list = [], seen = new Set();
  const add = s => { if (s && s.type && !seen.has(s.type)) { seen.add(s.type); list.push(s); } };
  Object.keys(lib).forEach(t => add(drawing[t] || lib[t]));   // 図面の中が正
  Object.keys(drawing).forEach(t => add(drawing[t]));
  // ブラウザの中の旧データは、まだライブラリへ移していないものだけ(移したものは、ライブラリから消したら出さない)
  const moved = (typeof ecadLib !== 'undefined') ? ecadLib.migrated('symbols') : new Set();
  _symLegacyArr().forEach(s => { if (s && !moved.has(s.type)) add(s); });
  state.customSymbols = list;
  if (typeof DEFS !== 'undefined') list.forEach(s => { DEFS[s.type] = s; });
  if (typeof renderSymFloat === 'function') { try { renderSymFloat(); } catch (e) {} }
}

// 図面を開いたときに図面のシンボルを覚えておく(applyProjectData・自動保存からの復元)
function setDrawingSymbols(arr) {
  state.drawingSymbols = {};
  (arr || []).forEach(s => { if (s && s.type) state.drawingSymbols[s.type] = s; });
}

// ---- 書き込み ---------------------------------------------------------
function _symLegacyWrite(fn) {
  const arr = fn(_symLegacyArr());
  try {
    localStorage.setItem(SYM_LEGACY_KEY, JSON.stringify(arr));
  } catch (e) {
    alert('登録シンボルを保存できませんでした'
      + (e && e.name === 'QuotaExceededError' ? '（ブラウザの保存容量が一杯です）' : `（${e && e.message || e}）`)
      + '。設定タブの「部品DB」でライブラリフォルダを設定すると、ライブラリに保存できます');
    return false;
  }
  if (typeof ecadLib !== 'undefined') ecadLib.resetMigrationSkip();
  if (typeof showTopBanner === 'function') {
    showTopBanner('sym-save-banner', '⚠ ライブラリフォルダが読めていないため、登録シンボルをこのブラウザの中に保存しました。'
      + '設定タブの「部品DB」でライブラリフォルダを設定すると、ライブラリへ移せます');
  }
  return true;
}
async function _symLibWrite(fn) {
  const next = fn(Object.assign({}, _symLibObj()));
  const r = await ecadLib.save('symbols', next);   // 保存できたら(library.js の refreshViews で)パレットも組み直る
  if (!r.ok) { alert(r.error); return false; }
  if (typeof showTopBanner === 'function') showTopBanner('sym-save-banner', '');
  return true;
}

// 登録・変更(同じ type は置き換え、新しいものは末尾へ)
async function symStorePut(defs) {
  defs = (defs || []).filter(d => d && d.type);
  if (!defs.length) return true;
  // 図面で使っている定義も同じものに揃える(図面の中が正なので、直したらそちらも直す)
  defs.forEach(d => { if (state.drawingSymbols && d.type in state.drawingSymbols) state.drawingSymbols[d.type] = d; });
  let ok;
  if (_symLibReady()) {
    ok = await _symLibWrite(o => { defs.forEach(d => { o[d.type] = d; }); return o; });
  } else {
    ok = _symLegacyWrite(arr => { defs.forEach(d => { const i = arr.findIndex(x => x.type === d.type); if (i >= 0) arr[i] = d; else arr.push(d); }); return arr; });
    if (ok && typeof ecadLib !== 'undefined') ecadLib.unmarkMigrated('symbols', defs.map(d => d.type));   // 次に読めたら移す対象
    rebuildSymbolPalette();
  }
  return ok;
}

// 削除(図面で使っているものは、図面の中には残る)
async function symStoreDelete(type) {
  let ok;
  if (_symLibReady() && type in _symLibObj()) {
    ok = await _symLibWrite(o => { delete o[type]; return o; });
  } else {
    ok = _symLegacyWrite(arr => arr.filter(s => s.type !== type));
  }
  if (state.drawingSymbols && !_symTypesUsed(state.pages).has(type)) delete state.drawingSymbols[type];
  rebuildSymbolPalette();
  return ok;
}

// 並べ替え(パレットの今の並びをライブラリの順にする)
async function symStoreReorder() {
  const order = (state.customSymbols || []).map(s => s.type);
  if (_symLibReady()) {
    return _symLibWrite(o => { const n = {}; order.forEach(t => { if (t in o) n[t] = o[t]; }); Object.keys(o).forEach(t => { if (!(t in n)) n[t] = o[t]; }); return n; });
  }
  return _symLegacyWrite(arr => { const pos = t => { const i = order.indexOf(t); return i < 0 ? 1e9 : i; }; return arr.slice().sort((a, b) => pos(a.type) - pos(b.type)); });
}

// ---- 図面と登録シンボルの違い ------------------------------------------------
// 【2026-10-05 作り直し】以前(10-03 決定(3))は図面を開くたびに比べて「そのまま/ライブラリへ反映」の窓を出していた。
// 図面ファイルごとにシンボルの写しを持つので、A を開いて反映→B を開くとまた違う→反映→A を開くとまた…と**窓が終わらなかった**
// (盛田さん「違う図面を開くとループする」「ループ自体もなくせない」)。
// 今は**開いたときには何も聞かない**(図面は自分の中のシンボルで描くだけ・何も書き換えない)。揃えたいときだけ、
// シンボルパネルの「登録シンボルと比べる」(symCompareDialog)で違いの一覧を出し、シンボルごとに
// 「図面を登録シンボルに合わせる/登録シンボルを図面に合わせる/何もしない」を選ぶ(盛田さん「その案で進めて」)。
// 「登録シンボル」= ライブラリフォルダの symbols.json(シンボルライブラリ=JIS の DXF の画面とは別)
function _symCanon(s) {
  const pick = { name: s.name, label: s.label, cat: s.cat, role: s.role || '', w: s.w, h: s.h, shapes: s.shapes || [], terminals: s.terminals || [] };
  const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
    : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
    : JSON.stringify(v === undefined ? null : v);
  return stable(pick);
}
const _symJ = v => JSON.stringify(v == null ? null : v);
// 違いの一覧: [{ type, name, missing, what: ['形','端子の位置',…], termsMoved, placed }]
function symDiffList() {
  const lib = _symLibObj(), drawing = state.drawingSymbols || {};
  const placed = {};
  (state.pages || []).forEach(pg => (pg.elements || []).forEach(e => { if (e && e.type) placed[e.type] = (placed[e.type] || 0) + 1; }));
  const out = [];
  Object.keys(drawing).forEach(t => {
    const d = drawing[t], L = lib[t];
    const name = d.label || d.name || t;
    if (!L) { out.push({ type: t, name, missing: true, what: ['登録シンボルに無い'], termsMoved: false, placed: placed[t] || 0 }); return; }
    if (_symCanon(L) === _symCanon(d)) return;
    const pos = a => (a || []).map(x => [x.x, x.y]);
    const what = [];
    if (_symJ(d.shapes || []) !== _symJ(L.shapes || [])) what.push('形');
    const termsMoved = _symJ(pos(d.terminals)) !== _symJ(pos(L.terminals));
    if (termsMoved) what.push('端子の位置');
    else if (_symJ(d.terminals || []) !== _symJ(L.terminals || [])) what.push('端子の番号');
    if ((d.role || '') !== (L.role || '')) what.push('種別');
    if (d.w !== L.w || d.h !== L.h) what.push('大きさ');
    if (d.name !== L.name || d.label !== L.label || d.cat !== L.cat) what.push('名前・分類');
    out.push({ type: t, name, missing: false, what, termsMoved, placed: placed[t] || 0 });
  });
  return out;
}

// 選んだとおりに合わせる。toDrawing: 図面を登録シンボルに合わせる type / toLib: 登録シンボルを図面に合わせる(無ければ足す) type
async function symApplyChoices(toDrawing, toLib) {
  const lib = _symLibObj(), drawing = state.drawingSymbols || {};
  let ok = true;
  if (toLib.length) ok = await _symLibWrite(o => { toLib.forEach(t => { o[t] = drawing[t]; }); return o; });
  if (toDrawing.length) {
    toDrawing.forEach(t => { if (lib[t]) state.drawingSymbols[t] = JSON.parse(JSON.stringify(lib[t])); });
    (state.pages || []).forEach(pg => { if ((pg.elements || []).some(e => toDrawing.includes(e.type))) pg.dirty = true; });   // 保存で図面にも入る
    rebuildSymbolPalette();
    if (typeof renderPageTabs === 'function') renderPageTabs();
    if (typeof draw === 'function') draw();
  }
  return ok;
}

function symCompareDialog() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!_symLibReady()) { alert('登録シンボル(ライブラリフォルダの symbols.json)が読めていないので比べられません。設定タブの「部品DB」でライブラリフォルダを確かめてください'); return; }
  const list = symDiffList();
  if (!list.length) { alert('この図面のシンボルは、登録シンボルと同じです'); return; }
  const old = document.getElementById('sym-diff'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'sym-diff';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100001;display:flex;align-items:center;justify-content:center';
  const opt = r => r.missing
    ? `<option value="">何もしない</option><option value="lib">登録シンボルに足す</option>`
    : `<option value="">何もしない</option><option value="drawing">図面を登録シンボルに合わせる</option><option value="lib">登録シンボルを図面に合わせる</option>`;
  ov.innerHTML = '<div style="background:var(--bg2,#2a2a2a);color:var(--fg,#ddd);border:1px solid var(--bd2,#444);border-radius:6px;'
    + 'box-shadow:0 4px 20px rgba(0,0,0,.5);padding:14px 16px;max-width:760px;max-height:80vh;overflow:auto;font-size:12px;line-height:1.6">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:4px">この図面のシンボルと登録シンボルの違い</div>'
    + '<div style="font-size:11px;color:var(--fg3,#999);margin-bottom:6px">登録シンボル = ライブラリフォルダの symbols.json。図面は今、図面の中のシンボルで描いています。合わせたいものだけ選んでください。</div>'
    + '<table class="tbl" style="width:100%"><tr><th>シンボル</th><th>違い</th><th>この図面に置いた数</th><th>どうするか</th></tr>'
    + list.map((r, i) => `<tr><td>${escH(r.name)}</td><td>${escH(r.what.join('・'))}${r.termsMoved ? ' <span style="color:var(--red,#e55)">⚠</span>' : ''}</td>`
      + `<td style="text-align:right">${r.placed}</td><td><select data-i="${i}">${opt(r)}</select></td></tr>`).join('')
    + '</table>'
    + '<div style="font-size:11px;color:var(--fg3,#999);margin-top:6px">⚠ = 端子の位置が違う。「図面を登録シンボルに合わせる」と記号の端子が動き、<b>配線が端子から外れることがあります</b>。'
    + '図面を合わせたものは、取り消し(Ctrl+Z)では戻りません(保存しなければファイルはそのまま)。「登録シンボルを図面に合わせる」は上書きする前の登録シンボルがバックアップに残ります。</div>'
    + '<div style="text-align:right;margin-top:10px;display:flex;gap:6px;justify-content:flex-end">'
    + '<button class="fp-btn" id="sym-diff-close">閉じる</button>'
    + '<button class="fp-btn primary" id="sym-diff-apply">選んだとおりに合わせる</button></div></div>';
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  document.getElementById('sym-diff-close').onclick = close;
  document.getElementById('sym-diff-apply').onclick = async () => {
    const toDrawing = [], toLib = [];
    ov.querySelectorAll('select[data-i]').forEach(sel => {
      const r = list[+sel.dataset.i];
      if (sel.value === 'drawing') toDrawing.push(r.type); else if (sel.value === 'lib') toLib.push(r.type);
    });
    if (!toDrawing.length && !toLib.length) { close(); return; }
    const moved = list.filter(r => toDrawing.includes(r.type) && r.termsMoved && r.placed);
    if (moved.length && !confirm(`端子の位置が変わる記号があります:\n${moved.map(r => `・${r.name}(${r.placed}個)`).join('\n')}\n\n配線が端子から外れることがあります。取り消し(Ctrl+Z)では戻りません。\n合わせますか？`)) return;
    close();
    const ok = await symApplyChoices(toDrawing, toLib);
    if (ok) alert(`合わせました(図面を登録シンボルに ${toDrawing.length}件・登録シンボルを図面に ${toLib.length}件)`
      + (toDrawing.length ? '\n図面の方は保存すると図面ファイルに入ります' : ''));
  };
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['sym_store.js'] = 1;
