// ================================================================
// dxf_frame_probe.js — 客先DXFから図面枠の情報を読み取れるか調べる
//
// 客先から支給されるDXFに図面枠の情報(用紙サイズ・区画数など)が
// 入っているかどうかは、実物を見ないと分からない。
// 客先図面は社外に出せないため、この解析は盛田さんのPC内で完結させる。
// 読み込んだ内容はどこにも送信しない。
//
// この機能は「調べるだけ」で、図面には一切手を加えない。
// 解析結果を見てから、図面枠をどう設定するかを判断するためのもの。
// ================================================================

// DXFのHEADERセクションから、図面枠の手がかりになる変数を取り出す。
// $EXTMIN/$EXTMAX : 図形が存在する範囲
// $LIMMIN/$LIMMAX : 作図限界(用紙サイズが入っていることが多い)
// $INSUNITS       : 単位(1=インチ, 4=ミリ など)
// $MEASUREMENT    : 0=インチ系, 1=メートル系
function dfpReadHeader(pairs) {
  const h = {};
  let cur = null, inHeader = false;
  for (let i = 0; i < pairs.length; i++) {
    const { code, val } = pairs[i];
    if (code === 2 && val === 'HEADER') { inHeader = true; continue; }
    if (code === 0 && val === 'ENDSEC') { if (inHeader) break; }
    if (!inHeader) continue;
    if (code === 9) { cur = val; if (!h[cur]) h[cur] = {}; continue; }
    if (!cur) continue;
    if (code === 10) h[cur].x = parseFloat(val);
    if (code === 20) h[cur].y = parseFloat(val);
    if (code === 30) h[cur].z = parseFloat(val);
    if (code === 70 || code === 40) h[cur].v = parseFloat(val);
    if (code === 1)  h[cur].s = val;
  }
  return h;
}

// 用紙サイズの候補。実測値に一番近いものを返す（許容差は5mm）
const DFP_PAPERS = [
  ['A0横', 1189, 841], ['A0縦', 841, 1189],
  ['A1横', 841, 594],  ['A1縦', 594, 841],
  ['A2横', 594, 420],  ['A2縦', 420, 594],
  ['A3横', 420, 297],  ['A3縦', 297, 420],
  ['A4横', 297, 210],  ['A4縦', 210, 297],
  ['B3横', 515, 364],  ['B4横', 364, 257],
];
function dfpGuessPaper(w, h) {
  let best = null, bestDiff = Infinity;
  DFP_PAPERS.forEach(([name, pw, ph]) => {
    const d = Math.abs(w - pw) + Math.abs(h - ph);
    if (d < bestDiff) { bestDiff = d; best = name; }
  });
  return bestDiff <= 10 ? { name: best, diff: bestDiff } : null;
}

// 軸に平行な線分を集める。図面枠は水平線と垂直線でできているため、
// これらの座標を数えると外枠・内枠・区画の区切りが見えてくる。
function dfpCollectLines(pairs) {
  const hor = [], ver = [];   // {p:一定側の座標, a:始点, b:終点, layer}
  let cur = null, type = null;
  const push = () => {
    if (!cur || type !== 'LINE') { cur = null; return; }
    const { x1, y1, x2, y2, layer } = cur;
    if ([x1, y1, x2, y2].some(v => typeof v !== 'number' || !isFinite(v))) { cur = null; return; }
    const tol = 1e-6;
    if (Math.abs(y1 - y2) < tol && Math.abs(x1 - x2) > tol) {
      hor.push({ p: y1, a: Math.min(x1, x2), b: Math.max(x1, x2), layer });
    } else if (Math.abs(x1 - x2) < tol && Math.abs(y1 - y2) > tol) {
      ver.push({ p: x1, a: Math.min(y1, y2), b: Math.max(y1, y2), layer });
    }
    cur = null;
  };
  for (let i = 0; i < pairs.length; i++) {
    const { code, val } = pairs[i];
    if (code === 0) { push(); type = val; if (val === 'LINE') cur = {}; continue; }
    if (!cur) continue;
    if (code === 8)  cur.layer = val;
    if (code === 10) cur.x1 = parseFloat(val);
    if (code === 20) cur.y1 = parseFloat(val);
    if (code === 11) cur.x2 = parseFloat(val);
    if (code === 21) cur.y2 = parseFloat(val);
  }
  push();
  return { hor, ver };
}

