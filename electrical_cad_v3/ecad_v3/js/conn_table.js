// ================================================================
// conn_table.js — 接続表・端子台表の自動生成(フェーズ2)
// 依存: state, LAYERS, getDef, dl, openFP, closeFP, _syncCurrentPage
//
// 【設計方針】
// conn_check.js(未接続検出/フェーズ1)と同じ「幾何学的な位置一致」で
// 接続を判定する。配線の wire.fromElId/toElId は配線ツールで端子スナップ
// した時だけ記録される値で、DXFインポートした配線には存在しない
// (dxf_import.js は常に wireNo:null で fromElId フィールド自体を持たない)。
// 盛田さんの実務では大半の配線がDXFインポート由来のため、これらの値には
// 頼らず、常にシンボルの端子(cS.terminals)・端子台(junction)の座標との
// 距離判定で再計算する。
// ================================================================

const CONN_TABLE_TOL = 5; // 許容誤差(ワールド座標単位)。接続チェック・未接続の端子(js/conn_check.jsのボタン)・端子台表で共通
const CONN_TABLE_SYM_ONLY_TYPES = ['text','rect','circle','fline','triangle','arc','junction','bezier','dim','angle_dim','leader'];

// ページ内の全「端子点」(シンボルの端子＋端子台の端子/分岐点)を集めた配列を返す
// 戻り値: [{ x, y, elId, termIdx, kind:'symbol'|'junction', dispName, dispTerm, isBranch }]
function collectTerminalPoints(pageElements) {
  const pts = [];

  (pageElements || []).forEach(el => {
    if (el.type === 'junction') {
      const isTerm = (el.style === 'circle' || el.style === 'dbl'); // 白丸/二重丸のみ端子台の端子
      pts.push({
        // r: 端子台の端子(○◎)の円の半径。円周で止めた線を拾うため、判定は「半径+許容誤差」(findNearestTerminal。線番表 groupWiresByNet と同じ)。分岐点●は0
        x: el.x, y: el.y, r: isTerm ? (el.r || 5) : 0, elId: el.id, termIdx: 0, kind: 'junction',
        dispName: isTerm ? (el.partRef || '端子台') : '分岐点',
        dispTerm: isTerm ? (el.label || '-') : '',
        isBranch: !isTerm,
      });
      return;
    }
    if (CONN_TABLE_SYM_ONLY_TYPES.includes(el.type)) return;

    const cS  = state.customSymbols.find(s => s.type === el.type);
    const rot = (el.rot || 0) * Math.PI / 180;
    const termList = (el.terminals || '').split(',').map(t => t.trim());
    // デバイス名も仕様も無いシンボルは、登録シンボルの名前で出す(以前は内部名 custom_xxx が出た)。登録も無ければ「(登録なし)」
    const dispName = el.partRef || el.label || (cS && (cS.name || cS.label)) || (String(el.type).startsWith('custom_') ? '(登録なし)' : el.type);

    if (cS && cS.terminals && cS.terminals.length) {
      // 端子の定義位置に置いたシンボルの倍率を掛ける(絵は倍率で縮むため。snap.js・draw.js symTermPoints と同じ)
      const tsc = el.scale || 1;
      cS.terminals.forEach((t, i) => {
        const tx = t.x * tsc, ty = t.y * tsc;
        const rx = tx * Math.cos(rot) - ty * Math.sin(rot);
        const ry = tx * Math.sin(rot) + ty * Math.cos(rot);
        // 端子番号の優先順位: ①部品割当時の個体差(el.terminals、型番ごとに異なる
        // 実際の端子番号。例:主接点13-14/補助接点23-24) ②シンボル定義側の既定ラベル
        // (cS.terminals[i].label。ピンエディタで入力、部品未割当でも参照名として出す)
        // ③どちらも無ければ通し番号
        const defLabel = t.label || '';
        pts.push({ x: el.x+rx, y: el.y+ry, elId: el.id, termIdx: i, kind:'symbol', dispName, dispTerm: termList[i] || defLabel || `T${i+1}` });
      });
    } else {
      const d  = getDef(el.type) || {};
      const sc = el.scale || 1;
      const hw = (d.w || 0) / 2 * sc;
      // 【2026-09-20】端子点が未定義のシンボルのフォールバック(本体の左右端)。
      // 並びは **左が1番目、右が2番目**。端子番号を図面に出せるようにしたとき、
      // 従来の [+hw, -hw](右が1番目)のままだと「A1,A2」と入れた図面で
      // A2が左・A1が右に出て読めなかった(盛田さん指摘、2026-09-20)。
      // この式は snap.js / conn_table.js / conn_check.js / draw.js の4箇所にあり、
      // **順番がズレると図面と帳票で端子番号の対応が食い違う。必ず4箇所を揃える。**
      // (tests/test_term_fallback_order.js が4箇所の一致を見ている)
      // 端子の位置自体は変わらない(同じ2点を数える順番が変わるだけ)ので、
      // スナップ位置は動かない。配線に保存される termIdx は誰も読んでいない
      // (conn_table.js はDXF取り込みの配線に無いため距離で再計算する)。
      [-hw, +hw].forEach((dx, i) => {
        const rx = dx * Math.cos(rot), ry = dx * Math.sin(rot);
        pts.push({ x: el.x+rx, y: el.y+ry, elId: el.id, termIdx: i, kind:'symbol', dispName, dispTerm: termList[i] || `T${i+1}` });
      });
    }
  });

  return pts;
}

// 【2026-10-06】端子台の端子(○◎)にじかに付いているシンボルの端子(配線を挟まない)。盛田さん「これが未接続になってる理由は？」
// (Sheet3: モータ M の T1〜T4 が TB2 1〜4 の○の下の縁にじかに付いていて、未接続・どのネットにも入らない扱いだった)→ 案1「つながっていると見なす」。
// 判定は配線の端と同じ「円の半径+許容誤差」以内(findNearestTerminal)。一番近い○を1つ選ぶ。
// all: collectTerminalPoints の結果。戻り値: [{ sym: シンボルの端子点, tb: 端子台の端子点 }]
function connSymOnTB(all, tol) {
  tol = tol == null ? CONN_TABLE_TOL : tol;
  const tbs = all.filter(p => p.kind === 'junction' && p.r);
  if (!tbs.length) return [];
  const out = [];
  all.forEach(p => { if (p.kind !== 'symbol') return; const tb = findNearestTerminal(p.x, p.y, tbs, tol); if (tb) out.push({ sym: p, tb }); });
  return out;
}

