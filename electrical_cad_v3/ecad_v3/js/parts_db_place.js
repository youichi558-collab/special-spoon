// ================================================================
// parts_db_place.js — 部品DBの場所(ライブラリフォルダ)を画面から設定する
//
// 2026-10-02: 盛田さん「parts_db.jsonの場所を設定できるようにしないといかんな」「両方に置いて作って」。
//   以前は `py tools\parts_db\parts_db.py setpath ...` のコマンドでしか設定できなかった。
// 2026-10-03: ファイルではなく**ライブラリフォルダ**を選ぶ形に変えた(HANDOFF.md「ライブラリの置き場所の再設計」段階1)。
//   ・今の状態(フォルダと件数/未設定/見つからない)を出す
//   ・「フォルダを選ぶ」: このPCのサーバーがWindowsの「フォルダの選択」窓を出す。部品DBが無いフォルダなら「作りますか？」と聞く
//   ・「探す」: ディスクから parts_db.json を探して候補を並べる → 押すとそのフォルダを使う
//   ・見つからないとき「もう一度確かめる」(同期ソフトやネットワークの準備待ちのため)
// CADの設定タブ・部品DB画面(parts.html)・CADの初回案内(js/parts_db.js)で、この1つの部品を使う。
// 画面から好きなパスは送らない(server.py handle_parts_place の説明)。設定したら onChanged で読み直す。
// ================================================================
function pdbPlaceRender(boxId, onChanged) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box._onChanged = onChanged || box._onChanged;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const btn = (act, label, title) => `<button class="fp-btn" style="font-size:11px;padding:2px 8px" onclick="pdbPlaceAct('${boxId}','${act}')" title="${esc(title)}">${label}</button>`;
  // 【2026-10-03】1段に並べる(場所・ボタン)。CADのリボンは中身を全部同じ高さ(--rb-h)に揃える決まりで
  // (css/style.css の .rg-btns>*)、3段(場所/ボタン/空のメッセージ欄)にしたら設定タブだけリボンが伸びて
  // 図面が下にずれた(盛田さん「設定リボンがおかしくなってるな」)。長いパスは省略して、マウスを当てると全部出す。
  // メッセージ欄は中身があるときだけ出す(探すの候補一覧のときだけ一時的に伸びる)。
  box.style.display = 'flex'; box.style.flexDirection = 'row'; box.style.flexWrap = 'wrap';
  box.style.alignItems = 'center'; box.style.gap = '4px';
  const draw = (stText, color, title, missing) => {
    box.innerHTML = `<div style="font-size:11px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:${'var(--rb-h,23px)'}" title="${esc(title || '')}"><span style="color:var(--fg3)">部品DBの場所(ライブラリフォルダ):</span> <span style="${color ? 'color:' + color + ';' : ''}font-family:monospace">${stText}</span></div>`
      + btn('pick', 'フォルダを選ぶ', 'このPCの「フォルダの選択」窓で、部品DB(parts_db.json)を置くフォルダを選びます。部品DBが無いフォルダなら、空の部品DBを作るか聞きます(窓がブラウザの裏に出たら、タスクバーから前に出してください)')
      + btn('find', '探す', 'ディスクから parts_db.json を探して候補を並べます(数十秒かかることがあります)')
      + (missing ? btn('recheck', 'もう一度確かめる', '同期ソフト(Googleドライブ等)やネットワークの準備ができたら押してください') : '')
      + `<div class="pdb-place-msg" style="display:none;flex-basis:100%;height:auto;white-space:normal;font-size:11px"></div>`;
    if (!title) box.firstElementChild.title = box.firstElementChild.textContent;   // 省略された文も、マウスを当てれば全部読める
    if (typeof syncRibbonHeight === 'function') syncRibbonHeight();
  };
  draw('確認中…');
  fetch('/api/parts/stats').then(r => r.json()).then(st => {
    if (!st || !st.available) { draw('部品DBの機能が導入されていません', 'var(--red)'); return; }
    if (st.source === 'path' || st.source === 'path_recovered') draw(`${esc(st.library_dir)}（部品 ${st.count}件）`, '', `${st.path}（${st.count}件）`);
    else if (st.source === 'path_missing') draw(`見つかりません: ${esc(st.library_dir)}`, 'var(--red)', st.error, true);
    else draw('未設定', 'var(--red)');
  }).catch(() => draw('ローカルサーバーに接続できません（start.bat で起動してください）', 'var(--red)'));
}

async function pdbPlaceAct(boxId, act, arg) {
  const box = document.getElementById(boxId);
  const msg = t => { const m = box && box.querySelector('.pdb-place-msg'); if (m) { m.innerHTML = t; m.style.display = t ? '' : 'none'; } if (typeof syncRibbonHeight === 'function') syncRibbonHeight(); };
  const post = (path, body) => fetch('/api/parts/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  try {
    if (act === 'find') {
      msg('探しています…（数十秒かかることがあります）');
      const r = await post('find');
      if (!r.ok) { msg(`<span style="color:var(--red)">${esc(r.error)}</span>`); return; }
      if (!r.candidates.length) { msg('parts_db.json は見つかりませんでした。「フォルダを選ぶ」で、部品DBを置くフォルダを選んでください(無ければ作れます)'); return; }
      msg('<div style="color:var(--fg3)">押すとそのフォルダを使います（件数の多い順）:</div>' + r.candidates.map(c =>
        `<div><button class="fp-btn" style="font-size:10px;padding:1px 6px;margin:1px 0;text-align:left" onclick="pdbPlaceAct('${boxId}','use',${c.i})">${esc(c.path)}（${c.count < 0 ? '読めない' : c.count + '件'}）</button></div>`).join(''));
      return;
    }
    if (act === 'recheck') { pdbPlaceRender(boxId); if (box && typeof box._onChanged === 'function') box._onChanged({}); return; }
    if (act === 'pick') msg('「フォルダの選択」窓を出しています…（ブラウザの裏に出たら、タスクバーから前に出してください）');
    let r = await post(act, act === 'use' ? { i: arg } : {});
    if (r.need_create) {
      if (!confirm(`このフォルダには部品DB(parts_db.json)がありません。\n${r.folder}\n\n空の部品DB(登録0件)を作って、このフォルダを使いますか？`)) { msg('取りやめました'); return; }
      r = await post('create');
    }
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
