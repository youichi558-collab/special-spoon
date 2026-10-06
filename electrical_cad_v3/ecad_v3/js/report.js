// ================================================================
// 帳票パネル共通ヘルパー（部品表・線番表・端子台一覧・端子表・接続表・
// 端子台表・接点Refを1つのパネル内タブとして切替表示する）
// ================================================================
const REPORT_TABS = [
  { key:'bom',     label:'部品表',       call:'openBOM()' },
  { key:'wire',    label:'線番表',       call:'wireNoTable()' },
  { key:'conntbl', label:'接続チェック', call:'showConnTable()' },
  { key:'tbtbl',   label:'端子台表',     call:'showTBTable()' },
  { key:'ref',     label:'接点Ref',      call:'showRefPanel()' },
];

let _lastReportTab = 'bom'; // 帳票系タブが最後に表示していた種類を記憶(現状は参照専用、保存対象外)

// onclick等の属性に文字列を安全に渡す(JSの文字列リテラル化してからHTML属性用にエスケープ)。
// 以前は ' だけを直しており、\ や " や < を含むデバイス名で壊れた(2026-09-29)。
// 帳票の複数のファイル(report.js・conn_table.js)が使うので、先に読み込まれる report.js に置く。
function _jsArg(v) { return escH(JSON.stringify(String(v == null ? '' : v))); }

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

// ================================================================
// 線番の書式(2026-10-04 盛田さんの決定。HANDOFF.md「線番の再設計」)
//
// 以前は「番号のルール」の定義が無く、最後に入れた開始番号(wireNoRule)と「末尾の数字+1」だけで動いていた。
// 「欠番を詰める」と×の自動詰めは末尾が数字なら何でも連番とみなし、Sheet3で L1 を消すと L2 が L1 になった。
//   ・制御(コモン以外)は**表題欄のページ番号+連番**。桁数は設定(ページ番号の桁数・連番の桁数)。
//     ページ番号の桁数「なし」= ページ番号の付かない連番(1ページの図面。Sheet3の 01〜16)
//   ・自動で触る(割付・振り直し)のは**この書式に合う番号だけ**。R・S・T、L1、U・V・W、E などは手で付けた名前として一切触らない
//   ・振る・直すは**そのページの中だけ**(ページ番号が入るので他のページと被らない)
//   ・ページ跨ぎの線は**送り側のページの番号**。受け側のページを振り直しても触らない
//   ・削除では番号を動かさない。直すときは「このページを振り直す」(変わる番号を見せて確かめてから)
// ================================================================
const WN_PAGE_DIGITS = [0, 1, 2, 3];
const WN_SEQ_DIGITS  = [2, 3, 4];
function wnFmt() {
  const f = state.wireNoFmt || {};
  const p = Number(f.pageDigits), s = Number(f.seqDigits);
  return { pageDigits: WN_PAGE_DIGITS.includes(p) ? p : 0, seqDigits: WN_SEQ_DIGITS.includes(s) ? s : 2,
    // 主回路の段送り(仮案。js/wire_no_main.js): 分岐の枝番・モータ/インバータ出口の番号を 'pos'=図面の位置順 / 'dev'=デバイス名の番号
    mainBranch: f.mainBranch === 'dev' ? 'dev' : 'pos', mainMotor: f.mainMotor === 'dev' ? 'dev' : 'pos' };
}
// ページ番号の部分(表題欄のページ番号を桁にそろえた文字列)。書式がページ番号なしなら ''。使えなければ { err }
function wnPagePart(pi) {
  const f = wnFmt();
  if (!f.pageDigits) return { part: '' };
  const pg = state.pages[pi];
  const raw = (pg && pg.frameObj && pg.frameObj.page != null) ? String(pg.frameObj.page).split('/')[0].trim() : '';
  const name = pg ? (pg.name || ('Sheet' + (pi + 1))) : '';
  // 【2026-10-04】欄が空のとき表題欄に出る自動の「n / 総数」(ファイルの中の並び)は使わない(盛田さん「表題欄ページ自動で入ってる場合は？」→ 案A)。
  // 分割した図面(1ページ1ファイル)ではどれも「1 / 1」で、全部のファイルが1ページ扱いになり線番が重複するため。知らせにその理由を書く
  if (!raw) {
    const auto = `${pi + 1} / ${state.pages.length}`;
    return { err: `「${name}」の表題欄のページ番号は自動(${auto})になっています。分割した図面ではどれも同じ番号になるため、線番には使いません。図面枠の「ページ」欄にページ番号を入れてください` };
  }
  if (!/^\d+$/.test(raw)) return { err: `「${name}」の表題欄のページ番号「${raw}」が数字ではありません` };
  const n = String(parseInt(raw, 10));
  if (n.length > f.pageDigits) return { err: `「${name}」の表題欄のページ番号「${raw}」がページ番号の桁数(${f.pageDigits}桁)に収まりません` };
  return { part: n.padStart(f.pageDigits, '0') };
}
// 書式に合う番号なら { part, seq }。合わない(手で付けた名前)なら null
function wnParse(no) {
  const f = wnFmt(), s = String(no || '');
  if (!new RegExp('^\\d{' + (f.pageDigits + f.seqDigits) + '}$').test(s)) return null;
  return { part: s.slice(0, f.pageDigits), seq: parseInt(s.slice(f.pageDigits), 10) };
}
function wnMake(part, seq) { return part + String(seq).padStart(wnFmt().seqDigits, '0'); }
function wnSeqMax() { return Math.pow(10, wnFmt().seqDigits) - 1; }

// 線番を振る単位(電気的に同じ線)。ネット1つ、またはページ跨ぎの矢印でつながったネットの組。
//   parts:[{pi,idxs}]  owner=番号の持ち主のページ(送り側)  extOwned=送り側が別ファイル(番号はそちらのもの)
function wnUnits() {
  const units = [], byKey = new Map();
  state.pages.forEach((pg, pi) => {
    if (pg._file) return;
    groupWiresByNet(pg.wires || [], null, pg.elements).forEach(idxs => {
      const u = { parts: [{ pi, idxs }], owner: pi, extOwned: false, extNo: '' };
      units.push(u); byKey.set(pi + ':' + idxs[0], u);
    });
  });
  const dead = new Set();
  const find = sd => { let u = sd.idxs && byKey.get(sd.pi + ':' + sd.idxs[0]); while (u && u.into) u = u.into; return u; };
  (typeof sigNetLinks === 'function' ? sigNetLinks() : []).forEach(pr => {
    const ua = pr.a.ext ? null : find(pr.a), ub = pr.b.ext ? null : find(pr.b);   // a=送り b=受け
    if (ua && ub && ua !== ub) { ua.parts.push(...ub.parts); ub.into = ua; dead.add(ub); }
    else if (ub && !ua && pr.a.ext) { ub.extOwned = true; ub.extNo = pr.a.no || ''; }
    else if (ua && !ub && pr.b.ext && pr.b.no) ua.extNo = ua.extNo || pr.b.no;   // 受け側(別ファイル)に番号があれば、未採番の送り側はそれを引き継ぐ(食い違わせない)
  });
  return units.filter(u => !dead.has(u));
}
const wnUnitWires = u => u.parts.flatMap(pt => pt.idxs.map(i => state.pages[pt.pi].wires[i]).filter(Boolean));
const wnUnitNos = u => [...new Set(wnUnitWires(u).map(w => w.wireNo).filter(Boolean))];
const wnUnitExcluded = u => wnUnitWires(u).some(w => w.noAutoNum);
function wnUnitSet(u, v) { u.parts.forEach(pt => _setNetWireNo(state.pages[pt.pi].wires, pt.idxs, v)); }
// 並べる位置: 持ち主のページの、番号が出ている線(無ければ一番長い線)の左上の端。
// 順番は**左の列から、列の中は上から**(盛田さんの Sheet3 の 01〜16 がこの順。展開接続図の縦書き)
function wnUnitPos(u) {
  const pt = u.parts.find(p => p.pi === u.owner) || u.parts[0];
  const ws = pt.idxs.map(i => state.pages[pt.pi].wires[i]).filter(Boolean);
  const len = w => { const ps = w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]; let s = 0; for (let k = 1; k < ps.length; k++) s += Math.hypot(ps[k].x - ps[k - 1].x, ps[k].y - ps[k - 1].y); return s; };
  const w = ws.find(x => x.wireNo) || ws.slice().sort((a, b) => len(b) - len(a))[0];
  if (!w) return { x: 0, y: 0 };
  const ps = w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
  return { x: Math.min(...ps.map(p => p.x)), y: Math.min(...ps.map(p => p.y)) };
}
const WN_COL_TOL = 5;
function wnSortByPos(units) {
  const pos = new Map(units.map(u => [u, wnUnitPos(u)]));
  return units.slice().sort((a, b) => {
    const p = pos.get(a), q = pos.get(b);
    return Math.abs(p.x - q.x) > WN_COL_TOL ? p.x - q.x : p.y - q.y;
  });
}
// ファイルの中で使っている線番(混在しているネットの番号も全部)
function wnUsedNos() {
  const used = new Set();
  state.pages.forEach(pg => { if (!pg._file) (pg.wires || []).forEach(w => { if (w.wireNo) used.add(w.wireNo); }); });
  return used;
}
// そのページ(の番号の範囲)で次に空いている番号。無ければ ''
function wnNextFree(part, used) {
  for (let s = 1; s <= wnSeqMax(); s++) { const v = wnMake(part, s); if (!used.has(v)) return v; }
  return '';
}

