// ================================================================
// data.js — 定数・シンボル定義（状態を持たない）
// ================================================================

// LAYER_DEFAULTS は未使用のため削除(2026-08-21)。既定線幅は下のLAYERSと
// js/ui.js の DEFAULT_LINE_WIDTH で管理する。
const LAYER_DASHES = {
  solid:  [],
  dashed: [8, 4],
  dotted: [2, 4],
  dashdot:[10, 4, 2, 4],
};
// 既定の線幅は0.5。JIS/ISO 128の標準線幅(0.13〜2.0の9種)のうち、
// 電気図面で扱いやすい太さとして採用(盛田さん指定)。
// 従来は1.0だったが、シンボル・配線・図形で既定がばらついていたため0.5に統一した。
const LAYERS = [
  { name: '回路', color: '#1d6fb5', visible: true, locked: false, active: true,  lineWidth: 0.5, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '配線', color: '#0F6E56', visible: true, locked: false, active: false, lineWidth: 0.5, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '注記', color: '#b45309', visible: true, locked: false, active: false, lineWidth: 0.5, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '外形', color: '#444',    visible: true, locked: false, active: false, lineWidth: 0.5, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '寸法', color: '#744da9', visible: true, locked: false, active: false, lineWidth: 0.5, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '図面枠',color: '#222',   visible: true, locked: false, active: false, lineWidth: 0.5, lineDash: 'solid', fontSize: null, attr: '' },
];

const BUILTIN_PARTS = [
  { maker:'三菱電機', ref:'S-T10',    type:'coil',    volt:'AC200V', amp:'10A',    terminals:'A1,A2,1,3,5,2,4,6', contacts:'a3b1' },
  { maker:'三菱電機', ref:'NF63-CV',  type:'breaker', volt:'',       amp:'40-63A', terminals:'1,2,3,4,5,6',       contacts:''     },
];

// 要素の種別定義。w/h は当たり判定・選択枠・ラベル位置の基準寸法。
//
// 【2026-09-21】内蔵の標準シンボル20種(battery/ac/ground/resistor/capacitor/
// inductor/diode/sw_no/sw_nc/timer_no/timer_nc/push_no/coil/timer_coil/motor/
// lamp/fuse/breaker/transformer/terminal)をここから削除した。端子点が1つも
// 定義されておらず、部品DBの端子番号割り当ても接点リファレンスも通らないため、
// 実務では一度も使われていなかった(盛田さん)。描画側(js/symbols.js)・
// パネル(BUILTIN_SYMS)・DXF入出力からも併せて削除している。
//
// ここに残すのは作図プリミティブだけ。実際に使うシンボルは
// state.customSymbols(登録シンボル)が loadCustomSymbolDefs() でDEFSに入れる。
const DEFS = {
  text:        { w:0,  h:0,  label:'',     jis:'' },
  rect:        { w:0,  h:0,  label:'',     jis:'' },
  circle:      { w:0,  h:0,  label:'',     jis:'' },
  fline:       { w:0,  h:0,  label:'',     jis:'' },
};

const FRAME_TPLS = {
  A4H: { w:297, h:210, mg:10, th:30, cols:8,  rows:4  },
  A4V: { w:210, h:297, mg:10, th:30, cols:6,  rows:6  },
  A3H: { w:420, h:297, mg:10, th:30, cols:12, rows:4  },
  A3V: { w:297, h:420, mg:10, th:30, cols:8,  rows:6  },
  A2H: { w:594, h:420, mg:10, th:30, cols:16, rows:6  },
  A1H: { w:841, h:594, mg:10, th:30, cols:24, rows:8  },
  A0H: { w:1189,h:841, mg:10, th:30, cols:32, rows:10 },
  B4H: { w:364, h:257, mg:10, th:30, cols:10, rows:4  },
  B3H: { w:515, h:364, mg:10, th:30, cols:14, rows:6  },
};

