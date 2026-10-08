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
// 【2026-10-08 作る順の2】部品表(と、その「食い違いを直す」)は台帳から集計する(pidxWith)。参照図面の計算(xprojWith)は今までどおり全部読む。
// 【2026-10-08 作る順の3】端子台表も台帳から(別ファイルの端子は読むだけ。矢印の相手の線番も借りる pidxArrowBorrow)。
// ================================================================

const PIDX_FILE = 'project.seqzuidx';   // 2026-10-04 拡張子を図面(.seqzu)と分けた(ツリーに出さない)。以前の ecad_project_index.json は使わない(消してよい)
const PIDX_VER  = 5;   // 2: 種別を登録シンボルから読む / 3: 矢印にもシンボルの type(逆引き。2026-10-05) / 4: デバイス未設定の端子台の端子も noRef に(部品表と同じ数え方。2026-10-08) / 5: 端子の線番の無いネット(un。矢印の相手から借りる。2026-10-08)
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
      const hit = [];
      const t = { id: el.id, ref: _pidxStr(el.partRef), no: _pidxStr(el.label), loc, conns: _tbConnsOf(el, pg, netNo, hit) };
      // 線番の無いネット(rec.nets の添字)。端子台表がページ跨ぎの矢印の相手の線番を借りる(pidxArrowBorrow。版5)
      const un = [...new Set(hit.filter(wi => !netNo[wi]).map(wi => nets.findIndex(g => g.includes(wi))))].filter(k => k >= 0);
      if (un.length) t.un = un;
      if (el.tbOrder != null) t.tbOrder = el.tbOrder;
      if (el.tbExclude) t.tbExclude = true;
      if (_pidxStr(el.partModel)) t.partModel = String(el.partModel);
      rec.terms.push(t);
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

// ---- 帳票を台帳から集計する(2026-10-08 作る順の2。盛田さん「２で」) ----
// 部品表を開くたびにプロジェクトの図面を全部読んでいた(xprojReload)のを、台帳を最新にする(変わったファイルだけ読む)だけにする。
// 集計の関数(_collectBOMRows・deviceLedger)はそのまま使い、台帳の記録から「部品表に要る値だけを持った仮の記号」を作って
// 今の図面の後ろに足す(xprojWith と同じ形。計算が終わったら元に戻す)。仮の記号の役割(コイル等)・位置・シンボル名は台帳に
// 書いてあるものを使う(symRole・elLocation が _pidxRole・_pidxLoc を見る)。別ファイルのシンボル定義は要らない。
// 開いているファイルは使わない(xprojPages と同じ判定。開いている方が新しい)。
function _pidxVEl(pre, o, extra) {
  const v = Object.assign({}, o.f || {}, { id: pre + o.id, type: o.type, _pidxLoc: o.loc, _pidxSym: o.sym, _pidxRole: o.role || '' }, extra);
  if (o.type === 'junction') v.style = 'circle';   // 台帳の端子は端子台の端子(○◎)だけ(分岐点●は入れていない)
  return v;
}
const _pidxBase = n => String(n || '').replace(/\.(seqzu|json)$/i, '');
// 使う台帳のファイル(名前順)。開いているファイルは除く(xprojPages と同じ判定。開いている方が新しい)
function _pidxExtFiles() {
  const idx = pidxState.index;
  if (!idx || !idx.files) return [];
  const mine = new Set((state.pages || []).filter(p => !p._src && !p._file).map(p => p.name));
  const open = new Set((state.pages || []).map(p => p._src).filter(Boolean));
  const out = [];
  Object.keys(idx.files).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true })).forEach((name, fi) => {
    const recs = idx.files[name].pages;
    if (!Array.isArray(recs) || open.has('/' + name) || recs.some(r => mine.has(r.name))) return;
    out.push({ name, fi, recs });
  });
  return out;
}
function pidxPages() {
  const out = [];
  _pidxExtFiles().forEach(({ name, fi, recs }) => {
    recs.forEach((r, pi) => {
      const pre = `pi${fi}:`;
      // 端子台の端子(○◎)には端子台表に要るもの(並び順・つながる線番)も持たせる(2026-10-08 作る順の3)
      const terms = new Map((r.terms || []).map(t => [t.id, t]));
      const tb = o => {
        const t = o.type === 'junction' && terms.get(o.id);
        if (!t) return {};
        const x = { label: t.no, _pidxTerm: { conns: t.conns || [], un: t.un || [], key: `${name}|${pi}` } };
        if (t.tbOrder != null) x.tbOrder = t.tbOrder;
        return x;
      };
      // _pidxSrc・_pidxPi・_pidxId: 元のファイル・ページ・記号(一括操作で別ファイルへ書くとき使う。pidxDevPlan)
      const src = o => ({ _pidxSrc: name, _pidxPi: pi, _pidxId: o.id });
      out.push({
        name: `${_pidxBase(name)}/${r.name || ''}`, _file: _pidxBase(name), _pno: pi + 1, frameObj: r.pno ? { page: r.pno } : null, wires: [],
        elements: (r.devs || []).map(d => _pidxVEl(pre, d, Object.assign({ partRef: d.ref }, tb(d), src(d)))).concat((r.noRef || []).map(d => _pidxVEl(pre, d, Object.assign(tb(d), src(d))))),
        groups: (r.groups || []).map(g => Object.assign({}, g.f || {}, { id: pre + g.id, partRef: g.ref }, src(g))),
      });
    });
  });
  return out;
}

