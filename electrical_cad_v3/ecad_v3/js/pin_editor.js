// ================================================================
// pin_editor.js — 既存カスタムシンボルへの端子(terminals)編集ツール
//
// 【背景】
// cS.terminals（{x,y}配列, ローカル座標）は既に snap.js で配線スナップに
// 使われている実在の仕組みだが、ライブラリ(Newcom DXF)から取り込んだ
// シンボルは symbol_lib.js 側で常に terminals:[] (空)のまま登録されるため、
// 実務で使うシンボルには端子が一つも定義されていなかった。
// このファイルは、登録済みの任意のカスタムシンボルについて、
//   1) 開放端(他の線と繋がっていない線端)の自動候補提示
//   2) クリックでの手動追加/削除
// によって cS.terminals を編集・保存するための独立したツール。
//
// 既存の「自作シンボル登録」(_srShapes/_srTerms, ui.js)とは別系統。
// シンボルの図形(shapes)自体は一切変更せず、terminalsのみを読み書きする。
// ================================================================

let _peType   = null;
let _peShapes = [];
let _peTerms  = [];
let _peZoom   = 1;
let _peCX     = 160;
let _peCY     = 130;

// ---- 図形描画（symbol_lib.js のプレビュー描画と同じ形式に対応: L/C/A/P/R/T） ----
function peDrawShape(c, s, T, TY) {
  c.save(); c.strokeStyle = '#222'; c.fillStyle = '#222'; c.lineWidth = 1.5;
  if (s.t === 'L') {
    c.beginPath(); c.moveTo(T(s.x1), TY(s.y1)); c.lineTo(T(s.x2), TY(s.y2)); c.stroke();
  } else if (s.t === 'C') {
    c.beginPath(); c.arc(T(s.cx), TY(s.cy), Math.max(1, s.r * _peZoom), 0, Math.PI * 2); c.stroke();
  } else if (s.t === 'A') {
    c.beginPath(); c.arc(T(s.cx), TY(s.cy), Math.max(1, s.r * _peZoom), s.sa * Math.PI / 180, s.ea * Math.PI / 180, false); c.stroke();
  } else if (s.t === 'P' && s.pts && s.pts.length) {
    c.beginPath(); c.moveTo(T(s.pts[0][0]), TY(s.pts[0][1]));
    for (let k = 1; k < s.pts.length; k++) c.lineTo(T(s.pts[k][0]), TY(s.pts[k][1]));
    if (s.cl) c.closePath();
    c.stroke();
  } else if (s.t === 'R') {
    c.strokeRect(T(s.x), TY(s.y), s.w * _peZoom, s.h * _peZoom);
  } else if (s.t === 'T') {
    c.font = `${(s.fs || 14) * _peZoom / 2}px sans-serif`; c.textAlign = 'center';
    c.fillText(s.text, T(s.x), TY(s.y));
  }
  c.restore();
}

// ---- バウンディングボックス計算(L/C/A/P/R対応) ----
function peCalcBBox(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach(s => {
    if (s.t === 'L') {
      minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2);
    } else if (s.t === 'C' || s.t === 'A') {
      minX = Math.min(minX, s.cx - s.r); maxX = Math.max(maxX, s.cx + s.r);
      minY = Math.min(minY, s.cy - s.r); maxY = Math.max(maxY, s.cy + s.r);
    } else if (s.t === 'P' && s.pts) {
      s.pts.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    } else if (s.t === 'R') {
      minX = Math.min(minX, s.x, s.x + s.w); maxX = Math.max(maxX, s.x, s.x + s.w);
      minY = Math.min(minY, s.y, s.y + s.h); maxY = Math.max(maxY, s.y, s.y + s.h);
    }
  });
  if (!isFinite(minX)) return { minX: -40, minY: -30, maxX: 40, maxY: 30 };
  return { minX, minY, maxX, maxY };
}

// ---- 開放端(他の線・図形本体と繋がっていない線端)の候補収集 ----
// L(直線)の両端、および非closedなP(ポリライン)の両端が対象。
// 「count===1(他の線端と繋がっていない)」かつ「矩形/円/閉ポリラインの輪郭に
// 接していない(=本体の縁で止まっている内側の点ではない)」点のみを真の開放端とする。
// 例: 抵抗器のリード線(-32,0)-(-18,0)+矩形(-18〜18) の場合、
//     -32,0(自由端)のみ候補になり、-18,0(矩形の縁)は除外される。
function peCollectCandidatePoints(shapes) {
  const EPS = 0.75;
  const pts = [];
  shapes.forEach(s => {
    if (s.t === 'L') {
      pts.push([s.x1, s.y1]); pts.push([s.x2, s.y2]);
    } else if (s.t === 'P' && s.pts && s.pts.length >= 2 && !s.cl) {
      pts.push(s.pts[0]); pts.push(s.pts[s.pts.length - 1]);
    }
  });

  const clusters = [];
  pts.forEach(([x, y]) => {
    const found = clusters.find(c => Math.hypot(c.x - x, c.y - y) < EPS);
    if (found) found.count++;
    else clusters.push({ x, y, count: 1 });
  });

  function touchesBody(x, y) {
    return shapes.some(s => {
      if (s.t === 'R') {
        const inXRange = x >= s.x - EPS && x <= s.x + s.w + EPS;
        const inYRange = y >= s.y - EPS && y <= s.y + s.h + EPS;
        const onVEdge  = inYRange && (Math.abs(x - s.x) < EPS || Math.abs(x - (s.x + s.w)) < EPS);
        const onHEdge  = inXRange && (Math.abs(y - s.y) < EPS || Math.abs(y - (s.y + s.h)) < EPS);
        return onVEdge || onHEdge;
      }
      if (s.t === 'C') {
        return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) < EPS;
      }
      if (s.t === 'P' && s.cl && s.pts && s.pts.length >= 2) {
        for (let k = 0; k < s.pts.length; k++) {
          const a = s.pts[k], b = s.pts[(k + 1) % s.pts.length];
          if (distToSegLocal(x, y, a[0], a[1], b[0], b[1]) < EPS) return true;
        }
      }
      return false;
    });
  }

  return clusters.filter(c => c.count === 1 && !touchesBody(c.x, c.y)).map(c => ({ x: c.x, y: c.y }));
}

