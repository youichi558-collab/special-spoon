// ================================================================
// xref.js — クロスリファレンス(コイルと接点の相互参照)を図面に出す(2026-09-29)
//
// 【経緯】盛田さん「基本的にクロスリファレンスは図面に表示されないと意味がない、そこが重要、
// ただし基本は接点とコイルだけ」。従来は帳票(js/report.js の showRefPanel)だけで図面には出なかった。
// 決まった表示(HANDOFF.md「クロスリファレンスは図面に表示するのが本題」)。
//
//  ■ コイル側: **図の中身の一番下(外枠・母線など)より下**に、コイルと同じ横位置で出す。図に少しもかぶらない。
//       CR1        ← デバイス名(一番上)。**行の頭は左そろえ**(まとまり全体の中央はコイルの真下)
//       MY4N       ← 型式(コイルの値。未割り当てなら行を詰める)
//       AC100V     ← 電圧(コイル電圧を持つときだけ)
//       a 9-5 (1/F2) ← 接点1つにつき1行。位置は括弧付き(盛田さん「コイル側も括弧入れた方が見やすい」)。a・bの別行(c接点として1行にはまとめない)。端子番号が分かれば付ける
//       b 9-1         使っていない接点は位置を空欄にする(「空き」「未使用」という文字は書かない=盛田さんの指示)
//     型式・電圧はコイル記号の横には書かない(盛田さんの指示)。
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
//         (オムロンMYで確認。Sheet3の接点14個すべてこの規則に合った。**確認済みの型式(XREF_C_ORDER_OKの MY 系)でだけ枠を作る。他は作らない**)
//      「補助:13,14,21,22…」: 2つずつの組。JISの番号の決まりで、下1桁が3・4ならa、1・2ならb
//  ・端子の組が作れない型式(または型式が無い)は、使用中の接点だけを出す
// ================================================================

const XREF_BAND   = 20;   // コイルの左右にこの幅の中を「そのコイルの列」とみなして、一番下を探す
const XREF_MARGIN = 12;   // 一番下からこれだけ空けて書き始める

// 図面全体の文字サイズの倍率(既定0.7=盛田さんが選んだ大きさ)。表示タブの入力欄(ui.js の setXrefScale)で変える。
// 個別の調整項目はプロパティ欄に足さない(盛田さん「プロパティが多すぎる」)
function xrefScale() { const v = Number(state.xrefScale); return (v > 0 && v <= 3) ? v : 0.7; }

// 要素ごとの調整(プロパティのCRタブ): xrefHide=出さない / xrefOffX・xrefOffY=自動の位置からのずれ / xrefMul=文字サイズの倍率(全体の倍率に掛ける)
function xrefMul(el) { const m = Number(el.xrefMul); return (m > 0 && m <= 3) ? m : 1; }
function xrefOff(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function xrefRole(el) { return (typeof symRole === 'function') ? symRole(el) : ''; }

// '9,5' → [9,5]。2つの数字でなければ null
function xrefTermPair(str) {
  const a = String(str || '').split(',').map(s => parseInt(s.trim(), 10));
  return (a.length === 2 && a.every(Number.isFinite)) ? a : null;
}
// 接点シンボルの端子番号(2つ)。①図面のシンボルに入れた番号(el.terminals) ②なければシンボル定義の既定の番号
// (ピンエディタで入れたラベル)。他の機能(端子番号の表示・接続チェック=conn_table.js)と同じ優先順位。
function xrefElTerms(el) {
  if (String(el.terminals || '').trim()) return xrefTermPair(el.terminals);
  const cS = (state.customSymbols || []).find(x => x.type === el.type);
  if (cS && Array.isArray(cS.terminals) && cS.terminals.length === 2) {
    return xrefTermPair(cS.terminals.map(t => t.label || '').join(','));
  }
  return null;
}
function xrefSamePair(a, b) {
  return !!a && !!b && ((a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]));
}