// ---- ページ跨ぎの矢印の相手の線番(2026-10-08 作る順の3。盛田さん「未採番はなおるのか？」) ----
// 開いているファイルの端子台表は、線番の無いネットでも矢印でつながる相手のネットに線番があればその番号を出す(report.js netWireNoOf)。
// 台帳の端子も同じにする: 台帳の矢印(名前・送り/受け・触れているネット・線番)と開いている図面の矢印を名前で組にし(送り1・受け1の一対一。
// sigarrowCompute と同じ決まり)、番号の無い側のネットに相手の番号を貸す。
// 戻り値 Map: '台帳のファイル名|ページ添字|ネット添字' または '#open|ページ添字|ネット添字'(開いている図面。groupWiresByNet の順) → 線番
function pidxArrowBorrow() {
  const out = new Map();
  if (!pidxReady()) return out;
  const key = l => (typeof sigarrowKey === 'function') ? sigarrowKey({ label: l }) : String(l || '').normalize('NFKC').trim().toUpperCase();
  const groups = new Map();
  const add = (a, at) => {
    const k = key(a.label);
    if (!k) return;
    (groups.get(k) || groups.set(k, []).get(k)).push({ out: !!a.out, no: a.no || '', at: a.net >= 0 ? `${at}|${a.net}` : null });
  };
  (state.pages || []).forEach((pg, pi) => {
    if (pg._file || !(pg.elements || []).some(e => { const r = symRole(e); return r === 'sig_out' || r === 'sig_in'; })) return;
    _pidxPage(pg, pi).arrows.forEach(a => add(a, `#open|${pi}`));
  });
  _pidxExtFiles().forEach(({ name, recs }) => recs.forEach((r, pi) => (r.arrows || []).forEach(a => add(a, `${name}|${pi}`))));
  groups.forEach(list => {
    const outs = list.filter(a => a.out), ins = list.filter(a => !a.out);
    if (outs.length !== 1 || ins.length !== 1) return;
    [[outs[0], ins[0]], [ins[0], outs[0]]].forEach(([me, other]) => { if (me.at && !me.no && other.no) out.set(me.at, other.no); });
  });
  return out;
}
// 台帳の端子のつながる線番(未採番のネットは矢印の相手の番号を借りる。借りられなければ「未採番」のまま)
function pidxTermConns(t, borrow) {
  const got = (t.un || []).map(k => borrow && borrow.get(`${t.key}|${k}`)).filter(Boolean);
  if (!got.length) return t.conns.slice();
  const left = (t.un || []).length > got.length;
  const out = [];
  t.conns.forEach(c => { if (c !== '未採番') out.push(c); else { got.forEach(n => out.push(n)); if (left) out.push(c); } });
  return [...new Set(out)];
}
// 開いている図面のページの線番(配線ごと)のうち、番号の無いネットに矢印の相手(台帳)の番号を入れる
function pidxFillNetNo(pg, pi, netNo, borrow) {
  if (!borrow || !borrow.size || !netNo.includes('')) return netNo;
  const out = netNo.slice();
  groupWiresByNet(pg.wires || [], null, pg.elements).forEach((idxs, k) => {
    const b = borrow.get(`#open|${pi}|${k}`);
    if (b) idxs.forEach(i => { if (!out[i]) out[i] = b; });
  });
  return out;
}
function pidxWith(fn) {
  const ext = pidxPages();
  if (!ext.length) return fn();
  const saved = state.pages;
  try { state.pages = saved.concat(ext); return fn(); }
  finally { state.pages = saved; }
}
// 部品表が使う別ファイル: 台帳があれば台帳、無ければ参照図面の読み込み(xprojState)
function pidxReady() { return !!(pidxState.index && pidxState.index.files); }
function projWith(fn) {
  if (pidxReady()) return pidxWith(fn);
  return (typeof xprojWith === 'function') ? xprojWith(fn) : fn();
}
function projExtPageCount() {
  if (pidxReady()) return pidxPages().length;
  return (typeof xprojPages === 'function') ? xprojPages().length : 0;
}
// 部品表を開くとき: 台帳を最新にする(変わったファイルだけ読む)。プロジェクトのフォルダが無ければ台帳も使わない(false)
async function pidxRefresh() {
  const dir = (typeof xprojDirHandle === 'function') ? await xprojDirHandle(true) : null;
  if (!dir) { pidxState.index = null; pidxState.dirName = ''; return false; }
  const names = await xprojReadList(dir);
  const r = await pidxUpdate(dir, names);
  if (r.problems.length && typeof stToast === 'function') stToast('読めなかった図面があります:\n' + r.problems.join('\n'), 'warn');
  return true;
}

