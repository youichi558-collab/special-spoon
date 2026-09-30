// ================================================================
// devices.js — デバイス台帳(2026-09-29、作り直しの①)
//
// 【設計の原則(盛田さん)】「同じデバイスで型番仕様が変わるはずない、変わったらそれは違うデバイスだ。
// デバイスが全部のベースで作れ」。型番・仕様・電圧・極数/定格電流/動作特性・メーカー・名称・備考・
// 部品表の対象外は、**デバイス(partRef)に1つ**。
//
// 【台帳の持ち方】台帳を図面とは別の表として保存すると、元に戻す・自動保存・バックアップ・読込の
// すべてで表と図面の両方を扱う必要があり、1か所でも漏れると表と図面が食い違う(今回直したい問題そのもの)。
// そこで台帳は**図面の記号から毎回組み立てる(deviceLedger)**。図面の記号は同じ値のコピーを持ち、
// 「同じデバイスの記号は必ず同じ値」という決まりを、値を書く口(devSetField)と読込時の点検(devNormalize)で守る。
//
// ①でやること: 台帳の組み立て・読込時の点検(空欄を埋める)・食い違いを盛田さんが選ぶ画面・部品表からその画面を開く。
// ②以降(未着手): プロパティ・部品表などの入力口を全部 devSetField 経由にする。
// ================================================================

// デバイスに1つの項目。empty: 空欄を「未入力」とみなすか(true)、空欄も1つの値とみなすか(false=対象外の有無)
const DEV_FIELDS = [
  { key: 'partModel', name: '型番',     groups: true },   // 外形図のグループも型番を持つ
  { key: 'label',     name: '仕様',     noJunction: true },  // 端子台の端子の label は端子番号なので対象外
  { key: 'partVolt',  name: 'コイル電圧' },
  { key: 'partPoles', name: '極数' },
  { key: 'partAmp',   name: '定格電流' },
  { key: 'partChar',  name: '動作特性' },
  { key: 'partMaker', name: 'メーカー' },
  { key: 'partName',  name: '名称' },
  { key: 'partNote',  name: '備考' },
  { key: 'panelZone', name: '部品表の対象外', emptyIsValue: true },
  // 端子台表の「端子台として集計」を外した印(true)。端子台の端子(○◎)だけが持つ。デバイス④(2026-09-30)
  { key: 'tbExclude', name: '端子台として集計', emptyIsValue: true, junctionOnly: true, bool: true },
];

function devKey(ref) {
  const r = String(ref == null ? '' : ref).trim();
  return r ? (normalizeRef(r) || r) : '';
}
function _devVal(o, f) {
  const v = o[f.key];
  if (v == null) return '';
  return String(v).trim();
}
function devShowVal(f, v) {
  if (f.key === 'panelZone') return v === '外' ? '対象外' : '対象(部品表に載せる)';
  if (f.key === 'tbExclude') return v ? '集計しない' : '集計する';
  return v === '' ? '(空欄)' : String(v).replace(/\n/g, ' ');
}
// その項目を持つ物(記号・グループ)
function _devTargets(dev, f) {
  return dev.items.filter(it => it.group ? !!f.groups
    : !(f.noJunction && it.el.type === 'junction') && !(f.junctionOnly && it.el.type !== 'junction'));
}

// 台帳を組み立てる。戻り値: Map(キー → { key, ref, items:[{pi, el, group}], vals:{項目: 値}, conflicts:[{field, options:[{value, items}]}] })
// vals は食い違いの無い項目の値(空欄=未入力の項目は、入っている値)。食い違いのある項目は conflicts に入り、vals には入らない。
function deviceLedger() {
  const devs = new Map();
  (state.pages || []).forEach((pg, pi) => {
    const add = (o, group) => {
      const key = devKey(o.partRef);
      if (!key) return;
      let d = devs.get(key);
      if (!d) { d = { key, ref: String(o.partRef).trim(), spell: new Map(), items: [], vals: {}, conflicts: [] }; devs.set(key, d); }
      const sp = String(o.partRef).trim();
      d.spell.set(sp, (d.spell.get(sp) || 0) + 1);
      d.items.push({ pi, el: o, group });
    };
    (pg.elements || []).forEach(el => {
      // 配線の分岐点(●)は部品ではない
      if (el.type === 'junction' && (el.style || 'dot') === 'dot') return;
      add(el, false);
    });
    (pg.groups || []).forEach(g => add(g, true));
  });
  devs.forEach(d => {
    d.ref = [...d.spell.entries()].sort((a, b) => b[1] - a[1])[0][0];   // 表示名は一番多い綴り
    DEV_FIELDS.forEach(f => {
      const byVal = new Map();
      _devTargets(d, f).forEach(it => {
        const v = _devVal(it.el, f);
        if (v === '' && !f.emptyIsValue) return;
        if (!byVal.has(v)) byVal.set(v, []);
        byVal.get(v).push(it);
      });
      if (byVal.size === 1) d.vals[f.key] = [...byVal.keys()][0];
      else if (byVal.size > 1) {
        d.conflicts.push({ field: f.key, options: [...byVal.entries()].map(([value, items]) => ({ value, items }))
          .sort((a, b) => b.items.length - a.items.length) });
      }
    });
  });
  return devs;
}

