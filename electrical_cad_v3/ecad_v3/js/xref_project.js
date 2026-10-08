// ================================================================
// xref_project.js — 分割ファイルのプロジェクト(2026-09-30)
//
// 盛田さん「基本は分割」= 図面は1ページ1ファイルで使う。クロスリファレンスとページ跨ぎの矢印は、
// 開いている図面の中だけでは相手が見つからない。そこで、他社CAD(AutoCAD Electrical=プロジェクトに登録した
// ファイル群を対象にする)と同じく、**同じフォルダの図面ファイルの一覧(プロジェクト)**を持つ。
//
// 【仕組み】
//   ・【2026-10-05】対象は**左パネルの「プロジェクト」で開いたフォルダ(ツリーの根)の中の図面(.seqzu)全部**(サブフォルダも)。
//     以前はデータタブの「参照図面」ボタンでフォルダと対象のファイルを選び ecad_project.json に保存していたが、盛田さんの方針
//     (「普通のcadは左にパネル出してプロジェクト内のファイルを出している」「参照図面と台帳をツリーのフォルダにまとめて」)でやめた。
//     ファイル名はツリーの根からの道筋(例: 盤外/Sheet1.seqzu)
//   ・「更新」を押すと、対象のファイルを読み直して計算する(読むだけ。図面には足さない・保存もしない)
//   ・計算のあいだだけ、別ファイルのページを今の図面の後ろに足す(xprojWith)。位置は「ファイル名/ページ/区画」(elLocation)
//   ・**開いているファイルは使わない**(開いている方が新しいので。二重に数えない)。ツリーから開いたページはファイル(pg._src)で、
//     それ以外のページは同じページ名で判定する
//   ・別ファイルの記号の種別(コイル・接点・矢印)は、そのファイルのカスタムシンボルから読む。今の図面に同じtypeがあれば今のもの
// ================================================================

const xprojState = { files: [], dirName: '', problems: [] };   // files: [{name, pages, symbols}]

const xprojBase = name => String(name || '').replace(/\.(seqzu|json)$/i, '');

// 別ファイルの1ページを、計算用の仮のページにする(要素は写しを作り、IDに接頭辞を付けて今の図面と衝突させない)
function xprojVirtualPage(file, pg, idx, fi) {
  const pre = `xp${fi}:`;
  const cp = o => Object.assign({}, o, { id: pre + o.id });
  return {
    name: `${xprojBase(file.name)}/${pg.name || ''}`, _file: xprojBase(file.name), _pno: idx + 1,
    elements: (pg.elements || []).map(cp), wires: pg.wires || [], groups: (pg.groups || []).map(cp),
    frameObj: pg.frameObj || null,
  };
}

// 使う別ファイルのページ(今の図面と同じページ名のファイルは除く)
function xprojPages() {
  const mine = new Set((state.pages || []).filter(p => !p._src).map(p => p.name));
  const open = new Set((state.pages || []).map(p => p._src).filter(Boolean));   // ツリーの道筋('/盤外/Sheet1.seqzu')
  const out = [];
  xprojState.files.forEach((f, fi) => {
    const pages = f.pages || [];
    if (open.has('/' + f.name) || pages.some(p => mine.has(p.name))) return;
    pages.forEach((pg, i) => out.push({ f, pg, i, fi }));
  });
  return out;
}

// fn を、別ファイルのページ・記号定義を足した状態で実行して、元に戻す
function xprojWith(fn) {
  const ext = xprojPages();
  if (!ext.length) return fn();
  const savedPages = state.pages, savedSyms = state.customSymbols;
  const addedDefs = [];
  try {
    if (typeof DEFS === 'object') {
      xprojState.files.forEach(f => (f.symbols || []).forEach(s => {
        if (s && s.type && !DEFS[s.type]) { DEFS[s.type] = s; addedDefs.push(s.type); }
      }));
    }
    // 端子の位置(collectTerminalPoints)は state.customSymbols を見るので、別ファイルの記号定義も足す(今の図面にあるtypeは今のもの)
    const have = new Set((savedSyms || []).map(x => x.type));
    const more = [];
    xprojState.files.forEach(f => (f.symbols || []).forEach(x => { if (x && x.type && !have.has(x.type)) { have.add(x.type); more.push(x); } }));
    if (more.length) state.customSymbols = (savedSyms || []).concat(more);
    state.pages = savedPages.concat(ext.map(e => xprojVirtualPage(e.f, e.pg, e.i, e.fi)));
    // 別ファイルの記号も、大きさを焼き込んだシンボル(js/sym_store.js)に倍率を合わせる(写しなのでファイルは変わらない)
    if (typeof symBakeFixList === 'function') {
      const defOf = t => (state.customSymbols || []).find(s => s.type === t);
      state.pages.slice(savedPages.length).forEach(pg => symBakeFixList(pg.elements, defOf));
    }
    return fn();
  } finally {
    state.pages = savedPages; state.customSymbols = savedSyms;
    addedDefs.forEach(t => { delete DEFS[t]; });
  }
}

