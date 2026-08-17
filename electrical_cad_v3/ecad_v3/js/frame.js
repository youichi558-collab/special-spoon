// ================================================================
// 図面枠
// ================================================================
function loadFrameTpl(val){
  if(!val||val==='custom')return;
  // ユーザー保存テンプレートチェック
  if(val.startsWith('_')){
    const name=val.slice(1);
    const saved=JSON.parse(localStorage.getItem('ecad_frame_tpls')||'{}');
    if(saved[name]){Object.entries(saved[name]).forEach(([k,v])=>{const el=document.getElementById('f-'+k)||document.getElementById('frame-'+k);if(el)el.value=v;});}
    return;
  }
  const t=FRAME_TPLS[val];
  if(!t)return;
  document.getElementById('frame-w').value=t.w;
  document.getElementById('frame-h').value=t.h;
  document.getElementById('frame-mg').value=t.mg;
  document.getElementById('frame-th').value=t.th;
  document.getElementById('frame-cols').value=t.cols;
  document.getElementById('frame-rows').value=t.rows;
}
function applyFrame(){
  pushH();
  state.frameObj={
    sc:parseFloat(document.getElementById('frame-scale').value)||2,
    wMM:parseFloat(document.getElementById('frame-w').value)||297,
    hMM:parseFloat(document.getElementById('frame-h').value)||210,
    mg:parseFloat(document.getElementById('frame-mg').value)||10,
    thMM:parseFloat(document.getElementById('frame-th').value)||30,
    cols:parseInt(document.getElementById('frame-cols').value)||8,
    rows:parseInt(document.getElementById('frame-rows').value)||4,
    // 表題欄の様式（data.jsのTITLE_BLOCK_TPLSのキー）。図面と一緒に保存される
    tbTpl:document.getElementById('frame-tbtpl')?.value || 'standard',
    drawno:document.getElementById('f-drawno').value,
    title:document.getElementById('f-title').value,
    company:document.getElementById('f-company').value,
    equip:document.getElementById('f-equip').value,
    author:document.getElementById('f-author').value,
    approve:document.getElementById('f-approve').value,
    date:document.getElementById('f-date').value,
    scale2:document.getElementById('f-scale2').value,
    rev:document.getElementById('f-rev').value,
    chghist:document.getElementById('f-chghist')?.value||'',
    page:document.getElementById('f-page')?.value || (state.frameObj?.page) || '',
  };
  closeFP('frame-p');resetView();draw();
}
function removeFrame(){pushH();state.frameObj=null;draw();}
function saveFrameTplUser(){
  const name=prompt('テンプレート名:');if(!name)return;
  const tpls=JSON.parse(localStorage.getItem('ecad_frame_tpls')||'{}');
  tpls[name]={w:document.getElementById('frame-w').value,h:document.getElementById('frame-h').value,mg:document.getElementById('frame-mg').value,th:document.getElementById('frame-th').value,cols:document.getElementById('frame-cols').value,rows:document.getElementById('frame-rows').value};
  localStorage.setItem('ecad_frame_tpls',JSON.stringify(tpls));
  // セレクトに追加
  refreshFrameTplSel();
  alert(`「${name}」を保存しました`);
}
function refreshFrameTplSel(){
  const sel=document.getElementById('frame-tpl');
  sel.querySelectorAll('option.user').forEach(o=>o.remove());
  const tpls=JSON.parse(localStorage.getItem('ecad_frame_tpls')||'{}');
  if(Object.keys(tpls).length){
    const grp=document.createElement('optgroup');grp.label='保存済みテンプレート';
    Object.keys(tpls).forEach(k=>{const o=document.createElement('option');o.value='_'+k;o.textContent=k;o.className='user';grp.appendChild(o);});
    sel.appendChild(grp);
  }
}
// 表題欄の様式セレクタの選択肢を作る。
// 組み込み様式と、読み込んだ客先様式の両方を並べる。
function refreshTitleBlockSel(){
  const sel=document.getElementById('frame-tbtpl');
  if(!sel) return;
  const cur=(state.frameObj&&state.frameObj.tbTpl)||'standard';
  const user=userTitleBlockTpls();
  const mk=(k,v)=>`<option value="${k}">${(v&&v.label)||k}</option>`;
  let html=Object.entries(TITLE_BLOCK_TPLS).filter(([k])=>!user[k]).map(([k,v])=>mk(k,v)).join('');
  const uKeys=Object.keys(user);
  if(uKeys.length){
    html+=`<optgroup label="読み込んだ様式">`+uKeys.map(k=>mk(k,user[k])).join('')+`</optgroup>`;
  }
  sel.innerHTML=html;
  sel.value=allTitleBlockTpls()[cur]?cur:'standard';
}

