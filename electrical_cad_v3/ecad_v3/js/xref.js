// ================================================================
// xref.js — クロスリファレンス(コイルと接点の相互参照)を図面に出す(2026-09-29)
//
// 【経緯】盛田さん「基本的にクロスリファレンスは図面に表示されないと意味がない、そこが重要、
// ただし基本は接点とコイルだけ」。従来は帳票(js/report.js の showRefPanel)だけで図面には出なかった。
// 決まった表示(HANDOFF.md「クロスリファレンスは図面に表示するのが本題」)。
//
//  ■ コイル側: **図の中身の一番下(外枠・母線など)より下**に、コイルと同じ横位置で出す。図に少しもかぶらない。
//       CR1        ← デバイス名(一番上)
//       MY4N       ← 型式(コイルの値。未割り当てなら行を詰める)
//       AC100V     ← 電圧(コイル電圧を持つときだけ)
//       a 9-5 1/F2 ← 接点1つにつき1行。a・bの別行(c接点として1行にはまとめない)。端子番号が分かれば付ける
//       b 9-1         使っていない接点は位置を空欄にする(「空き」「未使用」という文字は書かない=盛田さんの指示)
//     括弧はコイル側には付けない。型式・電圧はコイル記号の横には書かない(盛田さんの指示)。
//  ■ 接点側: 接点の**デバイス名の真下**に、コイルの位置を括弧付きで書く。 (1/F3)
//  ■ 対象はコイルとa接点・b接点だけ(役割 coil / contact_a / contact_b)。主接点・その他は出さない。
//
// 【区画の表記】既存の帳票と同じ elLocation()(js/report.js)を使う。「ページ/区画」で、区画は
// 列=数字・行=英字(例 1/6C)。区画の境目にあるものは zoneOf の決まり(境目は右・下の区画)に従う。
//
// 【端子番号の出し方】
//  ・使っている接点: 図面のシンボルに入っている端子番号(el.terminals)をそのまま出す
//  ・使っていない接点: 部品DBの端子欄から作る
//      「接点N:x,y,z」(c接点の3端子): 昇順で NC・NO・共通。a=共通-NO、b=共通-NC。
//         (オムロンMYで確認。Sheet3の接点14個すべてこの規則に合った。**他の型式は未確認**)
//      「補助:13,14,21,22…」: 2つずつの組。JISの番号の決まりで、下1桁が3・4ならa、1・2ならb
//  ・端子の組が作れない型式(または型式が無い)は、使用中の接点だけを出す
// ================================================================

const XREF_BAND   = 20;   // コイルの左右にこの幅の中を「そのコイルの列」とみなして、一番下を探す
const XREF_MARGIN = 12;   // 一番下からこれだけ空けて書き始める

// 図面全体の文字サイズの倍率(既定1)。位置・サイズの調整の仕組みは盛田さんに確認してから足す
function xrefScale() { const v = Number(state.xrefScale); return (v > 0 && v <= 3) ? v : 1; }

function xrefRole(el) { return (typeof symRole === 'function') ? symRole(el) : ''; }

// '9,5' → [9,5]。2つの数字でなければ null
function xrefTermPair(str) {
  const a = String(str || '').split(',').map(s => parseInt(s.trim(), 10));
  return (a.length === 2 && a.every(Number.isFinite)) ? a : null;
}
function xrefSamePair(a, b) {
  return !!a && !!b && ((a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]));
}

// 型番 → 接点の枠の一覧 [{kind:'a'|'b', t:[p,q]}]。作れなければ []
function xrefSlots(model) {
  const p = (state.customParts || []).find(x => x.ref === model);
  if (!p || !p.terminals || typeof parseTerminalGroups !== 'function') return [];
  const out = [];
  parseTerminalGroups(p.terminals).forEach(g => {
    const nums = g.list.map(s => parseInt(s, 10));
    if (nums.some(n => !Number.isFinite(n))) return;
    if (/^接点\d*$/.test(g.name) && nums.length === 3) {
      const [nc, no, com] = [...nums].sort((a, b) => a - b);
      out.push({ kind: 'a', t: [com, no] }, { kind: 'b', t: [com, nc] });
    } else if (/補助/.test(g.name)) {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const last = nums[i] % 10;
        const kind = (last === 3 || last === 4) ? 'a' : (last === 1 || last === 2) ? 'b' : '';
        if (kind) out.push({ kind, t: [nums[i], nums[i + 1]] });
      }
    }
  });
  return out;
}

