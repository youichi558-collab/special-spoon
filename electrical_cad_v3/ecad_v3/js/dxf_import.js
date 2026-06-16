// ================================================================
// dxf_import.js — DXF読込
// ================================================================
function loadDXF(input){
  const f=input.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=e=>{
    const buf=e.target.result;
    const u8=new Uint8Array(buf);

    // まずASCII範囲でECAD_FRAMEマーカーを探す（自ツール出力はUTF-8確定）
    const ascii=String.fromCharCode(...u8.slice(0,Math.min(u8.length,2000)));
    const isOwnFile=ascii.includes('ECAD_DXF_V1')||ascii.includes('ECAD_FRAME');

    let enc='UTF-8';
    if(!isOwnFile){
      // 1. UTF-8 BOM（EF BB BF）があれば確定
      if(u8[0]===0xEF&&u8[1]===0xBB&&u8[2]===0xBF){
        enc='UTF-8';
      } else {
        // 2. DXFヘッダーの$DWGCODEPAGEを確認（先頭4000バイト内に存在）
        const head=String.fromCharCode(...u8.slice(0,Math.min(u8.length,4000)));
        const cpIdx=head.indexOf('DWGCODEPAGE');
        if(cpIdx>=0){
          const snip=head.slice(cpIdx,cpIdx+40);
          if(/ANSI_932/i.test(snip))      enc='Shift-JIS';
          else if(/ANSI_\d/i.test(snip))  enc='UTF-8'; // 932以外はUTF-8扱い
          else                             enc=_detectSjis(u8);
        } else {
          // 3. バイトスキャンでShift-JIS判定（$DWGCODEPAGEなしの古いDXF向け）
          enc=_detectSjis(u8);
        }
      }
    }

    console.log('[DXF] encoding='+enc+' isOwn='+isOwnFile);
    // TextDecoderを使う（FileReader.readAsTextはShift-JISサポートがブラウザ依存）
    try{
      const decoder=new TextDecoder(enc);
      parseDXF(decoder.decode(buf), isOwnFile);
    }catch(e){
      const rd2=new FileReader();
      rd2.onload=e2=>parseDXF(e2.target.result, isOwnFile);
      rd2.readAsText(f,enc);
    }
  };
  rd.readAsArrayBuffer(f);
  input.value='';
}