// 許容誤差内で最も近い端子点を探す(ページ単位・端子点数は通常数百程度のため線形探索で十分)
// 【2026-10-01】端子台の端子(○◎)は円の大きさ(r)の分を引いた距離で比べる(=「半径+許容誤差」以内)。
// 以前は中心からの距離だけで、端子の円を5より大きくすると円周で止めた線を拾えなかった(線番表は「半径+5」でずれていた)
function findNearestTerminal(x, y, termPts, tol) {
  let best = null, bestD = tol;
  termPts.forEach(p => {
    const d = Math.max(0, Math.hypot(p.x - x, p.y - y) - (p.r || 0));
    if (d <= bestD) { bestD = d; best = p; }
  });
  return best;
}

// ----------------------------------------------------------------
// 接続チェック(ネット単位)
//
// 【2026-09-29 作り直し】以前は「配線1本=1行」で、始点・終点がどの端子に乗っているかを出していた。
// 曲がり角・T字・分岐点でつながる途中の線は端が端子に乗らないので、**正常なのに「端子未特定」で赤くなり**
// (Sheet3は配線70本中20本)、本当に浮いている端と区別できなかった。作り直して、
//   ・1行=**ネット**(つながっている配線のまとまり。report.js の groupWiresByNet =線番表と同じ)
//   ・そのネットに乗っている**端子の一覧**(分岐点▲でつながった先の端子もここに出る)
//   ・**問題は端(たん)単位**で出す: 端が「端子にも、他の配線の端にも、●にも、他の配線の途中にも」触れていない=**浮いている端**
//     (許容誤差 CONN_TABLE_TOL)。最寄りの端子と距離を添える(ズレて繋がっていないだけ、を見分けるため)
//   ・●の無いT字(他の配線の途中に端が乗っているが●が無い)は「つながっていない扱い」なので警告(線番表のネット判定と同じ)
//   ・未採番のネット
//   ・行(と問題の各行)を押すと、図面のその場所へ飛ぶ
// 「1本ごとの始点・終点」は出さない(盤の配線リストは裏面接続図の範囲で、展開接続図からは出せない)。
// ----------------------------------------------------------------
const CONN_NEAR_HINT = 60;   // 浮いている端に「最寄りの端子」を添える探索距離

// 全ページのネットごとの接続の分析。
// 戻り値: [{ pageIdx, page, idxs, wireNo, terms:[{name,term}], branch, dangling:[{x,y,wireIdx,near}], tees:[{x,y,wireIdx}] }]
function analyzeConnections() { return (typeof sigMemoRun === 'function') ? sigMemoRun(_analyzeConnections) : _analyzeConnections(); }
function _analyzeConnections() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const out = [];
  const tol = CONN_TABLE_TOL, bk = v => Math.round(v / tol);
  state.pages.forEach((pg, pi) => {
    const wires = pg.wires || [];
    if (!wires.length) return;
    const pname = pg.name || ('Sheet' + (pi + 1));
    const all = collectTerminalPoints(pg.elements || []);
    const terms = all.filter(p => !p.isBranch);        // 端子(シンボルの端子・端子台の○◎)
    const branches = all.filter(p => p.isBranch);      // 分岐点(●)
    const onTB = connSymOnTB(all, tol);                // 端子台の○にじかに付いたシンボルの端子
    const netNo = netWireNoOf(pg);
    const ptsOf = w => w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
    // 配線の端の索引(他の配線の端に触れているかを速く調べる)
    const idx = new Map();
    wires.forEach((w, i) => {
      const pts = ptsOf(w);
      [pts[0], pts[pts.length - 1]].forEach(p => {
        const k = `${bk(p.x)},${bk(p.y)}`;
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push({ i, p });
      });
    });
    const touchesOtherEnd = (i, p) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const b = idx.get(`${bk(p.x) + dx},${bk(p.y) + dy}`);
        if (b && b.some(o => o.i !== i && Math.hypot(o.p.x - p.x, o.p.y - p.y) <= tol)) return true;
      }
      return false;
    };
    const segDist = (p, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
      return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
    };
    const onOtherWire = (i, p) => wires.some((w, j) => {
      if (j === i) return false;
      const q = ptsOf(w);
      for (let k = 0; k + 1 < q.length; k++) if (segDist(p, q[k], q[k + 1]) <= tol) return true;
      return false;
    });

    groupWiresByNet(wires, null, pg.elements).forEach(idxs => {
      const net = { pageIdx: pi, page: pname, idxs, wireNo: netNo[idxs[0]] || '', terms: [], branch: 0, dangling: [], tees: [] };
      const seen = new Set();
      idxs.forEach(i => {
        const pts = ptsOf(wires[i]);
        [pts[0], pts[pts.length - 1]].forEach(p => {
          const t = findNearestTerminal(p.x, p.y, terms, tol);
          if (t) {
            const key = t.elId + ':' + t.termIdx;
            if (!seen.has(key)) { seen.add(key); net.terms.push({ name: t.dispName || '-', term: t.dispTerm || '-' }); }
            return;
          }
          if (branches.some(b => Math.hypot(b.x - p.x, b.y - p.y) <= tol)) { net.branch++; return; }
          if (touchesOtherEnd(i, p)) return;
          if (onOtherWire(i, p)) { net.tees.push({ x: p.x, y: p.y, wireIdx: i }); return; }
          const n = findNearestTerminal(p.x, p.y, terms, CONN_NEAR_HINT);
          net.dangling.push({ x: p.x, y: p.y, wireIdx: i,
            near: n ? { name: n.dispName || '-', term: n.dispTerm || '-', d: Math.round(Math.hypot(n.x - p.x, n.y - p.y) * 10) / 10 } : null });
        });
      });
      // 【2026-10-02】端子台の端子(○◎)の円の中を通っている線も、その端子につながっている(端子の上をまっすぐ通して描いた線)
      terms.forEach(t => {
        if (t.kind !== 'junction' || !t.r) return;
        const key = t.elId + ':' + t.termIdx;
        if (seen.has(key)) return;
        if (idxs.some(i => _wireThroughCircle(ptsOf(wires[i]), t))) { seen.add(key); net.terms.push({ name: t.dispName || '-', term: t.dispTerm || '-' }); }
      });
      // 【2026-10-06】そのネットの端子台の端子(○◎)にじかに付いているシンボルの端子も、このネットの端子(connSymOnTB)
      onTB.forEach(({ sym, tb }) => {
        const key = sym.elId + ':' + sym.termIdx;
        if (seen.has(tb.elId + ':' + tb.termIdx) && !seen.has(key)) { seen.add(key); net.terms.push({ name: sym.dispName || '-', term: sym.dispTerm || '-' }); }
      });
      net.terms.sort((a, b) => (a.name + ' ' + a.term).localeCompare(b.name + ' ' + b.term, 'ja', { numeric: true }));
      out.push(net);
    });
  });
  return out;
}

