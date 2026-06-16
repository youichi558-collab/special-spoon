// ================================================================
// boot.js — 初期化処理
// 全JSファイルの中で最後に読み込まれる
// ================================================================

(function init() {
  // キャンバスサイズを初期化
  cv.width  = cwEl.clientWidth;
  cv.height = cwEl.clientHeight;
  // resizeイベントはinput.jsで管理

  // カスタムシンボルをDEFSに登録
  state.customSymbols.forEach(s => { DEFS[s.type] = s; });

  // localStorageからシンボルライブラリを読み込む
  loadSymbolsFromStorage();

  // ダークモード初期適用
  if (state.darkMode) document.body.classList.add('dk');

  // 初期描画
  renderLayers();
  renderPartsAll();
  renderCustomSymbols();
  renderPageTabs();
  draw();
  updateHint();
  updateRightPanel();
})();
