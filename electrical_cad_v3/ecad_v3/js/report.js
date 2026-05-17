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
// 端子表（全部品の接続情報）
// ================================================================
function showTerminalTable() {
  const skip = ['text','rect','circle','fline','dim','leader','angle_dim','wire'];
  const els = state.elements.filter(el => !skip.includes(el.type));
  if (!els.length) {
    document.getElementById('termtbl-body').innerHTML = '<p style="font-size:11px;color:var(--fg3)">部品がありません</p>';
    openFP('termtbl-p'); return;
  }

  // 部品ごとに接続配線を集計
  const connMap = {}; // elId -> [{wireNo, peerLabel, peerPartRef, termIdx}]
  els.forEach(el => { connMap[el.id] = []; });

  state.wires.forEach(w => {
    const wNo = w.wireNo || '-';
    if (w.fromElId && connMap[w.fromElId] !== undefined) {
      const peer = state.elements.find(e => e.id === w.toElId);
      connMap[w.fromElId].push({ wireNo: wNo, termIdx: w.fromTermIdx, peerRef: peer?.partRef || peer?.label || '-' });
    }
    if (w.toElId && connMap[w.toElId] !== undefined) {
      const peer = state.elements.find(e => e.id === w.fromElId);
      connMap[w.toElId].push({ wireNo: wNo, termIdx: w.toTermIdx, peerRef: peer?.partRef || peer?.label || '-' });
    }
  });

  let html = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">部品数: ${els.length}</p>`;
  html += `<table class="tbl"><tr><th>部品番号</th><th>ラベル</th><th>種別</th><th>端子番号</th><th>接続線番</th><th>接続先</th></tr>`;
  els.forEach(el => {
    const conns = connMap[el.id] || [];
    const termList = (el.terminals || '').split(',').map(t => t.trim()).filter(Boolean);
    if (!conns.length) {
      html += `<tr><td>${el.partRef||'-'}</td><td>${el.label||''}</td><td>${el.type}</td><td>${termList.join(', ')||'-'}</td><td>-</td><td>-</td></tr>`;
    } else {
      conns.forEach((c, i) => {
        const termLabel = termList[c.termIdx] || (c.termIdx !== '' ? `T${c.termIdx}` : '-');
        html += `<tr><td>${i===0?el.partRef||'-':''}</td><td>${i===0?el.label||'':''}</td><td>${i===0?el.type:''}</td><td>${termLabel}</td><td><span class="badge badge-b">${c.wireNo}</span></td><td>${c.peerRef}</td></tr>`;
      });
    }
  });
  html += '</table>';
  document.getElementById('termtbl-body').innerHTML = html;
  openFP('termtbl-p');
}

function exportTerminalCSV() {
  const skip = ['text','rect','circle','fline','dim','leader','angle_dim'];
  const els = state.elements.filter(el => !skip.includes(el.type));
  const rows = ['部品番号,ラベル,種別,端子番号,接続線番,接続先'];
  els.forEach(el => {
    const termList = (el.terminals || '').split(',').map(t => t.trim()).filter(Boolean);
    const conns = [];
    state.wires.forEach(w => {
      if (w.fromElId === el.id) {
        const peer = state.elements.find(e => e.id === w.toElId);
        conns.push({ wireNo: w.wireNo||'-', termIdx: w.fromTermIdx, peerRef: peer?.partRef||peer?.label||'-' });
      }
      if (w.toElId === el.id) {
        const peer = state.elements.find(e => e.id === w.fromElId);
        conns.push({ wireNo: w.wireNo||'-', termIdx: w.toTermIdx, peerRef: peer?.partRef||peer?.label||'-' });
      }
    });
    if (!conns.length) {
      rows.push(`${el.partRef||''},${el.label||''},${el.type},${termList.join('/')||''},-,-`);
    } else {
      conns.forEach((c, i) => {
        const termLabel = termList[c.termIdx] || (c.termIdx !== '' ? `T${c.termIdx}` : '');
        rows.push(`${i===0?el.partRef||'':''},${i===0?el.label||'':''},${i===0?el.type:''},${termLabel},${c.wireNo},${c.peerRef}`);
      });
    }
  });
  dl(rows.join('\n'), 'terminal_table.csv', 'text/csv');
}


