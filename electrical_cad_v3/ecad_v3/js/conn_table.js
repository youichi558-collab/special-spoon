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
// 接続チェック（配線ごと: 線番・始点・始点端子・終点・終点端子）
//
// 【2026-08-22 統合】もともと「端子表」(report.js の showTerminalTable)と
// この表がどちらも配線と端子の対応を出しており、主語が部品か配線かの違い
// しかなかった。端子表は ①現在ページのみ ②端子台の端子(junction)が端子台表と
// 重複 ③接続判定が fromElId 紐づけで他表と別方式 ④「種別」に内部名(coil等)が
// 生で出る、という状態だったため、こちらへ統合した(盛田さんの提案)。
// 部品ごとに見たい用途は並べ替え(部品順)で吸収する。
//
// 【この表の位置づけ】
// 分岐のない1本線の「TB1-1 → MC1-13」は図面を見れば判るので、一覧にする価値は
// 薄い(盛田さん指摘)。価値があるのは図面を見ても気づきにくい方:
//   ・端点が端子から微妙にズレている配線(目視では繋がって見える。DXFインポート後に多い)
//   ・線番が振られていない配線
// よって問題のある行を先頭に集める。
//
// 【原理的にできないこと】
// 分岐点は電気的に1点で、そこに集まる線は全部同電位。「どっちに繋がる線か」
// という問い自体が成立しないため、分岐点経由の接続先は特定できない(0%)。
// ページを跨ぐ接続も座標では追えない。盤製作用の配線リスト(どこにどう渡すか)は
// 裏面接続図の範囲であり、展開接続図から自動で出せるものではない。
// ----------------------------------------------------------------

// 並べ替えモード: 'wire'=線番順(既定) / 'part'=部品順
let _connSortMode = 'wire';

function setConnSort(mode) {
  _connSortMode = (mode === 'part') ? 'part' : 'wire';
  showConnTable();
}

// 行に問題があるか。端子未特定(端点が端子から離れている)か線番未採番。
function _connRowIssue(r) {
  if (!r.from || !r.to) return '端子未特定';
  if (!r.wireNo)        return '未採番';
  return '';
}

function _connSortRows(rows) {
  const nameOf = r => {
    const f = _connFmtEnd(r.from);
    return f.name === '-' ? '\uffff' : f.name;
  };
  rows.sort((a, b) => {
    // 問題のある行を先頭へ(図面を見ても気づきにくいものから見せる)
    const ai = _connRowIssue(a) ? 0 : 1, bi = _connRowIssue(b) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    if (_connSortMode === 'part') {
      const c = nameOf(a).localeCompare(nameOf(b), 'ja', { numeric: true });
      if (c) return c;
    }
    return String(a.wireNo || '\uffff').localeCompare(String(b.wireNo || '\uffff'), 'ja', { numeric: true });
  });
  return rows;
}

