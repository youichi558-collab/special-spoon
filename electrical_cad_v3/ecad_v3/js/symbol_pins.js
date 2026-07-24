// ================================================================
// symbol_pins.js — シンボル端子(ピン)データ構造
//
// 【フェーズ0: データ構造のみ】
// これは既存の描画(symbols.js)・保存・DXF入出力・BOM等には一切影響しない
// 追加専用のデータ層。既存図面ファイル・既存シンボルは今まで通り動作する。
//
// 座標系: drawSym()内のローカル座標(シンボル中心=原点、rot/fH/fV適用前)
// drawSym()の実際の描画コード(symbols.js)のリード線終端座標と一致させている。
// ================================================================

// 標準シンボルの端子定義。symbols.js の各 type の描画コードにある
// リード線の外側端点(configの外側の線の端)をピン位置としている。
const SYMBOL_PINS = {
  battery:     [{ id:'1', name:'+',  x:-36, y:0 }, { id:'2', name:'-',  x:36, y:0 }],
  ac:          [{ id:'1', name:'L',  x:-32, y:0 }, { id:'2', name:'N',  x:32, y:0 }],
  ground:      [{ id:'1', name:'E',  x:0,   y:-18 }],
  resistor:    [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  capacitor:   [{ id:'1', name:'1',  x:-27, y:0 }, { id:'2', name:'2',  x:27, y:0 }],
  inductor:    [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  diode:       [{ id:'1', name:'A',  x:-32, y:0 }, { id:'2', name:'K',  x:32, y:0 }],
  sw_no:       [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  timer_no:    [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  timer_nc:    [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  push_no:     [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  sw_nc:       [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  coil:        [{ id:'1', name:'A1', x:-32, y:0 }, { id:'2', name:'A2', x:32, y:0 }],
  timer_coil:  [{ id:'1', name:'A1', x:-32, y:0 }, { id:'2', name:'A2', x:32, y:0 }],
  breaker:     [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  motor:       [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  lamp:        [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  fuse:        [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  transformer: [{ id:'1', name:'1',  x:-32, y:0 }, { id:'2', name:'2',  x:32, y:0 }],
  terminal:    [{ id:'1', name:'1',  x:-20, y:0 }, { id:'2', name:'2',  x:20, y:0 }],
};

// type(標準シンボル)またはカスタムシンボル(state.customSymbols内のcS.pins)から
// ローカル座標系でのピン一覧を返す。定義がなければ空配列(呼び出し側は必ず配列を受け取れる)。
function getSymbolPinsLocal(type) {
  const cS = (typeof state !== 'undefined' && state.customSymbols)
    ? state.customSymbols.find(s => s.type === type)
    : null;
  if (cS) return cS.pins || [];
  return SYMBOL_PINS[type] || [];
}

// ローカル座標のピンを、実際の配置(x,y,rot,fH,fV)に応じたワールド座標へ変換する。
// drawSym() のtransform順序(translate→rotate→scale(fH)→scale(fV))に対応させて
// 逆順(flip適用→rotate→translate)でローカル点を変換している。
function getSymbolPinsWorld(type, x, y, rot, fH, fV) {
  const locals = getSymbolPinsLocal(type);
  const rad = (rot || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return locals.map(p => {
    let lx = p.x, ly = p.y;
    if (fH) lx = -lx;
    if (fV) ly = -ly;
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    return { id: p.id, name: p.name, x: x + rx, y: y + ry };
  });
}