// 客先様式のJSONを読み込む。
// 形式は {"キー":{"label":"表示名","cells":[{x,y,w,h,key,lbl},...]}, ...}
// 複数の様式を1つのファイルにまとめて入れられる。
function loadTitleBlockTpl(input){
  const f=input.files&&input.files[0];
  if(!f)return;
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data||typeof data!=='object'||Array.isArray(data)) throw new Error('様式定義の形式が違います');
      // 1件だけの定義({label,cells})を渡された場合はファイル名をキーにして受け付ける
      const tpls = data.cells ? {[f.name.replace(/\.json$/i,'')]:data} : data;
      const errs=[];
      Object.entries(tpls).forEach(([k,v])=>errs.push(...validateTitleBlockTpl(k,v)));
      if(errs.length){
        alert('様式の定義に問題があるため読み込めませんでした:\n\n'+errs.slice(0,10).join('\n'));
        return;
      }
      const cur=userTitleBlockTpls();
      const added=[],replaced=[];
      Object.entries(tpls).forEach(([k,v])=>{
        (cur[k]?replaced:added).push((v&&v.label)||k);
        cur[k]=v;
      });
      localStorage.setItem(TB_TPL_STORE,JSON.stringify(cur));
      refreshTitleBlockSel();
      draw();
      alert(`表題欄の様式を読み込みました\n`
        +(added.length?`\n追加: ${added.join(', ')}`:'')
        +(replaced.length?`\n更新: ${replaced.join(', ')}`:''));
    }catch(err){
      alert('読み込みに失敗しました: '+err.message);
    }
  };
  rd.readAsText(f);
  input.value='';
}

// 現在選択中の様式をJSONで書き出す。他のPCへ移すときや、様式を元に改変するときに使う
function exportTitleBlockTpl(){
  const sel=document.getElementById('frame-tbtpl');
  const key=sel?sel.value:'standard';
  const tpl=allTitleBlockTpls()[key];
  if(!tpl){alert('様式が見つかりません');return;}
  dl(JSON.stringify({[key]:tpl},null,2),`titleblock_${key}.json`,'application/json');
}

// 読み込んだ様式を削除する（組み込み様式は消せない）
function deleteTitleBlockTpl(){
  const sel=document.getElementById('frame-tbtpl');
  const key=sel?sel.value:'';
  const user=userTitleBlockTpls();
  if(!user[key]){alert('読み込んだ様式を選んでください（組み込みの様式は削除できません）');return;}
  if(!confirm(`様式「${user[key].label||key}」を削除しますか？\nこの様式を使っている図面は標準様式で表示されるようになります。`))return;
  delete user[key];
  localStorage.setItem(TB_TPL_STORE,JSON.stringify(user));
  refreshTitleBlockSel();
  draw();
}