// 点と線分の距離(peCollectCandidatePoints内でのみ使用)
function distToSegLocal(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ---- パネルを開く ----
function openPinEditor(type) {
  const cS = (state.customSymbols || []).find(s => s.type === type);
  if (!cS) { alert('シンボルが見つかりません'); return; }
  _peType = type;
  _peShapes = cS.shapes || [];
  _peTerms = JSON.parse(JSON.stringify(cS.terminals || []));

  const cv = document.getElementById('pin-edit-cv');
  const bbox = peCalcBBox(_peShapes);
  const bw = Math.max(1, bbox.maxX - bbox.minX), bh = Math.max(1, bbox.maxY - bbox.minY);
  _peZoom = Math.min((cv.width - 40) / bw, (cv.height - 40) / bh, 6);
  _peCX = cv.width / 2 - (bbox.minX + bbox.maxX) / 2 * _peZoom;
  _peCY = cv.height / 2 - (bbox.minY + bbox.maxY) / 2 * _peZoom;

  const nameEl = document.getElementById('pe-name');
  if (nameEl) nameEl.textContent = cS.name || type;

  openFP('pin-edit-p');
  cv.onmousedown = peOnClick;
  cv.onwheel = e => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    _peZoom = Math.max(0.2, Math.min(10, _peZoom * f));
    peRender();
  };
  peUpdateList();
  requestAnimationFrame(peRender);
}

function peRender() {
  const cv = document.getElementById('pin-edit-cv');
  if (!cv) return;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  const T = v => _peCX + v * _peZoom, TY = v => _peCY + v * _peZoom;
  _peShapes.forEach(s => peDrawShape(c, s, T, TY));
  _peTerms.forEach((t, i) => {
    const px = T(t.x), py = TY(t.y);
    c.fillStyle = '#0067c0'; c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px - 3, py - 3); c.lineTo(px + 3, py + 3); c.stroke();
    c.beginPath(); c.moveTo(px + 3, py - 3); c.lineTo(px - 3, py + 3); c.stroke();
    c.fillStyle = '#0067c0'; c.font = '9px sans-serif'; c.textAlign = 'left';
    c.fillText(`P${i}`, px + 7, py + 3);
  });
}

function peUpdateList() {
  const el = document.getElementById('pe-term-list');
  if (!el) return;
  if (!_peTerms.length) { el.textContent = '（端子点なし）'; return; }
  el.innerHTML = _peTerms.map((t, i) =>
    `<div>P${i}: (${t.x}, ${t.y}) <span onclick="_peTerms.splice(${i},1);peUpdateList();peRender()" style="cursor:pointer;color:var(--red)">×</span></div>`
  ).join('');
}

// クリック: 既存端子の近くなら削除、それ以外は新規追加
function peOnClick(e) {
  const cv = document.getElementById('pin-edit-cv');
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (cv.width / r.width);
  const py = (e.clientY - r.top) * (cv.height / r.height);
  const wx = (px - _peCX) / _peZoom;
  const wy = (py - _peCY) / _peZoom;

  let minD = 10 / _peZoom, minI = -1;
  _peTerms.forEach((t, i) => { const d = Math.hypot(wx - t.x, wy - t.y); if (d < minD) { minD = d; minI = i; } });
  if (minI >= 0) { _peTerms.splice(minI, 1); peUpdateList(); peRender(); return; }

  _peTerms.push({ x: Math.round(wx), y: Math.round(wy) });
  peUpdateList(); peRender();
}

// 自動候補: 開放端を検出してterminalsに追加(既存と近すぎるものは重複スキップ)
function peAutoDetect() {
  const candidates = peCollectCandidatePoints(_peShapes);
  if (!candidates.length) {
    alert('開放端(未接続の線端)が見つかりませんでした。手動でクリックして端子を追加してください。');
    return;
  }
  let added = 0;
  candidates.forEach(cand => {
    const dup = _peTerms.some(t => Math.hypot(t.x - cand.x, t.y - cand.y) < 3);
    if (!dup) { _peTerms.push({ x: Math.round(cand.x), y: Math.round(cand.y) }); added++; }
  });
  peUpdateList(); peRender();
  if (added === 0) alert('候補はすべて既存の端子と重複していました。');
}

function savePinEdits() {
  if (!_peType) return;
  const cS = (state.customSymbols || []).find(s => s.type === _peType);
  if (!cS) { alert('保存対象のシンボルが見つかりません'); closeFP('pin-edit-p'); return; }
  cS.terminals = JSON.parse(JSON.stringify(_peTerms));
  if (typeof DEFS !== 'undefined' && DEFS[_peType]) {
    DEFS[_peType].terminals = cS.terminals.map((t, i) => ({ id: `t${i}`, x: t.x, y: t.y }));
  }
  if (typeof saveSymbolsToStorage === 'function') saveSymbolsToStorage();
  closeFP('pin-edit-p');
  if (typeof draw === 'function') draw();
  alert(`「${cS.name || _peType}」の端子(${cS.terminals.length}点)を保存しました。`);
}

function cancelPinEdit() {
  closeFP('pin-edit-p');
}
