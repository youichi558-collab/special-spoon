// ================================================================
// proj_tree.js — 左パネルの「プロジェクト」= フォルダのツリー(2026-10-04)
//
// 盛田さん「普通のcadは左にパネル出してプロジェクト内のファイルを出している」「ツリーはエクスプローラそのままで構わん」。
//   ・いちばん上の「フォルダを開く」でプロジェクトのフォルダ(ツリーの根)を選ぶ。次回は同じフォルダから(許可が要れば押して許可)
//   ・フォルダはエクスプローラと同じに開閉。出すのはフォルダと図面(.seqzu)だけ(図面でないファイルは拡張子で見えない。以前の .json も出さない)
//   ・図面を押すと今の図面と置き換えて開く(未保存のページがあれば確認。取り消しで戻せる)
//   ・「今の図面の後ろにページとして足す」と、開いた図面への保存は盛田さんと相談中(HANDOFF 1-3)。ファイルの作成・名前変更・削除はしない
// ================================================================

const PTREE_KEY = 'ptree';                       // IndexedDB(settings.js の _stGet/_stPut)に覚えるフォルダの鍵
const PTREE_EXT = /\.seqzu$/i;
const ptreeState = { root: null, open: new Set(), current: '' };   // open: 開いているフォルダの道筋 / current: 開いた図面の道筋

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
  ptreeState.root = dir; ptreeState.open = new Set(); ptreeState.current = '';
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

// 図面を押した: 今の図面と置き換えて開く
async function ptreeOpenFile(path) {
  const h = _ptFind(path);
  if (!h) return;
  const dirty = (state.pages || []).some(p => p.dirty);
  if (dirty && !confirm(`保存していないページがあります。\n「${h.name}」に置き換えますか？\n(取り消し Ctrl+Z で今の図面に戻せます)`)) return;
  let text;
  try { text = await (await h.getFile()).text(); }
  catch (e) { alert(`「${h.name}」を読めませんでした（${e && e.message || e}）`); return; }
  loadProjectText(text, h.name, 'replace');
  ptreeState.current = path;
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
      const cur = p === ptreeState.current ? ' on' : '';
      out.push(`<div class="pt-row pt-file${cur}" style="${pad}" data-path="${_ptEsc(p)}" onclick="ptreeOpenFile(this.dataset.path)" title="押すと今の図面と置き換えて開きます">　📄 ${_ptEsc(it.name.replace(PTREE_EXT, ''))}</div>`);
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
