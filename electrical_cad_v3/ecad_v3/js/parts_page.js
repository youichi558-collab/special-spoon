// ================================================================
// parts_page.js — 部品DB単独画面(parts.html)のロジック。
//
// 【Stage 2・2026-09-02】部品DBを「CADを開かなくても編集できる」ようにする。
// 分担は HANDOFF.md の設計どおり: 部品DB単独画面=書く / CAD=読むだけ。
//
// 書き込みは server.py の POST /api/parts/save 一本(Stage 1で作った経路)。
// js/parts_db.js(CAD用・読み取り専用)は使わない。
// 単独画面は常にサーバー経由で、部品DBの場所の設定が必要(画面上の「部品DBの場所」)。
//
// state.customParts は js/state.js の定義をそのまま使う。種別コードは js/part_types.js(CADと共有)。
// 【2026-10-03】標準部品2件(BUILTIN_PARTS)と、それを隠す機能(hiddenBuiltinRefs)はやめた(再設計の段階1)。
// state.hiddenBuiltinRefs は parts_db.json に残っている値を消さないよう、読んだまま送り返すだけ。
// ================================================================

let saveLocked = false;
let serverPath = '';
// 読み込んだ時点の部品DBの版(中身のハッシュ)。保存のときに送り、サーバーが「その後に他で保存されていないか」を見る(2026-10-03)
let loadedVersion = '';
let editingRef = null;   // 編集中のカスタム部品のref(nullは新規)
let _pendingOutlineDxf = null;

const $ = id => document.getElementById(id);

function setStatus(msg, isError) {
  const el = $('pp-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--fg3)';
}
function setBanner(msg) { showTopBanner('pp-banner', msg); }

function allParts() {
  return state.customParts;
}

// ---- 読み込み --------------------------------------------------------
async function loadAll() {
  setStatus('読み込み中...');
  let stats;
  try {
    stats = await (await fetch('/api/parts/stats')).json();
  } catch (e) {
    setStatus(`ローカルサーバーに接続できません(${e.message})。start.bat で起動してください`, true);
    return;
  }
  if (!stats.available) {
    setStatus('部品DB機能が導入されていません(tools/parts_db が見つかりません)', true);
    return;
  }
  if (!stats.writable) {
    // 単独画面は常に書く前提。控え(mirror)しか無い=場所が未設定では書けない。
    //
    // 【2026-09-02】「未設定」と「設定されているが見つからない」を区別する。
    // 後者はGoogleドライブ(Drive for Desktop)がドライブ文字を変えたときに起きる
    // (例: I:\ が J:\ に変わる)。ファイルには一切触っていないので実害は無いが、
    // 「未設定です」と表示すると「一度も設定していない」ように読めて紛らわしい。
    // parts_db.py はこの2つを source で区別して返しているので、そのまま使う。
    if (stats.source === 'path_missing') {
      setStatus(stats.error, true);   // サーバーの文言に「もう一度確かめる」「フォルダを選ぶ」の案内まで入っている
    } else {
      setStatus('部品DBの場所(ライブラリフォルダ)が未設定です。'
        + '上の「部品DBの場所」の「フォルダを選ぶ」「探す」で設定してください(部品DBが無いフォルダを選ぶと、空の部品DBを作れます)', true);
    }
    saveLocked = true;
    return;
  }
  let all;
  try {
    all = await (await fetch('/api/parts/all')).json();
  } catch (e) {
    setStatus(`読み込みに失敗しました(${e.message})`, true); return;
  }
  if (!all.ok) { setStatus(`読み込みに失敗しました(${all.error})`, true); return; }
  state.customParts = all.customParts || [];
  state.hiddenBuiltinRefs = all.hiddenBuiltinRefs || [];
  serverPath = stats.path || '';
  loadedVersion = all.version || '';
  saveLocked = false;
  setStatus(`部品DB: ${serverPath.split(/[\\/]/).pop()} (${state.customParts.length}件・サーバー経由)`);
  renderAll();
}

// ---- 保存 --------------------------------------------------------
// サーバー側 save()（tools/parts_db/parts_db.py）の契機(件数激減で確認・force送信)を踏む。
// CAD側(js/parts_db.js)は2026-09-03から読み取り専用で、書き込みはこの画面だけ。
// 挙動は tests/test_parts_page_save.js が見る。
async function saveAll(force) {
  if (saveLocked) return false;
  let j;
  try {
    const res = await fetch('/api/parts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customParts: state.customParts,
                             hiddenBuiltinRefs: state.hiddenBuiltinRefs,
                             force: !!force, version: loadedVersion }),
    });
    j = await res.json();
  } catch (e) {
    setBanner(`⚠ 保存できませんでした(ローカルサーバーに届きません: ${e.message})。`
      + 'ファイルの中身は無傷です。start.bat が動いているか確認してください');
    saveLocked = true;
    return false;
  }
  if (!force && !j.ok && j.reason === 'drop') {
    const ok = confirm(`部品DBの件数が ${j.prev} 件から ${j.now} 件に減っています。\n`
      + `このまま保存すると、ファイルの中身も ${j.now} 件になります。\n\n`
      + `[OK] このまま保存する（直前の内容は自動でバックアップします）\n`
      + `[キャンセル] 保存しない`);
    if (!ok) { setStatus(`件数が ${j.prev} → ${j.now} に減ったため保存しませんでした`, true); return false; }
    return await saveAll(true);
  }
  if (!j.ok && j.reason === 'conflict') {
    // 読んだ後に別の画面・別のPCで保存されていた。上書きせずに止め、読み直してもらう(2026-10-03)
    setBanner(`⚠ ${j.error}（部品DB画面を再読み込みすると、最新の内容を読み直します）`);
    saveLocked = true;
    return false;
  }
  if (!j.ok) {
    setBanner(`⚠ 保存できませんでした(${j.error || '原因不明'})。ファイルの中身は無傷です`);
    saveLocked = true;
    return false;
  }
  loadedVersion = j.version || loadedVersion;
  setBanner('');
  setStatus(`部品DB: ${(j.path || serverPath).split(/[\\/]/).pop()} `
    + `(${state.customParts.length}件・保存済み)`
    + (j.backup ? `／直前の内容は ${j.backup} に残っています` : ''));
  return true;
}

