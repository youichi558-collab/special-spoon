// ================================================================
// backup.js — 図面の世代バックアップ(ファイル)
//
// 【自動保存とは別物】盛田さんの指摘「自動保存という言葉は既にある機能と
// ダブる」を受けて、呼び分けを固定してある。
//
//   自動保存(autosave.js)  : ブラウザの中(localStorage)。現行＋1世代前だけ。
//                            リロードすると勝手に戻る。サーバーが落ちていても効く。
//   バックアップ(このファイル): ecad_v3/backup/ にファイルで溜まる。設定した
//                            件数だけ残る。「開く」で戻す。**サーバーが動いて
//                            いないと効かない。**
//
// AutoCADの .sv$(自動保存)と .bak(バックアップファイル)、Jw_cadの
// 「バックアップファイル数」と同じ使い分け。
//
// 【なぜ要るか】2026-08-23に図面が全部消えた事故では、JSONファイルさえあれば
// 復旧できた(HANDOFF「今回もファイルがあれば復旧できた」)。区切りごとの手動保存に
// 頼る運用だと、忘れたときに何も残らない。
//
// 【書き手はサーバー】ブラウザは自分でファイルを書けないため、
// POST /api/backup/save で server.py に書かせる。部品DBの保存を
// tools/parts_db/parts_db.py へ移したのと同じ理由。
// ================================================================

const BK_CONF_KEY = 'ecad_backup_conf';
const BK_DEFAULT  = { enabled: true, intervalMin: 10, keep: 30 };
const BK_MIN_INTERVAL = 1;
const BK_MAX_INTERVAL = 600;
const BK_MIN_KEEP = 1;
const BK_MAX_KEEP = 999;          // server側 backup_store.MAX_KEEP と合わせる

let _bkLastAt   = 0;      // 最後に書いた時刻(ms)
let _bkLastBody = '';     // 最後に書いた中身。同じなら書かない
let _bkTimer    = null;
let _bkLastError = '';

