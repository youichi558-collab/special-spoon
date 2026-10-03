// ================================================================
// parts_db_place.js — 部品DB(parts_db.json)の場所を画面から設定する(2026-10-02)
//
// 盛田さん「parts_db.jsonの場所を設定できるようにしないといかんな」「新規で作成できるんだよな」「両方に置いて作って」。
// 以前は `py tools\parts_db\parts_db.py setpath ...` のコマンドでしか設定できなかった。
// CADの設定タブと部品DB単独画面(parts.html)の両方で、この1つの部品を使う。
//   ・今の状態(読んでいるファイルのパスと件数、未設定・見つからない)を出す
//   ・「ファイルを選ぶ」: このPCのサーバーがWindowsの「ファイルを開く」窓を出す(ブラウザはフルパスを教えないため)
//   ・「探す」: ディスクから parts_db.json を探して候補を並べる → 押すと設定
//   ・「新規作成」: Windowsの「名前を付けて保存」窓で置き場所を選び、空の部品DBを作って設定(既にあるファイルには作らない)
// 画面から好きなパスは送らない(server.py handle_parts_place の説明)。設定したら onChanged で読み直す。
// ================================================================
function pdbPlaceRender(boxId, onChanged) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box._onChanged = onChanged || box._onChanged;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const btn = (act, label, title) => `<button class="fp-btn" style="font-size:11px;padding:2px 8px" onclick="pdbPlaceAct('${boxId}','${act}')" title="${esc(title)}">${label}</button>`;
  const draw = (stText, color, extra) => {
    box.innerHTML = `<div style="font-size:11px;line-height:1.5"><span style="color:var(--fg3)">部品DBの場所:</span> <span style="${color ? 'color:' + color + ';' : ''}font-family:monospace;word-break:break-all">${stText}</span></div>`
      + `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px">`
      + btn('pick', 'ファイルを選ぶ', 'このPCの「ファイルを開く」窓で parts_db.json を選びます(窓がブラウザの裏に出たら、タスクバーから前に出してください)')
      + btn('find', '探す', 'ディスクから parts_db.json を探して候補を並べます(数十秒かかることがあります)')
      + btn('new', '新規作成', '「名前を付けて保存」窓で置き場所を選び、空の部品DB(登録0件)を作ります。既にあるファイルには作りません(上書きしません)')
      + `</div><div class="pdb-place-msg" style="font-size:11px;margin-top:3px">${extra || ''}</div>`;
    if (typeof syncRibbonHeight === 'function') syncRibbonHeight();
  };
  draw('確認中…');
  fetch('/api/parts/stats').then(r => r.json()).then(st => {
    if (!st || !st.available) { draw('部品DBの機能が導入されていません', 'var(--red)'); return; }
    if (st.source === 'path' || st.source === 'path_recovered' || st.source === 'path_found') draw(`${esc(st.path)}（${st.count}件）`);
    else if (st.source === 'path_missing') draw(`設定の場所に見つかりません（${esc(st.error || '')}）`, 'var(--red)');
    else if (st.source === 'mirror') draw(`未設定（前回の控えを読んでいます・${st.count}件。書き込みはできません）`, 'var(--org,#c77b00)');
    else draw('未設定', 'var(--red)');
  }).catch(() => draw('ローカルサーバーに接続できません（start.bat で起動してください）', 'var(--red)'));
}

async function pdbPlaceAct(boxId, act, arg) {
  const box = document.getElementById(boxId);
  const msg = t => { const m = box && box.querySelector('.pdb-place-msg'); if (m) m.innerHTML = t; };
  const post = (path, body) => fetch('/api/parts/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  try {
    if (act === 'find') {
      msg('探しています…（数十秒かかることがあります）');
      const r = await post('find');
      if (!r.ok) { msg(`<span style="color:var(--red)">${esc(r.error)}</span>`); return; }
      if (!r.candidates.length) { msg('parts_db.json は見つかりませんでした。「ファイルを選ぶ」か「新規作成」を使ってください'); return; }
      msg('<div style="color:var(--fg3)">押すとその部品DBを使います（件数の多い順）:</div>' + r.candidates.map(c =>
        `<div><button class="fp-btn" style="font-size:10px;padding:1px 6px;margin:1px 0;text-align:left" onclick="pdbPlaceAct('${boxId}','use',${c.i})">${esc(c.path)}（${c.count < 0 ? '読めない' : c.count + '件'}）</button></div>`).join(''));
      return;
    }
    if (act === 'pick' || act === 'new') msg(act === 'pick' ? '「ファイルを開く」窓を出しています…（ブラウザの裏に出たら、タスクバーから前に出してください）' : '「名前を付けて保存」窓を出しています…（ブラウザの裏に出たら、タスクバーから前に出してください）');
    const r = await post(act, act === 'use' ? { i: arg } : {});
    if (r.cancelled) { msg('取りやめました'); return; }
    if (!r.ok) { msg(`<span style="color:var(--red)">${esc(r.error)}</span>`); return; }
    pdbPlaceRender(boxId);
    msg(`<span style="color:var(--green,#2e9e4f)">設定しました: ${esc(r.path)}（${r.count}件）</span>`);
    setTimeout(() => msg(`<span style="color:var(--green,#2e9e4f)">設定しました: ${esc(r.path)}（${r.count}件）</span>`), 400);   // 表示を描き直したあとにも出す
    if (box && typeof box._onChanged === 'function') box._onChanged(r);
  } catch (e) {
    msg(`<span style="color:var(--red)">ローカルサーバーに接続できません（${esc(e.message)}）</span>`);
  }
}

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['parts_db_place.js'] = 1;
