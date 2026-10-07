// ================================================================
// sym_store.js — 登録シンボルの置き場所(2026-10-03 再設計の段階3)
//
// 以前はブラウザの中(localStorage の ecad_customSymbols)が正で、図面ファイルには
// その時のシンボル一覧が丸ごと入っていた。別のPCでは使えず、ブラウザのデータを消すと無くなった。
// 今はライブラリフォルダの symbols.json が正(js/library.js の 'symbols'。{type: 定義}、キーの順がパレットの並び)。
//
// ■ パレット(state.customSymbols)の中身 = rebuildSymbolPalette()
//     ライブラリ(並びはライブラリの順) ＋ 図面の中のシンボル ＋ ブラウザの中にだけ残っている旧データ
//     【2026-10-05 改め】**同じ type は登録シンボル(ライブラリ)を使う=シンボルは1つ**(盛田さん「アじゃないか？」)。
//     図面の中の写しを使うのは、登録シンボルに無い type と、登録シンボルが読めないとき(ライブラリフォルダ未設定の PC 等)だけ。
//     (10-03 の決定(3)「図面の中が正」は、図面ごとに写しが違うと窓がループし、別ファイルのページを足すと形が混ざったのでやめた)
//     図面の写しと端子の位置が違う記号があれば、開いたときに知らせる(symMovedNotice。盛田さん「(1)で進めて」)
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
  const libOk = _symLibReady();
  Object.keys(lib).forEach(t => add(libOk ? lib[t] : (drawing[t] || lib[t])));   // 登録シンボルが正(読めないときだけ図面の中)
  // 【2026-10-05 欠陥3】登録シンボルが読めるときは、図面の写しは**今の図面に置いてあるものだけ**(未登録として出す)。
  // 10-03 より前の図面は使っていない分まで丸ごと写しを持つので、全部出すと消したシンボルや使っていないものが一覧に戻っていた。
  // ブラウザの中の旧データも出さない(移すかは「移しますか？」で聞く)。読めないときは今まで通り全部(作業を止めない)
  Object.keys(drawing).forEach(t => { if (!libOk || used.has(t)) add(drawing[t]); });
  if (!libOk) {
    // ブラウザの中の旧データは、まだライブラリへ移していないものだけ(移したものは、ライブラリから消したら出さない)
    const moved = (typeof ecadLib !== 'undefined') ? ecadLib.migrated('symbols') : new Set();
    _symLegacyArr().forEach(s => { if (s && !moved.has(s.type)) add(s); });
  }
  state.customSymbols = list;
  if (typeof DEFS !== 'undefined') list.forEach(s => { DEFS[s.type] = s; });
  symBakeFixElements();   // 大きさを焼き込んだシンボルを使っている記号の倍率を合わせる(下の「大きさの焼き込み」)
  if (typeof renderSymFloat === 'function') { try { renderSymFloat(); } catch (e) {} }
}

