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

  // 図面に入っている部品の写し(2026-10-03〜 使った型式の分だけ。それ以前の図面は部品DB丸ごとのこともある)と、
  // ライブラリ(部品DB)を重ねる。**ライブラリが正**で、写しはライブラリに無い型式だけ残す
  // (ライブラリが無いPC・ライブラリから消した型式でも、図面の型式で引く処理が効くように)。
  // CADは部品DBを書かないので、写しをライブラリへ登録したいときは部品DB単独画面(parts.html)で。
  function mergeEmbedded(data) {
    const extra = (state.customParts || [])
      .filter(p => !data.customParts.some(q => q.ref === p.ref));
    state.customParts = data.customParts.concat(extra);
    state.hiddenBuiltinRefs = data.hiddenBuiltinRefs;   // 標準部品の非表示機能の名残(2026-10-03廃止)。読んだまま持つだけ
    if (typeof renderPartsAll === 'function') renderPartsAll();
    // 部品DBは起動の後から読み込まれる。クロスリファレンスの空き接点の枠(js/xref.js)は部品DBの端子欄から作るので、
    // 読み込めた時点で描き直す。しないと、何か操作して再描画されるまで空きの枠が出ない(2026-09-29)。
    if (typeof draw === 'function') { try { draw(); } catch (e) { console.error('[parts_db] 再描画でエラー:', e); } }
    if (extra.length) {
      setBanner(`図面に入っている部品のうち ${extra.length} 件は部品DBにありません（図面に入っている写しを使っています）。`
        + '部品DBに登録するなら部品DB単独画面(parts.html)で');
    }
    return extra.length;
  }

  // 【2026-10-03】部品DBの場所(ライブラリフォルダ)が未設定・見つからないとき、起動時に案内の窓を出す
  // (再設計の段階1。新しいPC・別のPCで、どこで設定するのか探さずに済むように)。
  // 中身は設定タブと同じ部品(js/parts_db_place.js)。「あとで」で閉じれば、帯と設定タブからいつでも設定できる。
  // 1回のページ表示で1度だけ出す(読み直すたびに出ると邪魔)。
  let firstRunShown = false;
  function showFirstRun(source, err) {
    if (firstRunShown || typeof document === 'undefined' || typeof pdbPlaceRender !== 'function') return;
    firstRunShown = true;
    const ov = document.createElement('div');
    ov.id = 'pdb-first';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100001;display:flex;align-items:center;justify-content:center';
    const lead = source === 'unset'
      ? 'このPCでは、部品DBを置くフォルダ(ライブラリフォルダ)がまだ決まっていません。<br>'
        + '<b>既にある部品DB</b>を使うなら、そのフォルダを「フォルダを選ぶ」か「探す」で選んでください。<br>'
        + '<b>初めて使う</b>なら、部品DBを置きたいフォルダ(空でよい)を「フォルダを選ぶ」で選ぶと、空の部品DBを作れます。'
      : escH(err);
    ov.innerHTML = '<div style="background:var(--bg2,#2a2a2a);color:var(--fg,#ddd);border:1px solid var(--bd2,#444);border-radius:6px;'
      + 'box-shadow:0 4px 20px rgba(0,0,0,.5);padding:14px 16px;max-width:640px;font-size:12px;line-height:1.6">'
      + '<div style="font-size:14px;font-weight:600;margin-bottom:6px">部品DBの場所</div>'
      + `<div style="margin-bottom:8px">${lead}</div>`
      + '<div id="pdb-first-place"></div>'
      + '<div style="text-align:right;margin-top:10px"><button class="fp-btn" id="pdb-first-later">あとで</button></div>'
      + '<div style="font-size:10px;color:var(--fg3,#999);margin-top:4px">あとで設定するときは、設定タブの「部品DB」から。部品DBが無くても図面は描けます(部品の割り当てができないだけ)。</div>'
      + '</div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    document.getElementById('pdb-first-later').onclick = close;
    pdbPlaceRender('pdb-first-place', async () => {
      await autoRestore(0);
      if (connected) close();        // 「もう一度確かめる」でまだ見つからなければ、窓は開いたまま
      pdbPlaceRender('pdb-place');   // 設定タブの表示も新しい場所に
    });
  }

  // 【2026-09-21】1回失敗したら数秒あけて数回やり直す。
  //
  // (当時)server.py はシングルスレッド・HTTP/1.0・待ち行列5で、起動直後は
  // <script>32本の接続で混んでいる。そこへ部品DBの要求が当たると
  // 取りこぼされることがある。従来は1回きりで諦めていたため、
  // 一度外すとページを再読み込みするまで0件のままだった
  // (盛田さん「今立ち上げたら読み込んでなかったな、リロードで読んだ」)。
  //
  // やり直すのは**繋がらなかったとき**だけ。サーバーは応答したが部品DBの
  // 場所が違う等(ok:false)は、何度やっても同じなので繰り返さない。
  const RETRY_WAIT = [1500, 3000, 6000];   // 3回まで、だんだん間をあける
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 起動時：ローカルサーバー経由で部品DBを読む。CADはこれ以外の経路を持たない。
  async function autoRestore(attempt) {
    const n = attempt || 0;
    let st;
    try {
      st = await (await fetch('/api/parts/stats')).json();
    } catch (e) {
      if (n < RETRY_WAIT.length) {
        setStatus(`部品DB: 読み込みに失敗しました。やり直しています…（${n + 1}/${RETRY_WAIT.length}）`);
        await sleep(RETRY_WAIT[n]);
        return autoRestore(n + 1);
      }
      setStatus('部品DBを読み込めません（ローカルサーバーに接続できません。start.bat を起動してください）');
      setBanner('⚠ 部品DBを読み込めませんでした（ローカルサーバーに接続できません）。'
        + `${RETRY_WAIT.length}回やり直しても繋がりませんでした。`
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
    } catch (e) { data = null; }
    // 【2026-10-03】サーバーは応答したが読めない(場所が未設定・見つからない等。ok:false)ときは
    // やり直さない。上の説明どおりの作りのはずが、ok:false も取りこぼしと同じ扱いでやり直していて、
    // 部品DBがまだ無いPC(新規・別PC)で「読み込みに失敗しました。やり直しています…」が約10秒続いていた。
    if (data && !data.ok) {
      const err = data.error || '不明なエラー';
      setStatus(`部品DBを読み込めませんでした(${err})`);
      // サーバーの文言(tools/parts_db/parts_db.py の load)が既に設定のしかたを案内していれば重ねない
      setBanner(`⚠ 部品DBを読み込めませんでした(${err})。`
        + (/「部品DBの場所」|「フォルダを選ぶ」/.test(err) ? ''
           : '設定タブの「部品DB」で「フォルダを選ぶ」「探す」で設定してください。')
        + '部品の登録・編集は「部品DBを開く.bat」（部品DB単独画面）で行います。');
      if (data.source === 'unset' || data.source === 'path_missing') showFirstRun(data.source, err);
      return;
    }
    if (!data) {
      // stats は返ったのに all が落ちた = 取りこぼしの可能性があるのでやり直す。
      // 605KBと一番大きい応答なので、混んでいるときはここが落ちやすい。
      if (n < RETRY_WAIT.length) {
        setStatus(`部品DB: 読み込みに失敗しました。やり直しています…（${n + 1}/${RETRY_WAIT.length}）`);
        await sleep(RETRY_WAIT[n]);
        return autoRestore(n + 1);
      }
      setStatus('部品DBを読み込めませんでした(サーバーから応答がありません)');
      setBanner(`⚠ 部品DBを読み込めませんでした(${RETRY_WAIT.length}回やり直してもサーバーから応答がありません)。`
        + '部品DBパネルの「読み直す」か、CADを開き直してください。');
      return;
    }
    connected = true;
    serverPath = st.path || '';
    // 読めなかったときの帯を消す(設定タブで場所を設定して読み直したときに残らないように。2026-10-03)。
    // mergeEmbedded が別の知らせを出すことがあるので、その前に消す。
    setBanner('');
    mergeEmbedded({ customParts: data.customParts || [], hiddenBuiltinRefs: data.hiddenBuiltinRefs || [] });
    setStatus(`部品DB: ${baseName(serverPath)} (${state.customParts.length}件・読み取り専用)`);
    // 同じライブラリフォルダの図面枠テンプレート・表題欄様式も読み直す(2026-10-03 段階2、js/library.js)
    if (typeof ecadLib !== 'undefined') ecadLib.load();
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
    // 手動で読み直す。部品DB単独画面で部品を足したときや、起動時に
    // 読み損ねたときに、CADを開き直さずに済むようにする。
    reload: () => autoRestore(0),
  };
})();

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['parts_db.js'] = 1;