// ================================================================
// 表題欄の様式テンプレート
//
// 自社様式と客先様式を切り替えられるようにするためのもの。
// 図面枠パネルの「表題欄」セレクタで選び、frameObj.tbTpl に保存される。
//
// 【新しい様式の追加方法】
// 客先の図面に合わせた様式を足す場合は、このオブジェクトにキーを1つ増やす。
//   cells の各項目:
//     x,y,w,h : 表題欄の中での位置と大きさ。0〜1の割合で指定する
//               (x,w は表題欄の幅に対する割合、y,h は高さに対する割合)
//     key     : 値を入れる項目名。frameObj[key] が中身として描かれる
//               '_page' は特別扱いで、現在ページ/総ページ数が自動で入る
//     lbl     : セルの左上に小さく表示される見出し
//   同じ y の行で w の合計が 1 になるようにすると隙間なく埋まる。
//
// 入力欄(図面枠パネルの各テキストボックス)は index.html 側にあり、
// key がそれと対応している。既存の key を使う限り入力欄はそのまま使える。
// 新しい key を使いたい場合は入力欄の追加も必要になる。
// ================================================================
const TITLE_BLOCK_TPLS = {
  standard: {
    label: '標準',
    cells: [
      {x:0,   y:0,  w:.25, h:.5, key:'drawno',  lbl:'図面番号'},
      {x:.25, y:0,  w:.35, h:.5, key:'title',   lbl:'図面名称'},
      {x:.6,  y:0,  w:.2,  h:.5, key:'company', lbl:'会社名'},
      {x:.8,  y:0,  w:.2,  h:.5, key:'equip',   lbl:'設備名'},
      {x:0,   y:.5, w:.12, h:.5, key:'author',  lbl:'作成'},
      {x:.12, y:.5, w:.12, h:.5, key:'approve', lbl:'承認'},
      {x:.24, y:.5, w:.2,  h:.5, key:'date',    lbl:'日付'},
      {x:.44, y:.5, w:.1,  h:.5, key:'scale2',  lbl:'縮尺'},
      {x:.54, y:.5, w:.06, h:.5, key:'rev',     lbl:'Rev'},
      {x:.6,  y:.5, w:.35, h:.5, key:'chghist', lbl:'変更履歴'},
      {x:.95, y:.5, w:.05, h:.5, key:'_page',   lbl:'ページ'},
    ],
  },
  simple: {
    label: '簡易（項目を絞った様式）',
    cells: [
      {x:0,   y:0,  w:.55, h:.5, key:'title',   lbl:'図面名称'},
      {x:.55, y:0,  w:.45, h:.5, key:'drawno',  lbl:'図面番号'},
      {x:0,   y:.5, w:.35, h:.5, key:'company', lbl:'会社名'},
      {x:.35, y:.5, w:.25, h:.5, key:'author',  lbl:'作成'},
      {x:.6,  y:.5, w:.25, h:.5, key:'date',    lbl:'日付'},
      {x:.85, y:.5, w:.15, h:.5, key:'_page',   lbl:'ページ'},
    ],
  },
};

// 表題欄テンプレートを取り出す。未指定・未知のキーなら標準様式にフォールバックする
// (客先様式で作った図面を、その様式が無い環境で開いても表題欄が消えないようにするため)
function titleBlockCells(fr) {
  const all = allTitleBlockTpls();
  const t = all[(fr && fr.tbTpl) || 'standard'] || all.standard;
  return t.cells;
}

// 読み込んだ客先様式の保存先。客先ごとに様式が違うため、コードに埋め込むのではなく
// JSONで足せるようにしてある。図面枠パネルの「様式を読込」から追加する。
const TB_TPL_STORE = 'ecad_titleblock_tpls';

function userTitleBlockTpls() {
  try {
    const o = JSON.parse(localStorage.getItem(TB_TPL_STORE) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch (e) {
    console.warn('[titleBlock] 保存済み様式の読み出しに失敗:', e);
    return {};
  }
}

// 組み込み様式 + 読み込んだ客先様式。同じキーなら読み込んだ方を優先する
function allTitleBlockTpls() {
  return Object.assign({}, TITLE_BLOCK_TPLS, userTitleBlockTpls());
}

// 様式の定義が壊れていないか検査する。壊れた定義で図面枠が描けなくなるのを防ぐ。
// 戻り値: エラーメッセージの配列（空なら正常）
function validateTitleBlockTpl(key, tpl) {
  const errs = [];
  if (!tpl || typeof tpl !== 'object') { errs.push(`${key}: 定義がオブジェクトではありません`); return errs; }
  if (!Array.isArray(tpl.cells) || !tpl.cells.length) { errs.push(`${key}: cells が空です`); return errs; }
  tpl.cells.forEach((c, i) => {
    ['x','y','w','h'].forEach(k => {
      if (typeof c[k] !== 'number' || !isFinite(c[k])) errs.push(`${key}: ${i+1}番目のセルの ${k} が数値ではありません`);
      else if (c[k] < 0 || c[k] > 1) errs.push(`${key}: ${i+1}番目のセルの ${k}=${c[k]} が0〜1の範囲外です`);
    });
    if (!c.key) errs.push(`${key}: ${i+1}番目のセルに key がありません`);
  });
  return errs;
}

// カスタムシンボルをDEFSに追加
function loadCustomSymbolDefs() {
  state.customSymbols.forEach(s => { DEFS[s.type] = s; });
}

function getDef(type) {
  return DEFS[type] || null;
}

function layColor(layerName) {
  const l = LAYERS.find(l => l.name === layerName);
  return l ? l.color : '#1d6fb5';
}

function activeLayer() {
  return LAYERS.find(l => l.active)?.name || '回路';
}

// ----------------------------------------------------------------
// 【2026-09-21】標準シンボル定義(BUILTIN_SYMS)を削除した。
// シンボルパネル(renderSymFloat)は既にカスタムシンボルしか表示しておらず、
// 残っていたのは使用履歴(recordRecentSym)だけだった。
// 登録シンボルの一覧は state.customSymbols が持つ。
// ----------------------------------------------------------------

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['data.js'] = 1;
