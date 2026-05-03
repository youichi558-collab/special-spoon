// ================================================================
// data.js — 定数・シンボル定義（状態を持たない）
// ================================================================

const LAYERS = [
  { name: '回路', color: '#1d6fb5', visible: true, locked: false, active: true  },
  { name: '配線', color: '#0F6E56', visible: true, locked: false, active: false },
  { name: '注記', color: '#b45309', visible: true, locked: false, active: false },
  { name: '外形', color: '#444',    visible: true, locked: false, active: false },
  { name: '図面枠',color: '#222',   visible: true, locked: false, active: false },
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
