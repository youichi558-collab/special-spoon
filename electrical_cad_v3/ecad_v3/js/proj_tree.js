// ================================================================
// proj_tree.js — 左パネルの「プロジェクト」= フォルダのツリー(2026-10-04)
//
// 盛田さん「普通のcadは左にパネル出してプロジェクト内のファイルを出している」「ツリーはエクスプローラそのままで構わん」。
//   ・いちばん上の「フォルダを開く」でプロジェクトのフォルダ(ツリーの根)を選ぶ。次回は同じフォルダから(許可が要れば押して許可)
//   ・フォルダはエクスプローラと同じに開閉。出すのはフォルダと図面(.seqzu)だけ(図面でないファイルは拡張子で見えない。以前の .json も出さない)
//   ・図面を押すと今の図面と置き換えて開く(未保存のページがあれば確認。取り消しで戻せる)
//   ・行の「＋」で今の図面の後ろにページとして足す(盛田さん「コピー貼り付けしたいときはページを足した方がいい」)
//   ・開いたページは開いたファイルを覚え(pg._src=ツリーの道筋)、「保存」で窓を出さずにそのファイルへ上書きする
//     (盛田さん「開いたファイル全部書き換え出来ていい、普通そうだろ」。js/edit.js saveToSrcFile)
//   ・【2026-10-05】右クリックのメニュー(と上の「＋図面」「＋フォルダ」)で、図面・フォルダの作成・名前の変更・削除(盛田さん「ツリーでできるように」)
//     削除は**消す前に図面をバックアップ(server.py の /api/backup/save、名前「削除_〇〇」)に取る**=設定タブのバックアップから戻せる。
//     取れなければ消さない。図面以外のファイルが入ったフォルダは消さない(エクスプローラで)。ブラウザの削除はごみ箱に入らないため
//   ・【2026-10-05】履歴(世代管理)。盛田さん「世代管理できないな」→ 上書き保存のたびに、上書きされる前の中身を
//     フォルダの中の隠しフォルダ .seqzu_history に残す(図面ごとに新しい方から20件)。右クリック「履歴…」で一覧から開く(下の「履歴」)
// ================================================================

const PTREE_KEY = 'ptree';                       // IndexedDB(settings.js の _stGet/_stPut)に覚えるフォルダの鍵
const PTREE_PREV_KEY = 'ptree_prev';             // 読込でプロジェクトを外したときの、前のフォルダ(「前のフォルダに戻す」用。2026-10-06)
const PTREE_EXT = /\.seqzu$/i;
const PTREE_HIST = '.seqzu_history', PTREE_HIST_KEEP = 20;   // 履歴の隠しフォルダ(プロジェクトのフォルダの直下)・図面ごとに残す数
const ptreeState = { root: null, open: new Set(), files: new Map(), detached: false };   // detached: 読込でプロジェクトを外した(覚えたフォルダを読み直さない)   // open: 開いているフォルダの道筋 / files: 開いた図面の道筋 → ファイルの鍵

// 【2026-10-05】「名前を付けて保存」で書いたファイルも、次から窓を出さずに上書きする(盛田さん)。
// pages の保存先をそのファイルにする。プロジェクトのフォルダの中ならツリーの道筋、外なら外用の印(ext:)を保存先の名前にする。
// 同じファイルを保存先にしていた他のページは保存先を外して未保存にする(そのファイルは今回の中身で上書きされたため)
let _ptExtSeq = 0;
async function ptreeAdopt(fh, pages) {
  let key = '';
  try { const parts = ptreeState.root && await ptreeState.root.resolve(fh); if (parts && parts.length) key = '/' + parts.join('/'); } catch (e) {}
  if (!key) {
    for (const [k, h] of ptreeState.files) { try { if (k.startsWith('ext:') && await h.isSameEntry(fh)) { key = k; break; } } catch (e) {} }
    if (!key) key = `ext:${++_ptExtSeq}:${fh.name}`;
  }
  (state.pages || []).forEach(p => { if (p._src === key && !pages.includes(p)) { delete p._src; p.dirty = true; } });
  ptreeState.files.set(key, fh);
  pages.forEach(p => { p._src = key; });
  if (typeof renderPageTabs === 'function') renderPageTabs();
  ptreeRender();
}

// ページが開いたファイルの鍵(保存で使う。js/edit.js)。ブラウザを開き直すと鍵は消える(→ ptreeSrcResolve で引き直す)
function ptreeSrcHandle(src) { return (src && ptreeState.files.get(src)) || null; }
// 【2026-10-05】ツリーの道筋からファイルの鍵を引き直す(ブラウザを開き直したあと。ページの _src は自動保存に残っている)。
// 盛田さん「履歴のこらない」「窓が出た」→ 案C。フォルダの許可が要れば聞く(保存を押した直後に呼ぶ)。ファイルが無ければ null(=保存の窓)
async function ptreeSrcResolve(src) {
  const h0 = ptreeSrcHandle(src);
  if (h0) return h0;
  if (!src || src[0] !== '/') return null;
  if (!ptreeState.root && !ptreeState.detached) { try { ptreeState.root = await _stGet(PTREE_KEY) || null; } catch (e) {} }
  if (!ptreeState.root || !await _ptPerm(ptreeState.root, true)) return null;
  try { const q = await _ptParent(src); const h = await q.dir.getFileHandle(q.name); ptreeState.files.set(src, h); return h; }
  catch (e) { return null; }
}

