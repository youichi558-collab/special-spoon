// ================================================================
// 帳票パネル共通ヘルパー（部品表・線番表・端子台一覧・端子表・接続表・
// 端子台表・接点Refを1つのパネル内タブとして切替表示する）
// ================================================================
const REPORT_TABS = [
  { key:'bom',     label:'部品表',     call:'showBOM()' },
  { key:'wire',    label:'線番表',     call:'wireNoTable()' },
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


const WIRE_NET_TOL = 5; // 接続表・未接続チェックと同じ許容誤差

// 線番文字列を「英字等のprefix」「数値部分」「桁数(0埋め幅)」に分解する。
// 例: "W001" → {prefix:'W', num:1, digits:3}。数値末尾を持たない線番(手打ちの
// 自由記述など)はnullを返し、詰め処理の対象外にする。
function parseWireNo(no) {
  const m = String(no||'').match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], num: parseInt(m[2],10), digits: m[2].length };
}

// 配線削除後、削除によって完全に無くなった線番があれば、同じprefixで
// それより大きい番号を1つずつ繰り下げて欠番を詰める(配列のsplice相当)。
// 【2026-08-14】当初delSel()から自動発動する形で実装したが、盛田さんより
// 「編集中に勝手に番号が動くと訳が分からなくなる」との指摘を受け、自動発動は
// 撤回。代わりに線番表(wireNoTable)に手動の「欠番を詰める」ボタンを設置し、
// 盛田さんが確認しながら明示的に実行するcompactAllWireNumbers()に一本化した。
// この関数自体は将来また使う可能性を考え残してあるが、現状どこからも自動では
// 呼ばれない。
function compactWireNumbersAfterRemoval(deletedNos) {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const stillUsed = new Set();
  state.pages.forEach(pg => (pg.wires||[]).forEach(w => { if (w.wireNo) stillUsed.add(w.wireNo); }));
  const removedNos = [...new Set(deletedNos)].filter(no => no && !stillUsed.has(no));
  if (!removedNos.length) return 0;

  const byPrefix = new Map();
  removedNos.forEach(no => {
    const p = parseWireNo(no);
    if (!p) return;
    if (!byPrefix.has(p.prefix)) byPrefix.set(p.prefix, []);
    byPrefix.get(p.prefix).push(p.num);
  });

  let shifted = 0;
  byPrefix.forEach((nums, prefix) => {
    nums.sort((a,b) => b - a); // 大きい番号から順に詰める(番号のズレを重複させないため)
    nums.forEach(delNum => {
      state.pages.forEach(pg => (pg.wires||[]).forEach(w => {
        if (!w.wireNo) return;
        const q = parseWireNo(w.wireNo);
        if (!q || q.prefix !== prefix || q.num <= delNum) return;
        w.wireNo = prefix + String(q.num - 1).padStart(q.digits, '0');
        shifted++;
      }));
    });
  });
  return shifted;
}

// 線番表の「欠番を詰める」ボタン: 現在使われている線番(ネット単位)の欠番を、
// prefixごとに一括で詰める(例: W001,W003,W005 → W001,W002,W003)。
// 削除のたびに自動発動すると「編集中に勝手に番号が変わって訳が分からなくなる」
// ため自動化はせず、盛田さんが線番表を開いて任意のタイミングで押した時だけ
// 動く手動操作とした。実行前に確認ダイアログを出す(Ctrl+Zで戻せる旨も表示)。
function compactAllWireNumbers() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  if (!confirm('現在使われている線番の欠番を詰めます(例: W001,W003,W005 → W001,W002,W003)。\n元に戻す場合はCtrl+Zで戻せます。実行しますか？')) return;
  pushH();
  const netsByPage = state.pages.map(pg => groupWiresByNet(pg.wires||[]));
  const usedByPrefix = new Map(); // prefix -> Map(num -> digits)
  state.pages.forEach((pg,pi) => {
    netsByPage[pi].forEach(idxs => {
      const wires = pg.wires;
      const no = idxs.map(i=>wires[i].wireNo).find(Boolean);
      if (!no) return;
      const p = parseWireNo(no);
      if (!p) return;
      if (!usedByPrefix.has(p.prefix)) usedByPrefix.set(p.prefix, new Map());
      usedByPrefix.get(p.prefix).set(p.num, p.digits);
    });
  });
  const remap = new Map(); // prefix -> Map(oldNum -> newNum)
  usedByPrefix.forEach((numMap, prefix) => {
    const nums = [...numMap.keys()].sort((a,b)=>a-b);
    const m = new Map();
    nums.forEach((n,i) => m.set(n, nums[0] + i));
    remap.set(prefix, m);
  });
  let changed = 0;
  state.pages.forEach(pg => (pg.wires||[]).forEach(w => {
    if (!w.wireNo) return;
    const p = parseWireNo(w.wireNo);
    if (!p) return;
    const m = remap.get(p.prefix);
    const newNum = m && m.get(p.num);
    if (newNum === undefined || newNum === p.num) return;
    w.wireNo = p.prefix + String(newNum).padStart(p.digits, '0');
    changed++;
  }));
  draw();
  wireNoTable(changed ? `欠番を詰めました(${changed}本の線番を更新)` : '欠番はありませんでした');
}