// デバイスの項目に値を入れる(そのデバイスの記号・グループすべて)。空文字なら消す。戻り値: 書き換えた数
// 【仕様の見た目を変えない】仕様(label)は既定で図面に表示される(specHideが無ければ出る)。
// 仕様が空だった記号に値を入れるとき、そのデバイスに既に仕様を持つ記号があれば、新しく入れた記号は
// 「仕様を図面に表示」をOFFにする(=図面に文字が増えない。代表の記号だけに出す運用のまま)。
// (既に仕様を持つ記号があれば、表示・非表示に関わらず新しく入れた記号はOFF。)どの記号にも仕様が無かったデバイスに初めて入れるときは、
// コイル(無ければ最初の記号)だけ表示のままにする。
function devSetField(key, fieldKey, value) {
  const f = DEV_FIELDS.find(x => x.key === fieldKey);
  const d = deviceLedger().get(key);
  if (!f || !d) return 0;
  const v = String(value == null ? '' : value).trim();
  const targets = _devTargets(d, f);
  if (f.key === 'label' && v) {
    let rep = null;
    if (!targets.some(it => _devVal(it.el, f) !== '')) {
      rep = targets.find(it => typeof symRole === 'function' && symRole(it.el) === 'coil') || targets[0];
    }
    targets.forEach(it => {
      if (_devVal(it.el, f) === '' && it !== rep && !it.el.specHide) it.el.specHide = true;
    });
  }
  let n = 0;
  targets.forEach(it => {
    const o = it.el;
    if (v === '') { if (o[f.key] !== undefined) { delete o[f.key]; n++; } return; }
    if (_devVal(o, f) !== v) { o[f.key] = f.bool ? true : v; n++; }   // 印の項目(tbExclude)は true で持つ
  });
  return n;
}

// 記号がデバイスに加わった(デバイス名を入れた・変えた)とき、その記号とデバイスの値をそろえる。
// デバイスの他の記号に値があればそれに合わせる(デバイスが正)。デバイスにまだ値が無く、この記号にだけあれば、
// その値をデバイスの値にする(新しく値を持ち込んだ)。他の記号の値が食い違っている項目は触らない(選ぶ画面で決める)。
function devSyncFromEl(el) {
  const key = devKey(el && el.partRef);
  if (!key) return 0;
  const d = deviceLedger().get(key);
  if (!d) return 0;
  let n = 0;
  DEV_FIELDS.forEach(f => {
    if ((f.noJunction && el.type === 'junction') || (f.junctionOnly && el.type !== 'junction')) return;
    const others = _devTargets(d, f).filter(it => it.el !== el);
    if (!others.length) return;
    const ov = new Set(others.map(it => _devVal(it.el, f)).filter(v => f.emptyIsValue || v !== ''));
    if (ov.size === 1) { const v = [...ov][0]; if (_devVal(el, f) !== v) n += devSetField(key, f.key, v); }
    else if (ov.size === 0 && _devVal(el, f) !== '') n += devSetField(key, f.key, _devVal(el, f));
  });
  return n;
}

// プロパティ欄で1つの記号を直す前後で使う。直す前の値を控え(devSnap)、直した後に
// 変わった項目をデバイス全体へ入れる(devCommitEl)。デバイス名が変わったときは、新しいデバイスにそろえる。
function devSnap(el) {
  const s = { partRef: el.partRef };
  DEV_FIELDS.forEach(f => { s[f.key] = _devVal(el, f); });
  return s;
}
function devCommitEl(el, before) {
  const key = devKey(el.partRef);
  if (!key) return 0;
  if (devKey(before.partRef) !== key) return devSyncFromEl(el);
  let n = 0;
  DEV_FIELDS.forEach(f => {
    if ((f.noJunction && el.type === 'junction') || (f.junctionOnly && el.type !== 'junction')) return;
    const v = _devVal(el, f);
    if (v !== before[f.key]) n += devSetField(key, f.key, v);
  });
  return n;
}

// 読込時の点検。食い違いの無い項目で、空欄の記号に値を入れる(デバイスに1つの値をそろえる)。
// 食い違い(値が2つ以上)は勝手に決めない。戻り値: { filled: 埋めた数, conflicts: [{key, ref, field, options}] }
function devNormalize() {
  let filled = 0;
  const conflicts = [];
  deviceLedger().forEach(d => {
    DEV_FIELDS.forEach(f => {
      if (f.emptyIsValue || !(f.key in d.vals)) return;
      filled += devSetField(d.key, f.key, d.vals[f.key]);
    });
  });
  deviceLedger().forEach(d => d.conflicts.forEach(c => conflicts.push({ key: d.key, ref: d.ref, field: c.field, options: c.options })));
  return { filled, conflicts };
}

// 今の図面にある食い違いの一覧
function devConflicts() {
  const out = [];
  deviceLedger().forEach(d => d.conflicts.forEach(c => out.push({ key: d.key, ref: d.ref, field: c.field, options: c.options })));
  return out;
}