// 線番のチェック(2026-10-04 線番の再設計③。線番表の上に一覧を出し、押すと図面のその線へ飛ぶ)
//   ・同じ線番が別の線にある(同じ番号は出てはいけない=盛田さんの決定) ・1つのつながった線に違う線番が混ざっている
//   ・未採番の本数 ・表題欄のページ番号が無い/数字でない(書式にページ番号を使うとき)
//   ・主回路の段送りで入れられなかった所(そのページで「主回路線番」を使ったとき=自動の目印があるときだけ。使っていない図面で知らせが並ばないように)
// 戻り値: [{ kind:'dup'|'mixed'|'none'|'page'|'main', text, pi?, idxs? }]
function wireNoChecks() {
  const out = [];
  const units = wnUnits();
  const byNo = new Map();
  units.forEach(u => {
    const nos = wnUnitNos(u);
    if (nos.length > 1) out.push({ kind: 'mixed', text: `1つのつながった線に違う線番が混ざっています(${nos.join('・')})`, pi: u.parts[0].pi, idxs: u.parts[0].idxs });
    nos.forEach(no => { if (!byNo.has(no)) byNo.set(no, []); byNo.get(no).push(u); });
  });
  byNo.forEach((us, no) => {
    if (us.length < 2) return;
    us.forEach((u, k) => out.push({ kind: 'dup', text: `線番「${no}」が${us.length}か所にあります(${k + 1}/${us.length}: ${state.pages[u.parts[0].pi].name || ('Sheet' + (u.parts[0].pi + 1))})`, pi: u.parts[0].pi, idxs: u.parts[0].idxs }));
  });
  const none = units.filter(u => !wnUnitNos(u).length && !u.extNo);
  if (none.length) out.push({ kind: 'none', text: `未採番の線が${none.length}か所あります(表の上にまとめて出ています。「線番割付」で振れます)` });
  if (wnFmt().pageDigits) {
    state.pages.forEach((pg, pi) => {
      if (pg._file || !(pg.wires || []).length) return;
      const pp = wnPagePart(pi);
      if (pp.err) out.push({ kind: 'page', text: pp.err });
    });
  }
  if (typeof wnmPlan === 'function') {
    state.pages.forEach((pg, pi) => {
      if (pg._file || !(pg.wires || []).some(w => w.wireNoMain)) return;
      try { wnmPlan(pi).issues.forEach(t => out.push({ kind: 'main', text: `主回路: ${t}` })); } catch (e) {}
    });
  }
  return out;
}

// 「このページを振り直す」: このページが持ち主の線(未採番と、このページの書式の番号)を、位置の順に 1 から振り直す。
// 手で付けた名前・別のページの番号・チェックを外した線は触らない(その番号は避ける)。変わる番号を見せて確かめてから。
function wireNoRenumberPage(pi) {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  if (pi == null) pi = state.currentPage || 0;
  const pp = wnPagePart(pi);
  if (pp.err) { alert(pp.err + '\n振り直しませんでした。'); return; }
  const f = wnFmt();
  const units = wnUnits();
  const mixed = units.filter(u => u.parts.some(pt => pt.pi === pi) && wnUnitNos(u).length > 1);
  if (mixed.length) {
    // 【2026-09-25 決定A】1つのネットに違う番号が混ざっていたら、どちらに揃えるかは人が決める
    alert(`つながっている配線(ネット)の中に違う線番が混ざっている所が${mixed.length}件あります。\n線番表の橙色の欄で番号をそろえてから、もう一度押してください。`);
    wireNoTable(`⚠混在${mixed.length}件のため振り直しませんでした(橙色の欄をそろえてください)`);
    return;
  }
  // 【2026-10-04】ページ番号なしの書式でも、このページの線だけ(盛田さん「1ファイルに複数シートある場合も全体じゃなくてページ単位にした方が良い」)。
  // 他のシートの番号は変えず、その番号は避ける(keep)。以前はページ番号なしの書式だとファイルの全シートを通しで振り直していた
  const mine = u => !u.extOwned && u.owner === pi;
  const targets = [], keep = new Set();
  units.forEach(u => {
    const no = wnUnitNos(u)[0] || '';
    const p = no ? wnParse(no) : null;
    const ours = mine(u) && !wnUnitExcluded(u) && (!no || (p && p.part === pp.part));
    if (ours) targets.push(u); else if (no) keep.add(no);
  });
  if (!targets.length) { wireNoTable('振り直す線がありません'); return; }
  const order = wnSortByPos(targets);
  const changes = [];
  let s = 0, over = false;
  order.forEach(u => {
    let v = '';
    do { s++; if (s > wnSeqMax()) { over = true; break; } v = wnMake(pp.part, s); } while (keep.has(v));
    if (over) return;
    const old = wnUnitNos(u)[0] || '';
    if (old !== v) changes.push({ u, old, v });
  });
  if (over) { alert(`連番が${f.seqDigits}桁に収まりません(${order.length}本)。線番の設定で連番の桁数を増やしてください。\n振り直しませんでした。`); return; }
  if (!changes.length) { wireNoTable('番号は今のままで揃っています(変わる線番はありません)'); return; }
  const lines = changes.slice(0, 30).map(c => `  ${c.old || '(未採番)'} → ${c.v}`).join('\n');
  if (!confirm(`このページの線番を振り直します(左の列から、列の中は上から)。変わる線番 ${changes.length}件:\n${lines}${changes.length > 30 ? `\n  …ほか${changes.length - 30}件` : ''}\n\n手で付けた名前(R・S・T、L1 など)と、チェックを外した線は変えません。元に戻すときは Ctrl+Z。実行しますか？`)) return;
  pushH();
  changes.forEach(c => wnUnitSet(c.u, c.v));
  draw();
  wireNoTable(`このページの線番を振り直しました(${changes.length}件)`);
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
// 線の端は**一番近い端子にだけ**つなぐ(端子を詰めて並べると、判定範囲に隣の端子の線まで
// 入ってしまうため。tests/test_tb_diagram.js は端子を10間隔で並べている)。
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
  // 端子台の端子(○/◎): 線の端ごとに、判定範囲(半径+許容誤差)内で一番近い端子を探し、
  // 同じ端子に端が乗っている配線をつなぐ(上のコメント参照)
  const terms = (elements || []).filter(el => el.type === 'junction' && (el.style === 'circle' || el.style === 'dbl'));
  if (terms.length) {
    const firstAt = new Map();   // 端子 → その端子に乗っている最初の配線
    wires.forEach((w, i) => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      [pts[0], pts[pts.length-1]].forEach(p => {
        let best = null, bestD = Infinity;
        terms.forEach(t => {
          const d = Math.hypot(p.x - t.x, p.y - t.y);
          if (d <= (t.r || 5) + tol && d < bestD) { bestD = d; best = t; }
        });
        if (!best) return;
        if (firstAt.has(best)) union(firstAt.get(best), i); else firstAt.set(best, i);
      });
    });
    // 【2026-10-02】端子の円の中を通っている線(端子の上をまっすぐ通して描いた線)も、その端子につなぐ。
    // 盛田さん「配線が貫通してないのはそう書いてるだけだ」=円周で止めていたのは貫通して見えるから。円の中の線は画面・PDFは塗り、DXFは切って見せない
    terms.forEach(t => {
      const r = t.r || 5;
      wires.forEach((w, i) => {
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        let through = false;
        for (let k = 0; k + 1 < pts.length && !through; k++) if (segDist(t, pts[k], pts[k+1]) < r - 1e-6) through = true;
        if (!through) return;
        if (firstAt.has(t)) union(firstAt.get(t), i); else firstAt.set(t, i);
      });
    });
  }

  (elements || []).forEach(el => {
    if (el.type !== 'junction' || (el.style || 'dot') !== 'dot') return;
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

// ----------------------------------------------------------------
// 【2026-09-25】線番は「1ネットに1か所」(盛田さんの決定A)。
// 盛田さんの図面は、ネットのうち1本にだけ線番が入り、文字も1か所に出ている。
// 以前は線番割付・線番表の編集・入れ替えがネットの**全部の線**に書き込み、線番の文字は
// 線ごとに描かれるため、図面中に L1 が9か所・N1 が6か所…と並んだ(盛田さん「押したら壊れる」)。
// ●・端子台でネットをつなぐようにした(同日)ので書き込む線が増えて表面化した。
// 以後、書き込みは _setNetWireNo だけを通し、読む側(接続表・端子台表・配線番号CSV)は
// netWireNoOf でネットの番号を引く。
// ----------------------------------------------------------------

// ネットに線番を書く。既に番号のある線(=文字が出ている所)だけを書き換え、
// どこにも無ければ一番長い線1本に入れる(文字が読みやすい所)。空文字なら番号を消す。
function _setNetWireNo(wires, idxs, v) {
  // 【2026-10-04】主回路の段送りで自動で入れた目印(wireNoMain。js/wire_no_main.js)は、書き換えたら外す(手で直した名前は次の段送りで上書きしない)
  idxs.forEach(i => { if (wires[i] && wires[i].wireNoMain) wires[i].wireNoMain = false; });
  const has = idxs.filter(i => wires[i] && wires[i].wireNo);
  if (!v) { has.forEach(i => { wires[i].wireNo = ''; }); return; }
  if (has.length) { has.forEach(i => { wires[i].wireNo = v; }); return; }
  const len = w => {
    const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
    let s = 0;
    for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k-1].x, pts[k].y - pts[k-1].y);
    return s;
  };
  let best = -1;
  idxs.forEach(i => { if (wires[i] && (best < 0 || len(wires[i]) > len(wires[best]))) best = i; });
  if (best >= 0) wires[best].wireNo = v;
}

