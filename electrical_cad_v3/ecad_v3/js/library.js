// ================================================================
// library.js — ライブラリフォルダの図面枠テンプレート・表題欄様式(2026-10-03 再設計の段階2)・登録シンボル(段階3)
//
// 以前はブラウザの中(localStorage の ecad_frame_tpls・ecad_titleblock_tpls)にしか無く、
// 別のPCでは使えず、ブラウザのデータを消すと無くなった(書き出し・バックアップの経路も無かった)。
// 今は部品DBと同じライブラリフォルダの frames.json / titleblocks.json が正(server.py /api/library/)。
//
//   ・起動時: 前回読めた内容(このブラウザのキャッシュ ecad_lib_cache_*)で表示しておき、
//     部品DBが読めたら(js/parts_db.js)ライブラリから読み直す。キャッシュは表示用で、保存先ではない
//   ・保存: 読んだ時点の版を送る。別の画面・別のPCで保存されていたら書かずに読み直す(conflict)
//   ・ライブラリが未設定・見つからない間は保存できない(案内を出す)。表示はキャッシュで続ける
//   ・ブラウザに残っている旧データ(旧キー)は消さない。ライブラリに無いものがあれば移すか聞く
//
// 表題欄の様式は図面を描くときに引く(js/data.js titleBlockCells)ので、図面にも使った様式の写しを入れる
// (js/edit.js usedTitleBlockTplsForSave)。引く順は 組み込み → 図面の写し → ライブラリ(ライブラリが正)。
// ================================================================
const ecadLib = (() => {
  const KINDS = ['frames', 'titleblocks', 'symbols', 'partfavs'];   // partfavs: 部品パネルの★よく使う(段階4。旧置き場所は無い)
  const LABEL = { frames: '図面枠テンプレート', titleblocks: '表題欄の様式', symbols: '登録シンボル', partfavs: 'よく使う部品' };
  // 旧置き場所(消さない)。登録シンボルの旧データだけは配列([{type,...}])なので {type: 定義} に直して扱う(legacyMap)
  const LEGACY = { frames: 'ecad_frame_tpls', titleblocks: 'ecad_titleblock_tpls', symbols: 'ecad_customSymbols' };
  const CACHE = k => 'ecad_lib_cache_' + k;
  const SKIP_KEY = 'ecad_lib_migrate_skip';
  // 移した旧データのキー {kind: [キー]}。旧データは消さないので、覚えておかないと、ライブラリから削除した後に
  // また「移しますか？」と聞いたり、シンボルのパレットに旧データが出続けたりする(2026-10-03 段階3で気づいて追加)
  const MIGRATED_KEY = 'ecad_lib_migrated';
  const migratedAll = () => { const o = readJson(MIGRATED_KEY); return o; };
  const migrated = k => new Set(Array.isArray(migratedAll()[k]) ? migratedAll()[k] : []);
  const setMigrated = (k, set) => { const o = migratedAll(); o[k] = [...set]; writeJson(MIGRATED_KEY, o); };
  const readJson = key => {
    try { const o = JSON.parse(localStorage.getItem(key) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
    catch (e) { return {}; }
  };
  const writeJson = (key, o) => { try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) {} };
  function legacyMap(k) {
    if (!LEGACY[k]) return {};
    if (k !== 'symbols') return readJson(LEGACY[k]);
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(LEGACY.symbols) || '[]'); } catch (e) {}
    const o = {};
    (Array.isArray(arr) ? arr : []).forEach(s => { if (s && s.type) o[s.type] = s; });
    return o;
  }

  const st = {};
  KINDS.forEach(k => { st[k] = { data: readJson(CACHE(k)), version: null, ok: false, error: '' }; });
  let migrateAsked = false;

  function refreshViews() {
    if (typeof refreshFrameTplSel === 'function') { try { refreshFrameTplSel(); } catch (e) {} }
    if (typeof refreshTitleBlockSel === 'function') { try { refreshTitleBlockSel(); } catch (e) {} }
    if (typeof rebuildSymbolPalette === 'function') { try { rebuildSymbolPalette(); } catch (e) { console.error('[library] シンボル一覧でエラー:', e); } }
    if (typeof renderPartsTable2 === 'function') { try { renderPartsTable2(); } catch (e) {} }   // ★よく使う(段階4)
    if (typeof draw === 'function') { try { draw(); } catch (e) { console.error('[library] 再描画でエラー:', e); } }
  }

  async function loadKind(k) {
    try {
      const r = await (await fetch('/api/library/' + k)).json();
      if (r && r.ok) {
        st[k] = { data: r.data || {}, version: r.version || '', ok: true, error: '' };
        writeJson(CACHE(k), st[k].data);
      } else {
        st[k].ok = false; st[k].version = null; st[k].error = (r && r.error) || '読めませんでした';
      }
    } catch (e) {
      st[k].ok = false; st[k].version = null; st[k].error = 'ローカルサーバーに接続できません';
    }
  }

  // ライブラリから読み直す。部品DBが読めたとき(js/parts_db.js)と、保存が conflict になったときに呼ぶ
  async function load() {
    await Promise.all(KINDS.map(loadKind));
    refreshViews();
    offerMigration();
    // 【2026-10-05】ここで図面と登録シンボルを比べて窓を出すのはやめた(js/sym_store.js symCompareDialog の説明)。
    // 登録シンボルが読めたら図面は登録シンボルで描くので、端子の位置が変わった記号だけ知らせる
    if (typeof symMovedNotice === 'function') { try { symMovedNotice(state.drawingSymbols); } catch (e) { console.error(e); } }
  }

  // 保存。戻り値 {ok, error}
  async function save(k, data) {
    if (!st[k].ok) {
      return { ok: false, error: `ライブラリに保存できません（${st[k].error || '部品DBの場所(ライブラリフォルダ)が未設定か、見つかりません'}）。設定タブの「部品DB」でライブラリフォルダを設定してください` };
    }
    let r;
    try {
      r = await (await fetch('/api/library/' + k, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, version: st[k].version }) })).json();
    } catch (e) {
      return { ok: false, error: 'ローカルサーバーに接続できません（start.bat が動いているか確認してください）' };
    }
    if (r && r.ok) {
      st[k] = { data, version: r.version || '', ok: true, error: '' };
      writeJson(CACHE(k), data);
      refreshViews();
      return { ok: true };
    }
    if (r && r.reason === 'conflict') { await loadKind(k); refreshViews(); }
    return { ok: false, error: (r && r.error) || '保存できませんでした' };
  }

  // ブラウザに残っている旧データ(旧キー)のうち、ライブラリに無いものを移すか聞く。1回の表示で1度だけ。
  // 「今後聞かない」を選んだら聞かない(旧キーには今後書かないので、増えることは無い)。
  function offerMigration() {
    if (migrateAsked || typeof document === 'undefined' || !document.body) return;
    if (!KINDS.every(k => st[k].ok)) return;
    let skip = false;
    try { skip = localStorage.getItem(SKIP_KEY) === '1'; } catch (e) {}
    if (skip) return;
    const missing = {};
    KINDS.forEach(k => {
      const legacy = legacyMap(k);
      const done = migrated(k);
      missing[k] = Object.keys(legacy).filter(key => !(key in st[k].data) && !done.has(key)).map(key => [key, legacy[key]]);
    });
    const total = KINDS.reduce((n, k) => n + missing[k].length, 0);
    if (!total) return;
    migrateAsked = true;
    const ov = document.createElement('div');
    ov.id = 'lib-migrate';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100001;display:flex;align-items:center;justify-content:center';
    const list = KINDS.filter(k => missing[k].length).map(k =>
      `<div>・${LABEL[k]} ${missing[k].length}件: ${missing[k].map(([key, v]) => escH((v && v.label) || key)).join('、')}</div>`).join('');
    ov.innerHTML = '<div style="background:var(--bg2,#2a2a2a);color:var(--fg,#ddd);border:1px solid var(--bd2,#444);border-radius:6px;'
      + 'box-shadow:0 4px 20px rgba(0,0,0,.5);padding:14px 16px;max-width:600px;font-size:12px;line-height:1.6">'
      + '<div style="font-size:14px;font-weight:600;margin-bottom:6px">ライブラリへ移しますか？</div>'
      + '<div>このブラウザの中だけに残っていて、ライブラリフォルダに無いものがあります。移すと別のPCでも使え、保存のたびにバックアップされます。</div>'
      + `<div style="margin:8px 0">${list}</div>`
      + '<div style="font-size:11px;color:var(--fg3,#999)">ブラウザの中のものは消しません(移した後も残ります)。</div>'
      + '<div style="text-align:right;margin-top:10px;display:flex;gap:6px;justify-content:flex-end">'
      + '<button class="fp-btn" id="lib-migrate-never">今後聞かない</button>'
      + '<button class="fp-btn" id="lib-migrate-later">今はしない</button>'
      + '<button class="fp-btn primary" id="lib-migrate-go">移す</button></div></div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    document.getElementById('lib-migrate-later').onclick = close;
    document.getElementById('lib-migrate-never').onclick = () => { try { localStorage.setItem(SKIP_KEY, '1'); } catch (e) {} close(); };
    document.getElementById('lib-migrate-go').onclick = async () => {
      const errs = [];
      for (const k of KINDS) {
        if (!missing[k].length) continue;
        const next = Object.assign({}, st[k].data);
        missing[k].forEach(([key, v]) => { next[key] = v; });
        const r = await save(k, next);
        if (!r.ok) { errs.push(`${LABEL[k]}: ${r.error}`); continue; }
        const done = migrated(k); missing[k].forEach(([key]) => done.add(key)); setMigrated(k, done);
      }
      close();
      alert(errs.length ? '移せなかったものがあります:\n' + errs.join('\n') : `ライブラリへ移しました（${total}件）`);
    };
  }

  return {
    load,
    save,
    get: k => st[k].data,
    legacy: legacyMap,
    // 旧置き場所へ書いたので、次に読めたときにまた「移しますか？」と聞く(sym_store.js がライブラリに書けないときの退避で使う)
    resetMigrationSkip: () => { try { localStorage.removeItem(SKIP_KEY); } catch (e) {} migrateAsked = false; },
    migrated,
    // 旧置き場所に書き直したキーは、また移す対象に戻す(sym_store.js)
    unmarkMigrated: (k, keys) => { const done = migrated(k); keys.forEach(x => done.delete(x)); setMigrated(k, done); },
    isReady: k => st[k].ok,
    error: k => st[k].error,
  };
})();

if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['library.js'] = 1;