// c接点の3端子を「昇順でNC・NO・共通」と読んでよい型式: オムロン MY 系(MY2N・MY4N・MY4ZN…=実図面Sheet3で確認済み)と、
// 富士 HH5 系(HH52P・HH54P…=**盛田さんの判断**「ソケットを共用できるので端子の役割はオムロンと同じ」。実物での確認は未)。
// H3Y は MY と同じ並び(1,5,9 / 4,8,12)だが図面で未確認なので入れていない。**型式を増やすときは実物の端子で確かめてから**。
const XREF_C_ORDER_OK = /^((MY|HH5)\d|H3YN?-)/i;

// 【型式ごとの端子の役割の表】カタログで確かめた、c接点ごとの (共通・NO・NC)。部品DBの端子欄の並びに頼らない
// (タイマは接点ごとに並びが逆: 例 H3CR-Aの `1,3,4`=共通,NO,NC と `11,8,9`=共通,NC,NO)ので、役割を明示して持つ。
// 出典(オムロン、Google Driveのカタログ PDF。2026-09-29に本文を読んで確認):
//   H3CR-A(11ピン): 限時接点 NC=⑪-⑧(①-④)、NO=⑪-⑨(①-③)      H3CR-A p.13 動作チャート・p.6 端子配置
//   H3CR-F/-FN(11ピン): NO ①-③・⑪-⑨、NC ①-④・⑪-⑧             H3CR-F/-G/-H p.7 動作チャート
//   H3CR-A8/-A8E(8ピン): 限時 NC=⑧-⑤・NO=⑧-⑥、(A8Eの)瞬時 NC=①-④・NO=①-③   H3CR-A p.15-16
//   H3CR-F8/-F8N(8ピン): NO ①-③・⑥-⑧、NC ①-④・⑤-⑧            H3CR-F/-G/-H p.7
// **確認していない型式(H3CR-G/-H、トランジスタ出力のAS・A8S等)は入れない**。追加するときは実物・カタログで確かめてから。
const XREF_C_TABLE = [
  { re: /^H3CR-(A|AP|F|FN)$/i,          contacts: [{ com: 1, no: 3, nc: 4 }, { com: 11, no: 9, nc: 8 }] },
  { re: /^H3CR-(A8|A8E|F8|F8N)$/i,      contacts: [{ com: 1, no: 3, nc: 4 }, { com: 8,  no: 6, nc: 5 }] },
];
function xrefModelToken(model) { return String(model || '').trim().split(/\s+/)[0]; }