// ページの配線ごとに「その配線が属するネットの線番」を返す(配列、添字=配線の番号)。
// ネット内のどれにも番号が無ければ ''。混在していれば最初に見つかった番号。
function netWireNoOf(pg) {
  const wires = (pg && pg.wires) || [];
  const out = wires.map(() => '');
  groupWiresByNet(wires, null, pg && pg.elements).forEach(idxs => {
    const no = idxs.map(i => wires[i].wireNo).find(Boolean) || '';
    idxs.forEach(i => { out[i] = no; });
  });
  // 【2026-09-30】ページ跨ぎの矢印でつながる相手のネットに線番があれば、番号の無いネットにもその番号を出す
  // (送りと受けは同じ線=線番1つ。線番表・一括割付は両方に書くが、片方だけ手で入れた図面でも読む側(CSV・端子台表・接続チェック)は同じ番号になる)。
  // 混在・番号ありのネットは変えない。別ファイルの相手の番号も使う(読み取りだけ)。矢印のあるページだけ調べる
  if (out.includes('') && typeof sigNetLinksMemo === 'function' && pg && (pg.elements || []).some(e => { const r = symRole(e); return r === 'sig_out' || r === 'sig_in'; })) {
    const pi = state.pages.indexOf(pg);
    sigNetLinksMemo().forEach(pr => [[pr.a, pr.b], [pr.b, pr.a]].forEach(([me, other]) => {
      if (me.ext || me.pi !== pi || !me.idxs || !other.no || out[me.idxs[0]]) return;
      me.idxs.forEach(i => { out[i] = other.no; });
    }));
  }
  return out;
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
//
// 【2026-10-04】開始番号を聞く入力窓をやめ、線番の書式(wnFmt。設定パネル wireNoSettings)で振る。
// scope: 'page'=今のページが持ち主の線だけ / 'all'=ファイルの全ページ。番号の無い線だけに、位置の順で空いている番号を入れる。
// ページ跨ぎの受け側は送り側の番号を引き継ぐ(送り側が別ファイルで未採番なら入れない)。
function autoWireNumber(scope){
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const cur = state.currentPage || 0;
  const units = wnUnits();
  const used = wnUsedNos();
  const inScope = u => scope !== 'page' || u.parts.some(pt => pt.pi === cur);
  let netCnt = 0, conflictCnt = 0, excludedCnt = 0, waitExt = 0, full = 0;
  const errs = new Set();
  const todo = [];
  units.forEach(u => {
    if (!inScope(u)) return;
    const nos = wnUnitNos(u);
    if (nos.length > 1) conflictCnt++;   // 同一ネット内に異なる既存線番が混在(上書きはしない)
    // 【2026-09-25】番号のあるネットには触らない(1ネット1か所。_setNetWireNo参照)。
    // ただしページ跨ぎの相手(同じ線)が未採番なら同じ番号を入れる
    if (nos.length) {
      if (nos.length === 1) {
        const blank = u.parts.filter(pt => !pt.idxs.some(i => state.pages[pt.pi].wires[i].wireNo));
        if (blank.length) { blank.forEach(pt => _setNetWireNo(state.pages[pt.pi].wires, pt.idxs, nos[0])); netCnt++; }
      }
      return;
    }
    if (wnUnitExcluded(u)) { excludedCnt++; return; }   // 線番表でチェックを外したネットは対象外
    if (u.extNo) { wnUnitSet(u, u.extNo); netCnt++; return; }   // 別ファイルの相手の番号を引き継ぐ
    if (u.extOwned) { waitExt++; return; }   // 送り側が別ファイルで未採番
    todo.push(u);
  });
  const work = () => wnSortByPos(todo).forEach(u => {
    const pp = wnPagePart(u.owner);
    if (pp.err) { errs.add(pp.err); return; }
    const v = wnNextFree(pp.part, used);
    if (!v) { full++; return; }
    used.add(v);
    wnUnitSet(u, v);   // 一番長い線1本に入れる(矢印でつながった相手のページにも)
    netCnt++;
  });
  pushH();
  work();
  const where = scope === 'page' ? 'このページ' : '全ページ';
  let msg = `${where}の未採番だった${netCnt}ネットに線番を割付しました(既に番号のあるネットには触りません)`;
  if (errs.size) msg += '\n⚠' + [...errs].join('\n⚠') + '\n(そのページは割付していません)';
  if (full) msg += `\n⚠連番が${wnFmt().seqDigits}桁に収まらず、${full}ネットは割付できませんでした(線番の設定で連番の桁数を増やしてください)`;
  if (waitExt) msg += `\n⚠ページ跨ぎの受け側で、送り側(別ファイル)が未採番のネットが${waitExt}件あります(送り側で振ってください)`;
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
      rows.push({ pageIdx: pi, pname, idxs, wireNo, conflict: existingNums.length > 1, autoNum, parts: [{ pi, idxs }], ext: [] });
    });
  });
  // 【2026-09-30】ページ跨ぎの矢印(送り・受け)でつながる2つのネットは、電気的に同じ線=線番1つ=**1行**にまとめる。
  // 同じファイル内の相手は行に合わせる(入力すると両方に書く)。別ファイル(プロジェクト)の相手は読み取り専用で番号を添える。
  {
    const rowOfWire = new Map();
    rows.forEach(r => r.idxs.forEach(i => rowOfWire.set(r.pageIdx + ':' + i, r)));
    const dead = new Set();
    const rowOf = sd => { let r = sd.idxs && rowOfWire.get(sd.pi + ':' + sd.idxs[0]); while (r && r.mergedInto) r = r.mergedInto; return r; };
    (typeof sigNetLinks === 'function' ? sigNetLinks() : []).forEach(pr => {
      const ra = pr.a.ext ? null : rowOf(pr.a), rb = pr.b.ext ? null : rowOf(pr.b);
      if (ra && rb && ra !== rb) {
        ra.parts.push(...rb.parts); ra.ext.push(...rb.ext); rb.mergedInto = ra; dead.add(rb);
      } else if (ra && !rb && pr.b.ext) ra.ext.push({ loc: pr.b.loc, no: pr.b.no });
      else if (rb && !ra && pr.a.ext) rb.ext.push({ loc: pr.a.loc, no: pr.a.no });
    });
    for (let k = rows.length - 1; k >= 0; k--) if (dead.has(rows[k])) rows.splice(k, 1);
    rows.forEach(r => {
      if (r.parts.length < 2 && !r.ext.length) return;
      const nums = [], all = [];
      let nAuto = true;
      r.parts.forEach(pt => { const w = state.pages[pt.pi].wires; pt.idxs.forEach(i => { if (w[i].wireNo) nums.push(w[i].wireNo); if (w[i].noAutoNum) nAuto = false; }); });
      const uniq = [...new Set(nums)];
      r.wireNo = uniq[0] || ''; r.conflict = uniq.length > 1; r.autoNum = nAuto;
      r.pname = r.parts.map(pt => state.pages[pt.pi].name || ('Sheet' + (pt.pi + 1))).join(' ⇄ ');
      r.merged = r.parts.length > 1;
      r.extMismatch = r.ext.some(e => e.no && r.wireNo && e.no !== r.wireNo);
      r.count = r.parts.reduce((n, pt) => n + pt.idxs.length, 0);
    });
  }
  unnumbered = rows.reduce((n, r) => n + (r.wireNo ? 0 : (r.count || r.idxs.length)), 0);   // 矢印でまとめたあとの行で数える
  const partsArg = r => '[' + r.parts.map(pt => `[${pt.pi},[${pt.idxs.join(',')}]]`).join(',') + ']';
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
  html += `<br>チェックを外すと、割付・振り直しの対象外になります(手入力は可能なまま)。`;
  { const f = wnFmt(); html += `<br>線番の書式: ${f.pageDigits ? `表題欄のページ番号${f.pageDigits}桁＋連番${f.seqDigits}桁(例 ${wnMake('3'.padStart(f.pageDigits, '0'), 5)})` : `連番${f.seqDigits}桁(ページ番号なし。例 ${wnMake('', 5)})`}。割付・振り直しで変わるのはこの形の番号だけです`; }
  html += `<br>配線を追加/削除した後は、この一覧を開き直して未採番(赤)や分断(橙)がないか確認してください。`;
  html += `<br>行を押すと、この一覧を閉じて図面のその配線へ移動し、選択します(線番はプロパティ欄でも打てます)。`;
  // 【2026-10-04】「欠番を詰める」(ファイル全体・末尾が数字なら何でも対象)をやめ、書式に合う番号だけを位置の順に振り直す「このページを振り直す」にした
  const bst = 'margin-top:4px;font-size:10px;padding:2px 8px;cursor:pointer;border:1px solid var(--bd2);border-radius:3px;background:var(--bg2);color:var(--fg)';
  html += `<br><button onclick="wireNoSettings()" title="線番の書式(ページ番号の桁数・連番の桁数)と主回路の付け方" style="${bst}">線番の設定</button> `;
  html += `<button onclick="wireNoRenumberPage()" title="今のページの線番(未採番と、書式に合う番号)を、左の列から・列の中は上からの順に振り直します。手で付けた名前(R・S・T、L1 など)は変えません。実行前に変わる番号を確かめられます" style="${bst}">このページを振り直す</button>`;
  html += `</p>`;
  // 【2026-10-04】チェックの一覧(wireNoChecks)。押すと図面のその線へ飛ぶ
  {
    const checks = wireNoChecks();
    const order = { dup: 0, mixed: 1, page: 2, main: 3, none: 4 };
    checks.sort((a, b) => order[a.kind] - order[b.kind]);
    html += `<div id="wn-checks" style="font-size:11px;margin:0 0 8px;padding:6px 8px;border:1px solid ${checks.length ? '#f59e0b' : 'var(--bd2)'};border-radius:4px">`;
    html += checks.length ? `<div style="font-weight:600;margin-bottom:2px">チェック ${checks.length}件</div>` : `<span style="color:var(--fg3)">チェック: 問題はありません(重複・混在・未採番なし)</span>`;
    checks.forEach(c => {
      const go = c.idxs ? ` style="cursor:pointer;text-decoration:underline dotted" title="押すと図面のその線へ飛びます" onclick="jumpToNet(${c.pi},[${c.idxs.join(',')}])"` : '';
      html += `<div${go}><span style="color:${c.kind === 'none' ? 'var(--fg3)' : 'var(--red)'}">⚠</span> ${escH(c.text)}</div>`;
    });
    html += `</div>`;
  }
  const hasExt = rows.some(r => r.ext && r.ext.length);
  html += `<table class="tbl"><tr><th></th><th></th><th>線番</th><th>ページ</th><th>本数</th>${hasExt ? '<th>別ファイルの相手</th>' : ''}<th></th></tr>`;
  rows.forEach((r, ri) => {
    const badgeCls = r.conflict ? 'badge-o' : 'badge-b';
    const title = r.conflict ? 'title="⚠このネット内に異なる既存線番が混在しています。編集すると統一されます"' : '';
    const prev = rows[ri-1], next = rows[ri+1];
    const btnStyle = 'font-size:9px;line-height:1;padding:1px 3px;cursor:pointer;border:1px solid var(--bd2);border-radius:2px;background:var(--bg2);color:var(--fg)';
    const canSwap = (a, b) => a && b && !a.merged && !b.merged;
    const upBtn = canSwap(r, prev)
      ? `<button title="ひとつ上の行と線番を入れ替え" onclick="swapNetWireNo(${r.pageIdx},[${r.idxs.join(',')}],${_jsArg(r.wireNo)},${prev.pageIdx},[${prev.idxs.join(',')}],${_jsArg(prev.wireNo)})" style="${btnStyle}">▲</button>`
      : `<button disabled style="${btnStyle};opacity:.3">▲</button>`;
    const downBtn = canSwap(r, next)
      ? `<button title="ひとつ下の行と線番を入れ替え" onclick="swapNetWireNo(${r.pageIdx},[${r.idxs.join(',')}],${_jsArg(r.wireNo)},${next.pageIdx},[${next.idxs.join(',')}],${_jsArg(next.wireNo)})" style="${btnStyle}">▼</button>`
      : `<button disabled style="${btnStyle};opacity:.3">▼</button>`;
    const delBtn = r.merged
      ? `<button disabled title="ページ跨ぎの矢印でつながった行は、ここから削除できません(各ページで消してください)" style="${btnStyle};opacity:.3">×</button>`
      : `<button title="このネットの配線ごと削除します(ほかの線番は動かしません)" onclick="deleteNetFromList(${r.pageIdx},[${r.idxs.join(',')}])" style="${btnStyle};color:var(--red)">×</button>`;
    const chk = `<input type="checkbox" ${r.autoNum?'checked':''} title="チェックを外すと、割付・振り直しの対象外になります" onchange="toggleNetAutoNumParts(${partsArg(r)},this.checked)">`;
    // 【2026-09-25】行を押すと図面のそのネットへ飛ぶ(盛田さん「線番が無いことはわかるが
    // それがどれなのかは不明」)。欄・ボタン・チェックを押したときは飛ばない。
    const jump = `onclick="if(!/^(INPUT|BUTTON|SELECT)$/.test(event.target.tagName))jumpToNet(${r.pageIdx},[${r.idxs.join(',')}])"`;
    html += `<tr ${title} ${jump} style="cursor:pointer">` +
      `<td>${chk}</td>` +
      `<td style="white-space:nowrap">${upBtn}${downBtn}</td>` +
      `<td><input type="text" value="${escH(r.wireNo)}" placeholder="未採番" ` +
      `onchange="applyNetWireNoParts(${partsArg(r)},this.value)" ` +
      `style="width:80px;font-size:11px;padding:2px 4px;border:1px solid ${r.conflict?'#f59e0b':'var(--bd2)'};border-radius:3px;background:var(--bg2);color:var(--fg)"></td>` +
      `<td>${escH(r.pname)}</td>` +
      `<td><span class="badge ${badgeCls}">${r.count || r.idxs.length}</span></td>` +
      (hasExt ? `<td style="${r.extMismatch ? 'color:#f59e0b;font-weight:600' : ''}" ${r.extMismatch ? 'title="別ファイルの相手の線番と食い違っています"' : ''}>${escH((r.ext || []).map(e => e.loc + ' ' + (e.no || '(未採番)')).join(' / '))}</td>` : '') +
      `<td>${delBtn}</td>` +
      `</tr>`;
  });
  html += `</table>`;
  _reportOpen('wire', '線番 一覧(編集可)', html, exportWireCSV);
}