// 全ページから、デバイス(partRef)ごとにコイルと接点を集める
function xrefCollect() {
  const devs = new Map();
  (state.pages || []).forEach((pg, pi) => {
    (pg.elements || []).forEach(el => {
      const raw = String(el.partRef || '').trim();
      if (!raw) return;
      const role = xrefRole(el);
      if (role !== 'coil' && role !== 'contact_a' && role !== 'contact_b') return;
      const key = normalizeRef(raw);
      let d = devs.get(key);
      if (!d) { d = { name: raw, coils: [], contacts: [] }; devs.set(key, d); }
      const rec = { el, pi, loc: elLocation(el, pi) };
      if (role === 'coil') d.coils.push(rec);
      else d.contacts.push(Object.assign(rec, { kind: role === 'contact_a' ? 'a' : 'b', terms: xrefTermPair(el.terminals) }));
    });
  });
  return devs;
}

// コイル側に出す文字の行。[{t, bold}]
function xrefCoilLines(d, coilRec) {
  const coil = coilRec.el;
  const lines = [{ t: String(coil.partRef).trim(), bold: true }];
  const model = String(coil.partModel || '').trim();
  if (model) lines.push({ t: model });
  if (coil.partVolt) lines.push({ t: String(coil.partVolt) });

  const usedIdx = new Set();
  const rows = [];
  xrefSlots(model).forEach(s => {
    const hit = [];
    d.contacts.forEach((c, i) => {
      if (c.kind === s.kind && xrefSamePair(c.terms, s.t)) { hit.push(c.loc); usedIdx.add(i); }
    });
    rows.push({ kind: s.kind, t: s.t, locs: hit });
  });
  // 枠に当てはまらなかった使用中の接点(端子番号が未入力・型式が無い等)も必ず出す
  d.contacts.forEach((c, i) => {
    if (!usedIdx.has(i)) rows.push({ kind: c.kind, t: c.terms, locs: [c.loc] });
  });
  rows.forEach(r => {
    lines.push({ t: r.kind + (r.t ? ` ${r.t[0]}-${r.t[1]}` : '') + (r.locs.length ? ` ${r.locs.join(',')}` : '') });
  });
  return lines;
}

// 文字の幅の見積り(画面とDXFで同じ位置にするため、実測ではなく式で出す)
function xrefTextW(s, fs) {
  let w = 0;
  for (const ch of String(s)) w += (ch.charCodeAt(0) < 256 ? 0.55 : 1.0) * fs;
  return w;
}

// 要素1個の外接の範囲 {x0,x1,bottom}。一番下を探すためだけの大まかなもの
function xrefElBox(el) {
  if (Array.isArray(el.pts) && el.pts.length) {
    const xs = el.pts.map(p => p.x), ys = el.pts.map(p => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), bottom: Math.max(...ys) };
  }
  if (el.type === 'text') {
    const fs = el.fs || 14, ls = String(el.text || '').split('\n');
    const w = Math.max(...ls.map(l => xrefTextW(l, fs)));
    return { x0: el.x, x1: el.x + w, bottom: el.y + (ls.length - 1) * fs * 1.4 + fs * 0.3 };
  }
  if (el.x1 != null && el.x2 != null) {
    return { x0: Math.min(el.x1, el.x2), x1: Math.max(el.x1, el.x2), bottom: Math.max(el.y1, el.y2) };
  }
  if (el.w != null && el.h != null && el.x != null) {
    return { x0: el.x, x1: el.x + el.w, bottom: el.y + el.h };
  }
  if (el.x == null || el.y == null) return null;
  if (el.r != null && el.type !== 'junction' && !xrefRole(el)) return { x0: el.x - el.r, x1: el.x + el.r, bottom: el.y + el.r };
  const d = (typeof getDef === 'function' ? getDef(el.type) : null) || { w: 20, h: 20 };
  const sc = el.scale || 1;
  const hw = (el.r != null ? el.r : (d.w || 20) * sc / 2), hh = (el.r != null ? el.r : (d.h || 20) * sc / 2);
  return { x0: el.x - hw, x1: el.x + hw, bottom: el.y + hh };
}

