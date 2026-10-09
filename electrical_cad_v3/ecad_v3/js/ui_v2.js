// ================================================================
// ui_v2.js — 新しい画面(UI v2)への切り替え
// ================================================================
// 【2026-10-07】Claude Design の案(5a 明るい表示 / 5b ダーク表示)の段階0・1。盛田さん「おすすめでいい、進めて」。
//   段階0: 設定の「画面」で「新しい画面／今の画面」を選ぶ(stSetPref('uiV2'))。既定は今の画面。
//   【2026-10-09】既定を新しい画面にした(盛田さん「既定でいい」)。今の画面を選んだときは false を覚える(以前は覚えを消していて「未選択」と区別できなかった)
//          新しい画面のときは body に ui-v2 を付け、見た目は css/style.css の body.ui-v2 の下だけに書く。
//   段階1: リボンとクイックバーを隠し、上のバー(#v2-top)・ツール設定帯(#v2-tbar)・下のバー(#v2-bottom)に置き換える。
//
// 【作りの決まり】ボタンは作り直さず、今のボタン(のDOM)をそのまま新しいバーへ**移す**。
//   2026-09-19 に「同じボタンが2か所にあり、点灯のさせ方が別々で片方だけ消し忘れる」不具合が出ている
//   (js/input.js syncModeButtons の注記)。移すだけなら点灯する処理は今と同じ1か所のまま。
//   今の画面に戻すときは、移した位置(目印のコメント)へ全部戻す。
//
// メニュー(ファイル・編集…)は、今のリボンの同じタブの中身(#rp-data など)を押したときだけドロップダウンへ移して出す。
// リボンの「作図」「配線」タブのボタンは、上のツール群・「その他」・ツール設定帯へ移す。

// ツール群に並べるもの(並びは案のとおり)。gap: 左に間を空ける(｜の位置)
const UIV2_TOOLS = [
  ['qb-sel'], ['qb-wire'],
  ['rb-text', 1], ['rb-fline'], ['rb-rect'], ['rb-circle'], ['rb-arc'], ['rb-dim'],
  ['rb-junction-dot', 1], ['rb-junction-circle'], ['rb-junction-dbl'],   // 端子○は盛田さん「よく使う」(10-07)で「その他」から移した
  ['qb-partref', 1], ['qb-wireno'],
];
// ツール群に無いもの(案で抜けていた11個。盛田さん「おすすめでいい」=「その他 ▾」から出す)
const UIV2_MORE = ['rb-arc3', 'rb-triangle', 'rb-bezier', 'rb-angle_dim', 'rb-leader', 'rb-chain_dim',
  'rb-measure', 'rb-guide_h', 'rb-guide_v'];
// ツール設定帯へ移すもの。出す/隠すはツールの種類ごとに CSS(#v2-tbar[data-kind])で決める
const UIV2_TSET = ['rb-ortho', 'rb-snapend', 'rb-snapmid', 'draw-lw-wrap', 'rb-textbox', 'jst-size-wrap',
  'wn-b-auto', 'wn-b-renum', 'wn-b-main'];
// 下のバーの表示の切替
const UIV2_DISP = ['rb-termno', 'rb-xref', 'qb-flines', 'qb-unchk', 'qb-unconn', 'qb-pins'];

// ツールの名前(ツール設定帯の札)
const UIV2_TOOL_NAMES = {
  select: '選択', wire: '配線', text: 'テキスト', fline: '直線', rect: '矩形', circle: '円', arc: '半円',
  arc3: '弧', triangle: '三角', bezier: '曲線', dim: '寸法線', angle_dim: '角度寸法', leader: '指示線',
  chain_dim: '連続寸法', measure: '測定', guide_h: '水平補助', guide_v: '垂直補助', junction: '分岐点・端子',
  sym: 'シンボル', partref: '№採番', wireno: '線番クリック', paste: '貼付',
};
// ツールの種類 → ツール設定帯に出すもの(CSS の data-kind)
function uiV2ToolKind(m) {
  if (m === 'wire') return 'wire';
  if (m === 'text') return 'text';
  if (m === 'junction') return 'junction';
  if (['fline', 'rect', 'circle', 'arc', 'arc3', 'triangle', 'bezier', 'dim', 'angle_dim', 'leader',
       'chain_dim', 'measure', 'guide_h', 'guide_v'].includes(m)) return 'draw';
  return 'none';
}
function uiV2ToolName(m) { return UIV2_TOOL_NAMES[m] || m || ''; }

