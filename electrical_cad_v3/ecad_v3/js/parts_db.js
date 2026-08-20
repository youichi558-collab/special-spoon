// ================================================================
// parts_db.js — 部品DB（customParts）を図面ファイルと分離し、
// 外部JSONファイルとして管理する。symbol_lib.jsのZIP自動復元と同方式。
// ================================================================
const partsDb = (() => {
  let fileHandle = null;
  let saveTimer = null;

  function setStatus(msg) {
    document.querySelectorAll('.parts-db-status').forEach(el => el.textContent = msg);
  }

  function openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('partsDbHandleDB', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveHandleRef(handle) {
    try { const db = await openHandleDB(); const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(handle, 'partsDbHandle'); } catch (e) {}
  }
  async function loadHandleRef() {
    try {
      const db = await openHandleDB();
      return await new Promise(r => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('partsDbHandle');
        req.onsuccess = () => r(req.result);
        req.onerror = () => r(null);
      });
    } catch (e) { return null; }
  }

  async function readFromHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) return { customParts: data, hiddenBuiltinRefs: [] };
    return { customParts: data.customParts || [], hiddenBuiltinRefs: data.hiddenBuiltinRefs || [] };
  }

  async function ensurePermission(handle, mode) {
    let perm = await handle.queryPermission({ mode });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode });
    return perm === 'granted';
  }

  // 既存の部品DBファイルを開く（内容で state.customParts を置き換え）
  async function pickExisting() {
    if (!window.showOpenFilePicker) { alert('このブラウザはFile System Access APIに対応していません（Chrome/Edge推奨）'); return; }
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      const data = await readFromHandle(handle);
      if (state.customParts.length && !confirm(`現在の部品DB(${state.customParts.length}件)を、選択したファイルの内容(${data.customParts.length}件)で置き換えます。よろしいですか？`)) return;
      if (!(await ensurePermission(handle, 'readwrite'))) { setStatus('部品DBファイルへの書込み許可がありません'); return; }
      fileHandle = handle;
      await saveHandleRef(handle);
      state.customParts = data.customParts;
      state.hiddenBuiltinRefs = data.hiddenBuiltinRefs;
      if (typeof renderPartsAll === 'function') renderPartsAll();
      setStatus(`部品DB: ${handle.name} (${data.customParts.length}件)`);
    } catch (e) { if (e.name !== 'AbortError') alert('読み込みエラー: ' + e.message); }
  }

  // 新規に部品DBファイルを作成（現在のcustomPartsを書き込む）
  async function createNew() {
    if (!window.showSaveFilePicker) { alert('このブラウザはFile System Access APIに対応していません（Chrome/Edge推奨）'); return; }
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: 'parts_db.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      fileHandle = handle;
      await saveHandleRef(handle);
      await writeNow();
      setStatus(`部品DB: ${handle.name} (${state.customParts.length}件)`);
    } catch (e) { if (e.name !== 'AbortError') alert('作成エラー: ' + e.message); }
  }

  async function writeNow() {
    if (!fileHandle) return;
    try {
      if (!(await ensurePermission(fileHandle, 'readwrite'))) { setStatus('部品DBファイルへの書込み許可がありません（再選択してください）'); return; }
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ customParts: state.customParts, hiddenBuiltinRefs: state.hiddenBuiltinRefs }, null, 2));
      await writable.close();
      setStatus(`部品DB: ${fileHandle.name} (${state.customParts.length}件・保存済み)`);
    } catch (e) { setStatus('部品DB保存エラー: ' + e.message); }
  }

  // customParts変更時に呼ぶ（デバウンス保存）
  function scheduleSave() {
    if (!fileHandle) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 1500);
  }

  // 起動時：前回選択したファイルを自動復元
  async function autoRestore() {
    const handle = await loadHandleRef();
    if (!handle) { setStatus('部品DBファイル未設定（下の「開く」「新規作成」から設定してください）'); return; }
    try {
      if (!(await ensurePermission(handle, 'readwrite'))) { setStatus('部品DBファイルへのアクセスが拒否されました（再選択してください）'); return; }
      fileHandle = handle;
      const data = await readFromHandle(handle);
      state.customParts = data.customParts;
      state.hiddenBuiltinRefs = data.hiddenBuiltinRefs;
      if (typeof renderPartsAll === 'function') renderPartsAll();
      setStatus(`部品DB: ${handle.name} (${data.customParts.length}件)`);
    } catch (e) { setStatus('部品DBの自動読込に失敗しました（再選択してください）'); }
  }

  // 破壊的な操作(全件リセット等)の直前に、現在の内容を別ファイルへ退避する。
  // 同じフォルダに parts_db_backup_YYYY-MM-DD_HHMM.json として書き出す。
  // 判断を変えるためではなく、万一のときに戻せるようにするための保険。
  async function backupNow() {
    if (!fileHandle) return null;
    try {
      const dir = await fileHandle.getParent?.();
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      const name = `parts_db_backup_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
        + `_${p(d.getHours())}${p(d.getMinutes())}.json`;
      const body = JSON.stringify(
        { customParts: state.customParts, hiddenBuiltinRefs: state.hiddenBuiltinRefs }, null, 2);
      if (dir) {
        // 部品DBと同じフォルダに書ければ一番分かりやすい
        const h = await dir.getFileHandle(name, { create: true });
        const w = await h.createWritable();
        await w.write(body);
        await w.close();
        return name;
      }
      // getParent()が使えないブラウザでは保存先を選んでもらう
      if (!window.showSaveFilePicker) return null;
      const h = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const w = await h.createWritable();
      await w.write(body);
      await w.close();
      return h.name;
    } catch (e) {
      return null;
    }
  }

  return { pickExisting, createNew, scheduleSave, autoRestore, writeNow, backupNow,
           hasFile: () => !!fileHandle };
})();
