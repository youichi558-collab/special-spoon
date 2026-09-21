// ================================================================
// boot.js — 初期化処理
// 全JSファイルの中で最後に読み込まれる
//
// 各ステップをtry/catchで囲んでいる。理由: どこか1箇所でエラーが起きても
// そこで処理全体が止まって画面が真っ白のままになる、という事故を防ぐため。
//
// 【2026-08-23 重要な変更】ただし「握り潰して起動を続ける」ことが、より重大な
// 事故を招いた。自動保存の復元が失敗しても console.error に出るだけで起動が続き、
// アプリが空の初期状態(Sheet1が1枚)で立ち上がり、1.5秒後の自動保存が
// 読み込めなかった図面を空で上書きして復旧不能にした。
//
// そこで critical:true のステップは、失敗を画面上でも知らせるようにした。
// あわせて autosave.js 側で「復元に失敗したら自動保存を止める」ロックを入れてある。
// この2つは対になっているので、片方だけ外さないこと。
// ================================================================

// 起動時に起きたエラーを画面に出す。コンソールを開いていないと気づけない、
// という状態を無くすため(今回の事故ではリロード後に調査を始めたため、
// コンソールのエラーが失われて原因を特定できなかった)。
function _bootBanner(msg) {
  try {
    let el = document.getElementById('boot-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'boot-error';
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b00020;color:#fff;'
        + 'padding:8px 12px;font-size:12px;line-height:1.6;white-space:pre-wrap;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.4)';
      const btn = document.createElement('span');
      btn.textContent = '×';
      btn.style.cssText = 'float:right;cursor:pointer;font-weight:bold;padding:0 6px';
      btn.onclick = () => el.remove();
      el.appendChild(btn);
      document.body.appendChild(el);
    }
    el.appendChild(document.createTextNode(msg + '\n'));
  } catch (e) { /* バナー表示自体が失敗しても起動は続ける */ }
}

function _safeInit(label, fn, critical) {
  try {
    fn();
  } catch (e) {
    console.error(`[boot] ${label} でエラーが発生しました:`, e);
    if (critical) {
      _bootBanner(`⚠ 起動時エラー: ${label} — ${e && e.message ? e.message : e}`);
    }
  }
}

