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

const CONN_TABLE_TOL = 5; // 許容誤差(ワールド座標単位)。conn_check.jsのCONN_CHECK_TOLと同じ値
const CONN_TABLE_SYM_ONLY_TYPES = ['text','rect','circle','fline','triangle','arc','junction','bezier','dim','angle_dim','leader'];

// ページ内の全「端子点」(シンボルの端子＋端子台の端子/分岐点)を集めた配列を返す
// 戻り値: [{ x, y, elId, termIdx, kind:'symbol'|'junction', dispName, dispTerm, isBranch }]
function collectTerminalPoints(pageElements) {
  const pts = [];

  (pageElements || []).forEach(el => {
    if (el.type === 'junction') {
      const isTerm = (el.style === 'circle' || el.style === 'dbl'); // 白丸/二重丸のみ端子台の端子
      pts.push({
        x: el.x, y: el.y, elId: el.id, termIdx: 0, kind: 'junction',
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
    const dispName = el.partRef || el.label || el.type;

    if (cS && cS.terminals && cS.terminals.length) {
      cS.terminals.forEach((t, i) => {
        const rx = t.x * Math.cos(rot) - t.y * Math.sin(rot);
        const ry = t.x * Math.sin(rot) + t.y * Math.cos(rot);
        pts.push({ x: el.x+rx, y: el.y+ry, elId: el.id, termIdx: i, kind:'symbol', dispName, dispTerm: termList[i] || `T${i+1}` });
      });
    } else {
      const d  = getDef(el.type) || {};
      const sc = el.scale || 1;
      const hw = (d.w || 0) / 2 * sc;
      [+hw, -hw].forEach((dx, i) => {
        const rx = dx * Math.cos(rot), ry = dx * Math.sin(rot);
        pts.push({ x: el.x+rx, y: el.y+ry, elId: el.id, termIdx: i, kind:'symbol', dispName, dispTerm: termList[i] || `T${i+1}` });
      });
    }
  });

  return pts;
}

// 許容誤差内で最も近い端子点を探す(ページ単位・端子点数は通常数百程度のため線形探索で十分)
function findNearestTerminal(x, y, termPts, tol) {
  let best = null, bestD = tol;
  termPts.forEach(p => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) { bestD = d; best = p; }
  });
  return best;
}

// 全ページを走査し、配線ごとの接続情報を集計する
// 戻り値: [{ page, wireNo, layer, from, to }]  from/to は端子点情報 or null(未特定)
function buildConnectionRows() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const rows = [];
  state.pages.forEach((pg, pi) => {
    const pname = pg.name || ('Sheet'+(pi+1));
    const termPts = collectTerminalPoints(pg.elements || []);
    (pg.wires || []).forEach(w => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      const p0 = pts[0], p1 = pts[pts.length-1];
      const from = findNearestTerminal(p0.x, p0.y, termPts, CONN_TABLE_TOL);
      const to   = findNearestTerminal(p1.x, p1.y, termPts, CONN_TABLE_TOL);
      rows.push({ page: pname, wireNo: w.wireNo || '', layer: w.layer || '', from, to });
    });
  });
  return rows;
}

function _connFmtEnd(t) {
  if (!t) return { name:'-', term:'-' };
  if (t.kind === 'junction' && t.isBranch) return { name:'分岐点', term:'-' };
  return { name: t.dispName || '-', term: t.dispTerm || '-' };
}

function _connSortRows(rows) {
  rows.sort((a,b) => String(a.wireNo||'\uffff').localeCompare(String(b.wireNo||'\uffff'),'ja',{numeric:true}));
  return rows;
}

