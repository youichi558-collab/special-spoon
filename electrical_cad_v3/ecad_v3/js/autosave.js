// ================================================================
// autosave.js — localStorage自動保存・起動時復元
// 保存タイミング: 編集操作(pushH)の1.5秒後（デバウンス）＋タブ非表示/離脱時
// 復元タイミング: 起動時にサイレント復元（Ctrl+Shift+Rリロード運用と両立）
// 注意: JSONファイル保存(dirtyフラグ)とは独立。あくまでリロード時の保険。
// ================================================================

const AUTOSAVE_KEY = 'ecad_autosave';
// 【2026-08-23 追加】前世代の退避先。
// オートセーブは保存先が1つしかなく、しかも中身が空でも無条件に上書きしていた。
// そのため「何らかの理由で画面が一瞬空になる → その状態で自動保存が走る」だけで
// 図面が完全に失われた(実際に発生。復旧不能)。
// 対策は2つ:
//   ①空のデータで、中身のある既存データを上書きしない(下の doAutosave)
//   ②中身のあるデータを書くときは、直前の版をこのキーへ退避しておく
// ②があれば①をすり抜けるケース(徐々に消える等)でも1世代前に戻せる。
const AUTOSAVE_PREV_KEY = 'ecad_autosave_prev';
let _asTimer = null;
let _asDisabled = false; // 容量超過などで無効化された場合true

// 【2026-08-23 追加】復元に失敗したまま自動保存を走らせないためのロック。
//
// 事故の経緯: 起動時の復元(restoreAutosave)は boot.js の _safeInit で
// try/catchに包まれており、失敗してもコンソールに出るだけで起動が続行される。
// その結果アプリは state.js の初期状態(空のSheet1が1枚)で立ち上がり、
// 1.5秒後に自動保存が走って**読み込めなかった図面を空で上書き**した。
// 「復元できなかった」ことと「図面が無い」ことを区別できていなかったのが原因。
//
// 対策: 保存済みデータがあるのに復元しきれなかった場合はこのフラグを立て、
// 以後の自動保存を一切行わない。localStorageのデータは手つかずで残るので、
// 原因を直してリロードすれば復元できる。
let _asRestoreFailed = false;
// 保存済みデータがあったのに復元できなかったとき、その量を覚えておく(通知用)
let _asBlockedCount = 0;

// 図面の中身の量(要素＋配線の総数)。空かどうかの判定に使う。
function _asContentCount(pages) {
  if (!Array.isArray(pages)) return 0;
  return pages.reduce((n, pg) =>
    n + ((pg && pg.elements ? pg.elements.length : 0))
      + ((pg && pg.wires    ? pg.wires.length    : 0)), 0);
}

// 保存済みデータの中身の量。壊れていれば -1(判定不能)を返す。
function _asStoredCount(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    return _asContentCount(JSON.parse(raw).pages);
  } catch (e) { return -1; }
}

function scheduleAutosave() {
  if (_asDisabled) return;
  clearTimeout(_asTimer);
  _asTimer = setTimeout(doAutosave, 1500);
}

function doAutosave() {
  if (_asDisabled) return;
  // 復元に失敗している場合は絶対に書かない。読み込めなかった図面を
  // 上書きしてしまうと復旧手段が無くなる(2026-08-23の事故の直接原因)。
  if (_asRestoreFailed) {
    const h = document.getElementById('s-hint');
    if (h) h.textContent =
      `⚠ 前回のデータを復元できなかったため自動保存を停止しています`
      + `（保存済み ${_asBlockedCount}個は無傷です）。`
      + `作業を続ける前にF12→Consoleのエラーを確認してください`;
    return;
  }
  clearTimeout(_asTimer); _asTimer = null;
  try {
    _syncCurrentPage();

    // 【最優先の保護】中身が空なら、中身のある既存データを絶対に潰さない。
    // 描画エラーや操作ミスで一時的に空になっただけの可能性があり、
    // ここで上書きすると復旧手段が無くなる。
    const nowCount = _asContentCount(state.pages);
    if (nowCount === 0) {
      const storedCount = _asStoredCount(AUTOSAVE_KEY);
      if (storedCount > 0) {
        const h = document.getElementById('s-hint');
        if (h) h.textContent =
          `⚠ 図面が空のため自動保存を中止しました（前回分 ${storedCount}個を保持）。`
          + `意図せず消えた場合はリロードすると復元されます`;
        return;
      }
    }

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

    // 中身のあるデータを書く前に、直前の版を退避しておく(1世代前まで戻せる)。
    // 容量超過のときは退避を諦めて本体の保存を優先する。
    if (nowCount > 0) {
      try {
        const prev = localStorage.getItem(AUTOSAVE_KEY);
        if (prev && _asStoredCount(AUTOSAVE_KEY) > 0) {
          localStorage.setItem(AUTOSAVE_PREV_KEY, prev);
        }
      } catch (e) {
        try { localStorage.removeItem(AUTOSAVE_PREV_KEY); } catch (_) {}
      }
    }

    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // QuotaExceededError等 → 以後の自動保存を停止し一度だけ通知
    _asDisabled = true;
    const h = document.getElementById('s-hint');
    if (h) h.textContent = '⚠ 自動保存が容量超過で停止しました（JSONファイル保存を使用してください）';
  }
}

