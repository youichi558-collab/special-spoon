// ================================================================
// hit_test.js — ヒットテスト・選択補助関数
// ================================================================

function hitTest(wx, wy) {
  const R = 8 / state.zoom;
  for (let i = state.elements.length-1; i >= 0; i--) {
    const el = state.elements[i];
    const lay = LAYERS.find(l => l.name === el.layer);
    if (lay && lay.locked) continue;
    // getDef()に依存しない型を先に判定
    if (el.type === 'text')   { const hw = Math.min(200, (el.text||'').length * (el.fs||14) * 0.55); const hh = (el.fs||14) * 0.8; if (wx>=el.x && wx<=el.x+hw && wy>=el.y-hh && wy<=el.y+2) return el; continue; }
    if (el.type === 'dim') {
      // 測定点セグメント or 実際の寸法線（オフセット位置）どちらでもヒット
      if (distToSeg(wx,wy,el.x1,el.y1,el.x2,el.y2) < R) return el;
      const ddx=el.x2-el.x1, ddy=el.y2-el.y1, dlen=Math.hypot(ddx,ddy);
      if (dlen > 0.1) {
        const sign=el.offsetSign||1, absOff=Math.abs(el.offset||30);
        const px=-ddy/dlen*sign, py=ddx/dlen*sign;
        const ax1=el.x1+px*absOff, ay1=el.y1+py*absOff;
        const ax2=el.x2+px*absOff, ay2=el.y2+py*absOff;
        if (distToSeg(wx,wy,ax1,ay1,ax2,ay2) < R) return el;
      }
      continue;
    }
    if (el.type === 'leader') {
      const bx=el.bx??el.x2, by=el.by??el.y2;
      if (distToSeg(wx,wy,el.x1,el.y1,bx,by) < R) return el;
      if (el.bx!=null && distToSeg(wx,wy,bx,by,el.x2,el.y2) < R) return el;
      continue;
    }
    if (el.type === 'fline')  { if (distToSeg(wx,wy,el.x1,el.y1,el.x2,el.y2) < R) return el; continue; }
    if (el.type === 'rect')   { if (wx>=el.x&&wx<=el.x+el.w&&wy>=el.y&&wy<=el.y+el.h) return el; continue; }
    if (el.type === 'circle') { if (Math.abs(Math.hypot(wx-el.x,wy-el.y)-el.r) < R) return el; continue; }
    if (el.type === 'arc') {
      const dist = Math.abs(Math.hypot(wx-el.x,wy-el.y)-el.r);
      if (dist < R) {
        // 角度範囲内か確認
        let a = Math.atan2(wy-el.y, wx-el.x);
        let sa = el.startA, ea = el.endA;
        // normalize to [sa, sa+2π]
        while (ea < sa) ea += Math.PI*2;
        while (a < sa) a += Math.PI*2;
        if (a <= ea) return el;
      }
      continue;
    }
    if (el.type === 'junction') { if (Math.hypot(wx-el.x,wy-el.y) < (el.r||2)+R) return el; continue; }
    if (el.type === 'bezier') {
      if (!el.pts || el.pts.length < 2) continue;
      let hit = false;
      for (let i = 0; i < el.pts.length - 1 && !hit; i++) {
        if (distToSeg(wx, wy, el.pts[i].x, el.pts[i].y, el.pts[i+1].x, el.pts[i+1].y) < R * 2) hit = true;
      }
      if (hit) return el; continue;
    }
    if (el.type === 'angle_dim') {
      // 弧の近くかテキスト近くでヒット
      const a1=Math.atan2(el.y1-el.cy,el.x1-el.cx), a2=Math.atan2(el.y2-el.cy,el.x2-el.cx);
      const dist=Math.hypot(wx-el.cx,wy-el.cy);
      if (Math.abs(dist-(el.r||30)) < R*2) return el;
      // テキスト近く
      let da=a2-a1; if(da<0)da+=Math.PI*2;
      const aMid=a1+(da>Math.PI?-(Math.PI*2-da)/2:da/2);
      const tx=el.cx+Math.cos(aMid)*((el.r||30)+14), ty=el.cy+Math.sin(aMid)*((el.r||30)+14);
      if (Math.hypot(wx-tx,wy-ty) < 20) return el;
      continue;
    }
    if (el.type === 'triangle') {
      if (distToSeg(wx,wy,el.x1,el.y1,el.x2,el.y2)<R || distToSeg(wx,wy,el.x2,el.y2,el.x3,el.y3)<R || distToSeg(wx,wy,el.x3,el.y3,el.x1,el.y1)<R) return el;
      continue;
    }
    // シンボル系はgetDef()が必要
    const d = getDef(el.type);
    if (!d) continue;
    const sc = el.scale || 1;
    if (Math.abs(wx-el.x)<(d.w*sc/2+R) && Math.abs(wy-el.y)<(d.h*sc/2+R)) return el;
    // 【追加】デバイス名・型式・仕様の文字表示もクリック判定の対象にする(2026-08-03)。
    // 従来はシンボル本体の小さな図形だけがヒット対象で、devOffX/Y等で離れた位置に
    // 表示されている文字をクリックしても選択できず、狭い本体をピンポイントで
    // 狙わないと選択できなかった(盛田さんの指摘)。draw.jsの各テキスト描画と
    // 同じ位置式・同じ揃えでヒット領域を計算する(文字幅は実測できないため、
    // 既存の'text'型ヒット判定と同じ概算式(文字数×フォントサイズ×0.55)で代用)。
    const rot = (el.rot||0) * Math.PI/180, cosr = Math.cos(rot), sinr = Math.sin(rot);
    const ddx = wx-el.x, ddy = wy-el.y;
    // クリック点をシンボルのローカル座標系(回転前)に変換(仕様・型式は回転に追随するため)
    const lx =  ddx*cosr + ddy*sinr, ly = -ddx*sinr + ddy*cosr;
    if (el.label && !state.pdfSkipText) {
      const loy  = el.labelOffY || (d.h*sc/2 + 15*sc);
      const fs   = Math.round(el.labelFs||11);
      const lh   = Math.round(fs*1.25);
      const lox  = el.labelOffX || 0;
      const align = el.labelAlign || 'center';
      const lines = String(el.label).split('\n');
      for (let li=0; li<lines.length; li++) {
        const ln = lines[li]; if (!ln) continue;
        const w = Math.max(10, ln.length*fs*0.55);
        let left,right;
        if (align==='left') { left=lox; right=lox+w; }
        else if (align==='right') { left=lox-w; right=lox; }
        else { left=lox-w/2; right=lox+w/2; }
        const cy = loy + li*lh;
        if (lx>=left-R && lx<=right+R && ly>=cy-fs-R && ly<=cy+R) return el;
      }
    }
    if (el.showModel && el.partModel && !state.pdfSkipText) {
      const fs    = Math.round(el.modelFs||el.labelFs||11);
      const base  = el.labelOffY || (d.h*sc/2 + 15*sc);
      const mlox  = el.modelOffX !== undefined ? el.modelOffX : (el.labelOffX||0);
      const lblLines = el.label ? String(el.label).split('\n').length : 0;
      const lblFs = Math.round(el.labelFs||11);
      const mloy  = el.modelOffY !== undefined ? el.modelOffY
                  : base + (lblLines ? (lblLines-1)*Math.round(lblFs*1.25) + fs + 3 : 0);
      const w = Math.max(10, String(el.partModel).length*fs*0.55);
      if (lx>=mlox-w/2-R && lx<=mlox+w/2+R && ly>=mloy-fs-R && ly<=mloy+R) return el;
    }
    if (state.showPartRef && !state.pdfSkipText && el.partRef && !el.devHide) {
      // デバイス名は回転に追随しない(draw.js同様、el.x+dx/el.y+dyそのまま)
      const fs = Math.round(el.devFs||11);
      const dx = el.devOffX||0;
      const dy = el.devOffY !== undefined ? el.devOffY : -(d.h*sc/2 + 6);
      const cx = el.x+dx, cy = el.y+dy;
      const w  = Math.max(10, String(el.partRef).length*fs*0.55);
      if (Math.abs(wx-cx)<=w/2+R && wy>=cy-fs-R && wy<=cy+R) return el;
    }
  }
  return null;
}

