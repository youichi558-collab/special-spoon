// ================================================================
// dxf_export.js — DXF AC1015 (AutoCAD 2000) 出力
// DWG TrueView 2026+ 対応
// AcDbEntity + サブクラスマーカー完全対応
// ================================================================

const DXF_LAYER_MAP = {
  "回路":"CIRCUIT","配線":"WIRE","注記":"NOTE",
  "外形":"OUTLINE","図面枠":"FRAME","寸法":"DIM","寸法_vis":"DIM_VIS"
};
function dxfLayer(name){ return DXF_LAYER_MAP[name] || name || '0'; }
// 【警告】\U+XXXX変換は試済み・失敗済み（AC1015でリテラル表示される）。再実装禁止。
// 日本語対応は実装済み(2026-07-21): sjis.jsのencodeSJISでShift-JIS(cp932)バイト出力 + $DWGCODEPAGE=ANSI_932。
// 実機(DWG TrueView)での文字表示確認は未了 — 確認前にこの方式を変更しないこと。
function toUnicodeDXF(str){ return String(str||''); }
function addRect(ls,layer,x1,y1,x2,y2){
  const L=(ax1,ay1,ax2,ay2)=>ls.push('0','LINE','8',layer,'10',ax1.toFixed(2),'20',(-ay1).toFixed(2),'30','0','11',ax2.toFixed(2),'21',(-ay2).toFixed(2),'31','0');
  L(x1,y1,x2,y1);L(x2,y1,x2,y2);L(x2,y2,x1,y2);L(x1,y2,x1,y1);
}

