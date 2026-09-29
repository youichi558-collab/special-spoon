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

// 許容誤差内で最も近い端子点を探す(ページ単位・端子点数は通常数百程度のため線形探索で十分)
function findNearestTerminal(x, y, termPts, tol) {
  let best = null, bestD = tol;
  termPts.forEach(p => {
    const d = Math.hypot(p.x - x, p.y - y);
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
function analyzeConnections() {
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
      net.terms.sort((a, b) => (a.name + ' ' + a.term).localeCompare(b.name + ' ' + b.term, 'ja', { numeric: true }));
      out.push(net);
    });
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
  let msg = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    + `全${state.pages.length}ページ集計。ネット ${nets.length}件(配線 ${nWires}本)`;
  if (nDang)  msg += ` / <span style="color:var(--red);font-weight:600">浮いている端 ${nDang}か所</span>`;
  if (nNoNo)  msg += ` / <span style="color:var(--red);font-weight:600">未採番 ${nNoNo}件</span>`;
  if (nTee)   msg += ` / <span style="font-weight:600">●の無いT字 ${nTee}か所</span>`;
  if (!nBad && !nTee) msg += ` / 問題なし`;
  msg += `<br>並べ替え: ${btn('wire', '線番順')} ${btn('part', '部品順')}`;
  msg += `<br>1行=つながっている配線のまとまり(ネット)。分岐点(●)でつながった先の端子も、同じ行に並びます。`
    + `問題は端ごとに出します: <b>浮いている端</b>=端が端子にも他の配線にも●にも触れていないもの(許容誤差${CONN_TABLE_TOL})。`
    + `目視では繋がって見えても座標がズレている場合があります(DXFインポート後に起きやすい)。最寄りの端子と距離を添えています。`;
  msg += `<br>行(と赤い⚠)を押すと、この一覧を閉じて図面のその場所へ移動します。`;
  msg += `</p>`;

  const html = msg + `<table class="tbl"><tr><th>線番</th><th>ページ</th><th>配線</th><th>接続している端子</th><th>状態</th></tr>${body}</table>`;
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

// 端子に繋がっている線番を集める
function _tbConnsOf(el, pg) {
  const conns = new Set();
  // 【2026-09-25】線番は1ネット1か所なので、ネットの番号を出す(report.js netWireNoOf)
  const netNo = netWireNoOf(pg);
  (pg.wires || []).forEach((w, wi) => {
    const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
    [pts[0], pts[pts.length-1]].forEach(p => {
      if (Math.hypot(p.x-el.x, p.y-el.y) <= CONN_TABLE_TOL) conns.add(netNo[wi] || '未採番');
    });
  });
  return [...conns];
}

function buildTerminalBlockRows() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const all = collectTerminals();
  const names = tbDeviceNames(all);   // 綴りが違っても同じデバイスなら1つの台にする(部品表・接点Refと同じ判定)
  return all.map(r => ({
    el:      r.el,
    page:    state.pages[r.page]?.name || ('Sheet' + (r.page + 1)),
    pageIdx: r.page,
    loc:     r.loc,
    tbRef:   names.get(_tbKey(r.el.partRef)),
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
  let html = `<p style="font-size:11px;color:var(--fg3);margin-bottom:6px">`
    + `全${state.pages.length}ページ集計。端子${incRows.length}点 / 端子台${incGroups.size}台`;
  if (unconn) html += ` / <span style="color:var(--red);font-weight:600">未接続 ${unconn}点</span>`;
  // 外した分は必ず数字で見せる。黙って減っていると出力を誤解するため(部品表と同じ)。
  if (exRows.length) html += ` / <span style="color:var(--fg3)">集計対象外 ${exGroups.size}台・${exRows.length}点（CSVにも出ません）</span>`;
  html += `<br>行を押すと、この一覧を閉じて図面のその端子へ移動します。行をドラッグすると並べ替えできます。並べ替えた順で「番号を振り直す」と端子番号が1から振り直されます。`
    + `<br>PLC・インバータ等の「端子台ではない」台は、見出しの「端子台として集計」を外してください（台ごとに1回で、図面に残ります）。</p>`;

  const devSection = (list, dev) => {
    // 型式は同じデバイスの端子すべてで揃う運用(プロパティ側で統一)なので、
    // 全行に同じ文字を並べず台の見出しに1回だけ出す。揃っていない場合だけ
    // 警告を出して気付けるようにする(古い図面や手作業で崩れたとき用)。
    const models = [...new Set(list.map(r => r.tbModel).filter(Boolean))];
    const modelTxt = models.length === 1
      ? `<span style="color:var(--fg3);font-weight:400"> ${escH(models[0])}</span>`
      : models.length > 1
        ? `<span style="color:var(--red);font-weight:400"> 型式が揃っていません（${escH(models.join(' / '))}）</span>`
        : `<span style="color:var(--fg4);font-weight:400"> 型式未設定</span>`;
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
      + list.map((r, i) =>
          `<tr draggable="true" data-elid="${escH(r.el.id)}"`
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