(function init() {
  // キャンバスサイズを初期化
  _safeInit('キャンバスサイズ初期化', () => {
    cv.width  = cwEl.clientWidth;
    cv.height = cwEl.clientHeight;
  });
  // resizeイベントはinput.jsで管理

  // 自動保存データがあれば復元（描画・DEFS登録より前）
  // critical: ここが失敗すると空の初期状態で立ち上がり、自動保存が
  // 元データを上書きして復旧不能になる(2026-08-23の事故)。必ず知らせる。
  _safeInit('自動保存の復元', restoreAutosave, true);

  // 復元に失敗して自動保存がロックされていれば、それも画面に出す。
  // 例外が出ずに静かに復元しきれなかった場合もここで拾える。
  if (typeof isAutosaveLocked === 'function' && isAutosaveLocked()) {
    _bootBanner('⚠ 前回のデータを復元できませんでした。自動保存を停止しています'
      + '（保存済みデータは無傷です）。この状態で作業せず、'
      + 'F12→Consoleのエラーを確認してください');
  }

  // カスタムシンボルをDEFSに登録
  _safeInit('カスタムシンボル登録', () => {
    state.customSymbols.forEach(s => { DEFS[s.type] = s; });
  });

  // localStorageからシンボルライブラリを読み込む
  _safeInit('シンボルライブラリ読込', loadSymbolsFromStorage);

  // 部品DB（外部ファイル）を読む。
  //
  // 【2026-09-21】起動処理の中で読むのをやめ、**ページの読み込みが全部
  // 終わってから**読むようにした。
  //
  // 理由: server.py は HTTPServer(シングルスレッド)で、1度に1リクエストしか
  // 捌けない。しかも protocol_version 未指定=HTTP/1.0 なので keep-alive が
  // 効かず、index.html の <script> 32本が32本とも別々のTCP接続を張る。
  // 待ち行列(request_queue_size)は既定の5しかない。
  // そこへ /api/parts/all(実測605KB、部品DBで一番大きい応答)を同時に投げると、
  // サーバーがそれを送っている間、残りのJSが待たされる。溢れた接続は
  // 1秒待ち(TCP再送)か、環境によっては拒否(ERR_CONNECTION_REFUSED)になる。
  // **JSが1本でも欠けたまま起動すると図面が真っ白になる**(2026-09-19の事故)。
  // 盛田さんの「起動が不安定」「部品DBが0件・読み込み中のまま」はこれ。
  //
  // 後回しにできる理由: 帳票(端子台表)が部品DBを引かなくなったため、
  // 起動直後に部品DBが無くて困るものが無くなった(2026-09-21前半の変更)。
  // 部品DBが要るのは「部品を割り当てる」「コイル電圧の選択肢を出す」
  // 「端子番号の候補を出す」——どれも人が操作したときで、起動時ではない。
  // 読み終わると mergeEmbedded が renderPartsAll() を呼ぶので、
  // 部品パネルは自動で埋まる。
  //
  // 【注意】サーバー側(シングルスレッド・backlog 5・HTTP/1.0)は直していない。
  // これは押し寄せる量を減らして症状を避ける対策で、根本原因はサーバー側に残る。
  _safeInit('部品DBの読み込み予約', () => {
    // 【2026-09-21 追記】parts_db.js 自体が読めていない場合。
    // 以前はここで黙って return していたため、バナーも出ず
    // 「0件 / 読み込み中...」のまま立ち上がっていた(盛田さんが遭遇した状態)。
    // 黙って諦めない。下のJS欠け検出でもファイル名を出す。
    if (typeof partsDb === 'undefined') {
      _bootBanner('⚠ 部品DBの読み込み機能(js/parts_db.js)が読めていません。'
        + 'この状態では部品を割り当てられません。'
        + 'Ctrl+Shift+R で読み込み直してください');
      return;
    }
    const start = () => {
      try { partsDb.autoRestore(); }
      catch (e) { console.error('[boot] 部品DBの読み込みでエラーが発生しました:', e); }
    };
    // load(全リソース読み込み完了)を待ち、さらに手が空いてから読む。
    //
    // 【2026-09-21 追記】**loadだけに頼らない**。loadは「今まさに混んでいる」
    // ときに遅れるイベントで、JSが1本詰まれば部品DBの読み込みもろとも
    // 待たされる。避けたかった当のものに足を縛っていた。
    // 3秒経ったらloadを待たずに読みに行く(どちらか早い方・二重には呼ばない)。
    let fired = false;
    const once = () => { if (fired) return; fired = true; start(); };
    const later = () => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(once, { timeout: 2000 });
      else setTimeout(once, 0);
    };
    if (document.readyState === 'complete') later();
    else {
      window.addEventListener('load', later, { once: true });
      setTimeout(once, 3000);   // loadが来なくても必ず読む
    }
  });

  // ダークモード初期適用
  _safeInit('ダークモード適用', () => {
    if (state.darkMode) {
      document.body.classList.add('dk');
      const dkLbl = document.getElementById('dk-label');
      if (dkLbl) dkLbl.textContent = 'ライト';
    }
  });

  // 初期描画（ここが最も重要。前段が多少失敗していても、必ず到達させる）
  _safeInit('リボン高さ同期', () => { if (typeof syncRibbonHeight === 'function') syncRibbonHeight(); });
  _safeInit('レイヤー表示', renderLayers);
  _safeInit('部品DB表示', renderPartsAll);
  _safeInit('カスタムシンボル表示', renderSymFloat);
  _safeInit('ページタブ表示', renderPageTabs);
  _safeInit('描画', draw);
  _safeInit('ヒント更新', updateHint);
  _safeInit('右パネル更新', updateRightPanel);
  _safeInit('接続点スタイルボタン同期', () => { if (typeof syncJunctionStyleBtns === 'function') syncJunctionStyleBtns(); });
  // 端子番号の表示は自動保存から復元されるので、ボタンの点灯を実状態に合わせる
  _safeInit('端子番号ボタン同期', () => { if (typeof syncTermNoBtn === 'function') syncTermNoBtn(); });
  // 【2026-09-21】JSが読み込めていないことを起動時に知らせる。
  //
  // _asMissingScripts() は2026-09-19から在るのに、**自動保存が走ったときしか
  // 見ていなかった**。起動直後に何も編集しなければ誰も呼ばないので、
  // JSが虫食いのまま黙って立ち上がる。盛田さんの「部品DBが0件・読み込み中の
  // まま」「起動が不安定」は、これで気付けないまま作業に入っていた。
  //
  // server.py はシングルスレッド・HTTP/1.0・待ち行列5なので、起動時に
  // <script>32本が押し寄せると溢れた接続が拒否される(ERR_CONNECTION_REFUSED)。
  // どのファイルが落ちたかまで出す —— 原因の切り分けに要る。
  //
  // 【重要】判定は setTimeout で**この場から外して**行う。目印
  // (window.__ecadLoaded)は各ファイルの**末尾**に置いてあり、boot.js の
  // 目印が付くのはこの init() が終わったあと。ここで直に数えると
  // boot.js 自身が毎回「欠けている」ことになり、正常な起動でも必ず
  // バナーが出てしまう(実際にそうなっていたのを画面で見つけた)。
  // boot.js は index.html の最後の <script> なので、この場を抜けた時点で
  // 全ファイルの目印が出揃っている。
  _safeInit('JS読み込み欠けの検出', () => {
    setTimeout(() => {
      try {
        if (typeof _asMissingScripts !== 'function') return;
        const missing = _asMissingScripts();
        if (!missing.length) return;
        _bootBanner(`⚠ JSが読み込めていません（${missing.join(' / ')}）。`
          + 'この状態では正しく動きません。自動保存も止めてあります（保存済みデータは無傷です）。'
          + 'Ctrl+Shift+R で読み込み直してください');
      } catch (e) { console.error('[boot] JS読み込み欠けの検出でエラー:', e); }
    }, 0);
  });

  // 図面のバックアップ(ファイル)のタイマーを開始する。
  // ブラウザ内の「自動保存」とは別物で、start.bat が動いているときだけ効く。
  _safeInit('バックアップ開始', () => { if (typeof bkStart === 'function') bkStart(); });
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
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['boot.js'] = 1;