// 区画の区切り線を数える。
// 図面枠の区画は「外枠と内枠の間(余白部分)にある短い線」で表される。
// 余白の幅に近い長さの線だけを拾い、その位置の種類数を数えると区画数が推定できる。
function dfpCountZoneTicks(lines, outer, inner) {
  if (!outer || !inner) return null;
  const mgT = Math.abs(inner.y2 - outer.y2);   // 上余白
  const mgL = Math.abs(inner.x1 - outer.x1);   // 左余白
  const near = (v, t, tol) => Math.abs(v - t) <= tol;

  // 上余白にある垂直線 → 列の区切り
  const colXs = [];
  lines.ver.forEach(l => {
    const len = l.b - l.a;
    if (mgT > 0 && near(len, mgT, mgT * 0.5) && l.a >= inner.y2 - mgT * 0.5) {
      if (!colXs.some(x => near(x, l.p, 0.5))) colXs.push(l.p);
    }
  });
  // 左余白にある水平線 → 行の区切り
  const rowYs = [];
  lines.hor.forEach(l => {
    const len = l.b - l.a;
    if (mgL > 0 && near(len, mgL, mgL * 0.5) && l.b <= inner.x1 + mgL * 0.5) {
      if (!rowYs.some(y => near(y, l.p, 0.5))) rowYs.push(l.p);
    }
  });
  return {
    cols: colXs.length ? colXs.length + 1 : null,
    rows: rowYs.length ? rowYs.length + 1 : null,
    colXs: colXs.sort((a, b) => a - b),
    rowYs: rowYs.sort((a, b) => a - b),
  };
}

// 大きな矩形(外枠・内枠)を探す。
// 水平線・垂直線の端点が四隅で一致するものを矩形とみなし、面積が大きい順に返す。
function dfpFindRects(lines) {
  const tol = 1.5;
  const near = (a, b) => Math.abs(a - b) <= tol;
  const rects = [];
  const longHor = lines.hor.filter(l => l.b - l.a > 50);
  const longVer = lines.ver.filter(l => l.b - l.a > 50);
  for (let i = 0; i < longHor.length; i++) {
    for (let j = i + 1; j < longHor.length; j++) {
      const h1 = longHor[i], h2 = longHor[j];
      if (near(h1.p, h2.p)) continue;
      if (!near(h1.a, h2.a) || !near(h1.b, h2.b)) continue;
      const yLo = Math.min(h1.p, h2.p), yHi = Math.max(h1.p, h2.p);
      const left  = longVer.find(v => near(v.p, h1.a) && near(v.a, yLo) && near(v.b, yHi));
      const right = longVer.find(v => near(v.p, h1.b) && near(v.a, yLo) && near(v.b, yHi));
      if (left && right) {
        rects.push({ x1: h1.a, y1: yLo, x2: h1.b, y2: yHi,
                     w: h1.b - h1.a, h: yHi - yLo, area: (h1.b - h1.a) * (yHi - yLo) });
      }
    }
  }
  return rects.sort((a, b) => b.area - a.area);
}

// レイヤー名とブロック名を集める（枠がどのレイヤーに入っているかの手がかり）
function dfpCollectNames(pairs) {
  const layers = new Set(), blocks = new Set();
  let inBlocks = false;
  for (let i = 0; i < pairs.length; i++) {
    const { code, val } = pairs[i];
    if (code === 2 && val === 'BLOCKS') inBlocks = true;
    if (code === 0 && val === 'ENDSEC') inBlocks = false;
    if (code === 8) layers.add(val);
    if (inBlocks && code === 2 && val && !val.startsWith('*')) blocks.add(val);
  }
  return { layers: [...layers], blocks: [...blocks] };
}