const _ptEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _ptCmp = (a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true });

// フォルダの中身: フォルダが先、次に図面。名前の自然順(Sheet2 < Sheet10)
async function ptreeList(dir) {
  const dirs = [], files = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') { if (name !== PTREE_HIST) dirs.push({ name, h }); }   // 履歴の隠しフォルダは出さない
    else if (PTREE_EXT.test(name)) files.push({ name, h });
  }
  return dirs.sort(_ptCmp).concat(files.sort(_ptCmp));
}

async function _ptPerm(h, ask) {
  let st = 'prompt';
  try { st = await h.queryPermission({ mode: 'readwrite' }); } catch (e) {}
  if (st !== 'granted' && ask) { try { st = await h.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
  return st === 'granted';
}

// 「フォルダを開く」
async function ptreeChooseRoot() {
  if (!window.showDirectoryPicker) { alert('このブラウザはフォルダ選択に対応していません(Chrome/Edgeで開いてください)'); return; }
  let dir;
  try {
    const opt = { id: 'ecad-ptree', mode: 'readwrite' };
    if (ptreeState.root) opt.startIn = ptreeState.root;
    dir = await window.showDirectoryPicker(opt);
  } catch (e) { return; }   // 取りやめ
  let same = false;
  try { same = !!ptreeState.root && await ptreeState.root.isSameEntry(dir); } catch (e) {}
  // 別のフォルダにしたら、ページが覚えている道筋は外す(同じ道筋の別のファイルに上書きしないため。保存は名前を付けて保存になる)
  if (!same) (state.pages || []).forEach(p => { if (p._src && p._src[0] === '/') delete p._src; });
  ptreeState.root = dir; ptreeState.open = new Set(); ptreeState.files = new Map(); ptreeState.detached = false;
  try { await _stPut(PTREE_PREV_KEY, null); } catch (e) {}
  if (typeof xprojState !== 'undefined') { xprojState.files = []; xprojState.problems = []; xprojState.dirName = ''; }   // 前のフォルダの別ファイルを使わない(部品表・「更新」で読み直す)
  try { await _stPut(PTREE_KEY, dir); } catch (e) {}
  ptreeRender();
}

// 【2026-10-06】「読込」で図面を置き換えて開いたら、プロジェクトのフォルダを外す(js/edit.js loadProjectText)。
// 盛田さん: 仕様１－１を読込で開いたら、ツリーが仕様２のフォルダのままで、部品表が仕様２の別ファイルまで集計して食い違いが出た
// →「読込したらプロジェクト側をリセット」。読込の図面がどのフォルダのものかはブラウザからは分からないため。
// 前のフォルダは PTREE_PREV_KEY に覚え、ツリーの「前のフォルダに戻す」で戻せる。ツリーから開く・ページとして足す・読込の「追加」では外さない
async function ptreeDetach() {
  const prev = ptreeState.root;
  ptreeState.detached = true;
  ptreeState.root = null; ptreeState.open = new Set(); ptreeState.files = new Map();
  if (typeof xprojState !== 'undefined') { xprojState.files = []; xprojState.problems = []; xprojState.dirName = ''; }
  try {
    const p = prev || await _stGet(PTREE_KEY);
    if (p) await _stPut(PTREE_PREV_KEY, p);
    await _stPut(PTREE_KEY, null);
  } catch (e) {}
  ptreeRender();
}
// 「前のフォルダに戻す」
async function ptreeRestorePrev() {
  let prev = null;
  try { prev = await _stGet(PTREE_PREV_KEY); } catch (e) {}
  if (!prev) return;
  if (!await _ptPerm(prev, true)) return;
  ptreeState.root = prev; ptreeState.detached = false; ptreeState.open = new Set(); ptreeState.files = new Map();
  if (typeof xprojState !== 'undefined') { xprojState.files = []; xprojState.problems = []; xprojState.dirName = ''; }
  try { await _stPut(PTREE_KEY, prev); await _stPut(PTREE_PREV_KEY, null); } catch (e) {}
  ptreeRender();
}

// 前回のフォルダの許可を取り直す(ブラウザは押した直後でないと許可を聞けない)
async function ptreeGrant() {
  if (ptreeState.root && await _ptPerm(ptreeState.root, true)) ptreeRender();
}

function ptreeToggle(path) {
  if (ptreeState.open.has(path)) ptreeState.open.delete(path); else ptreeState.open.add(path);
  ptreeRender();
}

async function _ptRead(h) {
  try { return await (await h.getFile()).text(); }
  catch (e) { alert(`「${h.name}」を読めませんでした（${e && e.message || e}）`); return null; }
}

// 図面を押した: 今の図面と置き換えて開く
async function ptreeOpenFile(path) {
  const h = _ptFind(path);
  if (!h) return;
  const dirty = (state.pages || []).some(p => p.dirty);
  if (dirty && !confirm(`保存していないページがあります。\n「${h.name}」に置き換えますか？\n(取り消し Ctrl+Z で今の図面に戻せます)`)) return;
  const text = await _ptRead(h);
  if (text == null) return;
  if (!loadProjectText(text, h.name, 'replace')) return;
  ptreeState.files.set(path, h);
  state.pages.forEach(p => { p._src = path; });
  ptreeRender();
}

// 行の「＋」: 今の図面の後ろにページとして足す。同じファイルを2回は足さない(保存で同じページが二重に書かれるため)
async function ptreeAddFile(path) {
  const h = _ptFind(path);
  if (!h) return;
  const i = (state.pages || []).findIndex(p => p._src === path);
  if (i >= 0) { if (typeof switchPage === 'function') switchPage(i); if (typeof stToast === 'function') stToast(`「${h.name}」はもう開いています`, 'warn'); return; }
  const text = await _ptRead(h);
  if (text == null) return;
  const n0 = state.pages.length;
  if (!loadProjectText(text, h.name, 'append')) return;
  ptreeState.files.set(path, h);
  state.pages.slice(n0).forEach(p => { p._src = path; });
  ptreeRender();
}

// 描くときに道筋 → ファイルの鍵を覚えておく(onclick に鍵を渡せないため)
let _ptHandles = new Map();
function _ptFind(path) { return _ptHandles.get(path) || null; }

async function _ptRows(dir, path, depth, out, handles) {
  let items;
  try { items = await ptreeList(dir); }
  catch (e) { out.push(`<div class="pt-row pt-err" style="padding-left:${8 + depth * 14}px">読めません（${_ptEsc(e && e.message || e)}）</div>`); return; }
  for (const it of items) {
    const p = path + '/' + it.name;
    const pad = `padding-left:${8 + depth * 14}px`;
    if (it.h.kind === 'directory') {
      const op = ptreeState.open.has(p);
      out.push(`<div class="pt-row pt-dir" style="${pad}" data-path="${_ptEsc(p)}" onclick="ptreeToggle(this.dataset.path)" oncontextmenu="ptreeMenu(event,this.dataset.path,'dir')" title="${_ptEsc(it.name)}">${op ? '▾' : '▸'} 📁 ${_ptEsc(it.name)}</div>`);
      if (op) await _ptRows(it.h, p, depth + 1, out, handles);
    } else {
      handles.set(p, it.h);
      const cur = (state.pages || []).some(pg => pg._src === p) ? ' on' : '';   // 今開いているページのファイル
      out.push(`<div class="pt-row pt-file${cur}" style="${pad}" data-path="${_ptEsc(p)}" onclick="ptreeOpenFile(this.dataset.path)" oncontextmenu="ptreeMenu(event,this.dataset.path,'file')" title="押すと今の図面と置き換えて開きます(右クリックで名前の変更・削除など)">　📄 ${_ptEsc(it.name.replace(PTREE_EXT, ''))}<span class="pt-add" onclick="event.stopPropagation();ptreeAddFile(this.parentNode.dataset.path)" title="今の図面の後ろにページとして足します(コピー・貼り付け用。保存するとこのファイルに書きます)">＋</span></div>`);
    }
  }
  if (!items.length && depth) out.push(`<div class="pt-row pt-empty" style="padding-left:${8 + depth * 14}px">(図面なし)</div>`);
}

let _ptSeq = 0;
async function ptreeRender() {
  const body = document.getElementById('prj-float-body');
  const name = document.getElementById('prj-float-root');
  if (!body) return;
  const seq = ++_ptSeq;   // 描いている途中に次が来たら古い方は捨てる
  if (!ptreeState.root && !ptreeState.detached) {
    try { ptreeState.root = await _stGet(PTREE_KEY) || null; } catch (e) {}
  }
  const root = ptreeState.root;
  if (name) name.textContent = root ? root.name : '';
  if (!root) {
    let prev = null;
    try { prev = await _stGet(PTREE_PREV_KEY); } catch (e) {}
    if (seq !== _ptSeq) return;
    if (prev) { body.innerHTML = `<div class="pt-msg">読込で開いた図面はプロジェクトの外です(部品表などはこの図面だけを集計します)。<br><button onclick="ptreeChooseRoot()">フォルダを開く</button> <button onclick="ptreeRestorePrev()">前のフォルダ${prev.name ? `(${_ptEsc(prev.name)})` : ''}に戻す</button></div>`; return; }
    body.innerHTML = '<div class="pt-msg">「フォルダを開く」でプロジェクトのフォルダを選んでください。<br>フォルダと図面(.seqzu)をエクスプローラと同じに並べます。</div>'; return; }
  if (!await _ptPerm(root, false)) {
    if (seq !== _ptSeq) return;
    body.innerHTML = `<div class="pt-msg">前回のフォルダ「${_ptEsc(root.name)}」を開く許可が要ります。<br><button onclick="ptreeGrant()">許可して開く</button></div>`;
    return;
  }
  const out = [], handles = new Map();
  await _ptRows(root, '', 0, out, handles);
  if (seq !== _ptSeq) return;
  _ptHandles = handles;
  body.innerHTML = out.join('') || '<div class="pt-msg">このフォルダに図面(.seqzu)はありません</div>';
}

// ================================================================
// 作成・名前の変更・削除(2026-10-05)
// ================================================================
const _PT_BAD = /[\\/:*?"<>|\x00-\x1f]/;
function _ptCheckName(n) {
  n = String(n == null ? '' : n).trim();
  if (!n || n === '.' || n === '..') return { err: '名前が空です' };
  if (_PT_BAD.test(n)) return { err: '名前に \\ / : * ? " < > | は使えません' };
  return { name: n };
}
// 道筋('/盤外/Sheet1.seqzu') → 親フォルダの鍵と名前。根は ''
async function _ptParent(path) {
  const parts = String(path).split('/').filter(Boolean);
  let d = ptreeState.root;
  for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
  return { dir: d, name: parts[parts.length - 1] || '', parentPath: parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '' };
}
async function _ptDir(dirPath) {
  let d = ptreeState.root;
  for (const n of String(dirPath || '').split('/').filter(Boolean)) d = await d.getDirectoryHandle(n);
  return d;
}
async function _ptExists(dir, name) {
  for await (const [n] of dir.entries()) if (n.toLowerCase() === name.toLowerCase()) return true;   // Windows は大文字小文字を区別しない
  return false;
}
function _ptAsk(msg, def) { return (typeof prompt === 'function') ? prompt(msg, def) : null; }
function _ptDone(msg) { if (typeof stToast === 'function') stToast(msg, 'ok'); ptreeRender(); }

// 新しい図面(白紙1ページ)。dirPath: 作る場所(根は '')
async function ptreeNewFile(dirPath) {
  if (!ptreeState.root) return;
  const r = _ptCheckName(_ptAsk('新しい図面の名前(拡張子 .seqzu は付けます)', 'Sheet1'));
  if (r.err) { if (r.err !== '名前が空です') alert(r.err); return; }
  const base = r.name.replace(PTREE_EXT, ''), fname = base + '.seqzu';
  try {
    const dir = await _ptDir(dirPath);
    if (await _ptExists(dir, fname)) { alert(`「${fname}」はもうあります`); return; }
    const pg = { name: base, elements: [], wires: [], groups: [], guides: [], frameObj: null };
    const text = (typeof _saveJSON === 'function' && typeof _saveData === 'function')
      ? _saveJSON(_saveData([pg], base.replace(/_[^_]+$/, ''))) : JSON.stringify({ version: 2, pages: [pg] }, null, 2);
    const fh = await dir.getFileHandle(fname, { create: true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
  } catch (e) { alert(`図面を作れませんでした（${e && e.message || e}）`); return; }
  if (dirPath) ptreeState.open.add(dirPath);
  _ptDone(`図面を作りました: ${fname}`);
}

async function ptreeNewFolder(dirPath) {
  if (!ptreeState.root) return;
  const r = _ptCheckName(_ptAsk('新しいフォルダの名前', '新しいフォルダ'));
  if (r.err) { if (r.err !== '名前が空です') alert(r.err); return; }
  try {
    const dir = await _ptDir(dirPath);
    if (await _ptExists(dir, r.name)) { alert(`「${r.name}」はもうあります`); return; }
    await dir.getDirectoryHandle(r.name, { create: true });
  } catch (e) { alert(`フォルダを作れませんでした（${e && e.message || e}）`); return; }
  if (dirPath) ptreeState.open.add(dirPath);
  _ptDone(`フォルダを作りました: ${r.name}`);
}

// 開いているページ・覚えている鍵・開いているフォルダの道筋を付け替える(名前の変更)。to=null なら外す(削除)
function _ptRepath(from, to, isDir) {
  const hit = p => isDir ? (p === from || p.startsWith(from + '/')) : p === from;
  const conv = p => to + p.slice(from.length);
  (state.pages || []).forEach(pg => {
    if (!pg._src || !hit(pg._src)) return;
    if (to) pg._src = conv(pg._src); else { delete pg._src; pg.dirty = true; }   // 消したファイルのページは未保存(保存で名前を付ける)
  });
  [...ptreeState.files.keys()].filter(hit).forEach(k => { const h = ptreeState.files.get(k); ptreeState.files.delete(k); if (to && !isDir) ptreeState.files.set(conv(k), h); });
  [...ptreeState.open].filter(hit).forEach(k => { ptreeState.open.delete(k); if (to) ptreeState.open.add(conv(k)); });
  if (typeof renderPageTabs === 'function') renderPageTabs();
}

async function ptreeRename(path, kind) {
  if (!ptreeState.root || !path) return;
  const isDir = kind === 'dir';
  let par;
  try { par = await _ptParent(path); } catch (e) { alert(`見つかりません（${e && e.message || e}）`); return; }
  const cur = isDir ? par.name : par.name.replace(PTREE_EXT, '');
  const r = _ptCheckName(_ptAsk(isDir ? 'フォルダの新しい名前' : '図面の新しい名前(拡張子 .seqzu は付けます)', cur));
  if (r.err) { if (r.err !== '名前が空です') alert(r.err); return; }
  const nn = isDir ? r.name : r.name.replace(PTREE_EXT, '') + '.seqzu';
  if (nn === par.name) return;
  if (nn.toLowerCase() !== par.name.toLowerCase() && await _ptExists(par.dir, nn)) { alert(`「${nn}」はもうあります`); return; }
  try {
    const h = isDir ? await par.dir.getDirectoryHandle(par.name) : await par.dir.getFileHandle(par.name);
    if (typeof h.move === 'function') {
      await h.move(nn);
    } else if (!isDir) {
      // move の無いブラウザ: 新しい名前に写して、同じ中身か確かめてから元を消す
      const text = await (await h.getFile()).text();
      const nh = await par.dir.getFileHandle(nn, { create: true });
      const w = await nh.createWritable(); await w.write(text); await w.close();
      if (await (await nh.getFile()).text() !== text) throw new Error('写した中身が元と違います(元のファイルは消していません)');
      await par.dir.removeEntry(par.name);
    } else {
      // フォルダ(move の無いブラウザ): 新しい名前のフォルダに中身を全部写し、大きさを確かめてから元を消す。途中で失敗したら写しを消して元は残す
      const nd = await par.dir.getDirectoryHandle(nn, { create: true });
      try { await _ptCopyDir(h, nd); }
      catch (e) { try { await par.dir.removeEntry(nn, { recursive: true }); } catch (e2) {} throw new Error(`写せませんでした(元のフォルダはそのまま): ${e && e.message || e}`); }
      await par.dir.removeEntry(par.name, { recursive: true });
    }
    const to = par.parentPath + '/' + nn;
    try { await _ptHistMove(path, nn); }   // 履歴も新しい名前へ
    catch (e) { if (typeof stToast === 'function') stToast(`履歴を新しい名前へ移せませんでした（${e && e.message || e}）。履歴は ${PTREE_HIST} の元の名前に残っています`, 'warn'); }
    if (!isDir) ptreeState.files.has(path) && ptreeState.files.set(path, await par.dir.getFileHandle(nn));
    _ptRepath(path, to, isDir);
    if (isDir) {   // フォルダの中のファイルの鍵は付け替えられないので、開いているページの鍵を引き直す
      for (const pg of state.pages || []) if (pg._src && pg._src.startsWith(to + '/') && !ptreeState.files.has(pg._src)) {
        try { const q = await _ptParent(pg._src); ptreeState.files.set(pg._src, await q.dir.getFileHandle(q.name)); } catch (e) {}
      }
    }
  } catch (e) { alert(`名前を変えられませんでした（${e && e.message || e}）`); return; }
  _ptDone(`名前を変えました: ${nn}`);
}

// フォルダの中身を全部写す(ファイルは大きさを確かめる)
async function _ptCopyDir(src, dst) {
  for await (const [n, h] of src.entries()) {
    if (h.kind === 'directory') { await _ptCopyDir(h, await dst.getDirectoryHandle(n, { create: true })); continue; }
    const f = await h.getFile();
    const nh = await dst.getFileHandle(n, { create: true });
    const w = await nh.createWritable(); await w.write(f); await w.close();
    if ((await nh.getFile()).size !== f.size) throw new Error(`「${n}」の大きさが合いません`);
  }
}

// 消す前の控え: 図面をバックアップに取る(設定タブのバックアップから戻せる)。取れなければ例外
async function _ptBackup(name, text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`「${name}」は図面として読めないので控えを取れません`); }
  const r = await fetch('/api/backup/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '削除_' + name.replace(PTREE_EXT, ''), keep: 999, data }) });
  const j = await r.json();
  if (!j.ok) throw new Error(`「${name}」の控えを取れませんでした（${j.error || 'サーバー'}）`);
}

async function ptreeDelete(path, kind) {
  if (!ptreeState.root || !path) return;
  const isDir = kind === 'dir';
  let par, files = [], others = [];
  try {
    par = await _ptParent(path);
    if (isDir) {
      const walk = async (d, pre) => {
        for await (const [n, h] of d.entries()) {
          if (h.kind === 'directory') await walk(h, pre + n + '/');
          else if (PTREE_EXT.test(n)) files.push({ name: pre + n, h });
          else others.push(pre + n);
        }
      };
      await walk(await par.dir.getDirectoryHandle(par.name), '');
    } else files.push({ name: par.name, h: await par.dir.getFileHandle(par.name) });
  } catch (e) { alert(`見つかりません（${e && e.message || e}）`); return; }
  if (others.length) { alert(`フォルダ「${par.name}」には図面以外のファイルがあるので、ここでは削除しません。エクスプローラで削除してください。\n${others.slice(0, 10).join('\n')}${others.length > 10 ? '\n…' : ''}`); return; }
  const dirtyOpen = (state.pages || []).some(pg => pg.dirty && pg._src && (pg._src === path || pg._src.startsWith(path + '/')));
  const what = isDir ? `フォルダ「${par.name}」と中の図面 ${files.length} 件` : `図面「${par.name}」`;
  if (!confirm(`${what}を削除します。\n\n削除する前に図面をバックアップに取ります(設定タブのバックアップから「削除_〇〇」で戻せます)。`
    + (dirtyOpen ? '\n\n開いているページは図面に残ります(保存すると名前を付けて保存になります)。' : '') + '\n\n削除しますか？')) return;
  try {
    for (const f of files) await _ptBackup(f.name.split('/').pop(), await (await f.h.getFile()).text());
  } catch (e) { alert(`${e && e.message || e}\n\n控えが取れないので削除しませんでした(start.bat でサーバーが動いているか確認してください)。`); return; }
  try { await par.dir.removeEntry(par.name, { recursive: isDir }); }
  catch (e) { alert(`削除できませんでした（${e && e.message || e}）`); return; }
  _ptRepath(path, null, isDir);
  _ptDone(`削除しました: ${par.name}(バックアップに控えがあります)`);
}

// ================================================================
// 履歴(世代管理)(2026-10-05)
// 盛田さん「上書きした場合、バックアップからしか戻らない」「世代管理できないな」→ おすすめ(上書きのたび・フォルダの中・20件・右クリックで履歴)で決定。
//   ・上書き保存(js/edit.js saveToSrcFile)の直前に、**上書きされる前の中身**を
//     <プロジェクトのフォルダ>/.seqzu_history/<フォルダ>/<図面名>_履歴/<日時>.seqzu に写す(盛田さん「履歴でいい」=図面ごとのフォルダ名。最初は <図面名>.seqzu でファイルと見分けにくかった)。日時はその中身を保存した時刻(ファイルの更新時刻)
//   ・中身が変わらない上書きでは残さない。図面ごとに新しい方から PTREE_HIST_KEEP 件、古いものは消す
//   ・フォルダの外のファイル(ext:)には残さない(置き場所が無いため)。ツリー・台帳(xprojReadList)には出さない
//   ・フォルダごと持ち運べば履歴も付いてくる。名前を変えると履歴も付いていく。削除しても履歴は残す(同じ名前で作ればその履歴に見える)
//   ・戻し方: 右クリック「履歴…」→ 版を「開く」= 今の図面と置き換えて開き、保存先は元のファイルのまま(未保存)。
//     上書き保存でその版に戻る(そのとき今のファイルの中身も履歴に残る)。別に取っておくなら「名前を付けて保存」
// ================================================================
const _ptStamp = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
// 図面の名前 → 履歴のフォルダの名前('A.seqzu' → 'A_履歴')。フォルダの名前はそのまま
const _ptHistName = n => PTREE_EXT.test(n) ? n.replace(PTREE_EXT, '') + '_履歴' : n;
// par の中のフォルダ old を nn にする(move が無いブラウザは写して元を消す。nn が既にあれば中身を合わせる)
async function _ptMoveDir(par, old, nn) {
  const h = await par.getDirectoryHandle(old);
  if (old.toLowerCase() === nn.toLowerCase()) { if (typeof h.move === 'function') await h.move(nn); return; }   // 大文字小文字だけの変更(Windowsでは同じ名前)
  if (typeof h.move === 'function' && !await _ptExists(par, nn)) { await h.move(nn); return; }
  await _ptCopyDir(h, await par.getDirectoryHandle(nn, { create: true }));
  await par.removeEntry(old, { recursive: true });
}
// 道筋('/盤外/A.seqzu'。根は '') → 履歴の中のフォルダ(.seqzu_history/盤外/A_履歴)。create=false で無ければ例外。
// 最初の作りの名前(.seqzu_history/盤外/A.seqzu)の履歴があれば新しい名前へ移す
async function _ptHistDir(path, create) {
  let d = await ptreeState.root.getDirectoryHandle(PTREE_HIST, { create: !!create });
  for (const n of String(path || '').split('/').filter(Boolean)) {
    const hn = _ptHistName(n);
    if (hn !== n) { try { if (await _ptExists(d, n) && (await d.getDirectoryHandle(n)).kind === 'directory') await _ptMoveDir(d, n, hn); } catch (e) {} }
    d = await d.getDirectoryHandle(hn, { create: !!create });
  }
  return d;
}
// 図面の版の一覧(新しい順)。[{ name: '2026-10-05_143000.seqzu', h }]
async function ptreeHistList(path) {
  let d;
  try { d = await _ptHistDir(path, false); } catch (e) { return []; }
  const out = [];
  for await (const [n, h] of d.entries()) if (h.kind === 'file' && PTREE_EXT.test(n)) out.push({ name: n, h });
  return out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}
// 上書きの直前に呼ぶ。fh: 上書きするファイル、newText: これから書く中身。戻り値: 残した版の名前(残さなかったら '')。書けなければ例外
async function ptreeHistSave(src, fh, newText) {
  if (!ptreeState.root || !src || src[0] !== '/') return '';
  let f;
  try { f = await fh.getFile(); } catch (e) { return ''; }   // まだ無いファイル
  const old = await f.text();
  if (!old || old === newText) return '';
  const d = await _ptHistDir(src, true);
  const st = _ptStamp(f.lastModified || Date.now());
  let name = st + '.seqzu';
  for (let i = 2; await _ptExists(d, name); i++) name = `${st}_${i}.seqzu`;
  const h = await d.getFileHandle(name, { create: true });
  const w = await h.createWritable(); await w.write(old); await w.close();
  for (const x of (await ptreeHistList(src)).slice(PTREE_HIST_KEEP)) { try { await d.removeEntry(x.name); } catch (e) {} }
  return name;
}
// 保存の窓(js/settings.js stWriteOut)で書く直前: プロジェクトのフォルダの中の図面なら、上書きの前の中身を履歴に残す(案C)
async function ptreeHistBeforeWrite(fh, blob) {
  if (!ptreeState.root || !fh || !PTREE_EXT.test(fh.name)) return '';
  let parts = null;
  try { parts = await ptreeState.root.resolve(fh); } catch (e) {}
  if (!parts || !parts.length || parts[0] === PTREE_HIST) return '';   // フォルダの外・履歴の中
  return ptreeHistSave('/' + parts.join('/'), fh, typeof blob === 'string' ? blob : await blob.text());
}
// 名前の変更で履歴も付けていく。from: 元の道筋、nn: 新しい名前(同じフォルダの中)
async function _ptHistMove(from, nn) {
  if (!ptreeState.root) return;
  try { await _ptHistDir(from, false); } catch (e) { return; }   // 履歴なし(最初の作りの名前ならここで移る)
  const fp = String(from).split('/').filter(Boolean), old = _ptHistName(fp.pop());
  const par = await _ptHistDir(fp.join('/'), false);
  await _ptMoveDir(par, old, _ptHistName(nn));   // 同じ名前の古い履歴(消した図面の)があれば合わせる
}
const _ptHistLabel = n => n.replace(PTREE_EXT, '').replace(/^(\d{4}-\d\d-\d\d)_(\d\d)(\d\d)(\d\d)(?:_(\d+))?$/, (m, d, h, mi, s, k) => `${d} ${h}:${mi}:${s}${k ? ` (${k})` : ''}`);

// 右クリック「履歴…」: 版の一覧
async function ptreeHistShow(path) {
  ptreeHistClose();
  const list = await ptreeHistList(path);
  const fname = path.split('/').pop();
  const rows = [];
  for (const x of list) {
    let size = '';
    try { size = Math.max(1, Math.round((await x.h.getFile()).size / 1024)) + ' KB'; } catch (e) {}
    rows.push(`<div class="pt-hrow" style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--bd2,#ddd)"><span style="flex:1">${_ptEsc(_ptHistLabel(x.name))}</span><span style="color:var(--fg3,#888);font-size:11px">${size}</span><button data-name="${_ptEsc(x.name)}" onclick="ptreeHistOpen(${_ptEsc(JSON.stringify(path))},this.dataset.name)" style="font-size:11px;padding:1px 8px;cursor:pointer">開く</button></div>`);
  }
  const m = document.createElement('div');
  m.id = 'pt-hist';
  m.style.cssText = 'position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:10002;background:var(--bg2,#fff);color:var(--fg,#000);border:1px solid var(--bd2,#888);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.45);padding:10px 14px;font-size:12px;width:380px;max-height:70vh;display:flex;flex-direction:column';
  m.innerHTML = `<div style="font-weight:bold;margin-bottom:4px">履歴: ${_ptEsc(fname.replace(PTREE_EXT, ''))}</div>`
    + `<div style="color:var(--fg3,#888);font-size:11px;margin-bottom:6px">上書き保存する前の中身です(新しい順・${PTREE_HIST_KEEP}件まで。時刻はその中身を保存した時刻)。<br>「開く」と今の図面と置き換えて開きます。上書き保存するとその版に戻ります(今のファイルの中身も履歴に残ります)。</div>`
    + `<div style="overflow-y:auto;flex:1">${rows.join('') || '<div style="color:var(--fg3,#888);padding:6px 0">履歴はまだありません(上書き保存すると残ります)</div>'}</div>`
    + `<div style="text-align:right;margin-top:8px"><button onclick="ptreeHistClose()" style="font-size:12px;padding:2px 12px;cursor:pointer">閉じる</button></div>`;
  document.body.appendChild(m);
}
function ptreeHistClose() { const m = document.getElementById('pt-hist'); if (m) m.remove(); }

// 版を開く: 今の図面と置き換え、保存先は元のファイルのまま(未保存にする)
async function ptreeHistOpen(path, name) {
  let fh, hh;
  try {
    fh = _ptFind(path) || await (async () => { const q = await _ptParent(path); return q.dir.getFileHandle(q.name); })();
    hh = await (await _ptHistDir(path, false)).getFileHandle(name);
  } catch (e) { alert(`履歴を開けませんでした（${e && e.message || e}）`); return; }
  const dirty = (state.pages || []).some(p => p.dirty);
  if (dirty && !confirm(`保存していないページがあります。\n「${fh.name}」の ${_ptHistLabel(name)} の版に置き換えますか？\n(取り消し Ctrl+Z で今の図面に戻せます)`)) return;
  const text = await _ptRead(hh);
  if (text == null) return;
  if (!loadProjectText(text, fh.name, 'replace')) return;
  ptreeState.files.set(path, fh);
  state.pages.forEach(p => { p._src = path; p.dirty = true; });
  ptreeHistClose();
  if (typeof renderPageTabs === 'function') renderPageTabs();
  ptreeRender();
  if (typeof stToast === 'function') stToast(`「${fh.name}」の ${_ptHistLabel(name)} の版を開きました。上書き保存するとこの版に戻ります`, 'ok');
}

// 右クリックのメニュー
function ptreeMenu(ev, path, kind) {
  ev.preventDefault(); ev.stopPropagation();
  ptreeMenuClose();
  if (!ptreeState.root) return;
  const dirPath = kind === 'dir' ? path : kind === 'file' ? path.split('/').slice(0, -1).join('/') : '';
  const items = [];
  if (kind === 'file') items.push(['開く(置き換え)', () => ptreeOpenFile(path)], ['ページとして足す', () => ptreeAddFile(path)], ['履歴…', () => ptreeHistShow(path)], null);
  items.push(['新しい図面', () => ptreeNewFile(dirPath)], ['新しいフォルダ', () => ptreeNewFolder(dirPath)]);
  if (kind === 'file' || kind === 'dir') items.push(null, ['名前の変更', () => ptreeRename(path, kind)], ['削除', () => ptreeDelete(path, kind)]);
  const m = document.createElement('div');
  m.id = 'pt-menu';
  m.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;z-index:10002;background:var(--bg2,#fff);color:var(--fg,#000);border:1px solid var(--bd2,#888);border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.35);padding:3px 0;font-size:12px;min-width:150px`;
  items.forEach(it => {
    if (!it) { const hr = document.createElement('div'); hr.style.cssText = 'border-top:1px solid var(--bd2,#ccc);margin:3px 0'; m.appendChild(hr); return; }
    const d = document.createElement('div');
    d.textContent = it[0];
    d.className = 'pt-mi';
    d.style.cssText = 'padding:4px 14px;cursor:pointer;white-space:nowrap' + (it[0] === '削除' ? ';color:var(--red,#c33)' : '');
    d.onclick = () => { ptreeMenuClose(); it[1](); };
    m.appendChild(d);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();   // 画面の外にはみ出さない
  if (r.right > innerWidth) m.style.left = Math.max(0, innerWidth - r.width - 4) + 'px';
  if (r.bottom > innerHeight) m.style.top = Math.max(0, innerHeight - r.height - 4) + 'px';
  setTimeout(() => {
    document.addEventListener('mousedown', _ptMenuOut, true);
    document.addEventListener('keydown', _ptMenuKey, true);
  }, 0);
}
function _ptMenuOut(e) { const m = document.getElementById('pt-menu'); if (m && !m.contains(e.target)) ptreeMenuClose(); }
function _ptMenuKey(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); ptreeMenuClose(); } }
function ptreeMenuClose() {
  const m = document.getElementById('pt-menu'); if (m) m.remove();
  document.removeEventListener('mousedown', _ptMenuOut, true);
  document.removeEventListener('keydown', _ptMenuKey, true);
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['proj_tree.js'] = 1;
