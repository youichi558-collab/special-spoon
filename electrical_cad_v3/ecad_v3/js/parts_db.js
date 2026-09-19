// ================================================================
// parts_db.js — 部品DB（customParts）をCADから読み込む。
//
// 【2026-09-03・読み取り専用化】部品DBの書き手はCADから部品DB単独画面
// (parts.html / js/parts_page.js)へ一本化した。分担は
//   部品DB単独画面 = 書く／CAD = 読むだけ
// で、CAD側にはもう保存経路が無い。設計はHANDOFF.md参照。
//
// これに伴い、以前ここにあった File System Access API 経由の直接読み書き
// (ブラウザでファイルを開いて保存する経路)は丸ごと廃止した。部品DBを読むには
// ローカルサーバー(start.bat)が動いている必要がある——動いていない環境で
// CADを開くと、部品DBは0件のまま(banner案内あり)で立ち上がる。
// 以前あった「サーバー無しでもファイルを直接開けば使える」フォールバックは
// 無くなった(意図した仕様。詳細はHANDOFF.mdの検討記録参照)。
// ================================================================
const partsDb = (() => {
  let connected = false;   // サーバーから読めているか
  let serverPath = '';     // 参考表示用(サーバーが読み書きしているファイルのパス)

  const baseName = p => String(p || '').split(/[\\/]/).pop() || 'parts_db.json';

  function setStatus(msg) {
    document.querySelectorAll('.parts-db-status').forEach(el => el.textContent = msg);
  }
  function setBanner(msg) { showTopBanner('parts-db-banner', msg); }

  // 図面ファイルに古い形式(Stage 1以前)でcustomPartsが埋め込まれている場合の救済。
  // サーバーから読めた内容を基本にしつつ、そこに無いref(埋め込みにしか無い分)は
  // 捨てずに残す。CADはもう書かないので、ここでの「復帰」は表示上のものだけ
  // ——保存したい場合は部品DB単独画面(parts.html)で保存し直してもらう。
  function mergeEmbedded(data) {
    const extra = (state.customParts || [])
      .filter(p => !data.customParts.some(q => q.ref === p.ref));
    state.customParts = data.customParts.concat(extra);
    state.hiddenBuiltinRefs = data.hiddenBuiltinRefs;
    if (typeof renderPartsAll === 'function') renderPartsAll();
    if (extra.length) {
      setBanner(`部品DBのファイルに入っていなかった ${extra.length} 件があります`
        + '（古い図面ファイルに残っていた分の可能性があります）。'
        + '内容は部品DB単独画面(parts.html)で確認・保存してください');
    }
    return extra.length;
  }

  // 起動時：ローカルサーバー経由で部品DBを読む。CADはこれ以外の経路を持たない。
  async function autoRestore() {
    let st;
    try {
      st = await (await fetch('/api/parts/stats')).json();
    } catch (e) {
      setStatus('部品DBを読み込めません（ローカルサーバーに接続できません。start.bat を起動してください）');
      setBanner('⚠ 部品DBを読み込めませんでした（ローカルサーバーに接続できません）。'
        + 'start.bat を起動してからCADを開き直してください。'
        + '部品の登録・編集は「部品DBを開く.bat」（部品DB単独画面）で行います。');
      return;
    }
    if (!st || !st.available) {
      setStatus('部品DB機能が導入されていません(tools/parts_db が見つかりません)');
      return;
    }
    let data;
    try {
      data = await (await fetch('/api/parts/all')).json();
      if (!data || !data.ok) throw new Error((data && data.error) || '不明なエラー');
    } catch (e) {
      setStatus(`部品DBを読み込めませんでした(${e.message})`);
      setBanner(`⚠ 部品DBを読み込めませんでした(${e.message})。`
        + '部品DBの場所を確認してください（py tools\\parts_db\\parts_db.py setpath ...）。'
        + '部品の登録・編集は「部品DBを開く.bat」（部品DB単独画面）で行います。');
      return;
    }
    connected = true;
    serverPath = st.path || '';
    mergeEmbedded({ customParts: data.customParts || [], hiddenBuiltinRefs: data.hiddenBuiltinRefs || [] });
    setStatus(`部品DB: ${baseName(serverPath)} (${state.customParts.length}件・読み取り専用)`);
  }

  // hasFile() は autosave.js / edit.js が「部品DBを外部ファイルで管理できているか」の
  // 判定に使い、falseのときは customParts を図面側(localStorage・図面ファイル)へ
  // 一緒に保存する。読めていない(サーバー未接続)ときはfalseを返し、図面側への
  // 退避を促す(既存の網をそのまま使う)。
  return {
    autoRestore,
    hasFile: () => connected,
    isConnected: () => connected,
    // 保存経路の概念は無くなったが、既存の表示コードとの互換のために残す。
    // CADはもう書かないので値は常に 'server'(接続済み)か null(未接続)。
    saveMode: () => (connected ? 'server' : null),
    savePath: () => serverPath,
    partsCount: () => (state.customParts || []).length,
  };
})();
