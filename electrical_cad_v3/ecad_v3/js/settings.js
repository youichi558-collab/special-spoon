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

// ファイルを書き出す。保存先フォルダに書ければそこへ、だめならダウンロード。
// dl()(edit.js)とPDF出力から呼ぶ。
async function stWriteOut(fname, blob, fallback) {
  const hint = msg => { const h = document.getElementById('s-hint'); if (h) h.textContent = msg; };
  const { handle, state } = await stOutDirStatus();
  if (!handle) { fallback(); return; }                     // 未設定 → 今までどおり
  let st = state;
  if (st !== 'granted') {
    // 保存ボタンを押した直後ならここで許可を聞ける。聞けなければダウンロードへ。
    try { st = await handle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
  }
  if (st !== 'granted') {
    fallback();
    hint(`保存先フォルダ「${handle.name}」への許可が外れています。今回はダウンロードフォルダに保存しました（設定から許可し直せます）`);
    return;
  }
  try {
    const fh = await handle.getFileHandle(fname, { create: true });
    const w  = await fh.createWritable();
    await w.write(blob);
    await w.close();
    hint(`保存しました: ${handle.name}\\${fname}`);
  } catch (e) {
    fallback();
    hint(`「${handle.name}」に書けませんでした（${e.message}）。今回はダウンロードフォルダに保存しました`);
  }
}

// ---- 設定画面 ----------------------------------------------------
async function openSettingsPanel() {
  await stRenderPanel();
  openFP('settings-p');
}

async function stRenderPanel() {
  const box = document.getElementById('st-body');
  if (!box) return;
  const { handle, state } = await stOutDirStatus();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  let status;
  if (!handle) {
    status = `<span style="color:var(--fg3)">未設定（ブラウザのダウンロードフォルダに保存されます）</span>`;
  } else if (state === 'granted') {
    status = `<span style="font-family:monospace">${esc(handle.name)}</span>`;
  } else {
    status = `<span style="font-family:monospace">${esc(handle.name)}</span>`
           + `<br><span style="color:var(--red)">書き込みの許可が外れています。「許可し直す」を押してください。`
           + `外れている間はダウンロードフォルダに保存されます</span>`;
  }
  const supported = !!window.showDirectoryPicker;
  box.innerHTML = `
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">保存先</div>
    <div style="font-size:11px;color:var(--fg3);margin-bottom:6px">
      図面（保存・全頁保存）と出力（DXF・PDF・SVG・CSV）をすべてこのフォルダに保存します。
      同じ名前のファイルがあれば上書きします。
    </div>
    <div style="font-size:11px;margin-bottom:8px">今の保存先: ${status}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="fp-btn primary" onclick="stPickOutDir()"${supported ? '' : ' disabled'}>フォルダを選ぶ</button>
      ${handle && state !== 'granted' ? `<button class="fp-btn" onclick="stRegrant()">許可し直す</button>` : ''}
      ${handle ? `<button class="fp-btn" onclick="stClearOutDir()">解除（ダウンロードフォルダに戻す）</button>` : ''}
    </div>
    ${supported ? '' : `<div style="font-size:11px;color:var(--red);margin-top:6px">このブラウザはフォルダの選択に対応していません（Chrome か Edge で開いてください）</div>`}
  `;
}

async function stPickOutDir() {
  try {
    const h = await window.showDirectoryPicker({ id: 'ecad-out', mode: 'readwrite' });
    await _stPut(ST_OUT_KEY, h);
  } catch (e) {
    if (e && e.name === 'AbortError') return;             // キャンセル
    alert('フォルダを選べませんでした: ' + e.message);
  }
  stRenderPanel();
}
async function stRegrant() {
  const h = await _stGet(ST_OUT_KEY);
  if (h) { try { await h.requestPermission({ mode: 'readwrite' }); } catch (e) {} }
  stRenderPanel();
}
async function stClearOutDir() {
  await _stPut(ST_OUT_KEY, null);
  stRenderPanel();
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['settings.js'] = 1;
