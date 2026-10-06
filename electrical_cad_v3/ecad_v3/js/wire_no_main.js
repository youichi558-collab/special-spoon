// ================================================================
// wire_no_main.js — 主回路の線番の段送り(2026-10-04 仮案。盛田さん「一応主回路、仮案で入れとくか、どうなるかやってみたい」)
//
// 決まり(仮。図面が何パターンか揃ったら作り方を考え直す前提。HANDOFF.md「線番の再設計」):
//   ・起点は手で入れた名前(R・S・T、L・N など。英字＋数字。書式の番号 01・301 は起点にしない)
//   ・主接点(シンボルの種別が「主接点」。ブレーカ・漏電ブレーカ・CP・電磁接触器・サーマル等)を通るたびに段を上げる: R → R1 → R2
//   ・分岐(1つのネットから2台以上の主接点へ)は 段＋枝番: R1 → R21・R22。分岐の後にさらに通ると段を上げ枝番は持ち越す: R21 → R31(仮)
//   ・U・V・W という名前の端子(インバータの出口・モータの端子)に乗るネットは U・V・W＋番号(U1・V1・W1)
//   ・枝番・モータの番号は設定で「図面の位置順 / デバイス名の番号(MCCB2 → R22、M3 → U3)」
//   ・相: 主接点の端子番号を「奇数とその次の偶数」で組にする(1↔2、3↔4、5↔6。T1↔T2 も)。入口/出口は名前のある側から決める
//   ・手で入れた名前は上書きしない。自動で入れた名前には目印(wireNoMain)を付け、もう一度押すと目印の付いたものだけ入れ直す
//   ・決まりで決められない所は入れずに知らせる(端子番号が組にならない・デバイス名に番号が無い・同じ名前が既にある 等)
// ================================================================

const WNM_COL_TOL = 5;

