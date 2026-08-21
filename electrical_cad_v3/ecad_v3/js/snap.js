// ================================================================
// snap.js — スナップ補助関数
// ================================================================

function getAllSnapPoints(wx, wy) {
  // 補助線スナップを最優先チェック
  const gs = guideSnap(wx, wy);
  if (gs) return gs;

  const R = 12 / state.zoom;
  let best = null, bestD = R;

  state.elements.forEach(el => {
    // 円スナップ：中心点＋4方向端点
    if (el.type === 'circle') {
      const pts = [
        { x: el.x,        y: el.y,        snapType: 'endpoint' },  // 中心
        { x: el.x + el.r, y: el.y,        snapType: 'endpoint' },  // 右
        { x: el.x - el.r, y: el.y,        snapType: 'endpoint' },  // 左
        { x: el.x,        y: el.y + el.r, snapType: 'endpoint' },  // 下
        { x: el.x,        y: el.y - el.r, snapType: 'endpoint' },  // 上
      ];
      pts.forEach(p => {
        const d = Math.hypot(wx - p.x, wy - p.y);
        if (d < bestD) { bestD = d; best = p; }
      });
      return;
    }
    // 三角形スナップ：3頂点
    if (el.type === 'triangle') {
      [{x:el.x1,y:el.y1},{x:el.x2,y:el.y2},{x:el.x3,y:el.y3}].forEach(p => {
        const d = Math.hypot(wx-p.x, wy-p.y);
        if (d < bestD) { bestD=d; best={x:p.x, y:p.y, snapType:'endpoint'}; }
      });
      return;
    }
    // fline・arc：端点スナップ＋中点スナップ
    if (el.type === 'fline') {
      [{x:el.x1,y:el.y1},{x:el.x2,y:el.y2}].forEach(p => {
        const d = Math.hypot(wx-p.x, wy-p.y);
        if (state.snapEnd && d < bestD) { bestD=d; best={x:p.x, y:p.y, snapType:'endpoint'}; }
      });
      if (state.snapMid) {
        const mx=(el.x1+el.x2)/2, my=(el.y1+el.y2)/2;
        const d = Math.hypot(wx-mx, wy-my);
        if (d < bestD) { bestD=d; best={x:mx, y:my, snapType:'midpoint'}; }
      }
      return;
    }
    // ジャンクション(端子台の端子○/◎・分岐点●)
    // 分岐点(●)は中心スナップのみ。配線が交わる点なので中心で正しい。
    //
    // 端子台の端子(○/◎)は円周にもスナップできるようにする。中心まで配線を
    // 引くと円を貫通してしまい、実際の展開接続図の描き方(端子の手前で止めて
    // 反対側から出す)と食い違う。DXF出力でも貫通した配線を隠すために
    // 白塗りのマスクを描く羽目になっていた。
    // 円周で止められれば、画面もDXFも小細工なしで正しくなる。
    if (el.type === 'junction') {
      const r = el.r || 5;
      const isTerm = (el.style === 'circle' || el.style === 'dbl');
      const dc = Math.hypot(wx - el.x, wy - el.y);
      if (dc < bestD) { bestD = dc; best = { x: el.x, y: el.y, snapType: 'terminal', elId: el.id, termIdx: 0 }; }
      if (isTerm && r > 0 && dc > 1e-6) {
        // 円周上の8点(上下左右＋斜め45度)だけに限定する。
        // 円周のどこにでも止められると、わずかに斜めに接続していても
        // 見た目で気づけない。45度なら明確な角度なので微妙なズレと区別がつく。
        const d = Math.SQRT1_2;   // 45度方向の単位ベクトル成分(1/√2)
        [[1,0],[-1,0],[0,1],[0,-1],[d,d],[d,-d],[-d,d],[-d,-d]].forEach(([ux, uy]) => {
          const px = el.x + ux * r, py = el.y + uy * r;
          const dp = Math.hypot(wx - px, wy - py);
          if (dp < bestD) { bestD = dp; best = { x: px, y: py, snapType: 'terminal', elId: el.id, termIdx: 0 }; }
        });
      }
      return;
    }
    if (state.snapEnd && !['text','rect','circle','fline','dim','leader','junction'].includes(el.type)) {
      const d = getDef(el.type) || {};
      const cS = state.customSymbols.find(s => s.type === el.type);
      const rot = (el.rot || 0) * Math.PI / 180;
      if (cS && cS.terminals?.length) {
        cS.terminals.forEach((t, ti) => {
          const rx = t.x * Math.cos(rot) - t.y * Math.sin(rot);
          const ry = t.x * Math.sin(rot) + t.y * Math.cos(rot);
          const dist = Math.hypot(wx - (el.x+rx), wy - (el.y+ry));
          if (dist < bestD) { bestD = dist; best = { x: el.x+rx, y: el.y+ry, snapType:'terminal', elId: el.id, termIdx: ti }; }
        });
      } else {
        const sc = el.scale || 1;
        const hw = (d.w||0)/2 * sc;
        const termDefs = d.terminals || [];
        [+hw, -hw].forEach((dx, ti) => {
          const rx = dx * Math.cos(rot), ry = dx * Math.sin(rot);
          const dist = Math.hypot(wx - (el.x+rx), wy - (el.y+ry));
          if (dist < bestD) { bestD = dist; best = { x: el.x+rx, y: el.y+ry, snapType:'terminal', elId: el.id, termIdx: ti }; }
        });
      }
    }
  });

  state.wires.forEach(w => {
    const pts = w.pts || [{ x:w.x1,y:w.y1 }, { x:w.x2,y:w.y2 }];
    pts.forEach(p => {
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (state.snapEnd && d < bestD) { bestD = d; best = { x:p.x, y:p.y, snapType:'endpoint' }; }
    });
    if (state.snapMid) {
      for (let i = 0; i < pts.length-1; i++) {
        const mx = (pts[i].x + pts[i+1].x)/2, my = (pts[i].y + pts[i+1].y)/2;
        const d = Math.hypot(wx - mx, wy - my);
        if (d < bestD) { bestD = d; best = { x:mx, y:my, snapType:'midpoint' }; }
      }
    }
  });

  // 交点スナップ：マウス周辺のセグメントのみ対象（全体O(n²)を避ける）
  if (state.snapEnd) {
    const IR = R * 4; // 絞り込み半径（スナップ半径の4倍以内のセグメントのみ）
    const segs = [];
    // セグメントのAABBがマウス周辺に重なるものだけ収集
    function nearSeg(x1,y1,x2,y2) {
      return Math.min(x1,x2)-IR < wx && wx < Math.max(x1,x2)+IR &&
             Math.min(y1,y2)-IR < wy && wy < Math.max(y1,y2)+IR;
    }
    state.elements.forEach(el => {
      if (el.type === 'fline' && nearSeg(el.x1,el.y1,el.x2,el.y2))
        segs.push([el.x1,el.y1,el.x2,el.y2]);
    });
    state.wires.forEach(w => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      for (let i=0;i<pts.length-1;i++)
        if (nearSeg(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y))
          segs.push([pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y]);
    });
    // 近傍セグメントのみでO(k²)（kは通常数本）
    for (let i=0;i<segs.length;i++) {
      for (let j=i+1;j<segs.length;j++) {
        const p = segIntersect(...segs[i], ...segs[j]);
        if (!p) continue;
        const d = Math.hypot(wx-p.x, wy-p.y);
        if (d < bestD) { bestD=d; best={x:p.x, y:p.y, snapType:'intersection'}; }
      }
    }
  }

  return best || { x: snap(wx), y: snap(wy), snapType: 'grid' };
}

