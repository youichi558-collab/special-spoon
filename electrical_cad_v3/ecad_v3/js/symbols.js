// ================================================================
// symbols.js — シンボル描画
// ctx は draw.js で定義されたグローバル変数を使用
// state.zoom / state.customSymbols を参照
// ================================================================

function drawSym(type, x, y, isSel, rot, fH, fV, lc, lineStyle, lwOverride, symScale) {
  const zoom = state.zoom;
  // symScale: 呼び出し側(drawSymEl)でシンボルにel.scaleがかかっている場合、
  // ctx.scale(sc,sc)後にctx.lineWidthを設定すると太さも一緒に縮小されてしまう
  // (Canvasの仕様)。指定した太さのまま見せるため、ここで逆数を掛けて相殺する。
  const sInv = 1 / (symScale || 1);
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot * Math.PI / 180);
  if (fH) ctx.scale(-1, 1);
  if (fV) ctx.scale(1, -1);

  const c = lc || fgC(); // 選択状態に関わらず設定色を使用
  ctx.strokeStyle = c; ctx.fillStyle = c;
  if (lineStyle) applyLineStyle(ctx, lineStyle, zoom);
  // 既定線幅は図面全体の標準(DEFAULT_LINE_WIDTH=0.5)に揃える。
  // 従来は1.0固定で、配線や図形の既定と食い違っていた。
  const _defLw = (typeof DEFAULT_LINE_WIDTH !== 'undefined') ? DEFAULT_LINE_WIDTH : 0.5;
  const lw = lwOverride || (isSel ? _defLw * 3 : _defLw); // 選択時は線幅のみ太くする
  ctx.lineWidth = lw * sInv;

  // カスタムシンボル
  const cS = state.customSymbols.find(s => s.type === type);
  if (cS) {
    ctx.lineWidth = (lwOverride || (isSel ? _defLw * 3 : _defLw)) * sInv;
    if (cS.shapes && cS.shapes.length) {
      cS.shapes.forEach(s => {
        // 図形ごとに太さを持っていればそれを使う(貼り付け元の太さを保持するため)。
        // 持っていない(手描き・旧データ)場合は従来どおりの既定値。
        // ただしシンボル線幅の上書き指定があれば、それを最優先する。
        ctx.lineWidth = (lwOverride || s.lineWidth || (isSel ? _defLw * 3 : _defLw)) * sInv;
        // 【2026-08-23修正】図形ごとのlineStyle(破線/点線/一点鎖線)を反映する。
        // 以前はここで一切参照しておらず、登録パネル側を直しても配置済みシンボルの
        // 点線は実線のまま描かれていた(ccwバグと同じ穴、盛田さんの指摘で発覚)。
        // T(文字)にはlineStyleの概念が無いので対象外。
        if (s.t !== 'T') applyLineStyle(ctx, s.lineStyle, zoom);
        if (s.t==='L') { ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke(); }
        else if (s.t==='C') { ctx.beginPath(); ctx.arc(s.cx,s.cy,s.r,0,Math.PI*2); ctx.stroke(); }
        else if (s.t==='A') { ctx.beginPath(); ctx.arc(s.cx,s.cy,s.r, s.sa*Math.PI/180, s.ea*Math.PI/180, !!s.ccw); ctx.stroke(); }
        else if (s.t==='P' && s.pts && s.pts.length) {
          ctx.beginPath(); ctx.moveTo(s.pts[0][0],s.pts[0][1]);
          for (let k=1;k<s.pts.length;k++) ctx.lineTo(s.pts[k][0],s.pts[k][1]);
          if (s.cl) ctx.closePath(); ctx.stroke();
        }
        else if (s.t==='R') { ctx.strokeRect(s.x,s.y,s.w,s.h); }
        else if (s.t==='T') { ctx.font=`${s.fs||14}px sans-serif`; ctx.textAlign='center'; ctx.fillText(s.text,s.x,s.y); }
      });
      ctx.setLineDash([]); // 次の描画(選択枠・後続シンボル等)に点線設定が漏れないよう必ず戻す
    } else {
      // フォールバック: 矩形+ラベル
      ctx.strokeRect(-cS.w/2,-cS.h/2,cS.w,cS.h);
      ctx.font=`bold ${11}px sans-serif`; ctx.textAlign='center';
      ctx.fillText(cS.label||type, 0, 4);
    }
    if (isSel) {
      // 実際の図形範囲からバウンディングボックスを計算
      let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
      (cS.shapes||[]).forEach(s => {
        if (s.t==='L') { mnX=Math.min(mnX,s.x1,s.x2);mxX=Math.max(mxX,s.x1,s.x2);mnY=Math.min(mnY,s.y1,s.y2);mxY=Math.max(mxY,s.y1,s.y2); }
        else if (s.t==='C') { mnX=Math.min(mnX,s.cx-s.r);mxX=Math.max(mxX,s.cx+s.r);mnY=Math.min(mnY,s.cy-s.r);mxY=Math.max(mxY,s.cy+s.r); }
        else if (s.t==='A') { mnX=Math.min(mnX,s.cx-s.r);mxX=Math.max(mxX,s.cx+s.r);mnY=Math.min(mnY,s.cy-s.r);mxY=Math.max(mxY,s.cy+s.r); }
        else if (s.t==='P' && s.pts) { s.pts.forEach(p=>{ mnX=Math.min(mnX,p[0]);mxX=Math.max(mxX,p[0]);mnY=Math.min(mnY,p[1]);mxY=Math.max(mxY,p[1]); }); }
        else if (s.t==='R') { mnX=Math.min(mnX,s.x,s.x+s.w);mxX=Math.max(mxX,s.x,s.x+s.w);mnY=Math.min(mnY,s.y,s.y+s.h);mxY=Math.max(mxY,s.y,s.y+s.h); }
      });
      if (!isFinite(mnX)) { mnX=-cS.w/2; mxX=cS.w/2; mnY=-cS.h/2; mxY=cS.h/2; }
      ctx.strokeStyle='#0067c0'; ctx.lineWidth=(1/zoom)*sInv;
      ctx.setLineDash([(4/zoom)*sInv,(3/zoom)*sInv]);
      ctx.strokeRect(mnX-8, mnY-8, (mxX-mnX)+16, (mxY-mnY)+16);
      ctx.setLineDash([]);
    }
    ctx.restore(); return;
  }

  // ---- 標準シンボル ----
  // 【2026-09-21削除】内蔵の標準シンボル(電池・交流電源・グランド・抵抗・
  // コンデンサ・コイル(L)・ダイオード・a接点・b接点・限時a/b接点・押釦・
  // リレーコイル・タイマコイル・モータ・ランプ・ヒューズ・ブレーカ・
  // トランス・端子台の20種)をここから全て削除した。
  //
  // 理由: 盛田さんは一度も使っていない。端子点(terminals)が1つも定義されて
  // おらず、部品DBの端子番号割り当ても接点リファレンスも通らないため、
  // 実務では使い物にならなかった。図形としても取り出せない(シンボル登録の
  // 貼り付け対象にならない)ので、残しておく意味が無い。
  // 代わりの「不明な種別なら四角を描く」といった代替表示は入れない
  // (「シンボルが図形として使えないのに何を書くんだよ」— 盛田さん)。
  //
  // 実際に使うシンボルは全て state.customSymbols(登録シンボル)側にある。
  // ここに到達するのは、DEFSに無い種別の要素だけ。何も描かずに戻る。
  ctx.restore();
}

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['symbols.js'] = 1;