// 未接続の端子: シンボルの端子に、配線の端が(許容誤差 CONN_TABLE_TOL 以内に)1本も来ていないもの。
// 【2026-09-29】ツールバーの「⚠未接続」(js/conn_check.js)は以前、別の作り(現在のページだけ・独自の座標計算)だった。
// **接続チェックと同じ端子の位置(collectTerminalPoints)・同じ許容誤差・全ページ**で数えるようにここへ集めた(conn_check.js の計算は無くした)。
// 対象は従来どおりシンボルの端子だけ。分岐点(●)と端子台の端子(○◎)は含めない(端子台の未接続は端子台表が出す)。非表示レイヤーの要素は除く。
// 【2026-10-06】端子台の端子(○◎)にじかに付いているシンボルの端子は未接続にしない(connSymOnTB)。
// 戻り値: [{ pageIdx, page, elId, termIdx, x, y, name, term }](ページ順 → デバイス名・端子番号の順)
function analyzeUnconnectedTerminals() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const out = [], tol = CONN_TABLE_TOL, bk = v => Math.round(v / tol);
  state.pages.forEach((pg, pi) => {
    const els = pg.elements || [], wires = pg.wires || [];
    const pname = pg.name || ('Sheet' + (pi + 1));
    const layerOf = new Map(els.map(e => [e.id, e.layer]));
    const idx = new Map();
    wires.forEach(w => {
      const pts = w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
      [pts[0], pts[pts.length - 1]].forEach(p => {
        const k = `${bk(p.x)},${bk(p.y)}`;
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(p);
      });
    });
    const hasEnd = (x, y) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const b = idx.get(`${bk(x) + dx},${bk(y) + dy}`);
        if (b && b.some(p => Math.hypot(p.x - x, p.y - y) <= tol)) return true;
      }
      return false;
    };
    const mine = [];
    const allPts = collectTerminalPoints(els);
    const onTB = new Set(connSymOnTB(allPts, tol).map(o => o.sym));   // 端子台の○にじかに付いた端子はつながっている(2026-10-06)
    allPts.forEach(t => {
      if (t.kind !== 'symbol' || onTB.has(t)) return;
      const lay = (typeof LAYERS !== 'undefined') ? LAYERS.find(l => l.name === layerOf.get(t.elId)) : null;
      if (lay && !lay.visible) return;
      if (!hasEnd(t.x, t.y)) mine.push({ pageIdx: pi, page: pname, elId: t.elId, termIdx: t.termIdx, x: t.x, y: t.y, name: t.dispName || '-', term: t.dispTerm || '-' });
    });
    mine.sort((a, b) => (a.name + ' ' + a.term).localeCompare(b.name + ' ' + b.term, 'ja', { numeric: true }));
    out.push(...mine);
  });
  return out;
}

// 重さ: 2=問題(浮いている端・未採番) / 1=警告(●の無いT字) / 0=なし
function _connSeverity(n) {
  if (!n.wireNo || n.dangling.length) return 2;
  if (n.tees.length) return 1;
  return 0;
}
function _connTermTxt(t) { return `${t.name}:${t.term}`; }
// 端子の一覧(画面・CSV共通)。同じ名前の端子が複数あれば「×2」とまとめる(例: 1つのデバイスが2つの記号に分かれていて、どちらも T1)
function _connTermList(n) {
  const cnt = new Map();
  n.terms.forEach(t => cnt.set(_connTermTxt(t), (cnt.get(_connTermTxt(t)) || 0) + 1));
  return [...cnt.entries()].map(([txt, c]) => c > 1 ? `${txt}×${c}` : txt);
}

// 並べ替えモード: 'wire'=線番順(既定) / 'part'=部品順(そのネットの最初の端子のデバイス名)
let _connSortMode = 'wire';

function setConnSort(mode) {
  _connSortMode = (mode === 'part') ? 'part' : 'wire';
  showConnTable();
}

function _connSortNets(nets) {
  const nameOf = n => n.terms.length ? n.terms[0].name : '￿';
  nets.sort((a, b) => {
    // 問題のあるネットを先頭へ(図面を見ても気づきにくいものから見せる)
    const d = _connSeverity(b) - _connSeverity(a);
    if (d) return d;
    if (_connSortMode === 'part') {
      const c = nameOf(a).localeCompare(nameOf(b), 'ja', { numeric: true });
      if (c) return c;
    }
    return String(a.wireNo || '￿').localeCompare(String(b.wireNo || '￿'), 'ja', { numeric: true })
      || a.pageIdx - b.pageIdx;
  });
  return nets;
}

// 状態の文字(画面のセルとCSVで同じ内容にする)
function _connProblems(n) {
  const out = [];
  if (!n.wireNo) out.push({ txt: '未採番' });
  n.dangling.forEach(d => out.push({ txt: `浮いている端 (${Math.round(d.x)}, ${Math.round(d.y)})`
    + (d.near ? `：最寄りの端子 ${_connTermTxt(d.near)} まで ${d.near.d}` : '：近くに端子はありません'), at: d }));
  n.tees.forEach(t => out.push({ txt: `T字に●がありません (${Math.round(t.x)}, ${Math.round(t.y)})(つながっていない扱い)`, at: t, warn: true }));
  return out;
}