// 線番表の行を押したとき: そのネットのページへ切り替え、配線を選択して画面中央に出し、
// 2秒点滅させる(検索 search.js の jumpToHit と同じ動き・同じ点滅マーカー)。
// 点滅はネットの最初の配線の中点。未採番の行はたいてい1本なのでその線そのものを指す。
// 帳票パネル(幅1240px)が画面中央を覆って飛んだ先が見えないため、パネルは閉じる。
// 配線は選ばれたままなので、右のプロパティの「線番」欄にそのまま打てる。
// 第3引数 focus({x,y})を渡すと、画面中央・点滅をその点にする(接続チェックの「端子未特定」で、端子に乗っていない端を指すため)。
function jumpToNet(pageIdx, idxs, focus) {
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
  const cx = focus ? focus.x : (x0 + x1) / 2, cy = focus ? focus.y : (y0 + y1) / 2;
  state.pan.x = cv.width  / 2 - cx * state.zoom;
  state.pan.y = cv.height / 2 - cy * state.zoom;
  state.sel.els.clear(); state.sel.wires.clear();
  ws.forEach(w => { if (w.id) state.sel.wires.add(w.id); });
  if (typeof updateResizeHandles === 'function') updateResizeHandles();
  if (typeof updateRightPanel === 'function') updateRightPanel();
  const f = ws[0].pts || [{x:ws[0].x1,y:ws[0].y1},{x:ws[0].x2,y:ws[0].y2}];
  const a = f[0], b = f[f.length - 1];
  state.searchHit = focus ? { x: focus.x, y: focus.y, t0: Date.now() } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t0: Date.now() };
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

// 線番表の×ボタン: そのネットの配線を実際に削除する。
// 【2026-10-04】削除に続けて欠番を自動で詰めるのをやめた(ほかの線番は動かさない)。後ろを全部1つ繰り下げていたので、
// 飛ばして振った番号(10,20,30)が崩れ、手で付けた名前(L1 を消すと L2 が L1)まで変わった。直すときは「このページを振り直す」。
// 以下は以前の記録:
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
  if (!confirm(`このネット(配線${targetIds.length}本${delNo?'、線番'+delNo:'(未採番)'})を削除しますか？\nほかの線番は動かしません(番号を揃えるときは「このページを振り直す」)。元に戻す場合はCtrl+Zで戻せます。`)) return;
  pushH();
  const idSet = new Set(targetIds);
  pg.wires = pg.wires.filter(w => !idSet.has(w.id));
  // 消した配線がグループに入っていた場合の参照を掃除する
  if (typeof pruneGroups === 'function') pruneGroups(pg);
  draw();
  wireNoTable();
}

// 線番表の▲▼ボタン: 隣り合う2つのネットの線番を入れ替える
function swapNetWireNo(pageA, idxsA, noA, pageB, idxsB, noB) {
  const pgA = state.pages[pageA], pgB = state.pages[pageB];
  if (!pgA || !pgB) return;
  pushH();
  // 1ネット1か所を保つ(_setNetWireNo参照)。文字の位置は各ネットで今出ている所のまま
  _setNetWireNo(pgA.wires, idxsA, noB);
  _setNetWireNo(pgB.wires, idxsB, noA);
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
      // 【2026-10-04】繰り上げるのは書式に合う番号(同じページ番号)だけ。以前は末尾が数字なら何でも繰り上げ、L1 を打つと L1→L2・L2→L3 と名前まで変わった
      const p = wnParse(v);
      const doShift = confirm(
        p
        ? `線番「${v}」は既に別の配線で使われています。\n[OK] ここに割り込ませて、「${v}」以降の番号を1つずつ繰り上げます(例: 1,2,3の間に割り込み→1,2,3,4)\n[キャンセル] 何もしません`
        : `線番「${v}」は既に別の配線で使われています。同じ番号のまま登録しますか？\n(線番の書式に合わない番号(手で付けた名前)は繰り上げないため、重複のまま登録します)`
      );
      if (!doShift) return;
      pushH();
      if (p) {
        // v以上の番号(このネット自身は除く)を、大きい方から順に1つずつ繰り上げて場所を空ける
        const toShift = [];
        state.pages.forEach(pg2 => (pg2.wires||[]).forEach(w => {
          if (!w.wireNo || idsInThisNet.has(w.id)) return;
          const q = wnParse(w.wireNo);
          if (q && q.part === p.part && q.seq >= p.seq) toShift.push(w);
        }));
        toShift.sort((a,b) => wnParse(b.wireNo).seq - wnParse(a.wireNo).seq);
        toShift.forEach(w => {
          const q = wnParse(w.wireNo);
          w.wireNo = wnMake(q.part, q.seq + 1);
        });
      }
      _setNetWireNo(pg.wires, wireIdxs, v);   // 1ネット1か所(_setNetWireNo参照)
      draw();
      wireNoTable();
      return;
    }
  }
  pushH();
  _setNetWireNo(pg.wires, wireIdxs, v);   // 1ネット1か所(_setNetWireNo参照)
  draw();
  wireNoTable();
}

// ページ跨ぎの矢印でつながった行(複数のネット)への入力。1ネットだけの行は従来の applyNetWireNo と同じ。
// 同じファイルの中の相手にだけ書く(別ファイルは読み取り専用)。parts=[[ページ番号,[配線の番号…]],…]
function applyNetWireNoParts(parts, value) {
  if (parts.length === 1) return applyNetWireNo(parts[0][0], parts[0][1], value);
  const v = (value || '').trim();
  if (v) {
    const mine = new Set();
    parts.forEach(([pi, idxs]) => idxs.forEach(i => mine.add(pi + ':' + i)));
    let usedElsewhere = false;
    state.pages.forEach((pg, pi) => (pg.wires || []).forEach((w, i) => { if (w.wireNo === v && !mine.has(pi + ':' + i)) usedElsewhere = true; }));
    if (usedElsewhere && !confirm(`線番「${v}」は既に別の配線で使われています。同じ番号のまま登録しますか？`)) { wireNoTable(); return; }
  }
  pushH();
  parts.forEach(([pi, idxs]) => _setNetWireNo(state.pages[pi].wires, idxs, v));   // 各ページのネットに1か所ずつ(送りと受けの両方に同じ線番が出る)
  draw();
  wireNoTable();
}
function toggleNetAutoNumParts(parts, checked) {
  pushH();
  parts.forEach(([pi, idxs]) => idxs.forEach(i => { const w = state.pages[pi].wires[i]; if (w) w.noAutoNum = !checked; }));
  draw();
}

