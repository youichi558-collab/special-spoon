// ================================================================
// 帳票パネル共通ヘルパー（部品表・線番表・端子台一覧・端子表・接続表・
// 端子台表・接点Refを1つのパネル内タブとして切替表示する）
// ================================================================
const REPORT_TABS = [
  { key:'bom',     label:'部品表',       call:'showBOM()' },
  { key:'wire',    label:'線番表',       call:'wireNoTable()' },
  { key:'conntbl', label:'接続チェック', call:'showConnTable()' },
  { key:'tbtbl',   label:'端子台表',     call:'showTBTable()' },
  { key:'ref',     label:'接点Ref',      call:'showRefPanel()' },
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
//
// 【2026-09-25】1つのネットに異なる線番が混在しているときは実行しない(盛田さんの決定A)。
// 混在ネットは最初の番号しか「使用中」に数えないため、残りの番号が空き扱いになり、
// 別の線がその番号へ詰められて重複していた(例: W01/W02混在+W03 → W03がW02になる)。
// 分岐点(●)でつなぐようにした(同日)ため、分岐先に別番号が入っていた図面で起きやすい。
// どちらの番号に揃えるかは人が決めることなので、線番表でそろえてもらう。
function compactAllWireNumbers() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const netsByPage = state.pages.map(pg => groupWiresByNet(pg.wires||[], null, pg.elements));
  let mixed = 0;
  state.pages.forEach((pg,pi) => netsByPage[pi].forEach(idxs => {
    if (new Set(idxs.map(i => pg.wires[i].wireNo).filter(Boolean)).size > 1) mixed++;
  }));
  if (mixed) {
    alert(`つながっている配線(ネット)の中に異なる線番が混在している箇所が${mixed}件あります。\n`
      + `このまま詰めると線番が重複するため、実行しません。\n`
      + `線番表の橙色の欄で番号をそろえてから、もう一度押してください。`);
    wireNoTable(`⚠混在${mixed}件のため欠番を詰めませんでした(橙色の欄をそろえてください)`);
    return;
  }
  if (!confirm('現在使われている線番の欠番を詰めます(例: W001,W003,W005 → W001,W002,W003)。\n元に戻す場合はCtrl+Zで戻せます。実行しますか？')) return;
  pushH();
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
//
// 【2026-09-25】elements(そのページの要素)を渡すと、分岐点(●)も見る。
// 以前は配線の「端どうし」の重なりしか見ておらず、T字の分岐(1本が●を通り抜け、
// 別の1本がそこで終わる)が別ネットに割れていた。盛田さんのSheet3では分岐点24個中
// 18個がこの形で、分岐先の線が未採番のまま別の行になっていた。
// 盛田さんの決定は「●がある所だけつなぐ」(B)。●の無いT字・単なる交差はつながない。
// ●に端が乗っている配線と、●の上を通り抜けている配線を全部同じネットにする。
// style未設定のjunctionは●扱い(draw.js の drawJunctionEl と同じ)。
//
// 【2026-09-25 同日追記】端子台の端子(○/◎)も、両側の線を同じネットにする。
// 盛田さん「端子台接続になっているから線番がないわけではない」。端子の円の縁から出た
// 線どうし(TB2の端子(半径3)の上下: 267 と 273)は中心から離れていて端が重ならず、
// 片側が未採番の別行になっていた。端子の円に**端が乗っている**配線(中心から半径+許容誤差
// 以内)をつなぐ。端子の上を通り抜けるだけの配線はつながない。Sheet3で未採番4→0・混在0。
function groupWiresByNet(wires, tol, elements) {
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

  // 分岐点(●)に触れている配線(端が乗る・途中を通る)をまとめる
  const segDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx*dx + dy*dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / L)) : 0;
    return Math.hypot(a.x + t*dx - p.x, a.y + t*dy - p.y);
  };
  (elements || []).forEach(el => {
    if (el.type !== 'junction') return;
    const style = el.style || 'dot';
    if (style === 'circle' || style === 'dbl') {
      // 端子台の端子: 円に端が乗っている配線をつなぐ(上のコメント参照)
      const reach = (el.r || 5) + tol;
      let first = -1;
      wires.forEach((w, i) => {
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        const ends = [pts[0], pts[pts.length-1]];
        if (!ends.some(p => Math.hypot(p.x - el.x, p.y - el.y) <= reach)) return;
        if (first < 0) first = i; else union(first, i);
      });
      return;
    }
    if (style !== 'dot') return;
    let first = -1;
    wires.forEach((w, i) => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      let touch = false;
      for (let k = 0; k + 1 < pts.length && !touch; k++) {
        if (segDist(el, pts[k], pts[k+1]) <= tol) touch = true;
      }
      if (!touch) return;
      if (first < 0) first = i; else union(first, i);
    });
  });

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
    const groups = groupWiresByNet(wires, null, pg.elements);
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
    const groups = groupWiresByNet(wires, null, pg.elements);
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
  html += `<br>行を押すと、この一覧を閉じて図面のその配線へ移動し、選択します(線番はプロパティ欄でも打てます)。`;
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
    // 【2026-09-25】行を押すと図面のそのネットへ飛ぶ(盛田さん「線番が無いことはわかるが
    // それがどれなのかは不明」)。欄・ボタン・チェックを押したときは飛ばない。
    const jump = `onclick="if(!/^(INPUT|BUTTON|SELECT)$/.test(event.target.tagName))jumpToNet(${r.pageIdx},[${r.idxs.join(',')}])"`;
    html += `<tr ${title} ${jump} style="cursor:pointer">` +
      `<td>${chk}</td>` +
      `<td style="white-space:nowrap">${upBtn}${downBtn}</td>` +
      `<td><input type="text" value="${escH(r.wireNo)}" placeholder="未採番" ` +
      `onchange="applyNetWireNo(${r.pageIdx},[${r.idxs.join(',')}],this.value)" ` +
      `style="width:80px;font-size:11px;padding:2px 4px;border:1px solid ${r.conflict?'#f59e0b':'var(--bd2)'};border-radius:3px;background:var(--bg2);color:var(--fg)"></td>` +
      `<td>${escH(r.pname)}</td>` +
      `<td><span class="badge ${badgeCls}">${r.idxs.length}</span></td>` +
      `<td>${delBtn}</td>` +
      `</tr>`;
  });
  html += `</table>`;
  _reportOpen('wire', '線番 一覧(編集可)', html, exportWireCSV);
}

