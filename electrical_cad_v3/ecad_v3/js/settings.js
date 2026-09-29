// ================================================================
// settings.js — CAD全体の設定画面と、保存先フォルダ(2026-09-24)
//
// 【経緯】盛田さん「保存先を選べるようにしたい、選んだあと記憶できるか？」。
// 設定画面は 2026-09-21 に「最終的には設定画面にまとめる」と方向だけ決まって
// いた(HANDOFF.md 参照)。保存先はどのみち画面(選ぶ・今の場所を見る・許可を
// 取り直す)が要るため、仮の置き場所を作らずに設定画面を今作り、最初の項目に
// した。他の設定はまだ移していない(順次「覚える」ようにしてから足す)。
//
// 【盛田さんの決定】
//   - フォルダは1つ(図面も出力も全部そこ)。今も1つだから。今後分ける可能性あり
//     → IndexedDBのキーを用途別に持てる形にしてある(今は 'out' の1つだけ)
//   - ダイアログなしで書き込む(今のダウンロードと同じ操作感)
//   - CSVは「図面名_用途.csv」
//
// 【仕組み】ブラウザ(Chrome/Edge)のフォルダ選択(showDirectoryPicker)で得た
// フォルダの「鍵」(FileSystemDirectoryHandle)を IndexedDB に覚える。
// localStorage には鍵を入れられないため、他の設定とは置き場所が違う。
// ブラウザを再起動すると書き込み許可が外れることがある(ブラウザの仕様)。
// 外れていたら設定画面に赤字で出し、「許可し直す」で戻せるようにした。
//
// 【2026-09-24・実機確認後の修正】盛田さん「保存関係はできてる」「上書きは今はng、
// 理由は無言で上書きになってる」「csvは出力ボタンの問題か出力がされてるのかが
// 分からなくなる」「設定ボタンの位置がng、リボンに大項目で入れること」。
//   - 同じ名前のファイルがあれば確認してから上書き(キャンセルなら保存しない)
//   - フォルダに書いたら画面に通知を数秒出す(ダウンロードのバーが出ないため)
//   - 設定はリボンの「設定」タブ。設定画面(ポップアップ)は廃止し、タブの中に直接置く
//
// 【失敗したら今までどおりダウンロード】未設定・許可が外れた・書けなかった
// (ExcelでCSVを開いたまま等)ときは、従来のダウンロードに落とす。
// 保存そのものが失われないことを最優先にする。
// ================================================================

const ST_DB_NAME = 'ecadSettingsDB';
const ST_STORE   = 'handles';
const ST_OUT_KEY = 'out';          // 保存先フォルダ(今は全用途でこの1つ)

function _stOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ST_DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(ST_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}
async function _stGet(key) {
  try {
    const db = await _stOpenDB();
    return await new Promise(r => {
      const req = db.transaction(ST_STORE, 'readonly').objectStore(ST_STORE).get(key);
      req.onsuccess = () => r(req.result || null);
      req.onerror   = () => r(null);
    });
  } catch (e) { return null; }
}
async function _stPut(key, val) {
  const db = await _stOpenDB();
  await new Promise((r, j) => {
    const tx = db.transaction(ST_STORE, 'readwrite');
    if (val == null) tx.objectStore(ST_STORE).delete(key); else tx.objectStore(ST_STORE).put(val, key);
    tx.oncomplete = () => r(); tx.onerror = () => j(tx.error);
  });
}

// 保存先の状態。'none'=未設定 / 'granted'=書ける / 'prompt'・'denied'=許可が外れている
async function stOutDirStatus() {
  const h = await _stGet(ST_OUT_KEY);
  if (!h) return { handle: null, state: 'none' };
  let st = 'prompt';
  try { st = await h.queryPermission({ mode: 'readwrite' }); } catch (e) {}
  return { handle: h, state: st };
}

