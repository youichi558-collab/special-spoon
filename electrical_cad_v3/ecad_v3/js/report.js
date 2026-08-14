// ================================================================
// 帳票パネル共通ヘルパー（部品表・線番表・端子台一覧・端子表・接続表・
// 端子台表・接点Refを1つのパネル内タブとして切替表示する）
// ================================================================
const REPORT_TABS = [
  { key:'bom',     label:'部品表',     call:'showBOM()' },
  { key:'wire',    label:'線番表',     call:'wireNoTable()' },
  { key:'term',    label:'端子台一覧', call:'showTerminals()' },
  { key:'termtbl', label:'端子表',     call:'showTerminalTable()' },
  { key:'conntbl', label:'接続表',     call:'showConnTable()' },
  { key:'tbtbl',   label:'端子台表',   call:'showTBTable()' },
  { key:'ref',     label:'接点Ref',    call:'showRefPanel()' },
];

let _lastReportTab = 'bom'; // 帳票系タブが最後に表示していた種類を記憶(現状は参照専用、保存対象外)

function _reportOpen(tabKey, title, bodyHtml, csvFn) {
  _lastReportTab = tabKey;
  const tabsEl = document.getElementById('report-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = REPORT_TABS.map(t =>
      `<button class="rep-tab${t.key===tabKey?' on':''}" onclick="${t.call}">${t.label}</button>`
    ).join('');
  }
  document.getElementById('report-title').textContent = title;
  document.getElementById('report-body').innerHTML = bodyHtml;
  const csvBtn = document.getElementById('report-csv-btn');
  if (csvBtn) {
    csvBtn.style.display = csvFn ? '' : 'none';
    csvBtn.onclick = csvFn || null;
  }
  openFP('report-p');
}


// 一括割付: 全ページ通しで未採番の配線のみに連番を割り付け(既存線番との衝突は自動回避)。
// 【修正 2026-08-14】以前は配線オブジェクト1本ごとに別番号を振っていたため、
// ジャンクションを挟んで複数オブジェクトに分かれて描かれた同一ネット(電気的に
// 繋がった配線群)が別々の番号になってしまう問題があった(接続表の「同一ネットの
// 継続なら正常」という前提と矛盾)。conn_check.jsと同じ端点許容誤差(5)による
// バケット索引方式で、配線どうしの端点が重なっているものを同一ネットとして
// Union-Findでグループ化し、ネット単位で1つの番号を振るよう変更。
// ネット内に既に線番が入っている配線があれば、その番号を未採番側にも継承する
// (異なる番号が混在している場合は上書きせず、件数のみ報告する)。
function autoWireNumber(){
  const start = prompt('一括割付の開始線番（例: W001）\n未採番の配線のみ、全ページ通しで割り付けます。\n接続されている配線群(同一ネット)は自動でまとめて同じ番号になります', state.wireNoRule || 'W001');
  if (!start || !start.trim()) return;
  state.wireNoRule = start.trim();
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  pushH();
  const TOL = 5; // 接続表・未接続チェックと同じ許容誤差
  const used = new Set();
  state.pages.forEach(pg => (pg.wires||[]).forEach(w => { if (w.wireNo) used.add(w.wireNo); }));
  let next = start.trim(), wireCnt = 0, netCnt = 0, conflictCnt = 0;

  state.pages.forEach(pg => {
    const wires = pg.wires || [];
    if (!wires.length) return;
    const bx = x => Math.round(x / TOL);
    const parent = wires.map((_,i)=>i);
    function find(i){ while(parent[i]!==i){ parent[i]=parent[parent[i]]; i=parent[i]; } return i; }
    function union(a,b){ a=find(a); b=find(b); if(a!==b) parent[a]=b; }

    // 端点バケット索引を作ってから、近傍バケットを見て同一ネットをUnion
    const endpoints = wires.map(w => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      return [pts[0], pts[pts.length-1]];
    });
    const idx = new Map();
    endpoints.forEach((eps, i) => eps.forEach(p => {
      const key = `${bx(p.x)},${bx(p.y)}`;
      if (!idx.has(key)) idx.set(key, []);
      idx.get(key).push({ i, p });
    }));
    endpoints.forEach((eps, i) => eps.forEach(p => {
      for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) {
        const bucket = idx.get(`${bx(p.x)+dx},${bx(p.y)+dy}`);
        if (!bucket) continue;
        bucket.forEach(({i:j, p:q}) => {
          if (j===i) return;
          if (Math.hypot(q.x-p.x, q.y-p.y) <= TOL) union(i,j);
        });
      }
    }));

    // ネットごとにグループ化 → 番号を確定 → 未採番のみに適用
    const groups = new Map();
    wires.forEach((_,i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    });
    groups.forEach(idxs => {
      const existingNums = new Set(idxs.map(i => wires[i].wireNo).filter(Boolean));
      if (existingNums.size > 1) conflictCnt++; // 同一ネット内に異なる既存線番が混在(上書きはしない)
      let num = existingNums.size ? [...existingNums][0] : null;
      if (!num) {
        while (used.has(next)) next = incRef(next);
        num = next; used.add(next); next = incRef(next);
        netCnt++;
      }
      idxs.forEach(i => { if (!wires[i].wireNo) { wires[i].wireNo = num; wireCnt++; } });
    });
  });

  let msg = `${wireCnt}本(${netCnt}ネット新規)に線番を割付しました（全ページ・未採番のみ、接続されている配線群は同じ番号）`;
  if (conflictCnt) msg += `\n⚠同一ネット内に異なる既存線番が混在している箇所が${conflictCnt}件ありました(上書きしていません。接続表で確認してください)`;
  wireNoTable(msg);
  draw();
}

