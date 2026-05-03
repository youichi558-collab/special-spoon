// ================================================================
// report.js — 線番・BOM・端子台・リファレンスパネル
// 依存: state, getDef, dl
// ================================================================
function autoWireNumber(){
  pushH();let n=1;state.wires.forEach(w=>{if(!w.wireNo){w.wireNo='W'+String(n).padStart(3,'0');}n++;});
  let html=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">${state.wires.length}本に線番を割付しました</p><table class="tbl"><tr><th>線番</th><th>始点</th><th>終点</th><th>レイヤー</th></tr>`;
  state.wires.forEach(w=>{const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];const p0=pts[0],p1=pts[pts.length-1];html+=`<tr><td><span class="badge badge-b">${w.wireNo||'-'}</span></td><td>${Math.round(p0.x)},${Math.round(p0.y)}</td><td>${Math.round(p1.x)},${Math.round(p1.y)}</td><td>${w.layer||''}</td></tr>`;});
  html+='</table>';document.getElementById('wire-body').innerHTML=html;openFP('wire-p');draw();
}
function exportWireCSV(){const rows=['線番,始点X,始点Y,終点X,終点Y,レイヤー',...state.wires.map(w=>{const pts=w.pts||[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];const p0=pts[0],p1=pts[pts.length-1];return`${w.wireNo||''},${Math.round(p0.x)},${Math.round(p0.y)},${Math.round(p1.x)},${Math.round(p1.y)},${w.layer||''}`;})];dl(rows.join('\n'),'wire_numbers.csv','text/csv');}
function showBOM(){
  const skip=['text','rect','circle','fline','dim','leader'];
  const counts={};state.elements.forEach(el=>{if(skip.includes(el.type))return;const name=el.partRef||el.label||el.type;const k=`${el.type}|${name}`;if(!counts[k])counts[k]={type:el.type,label:name,count:0,jis:getDef(el.type)?.jis||''};counts[k].count++;});
  const rows=Object.values(counts);
  let html=rows.length?`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">合計 ${state.elements.filter(e=>!skip.includes(e.type)).length} 個</p><table class="tbl"><tr><th>記号</th><th>種別</th><th>JIS</th><th>数量</th></tr>${rows.map(r=>`<tr><td>${r.label}</td><td>${r.type}</td><td style="color:var(--acc)">${r.jis}</td><td style="font-weight:600">${r.count}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">配置されたシンボルがありません</p>';
  document.getElementById('bom-body').innerHTML=html;openFP('bom-p');
}
function exportBOMCSV(){const skip=['text','rect','circle','fline','dim','leader'];const counts={};state.elements.forEach(el=>{if(skip.includes(el.type))return;const name=el.partRef||el.label||el.type;const k=`${el.type}|${name}`;if(!counts[k])counts[k]={type:el.type,label:name,count:0,jis:getDef(el.type)?.jis||''};counts[k].count++;});dl(['記号,種別,JIS規格,数量',...Object.values(counts).map(r=>`${r.label},${r.type},${r.jis},${r.count}`)].join('\n'),'bom.csv','text/csv');}
function showRefPanel(){
  const coils=state.elements.filter(el=>getDef(el.type)?.isCoil);
  const contacts=state.elements.filter(el=>getDef(el.type)?.isContact||el.refCoil);
  const map={};coils.forEach(c=>{const k=c.coilName||c.label||'?';if(!map[k])map[k]={coil:c,contacts:[]};});
  contacts.forEach(ct=>{const k=ct.refCoil||(coils.find(c=>(c.coilName||c.label)===ct.label)?ct.label:null);if(k){if(!map[k])map[k]={coil:null,contacts:[]};if(!map[k].contacts.includes(ct))map[k].contacts.push(ct);}});
  let html=Object.keys(map).length?`<table class="tbl"><tr><th>コイル名</th><th>種別</th><th>接点</th><th>数</th></tr>${Object.entries(map).map(([key,{coil,contacts}])=>`<tr><td><b>${key}</b></td><td>${coil?`<span class="badge badge-p">${coil.type==='timer_coil'?'タイマ':'リレー'}</span>`:'<span class="badge" style="background:var(--rbg);color:var(--red)">未配置</span>'}</td><td>${contacts.map(c=>`<span class="badge badge-${getDef(c.type).contactType==='a'?'g':'b'}">${c.label}</span>`).join(' ')||'なし'}</td><td>${contacts.length}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">コイルシンボルがありません</p>';
  document.getElementById('ref-body').innerHTML=html;openFP('ref-p');
}
function showTerminals(){
  const terms=state.elements.filter(el=>el.type==='terminal');
  let html=terms.length?`<table class="tbl"><tr><th>No</th><th>ラベル</th><th>端子番号</th><th>線番</th><th>メモ</th></tr>${terms.map((t,i)=>`<tr><td>${i+1}</td><td>${t.label||''}</td><td>${t.terminals||''}</td><td>${t.wireNo||''}</td><td>${t.note||''}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">端子台がありません</p>';
  document.getElementById('term-body').innerHTML=html;openFP('term-p');
}
function exportTermCSV(){const terms=state.elements.filter(el=>el.type==='terminal');dl(['No,ラベル,端子番号,線番,メモ',...terms.map((t,i)=>`${i+1},${t.label||''},${t.terminals||''},${t.wireNo||''},${t.note||''}`)].join('\n'),'terminals.csv','text/csv');}

// ================================================================
// DXF・印刷
// ================================================================

// ================================================================
// PDF出力（ベクター：jsPDF直接API）
// ================================================================