// 右パネルの幅の既定(段階2)。前回値(設定 rpWidth)があればそちらを使う
const UIV2_RP_W = 272;

let _uiV2On = false;
const _uiV2Moved = [];   // {el, ph}: 移した部品と、元の位置の目印

function _uiV2Move(id, dest, gap) {
  const el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el || !dest || !el.parentNode) return;
  const ph = document.createComment('ui-v2:' + (el.id || ''));
  el.parentNode.insertBefore(ph, el);
  _uiV2Moved.push({ el, ph, title: el.getAttribute('title') });
  // アイコンだけになるので、名前が無いボタンには名前(今のボタンの文字)を出す
  if (!el.getAttribute('title')) el.setAttribute('title', (el.textContent || '').trim());
  if (gap) el.classList.add('v2-gap');
  dest.appendChild(el);
}
function _uiV2RestoreAll() {
  while (_uiV2Moved.length) {
    const { el, ph, title } = _uiV2Moved.pop();
    if (ph.parentNode) { ph.parentNode.insertBefore(el, ph); ph.remove(); }
    el.classList.remove('v2-gap');
    if (title == null) el.removeAttribute('title'); else el.setAttribute('title', title);
  }
}

// 画面を切り替える(設定パネルから)
function uiV2Set(on) {
  if (typeof stSetPref === 'function') stSetPref('uiV2', !!on);
  uiV2Apply(on);
}

function uiV2Apply(on) {
  on = !!on;
  const r1 = document.getElementById('ui-v2-on'), r0 = document.getElementById('ui-v2-off');
  if (r1) r1.checked = on; if (r0) r0.checked = !on;
  if (on === _uiV2On) { if (typeof syncRibbonHeight === 'function') syncRibbonHeight(); return; }
  uiV2CloseMenu(); _uiV2ClosePops();
  if (on) {
    const tools = document.getElementById('v2-tools');
    UIV2_TOOLS.forEach(([id, gap]) => _uiV2Move(id, tools, gap));
    // その他 ▾(ツール群の右端)
    let more = document.getElementById('v2-more-btn');
    if (!more) {
      more = document.createElement('div');
      more.id = 'v2-more-btn';
      more.title = 'その他のツール(弧・三角・曲線・角度寸法・指示線・連続寸法・測定・補助線)';
      more.innerHTML = '<svg viewBox="0 0 14 14" width="15" height="15"><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/></svg>';
      more.onclick = e => { e.stopPropagation(); _uiV2TogglePop('v2-more-pop', more); };
    }
    more.classList.add('v2-gap');
    tools.appendChild(more);
    const morePop = document.getElementById('v2-more-pop');
    UIV2_MORE.forEach(id => _uiV2Move(id, morePop));
    const tset = document.getElementById('v2-tset');
    UIV2_TSET.forEach(id => _uiV2Move(id, tset));
    _uiV2Move('s-hint', document.getElementById('v2-hint'));
    _uiV2Move('page-tabs', document.getElementById('v2-pages'));
    const disp = document.getElementById('v2-disp');
    UIV2_DISP.forEach(id => _uiV2Move(id, disp));
    const cr = document.getElementById('v2-cr');
    _uiV2Move('xref-scale-wrap', cr); _uiV2Move('rb-xref-refresh', cr);
    const lay = document.getElementById('v2-layer');
    _uiV2Move('qb-layer-color', lay); _uiV2Move('active-layer-sel', lay);
    _uiV2Move('sb', document.getElementById('v2-sb'));
    _uiV2Move('rp-toggle', document.getElementById('rp-v2head'));   // 右パネルを畳むボタンは見出しの右端へ
    // 中身を全部移して空になったリボンのグループ(表示>図面)は、メニューに出さない
    document.querySelectorAll('#ribbon .rg').forEach(g => {
      const b = g.querySelector('.rg-btns');
      if (b && !b.children.length) g.classList.add('v2-empty');
    });
  } else {
    _uiV2RestoreAll();
    document.querySelectorAll('.rg.v2-empty').forEach(g => g.classList.remove('v2-empty'));
    const more = document.getElementById('v2-more-btn');
    if (more && more.parentNode) more.parentNode.removeChild(more);
  }
  _uiV2On = on;
  document.body.classList.toggle('ui-v2', on);
  // 右パネルの幅: 自分で幅を変えていなければ(前回値なし)、新しい画面は 272・今の画面は 200
  const prefs = typeof stPrefs === 'function' ? stPrefs() : {};
  if (!prefs.rpWidth && typeof rpSetWidth === 'function') rpSetWidth(on ? UIV2_RP_W : RP_W_DEF, false);
  uiV2SyncRpHead();
  // 点灯を今の状態に合わせ直す(今の点灯処理をそのまま呼ぶ。起動時は分岐点の形のボタンが点いたままのことがある)
  if (typeof syncModeButtons === 'function') syncModeButtons(state.mode);
  if (state.mode === 'junction' && typeof syncJunctionStyleBtns === 'function') syncJunctionStyleBtns();
  uiV2SyncTitle();
  // バーの高さが変わるので、窓の大きさを変えたときと同じ処理(右パネルの位置・キャンバスの大きさ・描き直し)を通す
  window.dispatchEvent(new Event('resize'));
}