// 線番表: 全ページ集計。同一線番の複数使用は箇所数と橙バッジで表示
function wireNoTable(msg){
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const map = new Map(); let unnumbered = 0, total = 0;
  state.pages.forEach((pg, pi) => {
    const pname = pg.name || ('Sheet'+(pi+1));
    (pg.wires||[]).forEach(w => {
      total++;
      if (!w.wireNo) { unnumbered++; return; }
      if (!map.has(w.wireNo)) map.set(w.wireNo, {});
      const rec = map.get(w.wireNo);
      rec[pname] = (rec[pname]||0) + 1;
    });
  });
  const keys = [...map.keys()].sort((a,b)=>String(a).localeCompare(String(b),'ja',{numeric:true}));
  let html = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`;
  if (msg) html += msg + '<br>';
  html += `配線 全${total}本 / 線番 ${keys.length}種`;
  if (unnumbered) html += ` / <span style="color:var(--red);font-weight:600">未採番 ${unnumbered}本</span>`;
  html += `<br>※箇所数2以上（橙）は同一線番の複数使用。同一ネットの継続なら正常です</p>`;
  html += `<table class="tbl"><tr><th>線番</th><th>ページ</th><th>箇所数</th></tr>`;
  keys.forEach(no => {
    const rec = map.get(no);
    const pages = Object.entries(rec).map(([p,c]) => c>1 ? `${p}(${c})` : p).join(', ');
    const cnt = Object.values(rec).reduce((a,b)=>a+b,0);
    html += `<tr><td><span class="badge ${cnt>1?'badge-o':'badge-b'}">${no}</span></td><td>${pages}</td><td>${cnt}</td></tr>`;
  });
  html += `</table>`;
  _reportOpen('wire', '線番 割付結果', html, exportWireCSV);
}

// CSV: 全ページ分を出力
function exportWireCSV(){
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const rows = ['線番,ページ,始点X,始点Y,終点X,終点Y,レイヤー'];
  state.pages.forEach((pg, pi) => {
    const pname = pg.name || ('Sheet'+(pi+1));
    (pg.wires||[]).forEach(w => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      const p0 = pts[0], p1 = pts[pts.length-1];
      rows.push(`${w.wireNo||''},${pname},${Math.round(p0.x)},${Math.round(p0.y)},${Math.round(p1.x)},${Math.round(p1.y)},${w.layer||''}`);
    });
  });
  dl(rows.join('\n'), 'wire_numbers.csv', 'text/csv');
}
// デバイス名の表記ゆれを吸収するための正規化。
// 集計のキーにのみ使い、画面表示には元の表記を使う。
//   全角英数→半角 / 大文字化 / 空白除去 / 区切り記号除去 / 数値の前ゼロ除去
//   例: 「ＭＣＣＢ－０１」「mccb 1」「MCCB-1」→ いずれも "MCCB1"
function normalizeRef(s){
  return String(s||'')
    .normalize('NFKC')            // 全角英数・全角記号を半角へ
    .toUpperCase()
    .replace(/[\s\u3000]/g,'')    // 半角/全角スペース
    .replace(/[-_.・ー－—–]/g,'') // ハイフン類・アンダースコア・中黒
    .replace(/(\D|^)0+(\d)/g,'$1$2'); // 数値の前ゼロ (MCCB01 → MCCB1)
}

// 全ページの要素をデバイス(partRef)単位で1台にまとめ、型番ごとに台数を数える。
// 従来は要素を1個ずつ数えていたため、同じデバイスの接点が独立した部品として
// 計上されていた(コイル1+接点4 → 5個)。発注上は1台なのでデバイスで束ねる。
// デバイス名は normalizeRef() で表記ゆれを吸収してから束ねる。
// デバイス未設定の要素は従来どおり 種別×型番 でまとめ、別枠として出す。
function collectBOMRows(){
  const skip=['text','rect','circle','fline','dim','leader','angle_dim','wire'];
  const devices={};   // 正規化キー -> { spellings:Map(表記->出現数), models:Set, types:Set, parts:0 }
  const noRef={};
  state.pages.forEach(pg=>{
    (pg.elements||[]).forEach(el=>{
      if(skip.includes(el.type))return;
      const raw=(el.partRef||'').trim();
      const key=normalizeRef(raw);
      if(key){
        if(!devices[key])devices[key]={spellings:new Map(),models:new Set(),types:new Set(),parts:0};
        const dv=devices[key];
        dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
        dv.parts++;
        dv.types.add(el.type);
        const m=(el.partModel||'').trim();
        if(m)dv.models.add(m);
      }else{
        const name=(el.partModel||'').trim()||el.label||el.type;
        const k=`${el.type}|${name}`;
        if(!noRef[k])noRef[k]={type:el.type,model:(el.partModel||'').trim(),label:name,
                               refs:[],count:0,parts:0,jis:getDef(el.type)?.jis||'',noRef:true,warn:''};
        noRef[k].count++; noRef[k].parts++;
      }
    });
  });

  // 型番(無ければ種別)ごとにデバイスを束ねて台数を出す
  const byModel={};
  Object.values(devices).forEach(dv=>{
    // 表示名は最も多く使われている表記を採用する
    const spells=[...dv.spellings.entries()].sort((a,b)=>b[1]-a[1]);
    const ref=spells[0][0];
    const models=[...dv.models];
    const model=models[0]||'';
    const primary=[...dv.types][0]||'';
    const k=model||`(型番未設定)|${primary}`;
    if(!byModel[k])byModel[k]={type:primary,model,label:model||'(型番未設定)',
                               refs:[],count:0,parts:0,jis:getDef(primary)?.jis||'',noRef:false,warn:''};
    const row=byModel[k];
    row.refs.push(ref);
    row.count++;                 // 台数 = デバイス数
    row.parts+=dv.parts;         // 構成要素数(接点・端子の個数)
    const ws=[];
    if(spells.length>1)ws.push(`${ref}に表記ゆれ(${spells.map(s=>s[0]).join(' / ')})`);
    if(models.length>1)ws.push(`${ref}に型番が複数(${models.join(' / ')})`);
    if(!model)ws.push('型番未設定');
    if(ws.length)row.warn=row.warn?`${row.warn}｜${ws.join('｜')}`:ws.join('｜');
  });

  return [...Object.values(byModel),...Object.values(noRef)];
}
// 旧仕様(要素を1個ずつ数える)の集計。比較用に残す。
function collectBOMRowsLegacy(){
  const skip=['text','rect','circle','fline','dim','leader'];
  const counts={};
  state.pages.forEach(pg=>{
    (pg.elements||[]).forEach(el=>{
      if(skip.includes(el.type))return;
      const model=el.partModel||'';
      const name=model||el.label||el.type;
      const k=`${el.type}|${name}`;
      if(!counts[k])counts[k]={type:el.type,label:name,model,refs:[],count:0,jis:getDef(el.type)?.jis||''};
      counts[k].count++;
      if(el.partRef)counts[k].refs.push(el.partRef);
    });
  });
  return Object.values(counts);
}
function showBOM(){
  const rows=collectBOMRows();
  const devTotal=rows.filter(r=>!r.noRef).reduce((s,r)=>s+r.count,0);
  const noRefTotal=rows.filter(r=>r.noRef).reduce((s,r)=>s+r.count,0);
  const head=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">全${state.pages.length}ページ集計・${devTotal} 台`
    +(noRefTotal?`　<span style="color:var(--red)">デバイス未設定 ${noRefTotal} 個</span>`:'')
    +`<br>数量はデバイス単位の台数です。構成数は接点・端子を含む図形の個数です。</p>`;
  let html=rows.length
    ?head+`<table class="tbl"><tr><th>型番/名称</th><th>種別</th><th>JIS</th><th>デバイス</th><th>数量(台)</th><th>構成数</th></tr>`
      +rows.map(r=>`<tr${r.noRef?' style="background:var(--rbg)"':''}>`
        +`<td>${r.label}${r.warn?` <span style="color:var(--red);font-size:10px">⚠${r.warn}</span>`:''}</td>`
        +`<td>${r.type}</td><td style="color:var(--acc)">${r.jis}</td>`
        +`<td style="font-size:10px;color:var(--fg3)">${r.noRef?'<span style="color:var(--red)">未設定</span>':(r.refs.join(', ')||'-')}</td>`
        +`<td style="font-weight:600">${r.count}</td><td style="color:var(--fg3)">${r.parts}</td></tr>`).join('')
      +`</table>`
    :'<p style="font-size:11px;color:var(--fg3)">配置されたシンボルがありません</p>';
  _reportOpen('bom', '部品表 (BOM)', html, exportBOMCSV);
}
function exportBOMCSV(){
  const rows=collectBOMRows();
  dl(['型番/名称,種別,JIS規格,デバイス,数量(台),構成数,備考',
      ...rows.map(r=>`${r.label},${r.type},${r.jis},"${r.noRef?'未設定':r.refs.join('/')}",${r.count},${r.parts},${r.warn||''}`)
     ].join('\n'),'bom.csv','text/csv');
}
// 要素の役割を判定する。
// カスタムシンボルはシンボル登録/端子編集で指定した role を使う。
// 標準シンボルは DEFS の isCoil / isContact + contactType から導く。
function symRole(el){
  const d=getDef(el.type)||{};
  if(d.role)return d.role;                       // 'coil' | 'contact_a' | 'contact_b'
  if(d.isCoil)return 'coil';
  if(d.isContact)return d.contactType==='b'?'contact_b':'contact_a';
  return '';
}