// ================================================================
// AI解析エクスポート
// ================================================================
function exportAIAnalysis() {
  const skip = ['text','rect','circle','fline','dim','leader','angle_dim'];
  const frame = state.pages[state.currentPage]?.frameObj || {};

  // 部品リスト
  const parts = state.elements
    .filter(el => !skip.includes(el.type))
    .map(el => ({
      id:        el.id,
      partRef:   el.partRef || '',
      label:     el.label   || '',
      type:      el.type,
      terminals: el.terminals || '',
      note:      el.note    || '',
      layer:     el.layer   || '',
    }));

  // 配線リスト（From-To付き）
  const getLabel = id => {
    const el = state.elements.find(e => e.id === id);
    return el ? (el.partRef || el.label || el.type) : '';
  };
  const wires = state.wires.map(w => ({
    wireNo:      w.wireNo || '',
    fromPartRef: getLabel(w.fromElId),
    fromElId:    w.fromElId    || '',
    fromTermIdx: w.fromTermIdx !== '' ? w.fromTermIdx : '',
    toPartRef:   getLabel(w.toElId),
    toElId:      w.toElId      || '',
    toTermIdx:   w.toTermIdx   !== '' ? w.toTermIdx   : '',
  }));

  // ページ情報
  const pageInfo = {
    title:   frame.title   || '',
    drawno:  frame.drawno  || '',
    equip:   frame.equip   || '',
    date:    frame.date    || '',
    page:    frame.page    || '',
    rev:     frame.rev     || '',
  };

  // Markdown形式（Claudeに貼りやすい）
  const lines = [];
  lines.push(`# 電気図面 AI解析データ`);
  lines.push(``);
  lines.push(`## 図面情報`);
  lines.push(`- 図面名: ${pageInfo.title}`);
  lines.push(`- 図面番号: ${pageInfo.drawno}`);
  lines.push(`- 設備名: ${pageInfo.equip}`);
  lines.push(`- 日付: ${pageInfo.date}`);
  lines.push(`- ページ: ${pageInfo.page}`);
  lines.push(``);

  lines.push(`## 部品リスト（${parts.length}件）`);
  lines.push(`| 部品番号 | ラベル | 種別 | 端子番号 | メモ |`);
  lines.push(`|---------|--------|------|---------|------|`);
  parts.forEach(p => {
    lines.push(`| ${p.partRef||'-'} | ${p.label||'-'} | ${p.type} | ${p.terminals||'-'} | ${p.note||''} |`);
  });
  lines.push(``);

  const connWires = wires.filter(w => w.fromElId || w.toElId);
  lines.push(`## 配線リスト（接続情報あり: ${connWires.length}件 / 計${wires.length}件）`);
  lines.push(`| 線番 | From部品 | To部品 |`);
  lines.push(`|------|---------|--------|`);
  connWires.forEach(w => {
    lines.push(`| ${w.wireNo||'-'} | ${w.fromPartRef||'-'} | ${w.toPartRef||'-'} |`);
  });
  lines.push(``);

  const noConn = wires.filter(w => !w.fromElId && !w.toElId);
  if (noConn.length) {
    lines.push(`## 接続情報なし配線（${noConn.length}件）`);
    lines.push(noConn.map(w => w.wireNo || '-').join(', '));
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*このデータは電気CADから自動生成されました*`);

  const md = lines.join('\n');
  dl(md, 'ai_analysis.md', 'text/markdown');

  // JSON版も出力
  const json = JSON.stringify({ pageInfo, parts, wires }, null, 2);
  dl(json, 'ai_analysis.json', 'application/json');
}

// ================================================================
// DXF・印刷
// ================================================================

// ================================================================
// PDF出力（ベクター：jsPDF直接API）
// ================================================================