// CSV: 全ページ分を出力
function exportWireCSV(){ return (typeof sigMemoRun === 'function') ? sigMemoRun(_exportWireCSV) : _exportWireCSV(); }
function _exportWireCSV(){
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  // 【2026-10-04】全部の項目を引用符で囲む(接続チェック・端子台表のCSVと同じ。conn_table.js)。以前は囲んでおらず、線番やページ名に「,」があると列がずれた
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = ['線番,ページ,始点X,始点Y,終点X,終点Y,レイヤー'].map(h => h.split(',').map(q).join(','));
  state.pages.forEach((pg, pi) => {
    const pname = pg.name || ('Sheet'+(pi+1));
    const netNo = netWireNoOf(pg);   // 番号は1ネット1か所なので、ネットの番号を出す
    (pg.wires||[]).forEach((w, wi) => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      const p0 = pts[0], p1 = pts[pts.length-1];
      rows.push([netNo[wi] || '', pname, Math.round(p0.x), Math.round(p0.y), Math.round(p1.x), Math.round(p1.y), w.layer || ''].map(q).join(','));
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
// 【2026-10-04】部品表は**参照図面(プロジェクト)まで含めた盤全体**で集計する(盛田さん「部品表は確実に全体見ないと使い物にならん」)。
// 以前は開いているファイルだけで、1ページ1ファイルに分けて描くと、そのページの部品しか出なかった。
// 別ファイルの記号は読むだけ(xprojWith の写し)なので、打った値の書き戻しは開いているファイルの記号にだけ効く(devSetField)。
// 行には r.local(開いているファイルに記号がある)・r.extFiles(別ファイルの名前)を付け、別ファイルだけの行は打てなくする(showBOM)。
function collectBOMRows(){ return (typeof xprojWith === 'function') ? xprojWith(_collectBOMRows) : _collectBOMRows(); }
function _collectBOMRows(){
  const skip=['text','rect','circle','fline','dim','leader','angle_dim','wire'];
  const devices={};   // 正規化キー -> { spellings:Map(表記->出現数), models:Set, types:Set, parts:0 }
  const noRef={};
  state.pages.forEach((pg,pi)=>{
    const ext=pg._file||'';   // 別ファイル(参照図面)のページ
    (pg.elements||[]).forEach(el=>{
      if(skip.includes(el.type))return;
      if(isSigArrowRole(symRole(el)))return;   // ページ跨ぎの矢印は部品ではない
      // 【2026-09-25】配線の分岐点(●)は部品ではない(盛田さん)。以前は「デバイス未設定」に
      // junction ○台 として載っていた。style未設定も●扱い(draw.js と同じ)。端子台の○/◎は残す。
      if(el.type==='junction'&&(el.style||'dot')==='dot')return;
      const raw=(el.partRef||'').trim();
      const key=normalizeRef(raw);
      if(key){
        if(!devices[key])devices[key]={spellings:new Map(),models:new Set(),modelCnt:new Map(),coilModel:'',specs:new Set(),types:new Set(),
                                       volts:new Set(),makers:new Set(),names:new Set(),notes:new Set(),zones:new Set(),els:[],parts:0};
        const dv=devices[key];
        dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
        dv.parts++;
        dv.types.add(el.type);
        if(ext){ (dv.extFiles=dv.extFiles||new Set()).add(ext); }
        else { dv.els.push(el); dv.local=true;
          // 帳票の⚠を押したときの飛び先: そのデバイスのコイル(無ければ最初の要素)。飛べるのは開いているファイルの記号だけ
          if(!dv.jump||(!dv.jump.coil&&symRole(el)==='coil'))dv.jump={pi,id:el.id,coil:symRole(el)==='coil'};
        }
        const m=(el.partModel||'').trim();
        if(m){
          dv.models.add(m);
          dv.modelCnt.set(m,(dv.modelCnt.get(m)||0)+1);
          if(!dv.coilModel&&symRole(el)==='coil')dv.coilModel=m;
        }
        // 仕様(図面の「仕様」欄=el.label。例: `2P 5A`)。**仕様はデバイスで1つ**(盛田さん。型番とは別の欄)。
        // 端子台の端子(junction)のlabelは端子番号なので除く。改行は空白に直す。
        if(el.type!=='junction'){
          const sp=String(el.label||'').trim().replace(/\s*\n\s*/g,' ');
          if(sp)dv.specs.add(sp);
        }
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
        // 型番も名前も無いときは登録シンボルの名前を出す(以前は内部名 custom_xxx が出た)。登録も無ければ「(登録なし)」
        const cS=(state.customSymbols||[]).find(s=>s.type===el.type);
        const symName=(cS&&(cS.name||cS.label))||(String(el.type).startsWith('custom_')?'(登録なし)':el.type);
        const name=(el.partModel||'').trim()||el.label||symName;
        const k=`${el.type}|${name}`;
        if(!noRef[k])noRef[k]={type:el.type,model:(el.partModel||'').trim(),label:name,
                               maker:(el.partMaker||'').trim(),
                               pname:(el.partName||'').trim(),pnote:(el.partNote||'').trim(),
                               refs:[],count:0,parts:0,noRef:true,warn:'',locs:[]};
        noRef[k].count++; noRef[k].parts++;
        if(ext) (noRef[k].extFiles=noRef[k].extFiles||new Set()).add(ext);
        else noRef[k].locs.push({pi,id:el.id});   // 図面へ飛ぶための位置(デバイス未設定の行を押したとき。開いているファイルだけ)
      }
    });
    // グループが持つデバイス(部品外形図など)も集計する。
    // 外形図は数十本の線の集まりなので、デバイスはグループ側が持っている。
    // partRefが同じなら展開接続図のシンボルと同じ1台にまとまる(二重計上しない)。
    (pg.groups||[]).forEach(g=>{
      const raw=(g.partRef||'').trim();
      const key=normalizeRef(raw);
      if(!key)return;
      if(!devices[key])devices[key]={spellings:new Map(),models:new Set(),modelCnt:new Map(),coilModel:'',specs:new Set(),types:new Set(),
                                     volts:new Set(),makers:new Set(),names:new Set(),notes:new Set(),zones:new Set(),els:[],parts:0};
      const dv=devices[key];
      dv.spellings.set(raw,(dv.spellings.get(raw)||0)+1);
      if(pg._file)(dv.extFiles=dv.extFiles||new Set()).add(pg._file); else dv.local=true;
      const m=(g.partModel||'').trim();
      if(m){dv.models.add(m);dv.modelCnt.set(m,(dv.modelCnt.get(m)||0)+1);}
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
    // 【2026-09-29】型番が複数あるとき、表に出す型番は「一番多く使われている型番」。同数ならコイルの型番、
    // それも無ければ先に見つかった方。以前は最初に見つかった要素の型番で、要素の並び順で決まっていた
    // (Sheet3のCR2は4個がMY4Nなのに、最初に見つかった1個の「MY2N AC100V」が出て、名称・メーカー・電圧が空欄になった)。
    // 複数あること自体は下の警告(型番が複数)で必ず出る。
    const models=[...dv.models];
    const topN=Math.max(0,...dv.modelCnt.values());
    const tops=models.filter(x=>dv.modelCnt.get(x)===topN);
    const model=tops.length>1&&tops.includes(dv.coilModel)?dv.coilModel:(tops[0]||'');
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
    const specs=[...dv.specs];
    const spec=specs[0]||'';
    const zones=[...dv.zones];
    const zone=zones[0]||'';
    const k=devKey;   // 1デバイス=1行(上のコメント参照)
    if(!byModel[k])byModel[k]={type:primary,model,spec,volt,maker,pname,pnote,zone,label:model||'(型番未設定)',jump:dv.jump||null,
                               refs:[],els:[],count:0,parts:0,noRef:false,warn:'',local:!!dv.local,extFiles:[...(dv.extFiles||[])]};
    const row=byModel[k];
    row.refs.push(ref);
    row.els.push(...dv.els);
    row.count++;                 // 台数 = デバイス数
    row.parts+=dv.parts;         // 構成要素数(接点・端子の個数)
    const ws=[];
    if(spells.length>1)ws.push(`${ref}に表記ゆれ(${spells.map(s=>s[0]).join(' / ')})`);
    if(models.length>1)ws.push(`${ref}に型番が複数(${models.join(' / ')})`);
    if(specs.length>1)ws.push(`${ref}に仕様が複数(${specs.join(' / ')})`);   // 仕様はデバイスで1つのはず
    if(makers.length>1)ws.push(`${ref}にメーカーが複数(${makers.join(' / ')})`);
    if(volts.length>1)ws.push(`${ref}にコイル電圧が複数(${volts.join(' / ')})`);
    // 2026-08-23: 「手配区分が複数」→「対象外の設定が食い違う」に言い換え。
    // 同じデバイスなのに一部だけ対象外になっているのは設定ミスの可能性が高い。
    if(zones.length>1)ws.push(`${ref}は対象外の設定が食い違っています`);
    if(!model)ws.push('型番未設定');
    if(ws.length)row.warn=row.warn?`${row.warn}｜${ws.join('｜')}`:ws.join('｜');
  });

  Object.values(noRef).forEach(r=>{ r.extFiles=[...(r.extFiles||[])]; r.local=r.locs.length>0; });
  return [...Object.values(byModel),...Object.values(noRef)];
}
// 旧仕様(要素を1個ずつ数える)の集計。比較用に残す。
function collectBOMRowsLegacy(){
  const skip=['text','rect','circle','fline','dim','leader'];
  const counts={};
  state.pages.forEach(pg=>{
    (pg.elements||[]).forEach(el=>{
      if(skip.includes(el.type))return;
      if(isSigArrowRole(symRole(el)))return;
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

// 部品表を開く(リボン・帳票のタブ): 今読んでいる参照図面ですぐ出し、参照図面を読み直したら出し直す(クロスリファレンスの「更新」と同じ)。
// 値を打ったあと等の出し直しは showBOM(読み直さない)
async function openBOM(){
  showBOM();
  if (typeof xprojReload !== 'function') return;
  let reloaded = false;
  try { reloaded = await xprojReload(); } catch (e) { console.warn('参照図面の読み直しに失敗', e); }
  if (reloaded && document.getElementById('report-p')?.classList.contains('open') && _lastReportTab === 'bom') showBOM();
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
  const extN=(typeof xprojPages==='function')?xprojPages().length:0;
  const scope=extN?`このファイル${state.pages.length}ページ＋プロジェクトの別ファイル${extN}ページを集計`:`このファイル${state.pages.length}ページを集計`
    +(typeof xprojState!=='undefined'&&!xprojState.files.length?`(左パネルの「プロジェクト」でフォルダを開くと盤全体の部品表になります)`:'');
  const head=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">${scope}・${devTotal} 台`
    +(noRefTotal?`　<span style="color:var(--red)">デバイス未設定 ${noRefTotal} 個</span>`:'')
    +`<br>数量はデバイス単位の台数です。構成数は接点・端子を含む図形の個数です。`
    +`プロパティで「部品表の対象外」にした部品は既定では集計されません。`
    +(extN?`<br>プロジェクトの別ファイルの分は表示だけです。打った値は開いているファイルの記号に入ります(別ファイルの分はそのファイルを開いて直してください)。`:'')+`</p>`
    +`<p style="margin-bottom:6px;padding:5px 6px;background:var(--bg2);border-radius:3px">`
    +cb('excluded','対象外の部品も含める')+cb('noRef','デバイス未設定を含める')
    +(hidden?`<span style="font-size:11px;color:var(--red)">（${hidden}台を非表示中・CSVにも出ません）</span>`:'')
    +`</p>`
    // 同じデバイスで値が食い違っている所があれば、選ぶ画面を開くボタン(js/devices.js)
    +((typeof devConflicts==='function'&&devConflicts().length)
      ?`<p style="margin-bottom:6px"><button class="fp-btn" style="color:var(--red);border-color:var(--red)" onclick="devResolveDialog(null,{undo:true,onDone:()=>showBOM()})">`
        +`⚠ 同じデバイスで値が食い違っています（${devConflicts().length}件）— 食い違いを直す</button></p>`:'');
  // 部品表でもコイル電圧を変えられるようにする(プロパティとどちらでも変更できる)。
  // 変更するとその行(=そのデバイス)の要素すべてに反映される。
  window._bomRows = rows;
  const voltCell = (r, i) => {
    if (r.noRef) return '<td style="color:var(--fg3)">-</td>';
    if (r.local === false) return `<td style="color:var(--fg2)">${escH(r.volt || '')}</td>`;   // 別ファイルだけの行は表示だけ
    const opts = (r.model && typeof partVoltOptions === 'function') ? partVoltOptions(r.model) : [];
    if (!opts.length) {
      // 【2026-09-29】部品DBに無い型番(・型番が未入力)でも、コイルのあるデバイスには電圧を打てるようにする(盛田さん「電圧の修正が効かない」)。
      // 以前は選択肢が作れないと「-」だけで、電圧を入れる場所が部品表にも(プロパティにも)無かった。型番は手打ちで部品DBと
      // 一致するとは限らないので、実際にはこの場合が多い。コイルの無いデバイス(ランプ・ブレーカ等)は従来どおり「-」。
      // すでに電圧が入っているデバイスは、コイルの有無に関わらず値を見せて直せるようにする。
      const hasCoil = (r.els || []).some(el => typeof symRole === 'function' && symRole(el) === 'coil');
      if (!hasCoil && !r.volt) return '<td style="color:var(--fg3)">-</td>';
      return typedCell(r, i, r.volt, 'setBOMVolt', 96);
    }
    // 【2026-09-29】図面に入っている電圧をそのまま見せる。以前は図面の電圧が空(または選択肢に無い値)のとき、
    // 先頭の選択肢(AC12Vなど)を選択済みとして見せていた。データ・CSVは空のままなので、画面を信じると食い違う。
    // 空のときは「未設定」を選択済みにし、選ぶまで図面には何も入れない。選択肢に無い値はそのまま見せて印を付ける。
    if (opts.length === 1 && r.volt === opts[0]) return `<td style="color:var(--fg2)">${escH(opts[0])}</td>`;
    const cur = r.volt || '';
    const stale = cur && !opts.includes(cur);
    return `<td style="white-space:nowrap"><select onchange="setBOMVolt(${i}, this.value)" style="font-size:11px;min-width:96px${cur ? '' : ';color:var(--red)'}">`
      + (cur && !stale ? '' : `<option value=""${cur ? '' : ' selected'}>(未設定)</option>`)
      + (stale ? `<option value="${escH(cur)}" selected>${escH(cur)} (選択肢に無い)</option>` : '')
      + opts.map(o => `<option value="${escH(o)}"${o === cur ? ' selected' : ''}>${escH(o)}</option>`).join('')
      + `</select></td>`;
  };
  // メーカー欄。**帳票で直接打てる**(盛田さん「プロパティ手打ちは論外、
  // 帳票に型式打ち込みになるからメーカー欄も帳票手打ちだな」)。
  // コイル電圧(voltCell/setBOMVolt)と同じ作法で、その行の全要素へ書き戻す。
  // 部品DBに登録済みの型番は値が既に入っているので打ち直さなくてよい。
  // 手打ちできるセルを作る共通部分(メーカー・名称・備考)。
  const typedCell = (r, i, val, fn, w) => {
    if (r.noRef || r.local === false) return `<td style="color:${r.noRef ? 'var(--fg3)' : 'var(--fg2)'}">${escH(val||'')}</td>`;   // 別ファイルだけの行は表示だけ
    return `<td><input type="text" value="${escH(val||'')}" placeholder="—"`
      + ` onchange="${fn}(${i}, this.value)"`
      + ` style="width:${w}px;font-size:11px;background:var(--bg3);color:var(--fg);`
      + `border:1px solid var(--bd2);border-radius:3px;padding:1px 3px"></td>`;
  };
  const makerCell = (r, i) => typedCell(r, i, r.maker, 'setBOMMaker', 90);
  const nameCell  = (r, i) => typedCell(r, i, r.pname, 'setBOMName', 110);
  const noteCell  = (r, i) => typedCell(r, i, r.pnote, 'setBOMNote', 150);
  // 仕様(図面の仕様欄=el.label)。型番とは別の欄なので別の列。**帳票で直接打てる**(型番・メーカー・名称・備考・電圧と同じ)。
  // 書き戻す先がない行(端子台だけ・デバイス未設定)は「-」。
  const specCell  = (r, i) => (r.noRef || !(r.els || []).some(el => el.type !== 'junction'))
    ? '<td style="color:var(--fg3)">-</td>' : typedCell(r, i, r.spec, 'setBOMSpec', 220);
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
  // 【2026-09-29】型番も帳票で直接打てる(盛田さん「部品表で型番修正できないが？」)。メーカー・名称・備考と同じ作法で、
  // そのデバイスの全要素へ書き戻す(setBOMModel)。型番が複数あって食い違っているときも、ここで1つに揃えられる。
  // デバイス未設定の行は、書き戻す先のデバイスが無いので打てない(従来の表示のまま)。
  // デバイス未設定の行(=そのまとまりの部品が図面のどこにあるか分からない)を押すと、図面のその部品へ飛ぶ。
  // 同じ種類・名前の部品が複数あるときは、押すたびに次の部品へ飛ぶ(盛田さん「部品表のデバイス未確定も飛べるように」)。
  const noRefJump = (r, i, inner) => (r.locs && r.locs.length)
    ? `<span style="cursor:pointer;text-decoration:underline dotted" onclick="jumpBOMNoRef(${i})" title="クリックで図面のこの部品へ飛ぶ${r.locs.length > 1 ? `(${r.locs.length}個あります。押すたびに次の部品へ)` : ''}">${inner}${r.locs.length > 1 ? ` <span style="font-weight:400;color:var(--fg3)">(${r.locs.length})</span>` : ''}</span>`
    : inner;
  const modelCell = (r, i) => {
    // ⚠を押すと、図面のそのデバイス(コイル、無ければ最初の記号)へ飛ぶ(盛田さん「デバイス単位の⚠も飛べるように」)
    const warn = r.warn ? (r.jump
      ? `<div style="color:var(--red);font-size:10px;cursor:pointer;text-decoration:underline dotted" title="クリックで図面のこのデバイスへ飛ぶ" onclick="jumpToRefEl(${r.jump.pi},${_jsArg(r.jump.id)})">⚠${escH(r.warn)}</div>`
      : `<div style="color:var(--red);font-size:10px">⚠${escH(r.warn)}</div>`) : '';
    if (r.noRef) return `<td>${noRefJump(r, i, escH(r.label))}${warn}</td>`;
    if (r.local === false) return `<td>${escH(r.model || '(型番未設定)')}${warn}</td>`;   // 別ファイルだけの行は表示だけ
    return `<td><input type="text" value="${escH(r.model||'')}" placeholder="(型番未設定)"`
      + ` onchange="setBOMModel(${i}, this.value)" title="このデバイスの全要素(コイル・接点・端子)に同じ型番を入れます"`
      + ` style="width:170px;font-size:11px;background:var(--bg3);color:var(--fg);border:1px solid var(--bd2);border-radius:3px;padding:1px 3px">${warn}</td>`;
  };
  const rowHtml = ({r,i}) =>
    `<tr${r.noRef?' style="background:var(--rbg)"':''}>`
    +`<td style="font-weight:600">${r.noRef?noRefJump(r,i,'<span style="color:var(--red)">未設定</span>'):(escH(r.refs.join(', '))||'-')}`
    // 別ファイル(参照図面)にある分: どのファイルか。開いているファイルにもあるなら、打った値は別ファイルの分には入らないことを添える
    +((r.extFiles||[]).length?`<div style="font-weight:400;font-size:10px;color:var(--fg3)" title="${r.local?'打った値は開いているファイルの記号にだけ入ります。別ファイルの分はそのファイルを開いて直してください':'別ファイルだけにある部品です。直すときはそのファイルを開いてください'}">${r.local?'＋':''}別ファイル: ${escH(r.extFiles.join(', '))}</div>`:'')
    +`</td>`
    +nameCell(r,i)
    +modelCell(r,i)
    +specCell(r,i)
    +makerCell(r,i)
    +voltCell(r,i)
    +`<td style="font-weight:600">${r.count}</td><td style="color:var(--fg3)">${escH(r.parts)}</td>`
    +noteCell(r,i)+`</tr>`;
  const section = (title, list) => {
    if (!list.length) return '';
    const cnt = list.reduce((s,{r})=>s+r.count,0);
    return `<p style="font-size:11px;font-weight:600;margin:10px 0 3px">${title}`
      + `<span style="color:var(--fg3);font-weight:400">（${cnt}台）</span></p>`
      + `<table class="tbl"><tr><th>デバイス</th><th>名称</th><th>型番/名称</th><th title="図面の「仕様」欄の内容。ここで直せます(そのデバイスの記号に入ります)">仕様</th><th>メーカー</th><th>コイル電圧</th><th>数量(台)</th><th>構成数</th><th>備考</th></tr>`
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
  volt=(volt||'').trim();   // 手打ち(部品DBに無い型番のセル)の前後の空白を落とす
  if(typeof pushH==='function')pushH();   // 変更前の状態を履歴に積む
  if(typeof stSetPref==='function')stSetPref('partVolt',volt);   // 前回値(settings.js)
  devSetField(devKey(r.refs[0]),'partVolt',volt);   // デバイスの全部の記号へ(js/devices.js)
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
  devSetField(devKey(r.refs[0]),'partMaker',maker);   // デバイスの全部の記号へ(js/devices.js)
  if(typeof draw==='function')draw();
  if(typeof updateRightPanel==='function')updateRightPanel();
  showBOM();
}
// デバイス未設定の行から、図面のその部品へ飛ぶ。同じ行(同じ種類・名前)に複数あるときは、押すたびに次の部品へ。
function jumpBOMNoRef(idx){
  const r=(window._bomRows||[])[idx];
  if(!r||!r.locs||!r.locs.length)return;
  const m=(window._bomJumpNext=window._bomJumpNext||{});
  const key=r.type+'|'+r.label;
  const n=(m[key]||0)%r.locs.length;
  m[key]=n+1;
  jumpToRefEl(r.locs[n].pi,r.locs[n].id);
}
// 型番を部品表のセルから直接打つ。そのデバイスの全要素と、同じデバイスのグループ(外形図)に書き戻す。
// 電圧など、ほかの項目は触らない(型番を変えたあと電圧が選択肢に無ければ、電圧欄に「選択肢に無い」と出る)。
function setBOMModel(idx, v){
  const r=(window._bomRows||[])[idx];
  if(!r||r.noRef)return;
  if(typeof pushH==='function')pushH();   // 変更前の状態を履歴に積む
  devSetField(devKey(r.refs[0]),'partModel',v);   // デバイスの全部の記号と外形図へ(js/devices.js)
  if(typeof draw==='function')draw();
  if(typeof updateRightPanel==='function')updateRightPanel();
  showBOM();
}
// 仕様を部品表のセルから直接打つ。**仕様はデバイスで1つ**なので、そのデバイスの記号(端子台の端子は除く)に同じ値を入れる。
// ただし図面の見た目を勝手に増やさないため、**もともと仕様が入っている記号だけ**を書き換える(表示するかは各記号の「仕様を図面に表示」のまま)。
// どの記号にも仕様が無いデバイスは、コイル(無ければ最初の記号)1つだけに入れる(そこに仕様が出る)。空にすると全記号の仕様を消す。
function setBOMSpec(idx, v){
  const r=(window._bomRows||[])[idx];
  if(!r||r.noRef)return;
  const targets=(r.els||[]).filter(el=>el.type!=='junction');
  if(!targets.length)return;
  if(typeof pushH==='function')pushH();   // 変更前の状態を履歴に積む
  // デバイスの全部の記号へ(js/devices.js)。仕様が空だった記号は「仕様を図面に表示」をOFFにして入れるので、
  // 図面の見た目は変わらない(仕様が無いデバイスに初めて入れるときはコイル、無ければ最初の記号にだけ出る)
  devSetField(devKey(r.refs[0]),'label',v);
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
  devSetField(devKey(r.refs[0]),prop,v);   // デバイスの全部の記号へ(js/devices.js)
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
  dl(['デバイス,名称,型番/名称,仕様,メーカー,コイル電圧,対象外,数量(台),構成数,備考,警告',
      ...rows.map(r=>[r.noRef?'未設定':r.refs.join('/'),r.pname||'',r.label,r.spec||'',r.maker||'',
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
// 図面枠そのものが無いページはページ番号だけを返す。ページ番号は表題欄の頁番号(空欄ならシートの並び順)。
// 「枠が無い」のか「枠の外にはみ出している」のかを区別できるようにしてある。
function elLocation(el, pageIdx) {
  const pg = state.pages[pageIdx];
  const p = elAnchor(el);
  const z = (p && pg) ? zoneOf(p.x, p.y, pg.frameObj) : '';
  // 【2026-10-01】ページは**表題欄の頁番号**(図面枠パネルの「ページ」欄 = frameObj.page)。盛田さん「表題欄に書く頁番号」。
  // 分割ファイル(1ページ1ファイル)では、シートの並び順はどのファイルでも「1」で意味が無いため。
  // 「3 / 10」のように総数まで書いてあれば「/」の前だけ使う(位置の「3/6B」の区切りと混ざらないように)。
  // 頁番号が空欄のページは従来どおりシートの並び順(別ファイルはファイル名を頭に付ける=どのファイルか分かるように)。
  const fp = (pg && pg.frameObj && pg.frameObj.page != null) ? String(pg.frameObj.page).split('/')[0].trim() : '';
  const no = fp || (pg && pg._pno) || (pageIdx + 1);
  const pre = (!fp && pg && pg._file) ? pg._file + '/' : '';
  return z ? `${pre}${no}/${z}` : `${pre}${no}`;
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
// ページ跨ぎの矢印(送り・受け)。部品表・接点Refなど部品を数える帳票からは除く(2026-09-30)
function isSigArrowRole(r){ return r==='sig_out'||r==='sig_in'; }
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
  const devs={};   // 正規化キー -> { spellings:Map, coils:[], contacts:[], led:台帳のデバイス }
  // 【2026-09-30 デバイス台帳③】デバイスのまとめ方・型式は台帳(js/devices.js deviceLedger)から読む。
  // 部品表・クロスリファレンス・端子台表と同じまとめ方になる(以前はこの帳票だけで独自にまとめていた)。
  deviceLedger().forEach(D=>{
    D.items.forEach(it=>{
      if(it.group)return;                  // 外形図(グループ)は図面上の部品の位置ではない
      const el=it.el;
      if(skip.includes(el.type))return;
      const role=symRole(el);
      if(!devs[D.key])devs[D.key]={spellings:D.spell,coils:[],contacts:[],noRef:false,led:D};
      const rec={el,page:it.pi+1,role,loc:elLocation(el,it.pi)};
      if(role==='coil')devs[D.key].coils.push(rec); else devs[D.key].contacts.push(rec);
    });
  });
  // デバイス名の無い要素(台帳に入らない)は、種類ごとに「(デバイス未設定)」の行へ
  state.pages.forEach((pg,pi)=>{
    (pg.elements||[]).forEach(el=>{
      if((el.partRef||'').trim())return;
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

  const sortedKeys=keys.sort();
  window._refKeys=sortedKeys;
  let _xrefDevs=null;
  const rows=sortedKeys.map((k,ki)=>{
    const dv=devs[k];
    const spells=[...dv.spellings.entries()].sort((a,b)=>b[1]-a[1]);
    const name=spells.length?spells[0][0]:'(デバイス未設定)';
    const warns=[];
    if(spells.length>1)warns.push(`表記ゆれ: ${spells.map(s=>s[0]).join(' / ')}`);
    // 【2026-10-06】「コイル未配置」の警告はやめた(盛田さん「コイル未配置になってる理由」→ 案1)。
    // 「接点(主・a・b)があるのにコイルが無い」で出していたが、ブレーカー(CP・ELB)・インバータ(主接点)・押釦(a接点)のような
    // もともとコイルの無い機器にも出て、本当の抜けではなかった。コイルの欄の「未配置」はそのまま(描き忘れはそこで見る)
    const nContacts=dv.contacts.filter(c=>REF_CONTACT_ROLES.includes(c.role)).length;
    if(dv.coils.length>1)warns.push(`コイルが${dv.coils.length}個`);
    if(dv.noRef)warns.push('デバイス未設定');
    // 同じデバイスで値が食い違っている(部品表の「食い違いを直す」で選ぶ)
    if(dv.led&&dv.led.conflicts.length)warns.push(`値が食い違い(${dv.led.conflicts.map(c=>(DEV_FIELDS.find(f=>f.key===c.field)||{name:c.field}).name).join('・')})`);
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
    // 「確認」列: 図面のクロスリファレンスに番号が出ない理由と、直し方(型式の入力・該当の接点へ飛ぶ)
    let chk='';
    if(dv.coils.length&&!dv.noRef&&typeof xrefDiagnose==='function'){
      const xd=(_xrefDevs||(_xrefDevs=xrefCollect())).get(k);
      const conflict=!!(dv.led&&dv.led.conflicts.some(c=>c.field==='partModel'));
      const model=conflict?'':String((dv.led&&dv.led.vals.partModel)||'').trim();   // 型式はデバイスの値(台帳)
      const probs=xd?xrefDiagnose(xd):[];
      chk=`<input type="text" value="${escH(model)}" placeholder="${conflict?'(食い違い)':'型式'}" style="width:110px;font-size:11px"`
        +` title="このデバイスの全要素に同じ型式を入れます" onchange="setRefModel(${ki},this.value)">`
        +(probs.length
          ?probs.map(pb=>pb.resolve
            ?`<div style="font-size:10px;color:var(--red);cursor:pointer;text-decoration:underline dotted" title="クリックで、食い違いを選ぶ画面を開く" onclick="devResolveDialog(null,{undo:true,onDone:()=>showRefPanel()})">⚠ ${escH(pb.msg)}</div>`
            :pb.id
            ?`<div style="font-size:10px;color:var(--red);cursor:pointer;text-decoration:underline dotted" title="クリックで図面のその接点へ飛ぶ" onclick="jumpToRefEl(${pb.pi},'${_escAttr(pb.id)}')">⚠ ${escH(pb.msg)}</div>`
            :`<div style="font-size:10px;color:var(--red)">⚠ ${escH(pb.msg)}</div>`).join('')
          :'<div style="font-size:10px;color:var(--fg3)">✓ 問題なし</div>');
    }
    // ⚠を押すと、図面のそのデバイス(コイル、無ければ最初の記号)へ飛ぶ
    const tgt=dv.coils[0]||dv.contacts[0];
    const warnHtml=!warns.length?'':tgt
      ?`<br><span style="color:var(--red);font-size:10px;cursor:pointer;text-decoration:underline dotted" title="クリックで図面のこのデバイスへ飛ぶ" onclick="jumpToRefEl(${tgt.page-1},${_jsArg(tgt.el.id)})">⚠ ${escH(warns.join(' / '))}</span>`
      :`<br><span style="color:var(--red);font-size:10px">⚠ ${escH(warns.join(' / '))}</span>`;
    return `<tr><td><b>${escH(name)}</b>${warnHtml}</td>`
      +`<td>${coilTxt}</td>`
      +`<td>${dv.contacts.map(badge).join(' ')||'なし'}</td>`
      +`<td>${nContacts}</td>`
      +`<td>${chk}</td></tr>`;
  }).join('');

  const noFrame=state.pages.some(pg=>!pg.frameObj||!pg.frameObj.cols);
  const html=`<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    +`全${state.pages.length}ページ集計。位置は「ページ/区画」で表示します(例: 2/B3)。`
    +(noFrame?`<br><span style="color:var(--red)">図面枠が未設定のページは区画が出せないため、ページ番号のみ表示しています。</span>`:'')
    +`</p>`
    +`<table class="tbl"><tr><th>デバイス</th><th>コイル</th><th>接点</th><th>接点数</th><th title="図面のクロスリファレンスに番号が出ない理由。型式はここで入力できます">クロスリファレンス確認</th></tr>${rows}</table>`;
  _reportOpen('ref', '接点・コイル リファレンス', html, () => exportRefCSV(devs));
}

// 接点Refの「確認」列の型式欄から、そのデバイスの全要素に型式を書き戻す(部品表のセルと同じ作法: pushHで取り消せる)。
// 電圧などほかの項目は触らない。
function setRefModel(ki,v){
  const key=(window._refKeys||[])[ki];
  if(key==null)return;
  if(typeof pushH==='function')pushH();
  devSetField(key,'partModel',v);   // デバイスの全部の記号と外形図へ(js/devices.js)
  if(typeof draw==='function')draw();
  if(typeof updateRightPanel==='function')updateRightPanel();
  showRefPanel();
}
// 確認列の⚠を押したとき: 帳票を閉じて、その要素のあるページへ移り、選択して画面中央に出して2秒点滅させる
// (線番表の jumpToNet・検索の jumpToHit と同じ動き)。
// 第3引数 focus({x,y})を渡すと、その点を中央・点滅にする(端子を指すとき。省略時は要素の代表点)。
function jumpToRefEl(pageIdx,id,focus){
  const pg=state.pages[pageIdx];
  const el=pg&&(pg.elements||[]).find(e=>e.id===id);
  if(!el)return;
  if(typeof closeFP==='function')closeFP('report-p');
  if(pageIdx!==state.currentPage&&typeof switchPage==='function')switchPage(pageIdx);
  const a=focus||elAnchor(el);
  if(state.zoom<1)state.zoom=1;
  state.pan.x=cv.width/2-a.x*state.zoom;
  state.pan.y=cv.height/2-a.y*state.zoom;
  state.sel.els.clear();state.sel.wires.clear();
  state.sel.els.add(el.id);
  if(typeof updateResizeHandles==='function')updateResizeHandles();
  if(typeof updateRightPanel==='function')updateRightPanel();
  state.searchHit={x:a.x,y:a.y,t0:Date.now()};
  const anim=()=>{
    if(!state.searchHit)return;
    if(Date.now()-state.searchHit.t0>2000){state.searchHit=null;draw();return;}
    draw();
    requestAnimationFrame(anim);
  };
  anim();
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
  // デバイスのある台は台帳(js/devices.js)で書く(綴りの違う端子にも。部品表・接点Refと同じまとめ方)
  if (typeof devSetField === 'function' && typeof devKey === 'function' && devKey(target) && target !== '(デバイス未設定)') {
    const n = devSetField(devKey(target), 'tbExclude', excluded ? 'true' : '');
    if (typeof draw === 'function') draw();
    if (typeof updateRightPanel === 'function') updateRightPanel();
    if (typeof showTBTable === 'function') showTBTable();
    return n;
  }
  let n = 0;
  (state.pages || [{ elements: state.elements }]).forEach(pg => {
    (pg.elements || []).forEach(el => {
      if (el.type !== 'junction') return;
      if (_tbKey(el.partRef) !== _tbKey(target)) return;
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

// 端子のデバイス判定用のキー。部品表・接点Ref・クロスリファレンスと同じ normalizeRef で束ねる(2026-09-29)。
// 以前は端子台表だけ綴りそのままで比べたため、`TB-2`と`TB2`が部品表では同じ台・端子台表では別の台になっていた。
function _tbKey(ref) {
  const r = String(ref || '').trim();
  return r ? (normalizeRef(r) || r) : '(デバイス未設定)';
}
// キー → 表示名(そのデバイスで一番多く使われている綴り。同数なら先に出てきた方)。
function tbDeviceNames(rows) {
  const cnt = new Map();   // key -> Map(綴り -> 数)
  rows.forEach(r => {
    const raw = String((r.el || r).partRef || '').trim();
    const key = _tbKey(raw);
    if (!cnt.has(key)) cnt.set(key, new Map());
    const m = cnt.get(key), sp = raw || '(デバイス未設定)';
    m.set(sp, (m.get(sp) || 0) + 1);
  });
  const names = new Map();
  cnt.forEach((m, key) => names.set(key, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]));
  return names;
}

// デバイス(TB1等)ごとにまとめる。デバイス未設定のものは「(デバイス未設定)」へ。
// 綴りが違っても同じデバイスなら1つにまとめ、表示名は一番多い綴り。
function groupTerminalsByDevice(rows) {
  const names = tbDeviceNames(rows);
  const g = new Map();
  rows.forEach(r => {
    const key = names.get(_tbKey(r.el.partRef));
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
  if (_tbKey(dragEl.partRef) !== _tbKey(targetEl.partRef)) {
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

// ----------------------------------------------------------------
// 線番の設定(フロートパネル。2026-10-04 盛田さん「設定にページ+番号の桁数を持たせたら」「設定はフロートパネルに出す」)
// 書式は図面ファイルに保存する(state.wireNoFmt)。割付・振り直しもここから押せる
// ----------------------------------------------------------------
// 線番表の「線番の設定」から: 設定パネル(js/settings.js openSettingsPanel)の線番の項目を開く
function wireNoSettings() {
  if (typeof openSettingsPanel === 'function') { openSettingsPanel('set-sec-wn'); return; }
  wireNoSettingsFill();
}
function wireNoSettingsFill() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const f = wnFmt();
  const pd = document.getElementById('wn-page-digits'), sd = document.getElementById('wn-seq-digits');
  if (pd) pd.value = String(f.pageDigits);
  if (sd) sd.value = String(f.seqDigits);
  const mb = document.getElementById('wn-main-branch'), mm = document.getElementById('wn-main-motor');
  if (mb) mb.value = f.mainBranch;
  if (mm) mm.value = f.mainMotor;
  wireNoSettingsInfo();
}
// 書式を変えたら、**変える前の書式に合っていた番号**を新しい書式に書き換えるか聞く(連番はそのまま、ページ番号の部分だけ付け替える)。
// 書き換えないと、それらは新しい書式に合わず「手で付けた名前」扱いになり、割付・振り直しで動かなくなるため(Sheet3の 01〜16 → 301〜316)
function setWireNoFmt() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const pd = document.getElementById('wn-page-digits'), sd = document.getElementById('wn-seq-digits');
  const oldFmt = wnFmt();
  const units = wnUnits();
  const olds = units.map(u => ({ u, no: wnUnitNos(u)[0] || '', many: wnUnitNos(u).length > 1 })).map(x => Object.assign(x, { p: x.no && !x.many ? wnParse(x.no) : null }));
  const mb = document.getElementById('wn-main-branch'), mm = document.getElementById('wn-main-motor');
  state.wireNoFmt = { pageDigits: Number(pd ? pd.value : 0), seqDigits: Number(sd ? sd.value : 2),
    mainBranch: mb ? mb.value : oldFmt.mainBranch, mainMotor: mm ? mm.value : oldFmt.mainMotor };
  const conv = olds.filter(x => x.p);
  const pg = state.pages[state.currentPage || 0];
  if (pg) pg.dirty = true;
  if (typeof renderPageTabs === 'function') renderPageTabs();
  const nf = wnFmt();
  if (conv.length && (oldFmt.pageDigits !== nf.pageDigits || oldFmt.seqDigits !== nf.seqDigits)) {
    const plan = [], errs = new Set();
    let tooBig = 0;
    conv.forEach(x => {
      if (x.u.extOwned) return;   // 送り側が別ファイルの番号は書き換えない
      const pp = wnPagePart(x.u.owner);
      if (pp.err) { errs.add(pp.err); return; }
      if (x.p.seq > wnSeqMax()) { tooBig++; return; }
      plan.push({ u: x.u, old: x.no, v: wnMake(pp.part, x.p.seq) });
    });
    const after = new Map();
    plan.forEach(c => after.set(c.v, (after.get(c.v) || 0) + 1));
    const dup = [...after.values()].some(n => n > 1);
    // 書き換えられない(ページ番号が空など・同じ番号ができる)なら書式を変えない。変えてしまうと前の書式の番号を後から書き換える手段が無くなる
    if (errs.size || dup) {
      state.wireNoFmt = Object.assign({}, oldFmt, { mainBranch: nf.mainBranch, mainMotor: nf.mainMotor });
      if (pd) pd.value = String(oldFmt.pageDigits);
      if (sd) sd.value = String(oldFmt.seqDigits);
      alert(`前の書式の線番が${conv.length}本あり、新しい書式に書き換えられないため、書式は変えていません。\n`
        + (errs.size ? '⚠' + [...errs].join('\n⚠') + '\n(表題欄のページ番号を入れてから、もう一度変えてください)' : '⚠書き換えると同じ番号ができます'));
      wireNoSettingsInfo();
      return;
    }
    const msg = `書式を変えました。前の書式の線番が${conv.length}本あります。`;
    const lines = plan.slice(0, 20).map(c => `  ${c.old} → ${c.v}`).join('\n');
    if (confirm(`${msg}\n新しい書式に書き換えますか？(連番はそのまま)\n${lines}${plan.length > 20 ? `\n  …ほか${plan.length - 20}件` : ''}`
        + (tooBig ? `\n⚠連番の桁に収まらないもの${tooBig}本は書き換えません` : '')
        + `\n\n[キャンセル] 書き換えない(前の書式の番号は手で付けた名前として扱われ、割付・振り直しで変わらなくなります)`)) {
      pushH();
      plan.forEach(c => wnUnitSet(c.u, c.v));
      draw();
    }
  }
  wireNoSettingsInfo();
}
function wireNoSettingsInfo() {
  const el = document.getElementById('wn-info');
  if (!el) return;
  const f = wnFmt(), pp = wnPagePart(state.currentPage || 0);
  const ex = f.pageDigits ? (pp.err ? wnMake('3'.padStart(f.pageDigits, '0'), 1) + '(3ページ目の1本目)' : `${wnMake(pp.part, 1)}、${wnMake(pp.part, 2)}…`) : `${wnMake('', 1)}、${wnMake('', 2)}…`;
  el.innerHTML = (f.pageDigits
      ? (pp.err ? `<span style="color:var(--red)">⚠${escH(pp.err)}</span>` : `このページのページ番号(表題欄): <b>${escH(pp.part)}</b>`)
      : 'ページ番号を付けません(1ページの図面向け。ファイルに複数のシートがあっても割付・振り直しはシートごとで、他のシートの番号とは重ならないようにします)')
    + `<br>このページの線番: ${escH(ex)}`
    + `<br>使える本数: 1ページ ${wnSeqMax()}本まで`;
}