function showConnTable() {
  const nets = _connSortNets(analyzeConnections());
  if (!nets.length) {
    _reportOpen('conntbl', '接続チェック', '<p style="font-size:11px;color:var(--fg3)">配線がありません</p>', null);
    return;
  }
  let nDang = 0, nTee = 0, nNoNo = 0, nBad = 0, nWires = 0;
  let body = '';
  nets.forEach(n => {
    const sev = _connSeverity(n);
    nDang += n.dangling.length; nTee += n.tees.length; nWires += n.idxs.length;
    if (!n.wireNo) nNoNo++;
    if (sev === 2) nBad++;
    const first = n.dangling[0] || n.tees[0];
    const focus = first ? `,{x:${first.x},y:${first.y}}` : '';
    const probs = _connProblems(n).map(p => p.at
      ? `<div style="color:${p.warn ? 'var(--org,#c77b00)' : 'var(--red)'};font-size:11px;cursor:pointer;text-decoration:underline dotted" title="クリックで図面のその場所へ飛ぶ"`
        + ` onclick="event.stopPropagation();jumpToNet(${n.pageIdx},[${p.at.wireIdx}],{x:${p.at.x},y:${p.at.y}})">⚠ ${escH(p.txt)}</div>`
      : `<div style="color:var(--red);font-size:11px">⚠ ${escH(p.txt)}</div>`).join('');
    const termHtml = n.terms.length
      ? _connTermList(n).map(t => `<span class="badge badge-b" style="margin:0 2px 2px 0">${escH(t)}</span>`).join('')
      : '<span style="color:var(--fg3)">(端子に乗っている端が無い)</span>';
    body += `<tr onclick="jumpToNet(${n.pageIdx},[${n.idxs.join(',')}]${focus})" title="クリックで図面のこの配線へ飛ぶ"`
      + ` style="cursor:pointer${sev === 2 ? ';background:rgba(200,60,60,.10)' : sev === 1 ? ';background:rgba(200,140,0,.10)' : ''}">`
      + `<td>${n.wireNo ? `<span class="badge badge-b">${escH(n.wireNo)}</span>` : '<span style="color:var(--red)">未採番</span>'}</td>`
      + `<td>${escH(n.page)}</td><td>${n.idxs.length}</td><td>${termHtml}</td>`
      + `<td>${probs || '<span style="color:var(--fg3)">問題なし</span>'}</td></tr>`;
  });

  const btn = (mode, label) =>
    `<button class="fp-btn" style="font-size:10px;padding:1px 8px;${_connSortMode === mode ? 'font-weight:700' : ''}"`
    + ` onclick="setConnSort('${mode}')">${label}</button>`;
  const unc = analyzeUnconnectedTerminals();
  const arr = (typeof analyzeArrowIssues === 'function') ? analyzeArrowIssues() : [];
  let msg = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    + `全${state.pages.length}ページ集計。ネット ${nets.length}件(配線 ${nWires}本)`;
  if (unc.length) msg += ` / <span style="color:var(--red);font-weight:600">未接続の端子 ${unc.length}か所</span>`;
  if (arr.length) msg += ` / <span style="color:var(--red);font-weight:600">ページ跨ぎの矢印の問題 ${arr.length}件</span>`;
  if (nDang)  msg += ` / <span style="color:var(--red);font-weight:600">浮いている端 ${nDang}か所</span>`;
  if (nNoNo)  msg += ` / <span style="color:var(--red);font-weight:600">未採番 ${nNoNo}件</span>`;
  if (nTee)   msg += ` / <span style="font-weight:600">●の無いT字 ${nTee}か所</span>`;
  if (!nBad && !nTee && !unc.length && !arr.length) msg += ` / 問題なし`;
  msg += `<br>並べ替え: ${btn('wire', '線番順')} ${btn('part', '部品順')}`;
  msg += `<br>1行=つながっている配線のまとまり(ネット)。分岐点(●)でつながった先の端子も、同じ行に並びます。`
    + `問題は端ごとに出します: <b>浮いている端</b>=端が端子にも他の配線にも●にも触れていないもの(許容誤差${CONN_TABLE_TOL})。`
    + `目視では繋がって見えても座標がズレている場合があります(DXFインポート後に起きやすい)。最寄りの端子と距離を添えています。`;
  msg += `<br>行(と赤い⚠)を押すと、この一覧を閉じて図面のその場所へ移動します。`;
  msg += `</p>`;

  // 未接続の端子(配線の端が1本も来ていない端子)。行を押すとその端子へ飛ぶ
  const uncHtml = unc.length
    ? `<p style="font-size:11px;font-weight:600;margin:12px 0 3px">未接続の端子<span style="color:var(--fg3);font-weight:400">（${unc.length}か所。シンボルの端子に配線の端が来ていないもの。行を押すとその端子へ飛びます。ツールバーの「⚠未接続」で図面にマーカーも出せます）</span></p>`
      + `<table class="tbl"><tr><th>端子</th><th>ページ</th></tr>`
      + unc.map(u => `<tr onclick="jumpToRefEl(${u.pageIdx},${_jsArg(u.elId)},{x:${u.x},y:${u.y}})" title="クリックで図面のこの端子へ飛ぶ" style="cursor:pointer;background:rgba(200,60,60,.10)">`
        + `<td><span class="badge badge-b">${escH(_connTermTxt(u))}</span></td><td>${escH(u.page)}</td></tr>`).join('') + `</table>`
    : '';
  // ページ跨ぎの矢印(送り・受け)の問題。行を押すとその矢印へ飛ぶ。別ファイルの相手は左パネルの「プロジェクト」でフォルダを開いて「更新」すると見つかる
  const noProj = !(typeof xprojState !== 'undefined' && xprojState.files.length);
  const arrHtml = arr.length
    ? `<p style="font-size:11px;font-weight:600;margin:12px 0 3px">ページ跨ぎの矢印の問題<span style="color:var(--fg3);font-weight:400">（${arr.length}件。行を押すとその矢印へ飛びます。${noProj ? '相手が別ファイルにあるときは、左パネルの「プロジェクト」でフォルダを開き、表示タブの「更新」を押すと見つかります' : ''}）</span></p>`
      + `<table class="tbl"><tr><th>問題</th><th>ページ</th></tr>`
      + arr.map(a => `<tr onclick="jumpToRefEl(${a.pageIdx},${_jsArg(a.elId)},{x:${a.x},y:${a.y}})" title="クリックで図面のこの矢印へ飛ぶ" style="cursor:pointer;background:rgba(200,60,60,.10)">`
        + `<td>⚠ ${escH(a.txt)}</td><td>${escH(a.page)}</td></tr>`).join('') + `</table>`
    : '';
  const html = msg + `<table class="tbl"><tr><th>線番</th><th>ページ</th><th>配線</th><th>接続している端子</th><th>状態</th></tr>${body}</table>` + uncHtml + arrHtml;
  _reportOpen('conntbl', '接続チェック', html, exportConnCSV);
}