// ---- 大きさの焼き込み(2026-10-07) -------------------------------------
// 盛田さん「ほかのCADと合わせたい」: シンボルは図面で使う大きさで登録し、置くときは等倍(倍率1)。
// シンボルライブラリ(JIS の DXF)から入ったものは元の形が大きく、図面で1個ずつ 0.3 倍などに縮めて使っていたため、
// 「登録シンボルと比べる」で足すと元の大きさで入り、パネルから置くと3倍くらい大きく出た。
//   ・足すとき、図面で使っている倍率(いちばん多いもの)を形・端子・幅高さ・文字の大きさに掛けてから登録する(symBakeDef)
//   ・定義に baked(何倍に縮めたか。焼き込みを重ねたら掛け算)を、記号に symBaked(どの baked に合わせた倍率か)を持つ。
//     記号の symBaked が定義の baked と違えば、見た目が変わらないよう倍率を直す(symBakeFixElements)。
//     =プロジェクトの外の古い図面を開いても、置いてある記号が小さくならない。盛田さんが触る欄は増えない
//   ・線の太さは倍率で変わらない描き方(symbols.js の sInv)なので掛けない
function symBakeDef(def, k) {
  const d = JSON.parse(JSON.stringify(def));
  const m = v => (typeof v === 'number') ? v * k : v;
  (d.shapes || []).forEach(s => {
    ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'x', 'y', 'w', 'h', 'fs'].forEach(key => { if (key in s) s[key] = m(s[key]); });
    if (Array.isArray(s.pts)) s.pts = s.pts.map(p => [m(p[0]), m(p[1])]);
  });
  (d.terminals || []).forEach(t => { t.x = m(t.x); t.y = m(t.y); });
  d.w = m(d.w); d.h = m(d.h);
  d.baked = (def.baked || 1) * k;
  return d;
}
// 図面(開いている全ページ)でその記号に使っている倍率のうち、いちばん多いもの。置いていない・全部 1 なら null
function symCommonScale(type) {
  const cnt = new Map(), val = new Map();   // 数えるのは丸めた値、返すのは実際の値(割ったときにちょうど 1 になるように)
  (state.pages || []).forEach(pg => (pg.elements || []).forEach(e => {
    if (!e || e.type !== type) return;
    const k = Math.round((e.scale || 1) * 1e6) / 1e6;
    cnt.set(k, (cnt.get(k) || 0) + 1);
    if (!val.has(k)) val.set(k, e.scale || 1);
  }));
  let best = null, bn = 0;
  cnt.forEach((n, k) => { if (n > bn) { best = val.get(k); bn = n; } });
  return (best && Math.abs(best - 1) > 1e-6) ? best : null;
}
// 記号の倍率を定義の baked に合わせる(何度呼んでも同じ)。直した数を返す
function symBakeFixElements() {
  let n = 0;
  const defOf = t => (state.customSymbols || []).find(s => s.type === t);
  (state.pages || []).forEach(pg => {
    let touched = false;
    (pg.elements || []).forEach(e => {
      if (!e || !e.type) return;
      const d = defOf(e.type);
      if (!d) return;
      const want = d.baked || 1, have = e.symBaked || 1;
      if (Math.abs(want - have) < 1e-9) return;
      e.scale = Math.round((e.scale || 1) * have / want * 1e6) / 1e6;
      if (want === 1) delete e.symBaked; else e.symBaked = want;
      touched = true; n++;
    });
    if (touched) pg.dirty = true;
  });
  if (n && typeof renderPageTabs === 'function') renderPageTabs();
  return n;
}