// ---- 一括操作: デバイスの値を別ファイルにも書く(2026-10-08 作る順の4。盛田さん「部品表は？」→ 部品表から・「a」=打つたびに確認して書く) ----
// 流れ(台帳の設計 1-1): 書き換える記号の一覧を見せる → 実行 → 台帳を作ったあとにファイルが変わっていないか確かめる
//   → 書く前の図面を履歴(.seqzu_history)に残す → 書く → 台帳を最新にする。
// 何を書くかは、台帳の仮の記号(pidxPages)に**開いているファイルと同じ関数(devSetField)**を掛けて、変わった所を拾う(pidxDevPlan)。
// 書き方の決まり(仕様は代表の記号にだけ図面に表示 等)が開いているファイルと別ファイルで食い違わない。
// 開いているファイルは今まで通り画面の中で直す(Ctrl+Z で戻せる)。別ファイルは Ctrl+Z では戻らない(戻すときはツリーの履歴から)。
const _pidxDevKeys = () => (typeof DEV_FIELDS !== 'undefined' ? DEV_FIELDS.map(f => f.key) : []).concat(['specHide', 'partRef']);   // partRef: デバイス名の付け替え(js/devices.js devRenameApply)
// fn(devSetField などデバイスの値を書く処理)を、台帳の別ファイルを足した状態で実行する。開いているファイルにはそのまま入る。
// 戻り値: 別ファイルで変わる記号 [{ file, pi, id, group, set: {項目: 新しい値(undefined=消す)}, before: {項目: 前の値}, loc }]。台帳が無ければ []
function pidxDevPlan(fn) {
  if (!pidxReady()) { fn(); return []; }
  const keys = _pidxDevKeys();
  const snap = o => { const x = {}; keys.forEach(k => { x[k] = o[k]; }); return x; };
  return pidxWith(() => {
    const ext = [];
    (state.pages || []).forEach((pg, pi) => {
      if (!pg._file) return;
      (pg.elements || []).forEach(o => { if (o._pidxSrc) ext.push({ o, group: false, pi }); });
      (pg.groups || []).forEach(o => { if (o._pidxSrc) ext.push({ o, group: true, pi }); });
    });
    ext.forEach(x => { x.before = snap(x.o); });
    fn();
    const out = [];
    ext.forEach(x => {
      const set = {};
      keys.forEach(k => { if (JSON.stringify(x.o[k]) !== JSON.stringify(x.before[k])) set[k] = x.o[k]; });
      if (!Object.keys(set).length) return;
      const pg = state.pages[x.pi];
      const loc = x.group ? `${pg._file}/${pg._pno}/外形図` : elLocation(x.o, x.pi);
      out.push({ file: x.o._pidxSrc, pi: x.o._pidxPi, id: x.o._pidxId, group: x.group, type: x.o.type, ref: x.o.partRef || '', set, before: x.before, loc });
    });
    return out;
  });
}