function hitTestWire(wx, wy) {
  const R = 6 / state.zoom;
  for (let i = state.wires.length-1; i >= 0; i--) {
    const w = state.wires[i];
    const lay = LAYERS.find(l => l.name === w.layer);
    if (lay && lay.locked) continue;
    const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
    for (let j = 0; j < pts.length-1; j++) {
      if (distToSeg(wx,wy,pts[j].x,pts[j].y,pts[j+1].x,pts[j+1].y) < R) return w;
    }
    // 【追加】線番号(wireNo)の文字表示もクリック判定の対象にする(2026-08-03、盛田さんの指摘)。
    // 線番号は配線の中点から法線方向(常に画面上側)へオフセットした位置に表示されるが
    // (draw.js参照)、従来は配線そのもの(細い線)しかヒット対象になっておらず、
    // 少し離れた線番号の文字をクリックしても選択できなかった。
    if (w.wireNo && !state.pdfSkipText) {
      const n = pts.length;
      const wi = Math.floor((n-1)/2), wj = Math.ceil((n-1)/2);
      const mp = n >= 2 ? { x:(pts[wi].x+pts[wj].x)/2, y:(pts[wi].y+pts[wj].y)/2 } : pts[0];
      let nx = 0, ny = -1;
      if (n >= 2) {
        const dx = pts[wj].x - pts[wi].x, dy = pts[wj].y - pts[wi].y;
        const len = Math.hypot(dx, dy);
        if (len > 0.1) { nx = -dy/len; ny = dx/len; if (ny > 0) { nx=-nx; ny=-ny; } }
      }
      const fs  = w.wireNoFs || 10;
      const off = fs + 6;
      const tx = mp.x + nx*off + (w.wireNoOffX||0);
      const ty = mp.y + ny*off + (w.wireNoOffY||0);
      const tw = Math.max(10, String(w.wireNo).length*fs*0.55);
      if (Math.abs(wx-tx)<=tw/2+R && wy>=ty-fs-R && wy<=ty+R) return w;
    }
  }
  return null;
}