// 線番表の行を押したとき: そのネットのページへ切り替え、配線を選択して画面中央に出し、
// 2秒点滅させる(検索 search.js の jumpToHit と同じ動き・同じ点滅マーカー)。
// 点滅はネットの最初の配線の中点。未採番の行はたいてい1本なのでその線そのものを指す。
// 帳票パネル(幅1040px)が画面中央を覆って飛んだ先が見えないため、パネルは閉じる。
// 配線は選ばれたままなので、右のプロパティの「線番」欄にそのまま打てる。
function jumpToNet(pageIdx, idxs) {
  const pg = state.pages[pageIdx];
  if (!pg || !pg.wires) return;
  const ws = idxs.map(i => pg.wires[i]).filter(Boolean);
  if (!ws.length) return;
  if (typeof closeFP === 'function') closeFP('report-p');
  if (pageIdx !== state.currentPage && typeof switchPage === 'function') switchPage(pageIdx);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ws.forEach(w => (w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(p => {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }));
  if (state.zoom < 1) state.zoom = 1;
  state.pan.x = cv.width  / 2 - (x0 + x1) / 2 * state.zoom;
  state.pan.y = cv.height / 2 - (y0 + y1) / 2 * state.zoom;
  state.sel.els.clear(); state.sel.wires.clear();
  ws.forEach(w => { if (w.id) state.sel.wires.add(w.id); });
  if (typeof updateResizeHandles === 'function') updateResizeHandles();
  if (typeof updateRightPanel === 'function') updateRightPanel();
  const f = ws[0].pts || [{x:ws[0].x1,y:ws[0].y1},{x:ws[0].x2,y:ws[0].y2}];
  const a = f[0], b = f[f.length - 1];
  state.searchHit = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t0: Date.now() };
  const anim = () => {
    if (!state.searchHit) return;
    if (Date.now() - state.searchHit.t0 > 2000) { state.searchHit = null; draw(); return; }
    draw();
    requestAnimationFrame(anim);
  };
  anim();
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
  dl(rows.join('\n'), _csvName('配線番号'), 'text/csv');
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
      // 【2026-09-25】配線の分岐点(●)は部品ではない(盛田さん)。以前は「デバイス未設定」に
      // junction ○台 として載っていた。style未設定も●扱い(draw.js と同じ)。端子台の○/◎は残す。
      if(el.type==='junction'&&(el.style||'dot')==='dot')return;
      const raw=(el.partRef||'').trim();
      const key=normalizeRef(raw);
      if(key){
        if(!devices[key])devices[key]={spellings:new Map(),models:new Set(),types:new Set(),
                                       volts:new Set(),makers:new Set(),names:new Set(),notes:new Set(),zones:new Set(),els:[],parts:0};
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
        // 【2026-09-21】メーカー。盛田さん「メーカー名は必要、発注もできん」。
        // 図面の要素自身に持たせる(型番・仕様と同じ扱い)。部品表から手で
        // 打った値がここに入る。
        const mk=(el.partMaker||'').trim();
        if(mk)dv.makers.add(mk);
        // 名称(「電磁接触器」等)と備考。どちらも部品表で手打ちする。
        const nm=(el.partName||'').trim();
        if(nm)dv.names.add(nm);
        const nt=(el.partNote||'').trim();
        if(nt)dv.notes.add(nt);
        // 手配区分(盤内/盤外)。空文字列=盤内(既定)。同じデバイス内で揃うはず。
        dv.zones.add(el.panelZone||'');
      }else{
        const name=(el.partModel||'').trim()||el.label||el.type;
        const k=`${el.type}|${name}`;
        if(!noRef[k])noRef[k]={type:el.type,model:(el.partModel||'').trim(),label:name,
                               maker:(el.partMaker||'').trim(),
                               pname:(el.partName||'').trim(),pnote:(el.partNote||'').trim(),
                               refs:[],count:0,parts:0,noRef:true,warn:''};
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
                                     volts:new Set(),makers:new Set(),names:new Set(),notes:new Set(),zones:new Set(),els:[],parts:0};
      const dv=devices[key];
      dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
      const m=(g.partModel||'').trim();
      if(m)dv.models.add(m);
      dv.zones.add(g.panelZone||'');
    });
  });

  // 【2026-09-25】**1デバイス=1行。型式でまとめない。**
  // 以前は型番＋コイル電圧＋対象外が同じデバイスを1行に束ね(「CR1, CR1A, CR3, CR2A」
  // MY4N 4台)、メーカー・名称・備考・電圧をその行の全デバイスへまとめて書き戻していた。
  // 盛田さん「型式で折りたたむのはNG、間違ってたらどう修正するのか？」——1台だけ
  // 違う値を入れたくても直せない。2026-09-21の「畳まない」もこの意味だった
  // (HANDOFFには機器名の略記(NFB2,3)の話としてしか残っていなかった)。
  // 並びはデバイス名の自然順(CR2 < CR10)。
  const byModel={};
  Object.keys(devices).sort((a,b)=>a.localeCompare(b,'ja',{numeric:true})).forEach(devKey=>{
    const dv=devices[devKey];
    // 表示名は最も多く使われている表記を採用する
    const spells=[...dv.spellings.entries()].sort((a,b)=>b[1]-a[1]);
    const ref=spells[0][0];
    const models=[...dv.models];
    const model=models[0]||'';
    const primary=[...dv.types][0]||'';
    const volts=[...dv.volts];
    const volt=volts[0]||'';
    // メーカー: 図面に入っていればそれを使う。入っていなければ部品DBから補う
    // (登録済みの部品は打ち直さなくて済む)。**部品DBが読めなくても空欄に
    // なるだけで、値が黙って変わることはない** —— 端子台表のような
    // 「DBの状態で結果が変わる」形にはしない。
    const makers=[...dv.makers];
    let maker=makers[0]||'';
    const names=[...dv.names];
    let pname=names[0]||'';
    if((!maker||!pname)&&model){
      const pm=(state.customParts||[]).find(x=>x.ref===model);
      if(pm){
        if(!maker&&pm.maker)maker=pm.maker;
        // 名称は部品DBの種別ラベル(「電磁接触器」等)で埋めておく。手で直せる。
        if(!pname&&typeof PART_TYPE_LABELS!=='undefined'&&PART_TYPE_LABELS[pm.type])
          pname=PART_TYPE_LABELS[pm.type];
      }
    }
    // 備考は**自動で埋めない**。部品DBの note はカタログの説明文(平均256文字)で、
    // 実物の部品表の備考(「延長処理必要」「位置決め用」等の手配メモ)とは別物。
    // 流し込むと列が説明文で埋まって使えなくなる。
    const notes=[...dv.notes];
    const pnote=notes[0]||'';
    const zones=[...dv.zones];
    const zone=zones[0]||'';
    const k=devKey;   // 1デバイス=1行(上のコメント参照)
    if(!byModel[k])byModel[k]={type:primary,model,volt,maker,pname,pnote,zone,label:model||'(型番未設定)',
                               refs:[],els:[],count:0,parts:0,noRef:false,warn:''};
    const row=byModel[k];
    row.refs.push(ref);
    row.els.push(...dv.els);
    row.count++;                 // 台数 = デバイス数
    row.parts+=dv.parts;         // 構成要素数(接点・端子の個数)
    const ws=[];
    if(spells.length>1)ws.push(`${ref}に表記ゆれ(${spells.map(s=>s[0]).join(' / ')})`);
    if(models.length>1)ws.push(`${ref}に型番が複数(${models.join(' / ')})`);
    if(makers.length>1)ws.push(`${ref}にメーカーが複数(${makers.join(' / ')})`);
    if(volts.length>1)ws.push(`${ref}にコイル電圧が複数(${volts.join(' / ')})`);
    // 2026-08-23: 「手配区分が複数」→「対象外の設定が食い違う」に言い換え。
    // 同じデバイスなのに一部だけ対象外になっているのは設定ミスの可能性が高い。
    if(zones.length>1)ws.push(`${ref}は対象外の設定が食い違っています`);
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
      if(!counts[k])counts[k]={type:el.type,label:name,model,refs:[],count:0};
      counts[k].count++;
      if(el.partRef)counts[k].refs.push(el.partRef);
    });
  });
  return Object.values(counts);
}
// 部品表の表示対象の絞り込み(2026-08-23)。
//
// 【経緯】もとは「盤内/盤外」の2択で、部品表も盤内・盤外のセクションに分けていた。
// しかし盛田さんの指摘で見直した:
//   ・既定が盤内なので、選ばせる必要が無い。実質フラグ1つで足りる
//   ・「盤外」という言い方も実態に合わない。要は部品表に載せるかどうか
// そこで「部品表の対象外」チェック1つに整理した(盛田さん「盤内、盤外と選ぶ必要が
// あるか？盤外だけわかればいいのでは？盤外という文字もいまいちだ対象外とかに
// ならんか？」)。
//
// なお、盤内/盤外という区分自体も盛田さんの指示ではなく、Claudeが勝手に立てた
// 要件だった(一次情報で確認済み)。同じことを繰り返さないよう、この節に機能を
// 足すときは必ず盛田さんの発言を確認すること。
//
// 内部表現(el.panelZone: 未設定 or '外')は変えていないので既存データも読める。
//
// 絞り込みは画面の表示とCSV出力の両方に効く(片方だけ効くと出力を信用できなくなる)。
const _bomZone = { excluded: false, noRef: true };