// 画面の通知。フォルダへ直接書くとブラウザのダウンロード表示が出ないため、
// 「本当に出力されたのか」が分からなくなる(盛田さん指摘)。数秒だけ目立つ位置に出す。
function stToast(msg, kind) {
  const h = document.getElementById('s-hint'); if (h) h.textContent = msg;
  if (!document.body || !document.createElement) return;
  let t = document.getElementById('st-toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'st-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:9999;'
      + 'padding:8px 16px;border-radius:4px;font-size:13px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.4);'
      + 'max-width:80vw;pointer-events:none;white-space:pre-line';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = kind === 'ng' ? '#c0392b' : kind === 'warn' ? '#b9770e' : '#1e7d3a';
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, kind === 'ok' ? 3000 : 6000);
}

async function _stExists(dir, fname) {
  try { await dir.getFileHandle(fname); return true; } catch (e) { return false; }
}

// ファイルを書き出す。保存先フォルダに書ければそこへ、だめならダウンロード。
// dl()(edit.js)とPDF出力から呼ぶ。
async function stWriteOut(fname, blob, fallback) {
  const { handle, state } = await stOutDirStatus();
  if (!handle) { fallback(); return; }                     // 未設定 → 今までどおり
  let st = state;
  if (st !== 'granted') {
    // 保存ボタンを押した直後ならここで許可を聞ける。聞けなければダウンロードへ。
    try { st = await handle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
  }
  if (st !== 'granted') {
    fallback();
    stToast(`保存先フォルダ「${handle.name}」への許可が外れています。\n今回はダウンロードフォルダに保存しました（設定タブで許可し直せます）`, 'warn');
    return;
  }
  // 無言で上書きしない(盛田さん「上書きは今はng、理由は無言で上書きになってる」)
  if (await _stExists(handle, fname)
      && !confirm(`「${fname}」は保存先「${handle.name}」に既にあります。\n上書きしますか？`)) {
    stToast(`保存を取りやめました: ${fname}`, 'warn');
    return;
  }
  try {
    const fh = await handle.getFileHandle(fname, { create: true });
    const w  = await fh.createWritable();
    await w.write(blob);
    await w.close();
    stToast(`保存しました: ${handle.name}\\${fname}`, 'ok');
  } catch (e) {
    fallback();
    stToast(`「${handle.name}」に書けませんでした（${e.message}）。\n今回はダウンロードフォルダに保存しました`, 'ng');
  }
}

// ---- 設定タブ(リボン) ------------------------------------------------
// タブを開くたびに状態を描き直す(許可が外れたかどうかは開くまで分からないため)。
async function stRenderRibbon() {
  const box = document.getElementById('st-outdir');
  if (!box) return;
  const { handle, state } = await stOutDirStatus();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  let status;
  if (!handle) {
    status = `<span style="color:var(--fg3)">未設定（ダウンロードフォルダに保存）</span>`;
  } else if (state === 'granted') {
    status = `<span style="font-family:monospace;font-weight:600">${esc(handle.name)}</span>`;
  } else {
    status = `<span style="font-family:monospace;font-weight:600">${esc(handle.name)}</span>`
           + ` <span style="color:var(--red)">許可が外れています（今はダウンロードフォルダに保存）</span>`;
  }
  const supported = !!window.showDirectoryPicker;
  const btn = (fn, label, title) => `<div class="rb rb-sm" onclick="${fn}" title="${title}">${label}</div>`;
  box.innerHTML =
      `<div style="font-size:11px;padding:0 6px;white-space:nowrap"><span style="color:var(--fg3)">今の保存先:</span> ${status}</div>`
    + (supported
        ? btn('stPickOutDir()', 'フォルダを選ぶ', '図面の保存と出力(DXF・PDF・SVG・CSV)をすべてこのフォルダへ書きます。選んだフォルダは次回も覚えています')
        : `<span style="font-size:11px;color:var(--red)">このブラウザはフォルダの選択に対応していません（Chrome か Edge で開いてください）</span>`)
    + (handle && state !== 'granted' ? btn('stRegrant()', '許可し直す', 'ブラウザを再起動すると書き込みの許可が外れることがあります') : '')
    + (handle ? btn('stClearOutDir()', '解除', '保存先を解除し、ダウンロードフォルダへ戻します') : '');
  if (typeof syncRibbonHeight === 'function') syncRibbonHeight();
}

async function stPickOutDir() {
  try {
    const h = await window.showDirectoryPicker({ id: 'ecad-out', mode: 'readwrite' });
    await _stPut(ST_OUT_KEY, h);
  } catch (e) {
    if (e && e.name === 'AbortError') return;             // キャンセル
    alert('フォルダを選べませんでした: ' + e.message);
  }
  stRenderRibbon();
}
async function stRegrant() {
  const h = await _stGet(ST_OUT_KEY);
  if (h) { try { await h.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
  stRenderRibbon();
}
async function stClearOutDir() {
  await _stPut(ST_OUT_KEY, null);
  stRenderRibbon();
}

// ================================================================
// 前回値を覚える(2026-09-29)
//
// 盛田さん「プルダウンの部分は一度選んだら、前回値記憶できないか？」「型番関係なくだな」
// 「全部で」。2026-09-21 に「毎回リセットされる設定を覚えるようにしてから設定画面に
// まとめる」と決めていた(HANDOFF.md)。その「覚える」段をここでやる(設定画面はまだ)。
//
// 【置き場所】localStorage の専用キー ecad_prefs。図面データ(自動保存・図面ファイル)には
// 入れない。好みは図面の中身ではなく、人に図面を渡したときに付いていくべきでないため
// (9-21の指摘「好みが図面データに混ざっている」)。各自が自分のPCで使う前提(9-29の決定)。
//
// 【覚えるもの】
//   部品の選択(型番に関係なく、最後に選んだ値): コイル電圧・極数・定格電流・動作特性
//     → 次に型番を割り当てたとき、その型番で選べる値なら最初から選ばれる。選べなければ従来の既定
//   作図・出力: グリッド・端点Snap・中点Snap・線幅(作図)・PDFの解像度・PDFの形式
// 【覚えないもの】端子の見た目(分岐点/端子○/端子◎のボタンを押すたびに決まる)・端子のサイズ
//   (今の画面に入力欄が無い)。レイヤー・線種など要素のプロパティは、その要素の値なので対象外。
// ================================================================
const ST_PREFS_KEY = 'ecad_prefs';

function stPrefs() {
  try { return JSON.parse(localStorage.getItem(ST_PREFS_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
// 値が空(未選択)なら覚えている値を消す
function stSetPref(key, val) {
  try {
    const p = stPrefs();
    if (val === undefined || val === null || val === '') delete p[key]; else p[key] = val;
    localStorage.setItem(ST_PREFS_KEY, JSON.stringify(p));
  } catch (e) {}
}

// 起動時に作図・出力の前回値を state と画面へ戻す(boot.js から、自動保存の復元の後に呼ぶ)
function stApplyPrefs() {
  const p = stPrefs();
  const setSel = (id, v) => {
    const e = document.getElementById(id);
    if (e && [...e.options].some(o => o.value === String(v))) { e.value = String(v); return true; }
    return false;
  };
  if (p.grid != null && setSel('grid-sel', p.grid)) state.G = +p.grid;
  if (typeof p.snapEnd === 'boolean') state.snapEnd = p.snapEnd;
  if (typeof p.snapMid === 'boolean') state.snapMid = p.snapMid;
  document.getElementById('rb-snapend')?.classList.toggle('on', !!state.snapEnd);
  document.getElementById('rb-snapmid')?.classList.toggle('on', !!state.snapMid);
  if (p.drawLw != null && setSel('draw-lw', p.drawLw)) state.drawLineWidth = p.drawLw === '' ? null : parseFloat(p.drawLw);
  if (p.pdfDpi != null) setSel('pdf-dpi', p.pdfDpi);
  if (p.pdfFmt != null) setSel('pdf-fmt', p.pdfFmt);
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['settings.js'] = 1;