// 書く。戻り値 { files: [書いたファイル], ng: [書けなかったファイルと理由] }
async function pidxWritePlan(plan) {
  const files = [], ng = [];
  const dir = (typeof xprojDirHandle === 'function') ? await xprojDirHandle(true) : null;
  if (!dir) return { files, ng: ['プロジェクトのフォルダを開けません'] };
  const idx = pidxState.index || { files: {} };
  const byFile = new Map();
  plan.forEach(it => { (byFile.get(it.file) || byFile.set(it.file, []).get(it.file)).push(it); });
  for (const [name, items] of byFile) {
    try {
      const fh = await xprojFileHandle(dir, name);
      const file = await fh.getFile();
      const rec = idx.files[name];
      // 台帳を作ったあとに変わったファイル(別の窓で保存した等)は書かない。読み直した台帳で打ち直してもらう
      if (!rec || rec.lastModified !== file.lastModified || rec.size !== file.size) { ng.push(`${name}: 帳票を開いたあとに変わっています`); continue; }
      const d = JSON.parse(await file.text());
      let n = 0;
      items.forEach(it => {
        const pg = (d.pages || [])[it.pi];
        const o = pg && ((it.group ? pg.groups : pg.elements) || []).find(e => e.id === it.id);
        if (!o) return;
        Object.keys(it.set).forEach(k => { if (it.set[k] === undefined) delete o[k]; else o[k] = it.set[k]; });
        n++;
      });
      if (!n) { ng.push(`${name}: 書き換える記号が見つかりません`); continue; }
      const text = (typeof _saveJSON === 'function') ? _saveJSON(d) : JSON.stringify(d, null, 2);
      try { if (typeof ptreeHistSave === 'function') await ptreeHistSave('/' + name, fh, text); } catch (e) {}
      const w = await fh.createWritable(); await w.write(text); await w.close();
      files.push(name);
    } catch (e) { ng.push(`${name}: ${e && e.message || e}`); }
  }
  if (files.length) {
    try { await pidxUpdate(dir, await xprojReadList(dir)); } catch (e) { console.warn('プロジェクト台帳の更新に失敗', e); }
  }
  return { files, ng };
}

