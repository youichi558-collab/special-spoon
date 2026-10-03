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

// ファイルを書き出す。**保存・出力のたびに保存先フォルダを選ばせる**(2026-09-29)。
// dl()(edit.js)とPDF出力から呼ぶ。
//
// 盛田さん「設定画面だけは使いづらい、保存先選択は全部出す必要があるな」→ 出し方は「出力のたびに
// フォルダ選択の窓を開く」(案1)。以前(9-24)は設定タブで選んだ1つのフォルダへ窓なしで書いていた。
//   ・窓は前回選んだフォルダから開く(startIn)。選んだフォルダは次回の開始位置として覚える
//   ・窓を閉じた(キャンセル)ら、その出力は取りやめる(ダウンロードにも落とさない)
//   ・窓が開けない/選べないとき(このブラウザが非対応・時間が経って操作の直後でなくなった・
//     システムフォルダを選んだ等)は、今までどおりダウンロードに落とす。保存そのものは失わない
//   ・同じ名前のファイルがあれば確認してから上書き(無言で上書きしない)
//
// 【2026-10-01】フォルダ選択の窓(showDirectoryPicker)をやめ、**「名前を付けて保存」の窓(showSaveFilePicker)**にした
// (盛田さん「保存押しても、選択はでない」→「直して」)。
//   ・原因: 「保存」はファイル名の入力窓(prompt)を先に出していた。ブラウザは保存の窓を**ボタンを押した直後(数秒)**しか
//     開かせないので、名前を打っている間に過ぎて窓が開けず、ダウンロードに落ちていた。PDFも描画に時間がかかると同じ
//   ・今: ボタンを押したら**最初に**この窓を開く(この関数は窓を開くまで await しない)。フォルダとファイル名を1つの窓で選び、
//     上書きの確認も窓の中で出る。窓は前回保存した場所から開く(覚えた場所はメモリにも持つ=開く前に待たないため)
//   ・中身は窓で名前が決まってから作る(make(選んだ名前) → Blob)。名前を中身に入れる保存(図面のsaveFileName)のため
//   ・窓を閉じた(キャンセル)=取りやめ。窓が使えない/開けない/書けないときはダウンロードに落とす(保存そのものは失わない)
// make: Blob か、(選んだ名前) => Blob の関数。fallback(名前): ダウンロード。onDone(名前): 書けたあと(ダウンロードに落ちたときも)
let _stLastHandle = null;   // 前回保存した場所(ファイルかフォルダの鍵)。startIn に渡す
if (typeof indexedDB !== 'undefined') _stGet(ST_OUT_KEY).then(h => { if (h && !_stLastHandle) _stLastHandle = h; });
const ST_TYPES = { json: ['図面データ', 'application/json'], dxf: ['DXF', 'application/dxf'], pdf: ['PDF', 'application/pdf'],
                   svg: ['SVG', 'image/svg+xml'], csv: ['CSV', 'text/csv'] };
