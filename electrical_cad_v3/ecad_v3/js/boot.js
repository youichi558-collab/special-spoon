// ================================================================
// boot.js — 初期化処理
// 全JSファイルの中で最後に読み込まれる
// ================================================================

(function init() {
  // キャンバスサイズを初期化
  cv.width  = cwEl.clientWidth;
  cv.height = cwEl.clientHeight;
  window.addEventListener('resize', () => { cv.width = cwEl.clientWidth; cv.height = cwEl.clientHeight; draw(); });

  // カスタムシンボルをDEFSに登録
  state.customSymbols.forEach(s => { DEFS[s.type] = s; });

  // 初期描画
  renderLayers();
  renderPartsAll();
  renderCustomSymbols();
  renderPageTabs();
  draw();
  updateHint();
  updateRightPanel();
})();