function distToSeg(px,py,x1,y1,x2,y2) {
  const dx=x2-x1, dy=y2-y1, len2=dx*dx+dy*dy;
  if (len2===0) return Math.hypot(px-x1,py-y1);
  const t = Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2));
  return Math.hypot(px-(x1+t*dx), py-(y1+t*dy));
}

function inBox(el, sx, sy, ex, ey, crossing) {
  // ロック中レイヤーはスキップ
  const _lay = LAYERS.find(l => l.name === el.layer);
  if (_lay && _lay.locked) return false;
  // crossing=true: 部分重なりも選択（右→左ドラッグ）
  // crossing=false: 完全に内側のみ（左→右ドラッグ）
  if (el.type === 'text') {
    const x2 = el.x + Math.min(200, (el.text||'').length * (el.fs||14) * 0.55);
    const y1 = el.y - (el.fs||14) * 0.8, y2 = el.y + 2;
    return crossing
      ? el.x<=ex && x2>=sx && y1<=ey && y2>=sy
      : el.x>=sx && x2<=ex && y1>=sy && y2<=ey;
  }
  if (el.type === 'rect') {
    const rx2=el.x+el.w, ry2=el.y+el.h;
    return crossing
      ? el.x<=ex && rx2>=sx && el.y<=ey && ry2>=sy
      : el.x>=sx && rx2<=ex && el.y>=sy && ry2<=ey;
  }
  if (el.type === 'circle') {
    return crossing
      ? el.x+el.r>=sx && el.x-el.r<=ex && el.y+el.r>=sy && el.y-el.r<=ey
      : el.x-el.r>=sx && el.x+el.r<=ex && el.y-el.r>=sy && el.y+el.r<=ey;
  }
  if (el.type === 'arc') {
    // バウンディングボックスで近似（円全体のAABBを使用）
    return crossing
      ? el.x+el.r>=sx && el.x-el.r<=ex && el.y+el.r>=sy && el.y-el.r<=ey
      : el.x-el.r>=sx && el.x+el.r<=ex && el.y-el.r>=sy && el.y+el.r<=ey;
  }
  if (el.type === 'angle_dim') {
    return crossing
      ? (el.cx>=sx&&el.cx<=ex&&el.cy>=sy&&el.cy<=ey)
      : (el.cx>=sx&&el.cx<=ex&&el.cy>=sy&&el.cy<=ey&&el.x1>=sx&&el.x1<=ex&&el.y1>=sy&&el.y1<=ey&&el.x2>=sx&&el.x2<=ex&&el.y2>=sy&&el.y2<=ey);
  }
  if (el.type === 'triangle') {
    const pts3 = [
      { x: el.x1, y: el.y1 },
      { x: el.x2, y: el.y2 },
      { x: el.x3, y: el.y3 },
    ];
    return crossing
      ? pts3.some(p => p.x>=sx&&p.x<=ex&&p.y>=sy&&p.y<=ey)
      : pts3.every(p => p.x>=sx&&p.x<=ex&&p.y>=sy&&p.y<=ey);
  }
  if (el.type === 'fline' || el.type === 'dim' || el.type === 'leader') {
    const pts2 = [{x:el.x1,y:el.y1},{x:el.x2,y:el.y2}];
    if (el.type === 'leader') pts2.push({x:el.bx,y:el.by});
    return crossing
      ? pts2.some(p => p.x>=sx&&p.x<=ex&&p.y>=sy&&p.y<=ey)
      : pts2.every(p => p.x>=sx&&p.x<=ex&&p.y>=sy&&p.y<=ey);
  }
  const d = getDef(el.type);
  if (!d) {
    if (el.x != null) return crossing
      ? el.x>=sx&&el.x<=ex&&el.y>=sy&&el.y<=ey
      : el.x>=sx&&el.x<=ex&&el.y>=sy&&el.y<=ey;
    return false;
  }
  const sc = el.scale || 1;
  const hw = d.w*sc/2, hh = d.h*sc/2;
  return crossing
    ? el.x+hw>=sx && el.x-hw<=ex && el.y+hh>=sy && el.y-hh<=ey
    : el.x-hw>=sx && el.x+hw<=ex && el.y-hh>=sy && el.y+hh<=ey;
}