// ツールの点灯に合わせて、ツール設定帯(札・出す設定)と「その他」の点灯を変える。
// js/input.js syncModeButtons から呼ぶ(点灯する処理の中から一緒に呼ぶ=点け直しの経路を増やさない)
function uiV2SyncTool(m) {
  const tb = document.getElementById('v2-tbar');
  if (!tb) return;
  tb.dataset.kind = uiV2ToolKind(m);
  const nm = document.getElementById('v2-toolname');
  if (nm) nm.textContent = uiV2ToolName(m);
  const more = document.getElementById('v2-more-btn');
  if (more) {
    more.classList.toggle('on', UIV2_MORE.includes('rb-' + m));
  }
}

// ファイル名と補足(ページ名・何ページ目か)。ページタブを描き直すとき(js/ui.js renderPageTabs)に一緒に呼ぶ
function uiV2SyncTitle() {
  const f = document.getElementById('v2-fname'), s = document.getElementById('v2-fsub');
  if (!f || !s || typeof state === 'undefined') return;
  const pg = (state.pages || [])[state.currentPage || 0];
  f.textContent = state.saveFileName || '図面';
  const n = (state.pages || []).length;
  s.textContent = [pg && pg.name, n ? `${(state.currentPage || 0) + 1} / ${n} ページ` : ''].filter(Boolean).join(' ・ ');
}

// ── 右パネルの見出し(段階2) ──
// 中身(js/ui.js updateRightPanel)は変えず、描き直されたら(#rp-body の中身が変わったら)見出しだけ付け直す。
// 選んでいる要素は updateRightPanel が #rp-body._el / _wire に入れている
function uiV2SyncRpHead() {
  const nm = document.getElementById('rp-v2name'), sub = document.getElementById('rp-v2sub'), ic = document.getElementById('rp-v2icon');
  const rp = document.getElementById('rp-body');
  if (!nm || !sub || !ic || !rp) return;
  const el = rp._el, w = rp._wire;
  const n = (state.sel ? state.sel.els.size + state.sel.wires.size : 0);
  let name = 'プロパティ', info = '', icon = 'none';
  if (el) {
    const isSym = (state.customSymbols || []).some(s => s.type === el.type);
    if (isSym) {
      name = el.partRef || '(デバイス名なし)';
      info = [typeof rpSymbolLabel === 'function' ? rpSymbolLabel(el).split('／')[0] : '', el.partModel, el.layer].filter(Boolean).join(' ・ ');
      icon = 'sym';
    } else if (el.type === 'junction') {
      name = el.partRef ? `${el.partRef}${el.label ? '-' + el.label : ''}` : (el.style === 'dot' || !el.style ? '分岐点' : '端子');
      info = [el.style === 'dot' || !el.style ? '分岐点' : '端子台の端子', el.layer].filter(Boolean).join(' ・ ');
      icon = 'junc';
    } else {
      name = uiV2ToolName(el.type) || el.type;
      info = el.layer || '';
      icon = el.type === 'text' ? 'text' : 'shape';
    }
  } else if (w) {
    name = w.wireNo ? `配線 ${w.wireNo}` : '配線';
    info = w.layer || '';
    icon = 'wire';
  } else if (n >= 2) {
    info = `${n}個を選択中`;
  } else {
    info = '要素を選ぶと表示します';
  }
  nm.textContent = name;
  sub.textContent = info;
  const P = {
    sym:   '<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    junc:  '<circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1 7h3M10 7h3" stroke="currentColor" stroke-width="1.3"/>',
    wire:  '<path d="M1 7h3M6 7h3M12 7h1M4 7V4M9 7v3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    text:  '<path d="M2 3h10M7 3v8M4 11h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    shape: '<rect x="2.5" y="3.5" width="9" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    none:  '<path d="M3 3.5h8M3 7h8M3 10.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  };
  ic.innerHTML = `<svg viewBox="0 0 14 14" width="18" height="18">${P[icon]}</svg>`;
}