// 補助線スナップ：H×V交点 or 単独補助線（戻り値なければnull）
function guideSnap(wx, wy) {
  const guides = state.guides;
  if (!guides || !guides.length) return null;
  const R = 12 / state.zoom;
  const hg = guides.filter(g => g.type === 'guide_h');
  const vg = guides.filter(g => g.type === 'guide_v');

  let best = null, bestD = R;

  // 線分と補助線の交点を求めるヘルパー
  function checkSeg(ax, ay, bx, by) {
    hg.forEach(gh => {
      const dy = by - ay;
      if (Math.abs(dy) < 1e-9) return;
      const t = (gh.y - ay) / dy;
      if (t < 0 || t > 1) return;
      const ix = ax + t * (bx - ax);
      const d = Math.hypot(wx - ix, wy - gh.y);
      if (d < bestD) { bestD = d; best = { x: ix, y: gh.y, snapType: 'guide_cross' }; }
    });
    vg.forEach(gv => {
      const dx = bx - ax;
      if (Math.abs(dx) < 1e-9) return;
      const t = (gv.x - ax) / dx;
      if (t < 0 || t > 1) return;
      const iy = ay + t * (by - ay);
      const d = Math.hypot(wx - gv.x, wy - iy);
      if (d < bestD) { bestD = d; best = { x: gv.x, y: iy, snapType: 'guide_cross' }; }
    });
  }

  // H×V 交点（最優先）
  hg.forEach(gh => {
    vg.forEach(gv => {
      const d = Math.hypot(wx - gv.x, wy - gh.y);
      if (d < bestD) { bestD = d; best = { x: gv.x, y: gh.y, snapType: 'guide_cross' }; }
    });
  });

  // wire セグメント × 補助線
  state.wires.forEach(w => {
    const pts = w.pts || [{ x:w.x1,y:w.y1 }, { x:w.x2,y:w.y2 }];
    for (let i = 0; i < pts.length - 1; i++) {
      checkSeg(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
    }
  });

  // fline × 補助線
  state.elements.forEach(el => {
    if (el.type === 'fline') checkSeg(el.x1, el.y1, el.x2, el.y2);
  });

  if (best) return best;

  // 単独補助線スナップ
  vg.forEach(g => {
    const d = Math.abs(wx - g.x);
    if (d < bestD) { bestD = d; best = { x: g.x, y: snap(wy), snapType: 'guide' }; }
  });
  hg.forEach(g => {
    const d = Math.abs(wy - g.y);
    if (d < bestD) { bestD = d; best = { x: snap(wx), y: g.y, snapType: 'guide' }; }
  });
  return best;
}

function snapWirePoint(wx, wy, prevX, prevY) {
  const sp = getAllSnapPoints(wx, wy);
  if (sp) {
    if (state.ortho && prevX != null) {
      const o = applyOrtho(prevX, prevY, sp.x, sp.y);
      // elId・termIdx を引き継ぐ
      return { x:o.x, y:o.y, snapType:sp.snapType, elId:sp.elId, termIdx:sp.termIdx };
    }
    return { x:sp.x, y:sp.y, snapType:sp.snapType, elId:sp.elId, termIdx:sp.termIdx };
  }
  let sx = snap(wx), sy = snap(wy);
  if (state.ortho && prevX != null) { const o = applyOrtho(prevX, prevY, sx, sy); sx=o.x; sy=o.y; }
  return { x:sx, y:sy, snapType:'grid' };
}

function applyOrtho(x1, y1, x2, y2) {
  return Math.abs(x2-x1) >= Math.abs(y2-y1) ? { x:x2, y:y1 } : { x:x1, y:y2 };
}

// 2線分の交点を求める（交差していなければnull）
function segIntersect(ax1,ay1,ax2,ay2, bx1,by1,bx2,by2) {
  const dx1=ax2-ax1, dy1=ay2-ay1;
  const dx2=bx2-bx1, dy2=by2-by1;
  const denom = dx1*dy2 - dy1*dx2;
  if (Math.abs(denom) < 1e-10) return null; // 平行
  const t = ((bx1-ax1)*dy2 - (by1-ay1)*dx2) / denom;
  const u = ((bx1-ax1)*dy1 - (by1-ay1)*dx1) / denom;
  if (t<-0.01||t>1.01||u<-0.01||u>1.01) return null;
  // グリッドスナップして浮動小数点誤差を除去
  return { x: snap(ax1+t*dx1), y: snap(ay1+t*dy1) };
}
