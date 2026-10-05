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
//   ・ファイルの作成・名前変更・削除はしない
// ================================================================

const PTREE_KEY = 'ptree';                       // IndexedDB(settings.js の _stGet/_stPut)に覚えるフォルダの鍵
const PTREE_EXT = /\.seqzu$/i;
const ptreeState = { root: null, open: new Set(), files: new Map() };   // open: 開いているフォルダの道筋 / files: 開いた図面の道筋 → ファイルの鍵

// ページが開いたファイルの鍵(保存で使う。js/edit.js)。ブラウザを開き直すと鍵は消える(そのときの保存は「名前を付けて保存」)
function ptreeSrcHandle(src) { return (src && ptreeState.files.get(src)) || null; }

const _ptEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _ptCmp = (a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true });

// フォルダの中身: フォルダが先、次に図面。名前の自然順(Sheet2 < Sheet10)
async function ptreeList(dir) {
  const dirs = [], files = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') dirs.push({ name, h });
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
  ptreeState.root = dir; ptreeState.open = new Set(); ptreeState.files = new Map();
  if (typeof xprojState !== 'undefined') { xprojState.files = []; xprojState.problems = []; xprojState.dirName = ''; }   // 前のフォルダの別ファイルを使わない(部品表・「更新」で読み直す)
  try { await _stPut(PTREE_KEY, dir); } catch (e) {}
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
      out.push(`<div class="pt-row pt-dir" style="${pad}" data-path="${_ptEsc(p)}" onclick="ptreeToggle(this.dataset.path)" title="${_ptEsc(it.name)}">${op ? '▾' : '▸'} 📁 ${_ptEsc(it.name)}</div>`);
      if (op) await _ptRows(it.h, p, depth + 1, out, handles);
    } else {
      handles.set(p, it.h);
      const cur = (state.pages || []).some(pg => pg._src === p) ? ' on' : '';   // 今開いているページのファイル
      out.push(`<div class="pt-row pt-file${cur}" style="${pad}" data-path="${_ptEsc(p)}" onclick="ptreeOpenFile(this.dataset.path)" title="押すと今の図面と置き換えて開きます">　📄 ${_ptEsc(it.name.replace(PTREE_EXT, ''))}<span class="pt-add" onclick="event.stopPropagation();ptreeAddFile(this.parentNode.dataset.path)" title="今の図面の後ろにページとして足します(コピー・貼り付け用。保存するとこのファイルに書きます)">＋</span></div>`);
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
  if (!ptreeState.root) {
    try { ptreeState.root = await _stGet(PTREE_KEY) || null; } catch (e) {}
  }
  const root = ptreeState.root;
  if (name) name.textContent = root ? root.name : '';
  if (!root) { body.innerHTML = '<div class="pt-msg">「フォルダを開く」でプロジェクトのフォルダを選んでください。<br>フォルダと図面(.seqzu)をエクスプローラと同じに並べます。</div>'; return; }
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

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['proj_tree.js'] = 1;