function exportConnCSV() {
  const nets = _connSortNets(analyzeConnections());
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csvRows = ['線番,ページ,配線本数,接続している端子,状態'];
  nets.forEach(n => {
    csvRows.push([n.wireNo || '', n.page, n.idxs.length, _connTermList(n).join(' / '),
                  _connProblems(n).map(p => p.txt).join(' / ')].map(esc).join(','));
  });
  // 未接続の端子も、画面と同じく同じ表の末尾に足す(配線本数0・状態=未接続の端子)
  analyzeUnconnectedTerminals().forEach(u => {
    csvRows.push(['', u.page, 0, _connTermTxt(u), '未接続の端子(配線の端が来ていない)'].map(esc).join(','));
  });
  ((typeof analyzeArrowIssues === 'function') ? analyzeArrowIssues() : []).forEach(a => {
    csvRows.push(['', a.page, 0, '', a.txt].map(esc).join(','));
  });
  dl(csvRows.join('\n'), _csvName('接続チェック'), 'text/csv');
}

// ----------------------------------------------------------------
// 端子台表
//
// 【2026-08-22 一本化】もともと「端子台一覧」(report.js の showTerminals)と
// この「端子台表」がどちらも○/◎の端子を集計しており完全に重複していた。
// 盛田さんの「端子台、端子表、端子台表とわけがわからん」「不要なものは
// なくせ」との指摘を受け、接続線番と未接続チェックを持つこちらに一本化した。
//
// 並び順は el.tbOrder(この表で並べ替えた結果)に従う。図面上の位置からは
// 並び順を決められない(ページを跨ぐ・同じページでも書いた位置で先頭が
// 変わる)ため、この表を並び順の正とする。収集とグループ化は report.js の
// collectTerminals() / groupTerminalsByDevice() を共用する。
// ----------------------------------------------------------------

// 線が端子台の端子(○◎)の円の中を通っているか(端が乗っているだけ=円周で止めた線は含まない)。線番表(groupWiresByNet)と同じ判定
function _wireThroughCircle(pts, t) {
  const r = t.r || 5;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, ((t.x - a.x) * dx + (t.y - a.y) * dy) / L)) : 0;
    if (Math.hypot(a.x + u * dx - t.x, a.y + u * dy - t.y) < r - 1e-6) return true;
  }
  return false;
}

// 端子に繋がっている線番を集める
// netNo: 配線ごとのネットの線番(省略時は netWireNoOf)。プロジェクト台帳(js/proj_index.js)は別ファイルを読むとき自分で数えて渡す
// hit: 配列を渡すと、つながっている配線の番号(ページの wires の添字)も入れる(台帳が矢印の相手の線番を借りるため。2026-10-08)
function _tbConnsOf(el, pg, netNo, hit) {
  const conns = new Set();
  // 【2026-09-25】線番は1ネット1か所なので、ネットの番号を出す(report.js netWireNoOf)
  netNo = netNo || netWireNoOf(pg);
  // 【2026-10-01】線番表(groupWiresByNet)と同じ判定にした: 線の端が「半径+許容誤差」以内で、**一番近い端子**がこの端子のとき。
  // 以前は「中心から5以内」で、端子の円を5より大きくすると円周で止めた線を拾えず、線番表とも食い違っていた
  const terms = (pg.elements || []).filter(e => e.type === 'junction' && (e.style === 'circle' || e.style === 'dbl'));
  (pg.wires || []).forEach((w, wi) => {
    const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
    [pts[0], pts[pts.length-1]].forEach(p => {
      let best = null, bestD = Infinity;
      terms.forEach(t => {
        const d = Math.hypot(p.x - t.x, p.y - t.y);
        if (d <= (t.r || 5) + CONN_TABLE_TOL && d < bestD) { bestD = d; best = t; }
      });
      if (best === el) { conns.add(netNo[wi] || '未採番'); if (hit) hit.push(wi); }
    });
    // 【2026-10-02】端子の円の中を通っている線(端子の上をまっすぐ通して描いた線)もつながっているとみなす
    if (_wireThroughCircle(pts, el)) { conns.add(netNo[wi] || '未採番'); if (hit) hit.push(wi); }
  });
  return [...conns];
}