// ページの中で、横 x0〜x1 の範囲にある図の中身の一番下(画面のyは下が大きい)
function xrefBottom(pg, x0, x1) {
  let bot = -Infinity;
  const take = (a, b, y) => { if (b >= x0 && a <= x1 && y > bot) bot = y; };
  (pg.wires || []).forEach(w => {
    const pts = w.pts || [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
    for (let i = 0; i + 1 < pts.length; i++) {
      take(Math.min(pts[i].x, pts[i + 1].x), Math.max(pts[i].x, pts[i + 1].x), Math.max(pts[i].y, pts[i + 1].y));
    }
  });
  (pg.elements || []).forEach(el => {
    const b = xrefElBox(el);
    if (b && Number.isFinite(b.bottom)) take(b.x0, b.x1, b.bottom);
  });
  return bot;
}

// 図面に出す文字の全部。 {blocks:[{pi,elId,x,y,fs,nameFs,lines,color}], contacts: Map(elId → {x,y,fs,text})}
function xrefCompute() {
  const blocks = [], contacts = new Map();
  xrefCollect().forEach(d => {
    if (!d.coils.length) return;                       // コイルが無いデバイスは何も出さない
    const coilLocs = d.coils.map(c => c.loc).join(',');
    d.contacts.forEach(c => {
      const el = c.el;
      if (el.devHide) return;                          // 接点のデバイス名を出していないなら、その下にも出さない
      const dev = (typeof getDef === 'function' ? getDef(el.type) : null) || { h: 34 };
      const dfs = el.devFs || 11;
      const dy = el.devOffY !== undefined ? el.devOffY : -(dev.h * (el.scale || 1) / 2 + 6);
      contacts.set(el.id, {
        x: el.x + (el.devOffX || 0), y: el.y + dy + dfs * 1.25,
        fs: Math.max(2, dfs * 0.85 * xrefScale()), text: `(${coilLocs})`,
      });
    });
    d.coils.forEach(c => {
      const el = c.el, pg = state.pages[c.pi];
      const nameFs = (el.devFs || 11) * xrefScale();
      const fs = Math.max(2, nameFs * 0.75);
      const lines = xrefCoilLines(d, c);
      const w = Math.max(...lines.map((l, i) => xrefTextW(l.t, i === 0 ? nameFs : fs)));
      const bot = xrefBottom(pg, el.x - XREF_BAND, el.x + XREF_BAND);
      blocks.push({ pi: c.pi, elId: el.id, x: el.x, w, fs, nameFs, lines,
        y: (Number.isFinite(bot) ? bot : el.y) + XREF_MARGIN });
    });
  });
  // 横に並んだコイルの文字がぶつからないよう、左から順に右へずらす
  const byPage = new Map();
  blocks.forEach(b => { (byPage.get(b.pi) || byPage.set(b.pi, []).get(b.pi)).push(b); });
  byPage.forEach(list => {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1], b = list[i];
      if (Math.abs(p.y - b.y) > 60) continue;          // 高さが大きく違えば重ならない
      const min = p.x + p.w / 2 + b.w / 2 + 3;
      if (b.x < min) b.x = min;
    }
  });
  const byEl = new Map();
  blocks.forEach(b => byEl.set(b.elId, b));
  return { blocks, contacts, byEl };
}

// 図面に出す内容(なるべく使い回す)。要素が多い図面では毎回は計算し直さない。
let _xrefCache = null;
function xrefGet() {
  if (state.showXref === false) return { blocks: [], contacts: new Map(), byEl: new Map() };
  const n = (state.pages || []).reduce((s, pg) => s + (pg.elements ? pg.elements.length : 0) + (pg.wires ? pg.wires.length : 0), 0);
  const now = Date.now();
  if (n > 3000 && _xrefCache && now - _xrefCache.ts < 800) return _xrefCache.v;
  const v = xrefCompute();
  _xrefCache = { ts: now, v };
  return v;
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['xref.js'] = 1;