function setBOMZone(key, on) {
  _bomZone[key] = !!on;
  showBOM();
}

// 絞り込みを適用する。CSV出力も必ずこれを通すこと。
function _bomFilterRows(rows) {
  return rows.filter(r => {
    if (r.noRef) return _bomZone.noRef;
    return (r.zone || '') === '外' ? _bomZone.excluded : true;
  });
}

function showBOM(){
  const allRows=collectBOMRows();
  const rows=_bomFilterRows(allRows);
  const devTotal=rows.filter(r=>!r.noRef).reduce((s,r)=>s+r.count,0);
  const noRefTotal=rows.filter(r=>r.noRef).reduce((s,r)=>s+r.count,0);
  // 絞り込みで隠している件数。黙って減っていると出力を誤解するので必ず出す。
  const hidden=allRows.filter(r=>!rows.includes(r)).reduce((s,r)=>s+r.count,0);
  const cb=(key,label)=>`<label style="margin-right:10px;font-size:11px;cursor:pointer">`
    +`<input type="checkbox"${_bomZone[key]?' checked':''} `
    +`onchange="setBOMZone('${key}',this.checked)" style="vertical-align:-1px;margin-right:3px">`
    +`${label}</label>`;
  const head=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">全${state.pages.length}ページ集計・${devTotal} 台`
    +(noRefTotal?`　<span style="color:var(--red)">デバイス未設定 ${noRefTotal} 個</span>`:'')
    +`<br>数量はデバイス単位の台数です。構成数は接点・端子を含む図形の個数です。`
    +`プロパティで「部品表の対象外」にした部品は既定では集計されません。</p>`
    +`<p style="margin-bottom:6px;padding:5px 6px;background:var(--bg2);border-radius:3px">`
    +cb('excluded','対象外の部品も含める')+cb('noRef','デバイス未設定を含める')
    +(hidden?`<span style="font-size:11px;color:var(--red)">（${hidden}台を非表示中・CSVにも出ません）</span>`:'')
    +`</p>`;
  // 部品表でもコイル電圧を変えられるようにする(プロパティとどちらでも変更できる)。
  // 変更するとその行(=そのデバイス)の要素すべてに反映される。
  window._bomRows = rows;
  const voltCell = (r, i) => {
    if (r.noRef || !r.model) return '<td style="color:var(--fg3)">-</td>';
    const opts = (typeof partVoltOptions === 'function') ? partVoltOptions(r.model) : [];
    if (!opts.length) return '<td style="color:var(--fg3)">-</td>';
    if (opts.length === 1) return `<td style="color:var(--fg2)">${escH(opts[0])}</td>`;
    const cur = r.volt && opts.includes(r.volt) ? r.volt : opts[0];
    return `<td><select onchange="setBOMVolt(${i}, this.value)" style="font-size:11px">`
      + opts.map(o => `<option value="${escH(o)}"${o === cur ? ' selected' : ''}>${escH(o)}</option>`).join('')
      + `</select></td>`;
  };
  // メーカー欄。**帳票で直接打てる**(盛田さん「プロパティ手打ちは論外、
  // 帳票に型式打ち込みになるからメーカー欄も帳票手打ちだな」)。
  // コイル電圧(voltCell/setBOMVolt)と同じ作法で、その行の全要素へ書き戻す。
  // 部品DBに登録済みの型番は値が既に入っているので打ち直さなくてよい。
  // 手打ちできるセルを作る共通部分(メーカー・名称・備考)。
  const typedCell = (r, i, val, fn, w) => {
    if (r.noRef) return `<td style="color:var(--fg3)">${escH(val||'')}</td>`;
    return `<td><input type="text" value="${escH(val||'')}" placeholder="—"`
      + ` onchange="${fn}(${i}, this.value)"`
      + ` style="width:${w}px;font-size:11px;background:var(--bg3);color:var(--fg);`
      + `border:1px solid var(--bd2);border-radius:3px;padding:1px 3px"></td>`;
  };
  const makerCell = (r, i) => typedCell(r, i, r.maker, 'setBOMMaker', 90);
  const nameCell  = (r, i) => typedCell(r, i, r.pname, 'setBOMName', 110);
  const noteCell  = (r, i) => typedCell(r, i, r.pnote, 'setBOMNote', 150);
  // 【2026-09-21】「種別」列は表示から外した。標準シンボルがあった頃は
  // coil/breaker と読めたが、登録シンボルばかりの今は custom_xxx という
  // **内部名**が出るだけで意味を成さない(実物の部品表にも無い列)。
  //
  // **行の `type` フィールド自体は消さないこと。** 型番が未設定のときの
  // まとめキー(`(型番未設定)|${primary}`)と表示名に使っている。
  // 表示を消すのとフィールドを消すのは別。
  // rowsのindexはCSV/setBOMVolt等で使うため、絶対indexを保ったまま盤内/盤外で
  // グループ分けして表示する(盛田さんの「部品表に集計されるなら盤内盤外で
  // 分けるようにできると良い」への対応)。noRef(デバイス未設定)は区分の対象外
  // として最後にまとめて出す。
  const withNoRefIdx = rows.map((r,i)=>({r,i}));
  // 2026-08-23: 盤内/盤外のセクション分けは廃止(そもそも不要な区分だった)。
  // 対象外の部品を含めているときだけ、区別できるよう別セクションにする。
  const mainRows     = withNoRefIdx.filter(({r})=>!r.noRef && (r.zone||'')!=='外');
  const excludedRows = withNoRefIdx.filter(({r})=>!r.noRef && (r.zone||'')==='外');
  const noRefRows    = withNoRefIdx.filter(({r})=>r.noRef);
  // 【2026-09-21】デバイスを先頭列へ移した。
  // 盛田さん「ただデバイスが頭にないのは問題だな、使いづらい」。
  // 部品表はExcelに出して人が転記する運用で、転記先(実物)も
  // 機器名[SYMBOL]が先頭。読む順が揃っていないと転記しにくい。
  // 中身(デバイス単位の集計)は元から正しいので、並べ替えだけ。
  const rowHtml = ({r,i}) =>
    `<tr${r.noRef?' style="background:var(--rbg)"':''}>`
    +`<td style="font-weight:600">${r.noRef?'<span style="color:var(--red)">未設定</span>':(escH(r.refs.join(', '))||'-')}</td>`
    +nameCell(r,i)
    +`<td>${escH(r.label)}${r.warn?` <span style="color:var(--red);font-size:10px">⚠${escH(r.warn)}</span>`:''}</td>`
    +makerCell(r,i)
    +voltCell(r,i)
    +`<td style="font-weight:600">${r.count}</td><td style="color:var(--fg3)">${escH(r.parts)}</td>`
    +noteCell(r,i)+`</tr>`;
  const section = (title, list) => {
    if (!list.length) return '';
    const cnt = list.reduce((s,{r})=>s+r.count,0);
    return `<p style="font-size:11px;font-weight:600;margin:10px 0 3px">${title}`
      + `<span style="color:var(--fg3);font-weight:400">（${cnt}台）</span></p>`
      + `<table class="tbl"><tr><th>デバイス</th><th>名称</th><th>型番/名称</th><th>メーカー</th><th>コイル電圧</th><th>数量(台)</th><th>構成数</th><th>備考</th></tr>`
      + list.map(rowHtml).join('') + `</table>`;
  };
  let html = rows.length
    ? head
      + section('部品表', mainRows)
      + section('部品表の対象外', excludedRows)
      + section('デバイス未設定', noRefRows)
    : '<p style="font-size:11px;color:var(--fg3)">配置されたシンボルがありません</p>';
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
  showBOM();
}
// 部品表のセルからメーカーを変更する。その行の全要素に書き戻して表を作り直す。
// setBOMVolt と同じ作法(pushH で取り消せるようにし、プロパティ欄も追随させる)。
function setBOMMaker(idx, maker){
  const r=(window._bomRows||[])[idx];
  if(!r)return;
  if(typeof pushH==='function')pushH();   // 変更前の状態を履歴に積む
  const v=(maker||'').trim();
  (r.els||[]).forEach(el=>{ el.partMaker=v||undefined; });
  if(typeof draw==='function')draw();
  if(typeof updateRightPanel==='function')updateRightPanel();
  showBOM();
}
// 名称・備考も部品表のセルから直接打てる(setBOMMaker と同じ作法)。
function setBOMName(idx, v){ _setBOMField(idx, 'partName', v); }
function setBOMNote(idx, v){ _setBOMField(idx, 'partNote', v); }
function _setBOMField(idx, prop, v){
  const r=(window._bomRows||[])[idx];
  if(!r)return;
  if(typeof pushH==='function')pushH();   // 変更前の状態を履歴に積む
  const val=(v||'').trim();
  (r.els||[]).forEach(el=>{ el[prop]=val||undefined; });
  if(typeof draw==='function')draw();
  if(typeof updateRightPanel==='function')updateRightPanel();
  showBOM();
}
function exportBOMCSV(){
  // 画面の絞り込みをCSVにも必ず適用する。画面と出力が食い違うと
  // 出力を信用できなくなるため(2026-08-23)。
  const rows=_bomFilterRows(collectBOMRows());
  // 【2026-09-21】画面と同じくデバイスを先頭列にする。
  // 画面とCSVで並びが違うと転記のときに読み替えが要るため、必ず揃える。
  // 【2026-09-21】末尾の「備考」列は元々**警告文**(型番が複数 等)だった。
  // 実物の部品表の備考(手配メモ)を足すにあたり、紛らわしいので「警告」に改名した。
  const q=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
  dl(['デバイス,名称,型番/名称,メーカー,コイル電圧,対象外,数量(台),構成数,備考,警告',
      ...rows.map(r=>[r.noRef?'未設定':r.refs.join('/'),r.pname||'',r.label,r.maker||'',
                      r.volt||'',r.zone==='外'?'対象外':'',
                      r.count,r.parts,r.pnote||'',r.warn||''].map(q).join(','))
     ].join('\n'),_csvName('部品表'),'text/csv');
}
// 要素の役割を判定する。
// シンボル登録/端子編集で指定した role を使う。
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