// 書き換える記号の一覧を見せて、書くか聞く。what: 何をしたか(見出し)。戻り値: 書いたら { files, ng }、書かなければ null
function pidxAskWrite(plan, what) {
  if (!plan || !plan.length) return Promise.resolve(null);
  return new Promise(resolve => {
    const old = document.getElementById('pidx-write-dlg');
    if (old) old.remove();
    // 端子台の端子(○◎)の label は端子番号(仕様ではない)
    const fname = (k, it) => { if (k === 'label' && it && it.type === 'junction') return '端子番号'; const f = (typeof DEV_FIELDS !== 'undefined' ? DEV_FIELDS : []).find(x => x.key === k); return f ? f.name : k; };
    const show = (k, v) => { const f = (typeof DEV_FIELDS !== 'undefined' ? DEV_FIELDS : []).find(x => x.key === k) || {}; return (typeof devShowVal === 'function') ? devShowVal(f, v == null ? '' : (v === true ? 'true' : String(v))) : String(v == null ? '' : v); };
    const byFile = new Map();
    plan.forEach(it => { (byFile.get(it.file) || byFile.set(it.file, []).get(it.file)).push(it); });
    let rows = '';
    byFile.forEach((items, name) => {
      rows += `<div style="border-top:1px solid var(--bd2);padding:5px 0"><div style="font-weight:600">${escH(_pidxBase(name))}（${items.length}個）</div>`
        + items.slice(0, 30).map(it => `<div style="color:var(--fg3)">${escH(it.ref)}　${escH(it.loc)}　`
          + Object.keys(it.set).filter(k => k !== 'specHide').map(k => `${escH(fname(k, it))}: ${escH(show(k, it.before[k]))} → <b style="color:var(--fg)">${escH(show(k, it.set[k]))}</b>`).join('、')
          + (Object.keys(it.set).length === 1 && 'specHide' in it.set ? '仕様を図面に表示しない' : '') + `</div>`).join('')
        + (items.length > 30 ? `<div style="color:var(--fg3)">ほか ${items.length - 30}個</div>` : '') + `</div>`;
    });
    const btn = 'padding:6px 14px;font-size:12px;cursor:pointer;border:1px solid var(--bd2);border-radius:4px;background:var(--bg2);color:var(--fg)';
    const ov = document.createElement('div');
    ov.id = 'pidx-write-dlg';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3001;display:flex;align-items:center;justify-content:center';
    ov.innerHTML = `<div role="dialog" style="background:var(--bg2);color:var(--fg);border:1px solid var(--bd);border-radius:6px;padding:14px 18px;width:600px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 4px 24px var(--sh);font-size:12px;line-height:1.5">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">別ファイルにも入れますか？（${byFile.size}ファイル・${plan.length}個）</div>
      <div style="color:var(--fg3);margin-bottom:6px">${escH(what || '')}を、開いているファイルの記号に入れました。同じデバイスの記号が下の別ファイルにもあります。<br>
      書くと、そのファイルを直接書き換えます（書く前の図面は履歴に残ります。<b>Ctrl+Z では戻りません</b>。戻すときはプロジェクトのツリーの履歴から）。</div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button id="pidxw-no" style="${btn}">このファイルだけ</button>
        <button id="pidxw-ok" style="${btn};background:var(--acc);color:#fff;border-color:var(--acc)">別ファイルにも書く</button>
      </div></div>`;
    document.body.appendChild(ov);
    const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); resolve(null); } };
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('#pidxw-no').onclick = () => { close(); resolve(null); };
    ov.querySelector('#pidxw-ok').onclick = async () => {
      close();
      const r = await pidxWritePlan(plan);
      if (typeof stToast === 'function') {
        if (r.files.length) stToast(`別ファイル ${r.files.length} 件に書きました（${r.files.map(_pidxBase).join('、')}）`);
        if (r.ng.length) stToast('書けなかった別ファイルがあります（書いていません。帳票を開き直してから、もう一度やり直してください）:\n' + r.ng.join('\n'), 'warn');
      }
      resolve(r);
    };
  });
}
// 部品表・食い違いの画面から: fn(デバイスの値を書く)を開いているファイルに入れ、別ファイルの分は聞いてから書く。書いたら after() で出し直す
function pidxDevApply(fn, what, after) {
  const plan = pidxDevPlan(fn);
  if (plan.length) pidxAskWrite(plan, what).then(r => { if (r && after) after(); });
  return plan;
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['proj_index.js'] = 1;