// ── メニュー(今のリボンの同じタブの中身をドロップダウンで出す) ──
let _uiV2Menu = null;   // {wrap, ph, disp, btn}
function uiV2OpenMenu(btn) {
  const tab = btn.dataset.tab;
  const same = _uiV2Menu && _uiV2Menu.btn === btn;
  uiV2CloseMenu(); _uiV2ClosePops();
  if (same) return;   // 開いているメニューをもう一度押したら閉じる
  // 「設定」はもう一度押したら閉じる。他のメニューを開いたら設定パネルを閉じる(2026-10-09 盛田さん)
  if (btn.dataset.act === 'settings') { if (typeof toggleSettingsPanel === 'function') toggleSettingsPanel(); return; }
  if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
  const wrap = document.getElementById('rp-' + tab);
  const pop = document.getElementById('v2-menu-pop');
  if (!wrap || !pop) return;
  const ph = document.createComment('ui-v2-menu');
  wrap.parentNode.insertBefore(ph, wrap);
  _uiV2Menu = { wrap, ph, disp: wrap.style.display, btn };
  pop.appendChild(wrap);
  wrap.style.display = 'flex';
  btn.classList.add('on');
  _uiV2PlacePop(pop, btn);
}
function uiV2CloseMenu() {
  const m = _uiV2Menu;
  if (!m) return;
  _uiV2Menu = null;
  if (m.ph.parentNode) { m.ph.parentNode.insertBefore(m.wrap, m.ph); m.ph.remove(); }
  m.wrap.style.display = m.disp;
  m.btn.classList.remove('on');
  document.getElementById('v2-menu-pop')?.classList.remove('v2-open');
}
function _uiV2PlacePop(pop, btn) {
  const r = btn.getBoundingClientRect();
  pop.classList.add('v2-open');
  const w = pop.offsetWidth;
  pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
  pop.style.top = Math.round(r.bottom + 4) + 'px';
}
function _uiV2TogglePop(id, btn) {
  const pop = document.getElementById(id);
  const open = pop && pop.classList.contains('v2-open');
  uiV2CloseMenu(); _uiV2ClosePops();
  if (pop && !open) _uiV2PlacePop(pop, btn);
}
function _uiV2ClosePops() {
  document.querySelectorAll('#v2-more-pop, #v2-save-pop').forEach(p => p.classList.remove('v2-open'));
}

document.addEventListener('DOMContentLoaded', () => {
  // 右パネルが描き直されたら見出しを付け直す(新しい画面のときだけ)
  const rpb = document.getElementById('rp-body');
  if (rpb && typeof MutationObserver === 'function') {
    new MutationObserver(() => { if (_uiV2On) uiV2SyncRpHead(); }).observe(rpb, { childList: true });
  }
  document.querySelectorAll('#v2-menus .v2-menu').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); uiV2OpenMenu(b); });
  });
  const sm = document.getElementById('v2-save-more');
  if (sm) sm.addEventListener('click', e => { e.stopPropagation(); _uiV2TogglePop('v2-save-pop', document.getElementById('v2-save')); });
  // ドロップダウンの中のボタンを押したら閉じる(入力欄・選択欄・チェックは触れるように閉じない)
  document.querySelectorAll('.v2-pop').forEach(p => p.addEventListener('click', e => {
    if (e.target.closest('input, select, label, textarea')) return;
    if (e.target.closest('.rb, .v2-pop-item, [onclick]')) setTimeout(() => { uiV2CloseMenu(); _uiV2ClosePops(); }, 0);
  }));
  // 外を押したら閉じる
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.v2-pop, .v2-menu, #v2-more-btn, #v2-save-more')) return;
    uiV2CloseMenu(); _uiV2ClosePops();
  });
  window.addEventListener('resize', () => { uiV2CloseMenu(); _uiV2ClosePops(); });
});

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['ui_v2.js'] = 1;