function showFramePanel(){
  refreshFrameTplSel();
  refreshTitleBlockSel();
  if(state.frameObj){
    document.getElementById('frame-scale').value=state.frameObj.sc;
    document.getElementById('frame-w').value=state.frameObj.wMM;
    document.getElementById('frame-h').value=state.frameObj.hMM;
    document.getElementById('frame-mg').value=state.frameObj.mg;
    document.getElementById('frame-th').value=state.frameObj.thMM;
    document.getElementById('frame-cols').value=state.frameObj.cols;
    document.getElementById('frame-rows').value=state.frameObj.rows;
    ['drawno','title','company','equip','author','approve','date','scale2','rev','chghist','page'].forEach(k=>{const el=document.getElementById('f-'+k);if(el)el.value=state.frameObj[k]||'';});
  }
  openFP('frame-p');
}
// ================================================================
// 図面枠のジオメトリ（区画割りの単一の情報源）
//
// 図面枠の描画(drawFrame)と、クロスリファレンスの区画算出(report.jsのzoneOf)は
// 同じ区画割りを見ている必要がある。以前は両者が別々に同じ計算を書いていたため、
// 枠のデザインを変えると片方だけズレる二重管理になっていた。
// 寸法計算とラベル生成はここに集約し、双方がこれを呼ぶこと。
//
// 枠のデザインを変更する場合、区画割りに関わる部分はこの関数だけを直せば
// 描画と区画表示の両方に反映される。
// 例) 表題欄を下ではなく右side に置く → drawH ではなく innerW を削る形に直す
//     区画を余白ではなく内枠の中に振る   → MGpx のオフセットを変える
//     列ラベルをAA,ABまで伸ばす          → zoneColLabel() を直す
// ================================================================
function frameGeom(fr){
  if(!fr) return null;
  const sc=fr.sc||2;
  const cols=fr.cols||0, rows=fr.rows||0;
  const W=(fr.wMM||297)*sc, H=(fr.hMM||210)*sc;
  const MGpx=(fr.mg||0)*sc, TH=(fr.thMM||0)*sc;
  const innerW=W-MGpx*2, innerH=H-MGpx*2;
  const drawH=innerH-TH;              // 表題欄を除いた作図領域の高さ
  return {
    sc, cols, rows, W, H, MGpx, TH, innerW, innerH, drawH,
    // 区画1マスの大きさ。cols/rowsが0のときは0（呼び出し側で除算しないこと）
    colW: cols? innerW/cols : 0,
    rowH: rows? drawH/rows  : 0,
    // 作図領域(区画が振られている範囲)の左上と右下
    x0: MGpx, y0: MGpx, x1: MGpx+innerW, y1: MGpx+drawH,
  };
}

// 列ラベル(A,B,C...)。26列を超えたらAに戻る。
function zoneColLabel(c){ return String.fromCharCode(65 + c % 26); }
// 行ラベル(1,2,3...)。
function zoneRowLabel(r){ return String(r + 1); }