// シンボルの種別。'coil' | 'contact_main' | 'contact_a' | 'contact_b'
// | 'tentative'(仮設定) | ''(その他)
//
// 【2026-09-20】`contact_main`(主接点)を新設した。従来は a接点/b接点 しか無く、
// 主接点を置く先が無かった。a接点/b接点は「接点の性質(開くか閉じるか)」、
// 主接点/補助接点は「部品のどの部分か」で**軸が違う**ため、主接点を
// contact_a に押し込むと接点リファレンスで a接点として数えられてしまう。
// 補助接点であることを名前に出して「補助接点(a接点)」とした(値は従来のまま)。
//
// 【2026-09-21】標準シンボルの isCoil / isContact + contactType による判定を
// 削除した。標準シンボル自体を削除したため、この経路は到達しない。
// 種別はシンボル登録/端子(ピン)編集で指定した role だけを見る。
function symRole(el){
  const d=getDef(el.type)||{};
  if(d.role)return d.role;
  return '';
}

// 接点として数えるもの。ランプ・押釦・モータ等(その他)は「接点数」に含めない。
// 含めると「接点数」の意味が壊れるため(盛田さんと確認: 主接点は数える)。
const REF_CONTACT_ROLES = ['contact_main', 'contact_a', 'contact_b'];
function refRoleLabel(role){
  return role==='contact_main' ? '主接点'
       : role==='contact_a'    ? '補助接点(a接点)'
       : role==='contact_b'    ? '補助接点(b接点)'
       : role==='tentative'    ? '仮設定'
       : 'その他';
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
      // 【2026-09-25】配線の分岐点(●)は部品ではないので載せない。盛田さん「分岐点を外して」。
      // 以前は「(デバイス未設定)」の行に分岐点が「他」バッジで何十個も並んでいた。
      // 端子台の端子(○/◎)は端子台デバイスの位置として残す。
      // style未設定は●扱い(draw.js の drawJunctionEl と同じ判定)。
      if(el.type==='junction'&&(el.style||'dot')==='dot')return;
      // 【2026-09-20】以前はここで role 未設定のシンボルを丸ごと落としていた。
      // 盛田さん「主接点が出るのは問題ない、というかその他も載ってていいと思うんだが」。
      // この表は「このデバイスの部品が図面のどこにあるか」の索引として使うので、
      // ランプ・押釦・モータのような種別未設定のシンボルも載せる。
      const role=symRole(el);
      const raw=(el.partRef||'').trim();
      const key=normalizeRef(raw)||`(未設定)#${el.type}`;
      if(!devs[key])devs[key]={spellings:new Map(),coils:[],contacts:[],noRef:!raw};
      const dv=devs[key];
      if(raw)dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
      const rec={el,page:pi+1,role,loc:elLocation(el,pi)};
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
    // 【2026-09-20】種別未設定のシンボル(ランプ・押釦・モータ等)も表に載せる
    // ようにしたため、無条件だと全部に「コイル未配置」が出てしまう。
    // コイルと対で見るべきなのは接点を持つデバイスだけなので、そのときだけ出す。
    const nContacts=dv.contacts.filter(c=>REF_CONTACT_ROLES.includes(c.role)).length;
    if(!dv.coils.length&&nContacts)warns.push('コイル未配置');
    if(dv.coils.length>1)warns.push(`コイルが${dv.coils.length}個`);
    if(dv.noRef)warns.push('デバイス未設定');
    // locは「2/B3」(ページ/区画)形式。図面枠が無いページはページ番号だけになる
    // バッジは 主 / a / b / 他 の4種。以前は contact_a か否かの2択だったため、
    // 主接点もその他も「b」と表示されてしまっていた。
    // 主接点はコイル(badge-p)と色が被らないよう badge-o。種別未設定は地味な灰色。
    // 仮設定は「仮」。まだ決めていないことが一目で分かるようにする。
    const badgeTxt=r=>r==='contact_a'?'a':r==='contact_b'?'b':r==='contact_main'?'主'
                    :r==='tentative'?'仮':'他';
    const badge=c=>{
      const r=c.role;
      const cls=r==='contact_a'?'badge-g':r==='contact_b'?'badge-b':r==='contact_main'?'badge-o':'';
      const st=cls?'':' style="background:var(--bg4);color:var(--fg3)"';
      return `<span class="badge ${cls}"${st}>${badgeTxt(r)} ${escH(c.loc)}</span>`;
    };
    const coilTxt=dv.coils.length
      ? dv.coils.map(c=>`<span class="badge badge-p">${escH(c.loc)}</span>`).join(' ')
      : '<span class="badge" style="background:var(--rbg);color:var(--red)">未配置</span>';
    return `<tr><td><b>${escH(name)}</b>${warns.length
        ?`<br><span style="color:var(--red);font-size:10px">⚠ ${escH(warns.join(' / '))}</span>`:''}</td>`
      +`<td>${coilTxt}</td>`
      +`<td>${dv.contacts.map(badge).join(' ')||'なし'}</td>`
      +`<td>${nContacts}</td></tr>`;
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
  const lines=['デバイス,コイル位置,接点種別,接点位置'];
  Object.keys(devs).sort().forEach(k=>{
    const dv=devs[k];
    const spells=[...dv.spellings.entries()].sort((a,b)=>b[1]-a[1]);
    const name=spells.length?spells[0][0]:'(デバイス未設定)';
    const coilLoc=dv.coils.map(c=>c.loc).join(' ');
    if(!dv.contacts.length){
      lines.push([name,coilLoc,'',''].map(esc).join(','));
      return;
    }
    dv.contacts.forEach(c=>{
      lines.push([name,coilLoc,refRoleLabel(c.role),c.loc].map(esc).join(','));
    });
  });
  dl(lines.join('\n'),_csvName('相互参照'),'text/csv');
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
// ----------------------------------------------------------------
// 端子台として集計するかどうか(デバイス単位)
// ----------------------------------------------------------------
// 【2026-09-21 作り直し】従来は型式(el.partModel)で部品DBを引き、種別が
// 装置系(plc/plc_unit/hmi/inverter/servo)なら端子台表から除外していた
// (isDeviceTerminal / DEVICE_PART_TYPES)。これを全部やめた。
//
// やめた理由(盛田さんとの確認):
//   ・帳票を開くたびに部品DBを引き直すので、**部品DBが読めないと答えが変わる**。
//     しかも表は普通に出て行が増えるだけなので、間違いに気付けない
//   ・端子の型式欄は手入力で、部品DBの型番と一致する保証が無い。綴りがずれても
//     同じように混ざる
//   ・除外リストは終わりが無い。inverterは2026-08-23に後から足したもので、
//     新しい種別が出るたびに足し忘れると黙って混ざる
//
// 「端子台の種別(terminal)だけ拾う」案も検討したが、**不採用**。
// 盛田さん「端子台の選定は一番最後にだいたい決まる、図面全部書いてから」。
// 作図中の端子台は型式が空なのが普通で、拾う側にすると端子台表が
// 一番使いたい時期(端子を並べ替えて番号を振る時期)に空になる。
//
// 採用したのは**デバイス単位で人が1回決める**形(盛田さん「おれはデバイスで
// 読めと言ってる」)。TB1/PLC1というデバイスは図面に数台しか無く、1台につき
// 1回決めれば図面に残る。部品DBは一切引かない。
//
// 既定は「端子台として集計する」。型式未設定の端子台が黙って消える方が
// 実害が大きいため(既存図面の互換。tests/test_device_terminal.js 参照)。
//
// フラグは el.tbExclude(true = 集計しない)。端子台は「台」という実体を持たず
// 同じ partRef の端子が集計時に1台として束ねられる作りなので、型式・panelZone と
// 同じく**その台の端子すべてに同じ値を配る**(js/ui.js の onJunctionModelChanged と
// 同じ考え方)。図面データに入るので、PCが変わっても同じ結果になる。
function isTBExcluded(el) {
  return !!(el && el.tbExclude);
}

// 指定デバイスの端子すべてに、集計する/しないを配る。全ページが対象。
// 帳票(端子台表)から呼ぶ。プロパティ欄には置いていない —— デバイス単位の
// 判断は、デバイスが一覧になっている帳票で見ながら決める方が自然なため。
function setTBExcluded(dev, excluded) {
  if (typeof pushH === 'function') pushH();   // 取り消せるようにする
  const target = String(dev || '');
  let n = 0;
  (state.pages || [{ elements: state.elements }]).forEach(pg => {
    (pg.elements || []).forEach(el => {
      if (el.type !== 'junction') return;
      const ref = (el.partRef || '').trim() || '(デバイス未設定)';
      if (ref !== target) return;
      el.tbExclude = excluded ? true : undefined;
      n++;
    });
  });
  if (typeof draw === 'function') draw();
  // 端子を選んだままでも欄が古い値のまま残らないようにする
  // (setBOMVolt と同じ作法。ここを抜くと画面とデータが食い違う)
  if (typeof updateRightPanel === 'function') updateRightPanel();
  if (typeof showTBTable === 'function') showTBTable();
  return n;
}

function collectTerminals() {
  const out = [];
  state.pages.forEach((pg, pi) => {
    (pg.elements || []).forEach(el => {
      if (el.type !== 'junction') return;
      if (el.style !== 'circle' && el.style !== 'dbl') return;  // ●分岐点は端子ではない
      // 【2026-09-21】ここで装置の端子を除外するのをやめた(上の説明を参照)。
      // 端子は全部拾い、集計に入れるかどうかは表示側(showTBTable)が
      // el.tbExclude で分ける。並べ替え(tbOrder)は集計対象外の台にも要る。
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

  // 端子台表はデバイス(TB1/TB2…)ごとにグループ分けして表示するが、tbOrderは
  // 全端子の通し番号。デバイスを跨いでドロップすると、tbOrderだけ相手グループの
  // 位置へ移るのにpartRefは変わらないため、表示は元のグループに残ったまま順序だけ
  // 説明のつかない形で変わる。跨ぎは受け付けない。
  const rows = collectTerminals();
  const dragEl   = rows.find(r => String(r.el.id) === String(dragId))?.el;
  const targetEl = rows.find(r => String(r.el.id) === String(targetId))?.el;
  if (!dragEl || !targetEl) return;
  const refOf = e => (e.partRef || '').trim() || '(デバイス未設定)';
  if (refOf(dragEl) !== refOf(targetEl)) {
    alert(`別の端子台へは移動できません（${refOf(dragEl)} → ${refOf(targetEl)}）。\n`
        + `端子の所属を変えるときは、その端子のプロパティでデバイスを変更してください。`);
    return;
  }

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
  // 【2026-09-21修正】updateRightPanel() を呼んでいなかった。
  // 端子を1つ選んだまま「この順で番号を振り直す」を押すと、図面とデータの
  // 端子番号は変わるのに**プロパティの「端子番号」欄(pp-jlabel)だけ古い値が
  // 残る**。その状態で欄の値が要素へ書き戻されると、振り直した番号が
  // 古い番号に戻ってしまう(applyProps が pp-jlabel を el.label に入れるため)。
  // 帳票から要素を書き換える他の経路(setBOMVolt / setTBExcluded)は
  // 最初から呼んでいて、ここだけ抜けていた。
  // tbDrop は el.tbOrder しか書かず、それはプロパティ欄に出ないので不要。
  if (typeof updateRightPanel === 'function') updateRightPanel();
  showTBTable();
}



// ================================================================
// 端子表（全部品の接続情報）
// ================================================================




// ================================================================
// DXF・印刷
// ================================================================

// ================================================================
// PDF出力（ベクター：jsPDF直接API）
// ================================================================

// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['report.js'] = 1;
