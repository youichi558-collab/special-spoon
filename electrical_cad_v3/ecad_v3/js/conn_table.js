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

// 端子に繋がっている線番を集める
function _tbConnsOf(el, pg) {
  const conns = new Set();
  (pg.wires || []).forEach(w => {
    const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
    [pts[0], pts[pts.length-1]].forEach(p => {
      if (Math.hypot(p.x-el.x, p.y-el.y) <= CONN_TABLE_TOL) conns.add(w.wireNo || '未採番');
    });
  });
  return [...conns];
}

function buildTerminalBlockRows() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  return collectTerminals().map(r => ({
    el:      r.el,
    page:    state.pages[r.page]?.name || ('Sheet' + (r.page + 1)),
    loc:     r.loc,
    tbRef:   r.el.partRef || '(デバイス未設定)',
    tbModel: r.el.partModel || '',
    termNo:  r.el.label || '-',
    conns:   _tbConnsOf(r.el, state.pages[r.page] || {}),
  }));
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

  const unconn = rows.filter(r => !r.conns.length).length;
  let html = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    + `全${state.pages.length}ページ集計。端子${rows.length}点 / 端子台${groups.size}台`;
  if (unconn) html += ` / <span style="color:var(--red);font-weight:600">未接続 ${unconn}点</span>`;
  html += `<br>行をドラッグすると並べ替えできます。並べ替えた順で「番号を振り直す」と端子番号が1から振り直されます。</p>`;

  groups.forEach((list, dev) => {
    // 型式は同じデバイスの端子すべてで揃う運用(プロパティ側で統一)なので、
    // 全行に同じ文字を並べず台の見出しに1回だけ出す。揃っていない場合だけ
    // 警告を出して気付けるようにする(古い図面や手作業で崩れたとき用)。
    const models = [...new Set(list.map(r => r.tbModel).filter(Boolean))];
    const modelTxt = models.length === 1
      ? `<span style="color:var(--fg3);font-weight:400"> ${models[0]}</span>`
      : models.length > 1
        ? `<span style="color:var(--red);font-weight:400"> 型式が揃っていません（${models.join(' / ')}）</span>`
        : `<span style="color:var(--fg4);font-weight:400"> 型式未設定</span>`;
    html += `<p style="font-size:11px;font-weight:600;margin:8px 0 3px">${dev}`
      + `<span style="color:var(--fg3);font-weight:400">（${list.length}点）</span>`
      + modelTxt
      + `<button class="fp-btn" style="margin-left:8px;font-size:10px;padding:1px 8px"`
      + ` onclick="renumberTerminals('${String(dev).replace(/'/g, "\\'")}')">この順で番号を振り直す</button></p>`
      + `<table class="tbl"><tr><th style="width:22px"></th><th>No</th><th>端子番号</th>`
      + `<th>位置</th><th>接続線番</th></tr>`
      + list.map((r, i) =>
          `<tr draggable="true" data-elid="${r.el.id}"`
          + ` ondragstart="tbDragStart(event,'${r.el.id}')" ondragover="tbDragOver(event)"`
          + ` ondrop="tbDrop(event,'${r.el.id}')" ondragend="tbDragEnd(event)" style="cursor:grab">`
          + `<td style="color:var(--fg4);text-align:center">⋮⋮</td>`
          + `<td>${i + 1}</td><td>${r.termNo}</td><td>${r.loc}</td>`
          + `<td>${r.conns.length
              ? r.conns.map(n => `<span class="badge badge-b">${n}</span>`).join(' ')
              : '<span style="color:var(--red)">未接続</span>'}</td></tr>`).join('')
      + `</table>`;
  });
  _reportOpen('tbtbl', '端子台表', html, exportTBCSV);
}

function exportTBCSV() {
  const rows = buildTerminalBlockRows();
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = ['端子台,No,端子番号,型式,位置,接続線番'];
  const seen = {};
  rows.forEach(r => {
    seen[r.tbRef] = (seen[r.tbRef] || 0) + 1;
    csv.push([r.tbRef, seen[r.tbRef], r.termNo, r.tbModel, r.loc, r.conns.join('/')].map(esc).join(','));
  });
  dl(csv.join('\n'), 'terminal_block_table.csv', 'text/csv');
}
