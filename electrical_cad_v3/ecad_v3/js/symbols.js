// ================================================================
// symbols.js — シンボル描画
// ctx は draw.js で定義されたグローバル変数を使用
// state.zoom / state.customSymbols を参照
// ================================================================

function drawSym(type, x, y, isSel, rot, fH, fV, lc) {
  const zoom = state.zoom;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  if (fH) ctx.scale(-1, 1);
  if (fV) ctx.scale(1, -1);

  const c = isSel ? '#0067c0' : (lc || fgC());
  ctx.strokeStyle = c; ctx.fillStyle = c;
  const lw = (isSel ? 2 : 1.5) / zoom;
  ctx.lineWidth = lw;
  const ln = w => { ctx.lineWidth = w / zoom; };

  // カスタムシンボル
  const cS = state.customSymbols.find(s => s.type === type);
  if (cS) {
    if (cS.shapes && cS.shapes.length) {
      cS.shapes.forEach(s => {
        if (s.t==='L') { ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke(); }
        else if (s.t==='C') { ctx.beginPath(); ctx.arc(s.cx,s.cy,s.r,0,Math.PI*2); ctx.stroke(); }
        else if (s.t==='R') { ctx.strokeRect(s.x,s.y,s.w,s.h); }
        else if (s.t==='T') { ctx.font=`${(s.fs||14)/zoom}px sans-serif`; ctx.textAlign='center'; ctx.fillText(s.text,s.x,s.y); }
      });
    } else {
      // フォールバック: 矩形+ラベル
      ctx.strokeRect(-cS.w/2,-cS.h/2,cS.w,cS.h);
      ctx.font=`bold ${11/zoom}px sans-serif`; ctx.textAlign='center';
      ctx.fillText(cS.label||type, 0, 4/zoom);
    }
    if (isSel) {
      ctx.strokeStyle='#0067c0'; ctx.lineWidth=1/zoom;
      ctx.setLineDash([4/zoom,3/zoom]);
      ctx.strokeRect(-cS.w/2-8,-cS.h/2-8,cS.w+16,cS.h+16);
      ctx.setLineDash([]);
    }
    ctx.restore(); return;
  }

  // ---- 標準シンボル ----
  if (type==='battery') {
    // JIS C 0617-11: 長短交互の縦棒（長=正極）
    ctx.beginPath(); ctx.moveTo(-36,0); ctx.lineTo(-14,0); ctx.stroke();
    [[-14,2.5],[-7,1.2],[0,2.5],[7,1.2],[14,2.5]].forEach(([px,w]) => { ln(w); ctx.beginPath(); ctx.moveTo(px,w>1.5?-9:-6); ctx.lineTo(px,w>1.5?9:6); ctx.stroke(); });
    ln(1.5); ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(36,0); ctx.stroke();

  } else if (type==='ac') {
    // JIS C 0617-11: 円に正弦波
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,19,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13,0); ctx.quadraticCurveTo(-6.5,-12,0,0); ctx.quadraticCurveTo(6.5,12,13,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='ground') {
    // JIS C 0617-2: 3本平行線（下に向かって短く等間隔）
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(0,0); ctx.stroke();
    ln(1.5);
    ctx.beginPath(); ctx.moveTo(-16,0);  ctx.lineTo(16,0);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10,6);  ctx.lineTo(10,6);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4,12);  ctx.lineTo(4,12);  ctx.stroke();

  } else if (type==='resistor') {
    // JIS C 0617-4: 矩形
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-18,0); ctx.stroke();
    ctx.strokeRect(-18,-8,36,16);
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='capacitor') {
    // JIS C 0617-4: 2本の平行線
    ctx.beginPath(); ctx.moveTo(-27,0); ctx.lineTo(-6,0); ctx.stroke();
    ln(2.5); ctx.beginPath(); ctx.moveTo(-6,-12); ctx.lineTo(-6,12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6,-12); ctx.lineTo(6,12); ctx.stroke();
    ln(1.5); ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(27,0); ctx.stroke();

  } else if (type==='inductor') {
    // JIS C 0617-4: 上向き半円4つ連続
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-22,0); ctx.stroke();
    ctx.beginPath();
    for (let i=0;i<4;i++) ctx.arc(-16+i*12,0,6,Math.PI,0);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='diode') {
    // JIS C 0617-4: 三角形+縦線
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-12,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12,-10); ctx.lineTo(12,0); ctx.lineTo(-12,10); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12,-10); ctx.lineTo(12,10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='sw_no') {
    // JIS C 0617-7: a接点 両端小円、斜め開放アーム
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-14,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(-14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11,0); ctx.lineTo(11,-12); ctx.stroke(); // 斜めアーム
    ctx.beginPath(); ctx.arc(14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='push_no') {
    // JIS C 0617-7: 押しボタン a接点 操作素子（T字）
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-14,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(-14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11,0); ctx.lineTo(11,-12); ctx.stroke();
    ctx.beginPath(); ctx.arc(14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(32,0); ctx.stroke();
    // 操作素子: 縦棒+横棒(T字)
    ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(0,-18); ctx.stroke();
    ln(2); ctx.beginPath(); ctx.moveTo(-8,-18); ctx.lineTo(8,-18); ctx.stroke();
    ln(1.5);

  } else if (type==='sw_nc') {
    // JIS C 0617-7: b接点 両端小円、水平アーム(閉路)、上方に斜め開放線
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-14,0); ctx.stroke();
    ctx.beginPath(); ctx.arc(-14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11,0); ctx.lineTo(11,0); ctx.stroke(); // 水平アーム（閉路を示す）
    ctx.beginPath(); ctx.arc(14,0,3,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(32,0); ctx.stroke();
    // 開路方向の斜め線（上方）
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-6,-12); ctx.stroke();

  } else if (type==='coil' || type==='timer_coil') {
    // JIS C 0617-7: 電磁コイル = 矩形
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.strokeRect(-20,-14,40,28);
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.font=`${9/zoom}px sans-serif`; ctx.textAlign='center';
    ctx.fillText(type==='coil'?'CR':'TIM', 0, type==='timer_coil'?-2:4/zoom);
    if (type==='timer_coil') {
      // タイマー記号: コイル下部に半円
      ctx.beginPath(); ctx.arc(0,14,6,Math.PI,0); ctx.stroke();
    }

  } else if (type==='breaker') {
    // JIS C 0617-7: 遮断器 = 矩形+CB
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.strokeRect(-20,-14,40,28);
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.font=`${9/zoom}px sans-serif`; ctx.textAlign='center'; ctx.fillText('CB',0,4/zoom);

  } else if (type==='motor') {
    // JIS C 0617: 電動機 = 円+M
    ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-20,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(32,0); ctx.stroke();
    ctx.font=`bold ${14/zoom}px sans-serif`; ctx.textAlign='center'; ctx.fillText('M',0,5/zoom);

  } else if (type==='lamp') {
    // JIS C 0617-13: 表示灯 = 円+X
    ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11,-11); ctx.lineTo(11,11); ctx.moveTo(11,-11); ctx.lineTo(-11,11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-18,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='fuse') {
    // JIS C 0617-4: ヒューズ = 矩形のみ（破線なし）
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-18,0); ctx.stroke();
    ctx.strokeRect(-18,-7,36,14);
    ctx.beginPath(); ctx.moveTo(18,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='transformer') {
    // JIS C 0617-13: 変圧器 = 上向きコイル3つ | 破線 | 下向きコイル3つ
    ctx.beginPath(); ctx.moveTo(-32,0); ctx.lineTo(-22,0); ctx.stroke();
    ctx.beginPath();
    for (let i=0;i<3;i++) ctx.arc(-16+i*10,0,5,Math.PI,0); // 一次: 上向き半円
    ctx.stroke();
    ctx.setLineDash([3/zoom,3/zoom]);
    ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(0,16); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i=0;i<3;i++) ctx.arc(4+i*10,0,5,0,Math.PI); // 二次: 下向き半円
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26,0); ctx.lineTo(32,0); ctx.stroke();

  } else if (type==='terminal') {
    // 端子台: 矩形+X印
    ctx.beginPath(); ctx.moveTo(-20,0); ctx.lineTo(20,0); ctx.stroke();
    ctx.strokeRect(-10,-8,20,16);
    ctx.beginPath(); ctx.moveTo(-5,-5); ctx.lineTo(5,5); ctx.moveTo(5,-5); ctx.lineTo(-5,5); ctx.stroke();
  }

  if (isSel) {
    const d = getDef(type) || { w:64, h:34 };
    ctx.strokeStyle = '#0067c0'; ctx.lineWidth = 1/zoom;
    ctx.setLineDash([4/zoom, 3/zoom]);
    ctx.strokeRect(-d.w/2-8, -d.h/2-8, d.w+16, d.h+16);
    ctx.setLineDash([]);
  }
  ctx.restore();
}