// ----------------------------------------------------------------
// 接続表(配線ごと: 線番・始点・始点端子・終点・終点端子)
// ----------------------------------------------------------------
function showConnTable() {
  const rows = _connSortRows(buildConnectionRows());
  if (!rows.length) {
    _reportOpen('conntbl', '接続表', '<p style="font-size:11px;color:var(--fg3)">配線がありません</p>', null);
    return;
  }
  let unmatched = 0;
  let html = `<table class="tbl"><tr><th>線番</th><th>ページ</th><th>始点</th><th>始点端子</th><th>終点</th><th>終点端子</th><th>レイヤー</th></tr>`;
  rows.forEach(r => {
    const f = _connFmtEnd(r.from), t = _connFmtEnd(r.to);
    if (!r.from || !r.to) unmatched++;
    html += `<tr><td>${r.wireNo?`<span class="badge badge-b">${r.wireNo}</span>`:'<span style="color:var(--fg3)">未採番</span>'}</td><td>${r.page}</td><td>${f.name}</td><td>${f.term}</td><td>${t.name}</td><td>${t.term}</td><td>${r.layer}</td></tr>`;
  });
  html += '</table>';
  let msg = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">配線 全${rows.length}本`;
  if (unmatched) msg += ` / <span style="color:var(--red);font-weight:600">端子未特定 ${unmatched}本</span>(許容誤差${CONN_TABLE_TOL}以内に端子なし。配線の端点が端子からズレている可能性があります)`;
  msg += `</p>`;
  _reportOpen('conntbl', '接続表', msg + html, exportConnCSV);
}

function exportConnCSV() {
  const rows = _connSortRows(buildConnectionRows());
  const csvRows = ['線番,ページ,始点,始点端子,終点,終点端子,レイヤー'];
  rows.forEach(r => {
    const f = _connFmtEnd(r.from), t = _connFmtEnd(r.to);
    csvRows.push(`${r.wireNo||''},${r.page},${f.name},${f.term},${t.name},${t.term},${r.layer}`);
  });
  dl(csvRows.join('\n'), 'connection_table.csv', 'text/csv');
}

// ----------------------------------------------------------------
// 端子台表: junction(style=circle/dbl、端子台の端子)を対象に、
// 各端子番号にどの線番が繋がっているかを一覧化する(分岐点●は対象外)
// ----------------------------------------------------------------
function buildTerminalBlockRows() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const rows = [];
  state.pages.forEach((pg, pi) => {
    const pname = pg.name || ('Sheet'+(pi+1));
    (pg.elements || []).forEach(el => {
      if (el.type !== 'junction') return;
      if (!(el.style === 'circle' || el.style === 'dbl')) return; // 分岐点は対象外

      const conns = new Set();
      (pg.wires || []).forEach(w => {
        const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
        [pts[0], pts[pts.length-1]].forEach(p => {
          if (Math.hypot(p.x-el.x, p.y-el.y) <= CONN_TABLE_TOL) conns.add(w.wireNo || '未採番');
        });
      });

      rows.push({
        page: pname,
        tbRef: el.partRef || '(項目記号未設定)',
        tbModel: el.partModel || '',
        termNo: el.label || '-',
        conns: [...conns],
      });
    });
  });
  return rows;
}

function _tbSortRows(rows) {
  rows.sort((a,b) => (a.tbRef+'|'+String(a.termNo)).localeCompare(b.tbRef+'|'+String(b.termNo),'ja',{numeric:true}));
  return rows;
}

function showTBTable() {
  const rows = _tbSortRows(buildTerminalBlockRows());
  if (!rows.length) {
    _reportOpen('tbtbl', '端子台表', '<p style="font-size:11px;color:var(--fg3)">端子台の端子(○/◎)が配置されていません</p>', null);
    return;
  }
  let unconn = 0;
  let html = `<table class="tbl"><tr><th>端子台</th><th>型式</th><th>端子番号</th><th>ページ</th><th>接続線番</th></tr>`;
  rows.forEach(r => {
    if (!r.conns.length) unconn++;
    html += `<tr><td>${r.tbRef}</td><td>${r.tbModel||'-'}</td><td>${r.termNo}</td><td>${r.page}</td><td>${r.conns.length?r.conns.map(n=>`<span class="badge badge-b">${n}</span>`).join(' '):'<span style="color:var(--red)">未接続</span>'}</td></tr>`;
  });
  html += '</table>';
  let msg = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">端子 全${rows.length}点`;
  if (unconn) msg += ` / <span style="color:var(--red);font-weight:600">未接続 ${unconn}点</span>`;
  msg += `</p>`;
  _reportOpen('tbtbl', '端子台表', msg + html, exportTBCSV);
}

function exportTBCSV() {
  const rows = _tbSortRows(buildTerminalBlockRows());
  const csv = ['端子台,型式,端子番号,ページ,接続線番'];
  rows.forEach(r => csv.push(`${r.tbRef},${r.tbModel},${r.termNo},${r.page},"${r.conns.join('/')}"`));
  dl(csv.join('\n'), 'terminal_block_table.csv', 'text/csv');
}