// 主接点の極の組: 端子番号の末尾の数字で 奇数n ↔ n+1。組にならない端子があれば null
function wnmPolePairs(terms) {
  const byNum = new Map();
  for (const t of terms) {
    const m = String(t.label || '').match(/(\d+)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (byNum.has(n)) return null;
    byNum.set(n, t);
  }
  const pairs = [];
  for (const [n, t] of byNum) {
    if (n % 2 === 0) { if (!byNum.has(n - 1)) return null; continue; }
    const u = byNum.get(n + 1);
    if (!u) return null;
    pairs.push([t, u]);
  }
  return pairs.length ? pairs : null;
}
const wnmDevNo = el => { const m = String(el.partRef || '').match(/(\d+)$/); return m ? m[1] : ''; };
const wnmDevName = el => el.partRef || el.label || '(デバイス名なし)';
function wnmByPos(a, b) { return Math.abs(a.x - b.x) > WNM_COL_TOL ? a.x - b.x : a.y - b.y; }

// ページ pi の主回路の線番の案を作る。戻り値: { plan:[{idxs, v}], clear:[idxs], issues:[文字列] }
function wnmPlan(pi) {
  const pg = state.pages[pi];
  const wires = pg.wires || [], els = pg.elements || [];
  const f = wnFmt();
  const nets = groupWiresByNet(wires, null, els);
  const netOfWire = new Map();
  nets.forEach((idxs, n) => idxs.forEach(i => netOfWire.set(i, n)));
  const ptsOf = w => w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
  const tol = (typeof CONN_TABLE_TOL === 'number') ? CONN_TABLE_TOL : 5;
  const terms = collectTerminalPoints(els).filter(p => p.kind === 'symbol');
  // 端子 → ネット
  const netOfTerm = new Map();
  wires.forEach((w, i) => {
    const ps = ptsOf(w);
    [ps[0], ps[ps.length - 1]].forEach(p => {
      const t = findNearestTerminal(p.x, p.y, terms, tol);
      if (t) netOfTerm.set(t.elId + ':' + t.termIdx, netOfWire.get(i));
    });
  });
  // 【2026-10-06】端子台の端子(○◎)にじかに付いているシンボルの端子は、その○につながっている線のネット(js/conn_table.js connSymOnTB)
  if (typeof connSymOnTB === 'function') {
    connSymOnTB(collectTerminalPoints(els), tol).forEach(({ sym, tb }) => {
      const key = sym.elId + ':' + sym.termIdx;
      if (netOfTerm.has(key)) return;
      const i = wires.findIndex(w => { const ps = ptsOf(w); return [ps[0], ps[ps.length - 1]].some(p => Math.hypot(p.x - tb.x, p.y - tb.y) <= tb.r + tol) || (typeof _wireThroughCircle === 'function' && _wireThroughCircle(ps, tb)); });
      if (i >= 0) netOfTerm.set(key, netOfWire.get(i));
    });
  }
  const elById = new Map(els.map(e => [e.id, e]));

  // 今の名前。自動の名前(目印あり)は入れ直すので空として扱う
  const name = nets.map(idxs => idxs.map(i => wires[i].wireNo).find(Boolean) || '');
  const orig = name.slice();
  const auto = nets.map(idxs => idxs.some(i => wires[i].wireNo && wires[i].wireNoMain));
  const clear = [];
  nets.forEach((idxs, n) => { if (auto[n]) { clear.push(idxs); name[n] = ''; } });
  const used = new Set();
  state.pages.forEach((p, k) => { if (!p._file) (p.wires || []).forEach((w, i) => { if (w.wireNo && !(k === pi && auto[netOfWire.get(i)])) used.add(w.wireNo); }); });

  const out = new Map();   // ネット番号 → 名前
  const issues = [];
  const put = (n, v, why) => {
    if (name[n] || out.has(n)) return false;
    if (used.has(v)) { issues.push(`${why}: 「${v}」は既に使われているので入れていません`); return false; }
    out.set(n, v); used.add(v); return true;
  };

  // ① U・V・W の端子に乗るネット(インバータの出口・モータ)。デバイスごとに番号
  const uvwDevs = [];
  els.forEach(el => {
    const ts = terms.filter(t => t.elId === el.id && /^[UVW]$/i.test(String(t.dispTerm || '').trim()));
    if (ts.length) uvwDevs.push({ el, ts });
  });
  uvwDevs.sort((a, b) => wnmByPos(a.el, b.el));
  const uvwTaken = new Set();
  uvwDevs.forEach((d, k) => {
    const no = f.mainMotor === 'dev' ? wnmDevNo(d.el) : String(k + 1);
    d.ts.forEach(t => {
      const n = netOfTerm.get(t.elId + ':' + t.termIdx);
      if (n == null || uvwTaken.has(n)) return;
      uvwTaken.add(n);
      if (name[n]) return;
      if (!no) { issues.push(`${wnmDevName(d.el)} の ${t.dispTerm}: デバイス名に番号が無いので入れていません(設定「デバイス名の番号」)`); return; }
      put(n, String(t.dispTerm).trim().toUpperCase() + no, `${wnmDevName(d.el)} の ${t.dispTerm}`);
    });
  });

  // ② 主接点の極の組
  const poles = [];   // { el, a:ネット, b:ネット }
  els.forEach(el => {
    if (symRole(el) !== 'contact_main') return;
    const ts = terms.filter(t => t.elId === el.id).map(t => ({ label: t.dispTerm, net: netOfTerm.get(t.elId + ':' + t.termIdx) }));
    if (!ts.some(t => t.net != null)) return;
    const pairs = wnmPolePairs(ts);
    // U・V・W の端子を持つ機器(インバータ等)は①で扱うので、組にならなくても知らせない
    if (!pairs && uvwDevs.some(d => d.el === el)) return;
    if (!pairs) { issues.push(`${wnmDevName(el)}: 主接点の端子番号(${ts.map(t => t.label).join(',')})が「奇数とその次の偶数」の組にならないので、先へ進めません`); return; }
    pairs.forEach(([p, q]) => { if (p.net != null && q.net != null && p.net !== q.net) poles.push({ el, a: p.net, b: q.net }); });
  });

  // ③ 起点から段送り。rec: ネット → { base, stage, suffix }
  const rec = new Map();
  const isSeed = v => /^[A-Za-z]+\d*$/.test(v) && !wnParse(v);
  nets.forEach((idxs, n) => {
    const v = name[n];
    if (!v || !isSeed(v)) return;
    const m = v.match(/^([A-Za-z]+)(\d*)$/);
    rec.set(n, { base: m[1], stage: m[2] ? parseInt(m[2], 10) : 0, suffix: '' });
  });
  const queue = [...rec.keys()];
  const nameOf = n => name[n] || out.get(n) || '';
  while (queue.length) {
    const n = queue.shift(), r = rec.get(n);
    // このネットから出ていく極(相手側がまだ名前の無いネット)。同じデバイスの極は1台
    // 分岐かどうかは、このネットにつながる主接点の台数で決める(出口に名前が既にある台も数える)。入口側(段の手前)の機器は除く
    const next = [], fed = new Set();
    poles.forEach(p => {
      const other = p.a === n ? p.b : p.b === n ? p.a : null;
      if (other == null) return;
      const back = rec.has(other) && rec.get(other).stage < r.stage;   // こちらへ来た元の機器
      if (back) return;
      fed.add(p.el);
      if (nameOf(other) || rec.has(other) || uvwTaken.has(other)) return;
      next.push({ el: p.el, net: other });
    });
    const allDevs = [...fed].sort(wnmByPos);
    const devs = [...new Set(next.map(x => x.el))].sort(wnmByPos);
    devs.forEach(el => {
      let branch = '';
      if (allDevs.length > 1) {
        branch = f.mainBranch === 'dev' ? wnmDevNo(el) : String(allDevs.indexOf(el) + 1);
        if (!branch) { issues.push(`${wnmDevName(el)}: 分岐の枝番に使うデバイス名の番号が無いので、先へ進めません`); return; }
      }
      next.filter(x => x.el === el).forEach(x => {
        if (rec.has(x.net)) return;
        const nr = { base: r.base, stage: r.stage + 1, suffix: r.suffix + branch };
        const v = nr.base + nr.stage + nr.suffix;
        if (put(x.net, v, `${wnmDevName(el)} の出口`)) { rec.set(x.net, nr); queue.push(x.net); }
      });
    });
  }
  const plan = [...out].map(([n, v]) => ({ idxs: nets[n], v, old: auto[n] ? orig[n] : '' }));
  // 自動の名前で、今の決まりでは作り直せないもの(手前を手で直した等)は消さずに残す。ただし同じ名前を別の所に入れるなら消す(重複させない)
  const newNames = new Set(plan.map(c => c.v));
  const clearOut = clear.filter(idxs => { const n = nets.indexOf(idxs); return out.has(n) || newNames.has(orig[n]); });
  return { plan, clear: clearOut, issues };
}

// ボタン「主回路の線番を振る」(このページ)
function wireNoMainCircuit(pi) {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  if (pi == null) pi = state.currentPage || 0;
  const pg = state.pages[pi];
  const { plan, clear, issues } = wnmPlan(pi);
  const changed = plan.filter(c => c.old !== c.v);
  const removed = clear.filter(idxs => !plan.some(c => c.idxs === idxs));
  if (!changed.length && !removed.length) {
    wireNoTable('主回路: 入れる名前はありません' + (issues.length ? '\n⚠' + issues.join('\n⚠') : '') + '\n(起点の名前(R・S・T、L・N など)を手で入れ、主接点のシンボルの端子に線をつないでください)');
    return;
  }
  const lines = changed.slice(0, 30).map(c => `  ${c.old || '(未採番)'} → ${c.v}`).concat(removed.slice(0, 10).map(idxs => `  ${idxs.map(i => pg.wires[i].wireNo).find(Boolean)} → (消す。今の決まりでは入らない)`)).join('\n');
  if (!confirm(`主回路の線番を入れます(仮の決まり)。${changed.length + removed.length}件:\n${lines}${changed.length > 30 ? `\n  …ほか${changed.length - 30}件` : ''}`
      + (issues.length ? `\n\n入れられない所 ${issues.length}件(線番表に出します)` : '')
      + `\n\n手で入れた名前は変えません。元に戻すときは Ctrl+Z。実行しますか？`)) return;
  pushH();
  clear.forEach(idxs => idxs.forEach(i => { if (pg.wires[i].wireNoMain) { pg.wires[i].wireNo = ''; pg.wires[i].wireNoMain = false; } }));
  plan.forEach(c => {
    _setNetWireNo(pg.wires, c.idxs, c.v);
    c.idxs.forEach(i => { if (pg.wires[i].wireNo) pg.wires[i].wireNoMain = true; });   // 自動で入れた目印(もう一度押すと入れ直す)
  });
  draw();
  wireNoTable(`主回路の線番を${changed.length}件入れました(仮の決まり)` + (removed.length ? `、${removed.length}件消しました` : '') + (issues.length ? '\n⚠' + issues.join('\n⚠') : ''));
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['wire_no_main.js'] = 1;
