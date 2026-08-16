// ================================================================
// autosave.js — localStorage自動保存・起動時復元
// 保存タイミング: 編集操作(pushH)の1.5秒後（デバウンス）＋タブ非表示/離脱時
// 復元タイミング: 起動時にサイレント復元（Ctrl+Shift+Rリロード運用と両立）
// 注意: JSONファイル保存(dirtyフラグ)とは独立。あくまでリロード時の保険。
// ================================================================

const AUTOSAVE_KEY = 'ecad_autosave';
let _asTimer = null;
let _asDisabled = false; // 容量超過などで無効化された場合true

function scheduleAutosave() {
  if (_asDisabled) return;
  clearTimeout(_asTimer);
  _asTimer = setTimeout(doAutosave, 1500);
}

function doAutosave() {
  if (_asDisabled) return;
  clearTimeout(_asTimer); _asTimer = null;
  try {
    _syncCurrentPage();
    const data = {
      version: 2,
      autosave: true,
      savedAt: Date.now(),
      saveFileName: state.saveFileName,
      customSymbols: state.customSymbols,
      // 部品DBが外部ファイルで管理されている場合は埋め込まない（容量節約・二重管理防止）
      customParts:   (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.customParts,
      hiddenBuiltinRefs: (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.hiddenBuiltinRefs,
      wireNoRule:    state.wireNoRule,
      layers:        LAYERS,
      pages:         state.pages,
      currentPage:   state.currentPage,
      zoom:          state.zoom,
      pan:           state.pan,
      darkMode:      state.darkMode,
      // showPartRefは2026-08-07にトグル廃止・常時表示化したため保存しない
      // (保存しても読込側で無視するので実害はないが、混乱防止のため削除)
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // QuotaExceededError等 → 以後の自動保存を停止し一度だけ通知
    _asDisabled = true;
    const h = document.getElementById('s-hint');
    if (h) h.textContent = '⚠ 自動保存が容量超過で停止しました（JSONファイル保存を使用してください）';
  }
}

function restoreAutosave() {
  let raw = null;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (!d || !d.pages || !d.pages.length) return;

    state.pages = d.pages;
    state.pages.forEach(pg => {
      if (!pg.guides) pg.guides = [];
      if (!pg.groups) pg.groups = [];
    });
    // 旧個別色の掃除（loadProjectと同じ処理。以前はファイル読込側にしか無く、
    // 「読込では消えるがリロードでは残る」という食い違いになっていた）
    if (typeof stripLegacyColors === 'function') stripLegacyColors(state.pages);
    // 重複IDの修復（旧genIdの衝突対策。詳細はedit.jsのdedupeIds参照）
    if (typeof dedupeIds === 'function') dedupeIds(state.pages);
    state.currentPage  = Math.min(d.currentPage || 0, state.pages.length - 1);
    state.saveFileName = d.saveFileName || '';
    state.wireNoRule   = d.wireNoRule || state.wireNoRule;
    state.customSymbols= d.customSymbols || [];
    state.customParts  = d.customParts   || [];
    state.hiddenBuiltinRefs = d.hiddenBuiltinRefs || [];
    state.customSymbols.forEach(s => { DEFS[s.type] = s; });
    if (d.layers && d.layers.length) { LAYERS.length = 0; d.layers.forEach(l => LAYERS.push(l)); }
    if (typeof d.zoom === 'number' && d.zoom > 0) state.zoom = d.zoom;
    if (d.pan && typeof d.pan.x === 'number')     state.pan  = { x: d.pan.x, y: d.pan.y };
    if (typeof d.darkMode === 'boolean')          state.darkMode = d.darkMode;
    // showPartRefは2026-08-07にトグル廃止・常時表示化したため、旧保存データに
    // false が入っていても復元しない(state.jsの既定値true のまま維持する)。

    const t = d.savedAt ? new Date(d.savedAt) : null;
    const ts = t ? ` (${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}保存)` : '';
    setTimeout(() => {
      const h = document.getElementById('s-hint');
      if (h) h.textContent = `前回の作業を自動復元しました${ts}`;
    }, 0);
  } catch (e) {
    // 破損データは削除して通常起動（毎回復元失敗するのを防ぐ）
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) {}
  }
}

// タブ非表示・離脱時に即時保存（beforeunloadより確実）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') doAutosave();
});
window.addEventListener('pagehide', doAutosave);