function exportDXF(){
  let _h = 0x200;
  const nh = () => (_h++).toString(16).toUpperCase();

  const out = [];
  // p(code, value, code, value, ...) — フォーマット済みDXF行を追加
  function p(...args){
    for(let i=0;i<args.length;i+=2){
      out.push(String(args[i]).padStart(3));
      out.push(String(args[i+1]));
    }
  }

  // ページデータ取得
  const pg = state.pages[state.currentPage];
  const elements = (pg && pg.elements) ? pg.elements : (state.elements||[]);
  const wires    = (pg && pg.wires)    ? pg.wires    : (state.wires||[]);

  // バウンディングボックス（DXF Y反転後）
  let minX=1e20,minY=1e20,maxX=-1e20,maxY=-1e20;
  function ext(x,y){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  wires.forEach(w=>{(w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(pt=>ext(pt.x,-pt.y));});
  elements.forEach(el=>{
    if(el.x1!=null){ext(el.x1,-el.y1);ext(el.x2,-el.y2);}
    else if(el.x!=null) ext(el.x,-el.y);
  });
  if(minX>maxX){minX=0;minY=-297;maxX=420;maxY=0;}
  const cx=((minX+maxX)/2).toFixed(2), cy=((minY+maxY)/2).toFixed(2);
  const vh=Math.max(maxY-minY,maxX-minX,100).toFixed(2);

  // レイヤー定義
  const LAYER_DEFS = [
    {n:'0',       c:7}, {n:'CIRCUIT',c:2}, {n:'WIRE',   c:5},
    {n:'NOTE',    c:3}, {n:'OUTLINE',c:6}, {n:'FRAME',  c:4},
    {n:'DIM',     c:1}, {n:'DIM_VIS',c:1},
  ];

  // シンボル名リスト
  const SYM_NAMES = ['resistor','capacitor','inductor','diode','sw_no','timer_no','timer_nc',
    'push_no','sw_nc','coil','timer_coil','breaker','motor','lamp','ground',
    'battery','fuse','ac','transformer','terminal'];

  // ハンドル事前割当
  const H_VPORT_TBL    = nh(), H_VPORT_ACT   = nh();
  const H_LTYPE_TBL    = nh(), H_CONT=nh(), H_DASHED=nh(), H_DOT=nh(), H_DDOT=nh();
  const H_LAYER_TBL    = nh(); const layerH = LAYER_DEFS.map(()=>nh());
  const H_STYLE_TBL    = nh(), H_STYLE_STD  = nh();
  const H_VIEW_TBL     = nh();
  const H_UCS_TBL      = nh();
  const H_APPID_TBL    = nh(), H_APPID_ACAD = nh();
  const H_DIMST_TBL    = nh(), H_DIMST_STD  = nh();
  const H_BLKREC_TBL   = nh(), H_BLKREC_MDL = nh(), H_BLKREC_PPR = nh();
  const H_ROOT_DICT = nh(), H_GRP_DICT = nh();
  const H_COLOR_DICT = nh(), H_LAYOUT_DICT = nh(), H_MATERIAL_DICT = nh();
  const H_MLEADER_DICT = nh(), H_MLINE_DICT = nh(), H_PLOTSET_DICT = nh();
  const H_PLOTSTYLE_DICT = nh(), H_PLOTSTYLE_NORMAL = nh();
  const H_SCALELIST_DICT = nh(), H_TABLESTYLE_DICT = nh(), H_VISUALSTYLE_DICT = nh();
  const H_LAYOUT_MODEL = nh(), H_LAYOUT_PAPER = nh();
  const symBlkRecH     = SYM_NAMES.map(()=>nh());
  const H_MDL_BLK      = nh(), H_MDL_EBLK  = nh();
  const H_PPR_BLK      = nh(), H_PPR_EBLK  = nh();
  const symBlkH        = SYM_NAMES.map(()=>({b:nh(),e:nh()}));

  // ================================================================
  // HEADER
  // ================================================================
  p(0,'SECTION', 2,'HEADER');
  p(9,'$ACADVER',     1,'AC1015');
  p(9,'$DWGCODEPAGE',  3,'ANSI_932'); // 日本語(Shift-JIS/cp932)。encodeSJISでのバイト出力とセット
  p(9,'$HANDSEED',    5,'__HANDSEED__');
  p(9,'$INSUNITS',   70, 4);  // mm
  p(9,'$MEASUREMENT',70, 1);  // メートル法
  p(9,'$EXTMIN',     10,minX.toFixed(3), 20,minY.toFixed(3), 30,'0.0');
  p(9,'$EXTMAX',     10,maxX.toFixed(3), 20,maxY.toFixed(3), 30,'0.0');
  p(9,'$LIMMIN',     10,'0.0', 20,'0.0');
  p(9,'$LIMMAX',     10,'420.0', 20,'297.0');
  p(9,'$CLAYER',      8,'0');
  p(9,'$CELTYPE',     6,'BYLAYER');
  p(9,'$CCOLOR',     62, 256);
  p(9,'$CELWEIGHT', 370,-1);
  p(9,'$LWDISPLAY', 290, 0);
  p(9,'$LTSCALE',    40,'1.0');
  p(9,'$LUNITS',     70, 2);
  p(9,'$LUPREC',     70, 4);
  p(9,'$AUNITS',     70, 0);
  p(9,'$AUPREC',     70, 0);
  p(9,'$TEXTSTYLE',   7,'STANDARD');
  p(9,'$DIMSTYLE',    2,'STANDARD');
  p(9,'$PSTYLEMODE',290, 1);
  p(9,'$EXTNAMES',  290, 1);
  p(9,'$TREEDEPTH',  70, 3020);
  p(9,'$ANGBASE',    50,'0.0');
  p(9,'$ANGDIR',     70, 0);
  p(9,'$PDMODE',     70, 0);
  p(9,'$PDSIZE',     40,'0.0');
  p(9,'$LIMCHECK',   70, 0);
  p(9,'$UNITMODE',   70, 0);
  p(9,'$ORTHOMODE',  70, 0);
  p(9,'$REGENMODE',  70, 1);
  p(9,'$FILLMODE',   70, 1);
  p(9,'$QTEXTMODE',  70, 0);
  p(9,'$MIRRTEXT',   70, 0);
  p(9,'$WORLDVIEW',  70, 1);
  p(9,'$TILEMODE',   70, 1);
  p(9,'$PLIMCHECK',  70, 0);
  p(9,'$VISRETAIN',  70, 1);
  p(9,'$MAXACTVP',   70,64);
  p(9,'$PROXYGRAPHICS',70,1);
  p(0,'ENDSEC');

  // ================================================================
  // CLASSES（最小限）
  // ================================================================
  p(0,'SECTION', 2,'CLASSES');
  // 【追加構造対応・第2弾】LAYOUT/ACDBPLACEHOLDER/ACDBDICTIONARYWDFLTは"固定"組込型ではなく
  // クラス宣言が必要な拡張オブジェクトのため、CLASSESセクションでの事前宣言が要る(ezdxf新規R2000
  // 文書の実出力で確認)。前回のLAYOUT追加でOBJECTSにこれらを出力するようになったが、CLASSES宣言が
  // 空のままだったため、正規AutoCAD系リーダーが未知のオブジェクトとして拒否している可能性が高い。
  p(0,'CLASS',1,'ACDBDICTIONARYWDFLT',2,'AcDbDictionaryWithDefault',3,'ObjectDBX Classes',90,0,280,0,281,0);
  p(0,'CLASS',1,'ACDBPLACEHOLDER',    2,'AcDbPlaceHolder',           3,'ObjectDBX Classes',90,0,280,0,281,0);
  p(0,'CLASS',1,'LAYOUT',             2,'AcDbLayout',                3,'ObjectDBX Classes',90,0,280,0,281,0);
  p(0,'ENDSEC');

  // ================================================================
  // TABLES
  // ================================================================
  p(0,'SECTION', 2,'TABLES');

  // VPORT
  p(0,'TABLE', 2,'VPORT', 5,H_VPORT_TBL, 100,'AcDbSymbolTable', 70,1);
  p(0,'VPORT', 5,H_VPORT_ACT, 100,'AcDbSymbolTableRecord', 100,'AcDbViewportTableRecord');
  p(2,'*ACTIVE', 70,0,
    10,'0.0', 20,'0.0', 11,'1.0', 21,'1.0',
    12,cx, 22,cy, 13,'0.0', 23,'0.0',
    14,'10.0', 24,'10.0', 15,'10.0', 25,'10.0',
    16,'0.0', 26,'0.0', 36,'1.0', 17,'0.0', 27,'0.0', 37,'0.0',
    40,vh, 41,'1.5', 42,'50.0', 43,'0.0', 44,'0.0',
    50,'0.0', 51,'0.0',
    71,0, 72,100, 73,1, 74,3, 75,0, 76,0, 77,0, 78,0);
  p(0,'ENDTAB');

  // LTYPE
  p(0,'TABLE', 2,'LTYPE', 5,H_LTYPE_TBL, 100,'AcDbSymbolTable', 70,4);
  function ltype(h,name,desc,pat,elem){
    p(0,'LTYPE', 5,h, 100,'AcDbSymbolTableRecord', 100,'AcDbLinetypeTableRecord');
    p(2,name, 70,0, 3,desc, 72,65, 73,elem||0, 40,pat||'0.0');
  }
  ltype(H_CONT,  'CONTINUOUS','Solid line');
  // 各ダッシュ要素は 49(長さ)+74(要素タイプ=0) のペアが必須。
  // 74を省略するとAutoCAD/TrueViewが「複合線種にグループコード49がありません」で読込拒否する。
  ltype(H_DASHED,'DASHED',    'Dashed',     '9.5', 2);
  out.push('  49','6.35','  74','0','  49','-3.175','  74','0');
  ltype(H_DOT,   'DOT',       'Dot',        '3.175',2);
  out.push('  49','0.0','  74','0','  49','-3.175','  74','0');
  ltype(H_DDOT,  'DASHDOT',   'Dash dot',   '12.7', 4);
  out.push('  49','6.35','  74','0','  49','-3.175','  74','0','  49','0.0','  74','0','  49','-3.175','  74','0');
  p(0,'ENDTAB');

  // LAYER
  const ltypeMap = {solid:'CONTINUOUS',dashed:'DASHED',dotted:'DOT',dashdot:'DASHDOT'};
  const allLayers = [
    ...LAYER_DEFS,
    // LAYERS変数（状態由来）もマージ（重複はスキップ）
    ...(typeof LAYERS !== 'undefined' ? LAYERS : []).map(l=>({n:dxfLayer(l.name),c:l.locked?4:2}))
      .filter(l=>!LAYER_DEFS.some(d=>d.n===l.n))
  ];
  // 【安全網】LAYERS配列に登録漏れの孤立レイヤー名(過去のdeleteLayerバグ等で発生しうる)を
  // ENTITIESから実際に使用されているものだけ拾って追加登録する。これが無いと、テーブルに存在しない
  // レイヤーをENTITIESが参照する不正なDXFになり、TrueView等の正規AutoCAD系リーダーが開けなくなる。
  const knownLayerNames = new Set(allLayers.map(l=>l.n));
  const usedLayerNames = new Set();
  elements.forEach(el=>{ if(el.layer) usedLayerNames.add(dxfLayer(el.layer)); });
  wires.forEach(w=>{ if(w.layer) usedLayerNames.add(dxfLayer(w.layer)); });
  usedLayerNames.forEach(n=>{ if(!knownLayerNames.has(n)) allLayers.push({n, c:2}); });
  p(0,'TABLE', 2,'LAYER', 5,H_LAYER_TBL, 330,H_BLKREC_TBL, 100,'AcDbSymbolTable', 70,allLayers.length);
  // 【バグ修正】旧実装はallLayers内の位置iでLAYERS配列を直接引いていたが、allLayersは
  // LAYER_DEFS(固定8件)+LAYERS(フィルタ後)の連結でインデックスが対応しておらず、常にズレた
  // レイヤーの線種が適用されていた(インポート図面の破線/一点鎖線が別レイヤーの設定で出力される軽微な
  // 不具合。TrueViewが開けない件とは無関係だが同時に発見したため修正)。名前引きに変更。
  const layerByName = new Map((typeof LAYERS !== 'undefined' ? LAYERS : []).map(l=>[dxfLayer(l.name), l]));
  allLayers.forEach((ld,i)=>{
    const h = i < layerH.length ? layerH[i] : nh();
    p(0,'LAYER', 5,h, 330,H_LAYER_TBL, 100,'AcDbSymbolTableRecord', 100,'AcDbLayerTableRecord');
    const srcLayer = layerByName.get(ld.n);
    const ltype = srcLayer ? (ltypeMap[srcLayer.lineDash||'solid']||'CONTINUOUS') : 'CONTINUOUS';
    // 【本命修正】group 390(プロットスタイル名ハンドル)が無いと、TrueViewは
    // 「テーブル LAYER にエラー発生。印刷スタイル名を受け取れません」で読込全体を破棄する
    // (元図.DXFの全LAYERエントリに390が存在することを確認して特定。2026-07-23)。
    // ACAD_PLOTSTYLENAME辞書の"Normal"プレースホルダ(H_PLOTSTYLE_NORMAL)を全レイヤーに割当てる。
    p(2,ld.n, 70,0, 62,ld.c, 6,ltype, 370,-3, 390,H_PLOTSTYLE_NORMAL);
  });
  p(0,'ENDTAB');

  // STYLE
  p(0,'TABLE', 2,'STYLE', 5,H_STYLE_TBL, 100,'AcDbSymbolTable', 70,1);
  p(0,'STYLE', 5,H_STYLE_STD, 100,'AcDbSymbolTableRecord', 100,'AcDbTextStyleTableRecord');
  p(2,'STANDARD', 70,0, 40,'0.0', 41,'1.0', 50,'0.0', 71,0, 42,'2.5', 3,'', 4,'');
  p(0,'ENDTAB');

  // VIEW
  p(0,'TABLE', 2,'VIEW', 5,H_VIEW_TBL, 100,'AcDbSymbolTable', 70,0);
  p(0,'ENDTAB');

  // UCS
  p(0,'TABLE', 2,'UCS', 5,H_UCS_TBL, 100,'AcDbSymbolTable', 70,0);
  p(0,'ENDTAB');

  // APPID
  p(0,'TABLE', 2,'APPID', 5,H_APPID_TBL, 100,'AcDbSymbolTable', 70,1);
  p(0,'APPID', 5,H_APPID_ACAD, 100,'AcDbSymbolTableRecord', 100,'AcDbRegAppTableRecord');
  p(2,'ACAD', 70,0);
  p(0,'ENDTAB');

  // DIMSTYLE
  p(0,'TABLE', 2,'DIMSTYLE', 5,H_DIMST_TBL, 100,'AcDbSymbolTable', 70,1);
  p(0,'DIMSTYLE', 5,H_DIMST_STD, 100,'AcDbSymbolTableRecord', 100,'AcDbDimStyleTableRecord');
  p(2,'STANDARD', 70,0);
  p(40,'1.0', 41,'2.5', 42,'0.625', 43,'3.75', 44,'1.25', 45,'0.0', 46,'0.0', 47,'0.0', 48,'0.0');
  p(140,'2.5', 141,'2.5', 142,'0.0', 143,'25.4', 144,'1.0', 145,'0.0', 146,'1.0', 147,'0.625');
  p(71,0, 72,0, 73,0, 74,0, 75,0, 76,0, 77,0, 78,8, 79,0);
  p(170,0, 171,2, 172,0, 173,0, 174,0, 175,0, 176,0, 177,0, 178,0);
  p(270,2, 271,2, 272,2, 273,2, 274,2, 340,H_STYLE_STD);
  p(275,0, 276,0, 277,0, 278,0, 279,0);
  p(280,0, 281,0, 282,0, 283,1, 284,0, 285,0, 286,0, 287,3, 288,0);
  p(0,'ENDTAB');

  // BLOCK_RECORD
  p(0,'TABLE', 2,'BLOCK_RECORD', 5,H_BLKREC_TBL, 100,'AcDbSymbolTable', 70, 2+SYM_NAMES.length);
  p(0,'BLOCK_RECORD', 5,H_BLKREC_MDL, 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,'*MODEL_SPACE',  70,0);
  p(0,'BLOCK_RECORD', 5,H_BLKREC_PPR, 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,'*PAPER_SPACE', 70,0);
  SYM_NAMES.forEach((name,i)=>{
    p(0,'BLOCK_RECORD', 5,symBlkRecH[i], 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,name, 70,0);
  });
  p(0,'ENDTAB');

  p(0,'ENDSEC'); // TABLES end

  // ================================================================
  // BLOCKS
  // ================================================================
  p(0,'SECTION', 2,'BLOCKS');

  // *MODEL_SPACE
  p(0,'BLOCK',  5,H_MDL_BLK,  100,'AcDbEntity', 8,'0', 100,'AcDbBlockBegin', 2,'*MODEL_SPACE', 70,0, 10,'0.0', 20,'0.0', 30,'0.0', 3,'*MODEL_SPACE', 1,'');
  p(0,'ENDBLK', 5,H_MDL_EBLK, 100,'AcDbEntity', 8,'0', 100,'AcDbBlockEnd');
  // *PAPER_SPACE
  p(0,'BLOCK',  5,H_PPR_BLK,  100,'AcDbEntity', 8,'0', 100,'AcDbBlockBegin', 2,'*PAPER_SPACE', 70,0, 10,'0.0', 20,'0.0', 30,'0.0', 3,'*PAPER_SPACE', 1,'');
  p(0,'ENDBLK', 5,H_PPR_EBLK, 100,'AcDbEntity', 8,'0', 100,'AcDbBlockEnd');

  // シンボルブロック（AC1015サブクラスマーカー付き）
  function bL(x1,y1,x2,y2){p(0,'LINE',5,nh(),100,'AcDbEntity',8,'0',100,'AcDbLine',10,x1.toFixed(3),20,(-y1).toFixed(3),30,'0.0',11,x2.toFixed(3),21,(-y2).toFixed(3),31,'0.0');}
  function bC(cx,cy,r){p(0,'CIRCLE',5,nh(),100,'AcDbEntity',8,'0',100,'AcDbCircle',10,cx.toFixed(3),20,(-cy).toFixed(3),30,'0.0',40,r.toFixed(3));}
  function bA(cx,cy,r,sa,ea){p(0,'ARC',5,nh(),100,'AcDbEntity',8,'0',100,'AcDbCircle',10,cx.toFixed(3),20,(-cy).toFixed(3),30,'0.0',40,r.toFixed(3),100,'AcDbArc',50,sa.toFixed(3),51,ea.toFixed(3));}
  function bR(x1,y1,x2,y2){bL(x1,y1,x2,y1);bL(x2,y1,x2,y2);bL(x2,y2,x1,y2);bL(x1,y2,x1,y1);}
  function bT(x,y,h,s){p(0,'TEXT',5,nh(),100,'AcDbEntity',8,'0',100,'AcDbText',10,x.toFixed(3),20,(-y).toFixed(3),30,'0.0',40,String(h),1,s,7,'STANDARD',72,1,11,x.toFixed(3),21,(-y).toFixed(3),31,'0.0',100,'AcDbText',73,0);}

  const symDefs = [
    ['resistor',   ()=>{bL(-32,0,-18,0);bR(-18,-8,18,8);bL(18,0,32,0);}],
    ['capacitor',  ()=>{bL(-27,0,-6,0);bL(-6,-12,-6,12);bL(6,-12,6,12);bL(6,0,27,0);}],
    ['inductor',   ()=>{bL(-32,0,-22,0);for(let i=0;i<4;i++)bA(-16+i*10,0,8,0,180);bL(22,0,32,0);}],
    ['diode',      ()=>{bL(-32,0,-12,0);bL(-12,-10,-12,10);bL(-12,10,12,0);bL(12,0,-12,-10);bL(12,-10,12,10);bL(12,0,32,0);}],
    ['sw_no',      ()=>{bL(-32,0,-14,0);bC(-14,0,3);bL(-14,0,14,-9);bC(14,0,3);bL(14,0,32,0);}],
    ['timer_no',   ()=>{bL(-32,0,-14,0);bC(-14,0,3);bL(-11,0,11,-12);bC(14,0,3);bL(14,0,32,0);bA(0,6,8,0,180);}],
    ['timer_nc',   ()=>{bL(-32,0,-14,0);bC(-14,0,3);bL(-11,0,11,0);bC(14,0,3);bL(14,0,32,0);bL(0,0,-6,-12);bA(0,6,8,0,180);}],
    ['push_no',    ()=>{bL(-32,0,-14,0);bC(-14,0,3);bL(-14,0,14,-9);bC(14,0,3);bL(14,0,32,0);bL(0,-14,0,-9);bL(-6,-14,6,-14);}],
    ['sw_nc',      ()=>{bL(-32,0,-14,0);bC(-14,0,3);bL(-14,0,14,5);bC(14,0,3);bL(14,0,32,0);bL(0,-10,0,-2);}],
    ['coil',       ()=>{bL(-32,0,-20,0);bR(-20,-14,20,14);bL(20,0,32,0);bT(0,4,9,'CR');}],
    ['timer_coil', ()=>{bL(-32,0,-20,0);bR(-20,-14,20,14);bL(20,0,32,0);bT(0,0,9,'TIM');bC(0,10,4);}],
    ['breaker',    ()=>{bL(-32,0,-20,0);bR(-20,-14,20,14);bL(20,0,32,0);bT(0,4,9,'CB');}],
    ['motor',      ()=>{bC(0,0,20);bL(-32,0,-20,0);bL(20,0,32,0);bT(0,5,14,'M');}],
    ['lamp',       ()=>{bC(0,0,18);bL(-11,-9,11,9);bL(11,-9,-11,9);bL(-32,0,-18,0);bL(18,0,32,0);}],
    ['ground',     ()=>{bL(0,-18,0,0);bL(-18,0,18,0);bL(-13,5,13,5);bL(-8,10,8,10);}],
    ['battery',    ()=>{bL(-36,0,-14,0);bL(-14,-9,-14,9);bL(-7,-6,-7,6);bL(0,-9,0,9);bL(7,-6,7,6);bL(14,-9,14,9);bL(14,0,36,0);}],
    ['fuse',       ()=>{bL(-32,0,-18,0);bR(-18,-7,18,7);bL(-18,0,18,0);bL(18,0,32,0);}],
    ['ac',         ()=>{bL(-32,0,-20,0);bC(0,0,19);bL(-14,0,-7,-13);bL(-7,-13,0,0);bL(0,0,7,13);bL(7,13,14,0);bL(19,0,32,0);}],
    ['transformer',()=>{bL(-32,0,-22,0);bA(-16,0,7,0,180);bA(-8,0,7,0,180);bA(0,0,7,0,180);bL(0,-16,0,16);bA(2,0,7,180,0);bA(10,0,7,180,0);bA(18,0,7,180,0);bL(26,0,32,0);}],
    ['terminal',   ()=>{bL(-20,0,20,0);bR(-10,-8,10,8);bL(-4,-4,4,4);bL(4,-4,-4,4);}],
  ];
  symDefs.forEach(([name,fn],i)=>{
    p(0,'BLOCK', 5,symBlkH[i].b, 100,'AcDbEntity', 8,'0', 100,'AcDbBlockBegin', 2,name, 70,0, 10,'0.0', 20,'0.0', 30,'0.0', 3,name, 1,'');
    fn();
    p(0,'ENDBLK', 5,symBlkH[i].e, 100,'AcDbEntity', 8,'0', 100,'AcDbBlockEnd');
  });

  p(0,'ENDSEC'); // BLOCKS end

  // ================================================================
  // ENTITIES
  // ================================================================
  p(0,'SECTION', 2,'ENTITIES');

  // エンティティ出力ヘルパー（全てサブクラスマーカー付き）
  function eLine(layer,x1,y1,x2,y2){
    p(0,'LINE',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbLine',
      10,x1.toFixed(3),20,(-y1).toFixed(3),30,'0.0',
      11,x2.toFixed(3),21,(-y2).toFixed(3),31,'0.0');
  }
  function eCircle(layer,cx,cy,r){
    p(0,'CIRCLE',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbCircle',
      10,cx.toFixed(3),20,(-cy).toFixed(3),30,'0.0',40,r.toFixed(3));
  }
  function eArc(layer,cx,cy,r,sa,ea){
    p(0,'ARC',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbCircle',
      10,cx.toFixed(3),20,(-cy).toFixed(3),30,'0.0',40,r.toFixed(3),
      100,'AcDbArc',50,sa.toFixed(3),51,ea.toFixed(3));
  }
  function eText(layer,x,y,h,str,rot){
    if(!str) return;
    const u=toUnicodeDXF(str);
    p(0,'TEXT',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbText',
      10,x.toFixed(3),20,(-y).toFixed(3),30,'0.0',40,String(h),1,u);
    if(rot) p(50,String(rot));
    p(7,'STANDARD',72,1,11,x.toFixed(3),21,(-y).toFixed(3),31,'0.0',100,'AcDbText',73,0);
  }
  function eSolid(layer,x,y,ux,uy,a){
    // 寸法矢印（SOLID→AcDbTrace）
    const h=Math.hypot(ux,uy);if(h<1e-9)return;
    const ax=ux/h,ay=uy/h,nx=-ay*a*0.3,ny=ax*a*0.3;
    p(0,'SOLID',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbTrace',
      10,(x         ).toFixed(3),20,(-y         ).toFixed(3),30,'0.0',
      11,(x+ax*a+nx ).toFixed(3),21,(-(y+ay*a+ny)).toFixed(3),31,'0.0',
      12,(x+ax*a-nx ).toFixed(3),22,(-(y+ay*a-ny)).toFixed(3),32,'0.0',
      13,(x+ax*a    ).toFixed(3),23,(-(y+ay*a    )).toFixed(3),33,'0.0');
  }
  function eRect(layer,x,y,w,h){
    eLine(layer,x,y,x+w,y);eLine(layer,x+w,y,x+w,y+h);
    eLine(layer,x+w,y+h,x,y+h);eLine(layer,x,y+h,x,y);
  }

  const dxfAng = a => ((-a*180/Math.PI)%360+360)%360;

  // 寸法線
  elements.filter(e=>e.type==='dim').forEach(el=>{
    const dx=el.x2-el.x1,dy=el.y2-el.y1,len=Math.hypot(dx,dy);
    if(len<0.1) return;
    const sign=el.offsetSign||1, off=Math.abs(el.offset||30);
    const ux=dx/len,uy=dy/len,px=-uy*sign,py=ux*sign;
    const ax1=el.x1+px*off,ay1=el.y1+py*off,ax2=el.x2+px*off,ay2=el.y2+py*off;
    const mx=(ax1+ax2)/2,my=(ay1+ay2)/2;
    const drawLyr=(el.layer||'寸法')==='寸法'?'DIM_VIS':dxfLayer(el.layer||'寸法');
    const gap=el.gap??10, ext=el.ext??5, a=(el.arrowSz||8)*0.8;
    eLine(drawLyr,el.x1+px*gap,el.y1+py*gap,el.x1+px*(off+ext),el.y1+py*(off+ext));
    eLine(drawLyr,el.x2+px*gap,el.y2+py*gap,el.x2+px*(off+ext),el.y2+py*(off+ext));
    eLine(drawLyr,ax1,ay1,ax2,ay2);
    eSolid(drawLyr,ax1,ay1, ux,uy,a);
    eSolid(drawLyr,ax2,ay2,-ux,-uy,a);
    const txt=el.dimText||String(Math.round(len*(state.drawScale||1)));
    eText(drawLyr,mx,my+5,10,txt);
  });

  // 図面枠
  if(state.frameObj){
    const fr=state.frameObj;
    const {sc,wMM,hMM,mg,thMM,cols,rows}=fr;
    const W=wMM*sc,H=hMM*sc,MGpx=mg*sc,TH=thMM*sc;
    const iW=W-MGpx*2,iH=H-MGpx*2,dH=iH-TH;
    const L=(x1,y1,x2,y2)=>eLine('FRAME',x1,y1,x2,y2);
    const T=(x,y,h,s)=>eText('FRAME',x,y,h,s);
    L(0,0,W,0);L(W,0,W,H);L(W,H,0,H);L(0,H,0,0);
    L(MGpx,MGpx,MGpx+iW,MGpx);L(MGpx+iW,MGpx,MGpx+iW,MGpx+iH);
    L(MGpx+iW,MGpx+iH,MGpx,MGpx+iH);L(MGpx,MGpx+iH,MGpx,MGpx);
    L(MGpx,MGpx+dH,MGpx+iW,MGpx+dH);
    const tw=iW/4;
    L(MGpx+tw,MGpx+dH,MGpx+tw,MGpx+iH);
    L(MGpx+tw*2,MGpx+dH,MGpx+tw*2,MGpx+iH);
    L(MGpx+tw*3,MGpx+dH,MGpx+tw*3,MGpx+iH);
    const ty=MGpx+dH+TH*0.6,fs=Math.max(4,TH*0.3);
    T(MGpx+tw*0.1,ty,fs,fr.drawno);
    T(MGpx+tw*0.1,ty-TH*0.35,fs,fr.title||'');
    T(MGpx+tw*1.1,ty,fs,fr.author);
    T(MGpx+tw*2.1,ty,fs,fr.company);
    T(MGpx+tw*3.1,ty,fs,fr.scale2||'');
    if(cols>0){const cw=iW/cols;for(let c=1;c<cols;c++){L(MGpx+c*cw,0,MGpx+c*cw,MGpx);L(MGpx+c*cw,MGpx+dH,MGpx+c*cw,H);}
      for(let c=0;c<cols;c++)T(MGpx+c*(iW/cols)+(iW/cols)/2,MGpx*0.6,6,String.fromCharCode(65+c));}
    if(rows>0){const rh=dH/rows;for(let r=1;r<rows;r++){L(0,MGpx+r*rh,MGpx,MGpx+r*rh);L(MGpx+iW,MGpx+r*rh,W,MGpx+r*rh);}
      for(let r=0;r<rows;r++){T(MGpx/2,MGpx+r*(dH/rows)+(dH/rows)/2,6,String(r+1));T(MGpx+iW+MGpx/2,MGpx+r*(dH/rows)+(dH/rows)/2,6,String(r+1));}}
  }

  // 配線
  wires.forEach(w=>{
    const layer=dxfLayer(w.layer||'配線');
    const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
    for(let i=0;i<pts.length-1;i++) eLine(layer,pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y);
    if(w.wireNo){const mp=pts[Math.floor(pts.length/2)];eText(layer,mp.x,mp.y-8,8,w.wireNo);}
  });

  // 要素
  elements.forEach(el=>{
    const layer=dxfLayer(el.layer||'回路');
    if(el.type==='dim') return;
    if(el.type==='fline'){
      eLine(layer,el.x1,el.y1,el.x2,el.y2);
    } else if(el.type==='rect'){
      eRect(layer,el.x,el.y,el.w||0,el.h||0);
    } else if(el.type==='circle'){
      eCircle(layer,el.x,el.y,el.r||0);
    } else if(el.type==='arc'){
      // 【弧の向き】Canvas(Y下向き)のccw=false=角度増加スイープは、Y反転後のDXF空間(Y上向き)
      // では時計回りになる。DXF ARCは常にCCW(50→51)なので ccw=false のとき start/end を入れ替える。
      // ※旧実装は条件が逆(if(el.ccw)でswap)で、全ケースで補角側の弧が出力されていた。
      //   matplotlib数値検証(8ケース: 1/4円・半円・0°跨ぎ・優弧・狭角×ccw両値)で修正版の一致を確認済み(2026-07-21)。
      let sa=dxfAng(el.startA||0),ea=dxfAng(el.endA||0);
      if(!el.ccw){const t=sa;sa=ea;ea=t;}
      eArc(layer,el.x,el.y,el.r||0,sa,ea);
    } else if(el.type==='junction'){
      eCircle(layer,el.x,el.y,el.r||5);
    } else if(el.type==='triangle'){
      eLine(layer,el.x1,el.y1,el.x2,el.y2);
      eLine(layer,el.x2,el.y2,el.x3,el.y3);
      eLine(layer,el.x3,el.y3,el.x1,el.y1);
    } else if(el.type==='text'){
      eText(layer,el.x,el.y,el.fs||14,el.text);
    } else if(el.type==='leader'){
      const bx=el.bx??el.x2,by=el.by??el.y2;
      eLine(layer,el.x1,el.y1,bx,by);
      eLine(layer,bx,by,el.x2,el.y2);
      if(el.leaderText) eText(layer,el.x2,el.y2,10,el.leaderText);
    } else if(el.type==='angle_dim'){
      eLine(layer,el.cx,el.cy,el.x1,el.y1);
      eLine(layer,el.cx,el.cy,el.x2,el.y2);
      const a1=Math.atan2(el.y1-el.cy,el.x1-el.cx);
      const a2=Math.atan2(el.y2-el.cy,el.x2-el.cx);
      // draw.jsと同じccw決定(劣角がπ超ならCanvasはccw=trueで描画)を再現し、
      // arc要素と同じ規則(ccw=falseでswap)で出力。旧実装の無条件swapはccw=trueで逆側の弧になっていた。
      let daAD=a2-a1; if(daAD<0)daAD+=Math.PI*2;
      const ccwAD=daAD>Math.PI;
      let sAD=dxfAng(a1),eAD=dxfAng(a2);
      if(!ccwAD){const t=sAD;sAD=eAD;eAD=t;}
      eArc(layer,el.cx,el.cy,el.r||30,sAD,eAD);
      eText(layer,el.x||el.cx,(el.y||el.cy)-(el.r||30)-8,el.dimFs||11,el.dimText||'');
    } else if(el.type==='bezier'&&el.pts?.length){
      // Catmull-Romスプライン→折れ線近似
      const pts=el.pts;
      const steps=8;
      for(let i=0;i<pts.length-1;i++){
        const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
        for(let t=0;t<steps;t++){
          const u=t/steps,u2=u*u,u3=u2*u,v=(t+1)/steps,v2=v*v,v3=v2*v;
          const x1=0.5*((2*p1.x)+(-p0.x+p2.x)*u+(2*p0.x-5*p1.x+4*p2.x-p3.x)*u2+(-p0.x+3*p1.x-3*p2.x+p3.x)*u3);
          const y1=0.5*((2*p1.y)+(-p0.y+p2.y)*u+(2*p0.y-5*p1.y+4*p2.y-p3.y)*u2+(-p0.y+3*p1.y-3*p2.y+p3.y)*u3);
          const x2=0.5*((2*p1.x)+(-p0.x+p2.x)*v+(2*p0.x-5*p1.x+4*p2.x-p3.x)*v2+(-p0.x+3*p1.x-3*p2.x+p3.x)*v3);
          const y2=0.5*((2*p1.y)+(-p0.y+p2.y)*v+(2*p0.y-5*p1.y+4*p2.y-p3.y)*v2+(-p0.y+3*p1.y-3*p2.y+p3.y)*v3);
          eLine(layer,x1,y1,x2,y2);
        }
      }
    } else {
      // シンボル INSERT
      const d=getDef(el.type);
      if(!d||el.x==null) return;
      const sc=el.scale||1;
      const hasAttrib=!!el.label;
      p(0,'INSERT',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbBlockReference');
      p(2,el.type,10,el.x.toFixed(3),20,(-el.y).toFixed(3),30,'0.0');
      p(50,String(el.rot||0),41,String(sc),42,String(sc),43,'1.0');
      if(hasAttrib){
        p(66,1);
        const lox=el.labelOffX||0,loy=el.labelOffY||(d.h/2+15);
        const rot=(el.rot||0)*Math.PI/180;
        const lx=el.x+lox*Math.cos(rot)-loy*Math.sin(rot);
        const ly=el.y+lox*Math.sin(rot)+loy*Math.cos(rot);
        const u=toUnicodeDXF(el.label);
        p(0,'ATTRIB',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbText',
          10,lx.toFixed(3),20,(-ly).toFixed(3),30,'0.0',40,'10',1,u,
          7,'STANDARD',72,0,11,lx.toFixed(3),21,(-ly).toFixed(3),31,'0.0',
          100,'AcDbAttribute',280,0,2,'LABEL',70,0);
        p(0,'SEQEND',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbSeqend');
      }
    }
  });

  p(0,'ENDSEC'); // ENTITIES end

  // ================================================================
  // OBJECTS
  // ================================================================
  p(0,'SECTION', 2,'OBJECTS');
  // 【課題A構造対応】DXF R2000以降はモデル/ペーパー空間ごとにLAYOUTオブジェクトが必須。
  // 欠落しているとDWG TrueView等の正規AutoCAD系リーダーは開けない(ezdxf/ODA系は読込時に自動補完するため
  // audit通過だけでは検知できない差異。ezdxf公式ドキュメントのLayout Management Structuresで仕様確認済み、
  // かつezdxf新規R2000文書の実出力を参考にレイアウト有無以外の付随要素(main VIEWPORT/reactor/拡張辞書)は
  // モデル空間の表示には必須でないことを確認済み(2026-07-23))。
  // ルート辞書: AutoCADが標準生成する主要エントリを一通り用意(中身が空でも辞書自体の存在が期待される)
  p(0,'DICTIONARY',5,H_ROOT_DICT,330,'0',100,'AcDbDictionary',281,1,
    3,'ACAD_COLOR',        350,H_COLOR_DICT,
    3,'ACAD_GROUP',        350,H_GRP_DICT,
    3,'ACAD_LAYOUT',       350,H_LAYOUT_DICT,
    3,'ACAD_MATERIAL',     350,H_MATERIAL_DICT,
    3,'ACAD_MLEADERSTYLE', 350,H_MLEADER_DICT,
    3,'ACAD_MLINESTYLE',   350,H_MLINE_DICT,
    3,'ACAD_PLOTSETTINGS', 350,H_PLOTSET_DICT,
    3,'ACAD_PLOTSTYLENAME',350,H_PLOTSTYLE_DICT,
    3,'ACAD_SCALELIST',    350,H_SCALELIST_DICT,
    3,'ACAD_TABLESTYLE',   350,H_TABLESTYLE_DICT,
    3,'ACAD_VISUALSTYLE',  350,H_VISUALSTYLE_DICT);
  p(0,'DICTIONARY',5,H_GRP_DICT,        330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_COLOR_DICT,      330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_MATERIAL_DICT,   330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_MLEADER_DICT,    330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_MLINE_DICT,      330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_PLOTSET_DICT,    330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_SCALELIST_DICT,  330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_TABLESTYLE_DICT, 330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  p(0,'DICTIONARY',5,H_VISUALSTYLE_DICT,330,H_ROOT_DICT,100,'AcDbDictionary',281,1);
  // ACAD_PLOTSTYLENAME は既定プロットスタイル"Normal"を持つ特殊辞書(ACDBDICTIONARYWDFLT)
  p(0,'ACDBDICTIONARYWDFLT',5,H_PLOTSTYLE_DICT,330,H_ROOT_DICT,100,'AcDbDictionary',281,1,
    3,'Normal',350,H_PLOTSTYLE_NORMAL,100,'AcDbDictionaryWithDefault',340,H_PLOTSTYLE_NORMAL);
  p(0,'ACDBPLACEHOLDER',5,H_PLOTSTYLE_NORMAL,330,H_PLOTSTYLE_DICT);
  // ACAD_LAYOUT辞書: "Model"と"Layout1"をLAYOUTオブジェクトへ登録
  p(0,'DICTIONARY',5,H_LAYOUT_DICT,330,H_ROOT_DICT,100,'AcDbDictionary',281,1,
    3,'Model',  350,H_LAYOUT_MODEL,
    3,'Layout1',350,H_LAYOUT_PAPER);
  // LAYOUTオブジェクト共通フィールド(ezdxf新規R2000文書の実出力に準拠。プロット設定は既定値でTrueView上の
  // 表示・印刷設定用途のみに影響し、モデル空間の図形表示そのものには影響しない)
  function emitLayout(handle, blkRecH, name, tabOrder, isModel, ex10,ey10,ex11,ey11){
    p(0,'LAYOUT',5,handle,330,H_LAYOUT_DICT,
      100,'AcDbPlotSettings',
      1,'', 2,'', 4,'A3', 6,'',
      40,'7.5',41,'20.0',42,'7.5',43,'20.0',
      44,'420.0',45,'297.0',46,'0.0',47,'0.0',
      48,'0.0',49,'0.0',140,'0.0',141,'0.0',
      142,'1.0',143,'1.0',70,(isModel?1024:0),72,1,73,0,74,5,
      7,'',75,16,76,0,77,2,78,300,147,'1.0',148,'0.0',149,'0.0',
      100,'AcDbLayout',
      1,name,70,1,71,tabOrder,
      10,ex10,20,ey10,11,ex11,21,ey11,
      12,'0.0',22,'0.0',32,'0.0',
      14,'1e+20',24,'1e+20',34,'1e+20',
      15,'-1e+20',25,'-1e+20',35,'-1e+20',
      146,'0.0',13,'0.0',23,'0.0',33,'0.0',
      16,'1.0',26,'0.0',36,'0.0',17,'0.0',27,'1.0',37,'0.0',
      76,1,330,blkRecH);
  }
  emitLayout(H_LAYOUT_MODEL, H_BLKREC_MDL, 'Model',   0, true,  '0.0','0.0','420.0','297.0');
  emitLayout(H_LAYOUT_PAPER, H_BLKREC_PPR, 'Layout1', 1, false, '0.0','0.0','420.0','297.0');
  p(0,'ENDSEC');

  p(0,'EOF');

  // $HANDSEEDを実使用最大ハンドル+余裕分に置換。
  // 【変更理由】理論上の最大値FFFFFFをそのまま使うと、正規AutoCAD系リーダーが「新規ハンドルを
  // 割り当てる余地が無い」と判断し拒否する可能性がある(実ファイルのHANDSEEDは常に実使用最大に近い
  // 控えめな値であり、理論上限の使用例は見られない)。_h(次回nh()呼び出し値)は現在のハンドル発行
  // カウンタの続きなので、そのまま採用すれば必ず実使用最大より大きく、かつ妥当な範囲に収まる。
  const handSeedVal = _h.toString(16).toUpperCase();
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '__HANDSEED__') { out[i] = handSeedVal; break; }
  }

  // ファイル出力
  const base=(state.saveFileName||'図面').replace(/[\\/:*?"<>|]/g,'_');
  const name=(pg.name||('Sheet'+(state.currentPage+1))).replace(/[\\/:*?"<>|]/g,'_');
  // 【課題B対応】UTF-8のまま出すと$DWGCODEPAGE=ANSI_932と不整合になり文字化けするため、
  // 全体をShift-JIS(cp932)バイト列に変換してBlob出力する(sjis.jsのencodeSJIS)。
  // encodeSJISが無い環境(スタブ等)ではテキストのままフォールバック。
  const dxfText = out.join('\r\n');
  const payload = (typeof encodeSJIS === 'function') ? encodeSJIS(dxfText) : dxfText;
  dl(payload, `${base}_${name}.dxf`, 'application/dxf');
}
