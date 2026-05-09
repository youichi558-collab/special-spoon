// ================================================================
// data.js — 定数・シンボル定義（状態を持たない）
// ================================================================

const LAYER_DEFAULTS = { lineWidth: 1, lineDash: 'solid', fontSize: 14 };
const LAYER_DASHES = {
  solid:  [],
  dashed: [8, 4],
  dotted: [2, 4],
  dashdot:[10, 4, 2, 4],
};
const LAYERS = [
  { name: '回路', color: '#1d6fb5', visible: true, locked: false, active: true,  lineWidth: 1, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '配線', color: '#0F6E56', visible: true, locked: false, active: false, lineWidth: 1, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '注記', color: '#b45309', visible: true, locked: false, active: false, lineWidth: 1, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '外形', color: '#444',    visible: true, locked: false, active: false, lineWidth: 1, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '寸法', color: '#744da9', visible: true, locked: false, active: false, lineWidth: 1, lineDash: 'solid', fontSize: null, attr: '' },
  { name: '図面枠',color: '#222',   visible: true, locked: false, active: false, lineWidth: 1, lineDash: 'solid', fontSize: null, attr: '' },
];

const BUILTIN_PARTS = [
  { maker:'三菱電機', ref:'S-T10',    type:'coil',    volt:'AC200V', amp:'10A',    terminals:'A1,A2,1,3,5,2,4,6', contacts:'a3b1' },
  { maker:'三菱電機', ref:'S-T21',    type:'coil',    volt:'AC200V', amp:'21A',    terminals:'A1,A2,1,3,5,2,4,6', contacts:'a3b1' },
  { maker:'三菱電機', ref:'NF30-CS',  type:'breaker', volt:'',       amp:'5-30A',  terminals:'1,2,3,4,5,6',       contacts:''     },
  { maker:'三菱電機', ref:'NF63-CV',  type:'breaker', volt:'',       amp:'40-63A', terminals:'1,2,3,4,5,6',       contacts:''     },
  { maker:'オムロン', ref:'G2R-1',    type:'coil',    volt:'DC24V',  amp:'',       terminals:'1,2,3,4,5',         contacts:'a1b1' },
  { maker:'オムロン', ref:'G2R-2',    type:'coil',    volt:'DC24V',  amp:'',       terminals:'1,2,3,4,5,6,7,8',   contacts:'a2b0' },
  { maker:'オムロン', ref:'H3Y-2',    type:'timer_coil',volt:'24-240V',amp:'',     terminals:'1,2,3,4,5,6,7,8',   contacts:'a2b0' },
  { maker:'富士電機', ref:'SC-03',    type:'coil',    volt:'AC200V', amp:'11A',    terminals:'A1,A2,1,3,5,2,4,6', contacts:'a3b1' },
  { maker:'富士電機', ref:'BW32AAG',  type:'breaker', volt:'',       amp:'20A',    terminals:'1,2,3,4,5,6',       contacts:''     },
  { maker:'シュナイダー', ref:'LC1D09',type:'coil',   volt:'AC24V',  amp:'9A',     terminals:'A1,A2,1,3,5,2,4,6', contacts:'a3b1' },
  { maker:'パナソニック', ref:'BKW3103K',type:'breaker',volt:'',     amp:'30A',    terminals:'1,2,3,4',           contacts:''     },
];

const DEFS = {
  battery:     { w:72, h:34, label:'電池', jis:'C 0617-2', isCoil:false },
  ac:          { w:64, h:34, label:'AC',   jis:'C 0617-2', isCoil:false },
  ground:      { w:44, h:36, label:'GND',  jis:'C 0617-2', isCoil:false },
  resistor:    { w:64, h:28, label:'R',    jis:'C 0617-4', isCoil:false },
  capacitor:   { w:54, h:28, label:'C',    jis:'C 0617-4', isCoil:false },
  inductor:    { w:64, h:28, label:'L',    jis:'C 0617-4', isCoil:false },
  diode:       { w:64, h:28, label:'D',    jis:'C 0617-5', isCoil:false },
  sw_no:       { w:64, h:28, label:'SW',   jis:'C 0617-7', isCoil:false, isContact:true, contactType:'a' },
  sw_nc:       { w:64, h:28, label:'SW',   jis:'C 0617-7', isCoil:false, isContact:true, contactType:'b' },
  timer_no:    { w:64, h:28, label:'TIM',  jis:'C 0617-7 02-12-05', isCoil:false, isContact:true, contactType:'a' },
  timer_nc:    { w:64, h:28, label:'TIM',  jis:'C 0617-7 02-12-05', isCoil:false, isContact:true, contactType:'b' },
  push_no:     { w:64, h:28, label:'PB',   jis:'C 0617-7', isCoil:false },
  coil:        { w:64, h:34, label:'CR',   jis:'C 0617-7', isCoil:true  },
  timer_coil:  { w:64, h:34, label:'TIM',  jis:'C 0617-7', isCoil:true, isTimer:true },
  motor:       { w:50, h:50, label:'M',    jis:'C 0617-6', isCoil:false },
  lamp:        { w:50, h:50, label:'PL',   jis:'C 0617-10',isCoil:false },
  fuse:        { w:64, h:28, label:'FU',   jis:'C 0617-4', isCoil:false },
  breaker:     { w:64, h:34, label:'CB',   jis:'C 0617-7', isCoil:false },
  transformer: { w:64, h:38, label:'TR',   jis:'C 0617-5', isCoil:false },
  terminal:    { w:40, h:24, label:'TB',   jis:'C 0617-2', isCoil:false, isTerminal:true },
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
