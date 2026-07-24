// ================================================================
// conn_check.js — 未接続端子の検出(フェーズ1: 警告表示のみ、図面データは変更しない)
//
// 【設計方針】
// 毎フレーム(draw()のたび)に自動再計算すると大規模図面で重くなるため、
// 「🔍未接続端子チェック」ボタンを押した時だけ計算し、結果を
// state._unconnectedResults にキャッシュする。draw()側はこのキャッシュを
// 描画するだけで、要素を編集しても自動更新はされない(再チェックが必要)。
//
// 「接続されている」の判定は、配線(state.wires)の端点(始点・終点。
// 経由点/曲がり角は対象外)が端子の位置に一定の許容誤差内で
// 重なっているかどうかで行う。snap.js の判定用スナップ座標と同じ考え方。
// ================================================================

const CONN_CHECK_TOL = 5; // 許容誤差(ワールド座標単位)

// 配線の端点を、許容誤差サイズのバケットに分けたMapとして索引化する
function buildWireEndpointIndex(tol) {
  const idx = new Map();
  const bx = x => Math.round(x / tol);
  state.wires.forEach(w => {
    const pts = w.pts || (w.x1 != null ? [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}] : []);
    if (!pts.length) return;
    [pts[0], pts[pts.length - 1]].forEach(p => {
      const key = `${bx(p.x)},${bx(p.y)}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key).push(p);
    });
  });
  return idx;
}

// 全シンボル要素の端子位置を集め、配線端点索引と照合して未接続のものを返す
// 戻り値: [{ elId, termIdx, x, y }]
function findUnconnectedTerminals(tol) {
  tol = tol || CONN_CHECK_TOL;
  const idx = buildWireEndpointIndex(tol);
  const bx = x => Math.round(x / tol);
  const SYM_ONLY_TYPES = ['text','rect','circle','fline','triangle','arc','junction','bezier','dim','angle_dim','leader'];
  const results = [];

  state.elements.forEach(el => {
    if (SYM_ONLY_TYPES.includes(el.type)) return;
    const lay = LAYERS.find(l => l.name === el.layer);
    if (lay && !lay.visible) return;

    const cS  = state.customSymbols.find(s => s.type === el.type);
    const rot = (el.rot || 0) * Math.PI / 180;
    let pins = [];
    if (cS && cS.terminals && cS.terminals.length) {
      pins = cS.terminals.map((t, i) => {
        const rx = t.x * Math.cos(rot) - t.y * Math.sin(rot);
        const ry = t.x * Math.sin(rot) + t.y * Math.cos(rot);
        return { x: el.x + rx, y: el.y + ry, idx: i };
      });
    } else {
      const d  = getDef(el.type) || {};
      const sc = el.scale || 1;
      const hw = (d.w || 0) / 2 * sc;
      pins = [+hw, -hw].map((dx, i) => {
        const rx = dx * Math.cos(rot), ry = dx * Math.sin(rot);
        return { x: el.x + rx, y: el.y + ry, idx: i };
      });
    }

    pins.forEach(p => {
      const pbx = bx(p.x), pby = bx(p.y);
      let found = false;
      for (let dx = -1; dx <= 1 && !found; dx++) {
        for (let dy = -1; dy <= 1 && !found; dy++) {
          const bucket = idx.get(`${pbx + dx},${pby + dy}`);
          if (!bucket) continue;
          for (const q of bucket) {
            if (Math.hypot(q.x - p.x, q.y - p.y) <= tol) { found = true; break; }
          }
        }
      }
      if (!found) results.push({ elId: el.id, termIdx: p.idx, x: p.x, y: p.y });
    });
  });

  return results;
}

// ボタン押下時: 検出を実行し、結果をキャッシュして表示ONにする
function runUnconnectedCheck() {
  const results = findUnconnectedTerminals();
  state._unconnectedResults = results;
  state.showUnconnected = true;
  syncUnconnectedBtn();
  draw();
  if (results.length) {
    alert(`未接続の端子が ${results.length} 箇所見つかりました(オレンジの⚠マーカーで表示中)。\n図面を編集した場合は再度チェックしてください。`);
  } else {
    alert('未接続の端子は見つかりませんでした。');
  }
}

// 表示のON/OFFのみ切り替える(再計算はしない。結果が無ければ先にチェックを走らせる)
function toggleUnconnectedDisp() {
  if (!state.showUnconnected && state._unconnectedResults.length === 0) {
    runUnconnectedCheck();
    return;
  }
  state.showUnconnected = !state.showUnconnected;
  syncUnconnectedBtn();
  draw();
}

function syncUnconnectedBtn() {
  const b = document.getElementById('qb-unconn');
  if (!b) return;
  b.style.background = state.showUnconnected ? 'var(--acc)' : 'var(--bg)';
  b.style.color      = state.showUnconnected ? '#fff' : 'var(--fg)';
  b.style.fontWeight = state.showUnconnected ? '600' : '400';
}