// 枠らしいレイヤー名か（インポート時に削除される対象と同じ判定）
function dfpIsFrameLayerName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return name === '図面枠' || n === 'frame' || n === 'border' || n === 'defpoints' || n.startsWith('frame_');
}

// DXFテキストを解析して結果オブジェクトを返す
function analyzeDxfFrame(text) {
  const lines0 = text.split('\n').map(l => l.replace(/\r/g, '').trim());
  const pairs = [];
  for (let i = 0; i < lines0.length - 1; i += 2) {
    const code = parseInt(lines0[i]);
    if (!isNaN(code)) pairs.push({ code, val: lines0[i + 1] });
  }
  const header = dfpReadHeader(pairs);
  const lines = dfpCollectLines(pairs);
  const rects = dfpFindRects(lines);
  const names = dfpCollectNames(pairs);
  const outer = rects[0] || null;
  const inner = rects[1] || null;
  const ticks = dfpCountZoneTicks(lines, outer, inner);

  const ext = (header.$EXTMIN && header.$EXTMAX)
    ? { w: header.$EXTMAX.x - header.$EXTMIN.x, h: header.$EXTMAX.y - header.$EXTMIN.y } : null;
  const lim = (header.$LIMMIN && header.$LIMMAX)
    ? { w: header.$LIMMAX.x - header.$LIMMIN.x, h: header.$LIMMAX.y - header.$LIMMIN.y } : null;

  return {
    isOwnFile: text.includes('ECAD_DXF_V1') || text.includes('ECAD_FRAME'),
    header, ext, lim, outer, inner, ticks, names,
    lineCount: { hor: lines.hor.length, ver: lines.ver.length },
    paperFromExt: ext ? dfpGuessPaper(ext.w, ext.h) : null,
    paperFromLim: lim ? dfpGuessPaper(lim.w, lim.h) : null,
    paperFromRect: outer ? dfpGuessPaper(outer.w, outer.h) : null,
    frameLayers: names.layers.filter(dfpIsFrameLayerName),
  };
}

