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
//     違っていれば知らせて「ライブラリへ反映／そのまま」を選んでもらう(checkDrawingSymbolsVsLibrary)。
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
  _symCheckSig = '';
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

// ---- 図面とライブラリの違い(盛田さんの決定(3)) -------------------------
// 図面の中のシンボルがライブラリと違う・ライブラリに無いとき、知らせて「ライブラリへ反映／そのまま」を選ぶ。
// 使うのはどちらを選んでも図面の中のもの。同じ図面で同じ違いは1度だけ聞く。
let _symCheckSig = '';
function _symCanon(s) {
  const pick = { name: s.name, label: s.label, cat: s.cat, role: s.role || '', w: s.w, h: s.h, shapes: s.shapes || [], terminals: s.terminals || [] };
  const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
    : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
    : JSON.stringify(v === undefined ? null : v);
  return stable(pick);
}
function checkDrawingSymbolsVsLibrary() {
  if (!_symLibReady() || typeof document === 'undefined' || !document.body) return;
  const lib = _symLibObj(), drawing = state.drawingSymbols || {};
  const diff = [], missing = [];
  Object.keys(drawing).forEach(t => {
    if (!(t in lib)) missing.push(t);
    else if (_symCanon(lib[t]) !== _symCanon(drawing[t])) diff.push(t);
  });
  if (!diff.length && !missing.length) return;
  const sig = diff.join(',') + '|' + missing.join(',');
  if (sig === _symCheckSig) return;
  _symCheckSig = sig;
  const nm = t => escH(drawing[t].label || drawing[t].name || t);
  const ov = document.createElement('div');
  ov.id = 'sym-diff';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100001;display:flex;align-items:center;justify-content:center';
  ov.innerHTML = '<div style="background:var(--bg2,#2a2a2a);color:var(--fg,#ddd);border:1px solid var(--bd2,#444);border-radius:6px;'
    + 'box-shadow:0 4px 20px rgba(0,0,0,.5);padding:14px 16px;max-width:600px;font-size:12px;line-height:1.6">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:6px">図面のシンボルがライブラリと違います</div>'
    + '<div>この図面では、図面の中に入っているシンボルを使います。</div>'
    + (diff.length ? `<div style="margin-top:6px">・ライブラリと形・端子が違う ${diff.length}件: ${diff.map(nm).join('、')}</div>` : '')
    + (missing.length ? `<div style="margin-top:6px">・ライブラリに無い ${missing.length}件: ${missing.map(nm).join('、')}</div>` : '')
    + '<div style="font-size:11px;color:var(--fg3,#999);margin-top:6px">「ライブラリへ反映」で図面の中のものをライブラリに保存します(上書きする前のライブラリはバックアップに残ります)。</div>'
    + '<div style="text-align:right;margin-top:10px;display:flex;gap:6px;justify-content:flex-end">'
    + '<button class="fp-btn" id="sym-diff-keep">そのまま</button>'
    + '<button class="fp-btn primary" id="sym-diff-apply">ライブラリへ反映</button></div></div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  document.getElementById('sym-diff-keep').onclick = close;
  document.getElementById('sym-diff-apply').onclick = async () => {
    close();
    const ok = await _symLibWrite(o => { diff.concat(missing).forEach(t => { o[t] = drawing[t]; }); return o; });
    if (ok) alert(`ライブラリへ反映しました（${diff.length + missing.length}件）`);
  };
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['sym_store.js'] = 1;
