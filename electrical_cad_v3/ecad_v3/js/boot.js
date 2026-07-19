// ================================================================
// boot.js — 初期化処理
// 全JSファイルの中で最後に読み込まれる
// ================================================================

(function init() {
  // キャンバスサイズを初期化
  cv.width  = cwEl.clientWidth;
  cv.height = cwEl.clientHeight;
  // resizeイベントはinput.jsで管理

  // 自動保存データがあれば復元（描画・DEFS登録より前）
  restoreAutosave();

  // カスタムシンボルをDEFSに登録
  state.customSymbols.forEach(s => { DEFS[s.type] = s; });

  // localStorageからシンボルライブラリを読み込む
  loadSymbolsFromStorage();

  // 部品DB（外部ファイル）を自動復元
  if (typeof partsDb !== 'undefined') partsDb.autoRestore();

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