// 食い違いを選ぶ画面。選んだ項目だけそろえる(選ばなかった項目はそのまま。あとで部品表から開き直せる)。
// そろえる前に必ず pushH する(そろえた操作だけを元に戻せる。読込直後でも同じ)。
function devResolveDialog(conflicts, opts) {
  opts = opts || {};
  conflicts = conflicts || devConflicts();
  if (!conflicts.length) { if (opts.onDone) opts.onDone(0); return; }
  const old = document.getElementById('dev-resolve-dlg');
  if (old) old.remove();
  const loc = it => (typeof elLocation === 'function' && !it.group) ? elLocation(it.el, it.pi) : (it.group ? `${it.pi + 1}/外形図` : String(it.pi + 1));
  const ov = document.createElement('div');
  ov.id = 'dev-resolve-dlg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center';
  let rows = '';
  conflicts.forEach((c, ci) => {
    const f = DEV_FIELDS.find(x => x.key === c.field);
    rows += `<div style="border-top:1px solid var(--bd2);padding:6px 0">`
      + `<div style="font-weight:600;margin-bottom:3px">${escH(c.ref)} の${escH(f ? f.name : c.field)}</div>`;
    c.options.forEach((o, oi) => {
      const locs = o.items.map(loc);
      rows += `<label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer;padding:1px 0">`
        + `<input type="radio" name="devc${ci}" value="${oi}" style="margin-top:2px">`
        + `<span><b>${escH(devShowVal(f || {}, o.value))}</b>`
        + `<span style="color:var(--fg3)">　${o.items.length}個（${escH(locs.slice(0, 6).join(', '))}${locs.length > 6 ? ' …' : ''}）</span></span></label>`;
    });
    rows += `</div>`;
  });
  const btn = 'padding:6px 14px;font-size:12px;cursor:pointer;border:1px solid var(--bd2);border-radius:4px;background:var(--bg2);color:var(--fg)';
  ov.innerHTML = `<div role="dialog" style="background:var(--bg2);color:var(--fg);border:1px solid var(--bd);border-radius:6px;padding:14px 18px;width:560px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 4px 24px var(--sh);font-size:12px;line-height:1.5">
    <div style="font-size:13px;font-weight:600;margin-bottom:4px">同じデバイスで値が食い違っています（${conflicts.length}件）</div>
    <div style="color:var(--fg3);margin-bottom:6px">同じデバイスは型番・仕様などが1つのはずです。正しい方を選んでください。選んだ値が、そのデバイスの全部の記号に入ります。<br>選ばなかった項目はそのまま残ります（部品表の「食い違いを直す」から、あとで選べます）。</div>
    <div style="overflow-y:auto;flex:1">${rows}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button id="devr-later" style="${btn}">あとで</button>
      <button id="devr-ok" style="${btn};background:var(--acc);color:#fff;border-color:var(--acc)">選んだ値にそろえる</button>
    </div></div>`;
  document.body.appendChild(ov);
  const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); if (opts.onDone) opts.onDone(0); } };
  document.addEventListener('keydown', onKey, true);
  ov.querySelector('#devr-later').onclick = () => { close(); if (opts.onDone) opts.onDone(0); };
  ov.querySelector('#devr-ok').onclick = () => {
    const picks = [];
    conflicts.forEach((c, ci) => {
      const r = ov.querySelector(`input[name="devc${ci}"]:checked`);
      if (r) picks.push({ c, value: c.options[+r.value].value });
    });
    close();
    if (!picks.length) { if (opts.onDone) opts.onDone(0); return; }
    if (typeof pushH === 'function') pushH();   // そろえた操作は単独で元に戻せる(読込直後でも。読込ごと戻したいときはもう一度戻す)
    picks.forEach(p => devSetField(p.c.key, p.c.field, p.value));
    if (typeof draw === 'function') draw();
    if (typeof updateRightPanel === 'function') updateRightPanel();
    if (opts.onDone) opts.onDone(picks.length);
  };
}

// 読込(置き換え・追加)・バックアップ復元・自動保存の復元のあとに呼ぶ。空欄を埋め、食い違いがあれば選ぶ画面を出す。
// 戻り値: { filled, conflicts }(呼び出し側が知らせに使う)
function devAfterLoad(opts) {
  const r = devNormalize();
  if (r.conflicts.length) {
    const open = () => devResolveDialog(r.conflicts, { onDone: n => {
      const h = document.getElementById('s-hint');
      if (h && n) h.textContent = `デバイスの食い違いを ${n} 件そろえました`;
      if (document.getElementById('report-p')?.classList.contains('open') && typeof showBOM === 'function' && _lastReportTab === 'bom') showBOM();
    } });
    if (opts && opts.defer) setTimeout(open, 0); else open();
  }
  if (r.filled && typeof draw === 'function') draw();
  return r;
}

// ================================================================
// 読み込めたことの目印(autosave.js の _asMissingScripts が見る。ファイル末尾に置く)
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['devices.js'] = 1;
