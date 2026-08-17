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
  // 【本命修正】原点シフトの基準を回路要素(elements/wires)のバウンディングボックスだけで
  // 計算していたため、回路が用紙全体を使い切っていない図面では、シフト後の原点(0,0)が
  // 用紙の隅ではなく行3付近など中途半端な位置に来てしまい、TrueViewのUCS原点マーカーが
  // 図面の中に浮いて見えていた(盛田さんの「原点位置がおかしい」指摘、2026-08-03)。
  // 図面枠(用紙)が存在する場合は、その四隅も基準に含めることで、原点が必ず用紙の
  // 左下隅に来るようにする(AutoCADの一般的な図面枠配置の流儀により合致する)。
  if(state.frameObj){
    const fr=state.frameObj;
    const W=fr.wMM*fr.sc, H=fr.hMM*fr.sc;
    ext(0,0); ext(W,-H);
  }
  if(minX>maxX){minX=0;minY=-297;maxX=420;maxY=0;}
  // 【原点シフト】インポート図面はページ中央付近が座標原点(0,0)になっていることが多く、
  // TrueViewで開くとUCS原点マーカーが図面の真ん中に重なって見づらい(AutoCAD本体なら
  // パンすれば済むが、TrueViewでは扱いにくいとの指摘 2026-07-23)。元の図面データ自体は
  // 一切変更せず、DXF書き出し時のみ全図形を平行移動し、バウンディングボックスの左下隅が
  // 原点(0,0)に来るようにする(AutoCADの一般的な図面枠配置の流儀に合わせる)。
  // チェックボックス「原点シフト」でon/off可能(既定on)。offなら元の絶対座標のまま出力。
  const shiftOn = (typeof state !== 'undefined' && state.dxfOriginShift === false) ? false : true;
  const offX = shiftOn ? -minX : 0, offY = shiftOn ? -minY : 0;
  const cx=(shiftOn ? (maxX-minX)/2 : (minX+maxX)/2).toFixed(2), cy=(shiftOn ? (maxY-minY)/2 : (minY+maxY)/2).toFixed(2);
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
  const H_LTYPE_TBL    = nh(), H_LTYPE_BYBLOCK=nh(), H_LTYPE_BYLAYER=nh(), H_CONT=nh(), H_DASHED=nh(), H_DOT=nh(), H_DDOT=nh();
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
  // カスタムシンボル(登録済みシンボル)用。BLOCKS/BLOCK_RECORDの定義が
  // 標準(JIS)シンボルにしか無く、INSERTが存在しないブロックを参照していた
  // (実体のないブロック参照でTrueViewが構造を追えなくなる致命的な不具合)。
  // 標準シンボルと同じ方式でカスタムシンボルにも定義を追加する(2026-08-02)。
  const customSyms = (typeof state !== 'undefined' && state.customSymbols) ? state.customSymbols : [];
  const custBlkRecH = customSyms.map(()=>nh());
  const H_MDL_BLK      = nh(), H_MDL_EBLK  = nh();
  const H_PPR_BLK      = nh(), H_PPR_EBLK  = nh();
  const symBlkH        = SYM_NAMES.map(()=>({b:nh(),e:nh()}));
  const custBlkH       = customSyms.map(()=>({b:nh(),e:nh()}));

  // ================================================================
  // HEADER
  // ================================================================
  // 診断用: 出力日時をコメント(999)として埋め込む。999はDXF仕様上「コメント」
  // 専用のグループコードで、全てのビューア(TrueView含む)が無条件に無視するため、
  // 図面には一切影響しない。「本当に今エクスポートし直したファイルか」を
  // ファイルの中身だけで確認できるようにするための目印(2026-08-02追加)。
  p(999, `ECAD_EXPORT_AT:${new Date().toISOString()}`);
  p(0,'SECTION', 2,'HEADER');
  p(9,'$ACADVER',     1,'AC1015');
  p(9,'$DWGCODEPAGE',  3,'ANSI_932'); // 日本語(Shift-JIS/cp932)。encodeSJISでのバイト出力とセット
  p(9,'$HANDSEED',    5,'__HANDSEED__');
  p(9,'$INSUNITS',   70, 4);  // mm
  p(9,'$MEASUREMENT',70, 1);  // メートル法
  p(9,'$EXTMIN',     10,(shiftOn?0:minX).toFixed(3), 20,(shiftOn?0:minY).toFixed(3), 30,'0.0');
  p(9,'$EXTMAX',     10,(shiftOn?maxX-minX:maxX).toFixed(3), 20,(shiftOn?maxY-minY:maxY).toFixed(3), 30,'0.0');
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
  // 【本命修正】AutoCAD/TrueViewはLTYPEテーブルに既定の"ByBlock"・"ByLayer"エントリが
  // 必須(実体を持たない特殊エントリだが、無いと「既定エントリByLayerがありません」で読込拒否)。
  // 元図.DXFの実データで確認: ByBlock/ByLayer/Continuousの順で並ぶ。テーブル数(70)も6に変更。
  p(0,'TABLE', 2,'LTYPE', 5,H_LTYPE_TBL, 100,'AcDbSymbolTable', 70,6);
  function ltype(h,name,desc,pat,elem){
    p(0,'LTYPE', 5,h, 100,'AcDbSymbolTableRecord', 100,'AcDbLinetypeTableRecord');
    p(2,name, 70,0, 3,desc, 72,65, 73,elem||0, 40,pat||'0.0');
  }
  ltype(H_LTYPE_BYBLOCK, 'ByBlock', '');
  ltype(H_LTYPE_BYLAYER, 'ByLayer', '');
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
    ...(typeof LAYERS !== 'undefined' ? LAYERS : []).map(l=>({n:dxfLayer(l.name),c:hexToACI(l.color)}))
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
  p(0,'TABLE', 2,'LAYER', 5,H_LAYER_TBL, 100,'AcDbSymbolTable', 70,allLayers.length);
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
  // 【文字化け修正】フォント未指定(3='', 4='')だと、AutoCAD/TrueViewは代替のSHXフォント
  // (日本語グリフを持たない)で表示するため文字化けする。元図.DXFの実データを確認したところ、
  // TrueTypeフォント名(arial.ttf)+XDATA(1001 ACAD/1000 Arial/1071 34)で、Windows側の
  // フォントリンク機構によりShift-JIS文字を正しくレンダリングさせる構成だった。同じ値を採用。
  p(2,'STANDARD', 70,0, 40,'0.0', 41,'1.0', 50,'0.0', 71,0, 42,'2.5', 3,'arial.ttf', 4,'');
  p(1001,'ACAD', 1000,'Arial', 1071,34);
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
  // 【本命修正】DIMSTYLEテーブルだけは他テーブル(VPORT/LAYER/STYLE等)と異なり、
  // 通常のAcDbSymbolTableに加えて追加のサブクラスマーカー"100 AcDbDimStyleTable"が必須。
  // 元図.DXFの実データで確認(TrueViewエラー「クラス AcDbDimStyleTableのクラスセパレータが必要」で発覚)。
  p(0,'TABLE', 2,'DIMSTYLE', 5,H_DIMST_TBL, 100,'AcDbSymbolTable', 70,1, 100,'AcDbDimStyleTable');
  // 【真の本命修正】DIMSTYLEの個々のテーブルエントリは、他の全テーブル(LAYER/STYLE等)が使う
  // group code 5(ハンドル)ではなく、group code 105を使う仕様(DXFリファレンスで明記、
  // 元図.DXFの実データでも確認: 105,ハンドル値)。前回のAcDbDimStyleTableマーカー追加だけでは
  // 直らず、TrueViewが同じ行番号で同じエラーを出し続けた真因はこちら。
  p(0,'DIMSTYLE', 105,H_DIMST_STD, 330,H_DIMST_TBL, 100,'AcDbSymbolTableRecord', 100,'AcDbDimStyleTableRecord');
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
  p(0,'TABLE', 2,'BLOCK_RECORD', 5,H_BLKREC_TBL, 100,'AcDbSymbolTable', 70, 2+SYM_NAMES.length+customSyms.length);
  p(0,'BLOCK_RECORD', 5,H_BLKREC_MDL, 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,'*MODEL_SPACE',  70,0);
  p(0,'BLOCK_RECORD', 5,H_BLKREC_PPR, 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,'*PAPER_SPACE', 70,0);
  SYM_NAMES.forEach((name,i)=>{
    p(0,'BLOCK_RECORD', 5,symBlkRecH[i], 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,name, 70,0);
  });
  customSyms.forEach((s,i)=>{
    p(0,'BLOCK_RECORD', 5,custBlkRecH[i], 100,'AcDbSymbolTableRecord', 100,'AcDbBlockTableRecord', 2,s.type, 70,0);
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

  // カスタムシンボル(登録済みシンボル)のBLOCK定義。
  // cS.shapes(L/C/A/R/P/T)を、標準シンボルと同じbL/bC/bA/bR/bTヘルパーで描画する。
  function bP(pts,closed){
    for(let k=0;k<pts.length-1;k++) bL(pts[k][0],pts[k][1],pts[k+1][0],pts[k+1][1]);
    if(closed && pts.length>2) bL(pts[pts.length-1][0],pts[pts.length-1][1],pts[0][0],pts[0][1]);
  }
  customSyms.forEach((s,i)=>{
    p(0,'BLOCK', 5,custBlkH[i].b, 100,'AcDbEntity', 8,'0', 100,'AcDbBlockBegin', 2,s.type, 70,0, 10,'0.0', 20,'0.0', 30,'0.0', 3,s.type, 1,'');
    (s.shapes||[]).forEach(sh=>{
      if(sh.t==='L') bL(sh.x1,sh.y1,sh.x2,sh.y2);
      else if(sh.t==='C') bC(sh.cx,sh.cy,sh.r);
      else if(sh.t==='A') bA(sh.cx,sh.cy,sh.r,sh.sa,sh.ea);
      else if(sh.t==='R') bR(sh.x,sh.y,sh.x+sh.w,sh.y+sh.h);
      else if(sh.t==='P' && sh.pts && sh.pts.length>1) bP(sh.pts, sh.cl);
      else if(sh.t==='T') bT(sh.x,sh.y,sh.fs||14,sh.text||'');
    });
    p(0,'ENDBLK', 5,custBlkH[i].e, 100,'AcDbEntity', 8,'0', 100,'AcDbBlockEnd');
  });

  p(0,'ENDSEC'); // BLOCKS end

  // ================================================================
  // ENTITIES
  // ================================================================
  p(0,'SECTION', 2,'ENTITIES');

  // エンティティ出力ヘルパー（全てサブクラスマーカー付き）
  // 原点シフト用ヘルパー(X: 生値+offX、Y: 反転後の値+offY)
  const fx = v => (v+offX).toFixed(3);
  const fy = v => (-v+offY).toFixed(3);
  // 【本命修正】画面(draw.js)ではel.lineStyle/w.lineStyle('dash'/'dot'/'dashdot')で
  // 個々の線を破線・点線・一点鎖線にできる(applyLineStyle)のに、DXF出力はこれを一切
  // 参照しておらず、全ての線がBYLAYER(実質CONTINUOUS)で出力されていた。盛田さんの図面では
  // fline要素(配線エリアを囲む一点鎖線の枠など)がdashdot/dotで10本あり、これらが
  // 全部実線に化けていた(2026-08-03)。element/wireのlineStyleをDXF線種名に変換して
  // 各エンティティに明示的に付与する。
  const LT_MAP = {dash:'DASHED',dashed:'DASHED',dot:'DOT',dotted:'DOT',dashdot:'DASHDOT'};
  function resolveLT(styleVal){ return styleVal ? (LT_MAP[styleVal]||null) : null; }
  function eLine(layer,x1,y1,x2,y2,lt){
    p(0,'LINE',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbLine');
    if(lt) p(6,lt);
    p(10,fx(x1),20,fy(y1),30,'0.0',
      11,fx(x2),21,fy(y2),31,'0.0');
  }
  function eCircle(layer,cx,cy,r,lt){
    p(0,'CIRCLE',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbCircle');
    if(lt) p(6,lt);
    p(10,fx(cx),20,fy(cy),30,'0.0',40,r.toFixed(3));
  }
  // 塗りつぶし円(配線分岐点のjunction用、および端子台の背景マスク用)。CIRCLEエンティティは
  // 輪郭のみで塗り潰されないため、画面(drawJunctionEl)の「塗りつぶし丸」「白丸(背景色で塗って
  // 輪郭のみ描く)」を再現するにはHATCH(単色塗り)が必要。
  // colorCode省略時はBYLAYER(他エンティティと同じ)、指定時はgroup62で個別色を出す
  // (端子台の背景マスクは常に白= ACI7 固定。ACI7は表示背景の白/黒を自動反転するため、
  //  通常の白紙面(印刷/TrueView既定)では白マスクとして機能し、下を通る配線を隠す)。
  // node.js+ezdxfでHATCH(ArcEdge境界・solid_fill)がエラーなくパースされることを検証済み(2026-08-07)。
  function eFilledCircle(layer,cx,cy,r,colorCode){
    p(0,'HATCH',5,nh(),100,'AcDbEntity',8,layer);
    if(colorCode!==undefined) p(62,colorCode);
    p(100,'AcDbHatch');
    p(10,'0.0',20,'0.0',30,'0.0');
    p(210,'0.0',220,'0.0',230,'1.0');
    p(2,'SOLID');
    p(70,1,71,0,91,1,92,1,93,1,72,2);
    p(10,fx(cx),20,fy(cy),40,r.toFixed(3),50,'0',51,'360');
    p(73,1,97,0,75,1,76,1,98,0);
  }
  function eArc(layer,cx,cy,r,sa,ea,lt){
    p(0,'ARC',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbCircle');
    if(lt) p(6,lt);
    p(10,fx(cx),20,fy(cy),30,'0.0',40,r.toFixed(3),
      100,'AcDbArc',50,sa.toFixed(3),51,ea.toFixed(3));
  }
  // 【本命修正】DXFのTEXT高さ(グループコード40)はAutoCAD等では「大文字の高さ(cap height)」
  // として解釈される(DXFリファレンス/ezdxf公式ドキュメントで明記)。一方、画面(draw.js/frame.js)の
  // ctx.font="11px sans-serif"のような指定はCSSのフォントサイズ=em(全角の高さ)であり、
  // 一般的なフォント(Arial等)ではcap heightはemの7割程度しかない。この差を補正せずDXF側の
  // 高さにそのまま画面のフォントサイズ値を使っていたため、TrueView等で開くと画面より
  // 文字が一回り大きく見えていた(盛田さんの「全体的に文字が大きめ」指摘、2026-08-03)。
  // Arial相当のcap-height/em比(約0.72)を全テキスト共通で掛けて補正する。
  const CAP_RATIO = 0.72;
  function eText(layer,x,y,h,str,rot,align){
    if(!str) return;
    const u=toUnicodeDXF(str);
    // alignは水平方向の揃え(DXFグループコード72): 0=左,1=中央,2=右。
    // 省略時は従来通り中央(1)のまま(他の呼び出し元の見た目を変えないため)。
    const hj = align===undefined ? 1 : ({left:0,center:1,right:2}[align] ?? 1);
    const dh = (Number(h)||0) * CAP_RATIO;
    p(0,'TEXT',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbText',
      10,fx(x),20,fy(y),30,'0.0',40,String(dh),1,u);
    if(rot) p(50,String(rot));
    p(7,'STANDARD',72,hj,11,fx(x),21,fy(y),31,'0.0',100,'AcDbText',73,0);
  }
  function eSolid(layer,x,y,ux,uy,a){
    // 寸法矢印（SOLID→AcDbTrace）
    const h=Math.hypot(ux,uy);if(h<1e-9)return;
    const ax=ux/h,ay=uy/h,nx=-ay*a*0.3,ny=ax*a*0.3;
    p(0,'SOLID',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbTrace',
      10,fx(x         ),20,fy(y         ),30,'0.0',
      11,fx(x+ax*a+nx ),21,fy(y+ay*a+ny ),31,'0.0',
      12,fx(x+ax*a-nx ),22,fy(y+ay*a-ny ),32,'0.0',
      13,fx(x+ax*a    ),23,fy(y+ay*a    ),33,'0.0');
  }
  function eRect(layer,x,y,w,h,lt){
    eLine(layer,x,y,x+w,y,lt);eLine(layer,x+w,y,x+w,y+h,lt);
    eLine(layer,x+w,y+h,x,y+h,lt);eLine(layer,x,y+h,x,y,lt);
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
    const T=(x,y,h,s,align)=>eText('FRAME',x,y,h,s,0,align);
    L(0,0,W,0);L(W,0,W,H);L(W,H,0,H);L(0,H,0,0);
    L(MGpx,MGpx,MGpx+iW,MGpx);L(MGpx+iW,MGpx,MGpx+iW,MGpx+iH);
    L(MGpx+iW,MGpx+iH,MGpx,MGpx+iH);L(MGpx,MGpx+iH,MGpx,MGpx);
    L(MGpx,MGpx+dH,MGpx+iW,MGpx+dH);
    // 【本命修正】表題欄(タイトルブロック)は従来drawno/title/author/company/scale2の5項目だけを
    // 4等分の列に押し込み、フォントサイズもTH*0.3(物理寸法の30%、TH=30mmなら9mm)という、
    // 画面(frame.js)側の固定10px/8pxとは無関係な式を使っていた。「盛田」だけ異様に大きく見えたのはこれが原因。
    // frame.js側のcells[]配列(11項目・相対座標)と全く同じ定義に置き換え、
    // 設備名/承認/日付/Rev/変更履歴/ページも出力されていなかったのであわせて追加する(2026-08-03)。
    const tbY=MGpx+dH;
    const cells=[
      {x:0,   y:0,  w:.25,h:.5,key:'drawno', lbl:'図面番号'},
      {x:.25, y:0,  w:.35,h:.5,key:'title',  lbl:'図面名称'},
      {x:.6,  y:0,  w:.2, h:.5,key:'company',lbl:'会社名'},
      {x:.8,  y:0,  w:.2, h:.5,key:'equip',  lbl:'設備名'},
      {x:0,   y:.5, w:.12,h:.5,key:'author', lbl:'作成'},
      {x:.12, y:.5, w:.12,h:.5,key:'approve',lbl:'承認'},
      {x:.24, y:.5, w:.2, h:.5,key:'date',   lbl:'日付'},
      {x:.44, y:.5, w:.1, h:.5,key:'scale2', lbl:'縮尺'},
      {x:.54, y:.5, w:.06,h:.5,key:'rev',    lbl:'Rev'},
      {x:.6,  y:.5, w:.35,h:.5,key:'chghist',lbl:'変更履歴'},
      {x:.95, y:.5, w:.05,h:.5,key:'_page',  lbl:'ページ'},
    ];
    cells.forEach(c=>{
      const cx=MGpx+c.x*iW, cy=tbY+c.y*TH, cw=c.w*iW, ch=c.h*TH;
      L(cx,cy,cx+cw,cy);L(cx+cw,cy,cx+cw,cy+ch);L(cx+cw,cy+ch,cx,cy+ch);L(cx,cy+ch,cx,cy);
      // 【本命修正】T()がeText()既定の中央揃えのまま呼ばれていたため、画面(frame.js、
      // textAlign='left')と違い、ラベル・値が「セル左端+2〜3」を中心に左右へ広がって見えていた
      // (「図面名称」等がセル中央寄りにズレて見える不具合、盛田さんのスクリーンショットで確認、2026-08-03)。
      T(cx+2,cy+9,8,c.lbl,'left');
      const val = c.key==='_page' ? (fr.page || `${state.currentPage+1} / ${state.pages.length}`) : (fr[c.key]||'');
      if(!val) return;
      // frame.js側は実測(ctx.measureText)でセル幅に収まるよう縮小するが、DXF側は文字幅を
      // 実測できないため文字数からの概算で代用する(変更履歴のみ長文になりうる)。
      let fs=10;
      if(c.key==='chghist'){
        const maxW=cw-6;
        const approx=val.length*fs*0.6;
        if(approx>maxW) fs=Math.max(4, maxW/(val.length*0.6));
      }
      T(cx+3, cy+ch-5, fs, val, 'left');
    });
    // 【本命修正】列の目盛り線(下側)がMGpx+dH(表題欄の"上端")を起点にしていたため、
    // 表題欄の高さ全体を貫通する余計な縦線になり、11セットのタイトル欄が線で
    // ズタズタに分断されて見えていた(盛田さんの「表題欄がほぼ壊れている」指摘、2026-08-03)。
    // 画面(frame.js)はMGpx+innerH(内枠の下端=表題欄の"下端")を起点にしており、
    // 表題欄の外(下余白のみ)にしか引かれない。同じ基準点(iH)に合わせる。
    if(cols>0){const cw=iW/cols;for(let c=1;c<cols;c++){L(MGpx+c*cw,0,MGpx+c*cw,MGpx);L(MGpx+c*cw,MGpx+iH,MGpx+c*cw,H);}
      for(let c=0;c<cols;c++)T(MGpx+c*(iW/cols)+(iW/cols)/2,MGpx*0.6,6,String.fromCharCode(65+c));}
    if(rows>0){const rh=dH/rows;for(let r=1;r<rows;r++){L(0,MGpx+r*rh,MGpx,MGpx+r*rh);L(MGpx+iW,MGpx+r*rh,W,MGpx+r*rh);}
      for(let r=0;r<rows;r++){T(MGpx/2,MGpx+r*(dH/rows)+(dH/rows)/2,6,String(r+1));T(MGpx+iW+MGpx/2,MGpx+r*(dH/rows)+(dH/rows)/2,6,String(r+1));}}
  }

  // 配線
  wires.forEach(w=>{
    const layer=dxfLayer(w.layer||'配線');
    const lt=resolveLT(w.lineStyle);
    const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
    for(let i=0;i<pts.length-1;i++) eLine(layer,pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y,lt);
    // 【本命修正】線番号の位置式が画面(draw.js)と全く別物だった。従来は単純にmp.y-8という、
    // 配線の向きを一切考慮しない固定オフセットで、縦方向の配線(今回のラダー図のような回路)では
    // 線番号が隣接する接点のデバイス名と同じY方向にずれるため重なって表示されていた
    // (盛田さんのスクリーンショットで「01PB2」等の重なりとして発覚、2026-08-03)。
    // draw.js同様、配線に垂直な方向(常に画面上側)へfs+6だけオフセットする式に合わせる。
    if(w.wireNo){
      const n=pts.length;
      const i=Math.floor((n-1)/2), j=Math.ceil((n-1)/2);
      const mp = n>=2 ? {x:(pts[i].x+pts[j].x)/2, y:(pts[i].y+pts[j].y)/2} : pts[0];
      let nx=0, ny=-1;
      if(n>=2){
        const dx=pts[j].x-pts[i].x, dy=pts[j].y-pts[i].y;
        const len=Math.hypot(dx,dy);
        if(len>0.1){ nx=-dy/len; ny=dx/len; if(ny>0){nx=-nx;ny=-ny;} }
      }
      const fs=w.wireNoFs||10; // 画面側のデフォルト値(10)に合わせる(旧DXF側は8でずれていた)
      const off=fs+6;
      const tx=mp.x+nx*off+(w.wireNoOffX||0);
      const ty=mp.y+ny*off+(w.wireNoOffY||0);
      eText(layer,tx,ty,fs,w.wireNo);
    }
  });

  // 要素
  elements.forEach(el=>{
    const layer=dxfLayer(el.layer||'回路');
    const lt=resolveLT(el.lineStyle);
    if(el.type==='dim') return;
    if(el.type==='fline'){
      eLine(layer,el.x1,el.y1,el.x2,el.y2,lt);
    } else if(el.type==='rect'){
      eRect(layer,el.x,el.y,el.w||0,el.h||0,lt);
    } else if(el.type==='circle'){
      eCircle(layer,el.x,el.y,el.r||0,lt);
    } else if(el.type==='arc'){
      // 【弧の向き】Canvas(Y下向き)のccw=false=角度増加スイープは、Y反転後のDXF空間(Y上向き)
      // では時計回りになる。DXF ARCは常にCCW(50→51)なので ccw=false のとき start/end を入れ替える。
      // ※旧実装は条件が逆(if(el.ccw)でswap)で、全ケースで補角側の弧が出力されていた。
      //   matplotlib数値検証(8ケース: 1/4円・半円・0°跨ぎ・優弧・狭角×ccw両値)で修正版の一致を確認済み(2026-07-21)。
      let sa=dxfAng(el.startA||0),ea=dxfAng(el.endA||0);
      if(!el.ccw){const t=sa;sa=ea;ea=t;}
      eArc(layer,el.x,el.y,el.r||0,sa,ea,lt);
    } else if(el.type==='junction'){
      // 画面(drawJunctionEl)と同じ区別: 既定(dot=配線分岐点)は塗りつぶし丸、
      // circle/dbl(端子台の端子)は背景色塗り+輪郭のみ(=見た目は白丸のまま、DXFでも輪郭のみでよい)。
      const jStyle = el.style || 'dot';
      if (jStyle === 'dot') {
        eFilledCircle(layer,el.x,el.y,el.r||5);
      } else {
        // 端子台の端子: 画面(drawJunctionEl)は背景色で塗ってから輪郭を描くことで、
        // 下を通る配線を隠して「白丸」に見せている。DXF側もHATCH(白=ACI7)で
        // 同じマスクを先に描いてから輪郭(eCircle)を重ねる。これが無いと配線が
        // 円の中に透けて見えてしまう(2026-08-07 盛田さん報告)。
        eFilledCircle(layer,el.x,el.y,el.r||5,7);
        eCircle(layer,el.x,el.y,el.r||5);
        if(jStyle==='dbl') eCircle(layer,el.x,el.y,(el.r||5)*0.55);
      }
      if(el.label && el.style!=='dot') eText(layer,el.x+(el.r||5)+4+(el.labelOffX||0),el.y+(el.labelOffY||0),11,el.label);
      // デバイス表示(端子台のTB1等)。draw.jsのdrawJunctionElと同じ条件・位置式
      // (state.showPartRef && !dot)。従来DXF出力に一切存在せず、画面には出るのに
      // DXFに出ないというギャップの一因だった(2026-08-03)。
      if(state.showPartRef && el.partRef && el.style!=='dot'){
        eText(layer, el.x+(el.devOffX||0), el.y-(el.r||5)-6+(el.devOffY||0), 10, el.partRef);
      }
    } else if(el.type==='triangle'){
      eLine(layer,el.x1,el.y1,el.x2,el.y2);
      eLine(layer,el.x2,el.y2,el.x3,el.y3);
      eLine(layer,el.x3,el.y3,el.x1,el.y1);
    } else if(el.type==='text'){
      // 【本命修正】draw.jsのdrawTextEl()はctx.fillText(line,el.x,...)で左揃え(canvas既定)
      // で描画しているのに、DXF側は引数省略でeText()の既定値である中央揃え(72=1)のまま
      // 出力していた。文字幅の半分だけ左にズレる形になり、「3相 AC200V」等の見出しで
      // ズレが目立っていた(2026-08-03)。左揃え指定+複数行対応(fs*1.4間隔)をdraw.jsに合わせる。
      const fs=el.fs||14, lineH=fs*1.4;
      String(el.text||'').split('\n').forEach((ln,i)=>{
        eText(layer, el.x, el.y+i*lineH, fs, ln, 0, 'left');
      });
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
      p(0,'INSERT',5,nh(),100,'AcDbEntity',8,layer,100,'AcDbBlockReference');
      // 【致命的バグ修正】ここだけ他の全エンティティ(線・円・弧・文字)と違って
      // fx()/fy()(原点シフト補正)を経由せず、el.x/el.yの生値をそのまま書き出していた。
      // ラベル・partRef・配線・フレームは全部fx/fy経由で正しくシフトされるため、
      // シンボル本体だけが原点シフト量(このファイルでは約453)だけズレて、
      // 対応するラベルや配線から大きく離れた位置(フレーム外)に飛び出して見えていた。
      // モーターや行4の接点シンボル群が枠外に表示されていた根本原因はこれ(2026-08-03、
      // 盛田さんが提供したJSONの実データ(el.x:380,el.y:181)とDXF出力座標(-181、シフト前)を
      // 突き合わせて特定)。
      p(2,el.type,10,fx(el.x),20,fy(el.y),30,'0.0');
      // 【バグ修正 2026-08-09】回転角と反転がDXFに正しく出ていなかった。
      // (1) 回転角: BLOCK内容・INSERT位置ともyを反転(fy=-y)して出力しているため、
      //     y反転座標系では回転の向きも逆になる。数式では M∘R(θ)∘M⁻¹ = R(-θ)。
      //     従来は+θのまま書いていたため、90/270度回転のシンボルは正解から180度
      //     ズレた向きで出ていた(左右対称な接点記号では見た目が同じになるため
      //     長期間気付かれなかった。ブロック内に文字や非対称形状があると分かる)。
      // (2) 反転: el.flipH/flipVを一切出力していなかった。DXFではxscale(41)/yscale(42)を
      //     負にすることでミラーを表現する(flipHはブロックローカルx反転=41を負に、
      //     flipVは同様に42を負に。yはBLOCK定義時に既に反転済みなので追加の符号操作は不要)。
      // 画面描画(drawSym: translate→rotate→flip)との一致は全rot×flip組み合わせで数値検証済み。
      const rotD=((360-(el.rot||0))%360);
      const sxI=el.flipH?-sc:sc, syI=el.flipV?-sc:sc;
      p(50,String(rotD),41,String(sxI),42,String(syI),43,'1.0');
      // 仕様(ラベル)はINSERTのATTRIB(ブロック属性)としてではなく、
      // 独立したTEXT実体(eText、寸法文字・線番と同じ実績のある形式)として出力する。
      // ATTRIB+ATTDEF+SEQEND+オーナー参照(330)という一式の組み合わせを何度整えても
      // TrueViewで「SEQENDの開始でオブジェクトの作成が終了していない」というエラーが
      // 解消しなかったため(2026-08-02)、ATTRIB機構自体の使用をやめた。
      // 位置はキャンバス描画(draw.js)と同じ計算式で求める。
      // 【本命修正】labelのデフォルト縦位置はdraw.js側ではsc(シンボル倍率)を掛けているのに
      // ここでは掛けていなかった(d.h/2+15)。等倍以外(カスタムシンボルは0.3倍等が多い)で
      // 画面とDXFの位置がズレる原因だったため、draw.jsと同じ式(d.h*sc/2+15*sc)に合わせる(2026-08-03)。
      // 【本命修正】複数行の仕様(例: "NV32-SV 3P\n30AF/30AT 30mA")は、従来DXF出力時だけ
      // 半角スペースで1行に強制結合していた。画面(draw.js)では各行を等間隔(fs*1.25)で
      // 縦に並べ、揃え(labelAlign)もそのまま反映しているのに、DXFだけ1行に潰れて詰まった
      // 見た目になっていた(盛田さんのスクリーンショットでMCCB1/MCCB2/MC1の仕様が
      // 1行化しているのを確認、2026-08-03)。draw.jsと同じ行分割・行間・揃えに合わせる。
      // 【2026-08-17】位置(オフセット)はシンボルの回転(el.rot)と連動しない固定位置に変更。
      // 文字の向きはel.textRot(デバイス/型式/仕様で共通、シンボル回転とは独立)で指定する。
      // DXFはy軸を反転して出力する(fy=-y)ため、その座標系では回転の向きも反転する
      // (INSERT回転の修正 d57c3c0 と同じ理由)。TEXT側でも同じ符号補正(360-角度)をかける。
      if(el.label){
        const lox=el.labelOffX||0, loy=el.labelOffY||(d.h*sc/2+15*sc);
        const fs = el.labelFs||11;
        const lh = Math.round(fs*1.25);
        const lines = String(el.label).split('\n');
        const textRot = el.textRot ? (360 - el.textRot) % 360 : 0;
        lines.forEach((ln,i)=>{
          if(!ln) return;
          eText(layer, el.x+lox, el.y+loy+i*lh, fs, ln, textRot, el.labelAlign||'center');
        });
      }
      // 【新規】型式(partModel)。draw.jsのdrawSymEl内の型式表示ブロックと同じ位置式。
      // el.showModelがtrueの要素だけ描く(3極品等で同じデバイスの表示重複を避けるため)。
      // 位置は固定オフセット(シンボル回転に連動しない)。文字の向きはel.textRotで指定。
      if(el.showModel && el.partModel){
        const mfs = el.modelFs || el.labelFs || 11;
        const base = el.labelOffY!=null ? el.labelOffY : (d.h*sc/2 + 15*sc);
        const mlox = el.modelOffX!==undefined ? el.modelOffX : (el.labelOffX||0);
        const lblLines = el.label ? String(el.label).split('\n').length : 0;
        const lblFs = el.labelFs||11;
        const mloy = el.modelOffY!==undefined ? el.modelOffY
                   : base + (lblLines ? (lblLines-1)*Math.round(lblFs*1.25) + mfs + 3 : 0);
        const mTextRot = el.textRot ? (360 - el.textRot) % 360 : 0;
        eText(layer, el.x+mlox, el.y+mloy, mfs, el.partModel, mTextRot);
      }
      // 【新規】デバイス表示(partRef、例: MCCB1/MC1/TH1/PB1等)。従来DXF出力に
      // 一切存在せず、画面には常に見えているのにDXFに変換すると消える最大の原因だった
      // (2026-08-03、盛田さんのスクリーンショットで判明)。draw.jsのdrawSymEl/drawJunctionElと
      // 同条件(state.showPartRef && !devHide)・同位置式で出力する。
      // 位置は固定オフセット(シンボル回転に連動しない)。文字の向きはel.textRotで指定。
      if(state.showPartRef && el.partRef && !el.devHide){
        const dfs = el.devFs || 11;
        const dx = el.devOffX || 0;
        const dy = el.devOffY!==undefined ? el.devOffY : -(d.h*sc/2 + 6);
        const dTextRot = el.textRot ? (360 - el.textRot) % 360 : 0;
        eText(layer, el.x+dx, el.y+dy, dfs, el.partRef, dTextRot);
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
