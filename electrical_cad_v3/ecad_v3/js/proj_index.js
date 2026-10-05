// ================================================================
// proj_index.js — プロジェクト台帳(2026-10-04 作る順の1。盛田さん承認の設計は HANDOFF「1-1」)
//
// 【なぜ】図面は1ページ1ファイルで、数百〜数千ページありうる(盛田さん)。部品表・端子台表など盤全体の帳票のたびに
// 全ファイルを丸ごと読むのは重い。そこでプロジェクトのフォルダ(左パネルの「プロジェクト」で開いたフォルダ)に、ページごとの「帳票に要る情報だけ」を抜き出した
// 台帳 project.seqzuidx を1つ置く。
//
// 【性質】**正はページのファイル、台帳はその写し(キャッシュ)**。消えても作り直せる。
//   ・ファイルごとに更新日時・サイズを覚え、比べて**変わったファイルだけ読み直す**(受け取って差し替えたファイルも拾う)
//   ・抜き出し方を変えたら PIDX_VER を上げる(全部読み直す)
//   ・別の窓が同時に書いても写しなので壊れない(次に比べたときに直る)
//   ・対象はプロジェクトのフォルダの図面(.seqzu)全部(サブフォルダも。2026-10-05 参照図面の一覧をやめた)。消えたファイルは台帳からも消す
//
// 【いつ更新するか】プロジェクトのフォルダを読み直すとき(xprojReload=部品表・表示タブの「更新」)と、図面を保存したあと。
// 作る順の1では、まだ帳票は台帳を読まない(2で部品表を台帳読みにする)。
// ================================================================

const PIDX_FILE = 'project.seqzuidx';   // 2026-10-04 拡張子を図面(.seqzu)と分けた(ツリーに出さない)。以前の ecad_project_index.json は使わない(消してよい)
const PIDX_VER  = 3;   // 2: 種別を登録シンボルから読む / 3: 矢印にもシンボルの type(逆引き。2026-10-05)
const pidxState = { index: null, dirName: '' };   // 最後に読んだ/作った台帳

const _pidxSkip = ['text', 'rect', 'circle', 'fline', 'dim', 'leader', 'angle_dim', 'wire'];
const _pidxStr = v => (v == null ? '' : String(v).trim());

// 1ファイル(読み込んだ JSON)を、ページごとの台帳の記録にする。fileName は .json 付きのファイル名。
// 位置(loc)は参照図面の計算(xprojWith)と同じ書き方にするため、仮のページに _file・_pno を付けて elLocation で求める。
// 記号の種別(コイル・接点・矢印)は登録シンボルを優先し、登録シンボルに無いものだけそのファイルのシンボル定義(2026-10-05 シンボルは1つ)。
function pidxExtractFile(fileName, data) {
  const base = String(fileName || '').replace(/\.(seqzu|json)$/i, '');
  const syms = (data && data.customSymbols) || [];
  const pages = ((data && data.pages) || []).map((pg, i) => Object.assign({}, pg, { _file: base, _pno: i + 1 }));
  const savedPages = state.pages, savedSyms = state.customSymbols;
  const savedDefs = new Map();
  try {
    const reg = (typeof _symLibReady === 'function' && _symLibReady()) ? _symLibObj() : {};
    if (typeof DEFS === 'object') syms.forEach(s => {
      if (!s || !s.type || savedDefs.has(s.type) || reg[s.type]) return;
      savedDefs.set(s.type, Object.prototype.hasOwnProperty.call(DEFS, s.type) ? DEFS[s.type] : undefined);
      DEFS[s.type] = s;
    });
    const own = syms.filter(s => s && s.type && !reg[s.type]);
    const mine = new Set(own.map(s => s.type));
    state.customSymbols = own.concat((savedSyms || []).filter(s => s && !mine.has(s.type)));
    state.pages = pages;
    return pages.map((pg, pi) => _pidxPage(pg, pi));
  } finally {
    state.pages = savedPages; state.customSymbols = savedSyms;
    savedDefs.forEach((d, t) => { if (d === undefined) delete DEFS[t]; else DEFS[t] = d; });
  }
}

