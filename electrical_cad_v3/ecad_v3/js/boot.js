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
  _safeInit('リボン高さ同期', () => { if (typeof syncRibbonHeight === 'function') syncRibbonHeight(); });
  _safeInit('レイヤー表示', renderLayers);
  _safeInit('部品DB表示', renderPartsAll);
  _safeInit('カスタムシンボル表示', renderSymFloat);
  _safeInit('ページタブ表示', renderPageTabs);
  _safeInit('描画', draw);
  _safeInit('ヒント更新', updateHint);
  _safeInit('右パネル更新', updateRightPanel);
  _safeInit('接続点スタイルボタン同期', () => { if (typeof syncJunctionStyleBtns === 'function') syncJunctionStyleBtns(); });
})();