// 【2026-10-08 プロジェクト台帳の作る順の3】プロジェクトの別ファイルの端子も集計する(部品表と同じ。台帳があれば台帳 js/proj_index.js projWith、
// 無ければ参照図面の読み込み xprojWith)。別ファイルの行(ext)は読むだけ(並べ替え・飛ぶ・振り直しの書き込みは開いているファイルの端子だけ)。
// 開いている図面の線番(矢印の相手の番号を借りる netWireNoOf)は、別ファイルを足す前に数える(足したあとに数えると参照図面の矢印が二重になる)。
function buildTerminalBlockRows() {
  const run = () => {
    if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
    const own = new Map((state.pages || []).map(pg => [pg, netWireNoOf(pg)]));
    const wrap = (typeof projWith === 'function') ? projWith : (typeof xprojWith === 'function') ? xprojWith : (f => f());
    return wrap(() => _buildTerminalBlockRows(own));
  };
  return (typeof sigMemoRun === 'function') ? sigMemoRun(run) : run();
}
function _buildTerminalBlockRows(own) {
  if (!own && typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const all = collectTerminals();
  // 線番: 開いている図面は own(＋台帳の矢印の相手)、台帳の端子は台帳の線番(＋矢印の相手)、参照図面の端子はそのページで数える
  const borrow = (typeof pidxArrowBorrow === 'function') ? pidxArrowBorrow() : null;
  const netNos = new Map();
  const connsOf = r => {
    const pg = state.pages[r.page] || {};
    if (r.el._pidxTerm) return (typeof pidxTermConns === 'function') ? pidxTermConns(r.el._pidxTerm, borrow) : r.el._pidxTerm.conns.slice();
    if (!own || !own.has(pg)) return _tbConnsOf(r.el, pg);
    if (!netNos.has(pg)) netNos.set(pg, (typeof pidxFillNetNo === 'function') ? pidxFillNetNo(pg, r.page, own.get(pg), borrow) : own.get(pg));
    return _tbConnsOf(r.el, pg, netNos.get(pg));
  };
  const names = tbDeviceNames(all);   // 綴りが違っても同じデバイスなら1つの台にする(部品表・接点Refと同じ判定)
  // 型式はデバイスの値(台帳 js/devices.js)。デバイスの無い端子は端子自身の値
  const led = (typeof deviceLedger === 'function') ? deviceLedger() : null;
  const devOf = el => (led && typeof devKey === 'function') ? led.get(devKey(el.partRef)) : null;
  return all.map(r => ({
    el:      r.el,
    page:    state.pages[r.page]?.name || ('Sheet' + (r.page + 1)),
    pageIdx: r.page,
    ext:     !!(state.pages[r.page] && state.pages[r.page]._file),   // 別ファイルの端子(読むだけ)
    file:    (state.pages[r.page] && state.pages[r.page]._file) || '',
    loc:     r.loc,
    tbRef:   names.get(_tbKey(r.el.partRef)),
    tbModel: (() => { const D = devOf(r.el); return D ? (D.vals.partModel || '') : (r.el.partModel || ''); })(),
    tbDev:   devOf(r.el),
    termNo:  r.el.label || '-',
    conns:   connsOf(r),
  }));
}

// ================================================================
// 図面への挿入: 端子台の並びに沿った簡易配置図
// ----------------------------------------------------------------
// 盛田さんの要望: 「メーカーの正式な配線図(上段/下段・型式併記)ほど作り込まなくて
// いい。四角で囲って左に番号、右に線番を並べるだけの縦配置。残り(メーカー名・
// 型式・設置場所の区切り等)は手書きで足す」というもの。
// 並び順はtbOrder(端子台表で並べ替えた結果)に従い、線番は接続チェックと同じ
// 座標近接判定(buildTerminalBlockRows経由)で自動的に埋める。
// 生成するのはrect/text要素そのもの(type='rect'/'text')なので、他の作図要素と
// 同じくDXF/PDF出力にそのまま乗る。BOM集計(collectBOMRows)はrect/textを
// スキップリストで除外済みなので、この図が部品として二重計上されることはない。
// ================================================================

function insertTerminalBlockDiagram(dev) {
  const rows = buildTerminalBlockRows().filter(r => r.tbRef === dev);
  if (!rows.length) return;
  // 集計対象外の台では描かない。ここで描くと「端子台の配置図」として
  // PLC等の配置が図面に入ってしまう。見出しのボタン自体も出していないが、
  // 関数はグローバルなので入口でも止める。
  if (rows.some(r => isTBExcluded(r.el))) {
    alert(`${dev} は端子台として集計しない設定になっています。\n`
      + '端子台表の見出しで「端子台として集計」を入れてから実行してください。');
    return;
  }
  if (typeof pushH === 'function') pushH();

  // サイズは「図面上の実寸(mm)」を基準に決める。world単位はmm×sc(図枠の拡大率)
  // なので、sc倍しておけば紙面上の見た目の大きさが図枠のスケールによらず一定になる。
  // 目標は1端子=5mm。既定のA3横(297×210・余白10・表題欄30)なら作図領域の高さは
  // 約160mmなので、5mm/行で32行入る(盛田さんの「30〜40行入れたい」に収まる数)。
  // 図枠が無いページ(表紙等)ではsc=2を仮定する。
  const fr = state.page && state.page.frameObj;
  const sc = (fr && fr.sc) || 2;
  const G  = state.G || 10;
  // グリッドに乗るよう、実寸目標値をG単位に丸める(盛田さんの「箱の線をグリッドに
  // のるようにできるか」への対応)。既定値(sc2)ではもともと5mm=G相当で丸め不要だが、
  // scや将来グリッド幅が変わっても必ずグリッド上に乗るようにしておく。
  const snapG = v => Math.round(v / G) * G;
  const mmPerRow = 5;
  const boxW = Math.max(G, snapG(20 * sc));       // 端子1個分の箱の幅(20mm相当)
  const boxH = Math.max(G, snapG(mmPerRow * sc)); // 端子1個分の箱の高さ(5mm相当)
  const capH = boxH;           // キャプション(デバイス名)の行の高さ
  // 番号列は狭く、線番列は広く(番号は1〜2桁が多いが、線番は「ESP12」等5文字級も
  // あるため)。目安は番号列25%・線番列75%(≒1:3)。グリッドに乗せつつ、
  // 極端な図枠サイズでも線番側が番号側より狭くならないようガードする。
  let colX = Math.max(G, snapG(boxW * 0.25));
  if (colX >= boxW - G) colX = Math.max(G, snapG(boxW * 0.5));  // 保険(狭すぎる図枠向け)
  const fs = 2.5 * sc;         // 文字サイズ(2.5mm相当。箱の高さの半分程度)

  // 挿入位置は現在の画面中心(ワールド座標)。以後はドラッグで動かせる。
  // グリッドに乗せるため、中心座標そのものもG単位に丸める。
  const cv = document.getElementById('cv');
  const x0 = snapG((cv.width  / 2 - state.pan.x) / state.zoom);
  const y0 = snapG((cv.height / 2 - state.pan.y) / state.zoom);

  const layer = activeLayer();
  const els = [];
  const totalH = boxH * rows.length;
  const top = y0 + capH;

  els.push({ id: genId('el'), type:'text', x:x0, y:y0, text: String(dev), fs:fs*1.3, layer });

  // 外枠(端子台全体の1つの箱)
  els.push({ id: genId('el'), type:'rect', x:x0, y:top, w:boxW, h:totalH, layer });
  // 行の区切り(横線。端子と端子の間)
  for (let i = 1; i < rows.length; i++) {
    const y = top + i * boxH;
    els.push({ id: genId('el'), type:'fline', x1:x0, y1:y, x2:x0+boxW, y2:y, layer });
  }
  // 番号列と線番列の区切り(縦線。全高を貫通させる)
  els.push({ id: genId('el'), type:'fline', x1:x0+colX, y1:top, x2:x0+colX, y2:top+totalH, layer });

  rows.forEach((r, i) => {
    const y = top + i * boxH;
    // type='text'はdrawTextEl()でtextBaseline='alphabetic'固定(el.yはベースライン=
    // 文字の下端で、中心ではない)。番号・線番はどちらも数字/英大文字で下に
    // はみ出す部分(g,p,y等のディセンダ)が無いため、字高のだいたい半分(0.35em
    // 相当)だけベースラインを下げれば見た目の中心が行の中心に乗る。
    const ty = y + boxH/2 + fs*0.35;
    els.push({ id: genId('el'), type:'text', x:x0 + boxW*0.08,        y:ty, text: r.termNo || '-', fs, layer });
    els.push({ id: genId('el'), type:'text', x:x0 + colX + boxW*0.08, y:ty, text: r.conns.length ? r.conns.join('/') : '', fs, layer });
  });

  state.elements.push(...els);
  if (typeof draw === 'function') draw();
}

function showTBTable() {
  const rows = buildTerminalBlockRows();
  if (!rows.length) {
    _reportOpen('tbtbl', '端子台表',
      '<p style="font-size:11px;color:var(--fg3)">端子台の端子がありません。'
      + '<br>接続点を「○白丸」または「◎二重丸」にすると端子台の端子として扱われます。</p>', null);
    return;
  }
  // デバイスごとにまとめる(並び順は collectTerminals の順=tbOrder順を保つ)
  const groups = new Map();
  rows.forEach(r => {
    if (!groups.has(r.tbRef)) groups.set(r.tbRef, []);
    groups.get(r.tbRef).push(r);
  });

  // 【2026-09-21】集計する台としない台に分ける。表には両方出す。
  // 部品DBの種別で自動除外していたのをやめ、デバイス単位で人が決める形にした
  // (経緯は js/report.js の isTBExcluded 付近のコメントを参照)。
  // 対象外の台も「消さずに出して、集計から外れていることを見せる」——
  // 部品表(showBOM)が対象外の部品を別セクションで出しているのと同じ作法。
  const isExDev = list => list.some(r => isTBExcluded(r.el));
  const incGroups = new Map(), exGroups = new Map();
  groups.forEach((list, dev) => (isExDev(list) ? exGroups : incGroups).set(dev, list));

  const incRows = [...incGroups.values()].flat();
  const exRows  = [...exGroups.values()].flat();
  const unconn  = incRows.filter(r => !r.conns.length).length;
  // 【2026-10-08】プロジェクトの別ファイルの端子も集計する(部品表と同じ書き方)
  const extN = (typeof projExtPageCount === 'function') ? projExtPageCount() : 0;
  const extRows = rows.filter(r => r.ext).length;
  let html = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    + (extN ? `このファイル${state.pages.length}ページ＋プロジェクトの別ファイル${extN}ページを集計` : `このファイル${state.pages.length}ページを集計`)
    + `。端子${incRows.length}点 / 端子台${incGroups.size}台`;
  if (unconn) html += ` / <span style="color:var(--red);font-weight:600">未接続 ${unconn}点</span>`;
  // 外した分は必ず数字で見せる。黙って減っていると出力を誤解するため(部品表と同じ)。
  if (exRows.length) html += ` / <span style="color:var(--fg3)">集計対象外 ${exGroups.size}台・${exRows.length}点（CSVにも出ません）</span>`;
  html += `<br>行を押すと、この一覧を閉じて図面のその端子へ移動します。行をドラッグすると並べ替えできます。並べ替えた順で「番号を振り直す」と端子番号が1から振り直されます。`
    + `<br>PLC・インバータ等の「端子台ではない」台は、見出しの「端子台として集計」を外してください（台ごとに1回で、図面に残ります）。`
    + (extRows ? `<br>灰色の行は別ファイルの端子です（並べ替え・「端子台として集計」は開いているファイルの端子にだけ効きます。番号の振り直しは、別ファイルの端子にも書き換える一覧を見せてから書きます）。` : '')
    + `</p>`;

  const devSection = (list, dev) => {
    // 型式は同じデバイスの端子すべてで揃う運用(プロパティ側で統一)なので、
    // 全行に同じ文字を並べず台の見出しに1回だけ出す。揃っていない場合だけ
    // 警告を出して気付けるようにする(古い図面や手作業で崩れたとき用)。
    // 【2026-09-30 デバイス台帳④】型式・食い違いは台帳から(デバイスの値)。食い違いは押すと選ぶ画面を開く
    const D = list[0] && list[0].tbDev;
    const conflicts = D ? D.conflicts.map(c => (DEV_FIELDS.find(f => f.key === c.field) || { name: c.field }).name) : [];
    const models = D ? [D.vals.partModel].filter(Boolean) : [...new Set(list.map(r => r.tbModel).filter(Boolean))];
    const modelTxt = (conflicts.length
        ? `<span style="color:var(--red);font-weight:400;cursor:pointer;text-decoration:underline dotted" title="クリックで、食い違いを選ぶ画面を開く" onclick="devResolveDialog(null,{undo:true,onDone:()=>showTBTable()})"> ⚠ 値が食い違っています（${escH(conflicts.join('・'))}）</span>`
        : '')
      + (models.length === 1
        ? `<span style="color:var(--fg3);font-weight:400"> ${escH(models[0])}</span>`
        : models.length > 1
          ? `<span style="color:var(--red);font-weight:400"> 型式が揃っていません（${escH(models.join(' / '))}）</span>`
          : (conflicts.includes('型番') ? '' : `<span style="color:var(--fg4);font-weight:400"> 型式未設定</span>`));
    html += `<p style="font-size:11px;font-weight:600;margin:8px 0 3px">${escH(dev)}`
      + `<span style="color:var(--fg3);font-weight:400">（${list.length}点）</span>`
      + modelTxt
      + tbDevToggle(dev, !isExDev(list))
      // 「番号を振り直す」「図を挿入」は端子台のための操作なので、集計対象の台にだけ出す。
      // 対象外の台で図を挿入すると、PLCの配置図が端子台として描けてしまう。
      + (isExDev(list) ? '' :
          `<button class="fp-btn" style="margin-left:4px;font-size:10px;padding:1px 8px"`
        + ` onclick="renumberTerminals(${_jsArg(dev)})">この順で番号を振り直す</button>`
        + `<button class="fp-btn" style="margin-left:4px;font-size:10px;padding:1px 8px"`
        + ` onclick="insertTerminalBlockDiagram(${_jsArg(dev)})"`
        + ` title="番号・線番を並べた簡易図を画面中央に挿入します(手書きで仕上げてください)">この配置で図を挿入</button>`)
      + `</p>`
      + `<table class="tbl"><tr><th style="width:22px"></th><th>No</th><th>端子番号</th>`
      + `<th>位置</th><th>接続線番</th></tr>`
      + list.map((r, i) => r.ext
        ? `<tr style="color:var(--fg3)" title="別ファイル（${escH(r.file)}）の端子。読むだけです">`
          + `<td></td><td>${i + 1}</td><td>${escH(r.termNo)}</td><td>${escH(r.loc)}</td>`
          + `<td>${r.conns.length
              ? r.conns.map(n => `<span class="badge badge-b" style="opacity:.6">${escH(n)}</span>`).join(' ')
              : '<span style="color:var(--red)">未接続</span>'}</td></tr>`
        : `<tr draggable="true" data-elid="${escH(r.el.id)}"`
          + ` ondragstart="tbDragStart(event,${_jsArg(r.el.id)})" ondragover="tbDragOver(event)"`
          + ` ondrop="tbDrop(event,${_jsArg(r.el.id)})" ondragend="tbDragEnd(event)"`
          // 【2026-09-29】行を押すと、図面のその端子へ飛ぶ(ドラッグの並べ替えは従来どおり。ドラッグしたときは押した扱いにならない)
          + ` onclick="jumpToRefEl(${r.pageIdx},${_jsArg(r.el.id)})" title="クリックで図面のこの端子へ飛ぶ。ドラッグで並べ替え" style="cursor:grab">`
          + `<td style="color:var(--fg4);text-align:center">⋮⋮</td>`
          + `<td>${i + 1}</td><td>${escH(r.termNo)}</td><td>${escH(r.loc)}</td>`
          + `<td>${r.conns.length
              ? r.conns.map(n => `<span class="badge badge-b">${escH(n)}</span>`).join(' ')
              : '<span style="color:var(--red)">未接続</span>'}</td></tr>`).join('')
      + `</table>`;
  };

  incGroups.forEach((list, dev) => devSection(list, dev));
  if (exGroups.size) {
    html += `<p style="font-size:11px;font-weight:600;margin:14px 0 3px;padding-top:8px;`
      + `border-top:1px solid var(--bd2);color:var(--fg3)">集計対象外`
      + `<span style="font-weight:400">（端子台表の集計・CSV・「図を挿入」の対象外です。`
      + `表には残してあるので、戻したいときは各台の「端子台として集計」を入れてください）</span></p>`;
    exGroups.forEach((list, dev) => devSection(list, dev));
  }
  _reportOpen('tbtbl', '端子台表', html, exportTBCSV);
}

// 端子台表を開く(リボン・帳票のタブ): 今の台帳ですぐ出し、台帳を最新にしたら出し直す(部品表の openBOM と同じ。2026-10-08)。
// 並べ替え・振り直しなどのあとの出し直しは showTBTable(読み直さない)
async function openTBTable() {
  showTBTable();
  if (typeof pidxRefresh !== 'function') return;
  let reloaded = false;
  try { reloaded = await pidxRefresh(); } catch (e) { console.warn('プロジェクト台帳の更新に失敗', e); }
  if (reloaded && document.getElementById('report-p')?.classList.contains('open') && _lastReportTab === 'tbtbl') showTBTable();
}

// _jsArg(onclick等の属性に文字列を安全に渡す)は report.js にある(部品表・線番表・接点Refでも使うため、そちらに置いた)。

// デバイス見出しの「端子台として集計」切り替え。
// 押すとその台の端子すべてに印が付き(setTBExcluded)、表が描き直される。
// 帳票を閉じて図面に戻る必要は無い。
function tbDevToggle(dev, included) {
  return `<label style="margin-left:8px;font-size:10px;font-weight:400;cursor:pointer;color:var(--fg3)" `
    + `title="この台を端子台として集計するかどうか。同じデバイスの端子すべてに効き、図面に保存されます">`
    + `<input type="checkbox"${included ? ' checked' : ''} `
    + `onchange="setTBExcluded(${_jsArg(dev)}, !this.checked)" style="vertical-align:-1px;margin-right:3px">`
    + `端子台として集計</label>`;
}

function exportTBCSV() {
  // 画面の集計対象外をCSVにも必ず適用する。画面と出力が食い違うと
  // 出力を信用できなくなるため(部品表 exportBOMCSV と同じ考え方)。
  const rows = buildTerminalBlockRows().filter(r => !isTBExcluded(r.el));
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = ['端子台,No,端子番号,型式,位置,接続線番'];
  const seen = {};
  rows.forEach(r => {
    seen[r.tbRef] = (seen[r.tbRef] || 0) + 1;
    csv.push([r.tbRef, seen[r.tbRef], r.termNo, r.tbModel, r.loc, r.conns.join('/')].map(esc).join(','));
  });
  dl(csv.join('\n'), _csvName('端子台表'), 'text/csv');
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
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['conn_table.js'] = 1;
