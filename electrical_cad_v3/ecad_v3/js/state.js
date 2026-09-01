// ================================================================
// state.js — CAD全体の状態を1か所に集約
// ================================================================

const state = {

  // ----------------------------------------------------------------
  // 図面データ（保存対象）
  // ----------------------------------------------------------------
  pages: [{ name: 'Sheet1', elements: [], wires: [], groups: [], guides: [], frameObj: null }],
  currentPage: 0,
  saveFileName: '',
  customSymbols: [],
  customParts:   [],
  hiddenBuiltinRefs: [], // 非表示にした標準部品(BUILTIN_PARTS)のref一覧
  wireNoRule: {
    mode: 'sequence',   // 'sequence' | 'position' | 'prefix'
    prefix: '',
    startNum: 1,
    digits: 3,
    perPage: true,
  },

  // ----------------------------------------------------------------
  // 表示状態
  // ----------------------------------------------------------------
  pan:      { x: 60, y: 60 },
  zoom:     1,
  darkMode: true,
  G:        10,   // グリッドスナップ単位(px)
  drawScale: 1,   // 縮尺（例：100 = 1:100、寸法値にかける倍率）

  // ----------------------------------------------------------------
  // ツール状態（保存対象外）
  // ----------------------------------------------------------------
  mode:     'select',  // select | wire | text | rect | circle | fline | sym | dim | leader
  symType:  null,      // 配置中のシンボルtype
  ortho:    false,     // 直交モード
  snapEnd:  true,      // 端点スナップ
  snapMid:  true,      // 中点スナップ

  // 作業中の仮データ（確定したらentitiesへ）
  preview: null,       // { type, ...} 仮描画中のエンティティ
  wirePoints: [],      // 配線中の確定済みポイント列

  // ----------------------------------------------------------------
  // 選択状態（保存対象外）
  // ----------------------------------------------------------------
  sel: {
    els:   new Set(),
    wires: new Set(),
  },
  clipboard: [],

  // ----------------------------------------------------------------
  // マウス状態（保存対象外）
  // ----------------------------------------------------------------
  mouse: {
    down: false,
    button: -1,
    cx: 0, cy: 0,    // canvas座標
    wx: 0, wy: 0,    // world座標
    startCx: 0, startCy: 0,
    startWx: 0, startWy: 0,
    panning:   false,
    panOrigin: { x: 0, y: 0 },
    dragging:  false,
    dragGroup: [],
    dragMoved: false,
    selboxing: false,
    // ── タッチ入力用（input.js: タップ/ドラッグ/ロングタップ判定）
    _touchPend: null,         // {cx,cy,wx,wy,clientX,clientY} タップ確定待ちの情報
    _touchTimer: null,        // ロングタップ判定タイマー
    _touchLong: false,        // ロングタップ発火済みフラグ
    _touchDragStarted: false, // タップ→ドラッグへ昇格済みフラグ
  },

  // ----------------------------------------------------------------
  // リサイズ状態（保存対象外）
  // ----------------------------------------------------------------
  resize: {
    el:     null,
    handle: '',
    orig:   null,
  },
  resizeHandles: [],
  colorEditing: false,
  groupResize: {
    active: false,
    handle: '',
    orig:   null,
  },

  // ----------------------------------------------------------------
  // Undo/Redo
  // ----------------------------------------------------------------
  hist:     [],
  redoHist: [],

  // ----------------------------------------------------------------
  // その他UI状態
  // ----------------------------------------------------------------
  snapPreview:  null,
  pdfMode:      false,   // PDF出力中フラグ
  maskMode:     false,   // マスクモード（個人情報マスク）
  pdfZoom:      0,        // PDF出力時の実キャンバス倍率（線幅は state.zoom で計算）
  pdfDpi:       96,       // PDF出力DPI
  pendingRef:   null,
  pendingTerm:  null,
  showPartRef:  true,  // デバイスのキャンバス表示（PDF出力にも反映される）。
                        // 2026-08-07: トグル自体を廃止し常時表示化。明確な「隠したい」需要が
                        // 無かったため(?マーク問題は既に解消済み)、毎回押す手間をなくした。
  showSymPins:  false,  // 【検証用/仮】シンボル端子(ピン)位置のマーカー表示（PDF出力には反映されない）
  junctionStyle: 'dot', // 接続点の見た目: 'dot'=塗りつぶし丸(既定・分岐点用) / 'circle'=白丸(端子台の端子) / 'dbl'=二重丸
  junctionR: 2,             // 接続点のサイズ(半径)
  drawLineWidth: null, // これから描く図形(直線・矩形・円・弧・三角・曲線)の太さ。nullなら「レイヤー既定」に従う(従来動作)
  _junctionRTouched: false, // ユーザーがサイズを手動変更したか(trueならスタイル切替時のデフォルトサイズ変更を抑止)
  showUnconnected: false,   // 未接続端子マーカーの表示ON/OFF
  _unconnectedResults: [],  // runUnconnectedCheck()で計算したキャッシュ(毎フレーム再計算しない)
  partRefNext:  null,   // 連続採番モードの次に割り当てる番号
  dimState:      null,
  angleDimState: null,
  dimDef: { fs:11, tx:0, ty:-8, gap:null, ext:null, color:'#744da9', arrowStyle:'filled', arrowSz:8 },

  // ----------------------------------------------------------------
  // 現在ページへの便利アクセサ
  // ----------------------------------------------------------------
  get page()     { return this.pages[this.currentPage]; },
  get elements() { return this.page.elements; },
  get wires()    { return this.page.wires; },
  get guides()   { return this.page.guides || (this.page.guides = []); },
  get frameObj() { return this.page.frameObj; },
  set frameObj(v){ this.page.frameObj = v; },
};