// 解析結果を読みやすい文字列にする
function dfpFormat(r) {
  const L = [];
  const num = v => (v == null || !isFinite(v)) ? '—' : (Math.round(v * 10) / 10);
  L.push(r.isOwnFile
    ? '【このCADが書き出したDXFです】枠情報が埋め込まれているので、そのまま読み込めば図面枠は復元されます。'
    : '【外部のDXFです】枠情報は埋め込まれていないため、以下から推定します。');
  L.push('');
  L.push('■ ヘッダに入っていた情報');
  if (r.lim) {
    L.push(`  作図限界 ($LIMMIN/$LIMMAX): ${num(r.lim.w)} × ${num(r.lim.h)}`
      + (r.paperFromLim ? `  → ${r.paperFromLim.name} とほぼ一致` : '  → 定型サイズには一致せず'));
  } else {
    L.push('  作図限界 ($LIMMIN/$LIMMAX): 入っていません');
  }
  if (r.ext) {
    L.push(`  図形の範囲 ($EXTMIN/$EXTMAX): ${num(r.ext.w)} × ${num(r.ext.h)}`
      + (r.paperFromExt ? `  → ${r.paperFromExt.name} とほぼ一致` : '  → 定型サイズには一致せず'));
  } else {
    L.push('  図形の範囲 ($EXTMIN/$EXTMAX): 入っていません');
  }
  const unit = r.header.$INSUNITS ? r.header.$INSUNITS.v : null;
  L.push(`  単位 ($INSUNITS): ${unit == null ? '入っていません' : (unit === 4 ? 'ミリ' : unit === 1 ? 'インチ' : unit)}`);
  L.push('');
  L.push('■ 線から見つけた枠');
  L.push(`  軸に平行な線: 水平 ${r.lineCount.hor}本 / 垂直 ${r.lineCount.ver}本`);
  if (r.outer) {
    L.push(`  いちばん外の矩形: ${num(r.outer.w)} × ${num(r.outer.h)}`
      + (r.paperFromRect ? `  → ${r.paperFromRect.name} とほぼ一致` : ''));
  } else {
    L.push('  外枠らしい矩形: 見つかりませんでした');
  }
  if (r.inner) {
    const mg = Math.min(
      Math.abs(r.inner.x1 - r.outer.x1), Math.abs(r.outer.x2 - r.inner.x2),
      Math.abs(r.inner.y1 - r.outer.y1), Math.abs(r.outer.y2 - r.inner.y2));
    L.push(`  内枠: ${num(r.inner.w)} × ${num(r.inner.h)}  (余白 約${num(mg)})`);
  } else {
    L.push('  内枠らしい矩形: 見つかりませんでした');
  }
  L.push('');
  L.push('■ 区画（A・B・C / 1・2・3 の区切り）');
  if (r.ticks && (r.ticks.cols || r.ticks.rows)) {
    L.push(`  推定: ${r.ticks.cols ?? '?'} 列 × ${r.ticks.rows ?? '?'} 行`);
    L.push(`  (余白部分の区切り線を数えた結果です。実際の図面と見比べてください)`);
  } else {
    L.push('  区切り線が見つかりませんでした。区画が無い枠か、線の引き方が想定と違う可能性があります。');
  }
  L.push('');
  L.push('■ レイヤー');
  L.push(`  全 ${r.names.layers.length} 種類`);
  if (r.frameLayers.length) {
    L.push(`  枠用とみなされる名前: ${r.frameLayers.join(', ')}`);
    L.push(`  ※これらのレイヤーの図形は、DXFを読み込むと削除される仕様です`);
  } else {
    L.push('  枠用とみなされる名前(図面枠/frame/border/defpoints)はありません');
    L.push('  → 枠は図形としてそのまま読み込まれます');
  }
  if (r.names.blocks.length) {
    L.push(`  ブロック: ${r.names.blocks.slice(0, 12).join(', ')}${r.names.blocks.length > 12 ? ' ほか' : ''}`);
  }
  return L.join('\n');
}

// 「DXFの枠を調べる」ボタンから呼ばれる。図面には一切手を加えない。
function probeDxfFrame(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const buf = e.target.result;
      const u8 = new Uint8Array(buf);
      // エンコーディング判定は読み込み処理と同じものを使う
      const ascii = String.fromCharCode(...u8.slice(0, Math.min(u8.length, 2000)));
      const isOwn = ascii.includes('ECAD_DXF_V1') || ascii.includes('ECAD_FRAME');
      let enc = 'UTF-8';
      if (!isOwn && !(u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF)) {
        enc = (typeof _detectSjis === 'function') ? _detectSjis(u8) : 'UTF-8';
      }
      let text;
      try { text = new TextDecoder(enc).decode(buf); }
      catch (err) { text = new TextDecoder('UTF-8').decode(buf); }

      const r = analyzeDxfFrame(text);
      const body = `<pre style="white-space:pre-wrap;font-size:11px;line-height:1.6;margin:0">`
        + dfpFormat(r).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
        + `</pre>`;
      const el = document.getElementById('dfp-body');
      if (el) { el.innerHTML = body; openFP('dfp-p'); }
      else { alert(dfpFormat(r)); }
      console.log('[dxf frame probe]', r);
    } catch (err) {
      alert('解析に失敗しました: ' + err.message);
    }
  };
  rd.readAsArrayBuffer(f);
  input.value = '';
}