function parseDXF(text, isOwnFile){
  // 改行コード正規化（CR/LF両対応）
  const lines=text.split('\n').map(l=>l.replace(/\r/g,'').trim());
  const pairs=[];
  for(let i=0;i<lines.length-1;i+=2){
    const code=parseInt(lines[i]);
    if(!isNaN(code))pairs.push({code,val:lines[i+1]});
  }
  let lc=0,cc=0,tc=0,ic=0;let i=0;
  let parsedFrameObj=null;
  let parsedJunctions=[];
  for(let j=0;j<pairs.length;j++){
    if(pairs[j].code===999){
      const v=String(pairs[j].val);
      if(v.startsWith('ECAD_FRAME:'))   {try{parsedFrameObj  =JSON.parse(v.slice('ECAD_FRAME:'.length));}catch(e){console.warn('ECAD_FRAME parse error',e);}}
      if(v.startsWith('ECAD_JUNCTIONS:')){try{parsedJunctions=JSON.parse(v.slice('ECAD_JUNCTIONS:'.length));}catch(e){console.warn('ECAD_JUNCTIONS parse error',e);}}
    }
  }

  // 既存要素がある場合は確認してクリア
  // 外部DXFの寸法線: BLOCKSセクションの*DブロックLINE/TEXTを収集
  const _dimW=[],_dimE=[];
  if(!isOwnFile){
    let _inBl=false,_inD=false,_blLy='寸法';
    for(let _j=0;_j<pairs.length;_j++){
      const _c=pairs[_j].code,_v=pairs[_j].val;
      if(_c===0&&_v==='SECTION'){_inBl=false;_inD=false;}
      if(_c===2&&_v==='BLOCKS') _inBl=true;
      if(_c===0&&_v==='ENDSEC'){_inBl=false;_inD=false;}
      if(!_inBl) continue;
      if(_c===0&&_v==='BLOCK') _inD=false;
      if(_c===2&&String(_v).startsWith('*D')) _inD=true;
      if(_c===8&&_inD&&pairs[_j-1]&&pairs[_j-1].code===0&&pairs[_j-1].val==='BLOCK') _blLy=_v;
      if(_c===0&&_v==='ENDBLK') _inD=false;
      if(!_inD) continue;
      if(_c===0&&_v==='LINE'){
        const _e=readEnt(pairs,_j);
        const _x1=+_e['10']||0,_y1=-(+_e['20']||0),_x2=+_e['11']||0,_y2=-(+_e['21']||0);
        if(Math.hypot(_x2-_x1,_y2-_y1)>0.1) _dimW.push({id:genId('w'),x1:_x1,y1:_y1,x2:_x2,y2:_y2,pts:[{x:_x1,y:_y1},{x:_x2,y:_y2}],layer:_e['8']||_blLy,wireNo:null});
        _j=_e._end-1;
      }
      if(_c===0&&(_v==='TEXT'||_v==='MTEXT')){
        const _e=readEnt(pairs,_j);
        let _t=(_e['1']||_e['3']||'').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/\\P/g,' ').trim();
        _t=fromUnicodeDXF(_t);
        const _h=+_e['40']||12;
        if(_t&&_t!=='<>') _dimE.push({id:genId('el'),type:'text',x:+_e['10']||0,y:-(+_e['20']||0),text:_t,fs:Math.max(8,Math.min(72,_h)),layer:_e['8']||_blLy});
        _j=_e._end-1;
      }
    }
  }

  pushH(); // 読込全ルートでundoに乗る
  const hasContent=state.elements.length>0||state.wires.length>0;
  if(hasContent){
    const replace=confirm('既存の図面にDXFを追加しますか?\nOK=追加  キャンセル=現在の内容を消してから読込');
    if(!replace){
      state.page.elements=[];
      state.page.wires=[];
      state.sel.els.clear();state.sel.wires.clear();
    }
  }

  // 枠レイヤー判定（文字化け対策で複数パターン対応）
  function isFrameLayer(name){
    if(!name)return false;
    const n=name.toLowerCase();
    return n==='図面枠'||n==='frame'||n==='寸法_vis'||n==='dim_vis'||n.includes('border')||n==='defpoints';
  }

  // ENTITIESセクションのみ処理
  let inEntities=false;
  while(i<pairs.length){
    const{code,val}=pairs[i];
    if(code===0&&val==='SECTION'){i++;if(i<pairs.length&&pairs[i].code===2&&pairs[i].val==='ENTITIES'){inEntities=true;i++;continue;}inEntities=false;i++;continue;}
    if(code===0&&val==='ENDSEC'){inEntities=false;i++;continue;}
    if(!inEntities){i++;continue;}
    if(code===0){
      if(val==='LINE'){
        const e=readEnt(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        const x1=+e['10']||0,y1=-(+e['20']||0),x2=+e['11']||0,y2=-(+e['21']||0);
        if(Math.hypot(x2-x1,y2-y1)>0.1){state.wires.push({id:genId('w'),x1,y1,x2,y2,pts:[{x:x1,y:y1},{x:x2,y:y2}],layer:e['8']||'配線',wireNo:null});lc++;}
        i=e._end;continue;
      }
      if(val==='CIRCLE'){
        const e=readEnt(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        const r=+e['40']||0;
        if(r>0){
          const cx=+e['10']||0, cy=-(+e['20']||0);
          const jm=parsedJunctions.find(j=>Math.hypot(j.x-cx,j.y-cy)<0.1);
          if(jm){state.elements.push({id:genId('el'),type:'junction',x:cx,y:cy,r:jm.r||r,color:jm.color,layer:jm.layer||e['8']||'回路'});cc++;}
          else  {state.elements.push({id:genId('el'),type:'circle', x:cx,y:cy,r,           layer:e['8']||'外形'});cc++;}
        }
        i=e._end;continue;
      }
      if(val==='TEXT'||val==='MTEXT'){
        const e=readEnt(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        let raw=(e['1']||e['3']||'');
        // MTextエスケープ除去
        raw=raw.replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/\\P/g,' ').trim();
        let t=fromUnicodeDXF(raw);
        const h=+e['40']||12;
        if(t)state.elements.push({id:genId('el'),type:'text',x:+e['10']||0,y:-(+e['20']||0),text:t,fs:Math.max(8,Math.min(72,h)),layer:e['8']||'注記'});
        tc++;i=e._end;continue;
      }
      if(val==='INSERT'){
        const e=readEnt(pairs,i);
        const bname=e['2']||'';
        const mapped=mapBlock(bname);
        if(mapped){const def=getDef(mapped);state.elements.push({id:genId('el'),type:mapped,x:+e['10']||0,y:-(+e['20']||0),label:def?.label||bname,layer:e['8']||'回路',rot:+e['50']||0,flipH:false,flipV:false});ic++;}
        i=e._end;continue;
      }
      if(val==='LWPOLYLINE'){
        const e=readPoly(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        if(e.pts&&e.pts.length>=2){
          const p=e.pts,minX=Math.min(...p.map(v=>v.x)),minY=Math.min(...p.map(v=>v.y)),maxX=Math.max(...p.map(v=>v.x)),maxY=Math.max(...p.map(v=>v.y));
          if(maxX-minX>0.1&&maxY-minY>0.1)state.elements.push({id:genId('el'),type:'rect',x:minX,y:minY,w:maxX-minX,h:maxY-minY,layer:e['8']||'外形'});
          else if(maxX-minX>0.1||maxY-minY>0.1)state.wires.push({id:genId('w'),x1:p[0].x,y1:p[0].y,x2:p[p.length-1].x,y2:p[p.length-1].y,pts:p,layer:e['8']||'配線',wireNo:null});
        }
        i=e._end;continue;
      }
      if(val==='ARC'){
        const e=readEnt(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        const r=+e['40']||0;
        if(r>0){
          // DXF角度はDXF座標系（y上向）、Canvasはy反転でccwも反転
          const sa=+e['50']||0, ea=+e['51']||0;
          const startA=-sa*Math.PI/180, endA=-ea*Math.PI/180;
          state.elements.push({id:genId('el'),type:'arc',x:+e['10']||0,y:-(+e['20']||0),r,startA,endA,ccw:true,layer:e['8']||'外形'});cc++;
        }
        i=e._end;continue;
      }
      if(val==='ELLIPSE'){
        const e=readEnt(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        const _ratio=Math.abs(+e['40']||0);
        const r=_ratio*Math.hypot(+e['11']||0,+e['21']||0);
        if(r>0&&_ratio>=0.9){state.elements.push({id:genId('el'),type:'circle',x:+e['10']||0,y:-(+e['20']||0),r,layer:e['8']||'外形'});cc++;}
        i=e._end;continue;
      }
      if(val==='SPLINE'){
        const e=readPoly(pairs,i);
        if(isFrameLayer(e['8'])){i=e._end;continue;}
        if(e.pts&&e.pts.length>=2){
          for(let k=0;k<e.pts.length-1;k++){
            state.wires.push({id:genId('w'),x1:e.pts[k].x,y1:e.pts[k].y,x2:e.pts[k+1].x,y2:e.pts[k+1].y,pts:[e.pts[k],e.pts[k+1]],layer:e['8']||'外形',wireNo:null});lc++;
          }
        }
        i=e._end;continue;
      }
      if(val==='DIMENSION'&&isOwnFile){
        const e=readEnt(pairs,i);
        let x1=+e['13']||0,y1=-(+e['23']||0),x2=+e['14']||0,y2=-(+e['24']||0);
        // code50があればP2をP1+dist*uに変換しdrawDimElと方向を揃える
        let dimText=e['1']||'';
        if(e['50']!=null){
          const ang50=+e['50'];
          const ux=Math.cos(ang50*Math.PI/180),uy=-Math.sin(ang50*Math.PI/180);
          const dist=Math.abs((x2-x1)*ux+(y2-y1)*uy);
          x2=x1+dist*ux; y2=y1+dist*uy;
          if(!dimText||dimText==='<>') dimText=String(Math.round(dist*10)/10);
        } else if(!dimText||dimText==='<>'){
          dimText=String(Math.round(Math.hypot(x2-x1,y2-y1)*10)/10);
        }
        const midX=+e['10']||0,midY=-(+e['20']||0);
        const mx=(x1+x2)/2,my=(y1+y2)/2;
        const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
        let offsetSign=1,offset=30;
        if(len>0.1){
          const px=-dy/len,py=dx/len;
          const dot=(midX-mx)*px+(midY-my)*py;
          offsetSign=dot>=0?1:-1;
          offset=Math.max(15,Math.abs(dot));
        }
        state.elements.push({id:genId('el'),type:'dim',x1,y1,x2,y2,
          dimText,offset,offsetSign,arrowSz:state.dimDef?.arrowSz||8,
          dimFs:state.dimDef?.fs||11,dimTy:state.dimDef?.ty||0,dimTx:state.dimDef?.tx||0,
          layer:e['8']||'寸法',x:mx,y:my});
        i=e._end;continue;
      }
    }
    i++;
  }
  const total=lc+cc+tc+ic;
  if(parsedFrameObj)state.frameObj=parsedFrameObj;

  // 枠要素を除去（レイヤー名 + 位置の両方でフィルタ、エンコーディング不問）
  function looksLikeFrameLayer(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return name === '図面枠' || n === 'frame' || n === 'border' || n === 'defpoints' || n.startsWith('frame_');
  }
  function inFrameMargin(el) {
    if (!parsedFrameObj) return false;
    const fr = parsedFrameObj;
    const sc   = fr.sc   || 1;
    const W    = (fr.wMM  || fr.w  || 297) * sc;
    const H    = (fr.hMM  || fr.h  || 210) * sc;
    const mg   = (fr.mg   || 10)   * sc;
    const thMM = (fr.thMM || 30)   * sc;
    const tbY  = H - mg - thMM; // 表題欄上端

    function ptInFrame(x, y) {
      if (x === null || x === undefined) return false;
      return x <= mg || x >= W - mg || y <= mg || y >= H - mg || y >= tbY;
    }

    // 要素が1点（シンボル/テキスト）
    if (el.x !== undefined) return ptInFrame(el.x, el.y);
    // 線分（x1/y1/x2/y2）: 両端点のどちらかが枠内にあれば除去
    if (el.x1 !== undefined) return ptInFrame(el.x1, el.y1) || ptInFrame(el.x2, el.y2);
    return false;
  }
  state.page.elements = state.page.elements.filter(el => !looksLikeFrameLayer(el.layer));
  state.page.wires    = state.page.wires.filter(w   => !looksLikeFrameLayer(w.layer));

  // DXFで出現したレイヤーをLAYERSに自動登録
  const allLayers=new Set([...state.elements.map(e=>e.layer),...state.wires.map(w=>w.layer)]);
  allLayers.forEach(name=>{if(name&&!LAYERS.find(l=>l.name===name)){LAYERS.push({name,color:'#228844',visible:true,locked:false,active:false,lineWidth:1,lineDash:'solid',fontSize:null,attr:''});}});
  renderLayers();
  document.getElementById('dxf-log-body').innerHTML=`<p style="font-size:11px;margin-bottom:8px">読込完了: <b>${total}</b>要素</p><table class="tbl"><tr><th>種別</th><th>件数</th></tr><tr><td>配線</td><td>${lc}</td></tr><tr><td>円</td><td>${cc}</td></tr><tr><td>テキスト</td><td>${tc}</td></tr><tr><td>シンボル</td><td>${ic}</td></tr></table>${total===0?'<p style="font-size:11px;color:var(--red);margin-top:6px">要素が読み込めませんでした</p>':''}`;
  // 座標範囲を検出（外部DXFのみ縮尺ダイアログを表示）
  if (!isOwnFile) {
    const allX = [], allY = [];
    state.elements.forEach(el => {
      if (el.x1 != null) { allX.push(el.x1, el.x2); allY.push(el.y1, el.y2); }
      else if (el.x != null) { allX.push(el.x); allY.push(el.y); }
    });
    state.wires.forEach(w => { allX.push(w.x1, w.x2); allY.push(w.y1, w.y2); });

    if (allX.length > 0) {
      const rangeW = Math.round(Math.max(...allX) - Math.min(...allX));
      const rangeH = Math.round(Math.max(...allY) - Math.min(...allY));
      const recScale = rangeH > 0 ? (420 / rangeH).toFixed(2) : '1';
      document.getElementById('dxf-scale-range').textContent =
        `座標範囲: ${rangeW} × ${rangeH} 単位　（A3高さ基準の推奨倍率: ${recScale}）`;
      document.getElementById('dxf-scale-val').value = recScale;
      if(_dimW.length||_dimE.length){state.page.wires.push(..._dimW);state.page.elements.push(..._dimE);}
      document.getElementById('dxf-scale-overlay').style.display = 'flex';
      return; // applyDXFScale()でdraw()を呼ぶ
    }
  }

  // *Dブロックから取り出した寸法線 LINE/TEXT を追加
  if(_dimW.length||_dimE.length){
    state.page.wires.push(..._dimW);
    state.page.elements.push(..._dimE);
  }
  const ov = document.getElementById('dxf-log-overlay');
  ov.style.display = 'flex';
  draw();
}

function cancelDXFScale() {
  // ここは「縮尺適用をキャンセルして等倍で読み込む」動作にする。
  // 以前は getter-only の state.elements / state.wires に代入していたため、
  // 実際には読み込んだDXFを破棄できていなかった。
  applyDXFScale(true);
}

function applyDXFScale(skip) {
  document.getElementById('dxf-scale-overlay').style.display = 'none';
  if (!skip) {
    const sc = parseFloat(document.getElementById('dxf-scale-val').value);
    const fsScale = parseFloat(document.getElementById('dxf-scale-fs-val').value);
    if (!isNaN(sc) && sc > 0 && sc !== 1) {
      state.elements.forEach(el => {
        if (el.x1 != null) {
          el.x1 *= sc; el.y1 *= sc; el.x2 *= sc; el.y2 *= sc;
          if (el.bx != null) { el.bx *= sc; el.by *= sc; }
        } else if (el.x != null) {
          el.x *= sc; el.y *= sc;
          if (el.r != null) el.r *= sc;
          if (el.w != null) { el.w *= sc; if (el.h != null) el.h *= sc; }
        }
      });
      state.wires.forEach(w => {
        w.x1 *= sc; w.y1 *= sc; w.x2 *= sc; w.y2 *= sc;
        if (w.pts) w.pts = w.pts.map(p => ({ x: p.x * sc, y: p.y * sc }));
      });
    }
    if (!isNaN(fsScale) && fsScale > 0 && fsScale !== 1) {
      state.elements.forEach(el => {
        if (el.fs != null) el.fs = Math.max(8, Math.min(72, Math.round(el.fs * fsScale)));
      });
    }
  }
  document.getElementById('dxf-log-overlay').style.display = 'flex';
  draw();
}

function readEnt(pairs,start){const e={_end:start+1};let i=start+1;while(i<pairs.length){const{code,val}=pairs[i];if(code===0)break;if(e[String(code)]===undefined)e[String(code)]=val;i++;}e._end=i;return e;}
function readPoly(pairs,start){const e={_end:start+1,pts:[]};let i=start+1,cx=null;while(i<pairs.length){const{code,val}=pairs[i];if(code===0&&i>start+1)break;if(e[String(code)]===undefined&&code!==10&&code!==20)e[String(code)]=val;if(code===10)cx=+val||0;if(code===20&&cx!==null){e.pts.push({x:cx,y:-(+val||0)});cx=null;}i++;}e._end=i;return e;}
function fromUnicodeDXF(str){return str.replace(/\\U\+([0-9A-Fa-f]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));}
function _detectSjis(u8){
  let sjis=0,utf8=0;
  for(let i=0;i<u8.length-2;i++){
    const b=u8[i];
    // UTF-8 3バイトシーケンス (E0-EF 80-BF 80-BF)
    if(b>=0xE0&&b<=0xEF){
      const b2=u8[i+1],b3=u8[i+2];
      if((b2&0xC0)===0x80&&(b3&0xC0)===0x80){utf8+=2;i+=2;continue;}
    }
    // UTF-8 2バイトシーケンス (C0-DF 80-BF)
    if(b>=0xC0&&b<=0xDF){
      const b2=u8[i+1];
      if((b2&0xC0)===0x80){utf8++;i++;continue;}
    }
    // Shift-JIS 2バイト文字
    if((b>=0x81&&b<=0x9F)||(b>=0xE0&&b<=0xFC)){
      const b2=u8[i+1];
      if(b2>=0x40&&b2<=0xFC&&b2!==0x7F){sjis++;i++;}
    }
  }
  console.log('[DXF] sjisScore='+sjis+' utf8Score='+utf8);
  return utf8>sjis?'UTF-8':'Shift-JIS';
}
function mapBlock(name){const n=name.toLowerCase();const m=[
  ['timer_coil','timer_coil'],['timer_no','timer_no'],['timer_nc','timer_nc'],['timer','timer_coil'],
  ['coil','coil'],['relay','coil'],
  ['motor','motor'],['breaker','breaker'],['mccb','breaker'],
  ['cb','breaker'],['nf','breaker'],['fuse','fuse'],
  ['lamp','lamp'],['sw_no','sw_no'],['sw_nc','sw_nc'],
  ['push_no','push_no'],['push','push_no'],
  ['terminal','terminal'],['tb','terminal'],
  ['transformer','transformer'],['trans','transformer'],
  ['battery','battery'],['batt','battery'],
  ['capacitor','capacitor'],['cap','capacitor'],
  ['resistor','resistor'],['res','resistor'],
  ['inductor','inductor'],['ind','inductor'],
  ['diode','diode'],
  ['ac','ac'],['ground','ground'],['gnd','ground'],
];for(const[k,v]of m)if(n.includes(k))return v;return null;}