// ---- 一覧・絞り込み ----------------------------------------------
let filterText = '', filterMaker = '', filterType = '';
let filterNoOutline = false, filterNoType = false, filterLegacy = false;
let sortKey = 'ref', sortDir = 1;

function filteredParts() {
  const q = filterText.trim().toLowerCase();
  return allParts().filter(p => {
    if (filterMaker && (p.maker || '') !== filterMaker) return false;
    if (filterType && (p.type || '') !== filterType) return false;
    if (filterNoOutline && p.outlineDxf) return false;
    if (filterNoType && p.type) return false;
    if (filterLegacy && !LEGACY_PART_TYPES[p.type]) return false;
    if (q && !['ref','maker','type','volt','amp','note','source','catalogUrl']
      .some(k => String(p[k] || '').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => {
    const av = String(a[sortKey] || ''), bv = String(b[sortKey] || '');
    return av.localeCompare(bv, 'ja') * sortDir;
  });
}

function renderMakerOptions() {
  const sel = $('pp-f-maker');
  if (!sel) return;
  const cur = sel.value;
  const makers = [...new Set(allParts().map(p => p.maker || '(メーカー未設定)'))].sort((a, b) => a.localeCompare(b, 'ja'));
  sel.innerHTML = '<option value="">(すべてのメーカー)</option>'
    + makers.map(m => `<option value="${escH(m)}">${escH(m)}</option>`).join('');
  sel.value = cur;
}
function renderTypeOptions() {
  const sel = $('pp-f-type');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">(すべての種別)</option>'
    + PART_TYPE_ORDER.map(t => `<option value="${t}">${escH(PART_TYPE_LABELS[t])}</option>`).join('');
  sel.value = cur;
}

function renderTable() {
  const tbody = $('pp-tbody');
  if (!tbody) return;
  const rows = filteredParts();
  $('pp-count').textContent = `${rows.length}件`
    + (rows.length !== allParts().length ? `（全${allParts().length}件中）` : '');
  tbody.innerHTML = rows.map(p => {
    const label = PART_TYPE_LABELS[p.type]
      || (LEGACY_PART_TYPES[p.type] ? `${LEGACY_PART_TYPES[p.type]}（要再分類）` : (p.type || ''));
    return `<tr class="${editingRef === p.ref ? 'pp-row-sel' : ''}" onclick="selectPart('${_escAttr(p.ref)}')">
      <td>${escH(p.ref)}</td>
      <td>${escH(p.maker || '')}</td>
      <td>${escH(label)}</td>
      <td>${escH(p.volt || '')}</td>
      <td>${escH(p.amp || '')}</td>
      <td style="text-align:center">${p.outlineDxf ? '✓' : ''}</td>
    </tr>`;
  }).join('');
}

function renderAll() {
  renderMakerOptions();
  renderTypeOptions();
  renderTable();
}

function setFilter(k, v) {
  if (k === 'text') filterText = v;
  else if (k === 'maker') filterMaker = v;
  else if (k === 'type') filterType = v;
  else if (k === 'noOutline') filterNoOutline = v;
  else if (k === 'noType') filterNoType = v;
  else if (k === 'legacy') filterLegacy = v;
  renderTable();
}
function sortBy(key) {
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
  renderTable();
}

// ---- 編集フォーム --------------------------------------------------
function _escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function fillTypeSelect() {
  const sel = $('pp-type');
  if (!sel) return;
  sel.innerHTML = '<option value="">(種別未設定)</option>'
    + PART_TYPE_ORDER.map(t => `<option value="${t}">${escH(PART_TYPE_LABELS[t])}</option>`).join('');
}
function newPart() {
  editingRef = null;
  _pendingOutlineDxf = null;
  ['maker','ref','volt','amp','term','contacts','note','source','caturl'].forEach(id => { const el = $('pp-' + id); if (el) el.value = ''; });
  $('pp-type').value = '';
  $('pp-ref').disabled = false;
  $('pp-outline-status').textContent = '';
  $('pp-delete').style.display = 'none';
  $('pp-form-title').textContent = '新規登録';
  renderTable();
}
function selectPart(ref) {
  const p = state.customParts.find(x => x.ref === ref);
  if (!p) { newPart(); return; }
  editingRef = ref;
  _pendingOutlineDxf = null;
  $('pp-maker').value = p.maker || '';
  $('pp-ref').value = p.ref;
  $('pp-ref').disabled = true;   // 型番は既存部品のキーなので編集中は変えない
  $('pp-type').value = p.type || '';
  $('pp-volt').value = p.volt || '';
  $('pp-amp').value = p.amp || '';
  $('pp-term').value = p.terminals || '';
  $('pp-contacts').value = p.contacts || '';
  $('pp-note').value = p.note || '';
  $('pp-source').value = p.source || '';
  $('pp-caturl').value = p.catalogUrl || '';
  $('pp-outline-status').textContent = p.outlineDxf ? `外形図: ${p.outlineDxfName || 'あり'}` : '';
  $('pp-delete').style.display = '';
  $('pp-form-title').textContent = `編集: ${p.ref}`;
  renderTable();
}
async function savePart() {
  const ref = $('pp-ref').value.trim();
  if (!ref) { alert('型番を入力してください'); return; }
  const existing = state.customParts.find(p => p.ref === ref);
  const outlineDxf = _pendingOutlineDxf?.text ?? existing?.outlineDxf ?? '';
  const outlineDxfName = _pendingOutlineDxf?.filename ?? existing?.outlineDxfName ?? '';
  const part = {
    maker: $('pp-maker').value, ref, type: $('pp-type').value,
    volt: $('pp-volt').value, amp: $('pp-amp').value,
    terminals: $('pp-term').value, contacts: $('pp-contacts').value,
    note: $('pp-note').value, source: $('pp-source').value, catalogUrl: $('pp-caturl').value.trim(), custom: true,
    outlineDxf, outlineDxfName,
  };
  if (existing) Object.assign(existing, part); else state.customParts.push(part);
  renderAll();
  const ok = await saveAll();
  if (ok) { setStatus(`「${ref}」を保存しました`); newPart(); }
}
async function deleteCurrent() {
  if (!editingRef) return;
  if (!confirm(`「${editingRef}」を削除しますか？`)) return;
  state.customParts = state.customParts.filter(p => p.ref !== editingRef);
  renderAll();
  await saveAll();
  newPart();
}

// ---- 外形図DXF --------------------------------------------------
function _readDxfFileAsText(file, cb) {
  const rd = new FileReader();
  rd.onload = ev => {
    const buf = ev.target.result;
    const u8 = new Uint8Array(buf);
    let enc = 'UTF-8';
    if (!(u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF)) enc = _detectSjis(u8);
    let text;
    try { text = new TextDecoder(enc).decode(buf); }
    catch (err) { text = new TextDecoder('UTF-8').decode(buf); }
    cb(text);
  };
  rd.readAsArrayBuffer(file);
}
function handleOutlineFileSelect(e) {
  const f = e.target.files[0]; if (!f) return;
  _readDxfFileAsText(f, text => {
    _pendingOutlineDxf = { text, filename: f.name };
    $('pp-outline-status').textContent = `添付予定: ${f.name}`;
  });
}

// ---- CSV一括登録 -------------------------------------------------
function parseCSVLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function carryOutlineDxf(newPart, oldPart) {
  if (!oldPart || !newPart) return newPart;
  if (oldPart.outlineDxf !== undefined) newPart.outlineDxf = oldPart.outlineDxf;
  if (oldPart.outlineDxfName !== undefined) newPart.outlineDxfName = oldPart.outlineDxfName;
  return newPart;
}
async function bulkImportParts() {
  const raw = $('pp-csv').value;
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let added = 0, skipped = 0, updated = 0;
  const errors = [], legacyRows = [];
  lines.forEach((line, i) => {
    const cols = parseCSVLine(line);
    // 【2026-09-29】見出し行は「型番列が ref/型番 かつ メーカー列が maker/メーカー」のときだけ飛ばす
    // (catalog_db.py と同じ判定)。以前は行全体に /型番|ref/ を当てていたため、備考に
    // 「型番末尾の□で区別」と書いた行(UT-RR等11件)が黙って捨てられていた。
    if (/^(ref|型番)$/i.test((cols[1] || '').trim()) && /^(maker|メーカー)$/i.test((cols[0] || '').trim())) return;
    // 【2026-09-20】10列目にカタログURLを追加。9列までのCSVは従来どおり読める
    // (仕様は「8列以上」。足りない列は空、余分な列は無視)。
    const [maker, ref, type, volt, amp, terminals, contacts, note, source, catalogUrl] = cols;
    if (!ref) { errors.push(`${i + 1}行目: 型番が空です`); skipped++; return; }
    if (type && !PART_TYPE_CODES.includes(type)) {
      if (LEGACY_PART_TYPES[type]) {
        legacyRows.push(`${i + 1}行目: ${ref}（現在の種別: ${LEGACY_PART_TYPES[type]}）`);
      } else {
        errors.push(`${i + 1}行目: 種別「${type}」が不正です（${PART_TYPE_CODES.join('/')}のいずれか）`);
        skipped++; return;
      }
    }
    const part = { maker: maker || '', ref, type: type || '', volt: volt || '', amp: amp || '', terminals: terminals || '', contacts: contacts || '', note: note || '', source: source || '', catalogUrl: catalogUrl || '', custom: true };
    const existing = state.customParts.find(p => p.ref === ref);
    if (existing) {
      const prev = { ...existing };
      Object.assign(existing, part);
      carryOutlineDxf(existing, prev);
      updated++;
    } else { state.customParts.push(part); added++; }
  });
  renderAll();
  const ok = await saveAll();
  let msg = `登録完了: 新規${added}件`;
  if (updated) msg += `・更新${updated}件`;
  if (skipped) msg += `・スキップ${skipped}件`;
  if (!ok) msg = '保存できませんでした。画面上だけ変わっています。\n\n' + msg;
  if (errors.length) msg += `\n\n【エラー詳細】\n${errors.join('\n')}`;
  if (legacyRows.length) {
    msg += `\n\n【要再分類 ${legacyRows.length}件】\n`
      + `押ボタン → pb / セレクタ → selector / 接点ブロック単体 → contact_unit\n\n`
      + legacyRows.join('\n');
  }
  alert(msg);
  if (ok) $('pp-csv').value = '';
}

// ---- 保留CSV -------------------------------------------------
async function refreshPendingCsvList() {
  const sel = $('pp-pc-file');
  if (!sel) return;
  try {
    const data = await (await fetch('/api/pending_csv')).json();
    const files = data.files || [];
    sel.innerHTML = files.length
      ? files.map(f => `<option value="${escH(f)}">${escH(f)}</option>`).join('')
      : '<option value="">(登録待ちCSVはありません)</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">(サーバーに接続できません)</option>';
  }
}
async function loadPendingCsv() {
  const name = $('pp-pc-file')?.value;
  if (!name) { setStatus('ファイルを選択してください', true); return; }
  try {
    const res = await fetch('catalog_pending/' + encodeURIComponent(name));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    const csvEl = $('pp-csv');
    csvEl.value = csvEl.value.trim() ? (csvEl.value.trim() + '\n' + text) : text;
    setStatus(`読み込みました(${text.split('\n').filter(l => l.trim()).length}行)。内容を確認して「CSVから一括登録」を押してください`);
  } catch (e) {
    setStatus('読み込みに失敗しました: ' + (e.message || e), true);
  }
}

// ---- カタログDB検索 -------------------------------------------------
let _catalogResults = [];
async function catalogSearch() {
  const q = $('pp-cat-q')?.value.trim() || '';
  const box = $('pp-cat-result');
  if (!q) { setStatus('キーワードを入力してください', true); return; }
  setStatus('検索中...');
  try {
    const d = await (await fetch('/api/catalog/search?q=' + encodeURIComponent(q) + '&limit=100')).json();
    if (!d.ok) { setStatus('エラー: ' + (d.error || '検索に失敗しました'), true); box.style.display = 'none'; return; }
    _catalogResults = d.results || [];
    setStatus(`${d.count}件ヒット${d.count >= 100 ? '（上位100件を表示）' : ''}`);
    if (!_catalogResults.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = _catalogResults.map((r, i) => {
      const already = state.customParts.some(p => p.ref === r.ref);
      const spec = [r.type, r.volt, r.amp, r.contacts].filter(Boolean).join(' / ');
      return `<div style="display:flex;gap:6px;align-items:flex-start;padding:4px 0;border-bottom:1px solid var(--bd2)">
        <div style="flex:1;min-width:0">
          <div><b>${escH(r.ref)}</b> <span style="color:var(--fg3)">${escH(r.maker)}</span></div>
          <div style="color:var(--fg3);font-size:10px">${escH(spec)}</div>
        </div>
        <button class="fp-btn" style="font-size:10px;padding:2px 6px" onclick="catalogAddToParts(${i})">${already ? '上書き' : '部品DBへ'}</button>
      </div>`;
    }).join('');
  } catch (e) { setStatus('エラー: ' + (e.message || e), true); }
}
async function catalogAddToParts(idx) {
  const r = _catalogResults[idx];
  if (!r) return;
  const part = { maker: r.maker || '', ref: r.ref, type: r.type || '', volt: r.volt || '', amp: r.amp || '', terminals: r.terminals || '', contacts: r.contacts || '', note: r.note || '', source: r.source || '', catalogUrl: r.catalogUrl || '', custom: true };
  const existing = state.customParts.find(p => p.ref === r.ref);
  if (existing) {
    if (!confirm(`「${r.ref}」は既に部品DBにあります。カタログの内容で上書きしますか？（外形図は保持されます）`)) return;
    const prev = { ...existing };
    Object.assign(existing, part);
    carryOutlineDxf(existing, prev);
  } else { state.customParts.push(part); }
  renderAll();
  await saveAll();
  setStatus(`「${r.ref}」を部品DBに${existing ? '上書き' : '追加'}しました`);
  catalogSearch();
}

// ---- カタログ全件で作り直す(破壊的) -------------------------------
async function catalogResetPartsDb() {
  // 【2026-10-03】部品DBの場所が未設定(保存できない)なら、確認を出す前に止める。
  // 以前は「バックアップを書き出します」と確認したうえで最後の保存で失敗し、画面だけ入れ替わっていた
  // (盛田さん「parts_db.json が無い状態で作り直すは効かない」)。
  if (!serverPath) {   // loadAll が書ける部品DBを読めたときだけ入る
    setStatus('部品DBの場所が未設定のため作り直せません。上の「部品DBの場所」の「フォルダを選ぶ」で設定してから(部品DBが無いフォルダなら作れます)、もう一度押してください', true);
    return;
  }
  try {
    const d = await (await fetch('/api/catalog/all')).json();
    if (!d.ok) { setStatus('エラー: ' + (d.error || '取得に失敗しました'), true); return; }
    const rows = d.results || [];
    if (!rows.length) { setStatus('カタログDBが空です', true); return; }
    const now = state.customParts.length;
    const catalogRefs = new Set(rows.map(r => r.ref));
    const withDxf = state.customParts.filter(p => p.outlineDxf);
    const keptDxf = withDxf.filter(p => catalogRefs.has(p.ref)).length;
    const lostDxf = withDxf.length - keptDxf;
    const dropped = state.customParts.filter(p => !catalogRefs.has(p.ref)).map(p => p.ref);
    if (!confirm(`部品DBの中身を破棄し、カタログDBの${rows.length}件で作り直します。\n\n`
      + `　現在の部品DB: ${now}件 → 破棄されます\n　作り直し後　: ${rows.length}件\n`
      + (keptDxf ? `\n外形図DXFの紐付け ${keptDxf}件は引き継ぎます。\n` : '')
      + (lostDxf ? `⚠ カタログに無い部品の外形図 ${lostDxf}件は失われます。\n` : '')
      + (dropped.length ? `⚠ カタログに無い部品 ${dropped.length}件が削除されます。\n` : '')
      + `\n実行前にバックアップを書き出します。\n\n続けますか？`)) return;

    setStatus('バックアップ中...');
    const bres = await (await fetch('/api/parts/backup', { method: 'POST' })).json();
    if (!bres.ok && now > 0) {
      if (!confirm('バックアップを書き出せませんでした。このまま作り直すと現在の内容は戻せません。続けますか？')) { setStatus('中止しました'); return; }
    }
    setStatus('作り直し中...');
    const prevByRef = new Map(state.customParts.map(p => [p.ref, p]));
    state.customParts = rows.map(r => carryOutlineDxf({
      maker: r.maker || '', ref: r.ref, type: r.type || '', volt: r.volt || '', amp: r.amp || '',
      terminals: r.terminals || '', contacts: r.contacts || '', note: r.note || '', source: r.source || '', catalogUrl: r.catalogUrl || '', custom: true,
    }, prevByRef.get(r.ref)));
    renderAll();
    const ok = await saveAll(true);   // 全件入れ替えなので確認は済んでいる。強制で通す
    setStatus(ok ? `部品DBを${rows.length}件で作り直しました` : '保存できませんでした（画面上だけ変わっています）', !ok);
  } catch (e) { setStatus('エラー: ' + (e.message || e), true); }
}

// ---- タブ -------------------------------------------------
function switchTab(name) {
  ['list', 'import'].forEach(t => {
    $('pp-tab-' + t).classList.toggle('on', t === name);
    $('pp-panel-' + t).style.display = t === name ? '' : 'none';
  });
  if (name === 'import') { refreshPendingCsvList(); catalogRefreshStatus(); }
}

function toggleDark() {
  document.body.classList.toggle('dk');
  try { localStorage.setItem('ecad-parts-dark', document.body.classList.contains('dk') ? '1' : '0'); } catch (e) {}
}

// ================================================================
// カタログDB — catalog_pending のメーカー別CSVから作る検索用DB
// 【2026-09-19】CAD(js/ui.js)から移設。
// 【2026-09-29】原本を catalog_pending だけにした(tools/catalog_db/catalog_db.py 冒頭)。
// 以前はGoogle Driveの「カタログDB」フォルダを選び(File System Access API)、中身を
// サーバーへ送って取り込んでいたが、同じCSVが catalog_pending にもあって食い違っていた。
// サーバーが catalog_pending を直接読み、検索のたびにCSVの変更を見て作り直すので、
// フォルダの選択・取り込みの仕組み(IndexedDBのハンドル等)はすべて無くした。
// 部品DB(customParts)への書き込みではなく、検索用データベースの状態表示と作り直し。
// ================================================================
async function catalogRefreshStatus() {
  const st = document.getElementById('cat-status');
  if (!st) return;
  st.style.whiteSpace = 'pre-line';
  try {
    const d = await (await fetch('/api/catalog/stats')).json();
    if (!d.available) {
      st.textContent = 'カタログDB機能は未導入です（CADの他の機能には影響しません）';
      return;
    }
    if (!d.configured) {
      st.textContent = `カタログCSVのフォルダが見つかりません: ${d.csv_dir || ''}`;
      return;
    }
    const makers = (d.makers || []).map(m => `${m.maker} ${m.count}`).join(' / ');
    const count = d.built ? `登録 ${d.count}件` : '未作成（検索すると作られます）';
    st.textContent = `${d.source_label} — ${count}（CSV ${d.csv_files.length}個）`
      + `${makers ? '\n' + makers : ''}`;
  } catch (e) {
    st.textContent = 'サーバーが応答しません（start.batを最新版で起動してください）';
  }
}

// 【2026-10-03】「作り直す」ボタン(catalogRebuild)は消した。検索時に自動で作り直すため(parts.html の取り込みタブ参照)


window.addEventListener('DOMContentLoaded', () => {
  try { if (localStorage.getItem('ecad-parts-dark') === '1') document.body.classList.add('dk'); } catch (e) {}
  fillTypeSelect();
  newPart();
  loadAll();
});