// 接点・コイル リファレンス。
// 旧実装は coilName / refCoil というフィールドで紐づける作りだったが、
// このフィールドを書き込むコードが存在せず、実質 label 一致でしか動いて
// いなかった。デバイス(partRef)で紐づける方式に作り直す。
// デバイス名は normalizeRef() で表記ゆれを吸収する。
function showRefPanel(){
  const skip=['text','rect','circle','fline','dim','leader','angle_dim','wire'];
  const devs={};   // 正規化キー -> { spellings:Map, coils:[], contacts:[] }
  state.pages.forEach((pg,pi)=>{
    (pg.elements||[]).forEach(el=>{
      if(skip.includes(el.type))return;
      const role=symRole(el);
      if(!role)return;                            // Ref対象外
      const raw=(el.partRef||'').trim();
      const key=normalizeRef(raw)||`(未設定)#${el.type}`;
      if(!devs[key])devs[key]={spellings:new Map(),coils:[],contacts:[],noRef:!raw};
      const dv=devs[key];
      if(raw)dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
      const rec={el,page:pi+1,role};
      if(role==='coil')dv.coils.push(rec); else dv.contacts.push(rec);
    });
  });

  const keys=Object.keys(devs);
  if(!keys.length){
    _reportOpen('ref','接点・コイル リファレンス',
      '<p style="font-size:11px;color:var(--fg3)">対象のシンボルがありません。<br>'
      +'カスタムシンボルは、シンボル登録または端子(ピン)編集で「種別（接点Ref用）」を'
      +'指定すると対象になります。</p>', null);
    return;
  }

  const rows=keys.sort().map(k=>{
    const dv=devs[k];
    const spells=[...dv.spellings.entries()].sort((a,b)=>b[1]-a[1]);
    const name=spells.length?spells[0][0]:'(デバイス未設定)';
    const warns=[];
    if(spells.length>1)warns.push(`表記ゆれ: ${spells.map(s=>s[0]).join(' / ')}`);
    if(!dv.coils.length)warns.push('コイル未配置');
    if(dv.coils.length>1)warns.push(`コイルが${dv.coils.length}個`);
    if(dv.noRef)warns.push('デバイス未設定');
    const badge=c=>`<span class="badge badge-${c.role==='contact_a'?'g':'b'}">`
      +`${c.role==='contact_a'?'a':'b'}接点 P${c.page}</span>`;
    const coilTxt=dv.coils.length
      ? dv.coils.map(c=>`<span class="badge badge-p">P${c.page}</span>`).join(' ')
      : '<span class="badge" style="background:var(--rbg);color:var(--red)">未配置</span>';
    return `<tr><td><b>${name}</b>${warns.length
        ?`<br><span style="color:var(--red);font-size:10px">⚠ ${warns.join(' / ')}</span>`:''}</td>`
      +`<td>${coilTxt}</td>`
      +`<td>${dv.contacts.map(badge).join(' ')||'なし'}</td>`
      +`<td>${dv.contacts.length}</td></tr>`;
  }).join('');

  const html=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    +`全${state.pages.length}ページ集計。Pの数字は配置ページです。</p>`
    +`<table class="tbl"><tr><th>デバイス</th><th>コイル</th><th>接点</th><th>接点数</th></tr>${rows}</table>`;
  _reportOpen('ref', '接点・コイル リファレンス', html, null);
}
function showTerminals(){
  const terms=state.elements.filter(el=>el.type==='terminal');
  let html=terms.length?`<table class="tbl"><tr><th>No</th><th>仕様</th><th>端子番号</th><th>線番</th><th>メモ</th></tr>${terms.map((t,i)=>`<tr><td>${i+1}</td><td>${t.label||''}</td><td>${t.terminals||''}</td><td>${t.wireNo||''}</td><td>${t.note||''}</td></tr>`).join('')}</table>`:'<p style="font-size:11px;color:var(--fg3)">端子台がありません</p>';
  _reportOpen('term', '端子台一覧', html, exportTermCSV);
}
function exportTermCSV(){const terms=state.elements.filter(el=>el.type==='terminal');dl(['No,仕様,端子番号,線番,メモ',...terms.map((t,i)=>`${i+1},${t.label||''},${t.terminals||''},${t.wireNo||''},${t.note||''}`)].join('\n'),'terminals.csv','text/csv');}


// ================================================================
// 端子表（全部品の接続情報）
// ================================================================
function showTerminalTable() {
  const skip = ['text','rect','circle','fline','dim','leader','angle_dim','wire'];
  const els = state.elements.filter(el => !skip.includes(el.type));
  if (!els.length) {
    _reportOpen('termtbl', '端子表（接続情報）', '<p style="font-size:11px;color:var(--fg3)">部品がありません</p>', null);
    return;
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
  html += `<table class="tbl"><tr><th>デバイス</th><th>仕様</th><th>種別</th><th>端子番号</th><th>接続線番</th><th>接続先</th></tr>`;
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
  _reportOpen('termtbl', '端子表（接続情報）', html, exportTerminalCSV);
}

function exportTerminalCSV() {
  const skip = ['text','rect','circle','fline','dim','leader','angle_dim'];
  const els = state.elements.filter(el => !skip.includes(el.type));
  const rows = ['デバイス,仕様,種別,端子番号,接続線番,接続先'];
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
  const frame = maskedFrame(state.pages[state.currentPage]?.frameObj) || {};

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
  lines.push(`| デバイス | 仕様 | 種別 | 端子番号 | メモ |`);
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
