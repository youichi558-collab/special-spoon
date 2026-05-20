// ================================================================
// state.js — CAD全体の状態を1か所に集約
// ================================================================

const state = {

  // ----------------------------------------------------------------
  // 図面データ（保存対象）
  // ----------------------------------------------------------------
  pages: [{ name: 'Sheet1', elements: [], wires: [], groups: [], frameObj: null }],
  currentPage: 0,
  saveFileName: '',
  customSymbols: [],
  customParts:   [],
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
  darkMode: false,
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
  guides:       [],       // 補助線リスト
  pdfZoom:      0,        // PDF出力時の実キャンバス倍率（線幅は state.zoom で計算）
  pdfDpi:       96,       // PDF出力DPI
  pendingRef:   null,
  pendingTerm:  null,
  dimState:      null,
  angleDimState: null,
  dimDef: { fs:11, tx:0, ty:-8, gap:null, ext:null, color:'#744da9', arrowStyle:'filled', arrowSz:8 },

  // ----------------------------------------------------------------
  // 現在ページへの便利アクセサ
  // ----------------------------------------------------------------
  get page()     { return this.pages[this.currentPage]; },
  get elements() { return this.page.elements; },
  get wires()    { return this.page.wires; },
  get frameObj() { return this.page.frameObj; },
  set frameObj(v){ this.page.frameObj = v; },
};

// ================================================================
// ID生成ユーティリティ
// ================================================================
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