function _pidxSymName(el) {
  const cS = (state.customSymbols || []).find(s => s.type === el.type);
  return (cS && (cS.name || cS.label)) || (String(el.type).startsWith('custom_') ? '(登録なし)' : el.type);
}
function _pidxTerms(el) {
  if (_pidxStr(el.terminals)) return _pidxStr(el.terminals);
  const cS = (state.customSymbols || []).find(s => s.type === el.type);
  return (cS && Array.isArray(cS.terminals)) ? cS.terminals.map(t => t.label || '').join(',') : '';
}
// デバイスの項目(js/devices.js の DEV_FIELDS)の値。空は入れない
function _pidxFields(o) {
  const f = {};
  (typeof DEV_FIELDS !== 'undefined' ? DEV_FIELDS : []).forEach(d => {
    const v = o[d.key];
    if (v === true) f[d.key] = true;
    else if (_pidxStr(v)) f[d.key] = String(v);
  });
  return f;
}

function _pidxPage(pg, pi) {
  const fr = pg.frameObj || {};
  const els = pg.elements || [], wires = pg.wires || [];
  const rec = {
    name: pg.name || '', pno: _pidxStr(fr.page), drawno: _pidxStr(fr.drawno), title: _pidxStr(fr.title), rev: _pidxStr(fr.rev),
    devs: [], groups: [], noRef: [], terms: [], nets: [], arrows: [],
  };
  // 線番(ネットごと)。主回路の自動の印(wireNoMain)・混在。未採番は no が空のネット
  const nets = groupWiresByNet(wires, null, els);
  const netNo = wires.map(() => '');
  nets.forEach(idxs => {
    const nos = [...new Set(idxs.map(i => _pidxStr(wires[i].wireNo)).filter(Boolean))];
    const n = { no: nos[0] || '', w: idxs.length };
    if (nos.length > 1) n.mixed = nos;
    if (idxs.some(i => wires[i].wireNoMain)) n.main = true;
    rec.nets.push(n);
    idxs.forEach(i => { netNo[i] = n.no; });
  });
  els.forEach(el => {
    if (_pidxSkip.includes(el.type)) return;
    if (el.type === 'junction' && (el.style || 'dot') === 'dot') return;   // 配線の分岐点(●)は部品ではない
    const role = symRole(el);
    const loc = elLocation(el, pi);
    if (role === 'sig_out' || role === 'sig_in') {   // ページ跨ぎの矢印: 触れているネットの線番
      const tol = (typeof CONN_TABLE_TOL === 'number') ? CONN_TABLE_TOL : 5;
      const pts = collectTerminalPoints([el]);
      const k = nets.findIndex(g => g.some(i => {
        const w = wires[i], ps = w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
        return [ps[0], ps[ps.length - 1]].some(e => pts.some(t => Math.hypot(t.x - e.x, t.y - e.y) <= tol));
      }));
      rec.arrows.push({ id: el.id, type: el.type, label: _pidxStr(el.label), out: role === 'sig_out', loc, net: k, no: k >= 0 ? rec.nets[k].no : '' });   // type: シンボルの逆引き(2026-10-05)
      return;
    }
    if (el.type === 'junction') {   // 端子台の端子(○/◎)
      const t = { id: el.id, ref: _pidxStr(el.partRef), no: _pidxStr(el.label), loc, conns: _tbConnsOf(el, pg, netNo) };
      if (el.tbOrder != null) t.tbOrder = el.tbOrder;
      if (el.tbExclude) t.tbExclude = true;
      if (_pidxStr(el.partModel)) t.partModel = String(el.partModel);
      rec.terms.push(t);
      if (!_pidxStr(el.partRef)) return;
    }
    if (_pidxStr(el.partRef)) {
      rec.devs.push({ id: el.id, type: el.type, sym: _pidxSymName(el), role, ref: _pidxStr(el.partRef), loc, terms: _pidxTerms(el), f: _pidxFields(el) });
    } else {
      rec.noRef.push({ id: el.id, type: el.type, sym: _pidxSymName(el), loc, f: _pidxFields(el) });
    }
  });
  // 外形図などのグループのデバイス
  (pg.groups || []).forEach(g => {
    if (!_pidxStr(g.partRef)) return;
    rec.groups.push({ id: g.id, ref: _pidxStr(g.partRef), f: _pidxFields(g) });
  });
  return rec;
}

