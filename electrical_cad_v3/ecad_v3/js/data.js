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

const DEFS = {
  battery:     { w:72, h:18, label:'電池', jis:'C 0617-2', isCoil:false },
  ac:          { w:64, h:38, label:'AC',   jis:'C 0617-2', isCoil:false },
  ground:      { w:32, h:30, label:'GND',  jis:'C 0617-2', isCoil:false },
  resistor:    { w:64, h:16, label:'R',    jis:'C 0617-4', isCoil:false },
  capacitor:   { w:54, h:24, label:'C',    jis:'C 0617-4', isCoil:false },
  inductor:    { w:64, h:12, label:'L',    jis:'C 0617-4', isCoil:false },
  diode:       { w:64, h:20, label:'D',    jis:'C 0617-5', isCoil:false },
  sw_no:       { w:64, h:24, label:'SW',   jis:'C 0617-7', isCoil:false, isContact:true, contactType:'a' },
  sw_nc:       { w:64, h:24, label:'SW',   jis:'C 0617-7', isCoil:false, isContact:true, contactType:'b' },
  timer_no:    { w:64, h:28, label:'TIM',  jis:'C 0617-7 02-12-05', isCoil:false, isContact:true, contactType:'a' },
  timer_nc:    { w:64, h:28, label:'TIM',  jis:'C 0617-7 02-12-05', isCoil:false, isContact:true, contactType:'b' },
  push_no:     { w:64, h:36, label:'PB',   jis:'C 0617-7', isCoil:false },
  coil:        { w:64, h:28, label:'CR',   jis:'C 0617-7', isCoil:true  },
  timer_coil:  { w:64, h:34, label:'TIM',  jis:'C 0617-7', isCoil:true, isTimer:true },
  motor:       { w:64, h:40, label:'M',    jis:'C 0617-6', isCoil:false },
  lamp:        { w:64, h:36, label:'PL',   jis:'C 0617-10',isCoil:false },
  fuse:        { w:64, h:14, label:'FU',   jis:'C 0617-4', isCoil:false },
  breaker:     { w:64, h:28, label:'CB',   jis:'C 0617-7', isCoil:false },
  transformer: { w:64, h:32, label:'TR',   jis:'C 0617-5', isCoil:false },
  terminal:    { w:40, h:16, label:'TB',   jis:'C 0617-2', isCoil:false, isTerminal:true },
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
// 標準シンボル定義（フローティングパネル用）
// ----------------------------------------------------------------
const BUILTIN_SYMS = [
  { cat:'電源', type:'battery',  label:'電池',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1.5"/><line x1="9" y1="3" x2="9" y2="17" stroke="currentColor" stroke-width="2.5"/><line x1="13" y1="6" x2="13" y2="14" stroke="currentColor" stroke-width="1.2"/><line x1="17" y1="3" x2="17" y2="17" stroke="currentColor" stroke-width="2.5"/><line x1="21" y1="6" x2="21" y2="14" stroke="currentColor" stroke-width="1.2"/><line x1="25" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'電源', type:'ac',       label:'交流電源',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="8" y2="10" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 10 Q14.5 4 17 10 Q19.5 16 22 10" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="24" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'電源', type:'ground',   label:'グランド',
    svg:`<svg width="36" height="18" viewBox="0 0 34 22"><line x1="17" y1="2" x2="17" y2="9" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="9" x2="27" y2="9" stroke="currentColor" stroke-width="2"/><line x1="10" y1="13" x2="24" y2="13" stroke="currentColor" stroke-width="1.5"/><line x1="13" y1="17" x2="21" y2="17" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'受動素子', type:'resistor', label:'抵抗',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="5" width="20" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="27" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'受動素子', type:'capacitor', label:'コンデンサ',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.5"/><line x1="14" y1="3" x2="14" y2="17" stroke="currentColor" stroke-width="2.5"/><line x1="18" y1="3" x2="18" y2="17" stroke="currentColor" stroke-width="2.5"/><line x1="18" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'受動素子', type:'inductor', label:'コイル(L)',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="6" y2="10" stroke="currentColor" stroke-width="1.5"/><path d="M6 10 Q8 3 11 10 Q13 3 16 10 Q18 3 21 10 Q23 3 26 10" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="26" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'受動素子', type:'diode',    label:'ダイオード',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="11" y2="10" stroke="currentColor" stroke-width="1.5"/><polygon points="11,4 11,16 23,10" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="23" y1="4" x2="23" y2="16" stroke="currentColor" stroke-width="1.5"/><line x1="23" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'スイッチ', type:'sw_no',   label:'a接点',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="24" y2="5" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="24" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'スイッチ', type:'sw_nc',   label:'b接点',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="24" y2="13" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="24" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="3" x2="17" y2="9" stroke="currentColor" stroke-width="1.2"/></svg>` },
  { cat:'スイッチ', type:'push_no', label:'押釦(a)',
    svg:`<svg width="36" height="18" viewBox="0 0 34 22"><line x1="2" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="12" x2="24" y2="7" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="24" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="1" x2="17" y2="6" stroke="currentColor" stroke-width="1.5"/><line x1="13" y1="1" x2="21" y2="1" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'スイッチ', type:'timer_no', label:'限時a接点',
    svg:`<svg width="36" height="20" viewBox="0 0 34 24"><line x1="2" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="24" y2="5" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="24" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/><path d="M9 16 A8 8 0 0 0 25 16" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>` },
  { cat:'スイッチ', type:'timer_nc', label:'限時b接点',
    svg:`<svg width="36" height="20" viewBox="0 0 34 24"><line x1="2" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="24" y2="10" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="24" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="10" x2="11" y2="0" stroke="currentColor" stroke-width="1.2"/><path d="M9 16 A8 8 0 0 0 25 16" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>` },
  { cat:'制御機器', type:'coil',       label:'リレーコイル',
    svg:`<svg width="36" height="16" viewBox="0 0 34 24"><line x1="2" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="4" width="20" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="17" y="15" text-anchor="middle" font-size="8" fill="currentColor">CR</text><line x1="27" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'制御機器', type:'timer_coil', label:'タイマコイル',
    svg:`<svg width="36" height="16" viewBox="0 0 34 24"><line x1="2" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="4" width="20" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="17" y="12" text-anchor="middle" font-size="7" fill="currentColor">TIM</text><circle cx="17" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="27" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'制御機器', type:'motor',      label:'モーター',
    svg:`<svg width="28" height="28" viewBox="0 0 34 34"><circle cx="17" cy="17" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="17" x2="4" y2="17" stroke="currentColor" stroke-width="1.5"/><line x1="30" y1="17" x2="32" y2="17" stroke="currentColor" stroke-width="1.5"/><text x="17" y="21" text-anchor="middle" font-size="11" font-weight="bold" fill="currentColor">M</text></svg>` },
  { cat:'制御機器', type:'lamp',       label:'ランプ',
    svg:`<svg width="28" height="28" viewBox="0 0 34 34"><circle cx="17" cy="17" r="12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="11" x2="23" y2="23" stroke="currentColor" stroke-width="1.3"/><line x1="23" y1="11" x2="11" y2="23" stroke="currentColor" stroke-width="1.3"/><line x1="2" y1="17" x2="5" y2="17" stroke="currentColor" stroke-width="1.5"/><line x1="29" y1="17" x2="32" y2="17" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'制御機器', type:'fuse',       label:'ヒューズ',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="5" width="20" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="27" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'制御機器', type:'breaker',    label:'ブレーカ',
    svg:`<svg width="36" height="16" viewBox="0 0 34 24"><line x1="2" y1="12" x2="7" y2="12" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="4" width="20" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="17" y="15" text-anchor="middle" font-size="7" fill="currentColor">CB</text><line x1="27" y1="12" x2="32" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>` },
  { cat:'制御機器', type:'transformer', label:'トランス',
    svg:`<svg width="36" height="22" viewBox="0 0 34 30"><path d="M4 15 Q5 8 8 15 Q9 8 12 15 Q13 8 16 15" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="16" y1="3" x2="16" y2="27" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/><path d="M16 15 Q18 8 21 15 Q22 8 25 15 Q26 8 29 15" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>` },
  { cat:'制御機器', type:'terminal',   label:'端子台',
    svg:`<svg width="36" height="16" viewBox="0 0 34 20"><line x1="2" y1="10" x2="32" y2="10" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="4" width="14" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="14" y1="7" x2="20" y2="13" stroke="currentColor" stroke-width="1"/><line x1="20" y1="7" x2="14" y2="13" stroke="currentColor" stroke-width="1"/></svg>` },
];