// ページ内の配線を、端点が重なっているもの同士(=同一ネット)でグループ化する。
// autoWireNumber()と編集可能な線番表(wireNoTable)の両方で共通利用する。
// 戻り値: [[wireIdx, wireIdx, ...], ...]  (1グループ=1ネット)
function groupWiresByNet(wires, tol) {
  tol = tol || WIRE_NET_TOL;
  if (!wires.length) return [];
  const bx = x => Math.round(x / tol);
  const parent = wires.map((_,i)=>i);
  function find(i){ while(parent[i]!==i){ parent[i]=parent[parent[i]]; i=parent[i]; } return i; }
  function union(a,b){ a=find(a); b=find(b); if(a!==b) parent[a]=b; }

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
        if (Math.hypot(q.x-p.x, q.y-p.y) <= tol) union(i,j);
      });
    }
  }));

  const groups = new Map();
  wires.forEach((_,i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return [...groups.values()];
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
//
// 【2026-08-14 追記】盛田さんより「途中で配線を追加/削除すると自動検知は無理、
// 一覧を直接編集してそれを配線に反映する形の方がよい」との方針決定。
// この一括割付ボタンは「まだ何も番号が振られていない配線に初期値を素早く入れる」
// 用途として残し、細かい調整・分断時の直しは編集可能な線番表(wireNoTable)側で行う
// 想定(自動検知はしない・一覧を見て手で直す運用)。
function autoWireNumber(){
  const start = prompt('一括割付の開始線番（例: W001）\n未採番の配線のみ、全ページ通しで割り付けます。\n接続されている配線群(同一ネット)は自動でまとめて同じ番号になります。\n(線番表でチェックを外したネットは対象外になります)', state.wireNoRule || 'W001');
  if (!start || !start.trim()) return;
  state.wireNoRule = start.trim();
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  pushH();
  const used = new Set();
  state.pages.forEach(pg => (pg.wires||[]).forEach(w => { if (w.wireNo) used.add(w.wireNo); }));
  let next = start.trim(), wireCnt = 0, netCnt = 0, conflictCnt = 0, excludedCnt = 0;

  state.pages.forEach(pg => {
    const wires = pg.wires || [];
    if (!wires.length) return;
    const groups = groupWiresByNet(wires);
    groups.forEach(idxs => {
      // 線番表でチェックを外した(noAutoNum)ネットは自動割付の対象外
      if (idxs.some(i => wires[i].noAutoNum)) { excludedCnt++; return; }
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
  if (conflictCnt) msg += `\n⚠同一ネット内に異なる既存線番が混在している箇所が${conflictCnt}件ありました(上書きしていません。線番表で確認・修正してください)`;
  if (excludedCnt) msg += `\nチェックを外したネット${excludedCnt}件は対象外にしました`;
  wireNoTable(msg);
  draw();
}

// 線番表: 全ページ・ネット単位(接続されている配線群=1行)で表示。
// 【2026-08-14 変更】以前は既存のwireNo文字列でグループ化する読み取り専用の表だったが、
// 「配線の追加/削除で番号がズレたことは自動検知できないので、一覧を直接編集して
// 配線に反映する形にしたい」との方針決定を受け、ネット単位(groupWiresByNet)の
// 行を出し、線番の入力欄をその場で編集→即座に配線プロパティへ反映する方式に変更。
// 配線を追加すれば新しい未採番ネットの行が増え、削除すれば該当ネットの行(または
// 分断されて2行)が変わるので、一覧を見るだけで最新状態を把握できる。
function wireNoTable(msg){
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const rows = []; // { pageIdx, pname, idxs, wireNo, conflict, autoNum }
  let total = 0, unnumbered = 0;
  state.pages.forEach((pg, pi) => {
    const pname = pg.name || ('Sheet'+(pi+1));
    const wires = pg.wires || [];
    total += wires.length;
    const groups = groupWiresByNet(wires);
    groups.forEach(idxs => {
      const existingNums = [...new Set(idxs.map(i => wires[i].wireNo).filter(Boolean))];
      const wireNo = existingNums[0] || '';
      if (!wireNo) unnumbered += idxs.length;
      const autoNum = !idxs.some(i => wires[i].noAutoNum); // 1つでも対象外フラグがあればチェック外
      rows.push({ pageIdx: pi, pname, idxs, wireNo, conflict: existingNums.length > 1, autoNum });
    });
  });
  // 未採番のネットを先頭に、それ以降は線番の自然順ソート
  rows.sort((a,b) => {
    if (!a.wireNo && b.wireNo) return -1;
    if (a.wireNo && !b.wireNo) return 1;
    return String(a.wireNo).localeCompare(String(b.wireNo),'ja',{numeric:true}) || a.pageIdx-b.pageIdx;
  });

  let html = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`;
  if (msg) html += msg.replace(/\n/g,'<br>') + '<br>';
  html += `配線 全${total}本 / ネット ${rows.length}件`;
  if (unnumbered) html += ` / <span style="color:var(--red);font-weight:600">未採番 ${unnumbered}本</span>`;
  html += `<br>線番欄を直接編集すると、そのネット(繋がっている配線群)全体に即反映されます。`;
  html += `<br>チェックを外すと「線番割付」ボタンでの自動採番の対象外になります(手入力は可能なまま)。`;
  html += `<br>配線を追加/削除した後は、この一覧を開き直して未採番(赤)や分断(橙)がないか確認してください。`;
  html += `<br><button onclick="compactAllWireNumbers()" title="削除等で欠番になった線番を詰めます(例: W001,W003,W005 → W001,W002,W003)。編集中に自動では動きません、このボタンを押した時だけ実行されます" style="margin-top:4px;font-size:10px;padding:2px 8px;cursor:pointer;border:1px solid var(--bd2);border-radius:3px;background:var(--bg2);color:var(--fg)">欠番を詰める</button>`;
  html += `</p>`;
  html += `<table class="tbl"><tr><th></th><th></th><th>線番</th><th>ページ</th><th>本数</th><th></th></tr>`;
  // 線番文字列をonclick内のJS文字列リテラルに安全に埋め込むための簡易エスケープ
  const esc = s => String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  rows.forEach((r, ri) => {
    const badgeCls = r.conflict ? 'badge-o' : 'badge-b';
    const title = r.conflict ? 'title="⚠このネット内に異なる既存線番が混在しています。編集すると統一されます"' : '';
    const prev = rows[ri-1], next = rows[ri+1];
    const btnStyle = 'font-size:9px;line-height:1;padding:1px 3px;cursor:pointer;border:1px solid var(--bd2);border-radius:2px;background:var(--bg2);color:var(--fg)';
    const upBtn = prev
      ? `<button title="ひとつ上の行と線番を入れ替え" onclick="swapNetWireNo(${r.pageIdx},[${r.idxs.join(',')}],'${esc(r.wireNo)}',${prev.pageIdx},[${prev.idxs.join(',')}],'${esc(prev.wireNo)}')" style="${btnStyle}">▲</button>`
      : `<button disabled style="${btnStyle};opacity:.3">▲</button>`;
    const downBtn = next
      ? `<button title="ひとつ下の行と線番を入れ替え" onclick="swapNetWireNo(${r.pageIdx},[${r.idxs.join(',')}],'${esc(r.wireNo)}',${next.pageIdx},[${next.idxs.join(',')}],'${esc(next.wireNo)}')" style="${btnStyle}">▼</button>`
      : `<button disabled style="${btnStyle};opacity:.3">▼</button>`;
    const delBtn = `<button title="このネットの配線ごと削除し、欠番を自動で詰めます" onclick="deleteNetFromList(${r.pageIdx},[${r.idxs.join(',')}])" style="${btnStyle};color:var(--red)">×</button>`;
    const chk = `<input type="checkbox" ${r.autoNum?'checked':''} title="チェックを外すと「線番割付」ボタンでの自動採番の対象外になります" onchange="toggleNetAutoNum(${r.pageIdx},[${r.idxs.join(',')}],this.checked)">`;
    html += `<tr ${title}>` +
      `<td>${chk}</td>` +
      `<td style="white-space:nowrap">${upBtn}${downBtn}</td>` +
      `<td><input type="text" value="${r.wireNo}" placeholder="未採番" ` +
      `onchange="applyNetWireNo(${r.pageIdx},[${r.idxs.join(',')}],this.value)" ` +
      `style="width:80px;font-size:11px;padding:2px 4px;border:1px solid ${r.conflict?'#f59e0b':'var(--bd2)'};border-radius:3px;background:var(--bg2);color:var(--fg)"></td>` +
      `<td>${r.pname}</td>` +
      `<td><span class="badge ${badgeCls}">${r.idxs.length}</span></td>` +
      `<td>${delBtn}</td>` +
      `</tr>`;
  });
  html += `</table>`;
  _reportOpen('wire', '線番 一覧(編集可)', html, exportWireCSV);
}

// 線番表のチェックボックス: ネット単位で「線番割付(自動採番)」の対象外にする。
// デフォルトは全チェック(=対象)。外すとwires[].noAutoNum=trueが立ち、
// autoWireNumber()の一括割付でスキップされる(手動でこの一覧に直接入力するのは
// 引き続き可能)。
function toggleNetAutoNum(pageIdx, idxs, checked) {
  const pg = state.pages[pageIdx];
  if (!pg || !pg.wires) return;
  pushH();
  idxs.forEach(i => { if (pg.wires[i]) pg.wires[i].noAutoNum = !checked; });
  draw();
}

// 線番表の×ボタン: そのネットの配線を実際に削除し、続けて欠番を自動で詰める。
// 【設計方針】キャンバス上でのDelete削除は「編集中に勝手に番号が動くと訳が
// 分からなくなる」ため自動詰めをやめて手動ボタン(compactAllWireNumbers)にしたが、
// この一覧からの削除は盛田さんが線番表を見ながら意図して行う操作なので、
// 削除と同時に自動で詰めてよい、という区別。
function deleteNetFromList(pageIdx, idxs) {
  const pg = state.pages[pageIdx];
  if (!pg || !pg.wires) return;
  const targetIds = idxs.map(i => pg.wires[i] && pg.wires[i].id).filter(Boolean);
  if (!targetIds.length) return;
  const delNo = idxs.map(i => pg.wires[i] && pg.wires[i].wireNo).find(Boolean);
  if (!confirm(`このネット(配線${targetIds.length}本${delNo?'、線番'+delNo:'(未採番)'})を削除しますか？\n削除後、欠番があれば自動で詰めます。元に戻す場合はCtrl+Zで戻せます。`)) return;
  pushH();
  const idSet = new Set(targetIds);
  pg.wires = pg.wires.filter(w => !idSet.has(w.id));
  // 消した配線がグループに入っていた場合の参照を掃除する
  if (typeof pruneGroups === 'function') pruneGroups(pg);
  if (delNo) compactWireNumbersAfterRemoval([delNo]);
  draw();
  wireNoTable();
}

// 線番表の▲▼ボタン: 隣り合う2つのネットの線番を入れ替える
function swapNetWireNo(pageA, idxsA, noA, pageB, idxsB, noB) {
  const pgA = state.pages[pageA], pgB = state.pages[pageB];
  if (!pgA || !pgB) return;
  pushH();
  idxsA.forEach(i => { if (pgA.wires[i]) pgA.wires[i].wireNo = noB; });
  idxsB.forEach(i => { if (pgB.wires[i]) pgB.wires[i].wireNo = noA; });
  draw();
  wireNoTable();
}

// 線番表の入力欄編集→即座にネット内全配線のwireNoへ反映する
// 線番表の入力欄編集→即座にネット内全配線のwireNoへ反映する。
// 【2026-08-14】盛田さんより「追加配線が既存の番号と被る可能性を考慮しているか」
// との指摘を受け、手入力時のみ重複チェックが無かった穴を修正。自動割付
// (autoWireNumber)は既存番号を避けて発番するため元々問題なかったが、この
// 手入力の経路だけ無防備だった。繋がっていない別ネットに同じ番号を入れようと
// した場合は確認を挟む(ページをまたいで同じ物理配線を意図的に同番にする
// 実務上のケースもあるため、完全ブロックはせず警告のみ)。
function applyNetWireNo(pageIdx, wireIdxs, value) {
  const pg = state.pages[pageIdx];
  if (!pg || !pg.wires) return;
  const v = (value||'').trim();
  if (v) {
    const idsInThisNet = new Set(wireIdxs.map(i => pg.wires[i] && pg.wires[i].id).filter(Boolean));
    let usedElsewhere = false;
    state.pages.forEach(p => (p.wires||[]).forEach(w => {
      if (w.wireNo === v && !idsInThisNet.has(w.id)) usedElsewhere = true;
    }));
    if (usedElsewhere) {
      const p = parseWireNo(v);
      const doShift = confirm(
        p
        ? `線番「${v}」は既に別の配線で使われています。\n[OK] ここに割り込ませて、「${v}」以降の番号を1つずつ繰り上げます(例: 1,2,3の間に割り込み→1,2,3,4)\n[キャンセル] 何もしません`
        : `線番「${v}」は既に別の配線で使われています。同じ番号のまま登録しますか？\n(数字を含まない線番は自動繰り上げができないため、意図的な重複として扱われます)`
      );
      if (!doShift) return;
      pushH();
      if (p) {
        // v以上の番号(このネット自身は除く)を、大きい方から順に1つずつ繰り上げて場所を空ける
        const toShift = [];
        state.pages.forEach(pg2 => (pg2.wires||[]).forEach(w => {
          if (!w.wireNo || idsInThisNet.has(w.id)) return;
          const q = parseWireNo(w.wireNo);
          if (q && q.prefix === p.prefix && q.num >= p.num) toShift.push(w);
        }));
        toShift.sort((a,b) => parseWireNo(b.wireNo).num - parseWireNo(a.wireNo).num);
        toShift.forEach(w => {
          const q = parseWireNo(w.wireNo);
          w.wireNo = q.prefix + String(q.num + 1).padStart(q.digits, '0');
        });
      }
      wireIdxs.forEach(i => { if (pg.wires[i]) pg.wires[i].wireNo = v; });
      draw();
      wireNoTable();
      return;
    }
  }
  pushH();
  wireIdxs.forEach(i => { if (pg.wires[i]) pg.wires[i].wireNo = v; });
  draw();
  wireNoTable();
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
        if(!devices[key])devices[key]={spellings:new Map(),models:new Set(),types:new Set(),
                                       volts:new Set(),els:[],parts:0};
        const dv=devices[key];
        dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
        dv.parts++;
        dv.types.add(el.type);
        dv.els.push(el);
        const m=(el.partModel||'').trim();
        if(m)dv.models.add(m);
        // コイル電圧は同じデバイス内では1つに決まるはず。
        // 複数あれば設定ミスなので警告に出す。
        const vv=(el.partVolt||'').trim();
        if(vv)dv.volts.add(vv);
      }else{
        const name=(el.partModel||'').trim()||el.label||el.type;
        const k=`${el.type}|${name}`;
        if(!noRef[k])noRef[k]={type:el.type,model:(el.partModel||'').trim(),label:name,
                               refs:[],count:0,parts:0,jis:getDef(el.type)?.jis||'',noRef:true,warn:''};
        noRef[k].count++; noRef[k].parts++;
      }
    });
    // グループが持つデバイス(部品外形図など)も集計する。
    // 外形図は数十本の線の集まりなので、デバイスはグループ側が持っている。
    // partRefが同じなら展開接続図のシンボルと同じ1台にまとまる(二重計上しない)。
    (pg.groups||[]).forEach(g=>{
      const raw=(g.partRef||'').trim();
      const key=normalizeRef(raw);
      if(!key)return;
      if(!devices[key])devices[key]={spellings:new Map(),models:new Set(),types:new Set(),
                                     volts:new Set(),els:[],parts:0};
      const dv=devices[key];
      dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
      const m=(g.partModel||'').trim();
      if(m)dv.models.add(m);
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
    const volts=[...dv.volts];
    const volt=volts[0]||'';
    // 型番が同じでもコイル電圧が違えば別部品なので行を分ける
    const k=(model||`(型番未設定)|${primary}`)+'\u0000'+volt;
    if(!byModel[k])byModel[k]={type:primary,model,volt,label:model||'(型番未設定)',
                               refs:[],els:[],count:0,parts:0,jis:getDef(primary)?.jis||'',noRef:false,warn:''};
    const row=byModel[k];
    row.refs.push(ref);
    row.els.push(...dv.els);
    row.count++;                 // 台数 = デバイス数
    row.parts+=dv.parts;         // 構成要素数(接点・端子の個数)
    const ws=[];
    if(spells.length>1)ws.push(`${ref}に表記ゆれ(${spells.map(s=>s[0]).join(' / ')})`);
    if(models.length>1)ws.push(`${ref}に型番が複数(${models.join(' / ')})`);
    if(volts.length>1)ws.push(`${ref}にコイル電圧が複数(${volts.join(' / ')})`);
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
  // 部品表でもコイル電圧を変えられるようにする(プロパティとどちらでも変更できる)。
  // 変更するとその行に属する要素すべてに反映され、型番＋電圧で行がまとめ直される。
  window._bomRows = rows;
  const voltCell = (r, i) => {
    if (r.noRef || !r.model) return '<td style="color:var(--fg3)">-</td>';
    const opts = (typeof partVoltOptions === 'function') ? partVoltOptions(r.model) : [];
    if (!opts.length) return '<td style="color:var(--fg3)">-</td>';
    if (opts.length === 1) return `<td style="color:var(--fg2)">${opts[0]}</td>`;
    const cur = r.volt && opts.includes(r.volt) ? r.volt : opts[0];
    return `<td><select onchange="setBOMVolt(${i}, this.value)" style="font-size:11px">`
      + opts.map(o => `<option value="${o}"${o === cur ? ' selected' : ''}>${o}</option>`).join('')
      + `</select></td>`;
  };
  let html=rows.length
    ?head+`<table class="tbl"><tr><th>型番/名称</th><th>コイル電圧</th><th>種別</th><th>JIS</th><th>デバイス</th><th>数量(台)</th><th>構成数</th></tr>`
      +rows.map((r,i)=>`<tr${r.noRef?' style="background:var(--rbg)"':''}>`
        +`<td>${r.label}${r.warn?` <span style="color:var(--red);font-size:10px">⚠${r.warn}</span>`:''}</td>`
        +voltCell(r,i)
        +`<td>${r.type}</td><td style="color:var(--acc)">${r.jis}</td>`
        +`<td style="font-size:10px;color:var(--fg3)">${r.noRef?'<span style="color:var(--red)">未設定</span>':(r.refs.join(', ')||'-')}</td>`
        +`<td style="font-weight:600">${r.count}</td><td style="color:var(--fg3)">${r.parts}</td></tr>`).join('')
      +`</table>`
    :'<p style="font-size:11px;color:var(--fg3)">配置されたシンボルがありません</p>';
  _reportOpen('bom', '部品表 (BOM)', html, exportBOMCSV);
}
// 部品表のセルから電圧を変更する。その行の全要素に書き戻して表を作り直す。
function setBOMVolt(idx, volt){
  const r=(window._bomRows||[])[idx];
  if(!r)return;
  if(typeof pushH==='function')pushH();   // 変更前の状態を履歴に積む
  (r.els||[]).forEach(el=>{ el.partVolt=volt||undefined; });
  if(typeof draw==='function')draw();
  if(typeof updateRightPanel==='function')updateRightPanel();
  showBOM();   // 型番＋電圧でまとめ直す
}
function exportBOMCSV(){
  const rows=collectBOMRows();
  dl(['型番/名称,コイル電圧,種別,JIS規格,デバイス,数量(台),構成数,備考',
      ...rows.map(r=>`${r.label},${r.volt||''},${r.type},${r.jis},"${r.noRef?'未設定':r.refs.join('/')}",${r.count},${r.parts},${r.warn||''}`)
     ].join('\n'),'bom.csv','text/csv');
}
// 要素の役割を判定する。
// カスタムシンボルはシンボル登録/端子編集で指定した role を使う。
// 標準シンボルは DEFS の isCoil / isContact + contactType から導く。
// ================================================================
// 図面区画（ゾーン）の算出
//
// 「このシンボルは2ページのB3区画にある」という形で位置を示すために、
// ワールド座標から区画名を求める。
//
// 区画割りの寸法計算とラベル生成は frame.js の frameGeom() / zoneColLabel() /
// zoneRowLabel() に集約してあり、図面枠の描画(drawFrame)と同じものを使っている。
// そのため枠のデザインを変えても、frame.js側を直せば区画表示も自動で追随する。
// ここで独自に寸法計算を書き直さないこと（以前それをやって二重管理になっていた）。
//
// 図面枠はワールド座標の原点(0,0)を左上として描かれる。
// ================================================================
function zoneOf(x, y, fr) {
  if (!fr || fr.isCover) return '';
  if (typeof frameGeom !== 'function') return '';
  const g = frameGeom(fr);
  if (!g || !g.cols || !g.rows) return '';
  if (g.innerW <= 0 || g.drawH <= 0) return '';

  // 区画が振られている範囲（作図領域）の外にある要素
  if (x < g.x0 || x > g.x1 || y < g.y0 || y > g.y1) return '枠外';

  const c = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.x0) / g.colW)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor((y - g.y0) / g.rowH)));
  return zoneColLabel(c) + zoneRowLabel(r);
}

// 要素の代表座標を返す。シンボルは(x,y)を持つが、線分系は始点しか持たない。
function elAnchor(el) {
  if (el.x != null && el.y != null) return { x: el.x, y: el.y };
  if (el.x1 != null && el.y1 != null) return { x: el.x1, y: el.y1 };
  return null;
}

// 要素が何ページの何区画にあるかを「2/B3」形式で返す。
// 作図領域の外(余白・表題欄の中・用紙の外)にある要素は「2/枠外」と返す。
// 図面枠そのものが無いページはページ番号だけを返す。
// 「枠が無い」のか「枠の外にはみ出している」のかを区別できるようにしてある。
function elLocation(el, pageIdx) {
  const pg = state.pages[pageIdx];
  const p = elAnchor(el);
  const z = (p && pg) ? zoneOf(p.x, p.y, pg.frameObj) : '';
  return z ? `${pageIdx + 1}/${z}` : String(pageIdx + 1);
}

function symRole(el){
  const d=getDef(el.type)||{};
  if(d.role)return d.role;                       // 'coil' | 'contact_a' | 'contact_b'
  if(d.isCoil)return 'coil';
  if(d.isContact)return d.contactType==='b'?'contact_b':'contact_a';
  return '';
}

// 配置した1個のシンボル(el)が実際に使っている端子番号を「13-14」のように返す。
// conn_table.js の collectTerminalPoints() と同じ優先順位で決める:
// ①el.terminals(部品割当時の個体差。同じ接点シンボルでも主接点13-14/補助接点23-24
// のように配置ごとに異なる) ②cS.terminals[i].label(シンボル定義側の既定ラベル)。
// どちらも無ければその桁は空扱いにする(通し番号T1,T2はRef表では意味が薄いため使わない)。
// カスタムシンボルはcS.terminalsの点数、標準シンボルは2点(端子台一覧と同じ前提)とする。
function elTerminalLabel(el){
  const cS=(state.customSymbols||[]).find(s=>s.type===el.type);
  const rawList=(el.terminals||'').split(',').map(t=>t.trim());
  const n=(cS&&cS.terminals)?cS.terminals.length:2;
  const labels=[];
  for(let i=0;i<n;i++){
    const defLabel=(cS&&cS.terminals&&cS.terminals[i])?(cS.terminals[i].label||''):'';
    const lbl=rawList[i]||defLabel;
    if(lbl)labels.push(lbl);
  }
  return labels.join('-');
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
      const rec={el,page:pi+1,role,loc:elLocation(el,pi),term:elTerminalLabel(el)};
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
    // 同じ役割・同じ端子番号の接点が2つ以上あれば、同じ物理接点を重複して
    // 描いている可能性が高い(端子番号が無い接点は判定対象外)
    const termCount={};
    dv.contacts.forEach(c=>{ if(c.term)termCount[c.role+':'+c.term]=(termCount[c.role+':'+c.term]||0)+1; });
    const dupTerms=Object.keys(termCount).filter(k=>termCount[k]>1).map(k=>k.split(':')[1]);
    if(dupTerms.length)warns.push(`端子番号重複: ${dupTerms.join(', ')}`);
    // locは「2/B3」(ページ/区画)形式。図面枠が無いページはページ番号だけになる
    const badge=c=>`<span class="badge badge-${c.role==='contact_a'?'g':'b'}">`
      +`${c.role==='contact_a'?'a':'b'}${c.term?`(${c.term})`:''} ${c.loc}</span>`;
    const coilTxt=dv.coils.length
      ? dv.coils.map(c=>`<span class="badge badge-p">${c.loc}</span>`).join(' ')
      : '<span class="badge" style="background:var(--rbg);color:var(--red)">未配置</span>';
    return `<tr><td><b>${name}</b>${warns.length
        ?`<br><span style="color:var(--red);font-size:10px">⚠ ${warns.join(' / ')}</span>`:''}</td>`
      +`<td>${coilTxt}</td>`
      +`<td>${dv.contacts.map(badge).join(' ')||'なし'}</td>`
      +`<td>${dv.contacts.length}</td></tr>`;
  }).join('');

  const noFrame=state.pages.some(pg=>!pg.frameObj||!pg.frameObj.cols);
  const html=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    +`全${state.pages.length}ページ集計。位置は「ページ/区画」で表示します(例: 2/B3)。`
    +(noFrame?`<br><span style="color:var(--red)">図面枠が未設定のページは区画が出せないため、ページ番号のみ表示しています。</span>`:'')
    +`</p>`
    +`<table class="tbl"><tr><th>デバイス</th><th>コイル</th><th>接点</th><th>接点数</th></tr>${rows}</table>`;
  _reportOpen('ref', '接点・コイル リファレンス', html, () => exportRefCSV(devs));
}

// 接点・コイルリファレンスをCSVで書き出す
function exportRefCSV(devs){
  const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const lines=['デバイス,コイル位置,接点種別,端子番号,接点位置'];
  Object.keys(devs).sort().forEach(k=>{
    const dv=devs[k];
    const spells=[...dv.spellings.entries()].sort((a,b)=>b[1]-a[1]);
    const name=spells.length?spells[0][0]:'(デバイス未設定)';
    const coilLoc=dv.coils.map(c=>c.loc).join(' ');
    if(!dv.contacts.length){
      lines.push([name,coilLoc,'','',''].map(esc).join(','));
      return;
    }
    dv.contacts.forEach(c=>{
      lines.push([name,coilLoc,c.role==='contact_a'?'a接点':'b接点',c.term||'',c.loc].map(esc).join(','));
    });
  });
  dl(lines.join('\n'),'cross_reference.csv','text/csv');
}
// 端子台の端子を集める共通ヘルパー。「端子台表」(showTBTable)から使う。
//
// 【2026-08-22】もともと「端子台一覧」と「端子台表」という2つのタブが
// どちらも○/◎の端子を集計しており、完全に重複していた。盛田さんの
// 「端子台、端子表、端子台表とわけがわからん」「不要なものはなくせ」との
// 指摘を受け、接続線番と未接続チェックを持つ「端子台表」に一本化し、
// 「端子台一覧」タブは廃止した。ここに残した収集・グループ化の処理は
// そのとき端子台表へ引き継いだもの。
//
// なお旧「端子台一覧」は type==='terminal' のシンボルを拾っており、実際に
// 配置している端子(type==='junction' の circle/dbl)を1件も拾えていなかった。
// さらに現在ページしか見ておらずページをまたぐ端子台にも未対応だった。
//
// 端子台は「TB1という1台に端子が複数」という構造なので、デバイス(partRef)で
// グループ化する。並び順は tbOrder(端子台表で並べ替えた結果)があればそれに
// 従い、無ければページ順→配置順とする(既存図面との互換)。
function collectTerminals() {
  const out = [];
  state.pages.forEach((pg, pi) => {
    (pg.elements || []).forEach(el => {
      if (el.type !== 'junction') return;
      if (el.style !== 'circle' && el.style !== 'dbl') return;  // ●分岐点は端子ではない
      out.push({ el, page: pi, loc: elLocation(el, pi) });
    });
  });
  // tbOrder があるものを優先し、無いものは後ろに元の順で残す
  out.forEach((r, i) => { r._seq = i; });
  out.sort((a, b) => {
    const ao = a.el.tbOrder, bo = b.el.tbOrder;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return a._seq - b._seq;
  });
  return out;
}

// デバイス(TB1等)ごとにまとめる。デバイス未設定のものは「(デバイス未設定)」へ。
function groupTerminalsByDevice(rows) {
  const g = new Map();
  rows.forEach(r => {
    const key = (r.el.partRef || '').trim() || '(デバイス未設定)';
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(r);
  });
  return g;
}

// ================================================================
// 端子台表での並べ替えと番号の振り直し（2026-08-22）
// ----------------------------------------------------------------
// 盛田さんの要望:
//   「デバイスだけ指定しとけばあとは自動番号振りして、端子表で並びを変えたら
//     その順番で番号振り直せるか？」
// 図面上の位置からは並び順を決められない（ページを跨ぐ・同じページでも書いた
// 位置で先頭が変わる）ため、端子台表を並び順の正とする。並べ替えた結果は
// el.tbOrder に保存し、collectTerminals() がそれに従って並べる。
//
// 番号の振り直しは「表示されている順に1から」振る単機能。これで
//   ・新規の端子台に一気に番号を振る
//   ・途中に端子を挿入して以降を繰り上げる
//   ・端子台ごと番号を振り直す
// のいずれもまかなえる。
// ================================================================

let _tbDragId = null;

function tbDragStart(ev, elId) {
  _tbDragId = elId;
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; }
  if (ev.currentTarget && ev.currentTarget.style) ev.currentTarget.style.opacity = '0.4';
}

function tbDragOver(ev) {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
}

function tbDragEnd(ev) {
  if (ev.currentTarget && ev.currentTarget.style) ev.currentTarget.style.opacity = '';
  _tbDragId = null;
}

// ドラッグした端子を、落とした先の端子の位置へ移動する。
function tbDrop(ev, targetId) {
  ev.preventDefault();
  const dragId = _tbDragId;
  _tbDragId = null;
  if (!dragId || dragId === targetId) return;
  if (typeof pushH === 'function') pushH();
  reorderTerminal(dragId, targetId);
  if (typeof draw === 'function') draw();
  showTBTable();            // 並べ替え後の順で描き直す
}

// 並び順の実処理。現在の並びの中で dragId を targetId の位置へ差し込み、
// 全端子に tbOrder を振り直す（欠番や重複が残らないようにするため）。
function reorderTerminal(dragId, targetId) {
  const rows = collectTerminals();
  const from = rows.findIndex(r => String(r.el.id) === String(dragId));
  const to   = rows.findIndex(r => String(r.el.id) === String(targetId));
  if (from < 0 || to < 0) return;
  const moved = rows.splice(from, 1)[0];
  rows.splice(to, 0, moved);
  rows.forEach((r, i) => { r.el.tbOrder = i; });
}

// 指定デバイスの端子番号を、表示されている順に1から振り直す。
function renumberTerminals(dev) {
  const groups = groupTerminalsByDevice(collectTerminals());
  const list = groups.get(dev);
  if (!list || !list.length) return;
  if (typeof pushH === 'function') pushH();
  list.forEach((r, i) => { r.el.label = String(i + 1); });
  if (typeof draw === 'function') draw();
  showTBTable();
}



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
// DXF・印刷
// ================================================================

// ================================================================
// PDF出力（ベクター：jsPDF直接API）
// ================================================================