// ---- 設定の読み書き ------------------------------------------------
// 図面データではなくアプリの設定なので、自動保存のペイロードではなく
// 独立したキーに持つ。自動保存がロックされていても設定は生き残る。
function bkLoadConf() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(BK_CONF_KEY) || '{}') || {}; } catch (e) { c = {}; }
  return bkNormalizeConf(c);
}
function bkNormalizeConf(c) {
  const num = (v, def, lo, hi) => {
    const n = parseInt(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
  };
  return {
    enabled: (c.enabled === undefined) ? BK_DEFAULT.enabled : !!c.enabled,
    intervalMin: num(c.intervalMin, BK_DEFAULT.intervalMin, BK_MIN_INTERVAL, BK_MAX_INTERVAL),
    keep:        num(c.keep,        BK_DEFAULT.keep,        BK_MIN_KEEP,     BK_MAX_KEEP),
  };
}
function bkSaveConf(c) {
  const n = bkNormalizeConf(c);
  try { localStorage.setItem(BK_CONF_KEY, JSON.stringify(n)); } catch (e) {}
  return n;
}

// ---- 「今このタイミングで書くべきか」の判定 -------------------------
// 純粋な判定だけをここに置く(テストから直接呼べるように)。
//
// 書かない理由はどれも意図があるもの:
//   off      … 設定で切ってある
//   notyet   … 前回からまだ間隔が経っていない
//   empty    … 図面が空。空で世代を埋めても復旧の役に立たず、
//              むしろ中身のある古い控えを押し出してしまう
//   missingjs… JSが虫食いで読み込めていない。欠けた状態のstateは信用できない
//              (2026-09-19の事故。autosave.js と同じ判断)
//   same     … 前回書いたものと中身が同じ。同じ図面が何十件も並ぶのを防ぐ
function bkShouldSave(o) {
  if (!o.enabled)                       return { save: false, reason: 'off' };
  if (o.missingJs && o.missingJs.length) return { save: false, reason: 'missingjs' };
  if (!o.force && o.elapsedMs < o.intervalMin * 60 * 1000) return { save: false, reason: 'notyet' };
  if (!o.contentCount)                  return { save: false, reason: 'empty' };
  if (o.sameAsLast)                     return { save: false, reason: 'same' };
  return { save: true, reason: 'ok' };
}

// ---- 送るデータ ----------------------------------------------------
// 保存ファイル(saveAllProject)と同じ形にする。そのまま「開く」で読めることと、
// 復元処理を共通(applyProjectData)にできることの両方のため。
function bkBuildData() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  return {
    version: 2,
    backup: true,
    savedAt: Date.now(),
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    customParts:   (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.customParts,
    hiddenBuiltinRefs: (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.hiddenBuiltinRefs,
    wireNoRule: state.wireNoRule,
    layers: LAYERS,
    pages:  state.pages,
  };
}
function bkContentCount(pages) {
  return (pages || []).reduce((n, pg) =>
    n + ((pg && pg.elements) ? pg.elements.length : 0)
      + ((pg && pg.wires)    ? pg.wires.length    : 0), 0);
}

// ---- 実際に送る ----------------------------------------------------
async function bkRun(force) {
  const conf = bkLoadConf();
  const missingJs = (typeof _asMissingScripts === 'function') ? _asMissingScripts() : [];
  const data = bkBuildData();
  const body = JSON.stringify(data.pages);   // 中身が変わったかの判定はページだけ見る
  const d = bkShouldSave({
    enabled: conf.enabled || !!force,
    force: !!force,
    elapsedMs: Date.now() - _bkLastAt,
    intervalMin: conf.intervalMin,
    contentCount: bkContentCount(state.pages),
    missingJs,
    sameAsLast: body === _bkLastBody,
  });
  if (!d.save) return d;

  try {
    const r = await fetch('/api/backup/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.saveFileName || '図面', keep: conf.keep, data }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'サーバーが保存できませんでした');
    _bkLastAt = Date.now();
    _bkLastBody = body;
    _bkLastError = '';
    return { save: true, reason: 'ok', file: j.file, deleted: j.deleted };
  } catch (e) {
    // サーバーが落ちている等。自動保存(localStorage)は別経路で生きているので、
    // ここで作業を止めない。ただし黙って失敗し続けると気づけないので一度は出す。
    const msg = String(e && e.message || e);
    if (msg !== _bkLastError) {
      _bkLastError = msg;
      const h = document.getElementById('s-hint');
      if (h) h.textContent = `⚠ バックアップを取れませんでした（${msg}）。`
        + `start.bat が動いているか確認してください。自動保存（ブラウザ内）は続いています`;
    }
    // 次の間隔でまた試せるよう、時刻は進めない
    return { save: false, reason: 'error', error: msg };
  }
}

// ---- タイマー ------------------------------------------------------
// 1分ごとに起きて、間隔が経っていれば書く。間隔そのものをsetIntervalに
// するとタブが寝ている間の扱いがブラウザ任せになるため、短く起きて
// 経過時間で判断する。
function bkStart() {
  if (_bkTimer) return;
  _bkLastAt = Date.now();     // 起動直後にいきなり書かない
  _bkTimer = setInterval(() => { bkRun(false); }, 60 * 1000);
}

// ================================================================
// 設定パネル
// ================================================================
function openBackupPanel() {
  bkRenderPanel();
  openFP('backup-p');
  bkRefreshList();
}

function bkRenderPanel() {
  const c = bkLoadConf();
  const el = document.getElementById('bk-conf');
  if (!el) return;
  el.innerHTML = `
    <div class="fr"><label style="font-size:11px;display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="bk-enabled" ${c.enabled ? 'checked' : ''} onchange="bkApplyConf()">
      バックアップを取る
    </label></div>
    <div class="fr" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <label style="font-size:11px">間隔
        <input type="number" id="bk-interval" value="${c.intervalMin}" min="${BK_MIN_INTERVAL}" max="${BK_MAX_INTERVAL}" step="1"
               style="width:58px" onchange="bkApplyConf()"> 分
      </label>
      <label style="font-size:11px">残す件数
        <input type="number" id="bk-keep" value="${c.keep}" min="${BK_MIN_KEEP}" max="${BK_MAX_KEEP}" step="1"
               style="width:58px" onchange="bkApplyConf()"> 件
      </label>
    </div>
    <p style="font-size:10px;color:var(--fg3);line-height:1.5;margin:4px 0 0">
      図面を触っていない間は書きません（同じ内容が並ばないように）。<br>
      件数は<b>図面ごと</b>に数えます。別の図面の控えは減りません。<br>
      これは<b>ファイル</b>の控えです。ブラウザ内の「自動保存」とは別で、
      <b>start.bat が動いていないと取れません</b>。
    </p>`;
}

function bkApplyConf() {
  const v = id => document.getElementById(id);
  bkSaveConf({
    enabled: v('bk-enabled')?.checked,
    intervalMin: v('bk-interval')?.value,
    keep: v('bk-keep')?.value,
  });
  bkRenderPanel();
}

async function bkRefreshList() {
  const box = document.getElementById('bk-list');
  const dirEl = document.getElementById('bk-dir');
  if (!box) return;
  box.innerHTML = '<span style="color:var(--fg3)">読み込み中…</span>';
  try {
    const j = await (await fetch('/api/backup/list')).json();
    if (!j.ok) throw new Error(j.error || '一覧を取れませんでした');
    if (dirEl) dirEl.textContent = j.dir || '';
    if (!j.files.length) {
      box.innerHTML = '<span style="color:var(--fg3)">まだありません</span>';
      return;
    }
    box.innerHTML = j.files.map(f => {
      const s = f.stamp;   // 20260920_143005
      const when = `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(9,11)}:${s.slice(11,13)}`;
      const kb = Math.round(f.size / 1024);
      return `<div style="display:flex;gap:6px;align-items:center;padding:2px 0;border-bottom:1px solid var(--bg4)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(f.base)}</span>
        <span style="color:var(--fg3);flex-shrink:0">${when}</span>
        <span style="color:var(--fg3);flex-shrink:0;width:52px;text-align:right">${kb}KB</span>
        <button class="fp-btn" style="flex-shrink:0" onclick="bkRestore('${escH(f.name)}')">開く</button>
      </div>`;
    }).join('');
  } catch (e) {
    box.innerHTML = `<span style="color:var(--red)">一覧を取れませんでした（${escH(e.message)}）。`
      + `start.bat が動いているか確認してください</span>`;
  }
}

async function bkSaveNow() {
  const r = await bkRun(true);
  const box = document.getElementById('bk-msg');
  if (box) {
    if (r.save) box.textContent = `保存しました: ${r.file}`
      + (r.deleted && r.deleted.length ? `（古い${r.deleted.length}件を削除）` : '');
    else if (r.reason === 'empty') box.textContent = '図面が空なので取りませんでした';
    else if (r.reason === 'same')  box.textContent = '前回から変わっていないので取りませんでした';
    else if (r.reason === 'missingjs') box.textContent = 'JSが読み込めていないため取りませんでした';
    else box.textContent = `取れませんでした（${r.error || r.reason}）`;
  }
  bkRefreshList();
}

// バックアップから戻す。今の図面は上書きされるので必ず確認を取る。
// 戻す処理そのものは「開く」と同じ applyProjectData を使う(食い違いを作らない)。
async function bkRestore(name) {
  if (!confirm(`「${name}」を開きます。\n\n今画面にある図面は置き換わります。`
             + `\n戻せるように、先に今の状態のバックアップを取ります。\n\nよろしいですか？`)) return;
  // 押し間違い・戻したあとの「やっぱり元に戻したい」に備えて、先に今を控える
  await bkRun(true);
  try {
    const j = await (await fetch('/api/backup/get?name=' + encodeURIComponent(name))).json();
    if (!j.ok) throw new Error(j.error || '読めませんでした');
    pushH();
    const { fixedIds, zeroWires } = applyProjectData(j.data);
    closeFP('backup-p');
    alert(`「${name}」を開きました。`
      + (fixedIds > 0 ? `\n\n重複していた図形IDを ${fixedIds} 件修復しました。` : '')
      + (zeroWires > 0 ? `\n\n長さ0の配線(見えない配線)を ${zeroWires} 本削除しました。` : ''));
  } catch (e) {
    alert('開けませんでした: ' + e.message);
  }
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
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['backup.js'] = 1;