// 型番 → 接点の枠の一覧 [{kind:'a'|'b', t:[p,q]}]。作れなければ []
function xrefSlots(model) {
  // ① 型式ごとの表(カタログで役割を確認済み)。部品DBに登録が無くても使える
  const tok = xrefModelToken(model);
  const hit = XREF_C_TABLE.find(t => t.re.test(tok));
  if (hit) {
    const out = [];
    hit.contacts.forEach(c => out.push({ kind: 'a', t: [c.com, c.no] }, { kind: 'b', t: [c.com, c.nc] }));
    return out;
  }
  // ② 部品DBの端子欄(補助接点の組、確認済みの型式のc接点の3端子)
  const p = (state.customParts || []).find(x => x.ref === model);
  if (!p || !p.terminals || typeof parseTerminalGroups !== 'function') return [];
  const out = [];
  parseTerminalGroups(p.terminals).forEach(g => {
    const nums = g.list.map(s => parseInt(s, 10));
    if (nums.some(n => !Number.isFinite(n))) return;
    if (/^(限時)?接点\d*$/.test(g.name) && nums.length === 3) {
      // 「昇順で NC・NO・共通」は**確認できた型式でだけ**使う(XREF_C_ORDER_OK)。他の型式(例: H3CRの`1,3,4`)は
      // この並びとは限らず、間違った端子番号を図面に出すのは出さないより悪いので、枠を作らない(使用中の接点は端子番号つきで出る)
      if (!XREF_C_ORDER_OK.test(model)) return;
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
// 【2026-09-30 デバイス台帳③】まとめ方・型式・電圧は台帳(js/devices.js deviceLedger)から読む。
// 以前はコイルの記号の型式・電圧を読んでいたので、記号ごとに値が違うと結果が記号しだいで変わった。
// 型式がデバイス内で食い違っていれば model は空・modelConflict=true(空き接点の枠は出さず、確認列で知らせる)。
function xrefCollect() {
  const devs = new Map();
  deviceLedger().forEach(D => {
    D.items.forEach(it => {
      if (it.group) return;
      const el = it.el, role = xrefRole(el);
      if (role !== 'coil' && role !== 'contact_a' && role !== 'contact_b') return;
      let d = devs.get(D.key);
      if (!d) {
        d = { name: D.ref, model: D.vals.partModel || '', volt: D.vals.partVolt || '',
              modelConflict: D.conflicts.some(c => c.field === 'partModel'), coils: [], contacts: [] };
        devs.set(D.key, d);
      }
      const rec = { el, pi: it.pi, loc: elLocation(el, it.pi) };
      if (role === 'coil') d.coils.push(rec);
      else d.contacts.push(Object.assign(rec, { kind: role === 'contact_a' ? 'a' : 'b', terms: xrefElTerms(el) }));
    });
  });
  return devs;
}

// コイル側に出す文字の行。[{t, bold}]
function xrefCoilLines(d, coilRec) {
  const coil = coilRec.el;
  const lines = [{ t: String(coil.partRef).trim(), bold: true }];
  // 型式・電圧はデバイスの値(台帳)。無い呼び出し方(古いテスト等)ではコイルの値
  const model = String((d.model != null ? d.model : coil.partModel) || '').trim();
  const volt  = String((d.volt  != null ? d.volt  : coil.partVolt)  || '').trim();
  if (model) lines.push({ t: model });
  if (volt) lines.push({ t: volt });

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
    lines.push({ t: r.kind + (r.t ? ` ${r.t[0]}-${r.t[1]}` : '') + (r.locs.length ? ` (${r.locs.join(',')})` : '') });
  });
  return lines;
}

// 【接点Refの「確認」列用】図面に番号が出ない・出せない理由を出す。[{msg, pi, id}]。pi・idがあれば、その要素へ飛べる。
// 図面に出す処理(xrefCoilLines・xrefCompute)と同じ条件で見る。コイルが無いデバイスは図面に何も出さないので、ここでは見ない(接点Refが別に警告する)。
function xrefDiagnose(d) {
  const out = [];
  if (!d || !d.coils.length) return out;
  const model = String((d.model != null ? d.model : d.coils[0].el.partModel) || '').trim();
  const slots = xrefSlots(model);
  if (d.modelConflict) out.push({ msg: '型式がデバイスの中で食い違っています(押すと選ぶ画面が開きます)。空き接点の枠が出ません', resolve: true });
  else if (!model) out.push({ msg: 'コイルに型式が無いため、空き接点の枠が出ません' });
  else if (!slots.length) out.push({ msg: `型式「${model}」は空き接点の枠を出せません(型式表・部品DBに端子の情報が無い)` });
  d.contacts.forEach(c => {
    const nm = `${c.kind}接点 ${c.loc}`, at = { pi: c.pi, id: c.el.id };
    if (!c.terms) out.push(Object.assign({ msg: `${nm}: 端子番号が未入力(または2つの数字でない)` }, at));
    else if (slots.length && !slots.some(x => x.kind === c.kind && xrefSamePair(c.terms, x.t))) {
      out.push(Object.assign({ msg: `${nm}: 端子 ${c.terms[0]}-${c.terms[1]} はこの型式の枠に無い` }, at));
    }
    if (c.el.devHide) out.push(Object.assign({ msg: `${nm}: デバイス名を出していないので、接点側の(位置)が出ません` }, at));
  });
  return out;
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
      if (el.devHide || el.xrefHide) return;           // 接点のデバイス名を出していない/CRタブでOFFなら、出さない
      const dev = (typeof getDef === 'function' ? getDef(el.type) : null) || { h: 34 };
      const dfs = el.devFs || 11;
      const dy = el.devOffY !== undefined ? el.devOffY : -(dev.h * (el.scale || 1) / 2 + 6);
      contacts.set(el.id, {
        x: el.x + (el.devOffX || 0) + xrefOff(el.xrefOffX), y: el.y + dy + dfs * 1.25 + xrefOff(el.xrefOffY),
        fs: Math.max(2, dfs * 0.85 * xrefScale() * xrefMul(el)), text: `(${coilLocs})`,
      });
    });
    d.coils.forEach(c => {
      const el = c.el, pg = state.pages[c.pi];
      if (el.xrefHide) return;                         // CRタブでOFF
      const nameFs = (el.devFs || 11) * xrefScale() * xrefMul(el);
      const fs = Math.max(2, nameFs * 0.75);
      const lines = xrefCoilLines(d, c);
      const w = Math.max(...lines.map((l, i) => xrefTextW(l.t, i === 0 ? nameFs : fs)));
      const bot = xrefBottom(pg, el.x - XREF_BAND, el.x + XREF_BAND);
      blocks.push({ pi: c.pi, elId: el.id, x: el.x, w, fs, nameFs, lines, offX: xrefOff(el.xrefOffX), offY: xrefOff(el.xrefOffY),
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
  // 左寄せ(盛田さん指示): 文字の頭をそろえる。まとまり全体の中央はコイルの真下(ぶつからないよう右にずらした分を含む)
  // 個別の位置補正(CRタブ)は、ぶつからないようにずらした後の位置に足す
  blocks.forEach(b => { b.left = b.x - b.w / 2 + b.offX; b.y += b.offY; });
  const byEl = new Map();
  blocks.forEach(b => byEl.set(b.elId, b));
  return { blocks, contacts, byEl };
}

// 【2026-09-29】**常時は計算しない**(盛田さん「クロスリファレンスを常時走らせるのはやめよう」)。
// 以前は描画のたびに計算し直していたため、図面を編集・読込するたびに勝手に出て、勝手に変わった
// (保存データを新しいページに読み込むと、同じデバイス名が1つに束ねられて内容がおかしくなった)。
// 今は**押したときだけ計算して、その結果を保持**する(未接続チェックと同じ作り)。
//   ・ボタン「クロスリファレンス」を押す(または「更新」)→ xrefRefresh() で計算して表示。もう一度押すと隠して結果を捨てる
//   ・図面を直しても自動では更新されない。直したら「更新」を押す(表示・DXF出力とも、今の結果のまま)
//   ・新規作成・置き換え読込・ページの削除/並べ替えは、結果が図面と合わなくなるので隠して捨てる(xrefReset)
//   ・倍率・CRタブの個別設定を直したときだけ、表示中なら計算し直す(操作した本人が結果を見たいので)
let _xrefResult = null;
const _xrefEmpty = () => ({ blocks: [], contacts: new Map(), byEl: new Map() });
function xrefRefresh() { _xrefResult = xrefCompute(); return _xrefResult; }
function xrefReset() {
  _xrefResult = null;
  state.showXref = false;
  if (typeof syncXrefBtn === 'function') syncXrefBtn();
}
// 図面に出す内容。**ここでは計算しない**(保持している結果を返すだけ。表示OFF・未計算なら空)
function xrefGet() {
  if (state.showXref !== true || !_xrefResult) return _xrefEmpty();
  return _xrefResult;
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['xref.js'] = 1;