// ================================================================
// ID生成ユーティリティ
//
// 旧実装は Date.now() + 4文字の乱数 だったが、乱数部が36^4=約168万通りしか
// 無いため、同じミリ秒内に大量生成すると誕生日問題で高確率に重複していた。
// 実測: 1000要素の一括生成で18.7%、3000要素で64%の確率で衝突が発生。
// DXFインポートは1ファイルで数百〜数千要素を一度に作るため、実務で普通に起きる。
//
// IDが重複すると、選択・移動・削除がいずれも id 照合(sel.els.has(el.id))で
// 対象を集めているため、1個だけ操作したつもりが図面の遠く離れた場所にある
// 別の図形まで一緒に動く・消える。作業中は気づかず、保存や出力の後で
// 「触っていない図形が1個だけ壊れている」という形で見つかることになる。
//
// 対策として連番カウンタを併用する。同一セッション内では _idSeq が必ず
// 進むので衝突は原理的に起こらない。乱数部も残してあるのは、別々のセッションで
// 作られた図面同士をマージする場合(別ファイルからのコピペ等)への保険。
// ================================================================
let _idSeq = 0;

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + (_idSeq++).toString(36)
       + Math.random().toString(36).slice(2, 6);
}


// ================================================================
// escH — innerHTML に文字列を埋め込むときのHTMLエスケープ
//
// 部品名・型番・メーカー名・端子番号・ページ名・シンボル名などは
// 外部から入ってくる文字列(カタログCSV、DXF、他所で作られた図面ファイル、
// 盛田さんの手入力)で、`<` や `"` が含まれ得る。これらを
// `list.innerHTML = \`...${name}...\`` の形でそのまま入れると、
// 良くて表示が崩れ(型番の `<` 以降が消える)、悪ければ onerror 付きの
// <img> 等として実行される。
//
// 使い方: `${escH(p.name)}` のように、テンプレート文字列の穴に必ずかぶせる。
// 属性値に入れる場合も同じ(`"` をエスケープするので value="${escH(v)}" で足りる)。
// ================================================================
function escH(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ================================================================
// showTopBanner — 「保存できていない」類の警告を画面上部に出し続ける
//
// この種の不具合は、気づかないまま作業を続けて、閉じたときに初めて
// 失われたと分かる。だから小さなステータス欄ではなく、必ず目に入る場所に
// 出し続ける必要がある(2026-09-01の部品DB消失の教訓)。
//
// id ごとに1本ずつ。msg に空文字・null を渡すと消える。
// 実装を1箇所に置くのは、同じ帯を複数のファイルが別々に作らないため。
// ================================================================
function showTopBanner(id, msg) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(id);
  if (!msg) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;left:0;right:0;z-index:100000;'
      + 'background:#a11;color:#fff;font-size:12px;line-height:1.5;padding:6px 12px;'
      + 'text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.45)';
    // 既に出ている帯の下に積む(2つ同時に出ても隠れないように)
    const above = document.querySelectorAll('[data-topbanner]').length;
    el.style.top = (above * 30) + 'px';
    el.setAttribute('data-topbanner', '1');
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escH, genId, showTopBanner };
}
