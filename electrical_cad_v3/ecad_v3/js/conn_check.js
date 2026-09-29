// ================================================================
// conn_check.js — 未接続端子のマーカー表示(ツールバーの「⚠未接続」「👁」)
//
// 【2026-09-29 作り直し】以前はここに独自の座標計算(現在のページだけ・接続チェックとは別の許容誤差の写し)があった。
// 接続チェック(conn_table.js の analyzeConnections)と**同じ作り**にするため、計算は conn_table.js の
// analyzeUnconnectedTerminals(全ページ・同じ端子の位置・同じ許容誤差)に集め、ここには無くした。
// ここに残っているのは、その結果を図面にマーカーで出す/隠すボタンの処理だけ。
//
// 【設計方針】
// 毎フレーム(draw()のたび)に自動再計算すると大規模図面で重くなるため、
// 「⚠未接続」ボタンを押した時だけ計算し、結果を state._unconnectedResults にキャッシュする。
// draw()側はこのキャッシュを描画するだけ(現在のページの分だけ)。要素を編集しても自動更新はされない(再チェックが必要)。
// ================================================================

// 全ページの未接続の端子を返す(互換のための名前。実体は conn_table.js)。
// 戻り値: [{ pageIdx, page, elId, termIdx, x, y, name, term }]
function findUnconnectedTerminals() {
  return analyzeUnconnectedTerminals();
}

// ボタン押下時: 検出を実行し、結果をキャッシュして表示ONにする
function runUnconnectedCheck() {
  const results = findUnconnectedTerminals();
  state._unconnectedResults = results;
  state.showUnconnected = true;
  syncUnconnectedBtn();
  draw();
  // 以前はここで alert(件数)を出していたが、一覧が無く場所も分からなかった。接続チェックの表(未接続の端子の一覧・押すと飛ぶ)を開く
  if (typeof showConnTable === 'function') showConnTable();
}

// 表示のON/OFFのみ切り替える(再計算はしない。結果が無ければ先にチェックを走らせる)
function toggleUnconnectedDisp() {
  if (!state.showUnconnected && state._unconnectedResults.length === 0) {
    runUnconnectedCheck();
    return;
  }
  state.showUnconnected = !state.showUnconnected;
  syncUnconnectedBtn();
  draw();
}

function syncUnconnectedBtn() {
  const b = document.getElementById('qb-unconn');
  if (!b) return;
  b.style.background = state.showUnconnected ? 'var(--acc)' : 'var(--bg)';
  b.style.color      = state.showUnconnected ? '#fff' : 'var(--fg)';
  b.style.fontWeight = state.showUnconnected ? '600' : '400';
}

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['conn_check.js'] = 1;