function restoreAutosave() {
  // 【2026-08-23】まず「救うべきデータがどれだけあるか」を先に測る。
  // 以降どの経路で失敗しても、この量が0でなければ自動保存をロックして
  // 上書きを防ぐ。復元処理そのものが落ちても呼び出し側(boot.jsの_safeInit)が
  // 握り潰してしまうため、ロックはこの関数の中で立てておく必要がある。
  let atRisk = 0;
  try {
    atRisk = Math.max(_asStoredCount(AUTOSAVE_KEY), _asStoredCount(AUTOSAVE_PREV_KEY), 0);
  } catch (e) { atRisk = 0; }
  const lockIfNeeded = () => {
    if (atRisk > 0) { _asRestoreFailed = true; _asBlockedCount = atRisk; }
  };
  // 復元処理の途中で例外が出た場合も必ずロックがかかるようにしておく。
  // 成功したときだけ最後にこのフラグを下ろす。
  lockIfNeeded();

  let raw = null;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }

  // 現行の自動保存が「空」で、1世代前に中身があるならそちらから復元する。
  // 空で上書きされてしまった事故から救うため。
  let usedPrev = false;
  try {
    const nowCount = raw ? _asContentCount(JSON.parse(raw).pages) : 0;
    if (nowCount === 0) {
      const prevRaw = localStorage.getItem(AUTOSAVE_PREV_KEY);
      if (prevRaw && _asContentCount(JSON.parse(prevRaw).pages) > 0) {
        raw = prevRaw;
        usedPrev = true;
      }
    }
  } catch (e) { /* 判定に失敗したら通常どおり現行を使う */ }

  if (!raw) return;

  // 【2026-08-23】まずJSONとして読めるかどうかだけを先に判定する。
  // 以前は復元処理全体を1つのtry/catchで囲み、どんな例外でも「破損データ」と
  // みなして本体キーから消していた。しかし例外の原因はデータ破損とは限らず、
  // コード側の不具合(関数が未定義等)のこともある。その場合データは正常なのに
  // 本体キーから消えてしまい、次回リロードで見つからなくなる。
  let d = null;
  try {
    d = JSON.parse(raw);
  } catch (e) {
    // ここに来たときだけが本当の「破損」。削除せず退避する。
    try {
      localStorage.setItem('ecad_autosave_broken', raw);
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch (_) {}
    _asRestoreFailed = false; _asBlockedCount = 0;   // 退避済みなのでロック不要
    setTimeout(() => {
      const h = document.getElementById('s-hint');
      if (h) h.textContent = '⚠ 自動保存データが壊れていたため復元できませんでした'
        + '（データは ecad_autosave_broken に退避してあります）';
    }, 0);
    return;
  }

  try {
    if (!d || !d.pages || !d.pages.length) return;

    // 保存はされているが中身が空(要素も配線も無い)なら、失うものが無いので
    // ロックは不要。新規作業として通常起動してよい。
    if (_asContentCount(d.pages) === 0 && atRisk === 0) {
      _asRestoreFailed = false; _asBlockedCount = 0;
    }

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
    // グループの幽霊参照（削除済み要素のID）を掃除
    if (typeof pruneGroups === 'function') state.pages.forEach(pg => pruneGroups(pg));
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

    // ここまで例外なく到達できたら復元成功。ロックを解除して自動保存を再開する。
    // 途中で落ちた場合はロックが立ったままになり、上書きされない。
    _asRestoreFailed = false;
    _asBlockedCount  = 0;

    const t = d.savedAt ? new Date(d.savedAt) : null;
    const ts = t ? ` (${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}保存)` : '';
    setTimeout(() => {
      const h = document.getElementById('s-hint');
      if (!h) return;
      h.textContent = usedPrev
        ? `⚠ 直近の自動保存が空だったため、1世代前から復元しました${ts}。`
          + `内容を確認してJSONファイルに保存してください`
        : `前回の作業を自動復元しました${ts}`;
    }, 0);
  } catch (e) {
    // JSONとしては正しく読めたのに、その後の復元処理で落ちたケース。
    // データ破損ではなくコード側の不具合の可能性が高いので、
    // **localStorageには一切手を触れない**。
    // 復元失敗のロック(_asRestoreFailed)は立ったままなので自動保存も走らず、
    // 原因を直してリロードすればそのまま復元できる。
    console.error('[autosave] 復元処理でエラー:', e);
    setTimeout(() => {
      const h = document.getElementById('s-hint');
      if (h) h.textContent = '⚠ 復元処理でエラーが発生しました。自動保存を停止しています'
        + `（保存済み ${_asBlockedCount}個は無傷です）。`
        + 'F12→Consoleのエラーを確認してください';
    }, 0);
  }
}

// 復元に失敗して自動保存がロックされているか(boot.jsが起動時の通知に使う)
function isAutosaveLocked() { return _asRestoreFailed; }

// タブ非表示・離脱時に即時保存（beforeunloadより確実）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') doAutosave();
});
window.addEventListener('pagehide', doAutosave);
