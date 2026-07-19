// ================================================================
// boot.js — 初期化処理
// 全JSファイルの中で最後に読み込まれる
//
// 各ステップをtry/catchで囲んでいる。理由: どこか1箇所でエラーが起きても
// そこで処理全体が止まって画面が真っ白のままになる、という事故を防ぐため。
// エラーはコンソールに出力されるので、問題があればブラウザの開発者ツール
// （F12）→コンソールタブで内容を確認できる。
// ================================================================

function _safeInit(label, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`[boot] ${label} でエラーが発生しました:`, e);
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
  _safeInit('自動保存の復元', restoreAutosave);

  // カスタムシンボルをDEFSに登録
  _safeInit('カスタムシンボル登録', () => {
    state.customSymbols.forEach(s => { DEFS[s.type] = s; });
  });

  // localStorageからシンボルライブラリを読み込む
  _safeInit('シンボルライブラリ読込', loadSymbolsFromStorage);

  // 部品DB（外部ファイル）を自動復元
  _safeInit('部品DB自動復元', () => {
    if (typeof partsDb !== 'undefined') partsDb.autoRestore();
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
  _safeInit('レイヤー表示', renderLayers);
  _safeInit('部品DB表示', renderPartsAll);
  _safeInit('カスタムシンボル表示', renderCustomSymbols);
  _safeInit('ページタブ表示', renderPageTabs);
  _safeInit('描画', draw);
  _safeInit('ヒント更新', updateHint);
  _safeInit('右パネル更新', updateRightPanel);
})();