function showConnTable() {
  const rows = _connSortRows(buildConnectionRows());
  if (!rows.length) {
    _reportOpen('conntbl', '接続チェック', '<p style="font-size:11px;color:var(--fg3)">配線がありません</p>', null);
    return;
  }
  let unmatched = 0, unnumbered = 0, branch = 0;
  let body = '';
  rows.forEach(r => {
    const f = _connFmtEnd(r.from), t = _connFmtEnd(r.to);
    const issue = _connRowIssue(r);
    if (!r.from || !r.to) unmatched++;
    if (!r.wireNo) unnumbered++;
    if (f.name === '分岐点' || t.name === '分岐点') branch++;
    body += `<tr${issue ? ' style="background:rgba(200,60,60,.10)"' : ''}>`
      + `<td>${r.wireNo ? `<span class="badge badge-b">${r.wireNo}</span>` : '<span style="color:var(--red)">未採番</span>'}</td>`
      + `<td>${r.page}</td><td>${f.name}</td><td>${f.term}</td><td>${t.name}</td><td>${t.term}</td>`
      + `<td>${issue ? `<span style="color:var(--red)">${issue}</span>` : ''}</td><td>${r.layer}</td></tr>`;
  });

  const btn = (mode, label) =>
    `<button class="fp-btn" style="font-size:10px;padding:1px 8px;${_connSortMode === mode ? 'font-weight:700' : ''}"`
    + ` onclick="setConnSort('${mode}')">${label}</button>`;

  let msg = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    + `全${state.pages.length}ページ集計。配線 ${rows.length}本`;
  if (unmatched)  msg += ` / <span style="color:var(--red);font-weight:600">端子未特定 ${unmatched}本</span>`;
  if (unnumbered) msg += ` / <span style="color:var(--red);font-weight:600">未採番 ${unnumbered}本</span>`;
  msg += `<br>並べ替え: ${btn('wire', '線番順')} ${btn('part', '部品順')}`;
  if (unmatched) {
    msg += `<br>「端子未特定」は端点の${CONN_TABLE_TOL}以内に端子が無いもの。`
      + `目視では繋がって見えても座標がズレている可能性があります（DXFインポート後に起きやすい）。`;
  }
  if (branch) {
    msg += `<br><span style="color:var(--fg4)">分岐点を経由する配線が${branch}本あります。`
      + `分岐点は電気的に1点で、そこに集まる線は全部同電位のため、その先どの端子に繋がるかは`
      + `この表では特定できません（不具合ではありません）。</span>`;
  }
  msg += `</p>`;

  const html = msg + `<table class="tbl"><tr><th>線番</th><th>ページ</th><th>始点</th><th>始点端子</th>`
    + `<th>終点</th><th>終点端子</th><th>状態</th><th>レイヤー</th></tr>${body}</table>`;
  _reportOpen('conntbl', '接続チェック', html, exportConnCSV);
}

function exportConnCSV() {
  const rows = _connSortRows(buildConnectionRows());
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csvRows = ['線番,ページ,始点,始点端子,終点,終点端子,状態,レイヤー'];
  rows.forEach(r => {
    const f = _connFmtEnd(r.from), t = _connFmtEnd(r.to);
    csvRows.push([r.wireNo || '', r.page, f.name, f.term, t.name, t.term,
                  _connRowIssue(r), r.layer].map(esc).join(','));
  });
  dl(csvRows.join('\n'), 'connection_check.csv', 'text/csv');
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
  if (typeof pushH === 'function') pushH();

  const G = state.G || 10;
  const boxW = G * 6;      // 端子1個分の箱の幅
  const boxH = G * 2;      // 端子1個分の箱の高さ
  const capH = G * 2;      // キャプション(デバイス名)の行の高さ

  // 挿入位置は現在の画面中心(ワールド座標)。挿入後はドラッグで動かせる。
  const cv = document.getElementById('cv');
  const x0 = (cv.width  / 2 - state.pan.x) / state.zoom;
  const y0 = (cv.height / 2 - state.pan.y) / state.zoom;

  const layer = activeLayer();
  const els = [];

  els.push({ id: genId('el'), type:'text', x:x0, y:y0, text: String(dev), fs:12, layer });

  rows.forEach((r, i) => {
    const y = y0 + capH + i * boxH;
    els.push({ id: genId('el'), type:'rect', x:x0, y, w:boxW, h:boxH, layer });
    els.push({ id: genId('el'), type:'text', x:x0 + G*0.5,       y:y + boxH/2, text: r.termNo || '-', fs:9, layer });
    els.push({ id: genId('el'), type:'text', x:x0 + boxW*0.55,   y:y + boxH/2, text: r.conns.length ? r.conns.join('/') : '', fs:9, layer });
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
      + ` onclick="renumberTerminals('${String(dev).replace(/'/g, "\\'")}')">この順で番号を振り直す</button>`
      + `<button class="fp-btn" style="margin-left:4px;font-size:10px;padding:1px 8px"`
      + ` onclick="insertTerminalBlockDiagram('${String(dev).replace(/'/g, "\\'")}')"`
      + ` title="番号・線番を並べた簡易図を画面中央に挿入します(手書きで仕上げてください)">この配置で図を挿入</button></p>`
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