// ---- フォルダ(左パネルの「プロジェクト」で開いたフォルダ。js/proj_tree.js) ----
async function xprojDirHandle(ask) {
  let h = (typeof ptreeState !== 'undefined' && ptreeState.root) || null;
  if (!h && typeof PTREE_KEY === 'string' && !(typeof ptreeState !== 'undefined' && ptreeState.detached)) { try { h = await _stGet(PTREE_KEY); } catch (e) {} }   // 読込でプロジェクトを外したら読まない(2026-10-06)
  if (!h) return null;
  let st = 'prompt';
  try { st = await h.queryPermission({ mode: 'readwrite' }); } catch (e) {}
  if (st !== 'granted' && ask) { try { st = await h.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
  return st === 'granted' ? h : null;
}
// フォルダの中の図面(.seqzu)をサブフォルダまで全部。戻り値: 根からの道筋('盤外/Sheet1.seqzu')の並び
async function xprojReadList(dir) {
  const out = [];
  const walk = async (d, pre) => {
    for await (const [name, h] of d.entries()) {
      if (h.kind === 'directory') { if (name !== '.seqzu_history') await walk(h, pre + name + '/'); }   // 履歴(js/proj_tree.js PTREE_HIST)は数えない=同じ図面が何重にも入るため
      else if (/\.seqzu$/i.test(name)) out.push(pre + name);
    }
  };
  try { await walk(dir, ''); } catch (e) { console.warn('プロジェクトのフォルダを読めませんでした', e); }
  return out.sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
}
// 道筋 → ファイルの鍵
async function xprojFileHandle(dir, path) {
  const parts = String(path).split('/').filter(Boolean);
  let d = dir;
  for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
  return d.getFileHandle(parts[parts.length - 1]);
}
async function xprojReadFiles(dir, names) {
  const files = [], problems = [];
  for (const name of names) {
    try {
      const fh = await xprojFileHandle(dir, name);
      const file = await fh.getFile();
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.pages)) throw new Error('図面ファイルではありません');
      // lastModified・size・data はプロジェクト台帳(js/proj_index.js)が読み直さずに使う
      files.push({ name, pages: d.pages, symbols: d.customSymbols || [], lastModified: file.lastModified, size: file.size, data: d });
    } catch (e) { problems.push(`${name}: ${e && e.message || e}`); }
  }
  return { files, problems };
}
// プロジェクトのフォルダの図面を読み直す(「更新」・部品表から呼ぶ)。フォルダが未設定なら何もしない(false)
async function xprojReload() {
  const dir = await xprojDirHandle(true);
  if (!dir) { xprojState.files = []; xprojState.problems = []; xprojState.dirName = ''; return false; }
  const names = await xprojReadList(dir);
  const r = await xprojReadFiles(dir, names);
  xprojState.files = r.files.map(f => { const o = Object.assign({}, f); delete o.data; return o; });
  xprojState.problems = r.problems; xprojState.dirName = dir.name;
  // プロジェクト台帳を最新にする(変わったファイルだけ。いま読んだ中身を使う)。失敗しても参照図面の計算は続ける
  if (typeof pidxUpdate === 'function') {
    try { await pidxUpdate(dir, names, new Map(r.files.map(f => [f.name, f]))); }
    catch (e) { console.warn('プロジェクト台帳の更新に失敗', e); }
  }
  if (r.problems.length && typeof stToast === 'function') stToast('読めなかった図面があります:\n' + r.problems.join('\n'), 'warn');
  return true;
}

// 「更新」のあと: 別ファイルの同じデバイスと型番などが食い違っていれば、選ぶ画面(js/devices.js)を出す。
// 同じ食い違いの組を何度も出さない(「あとで」にしたのに更新のたびに出ると邪魔)。2回目からは知らせだけ
function xprojCheckConflicts() {
  if (!xprojState.files.length || typeof devConflicts !== 'function' || typeof devResolveDialog !== 'function') return;
  const cf = devConflicts().filter(c => c.options.some(o => o.items.some(it => it.ext)));
  if (!cf.length) { xprojState.shownSig = ''; return; }
  const sig = cf.map(c => c.key + '|' + c.field + '|' + c.options.map(o => o.value).sort().join('/')).sort().join(';');
  if (xprojState.shownSig === sig) {
    if (typeof stToast === 'function') stToast(`別ファイルとデバイスの値が食い違っています(${cf.length}件)。部品表の「食い違いを直す」から選べます`, 'warn');
    return;
  }
  xprojState.shownSig = sig;
  devResolveDialog(cf, { onDone: n => { if (n) { if (state.showXref === true) xrefRefresh(); if (typeof draw === 'function') draw(); } } });
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['xref_project.js'] = 1;