function wireInBox(w, sx, sy, ex, ey, crossing) {
  const _lay = LAYERS.find(l => l.name === w.layer);
  if (_lay && _lay.locked) return false;
  const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
  return crossing
    ? pts.some(p => p.x>=sx && p.x<=ex && p.y>=sy && p.y<=ey)
    : pts.every(p => p.x>=sx && p.x<=ex && p.y>=sy && p.y<=ey);
}

function buildDragGroup() {
  const group = [];
  const selEls   = state.elements.filter(el => state.sel.els.has(el.id));
  const selWires = state.wires.filter(w    => state.sel.wires.has(w.id));
  selEls.forEach(el => {
    if (el.type === 'triangle') {
      group.push({ el, ox1:el.x1,oy1:el.y1, ox2:el.x2,oy2:el.y2, ox3:el.x3,oy3:el.y3 });
    } else if (el.type === 'angle_dim') {
      group.push({ el, ocx:el.cx,ocy:el.cy, ox1:el.x1,oy1:el.y1, ox2:el.x2,oy2:el.y2 });
    } else if (el.type === 'dim' || el.type === 'leader') {
      group.push({ el, ox1:el.x1,oy1:el.y1, ox2:el.x2,oy2:el.y2, obx:el.bx,oby:el.by });
    } else if (el.x != null)  {
      group.push({ el, ox: el.x, oy: el.y, obx: el.bx, oby: el.by });
    } else if (el.x1 != null) {
      group.push({ el, ox1: el.x1, oy1: el.y1, ox2: el.x2, oy2: el.y2 });
    }
  });
  selWires.forEach(w => {
    const pts = w.pts || [{ x:w.x1,y:w.y1 },{ x:w.x2,y:w.y2 }];
    group.push({ el: w, opts: JSON.parse(JSON.stringify(pts)) });
  });
  return group;
}

// ジャンクション専用ヒットテスト（ワイヤーより優先選択するため分離）
function hitTestJunction(wx, wy) {
  const R = 8 / state.zoom;
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (el.type !== 'junction') continue;
    const lay = LAYERS.find(l => l.name === el.layer);
    if (lay && lay.locked) continue;
    if (Math.hypot(wx - el.x, wy - el.y) < (el.r || 5) + R) return el;
  }
  return null;
}