async function stWriteOut(fname, make, fallback, onDone) {
  const build = name => (typeof make === 'function' ? make(name) : make);
  const fb = name => { fallback(name); if (onDone) onDone(name); };
  if (!(window.showSaveFilePicker)) { fb(fname); return; }    // 非対応ブラウザ → 従来どおり
  const ext = (String(fname).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
  const t = ST_TYPES[ext.toLowerCase()];
  const opt = { suggestedName: fname, id: 'ecad-out' };
  if (t) opt.types = [{ description: t[0], accept: { [t[1]]: ['.' + ext.toLowerCase()] } }];
  if (_stLastHandle) opt.startIn = _stLastHandle;
  let fh;
  try {
    fh = await window.showSaveFilePicker(opt);                 // ← ここまで await しない(押した直後に開く)
  } catch (e) {
    if (e && e.name === 'AbortError') { stToast(`保存を取りやめました: ${fname}`, 'warn'); return; }
    if (opt.startIn) {                                         // 覚えた場所が消えた等で開けないときは、場所の指定なしでもう一度
      delete opt.startIn;
      try { fh = await window.showSaveFilePicker(opt); }
      catch (e2) { if (e2 && e2.name === 'AbortError') { stToast(`保存を取りやめました: ${fname}`, 'warn'); return; } e = e2; }
    }
    if (!fh) {
      fb(fname);
      stToast(`保存の窓を開けませんでした（${e && e.message || e}）。\n今回はダウンロードフォルダに保存しました`, 'warn');
      return;
    }
  }
  _stLastHandle = fh;
  try { await _stPut(ST_OUT_KEY, fh); } catch (e) {}           // 次回の開始位置として覚える
  const blob = build(fh.name);
  if (!blob) return;                                           // 中身が作れなかった(作る側で知らせ済み)
  try {
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    stToast(`保存しました: ${fh.name}`, 'ok');
    if (onDone) onDone(fh.name);
  } catch (e) {
    fb(fh.name);
    stToast(`「${fh.name}」に書けませんでした（${e.message}）。\n今回はダウンロードフォルダに保存しました`, 'ng');
  }
}

// 全ページを別々のファイルに書くとき(PDFの全ページ別ファイル)。ページごとに窓を出すと何回も選ぶことになるので、
// 最初に1回だけ**フォルダ**を選ぶ。同じ名前があれば確認してから上書き。戻り値: フォルダの鍵(使えない/開けない=null、取りやめ='abort')
async function stPickFolderOnce() {
  if (!(window.showDirectoryPicker)) return null;
  const opt = { id: 'ecad-out', mode: 'readwrite' };
  if (_stLastHandle && _stLastHandle.kind === 'directory') opt.startIn = _stLastHandle;
  try { return await window.showDirectoryPicker(opt); }
  catch (e) { return (e && e.name === 'AbortError') ? 'abort' : null; }
}
async function stWriteToFolder(dir, fname, blob) {
  if (await _stExists(dir, fname) && !confirm(`「${fname}」は「${dir.name}」に既にあります。\n上書きしますか？`)) return false;
  const fh = await dir.getFileHandle(fname, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
  return true;
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
    status = `<span style="color:var(--fg3)">まだ選んでいません</span>`;
  } else {
    status = `<span style="font-family:monospace;font-weight:600">${esc(handle.name)}</span>`;
  }
  const supported = !!window.showDirectoryPicker;
  const btn = (fn, label, title) => `<div class="rb rb-sm" onclick="${fn}" title="${title}">${label}</div>`;
  box.innerHTML =
      `<div style="font-size:11px;padding:0 6px;white-space:nowrap"><span style="color:var(--fg3)">前回の保存先:</span> ${status}</div>`
    + (supported
        ? btn('stPickOutDir()', 'フォルダを選ぶ', '保存・出力のたびに「名前を付けて保存」の窓が開きます。ここで選ぶと、その窓がこのフォルダから開きます（先に選んでおく必要はありません。前回保存した場所から開きます）')
        : `<span style="font-size:11px;color:var(--red)">このブラウザはフォルダの選択に対応していません（Chrome か Edge で開いてください）</span>`)
    + (handle ? btn('stClearOutDir()', '解除', '前回の保存先を忘れます（次の保存のときの窓は既定の場所から開きます）') : '');
  // 部品DBの場所(2026-10-02、js/parts_db_place.js)。設定したらCADの部品DBを読み直す
  if (typeof pdbPlaceRender === 'function') pdbPlaceRender('pdb-place', () => { if (typeof partsDb !== 'undefined') partsDb.reload(); });
  if (typeof syncRibbonHeight === 'function') syncRibbonHeight();
}

async function stPickOutDir() {
  try {
    const h = await window.showDirectoryPicker({ id: 'ecad-out', mode: 'readwrite' });
    await _stPut(ST_OUT_KEY, h);
    _stLastHandle = h;
  } catch (e) {
    if (e && e.name === 'AbortError') return;             // キャンセル
    alert('フォルダを選べませんでした: ' + e.message);
  }
  stRenderRibbon();
}
async function stClearOutDir() {
  await _stPut(ST_OUT_KEY, null);
  _stLastHandle = null;
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
  if (p.xrefScale >= 0.3 && p.xrefScale <= 2) state.xrefScale = +p.xrefScale;   // クロスリファレンスの表示(js/xref.js)
  // 右パネル(プロパティ)の幅(2026-10-02、ui.js applyRpLayout)。前回値が無くてもキャンバスの右端をパネルに合わせる
  if (typeof rpSetWidth === 'function') rpSetWidth(p.rpWidth || RP_W_DEF, false);
  // 左パネルの固定(ドッキング)と幅(2026-10-02、ui.js applyLpLayout)
  if (typeof toggleLpDock === 'function') { if (p.lpDockW) _lpdW = +p.lpDockW; toggleLpDock(!!p.lpDocked); }
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['settings.js'] = 1;