function drawFrame(fr){
  if (fr.isCover) return; // 表紙ページは図面枠を描画しない
  const g=frameGeom(fr);
  const {cols,rows}=fr;
  const {W,H,MGpx,TH,innerW,innerH,drawH,colW,rowH}=g;

  ctx.save();
  // 用紙
  ctx.fillStyle=state.darkMode?'rgba(42,42,42,0.85)':'rgba(255,255,255,0.85)';
  ctx.fillRect(0,0,W,H);
  // グリッド（PDF出力時はスキップ）
  if (!state.pdfMode) {
    const step=state.G;
    ctx.strokeStyle=state.darkMode?'rgba(255,255,255,0.13)':'rgba(0,0,0,0.10)';
    ctx.lineWidth=0.4/state.zoom;
    const gx0=MGpx,gx1=MGpx+innerW,gy0=MGpx,gy1=MGpx+drawH;
    for(let x=gx0;x<=gx1+0.1;x+=step){
      ctx.beginPath();ctx.moveTo(x,gy0);ctx.lineTo(x,gy1);ctx.stroke();
    }
    for(let y=gy0;y<=gy1+0.1;y+=step){
      ctx.beginPath();ctx.moveTo(gx0,y);ctx.lineTo(gx1,y);ctx.stroke();
    }
  }
  // 用紙外枠
  ctx.strokeStyle=state.darkMode?'#ccc':'#000';ctx.lineWidth=2/state.zoom;
  ctx.strokeRect(0,0,W,H);
  // 内枠
  ctx.lineWidth=1/state.zoom;
  ctx.strokeRect(MGpx,MGpx,innerW,innerH);

  // 区域分割・ラベル
  if (cols && rows) { // PDF出力時も描画
    ctx.strokeStyle=state.darkMode?'#555':'#999';ctx.lineWidth=0.5/state.zoom;
    ctx.fillStyle=state.darkMode?'#aaa':'#666';
    ctx.font=`${9}px sans-serif`;ctx.textAlign='center';
    // 列分割線：上余白と下余白のみ（内枠の外）
    for(let c=1;c<cols;c++){
      ctx.beginPath();ctx.moveTo(MGpx+c*colW,0);ctx.lineTo(MGpx+c*colW,MGpx);ctx.stroke();
      ctx.beginPath();ctx.moveTo(MGpx+c*colW,MGpx+innerH);ctx.lineTo(MGpx+c*colW,H);ctx.stroke();
    }
    // 行分割線：左余白と右余白のみ
    for(let r=1;r<rows;r++){
      ctx.beginPath();ctx.moveTo(0,MGpx+r*rowH);ctx.lineTo(MGpx,MGpx+r*rowH);ctx.stroke();
      ctx.beginPath();ctx.moveTo(MGpx+innerW,MGpx+r*rowH);ctx.lineTo(W,MGpx+r*rowH);ctx.stroke();
    }
    // 列ラベル (A,B,C...)
    for(let c=0;c<cols;c++){
      ctx.fillText(zoneColLabel(c),MGpx+c*colW+colW/2,MGpx-3);
    }
    // 行ラベル (1,2,3...)
    ctx.textAlign='center';
    for(let r=0;r<rows;r++){
      ctx.fillText(zoneRowLabel(r),MGpx-8,MGpx+r*rowH+rowH/2+4);
      ctx.fillText(zoneRowLabel(r),MGpx+innerW+8,MGpx+r*rowH+rowH/2+4);
    }
  }

  // 表題欄
  const tbY=MGpx+drawH;
  ctx.strokeStyle=state.darkMode?'#ccc':'#000';ctx.lineWidth=1/state.zoom;
  ctx.strokeRect(MGpx,tbY,innerW,TH);

  // 表題欄内セル（様式は data.js の TITLE_BLOCK_TPLS で定義。frameObj.tbTpl で選択）
  const cells=titleBlockCells(fr);
  ctx.lineWidth=0.5/state.zoom;ctx.strokeStyle=state.darkMode?'#888':'#888';
  cells.forEach(c=>{
    const cx=MGpx+c.x*innerW,cy=tbY+c.y*TH,cw=c.w*innerW,ch=c.h*TH;
    ctx.strokeRect(cx,cy,cw,ch);
    ctx.fillStyle=state.darkMode?'#888':'#777';ctx.font=`${8}px sans-serif`;ctx.textAlign='left';
    ctx.fillText(c.lbl,cx+2,cy+9);
    ctx.fillStyle=state.darkMode?'#eee':'#111';ctx.font=`bold ${10}px sans-serif`;
    const val = c.key==='_page'
      ? (fr.page || `${state.currentPage+1} / ${state.pages.length}`)
      : (fr[c.key]||'');
    if (c.key==='chghist' && val) {
      // セル幅に収まるようフォントサイズを自動縮小
      const maxW = cw - 6/state.zoom;
      let fs = 10;
      ctx.font = `bold ${fs}px sans-serif`;
      while (ctx.measureText(val).width > maxW && fs > 4) {
        fs -= 0.5;
        ctx.font = `bold ${fs}px sans-serif`;
      }
      ctx.fillText(val, cx+3, cy+ch-5);
    } else {
      ctx.fillText(val, cx+3, cy+ch-5);
    }
  });


  ctx.restore();
}