// 図面を開いたときに図面のシンボルを覚えておく(applyProjectData・自動保存からの復元)
function setDrawingSymbols(arr) {
  state.drawingSymbols = {};
  (arr || []).forEach(s => { if (s && s.type) state.drawingSymbols[s.type] = s; });
  _symMovedSig = '';
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
// opts.register: 登録シンボルに無いものも登録する(シンボル登録の画面・インポートだけ)。
// 【2026-10-05 欠陥4】それ以外(端子の編集・サイズ調整・シンボルライブラリから置き直し)は、登録シンボルに無いシンボルを登録しない
// =図面の中だけ直す(以前は直すと `lib_…` などがそのまま登録シンボルに入り、ダブりの元になっていた)
async function symStorePut(defs, opts) {
  defs = (defs || []).filter(d => d && d.type);
  if (!defs.length) return true;
  // 図面で使っている定義も同じものに揃える
  defs.forEach(d => { if (state.drawingSymbols && d.type in state.drawingSymbols) state.drawingSymbols[d.type] = d; });
  if (_symLibReady() && !(opts && opts.register)) {
    const lib = _symLibObj();
    const local = defs.filter(d => !(d.type in lib));
    if (local.length) {
      local.forEach(d => { if (state.drawingSymbols) state.drawingSymbols[d.type] = d; });
      if (typeof stToast === 'function') stToast(`「${local.map(d => d.name || d.label || d.type).join('、')}」は登録シンボルではないので、この図面の中だけ直しました(保存で図面に入ります)。登録するときはシンボル登録で`, 'warn');
      (state.pages || []).forEach(pg => { if ((pg.elements || []).some(e => local.some(d => d.type === e.type))) pg.dirty = true; });
      if (typeof renderPageTabs === 'function') renderPageTabs();
      defs = defs.filter(d => d.type in lib);
      if (!defs.length) { rebuildSymbolPalette(); return true; }
    }
  }
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
  // 2026-10-05 登録シンボルに無いもの(図面の中だけ。未登録)は消す先が無い。図面に置いてある限り一覧に出る
  if (_symLibReady() && !(type in _symLibObj()) && _symTypesUsed(state.pages).has(type)) {
    alert('このシンボルは登録シンボルではありません(この図面の中だけ)。図面に置いてある記号を消せば一覧からも消えます');
    return false;
  }
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

// ---- シンボルの逆引き(どの図面で使っているか。2026-10-05 欠陥6) -----------------------
// 盛田さん「どれが使ってて使われてないか分らん」。数えるのは ①開いている図面(今の画面のページ) ②プロジェクトのフォルダの台帳(js/proj_index.js)の図面。
// 台帳から、ツリーで開いているファイル(pg._src)は除く(①で数える)。台帳に入らない図面(.json・フォルダの外)は数えられない
// 戻り値: { here: Map(type→個数), files: Map(type→Map(ファイル名→個数)), scope: '数えた範囲の説明', nFiles }
function symUsage() {
  const here = new Map(), files = new Map();
  (state.pages || []).forEach(pg => (pg.elements || []).forEach(e => { if (e && e.type) here.set(e.type, (here.get(e.type) || 0) + 1); }));
  const open = new Set((state.pages || []).map(p => p._src).filter(Boolean).map(x => x.replace(/^\//, '')));
  const idx = (typeof pidxState !== 'undefined' && pidxState.index) ? pidxState.index.files : null;
  let nFiles = 0;
  Object.entries(idx || {}).forEach(([name, f]) => {
    if (!f || !f.pages) return;
    nFiles++;
    if (open.has(name)) return;
    f.pages.forEach(p => ['devs', 'noRef', 'arrows'].forEach(k => (p[k] || []).forEach(d => {
      if (!d || !d.type) return;
      if (!files.has(d.type)) files.set(d.type, new Map());
      const m = files.get(d.type); m.set(name, (m.get(name) || 0) + 1);
    })));
  });
  const dir = (typeof pidxState !== 'undefined' && pidxState.dirName) || '';
  const scope = idx ? `開いている図面＋プロジェクト${dir ? '「' + dir + '」' : ''}の図面 ${nFiles} 枚` : '開いている図面だけ(左パネルの「プロジェクト」でフォルダを開くと、ほかの図面も数えます)';
  return { here, files, scope, nFiles };
}
// シンボルパネルを開いたとき: 台帳を最新にして(変わったファイルだけ読む)から一覧を描き直す。許可は聞かない
let _symUsageBusy = false;
async function symUsageRefresh() {
  if (_symUsageBusy || typeof pidxUpdate !== 'function' || typeof xprojDirHandle !== 'function') return;
  _symUsageBusy = true;
  try {
    const dir = await xprojDirHandle(false);
    if (dir) { const names = await xprojReadList(dir); await pidxUpdate(dir, names); }
  } catch (e) { console.warn('台帳を読めませんでした', e); }
  finally { _symUsageBusy = false; }
  if (typeof renderSymFloat === 'function') { try { renderSymFloat(); } catch (e) {} }
}
// 使っている図面の一覧を見せる(シンボルパネルの「使用」を押したとき)
function symUsageShow(type) {
  const u = symUsage(), s = (state.customSymbols || []).find(x => x.type === type) || {};
  const h = u.here.get(type) || 0, f = u.files.get(type) || new Map();
  const lines = [...f.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja', { numeric: true })).map(([n, c]) => `・${n.replace(/\.seqzu$/i, '')}(${c}個)`);
  alert(`「${s.name || s.label || type}」を使っているところ\n\n開いている図面: ${h}個\nほかの図面: ${f.size}枚\n${lines.slice(0, 40).join('\n')}${lines.length > 40 ? '\n…' : ''}\n\n数えた範囲: ${u.scope}`);
}

// ---- 端子の位置が変わる記号の知らせ・確認(2026-10-05) ----------------------------
const _symTermPos = d => JSON.stringify(((d && d.terminals) || []).map(t => [Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100]));

// 図面の写し(copies: {type: 定義})と登録シンボルで端子の位置が違い、図面に置いてある記号を知らせる(窓ではなく画面の隅に。押すとその記号へ)。
// pageOk(pg): 数えるページ(省略で全部)。同じ図面を開いている間、同じ内容は1度だけ
let _symMovedSig = '';
function symMovedNotice(copies, pageOk, force) {   // force: 同じ内容でも出す(シンボルを置き換えたとき)
  if (!_symLibReady() || typeof document === 'undefined' || !document.body) return [];
  const lib = _symLibObj();
  const hits = [];
  Object.keys(copies || {}).forEach(t => {
    if (!lib[t] || _symTermPos(lib[t]) === _symTermPos(copies[t])) return;
    const at = [];
    (state.pages || []).forEach((pg, pi) => { if (!pageOk || pageOk(pg)) (pg.elements || []).forEach(e => { if (e.type === t) at.push({ pi, id: e.id }); }); });
    if (at.length) hits.push({ type: t, name: lib[t].label || lib[t].name || t, at });
  });
  if (!hits.length) return hits;
  const sig = hits.map(h => h.type + ':' + h.at.map(a => a.id).join(',')).join('|');
  if (sig === _symMovedSig && !force) return hits;
  _symMovedSig = sig;
  const old = document.getElementById('sym-moved'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'sym-moved';
  box.style.cssText = 'position:fixed;right:12px;bottom:40px;z-index:10001;max-width:380px;background:var(--bg2,#2a2a2a);color:var(--fg,#ddd);'
    + 'border:1px solid var(--red,#e55);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.4);padding:10px 12px;font-size:12px;line-height:1.6';
  window._symMovedHits = hits;
  box.innerHTML = '<div style="display:flex;align-items:center"><b style="flex:1">登録シンボルで端子の位置が変わった記号</b>'
    + '<span style="cursor:pointer;padding:0 4px;color:var(--fg3,#999)" onclick="this.closest(\'#sym-moved\').remove()">×</span></div>'
    + '<div style="font-size:11px;color:var(--fg3,#999)">図面ファイルに入っていた形と端子の位置が違うので、配線が端子から外れていることがあります。押すとその記号へ移ります。保存すると図面ファイルも登録シンボルの形になります。</div>'
    + hits.map((h, i) => `<div>・${escH(h.name)}(${h.at.length}個) `
      + h.at.slice(0, 8).map((a, k) => `<a href="javascript:void(0)" style="color:var(--acc)" onclick="symMovedJump(${i},${k})">${k + 1}</a>`).join(' ')
      + (h.at.length > 8 ? ' …' : '') + '</div>').join('');
  document.body.appendChild(box);
  return hits;
}
function symMovedJump(i, k) {
  const a = ((window._symMovedHits || [])[i] || { at: [] }).at[k];
  if (a && typeof jumpToRefEl === 'function') jumpToRefEl(a.pi, a.id);
}

// シンボルの端子の位置を変えてよいか(端子の編集・サイズ調整の前に呼ぶ)。位置が変わらなければ聞かずに true。
// 使っている数: 今の画面の記号と、プロジェクトの台帳(js/proj_index.js)にある他のファイル
function symConfirmTermMove(type, oldDef, newTerms) {
  if (_symTermPos(oldDef) === _symTermPos({ terminals: newTerms })) return true;
  let here = 0;
  (state.pages || []).forEach(pg => (pg.elements || []).forEach(e => { if (e.type === type) here++; }));
  const open = new Set((state.pages || []).map(p => p._src).filter(Boolean).map(x => x.replace(/^\//, '')));
  let files = 0;
  const idx = (typeof pidxState !== 'undefined' && pidxState.index) ? pidxState.index.files : {};
  Object.entries(idx || {}).forEach(([name, f]) => {
    if (open.has(name) || !f.pages) return;
    if (f.pages.some(p => (p.devs || []).some(d => d.type === type) || (p.noRef || []).some(d => d.type === type))) files++;
  });
  if (!here && !files) return true;
  const nm = (oldDef && (oldDef.label || oldDef.name)) || type;
  return confirm(`「${nm}」の端子の位置が変わります。\n\n使っているところ: 開いている図面に ${here} 個`
    + (files ? `、プロジェクトのほかの図面 ${files} 枚` : '') + `\n\nシンボルは1つなので、使っている図面は全部この形になり、配線が端子から外れることがあります(ほかの図面は次に開いたときに知らせます)。\n変えますか？`);
}

// ---- 図面と登録シンボルの違い ------------------------------------------------
// 【2026-10-05 作り直し】以前(10-03 決定(3))は図面を開くたびに比べて「そのまま/ライブラリへ反映」の窓を出していた。
// 図面ファイルごとにシンボルの写しを持つので、A を開いて反映→B を開くとまた違う→反映→A を開くとまた…と**窓が終わらなかった**
// (盛田さん「違う図面を開くとループする」「ループ自体もなくせない」)。
// 今は**開いたときには何も聞かない**。さらに同日、シンボルは1つ(登録シンボルが正)に改めたので、図面は登録シンボルで描かれる。
// シンボルパネルの「登録シンボルと比べる」(symCompareDialog)は、図面ファイルに入っていた写しとの違いを出し、
// 「登録シンボルを図面の写しに戻す」「登録シンボルに無いものを足す」を選ぶ(昔の形に戻したいとき・別の PC で作った図面から足すとき)。
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
    if (!placed[t]) return;   // 2026-10-05 欠陥3: 置いてあるものだけ(古い図面の使っていない写しを登録シンボルに戻さない)
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
  // 登録シンボルに無いものを足すときは、図面で使っている大きさで登録する(上の「大きさの焼き込み」)。
  // 置いてある記号の倍率は、登録シンボルに書けたあとの組み直し(rebuildSymbolPalette → symBakeFixElements)で 1 に戻る
  const baked = [];
  if (toLib.length) ok = await _symLibWrite(o => {
    toLib.forEach(t => {
      const k = !(t in lib) ? symCommonScale(t) : null;
      o[t] = k ? symBakeDef(drawing[t], k) : drawing[t];
      if (k) { state.drawingSymbols[t] = o[t]; baked.push(`${o[t].name || o[t].label || t}(${Math.round(k * 100) / 100}倍)`); }   // 図面の写しも同じに(比べたときに違いとして出さない)
    });
    return o;
  });
  if (ok) symApplyChoices.lastBaked = baked;
  if (ok && toLib.length && typeof draw === 'function') draw();
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
    : `<option value="">何もしない</option><option value="lib">登録シンボルを図面の写しに戻す</option>`;
  ov.innerHTML = '<div style="background:var(--bg2,#2a2a2a);color:var(--fg,#ddd);border:1px solid var(--bd2,#444);border-radius:6px;'
    + 'box-shadow:0 4px 20px rgba(0,0,0,.5);padding:14px 16px;max-width:760px;max-height:80vh;overflow:auto;font-size:12px;line-height:1.6">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:4px">図面ファイルに入っていたシンボルと登録シンボルの違い</div>'
    + '<div style="font-size:11px;color:var(--fg3,#999);margin-bottom:6px">登録シンボル = ライブラリフォルダの symbols.json。シンボルは1つで、図面は登録シンボルで描いています。図面ファイルに入っていた写し(前の形)に戻したいもの・登録シンボルに無くて足したいものだけ選んでください。</div>'
    + '<table class="tbl" style="width:100%"><tr><th>シンボル</th><th>違い</th><th>この図面に置いた数</th><th>どうするか</th></tr>'
    + list.map((r, i) => `<tr><td>${escH(r.name)}</td><td>${escH(r.what.join('・'))}${r.termsMoved ? ' <span style="color:var(--red,#e55)">⚠</span>' : ''}</td>`
      + `<td style="text-align:right">${r.placed}</td><td><select data-i="${i}">${opt(r)}</select></td></tr>`).join('')
    + '</table>'
    + '<div style="font-size:11px;color:var(--fg3,#999);margin-top:6px">⚠ = 端子の位置が違う。「登録シンボルを図面の写しに戻す」と、<b>このシンボルを使っている図面は全部その形になり、配線が端子から外れることがあります</b>。'
    + '上書きする前の登録シンボルはバックアップに残ります。</div>'
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
    const lib0 = _symLibObj();
    for (const t of toLib) {
      const r = list.find(x => x.type === t);
      if (r && r.termsMoved && !symConfirmTermMove(t, lib0[t], (state.drawingSymbols[t] || {}).terminals || [])) return;
    }
    close();
    const ok = await symApplyChoices(toDrawing, toLib);
    if (ok) {
      const b = symApplyChoices.lastBaked || [];
      alert(`登録シンボルに入れました(${toLib.length}件)` + (b.length
        ? `\n\n図面で使っている大きさで登録しました: ${b.join('、')}\nこの図面の記号は等倍(倍率1)に直しました(見た目は変わりません)。パネルから置くと同じ大きさで出ます` : ''));
    }
  };
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['sym_store.js'] = 1;