// ---- 台帳ファイルの読み書き ----
async function pidxRead(dir) {
  try {
    const fh = await dir.getFileHandle(PIDX_FILE);
    const d = JSON.parse(await (await fh.getFile()).text());
    return (d && d.version === PIDX_VER && d.files && typeof d.files === 'object') ? d : null;
  } catch (e) { return null; }   // 無い・壊れている・抜き出し方が古い → 作り直す
}
async function pidxWrite(dir, idx) {
  const fh = await dir.getFileHandle(PIDX_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(idx));
  await w.close();
}

// 進み具合(台帳を作っている間だけ出す)
function _pidxProgress(text) {
  if (typeof document === 'undefined' || !document.body) return;
  let box = document.getElementById('pidx-progress');
  if (text == null) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'pidx-progress';
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:10001;background:var(--bg2,#fff);color:var(--fg,#000);border:1px solid #888;border-radius:6px;padding:8px 14px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    document.body.appendChild(box);
  }
  box.textContent = text;
}

// 台帳を最新にする。names: フォルダの図面の道筋。pre: 既に読んだファイル(Map 名前 → { lastModified, size, data })があれば使う。
// 戻り値: { index, read: 読み直した数, problems: [読めなかったファイル] }
async function pidxUpdate(dir, names, pre) {
  const old = await pidxRead(dir);
  const files = {}, problems = [];
  let read = 0, changed = !old;
  const todo = [];
  for (const name of names) {
    let file;
    try { file = await (typeof xprojFileHandle === 'function' ? await xprojFileHandle(dir, name) : await dir.getFileHandle(name)).getFile(); }   // name はフォルダからの道筋('盤外/Sheet1.seqzu')
    catch (e) { problems.push(`${name}: ${e && e.message || e}`); changed = true; continue; }
    const o = old && old.files[name];
    if (o && !o.error && o.lastModified === file.lastModified && o.size === file.size) { files[name] = o; continue; }
    todo.push({ name, file });
  }
  if (old) Object.keys(old.files).forEach(n => { if (!names.includes(n)) changed = true; });   // 一覧から外れたファイル
  for (let i = 0; i < todo.length; i++) {
    const { name, file } = todo[i];
    if (todo.length > 1) _pidxProgress(`プロジェクト台帳を作っています… ${i + 1} / ${todo.length}(${name})`);
    const rec = { lastModified: file.lastModified, size: file.size };
    try {
      const p = pre && pre.get(name);
      const d = (p && p.lastModified === file.lastModified && p.size === file.size) ? p.data : JSON.parse(await file.text());
      if (!d || !Array.isArray(d.pages)) throw new Error('図面ファイルではありません');
      rec.pages = pidxExtractFile(name, d);
    } catch (e) {
      rec.error = String(e && e.message || e);
      problems.push(`${name}: ${rec.error}`);
    }
    files[name] = rec; read++; changed = true;
  }
  _pidxProgress(null);
  const index = changed ? { version: PIDX_VER, updated: new Date().toISOString(), files } : old;
  if (changed) {
    try { await pidxWrite(dir, index); }
    catch (e) { if (typeof stToast === 'function') stToast(`プロジェクト台帳を書けませんでした（${e && e.message || e}）。帳票は図面から読みます`, 'warn'); }
  }
  pidxState.index = index; pidxState.dirName = dir.name;
  return { index, read, problems };
}

// 図面を保存したあと: プロジェクトのフォルダが使えれば(許可を聞かずに)台帳を最新にする。保存したファイルが一覧にあれば、そこだけ読み直される
async function pidxAfterSave() {
  try {
    if (typeof xprojDirHandle !== 'function') return;
    const dir = await xprojDirHandle(false);
    if (!dir) return;
    const names = await xprojReadList(dir);
    if (names && names.length) await pidxUpdate(dir, names);
  } catch (e) { console.warn('プロジェクト台帳の更新に失敗', e); }
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['proj_index.js'] = 1;
