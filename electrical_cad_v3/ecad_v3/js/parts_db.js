// ================================================================
// parts_db.js — 部品DB（customParts）を図面ファイルと分離し、
// 外部JSONファイルとして管理する。symbol_lib.jsのZIP自動復元と同方式。
// ================================================================
const partsDb = (() => {
  let fileHandle = null;
  let saveTimer = null;

  // 【2026-09-01 追加】保存を止めるロックと、直近に確認できた件数。
  //
  // 事故の経緯: autoRestore() は読み込みより先に fileHandle を立てていたため、
  // 権限が下りない・JSONが壊れている等で読めなかった場合でも「接続済み」に
  // なってしまい、次に部品を1つ触った時点で空の部品DBでファイルを丸ごと
  // 上書きしていた。図面側(autosave.js)で2026-08-23に直したのと同じ構造の穴が、
  // 部品DB側には残っていた。
  //
  // さらに悪いことに、保存が動いていないことを知らせる先が
  // 「カスタム部品登録」パネルの中の1行(.parts-db-status)しか無く、
  // 普段は閉じているため、書けていないまま作業を続けられてしまった。
  //
  // 対策は3つ:
  //   1. 読めるまで fileHandle を立てない(=書き込みが起こり得ない)
  //   2. 失敗したらロックして、画面上部に赤い帯で出す
  //   3. 件数が大きく減った状態では、確認せずに書かない
  let saveLocked = false;   // trueの間は writeNow を一切行わない
  let lastGoodCount = null; // 最後にファイルと一致していた件数(nullは未確認)

  function setStatus(msg) {
    document.querySelectorAll('.parts-db-status').forEach(el => el.textContent = msg);
  }

  // 部品DBが保存されていないことは、閉じたパネルの中ではなく画面で伝える。
  // 帯そのものの実装は state.js の showTopBanner に置いてある(複数箇所で使うため)。
  function setBanner(msg) { showTopBanner('parts-db-banner', msg); }

  // 保存を止める。ファイルには一切触らないので、中身は無傷のまま残る。
  function lockSaving(reason) {
    saveLocked = true;
    clearTimeout(saveTimer);
    setStatus(`${reason}（部品DBの自動保存を停止しています）`);
    setBanner(`⚠ ${reason}。部品DBの自動保存を停止しました。`
      + 'ファイルの中身は無傷です。「部品登録」パネルの📂開く で開き直してください');
  }

  function unlockSaving() {
    saveLocked = false;
    setBanner('');
  }

  // 件数が大きく減った状態での上書きを疑う。
  // 1件ずつの削除は普通の操作なので通し、「全部消えた」「半分以下になった」だけ止める。
  function isSuspiciousDrop(prev, now) {
    if (prev === null || prev <= 0) return false;
    if (now === 0) return true;
    return prev >= 10 && now < prev / 2;
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
  // バックアップ先フォルダのハンドル(部品DBファイルとは別に覚える)
  async function saveBackupDirRef(handle) {
    try { const db = await openHandleDB(); db.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'backupDir'); } catch (e) {}
  }
  async function loadBackupDirRef() {
    try {
      const db = await openHandleDB();
      return await new Promise(r => {
        const req = db.transaction('handles', 'readonly').objectStore('handles').get('backupDir');
        req.onsuccess = () => r(req.result);
        req.onerror = () => r(null);
      });
    } catch (e) { return null; }
  }

  // バックアップ先フォルダを選ぶ(ボタンから呼ぶ)。
  // フォルダ選択はユーザー操作の中でしか開けないので、破壊的操作の途中ではなく
  // 事前に1回選んでもらう。選んだフォルダはIndexedDBに覚えるので次回以降は不要。
  async function pickBackupDir() {
    if (!window.showDirectoryPicker) {
      alert('このブラウザはフォルダ選択に対応していません（Chrome/Edge推奨）');
      return null;
    }
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (!(await ensurePermission(dir, 'readwrite'))) {
        setStatus('バックアップ先フォルダへの書込み許可がありません');
        return null;
      }
      await saveBackupDirRef(dir);
      setStatus(`バックアップ先: ${dir.name}`);
      return dir.name;
    } catch (e) {
      if (e.name !== 'AbortError') alert('フォルダの選択に失敗しました: ' + e.message);
      return null;
    }
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
      // 人が選び直した内容が正しい前提になるので、ここで基準を取り直してロックを解く
      lastGoodCount = data.customParts.length;
      unlockSaving();
      if (typeof renderPartsAll === 'function') renderPartsAll();
      setStatus(`部品DB: ${handle.name} (${data.customParts.length}件)`);
    } catch (e) { if (e.name !== 'AbortError') alert('読み込みエラー: ' + e.message); }
  }

  // 新規に部品DBファイルを作成（現在のcustomPartsを書き込む）
  //
  // 「開く」が失敗して部品が0件になっているときにここを押し、保存ダイアログで
  // 既存の parts_db.json を選ぶと、その場で中身が空になる。復旧作業中に
  // 一番押されやすいボタンなので、0件のときだけ念を押す。
  async function createNew() {
    if (!window.showSaveFilePicker) { alert('このブラウザはFile System Access APIに対応していません（Chrome/Edge推奨）'); return; }
    if (!state.customParts.length && typeof confirm === 'function'
        && !confirm('いま部品DBは0件です。このまま作成すると、選んだファイルの中身が0件になります。\n'
                  + '既存の部品DBを読み込みたい場合は「📂開く」を使ってください。\n\n続けますか？')) return;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: 'parts_db.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      fileHandle = handle;
      lastGoodCount = null;   // 新規ファイルなので比較対象は無い
      unlockSaving();
      await saveHandleRef(handle);
      await writeNow();
      setStatus(`部品DB: ${handle.name} (${state.customParts.length}件)`);
    } catch (e) { if (e.name !== 'AbortError') alert('作成エラー: ' + e.message); }
  }

  // 戻り値は「本当にファイルへ書けたか」。
  // 2026-09-01: catalogResetPartsDb() がこの戻り値を見ずに
  // 「605件で作り直しました」と成功のalertを出していたため、保存が空振りしても
  // 画面には605件が並び、次の起動で168件に戻る、という形で作り直しが消えていた。
  // 呼び出し側が成否を判断できないと、同じことがまた起きる。
  async function writeNow() {
    if (!fileHandle) return false;
    if (saveLocked) return false;   // 読めていない/件数が激減した状態では書かない
    const now = state.customParts.length;
    // 件数が大きく減ったまま書くと、ファイル側の控えも同時に失われて戻せなくなる。
    // 自動で判断せず、必ず人に聞く。断られたらロックして以後も書かない。
    if (isSuspiciousDrop(lastGoodCount, now)) {
      const ok = typeof confirm === 'function' && confirm(
        `部品DBの件数が ${lastGoodCount} 件から ${now} 件に減っています。\n`
        + `このまま保存すると、ファイル(${fileHandle.name})の中身も ${now} 件になります。\n\n`
        + `[OK] このまま保存する\n`
        + `[キャンセル] 保存せず、部品DBの自動保存を停止する`);
      if (!ok) {
        lockSaving(`部品DBの件数が ${lastGoodCount} → ${now} に減ったため保存を止めました`);
        return false;
      }
    }
    try {
      if (!(await ensurePermission(fileHandle, 'readwrite'))) {
        lockSaving('部品DBファイルへの書込み許可がありません');
        return false;
      }
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify({ customParts: state.customParts, hiddenBuiltinRefs: state.hiddenBuiltinRefs }, null, 2));
      await writable.close();
      lastGoodCount = now;
      setStatus(`部品DB: ${fileHandle.name} (${now}件・保存済み)`);
      return true;
    } catch (e) {
      // 書けなかったことを黙って流さない。次の変更でまた同じ失敗をするだけなので止める。
      lockSaving(`部品DBを保存できませんでした(${e.message})`);
      return false;
    }
  }

  // customParts変更時に呼ぶ（デバウンス保存）
  function scheduleSave() {
    if (!fileHandle || saveLocked) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 1500);
  }

  // 起動時：前回選択したファイルを自動復元
  //
  // ここで失敗した場合、fileHandle は絶対に立てない。立ててしまうと
  // 「読めなかった」状態のまま接続済みになり、次に部品を1つ触った時点で
  // 空の部品DBでファイルを上書きしてしまう(この関数の元の作りがそうだった)。
  //
  // 権限確認はページ読み込み中に走るためユーザー操作が無く、ブラウザが
  // 許可ダイアログを出せずに拒否することがある(ブラウザ再起動後など)。
  // つまりここは「たまに失敗する」のが普通の経路で、例外的な状況ではない。
  async function autoRestore() {
    const handle = await loadHandleRef();
    if (!handle) { setStatus('部品DBファイル未設定（下の「開く」「新規作成」から設定してください）'); return; }
    let data;
    try {
      if (!(await ensurePermission(handle, 'readwrite'))) {
        lockSaving(`部品DB「${handle.name}」へのアクセス許可が下りませんでした`);
        return;
      }
      data = await readFromHandle(handle);
    } catch (e) {
      lockSaving(`部品DB「${handle.name}」を読めませんでした(${e.message})`);
      return;
    }
    // 読めた。ここで初めて「接続済み」にする。
    fileHandle = handle;
    lastGoodCount = data.customParts.length;
    unlockSaving();

    // 前回ファイルに書けないまま図面側(localStorage)へ退避されていた部品を捨てない。
    // 元の実装は無条件に state.customParts を置き換えていたため、
    // 保存できていなかった回の登録が、次の起動で黙って消えていた。
    const extra = (state.customParts || [])
      .filter(p => !data.customParts.some(q => q.ref === p.ref));
    state.customParts = data.customParts.concat(extra);
    state.hiddenBuiltinRefs = data.hiddenBuiltinRefs;
    if (typeof renderPartsAll === 'function') renderPartsAll();
    if (extra.length) {
      setBanner(`部品DBのファイルに入っていなかった ${extra.length} 件を復帰させました`
        + '（前回保存できていなかった分の可能性があります）。内容を確認してください');
      scheduleSave();
    }
    setStatus(`部品DB: ${handle.name} (${state.customParts.length}件)`);
  }

  // 破壊的な操作(全件リセット等)の直前に、現在の内容を別ファイルへ退避する。
  // 同じフォルダに parts_db_backup_YYYY-MM-DD_HHMM.json として書き出す。
  // 判断を変えるためではなく、万一のときに戻せるようにするための保険。
  async function backupNow() {
    if (!fileHandle) return null;
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const name = `parts_db_backup_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
      + `_${p(d.getHours())}${p(d.getMinutes())}.json`;
    const body = JSON.stringify(
      { customParts: state.customParts, hiddenBuiltinRefs: state.hiddenBuiltinRefs }, null, 2);

    const writeInto = async dir => {
      const h = await dir.getFileHandle(name, { create: true });
      const w = await h.createWritable();
      await w.write(body);
      await w.close();
      return name;
    };

    // 1) 覚えてあるバックアップ先フォルダ(通常はここで書ける)
    try {
      const dir = await loadBackupDirRef();
      if (dir && await ensurePermission(dir, 'readwrite')) return await writeInto(dir);
    } catch (e) { console.warn('[parts_db] バックアップ先フォルダに書けませんでした', e); }

    // 2) 部品DBと同じフォルダ。
    //    ※ ChromeのFile System Access APIに getParent() は無いため、現状ここは通らない。
    //      将来ブラウザが対応すれば、フォルダを選ばなくても済むようになる。
    try {
      const dir = await fileHandle.getParent?.();
      if (dir) return await writeInto(dir);
    } catch (e) { /* 使えないブラウザなら次へ */ }

    // 3) 最後の手段。保存ダイアログはユーザー操作中でないと開けないので、
    //    ここに落ちた時点で失敗することもある。その場合は null を返して
    //    呼び出し側に「バックアップが取れていない」と判断させる。
    try {
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
      console.warn('[parts_db] バックアップを書き出せませんでした', e);
      return null;
    }
  }

  // バックアップ先が設定済みかどうか(画面表示用)
  async function backupDirName() {
    const dir = await loadBackupDirRef();
    return dir ? dir.name : '';
  }

  // hasFile() は autosave.js / edit.js が「部品DBを外部ファイルで管理できているか」の
  // 判定に使い、falseのときは customParts を図面側(localStorage・図面ファイル)へ
  // 一緒に保存する。したがってロック中は false を返すのが正しい ——
  // ファイルに書けていないのだから、せめて図面側に控えを残す必要がある。
  return { pickExisting, createNew, scheduleSave, autoRestore, writeNow, backupNow,
           pickBackupDir, backupDirName,
           hasFile: () => !!fileHandle && !saveLocked,
           isLocked: () => saveLocked,
           partsCount: () => (state.customParts || []).length };
})();
