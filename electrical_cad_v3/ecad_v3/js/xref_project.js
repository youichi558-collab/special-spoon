// ================================================================
// xref_project.js — 分割ファイルのプロジェクト(2026-09-30)
//
// 盛田さん「基本は分割」= 図面は1ページ1ファイルで使う。クロスリファレンスとページ跨ぎの矢印は、
// 開いている図面の中だけでは相手が見つからない。そこで、他社CAD(AutoCAD Electrical=プロジェクトに登録した
// ファイル群を対象にする)と同じく、**同じフォルダの図面ファイルの一覧(プロジェクト)**を持つ。
//
// 【仕組み】
//   ・ボタン「参照図面」(データタブ): フォルダを選ぶ → フォルダ内の図面(.json)から対象を選ぶ → フォルダに ecad_project.json として保存
//     (フォルダを選ぶだけにしないのは、別案件の図面が混ざらないため)
//   ・「更新」を押すと、対象のファイルを読み直して計算する(読むだけ。図面には足さない・保存もしない)
//   ・計算のあいだだけ、別ファイルのページを今の図面の後ろに足す(xprojWith)。位置は「ファイル名/ページ/区画」(elLocation)
//   ・**開いている図面と同じページ名のファイルは使わない**(開いている方が新しいので。二重に数えない)
//   ・別ファイルの記号の種別(コイル・接点・矢印)は、そのファイルのカスタムシンボルから読む。今の図面に同じtypeがあれば今のもの
// ================================================================

const XPROJ_FILE = 'ecad_project.json';
const XPROJ_KEY  = 'proj';                 // IndexedDB(settings.js の _stGet/_stPut)に覚えるフォルダの鍵
const xprojState = { files: [], dirName: '', problems: [] };   // files: [{name, pages, symbols}]

const xprojBase = name => String(name || '').replace(/\.json$/i, '');

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
  const mine = new Set((state.pages || []).map(p => p.name));
  const out = [];
  xprojState.files.forEach((f, fi) => {
    const pages = f.pages || [];
    if (pages.some(p => mine.has(p.name))) return;
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
    return fn();
  } finally {
    state.pages = savedPages; state.customSymbols = savedSyms;
    addedDefs.forEach(t => { delete DEFS[t]; });
  }
}

// ---- フォルダの読み書き(ブラウザのフォルダ選択。設定は settings.js と同じ IndexedDB) ----
async function xprojDirHandle(ask) {
  let h = await _stGet(XPROJ_KEY);
  if (!h) return null;
  let st = 'prompt';
  try { st = await h.queryPermission({ mode: 'readwrite' }); } catch (e) {}
  if (st !== 'granted' && ask) { try { st = await h.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
  return st === 'granted' ? h : null;
}
async function xprojReadList(dir) {
  try {
    const fh = await dir.getFileHandle(XPROJ_FILE);
    const d = JSON.parse(await (await fh.getFile()).text());
    return Array.isArray(d.files) ? d.files : [];
  } catch (e) { return null; }     // まだ無い
}
async function xprojReadFiles(dir, names) {
  const files = [], problems = [];
  for (const name of names) {
    try {
      const fh = await dir.getFileHandle(name);
      const d = JSON.parse(await (await fh.getFile()).text());
      if (!d || !Array.isArray(d.pages)) throw new Error('図面ファイルではありません');
      files.push({ name, pages: d.pages, symbols: d.customSymbols || [] });
    } catch (e) { problems.push(`${name}: ${e && e.message || e}`); }
  }
  return { files, problems };
}
// 保存済みの対象ファイルを読み直す(「更新」から呼ぶ)。フォルダが未設定なら何もしない(false)
async function xprojReload() {
  const dir = await xprojDirHandle(true);
  if (!dir) return false;
  const names = await xprojReadList(dir);
  if (!names) return false;
  const r = await xprojReadFiles(dir, names);
  xprojState.files = r.files; xprojState.problems = r.problems; xprojState.dirName = dir.name;
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

// ボタン「参照図面」(データタブ): フォルダを選び、対象の図面を選ぶ
async function xprojSetup() {
  if (!window.showDirectoryPicker) { alert('このブラウザはフォルダ選択に対応していません(Chrome/Edgeで開いてください)'); return; }
  let dir;
  try {
    const prev = await _stGet(XPROJ_KEY);
    const opt = { id: 'ecad-proj', mode: 'readwrite' };
    if (prev) opt.startIn = prev;
    dir = await window.showDirectoryPicker(opt);
  } catch (e) { return; }
  const all = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file' && /\.json$/i.test(name) && name !== XPROJ_FILE) all.push(name);
  }
  all.sort();
  const saved = new Set((await xprojReadList(dir)) || []);
  const mine = new Set((state.pages || []).map(p => p.name));
  const chosen = await xprojPickDialog(dir.name, all, saved, mine);
  if (!chosen) return;
  try { await _stPut(XPROJ_KEY, dir); } catch (e) {}
  const fh = await dir.getFileHandle(XPROJ_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify({ version: 1, files: chosen }, null, 2));
  await w.close();
  await xprojReload();
  if (typeof stToast === 'function') stToast(`参照図面を保存しました(${chosen.length}ファイル)。表示タブの「更新」でクロスリファレンスに反映します`, 'ok');
}

function xprojPickDialog(dirName, names, saved, _mine) {
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg2,#fff);color:var(--fg,#000);padding:14px 16px;border-radius:6px;min-width:340px;max-width:80vw;max-height:80vh;overflow:auto;font-size:13px';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = `<div style="font-weight:600;margin-bottom:6px">参照図面(${esc(dirName)})</div>
      <div style="font-size:11px;opacity:.8;margin-bottom:8px">クロスリファレンス・ページ跨ぎの矢印で相手を探す図面を選びます。開いている図面と同じページ名のファイルは、開いている方を使います。</div>
      ${names.map((n, i) => `<label style="display:block"><input type="checkbox" data-i="${i}" ${saved.has(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('') || '<div>図面(.json)がありません</div>'}
      <div style="margin-top:10px;text-align:right"><button id="xp-ng">やめる</button> <button id="xp-ok">保存</button></div>`;
    bg.appendChild(box); document.body.appendChild(bg);
    const done = v => { bg.remove(); resolve(v); };
    box.querySelector('#xp-ng').onclick = () => done(null);
    box.querySelector('#xp-ok').onclick = () => done([...box.querySelectorAll('input:checked')].map(c => names[+c.dataset.i]));
  });
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['xref_project.js'] = 1;
