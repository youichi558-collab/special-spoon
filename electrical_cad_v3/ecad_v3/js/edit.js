document.addEventListener('keyup', e => {
  if (e.key === 'Shift' && state._shiftOrtho) {
    state._shiftOrtho = false;
    state.ortho = false;
    document.getElementById('rb-ortho')?.classList.remove('on');
  }
});

// ================================================================
// edit.js — Undo/Redo・保存・読込・クリップボード・ショートカット
// ================================================================

// ----------------------------------------------------------------
// Undo / Redo
// ----------------------------------------------------------------
function pushH() {
  const snap = {
    pages:      JSON.parse(JSON.stringify(state.pages)),
    currentPage:state.currentPage,
  };
  state.hist.push(snap);
  if (state.hist.length > 80) state.hist.shift();
  state.redoHist = [];
  // 現在ページを未保存マーク
  state.pages[state.currentPage].dirty = true;
  renderPageTabs();
  // 自動保存（デバウンス：変更確定の1.5秒後にlocalStorageへ）
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function undo() {
  if (!state.hist.length) return;
  const snap = state.hist.pop();
  state.redoHist.push({
    pages:      JSON.parse(JSON.stringify(state.pages)),
    currentPage:state.currentPage,
  });
  state.pages       = snap.pages;
  state.currentPage = snap.currentPage;
  state.sel.els.clear(); state.sel.wires.clear();
  renderPageTabs(); draw(); updateRightPanel();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

function redo() {
  if (!state.redoHist.length) return;
  const snap = state.redoHist.pop();
  state.hist.push({
    pages:      JSON.parse(JSON.stringify(state.pages)),
    currentPage:state.currentPage,
  });
  state.pages       = snap.pages;
  state.currentPage = snap.currentPage;
  state.sel.els.clear(); state.sel.wires.clear();
  renderPageTabs(); draw(); updateRightPanel();
  if (typeof scheduleAutosave === 'function') scheduleAutosave();
}

// ----------------------------------------------------------------
// 保存・読込
// ----------------------------------------------------------------
function _syncCurrentPage() {
  const p = state.page;
  p.elements = state.elements;
  p.wires    = state.wires;
  p.frameObj = state.frameObj;
}

// 図面ファイルに埋め込まれたcustomParts読込時の扱い。
// 外部部品DBファイルが設定済みの場合、d.customPartsが空/未定義なら現状(外部DB由来)を維持し、
// データがある場合はref重複を避けてマージする（読込のたびに外部DBを上書きしない）。
function _mergeOrSetCustomParts(dParts) {
  if (!dParts || !dParts.length) return; // 何もしない＝現状維持
  if (typeof partsDb !== 'undefined' && partsDb.hasFile()) {
    dParts.forEach(p => { if (!state.customParts.find(cp => cp.ref === p.ref)) state.customParts.push(p); });
  } else {
    state.customParts = dParts;
  }
}

// hiddenBuiltinRefs版（customPartsと同じ考え方: 外部DB使用時はマージ、未使用時は上書き）
function _mergeOrSetHiddenBuiltinRefs(dRefs) {
  if (!dRefs || !dRefs.length) return;
  if (typeof partsDb !== 'undefined' && partsDb.hasFile()) {
    state.hiddenBuiltinRefs = state.hiddenBuiltinRefs || [];
    dRefs.forEach(ref => { if (!state.hiddenBuiltinRefs.includes(ref)) state.hiddenBuiltinRefs.push(ref); });
  } else {
    state.hiddenBuiltinRefs = dRefs;
  }
}

// 旧バージョンのファイルに残っている個別色(el.color / wire.color)を取り除く。
// 色はレイヤーで決まる方式(完全BYLAYER, 62c94f0〜)に統一済みで、描画・DXF出力・
// PDF出力のいずれもこのフィールドを読んでいないため、残っていても表示には影響しない。
// ただしファイル内に意味のないデータが残り続けるので、読み込み時にここで掃除する。
//
// 以前は loadProject() の中だけでこの処理をしており、自動保存からの復元
// (restoreAutosave)には無かったため、「ファイル読込では消えるがリロードでは残る」
// という食い違いが起きていた。2026-08-16に共通関数へ切り出して両方から呼ぶようにした。
// junction も画面ではレイヤー色で描かれるため、以前あった junction の除外はやめた。
function stripLegacyColors(pages) {
  (pages || []).forEach(pg => {
    (pg.elements || []).forEach(el => { delete el.color; });
    (pg.wires    || []).forEach(w  => { delete w.color;  });
  });
}

// レイヤー名が空・未定義・LAYERSに無い名前になっている要素を修復する。
//
// レイヤーが引けないと描画色が fgC()(ダークで#ccc=ほぼ白)になり、
// 「図面の一か所だけ白く壊れる」という症状になる。原因は、プロパティパネルに
// レイヤー欄が無い状態で適用処理が走ると v('pp-layer') が '' を返し、
// el.layer を空で上書きしていたこと(適用側は修正済み)。
// 既に壊れた図面を読み込んだときのために、ここで拾って既定レイヤーへ戻す。
// 戻した件数を返す。
function repairLayers(pages) {
  const names = new Set((typeof LAYERS !== 'undefined' ? LAYERS : []).map(l => l.name));
  const fallback = (typeof LAYERS !== 'undefined' && LAYERS.length) ? LAYERS[0].name : '';
  if (!fallback) return 0;
  let n = 0;
  (pages || []).forEach(pg => {
    const fix = o => {
      if (!o.layer || !names.has(o.layer)) { o.layer = fallback; n++; }
    };
    (pg.elements || []).forEach(fix);
    (pg.wires    || []).forEach(fix);
  });
  return n;
}

// 図面ファイル内で重複してしまっている要素ID・配線IDを検出し、後から出てきた方に
// 新しいIDを振り直す。
//
// 旧 genId() は同じミリ秒内に大量生成すると高確率でIDが重複していた（state.jsの
// コメント参照）。IDが重複すると、選択・移動・削除がどれも id 照合で対象を集めて
// いるため、1個だけ操作したつもりが図面の別の場所にある図形まで巻き込まれる。
// genId()側は修正済みだが、それ以前に作られた図面には既に重複が埋まっている
// 可能性があるため、読み込み時にここで修復する。
//
// グループ(groups)は elIds / wireIds で要素IDを参照しているので、振り直しに
// あわせてこちらも更新する。これを忘れると、グループから図形が抜け落ちる。
// IDは内部的な識別子で画面には出ないため、振り直しても図面の見た目は変わらない。
function dedupeIds(pages) {
  const seenEl = new Set();
  const seenWire = new Set();
  let fixed = 0;

  (pages || []).forEach(pg => {
    const remap = {};      // 旧ID → 新ID（このページのグループ参照を直すため）
    const remapWire = {};

    (pg.elements || []).forEach(el => {
      if (!el.id) { el.id = genId('el'); fixed++; return; }
      if (seenEl.has(el.id)) {
        const newId = genId('el');
        remap[el.id] = newId;
        el.id = newId;
        fixed++;
      }
      seenEl.add(el.id);
    });

    (pg.wires || []).forEach(w => {
      if (!w.id) { w.id = genId('w'); fixed++; return; }
      if (seenWire.has(w.id)) {
        const newId = genId('w');
        remapWire[w.id] = newId;
        w.id = newId;
        fixed++;
      }
      seenWire.add(w.id);
    });

    // グループの参照を追随させる。
    // 注意: 同一ページ内で同じ旧IDが3個以上重複していた場合、remapは最後の1件しか
    // 覚えていない。ただしその状況では元々どの要素を指していたか判別不可能なので、
    // グループには最初の1個が残る形になる（実害は「グループから漏れる」程度）。
    (pg.groups || []).forEach(g => {
      if (g.elIds)   g.elIds   = g.elIds.map(id => remap[id] || id);
      if (g.wireIds) g.wireIds = g.wireIds.map(id => remapWire[id] || id);
    });
  });

  if (fixed > 0) {
    console.warn(`[dedupeIds] 重複していたIDを ${fixed} 件修復しました。`
      + `図形が勝手に一緒に動く・消えるといった不具合の原因になっていた可能性があります。`);
  }
  return fixed;
}

function _pageFileName(pg, idx) {
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = (pg.name || ('Sheet'+(idx+1))).replace(/[\\/:*?"<>|]/g, '_');
  return `${base}_${name}`;
}

function saveProject() {
  // 現在ページのみ保存
  _syncCurrentPage();
  const pg = state.pages[state.currentPage];
  const defaultName = _pageFileName(pg, state.currentPage);
  const name = prompt('保存ファイル名を入力してください', defaultName);
  if (name === null) return; // キャンセル
  const fname = (name.trim() || defaultName).replace(/[\\/:*?"<>|]/g, '_');
  // saveFileNameを更新
  state.saveFileName = fname.replace(/_[^_]+$/, ''); // ページ名部分を除いた部分を保存
  const data = {
    version: 2,
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    // 部品DBが外部ファイルで管理されている場合は図面ファイルに埋め込まない（シンボルライブラリと同様、分離管理）
    customParts:   (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.customParts,
    hiddenBuiltinRefs: (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.hiddenBuiltinRefs,
    wireNoRule:    state.wireNoRule,
    layers:        LAYERS,
    pages: [pg],
  };
  // 書き出す「前」にdirtyを落とすこと。あとで落とすと data.pages が同じオブジェクトを
  // 参照しているため、保存ファイルに dirty:true が焼き込まれてしまう。
  // その状態で読み込むと、開いた直後なのにシートタブへ未保存マーク(●)が出る。
  pg.dirty = false;
  dl(JSON.stringify(data, null, 2), fname + '.json', 'application/json');
  renderPageTabs();
}

function saveAllProject() {
  // 全ページまとめて保存
  _syncCurrentPage();
  const defaultBase = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = prompt('保存ファイル名を入力してください', defaultBase);
  if (name === null) return; // キャンセル
  const base = (name.trim() || defaultBase).replace(/[\\/:*?"<>|]/g, '_');
  state.saveFileName = base;
  const data = {
    version: 2,
    saveFileName: state.saveFileName,
    customSymbols: state.customSymbols,
    customParts:   (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.customParts,
    hiddenBuiltinRefs: (typeof partsDb !== 'undefined' && partsDb.hasFile()) ? undefined : state.hiddenBuiltinRefs,
    wireNoRule:    state.wireNoRule,
    layers:        LAYERS,
    pages: state.pages,
  };
  // 書き出す「前」にdirtyを落とす（理由はsaveProject()のコメント参照）
  state.pages.forEach(p => p.dirty = false);
  dl(JSON.stringify(data, null, 2), base + '_all.json', 'application/json');
  renderPageTabs();
}

function loadProject(input) {
  const f = input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      pushH();

      // バージョン別マイグレーション
      if (d.version === 2) {
        state.pages        = d.pages || [{ name:'Sheet1', elements:[], wires:[], groups:[], guides:[], frameObj:null }];
        state.wireNoRule   = d.wireNoRule || state.wireNoRule;
        state.customSymbols= d.customSymbols || [];
        _mergeOrSetCustomParts(d.customParts);
        _mergeOrSetHiddenBuiltinRefs(d.hiddenBuiltinRefs);
        // 旧フォーマット互換：トップレベルのguides → page[0].guides に移行
        if (d.guides && d.guides.length) state.pages[0].guides = d.guides;
        // 各ページにguidesがなければ初期化
        state.pages.forEach(pg => { if (!pg.guides) pg.guides = []; });
        if (d.layers && d.layers.length) { LAYERS.length = 0; d.layers.forEach(l => LAYERS.push(l)); }
      } else {
        // v1以前（旧形式）からのマイグレーション
        const pages = d.pages || [{ name:'Sheet1', elements: d.elements||[], wires: d.wires||[], frameObj: d.frameObj||null }];
        // groupsをpages内に移動・idを付与
        state.pages = pages.map(pg => ({
          ...pg,
          groups: [],
          elements: (pg.elements||[]).map(el => el.id ? el : { ...el, id: genId('el') }),
          wires:    (pg.wires||[]).map(w  => w.id  ? w  : { ...w,  id: genId('w'), wireNoAuto: true }),
        }));
        state.customSymbols = d.customSymbols || [];
        _mergeOrSetCustomParts(d.customParts);
        _mergeOrSetHiddenBuiltinRefs(d.hiddenBuiltinRefs);
      }

      state.currentPage = 0;
      state.customSymbols.forEach(s => { DEFS[s.type] = s; });
      state.saveFileName = d.saveFileName || '';
      state.sel.els.clear(); state.sel.wires.clear();
      stripLegacyColors(state.pages);
      const fixedLayers = repairLayers(state.pages);
      if (fixedLayers) console.log(`レイヤーが失われた要素を${fixedLayers}件修復しました`);
      const fixedIds = dedupeIds(state.pages);
      state.pages.forEach(pg => pruneGroups(pg));
      // 読み込んだ直後は「保存済みの状態」なので未保存マークを消す。
      // 上の修正以前に保存されたファイルには dirty:true が焼き込まれているため、
      // ここでも落としておかないと開いた瞬間に●が出たままになる。
      state.pages.forEach(pg => { pg.dirty = false; });
      renderSymFloat(); renderPartsAll(); renderPageTabs(); draw(); updateRightPanel();
      if (typeof partsDb !== 'undefined') partsDb.scheduleSave();
      alert(fixedIds > 0
        ? `読込完了\n\n重複していた図形IDを ${fixedIds} 件修復しました。\n`
          + `(このファイルは、図形が勝手に一緒に動く・消える不具合が起きうる状態でした)\n`
          + `上書き保存すると修復後の状態になります。`
        : '読込完了');
    } catch(err) {
      alert('読込失敗: ' + err.message);
    }
  };
  rd.readAsText(f);
  input.value = '';
}

function dl(text, fname, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ----------------------------------------------------------------
// クリップボード
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// 共通移動関数
// ----------------------------------------------------------------
// グリッド近傍の座標だけスナップ（許容誤差以内のズレのみ修正）
// 手順: ①ズレの集計を表示して確認 → ②実行 → ③結果報告＋補正箇所をオレンジで数秒ハイライト
// (「押しても動いたのか・合っているのか分からない」という声への対応。
//  全件一括処理は 集計→確認→実行 の順にするという過去の教訓にも沿う)
function snapNearGrid(tolerance) {
  // 許容誤差未指定 → ダイアログで入力
  if (tolerance == null) {
    const val = prompt(
      `グリッドから何以内の座標をスナップしますか？\n（現在のグリッド間隔: ${state.G}）`,
      String(state.G / 2));
    if (val == null) return;
    tolerance = parseFloat(val);
    if (isNaN(tolerance) || tolerance <= 0) return;
  }

  // 最寄りグリッドとのズレ量
  const dev = v => Math.abs(Math.round(v / state.G) * state.G - v);
  // 許容誤差内ならスナップ、そうでなければそのまま
  const sn = v => {
    const snapped = Math.round(v / state.G) * state.G;
    return Math.abs(snapped - v) <= tolerance ? snapped : v;
  };

  // 何か選択されている場合は選択物のみ、無選択なら全体を対象にする
  // (旧: els/wiresを別々に判定していたため、シンボルだけ選択しても全配線が動いていた)
  const hasSel = state.sel.els.size > 0 || state.sel.wires.size > 0;
  const targets = hasSel
    ? state.elements.filter(e => state.sel.els.has(e.id))
    : state.elements;
  const wTargets = hasSel
    ? state.wires.filter(w => state.sel.wires.has(w.id))
    : state.wires;

  // ---------- ①ドライラン: 変更対象の集計（まだ何も変更しない） ----------
  // fixPts: 実際に補正される座標点(ハイライト用)。maxDev: 全ズレの最大値(誤差ゼロの座標は除外)
  const stat = { fixEls: 0, fixWires: 0, offEls: 0, offWires: 0, maxDev: 0, fixPts: [] };
  const KEYS = ['x','y','x1','y1','x2','y2','x3','y3','cx','cy','bx','by'];
  const EPS = 1e-9;

  // 要素/配線1個ぶんの座標を走査し「ズレあり」「許容内で補正される」を判定
  const scanObj = (o) => {
    let off = false, fix = false, beyond = false;
    const pushPt = (xk, yk) => {
      // ハイライト用の代表点。x/yペアが揃っている座標のみ点として記録
      if (o[xk] != null && o[yk] != null) stat.fixPts.push({ x: sn(o[xk]), y: sn(o[yk]) });
    };
    for (const k of KEYS) {
      if (o[k] == null) continue;
      const d = dev(o[k]);
      if (d > EPS) {
        off = true;
        stat.maxDev = Math.max(stat.maxDev, d);
        if (d <= tolerance) fix = true; else beyond = true;
      }
    }
    if (o.pts) for (const p of o.pts) {
      for (const v of [p.x, p.y]) {
        const d = dev(v);
        if (d > EPS) {
          off = true;
          stat.maxDev = Math.max(stat.maxDev, d);
          if (d <= tolerance) fix = true; else beyond = true;
        }
      }
    }
    if (fix) {
      // 代表点(ハイライト位置): 基準点があればそこ、無ければ端点、pts先頭
      if (o.x != null && o.y != null) pushPt('x','y');
      else if (o.x1 != null && o.y1 != null) pushPt('x1','y1');
      else if (o.pts && o.pts[0]) stat.fixPts.push({ x: sn(o.pts[0].x), y: sn(o.pts[0].y) });
    }
    return { off, fix, beyond };
  };

  targets.forEach(el => {
    const r = scanObj(el);
    if (r.off) stat.offEls++;
    if (r.fix) stat.fixEls++;
    if (r.beyond) stat.beyondEls = (stat.beyondEls||0) + 1;
  });
  wTargets.forEach(w => {
    const r = scanObj(w);
    if (r.off) stat.offWires++;
    if (r.fix) stat.fixWires++;
    if (r.beyond) stat.beyondWires = (stat.beyondWires||0) + 1;
  });

  const scope = hasSel ? '選択中' : '図面全体';
  const fixTotal = stat.fixEls + stat.fixWires;
  const offTotal = stat.offEls + stat.offWires;

  if (offTotal === 0) {
    alert(`【${scope}】グリッドからズレている座標はありません。すべて整列済みです。`);
    return;
  }
  if (fixTotal === 0) {
    alert(
      `【${scope}】ズレあり: 図形${stat.offEls}個・配線${stat.offWires}本\n` +
      `最大ズレ量: ${stat.maxDev.toFixed(2)}\n\n` +
      `許容誤差 ${tolerance} 以内のものが無いため、何も補正されません。\n` +
      `許容誤差を大きくして(例: ${Math.min(Math.ceil(stat.maxDev), state.G/2)})再実行してください。`);
    return;
  }
  const ok = confirm(
    `【${scope}】グリッドからのズレ: 図形${stat.offEls}個・配線${stat.offWires}本` +
    `（最大ズレ量 ${stat.maxDev.toFixed(2)}）\n\n` +
    `このうち許容誤差 ${tolerance} 以内の 図形${stat.fixEls}個・配線${stat.fixWires}本 を\n` +
    `最寄りのグリッドに乗せます。よろしいですか？\n（実行後はCtrl+Zで戻せます）`);
  if (!ok) return;

  // ---------- ②実行 ----------
  const snP = (o, k) => { if (o[k] != null) o[k] = sn(o[k]); };
  pushH();
  targets.forEach(el => {
    snP(el,'x'); snP(el,'y');
    snP(el,'x1'); snP(el,'y1');
    snP(el,'x2'); snP(el,'y2');
    snP(el,'x3'); snP(el,'y3');
    snP(el,'cx'); snP(el,'cy');
    snP(el,'bx'); snP(el,'by');
    if (el.pts) {
      el.pts = el.pts.map(p => ({ x: sn(p.x), y: sn(p.y) }));
      el.x1 = el.pts[0]?.x; el.y1 = el.pts[0]?.y;
      el.x2 = el.pts[el.pts.length-1]?.x; el.y2 = el.pts[el.pts.length-1]?.y;
    }
  });
  wTargets.forEach(w => {
    if (w.pts) {
      w.pts = w.pts.map(p => ({ x: sn(p.x), y: sn(p.y) }));
      w.x1 = w.pts[0]?.x; w.y1 = w.pts[0]?.y;
      w.x2 = w.pts[w.pts.length-1]?.x; w.y2 = w.pts[w.pts.length-1]?.y;
    } else {
      snP(w,'x1'); snP(w,'y1'); snP(w,'x2'); snP(w,'y2');
    }
  });

  // ---------- ③結果報告＋補正箇所を数秒ハイライト ----------
  state.snapFlash = { pts: stat.fixPts, t0: Date.now() };
  const anim = () => {
    if (!state.snapFlash) return;
    if (Date.now() - state.snapFlash.t0 > 3000) { state.snapFlash = null; draw(); return; }
    draw();
    requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);

  draw(); updateRightPanel();
  alert(
    `図形${stat.fixEls}個・配線${stat.fixWires}本 をグリッドに乗せました。\n` +
    `補正した箇所をオレンジ色で数秒間表示します。\n（Ctrl+Zで元に戻せます）` +
    ((stat.beyondEls || stat.beyondWires)
      ? `\n\n※許容誤差を超えるズレが 図形${stat.beyondEls||0}個・配線${stat.beyondWires||0}本 に残っています。`
      : ''));
}

// 独立テキストの「揃え」機能（AutoCAD TEXTALIGNに準拠した方式）
// 選択したテキストのうち、最初に選んだもの(=Set挿入順の先頭)を基準にし、
// 左揃え/右揃え/上揃え/下揃え/中央揃え(横)/中央揃え(縦)のいずれかで他のテキストを移動する。
// 手順: ①基準・対象数を確認 → ②揃え方向を選択 → ③実行(Undo対応)＋結果を数秒ハイライト
function alignTexts() {
  const texts = state.elements.filter(el => state.sel.els.has(el.id) && el.type === 'text');
  if (texts.length < 2) {
    alert('テキストを2つ以上選択してください（独立テキストのみが対象です）。\n最初に選んだテキストが基準になります。');
    return;
  }
  // 選択順(Set挿入順)の先頭を基準とする
  const selOrder = [...state.sel.els];
  const refId = selOrder.find(id => texts.some(t => t.id === id));
  const ref = texts.find(t => t.id === refId) || texts[0];

  const refPreview = (ref.text || '').split('\n')[0].slice(0, 20) || '(空)';
  const mode = prompt(
    `基準テキスト: 「${refPreview}」\n対象: 他${texts.length - 1}個\n\n` +
    `揃え方向を番号で入力してください:\n` +
    `1: 左揃え\n2: 右揃え\n3: 上揃え\n4: 下揃え\n5: 中央揃え(横)\n6: 中央揃え(縦)`,
    '1');
  if (mode == null) return;
  const modeNum = parseInt(mode, 10);
  if (![1, 2, 3, 4, 5, 6].includes(modeNum)) { alert('1〜6の番号を入力してください。'); return; }

  // テキストのバウンディングボックスを計算（drawTextEl()と同じロジック）
  const bbox = (el) => {
    const fs = el.fs || 14;
    ctx.font = `${fs}px sans-serif`;
    const lines = (el.text || '').split('\n');
    const lineH = fs * 1.4;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width));
    const top = el.y - fs * 0.85;
    const bottom = top + lines.length * lineH + (el.textBoxPad ?? 4) * 0.5;
    return { left: el.x, right: el.x + w, top, bottom, centerX: el.x + w / 2, centerY: (top + bottom) / 2 };
  };

  const refB = bbox(ref);
  const targets = texts.filter(t => t.id !== ref.id);

  const modeLabel = { 1: '左揃え', 2: '右揃え', 3: '上揃え', 4: '下揃え', 5: '中央揃え(横)', 6: '中央揃え(縦)' }[modeNum];
  const ok = confirm(
    `${targets.length}個のテキストを基準「${refPreview}」に${modeLabel}します。\nよろしいですか？（実行後はCtrl+Zで戻せます）`);
  if (!ok) return;

  pushH();
  const fixPts = [];
  targets.forEach(t => {
    const b = bbox(t);
    switch (modeNum) {
      case 1: t.x += (refB.left - b.left); break;
      case 2: t.x += (refB.right - b.right); break;
      case 3: t.y += (refB.top - b.top); break;
      case 4: t.y += (refB.bottom - b.bottom); break;
      case 5: t.x += (refB.centerX - b.centerX); break;
      case 6: t.y += (refB.centerY - b.centerY); break;
    }
    fixPts.push({ x: t.x, y: t.y });
  });

  // 補正箇所を数秒間オレンジでハイライト（snapNearGridと同じ仕組み）
  state.snapFlash = { pts: fixPts, t0: Date.now() };
  const anim = () => {
    if (!state.snapFlash) return;
    if (Date.now() - state.snapFlash.t0 > 3000) { state.snapFlash = null; draw(); return; }
    draw();
    requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);

  draw(); updateRightPanel();
  alert(`${targets.length}個のテキストを${modeLabel}しました。（Ctrl+Zで元に戻せます）`);
}

function moveEntity(el, dx, dy) {
  if (el.cx != null) el.cx += dx;
  if (el.cy != null) el.cy += dy;
  if (el.x  != null) el.x  += dx;
  if (el.y  != null) el.y  += dy;
  if (el.x1 != null) el.x1 += dx;
  if (el.y1 != null) el.y1 += dy;
  if (el.x2 != null) el.x2 += dx;
  if (el.y2 != null) el.y2 += dy;
  if (el.x3 != null) el.x3 += dx;
  if (el.y3 != null) el.y3 += dy;
  if (el.bx != null) el.bx += dx;
  if (el.by != null) el.by += dy;
  if (el.pts) {
    el.pts = el.pts.map(p => ({ x: p.x+dx, y: p.y+dy }));
    el.x1 = el.pts[0]?.x; el.y1 = el.pts[0]?.y;
    el.x2 = el.pts[el.pts.length-1]?.x; el.y2 = el.pts[el.pts.length-1]?.y;
  }
}

function copySelected() {
  const els   = state.elements.filter(el => state.sel.els.has(el.id));
  const wires = state.wires.filter(w   => state.sel.wires.has(w.id));
  if (!els.length && !wires.length) return;
  // コピー元のID集合
  const elIdSet   = new Set(els.map(e => e.id));
  const wireIdSet = new Set(wires.map(w => w.id));
  // コピー元が属するグループ構造を保存（コピー範囲内のメンバーのみ）
  const groups = (state.page.groups || [])
    .map(g => ({
      elIds:   g.elIds.filter(id => elIdSet.has(id)),
      wireIds: g.wireIds.filter(id => wireIdSet.has(id)),
    }))
    .filter(g => g.elIds.length + g.wireIds.length > 0);
  state.clipboard = {
    els:   JSON.parse(JSON.stringify(els)),
    wires: JSON.parse(JSON.stringify(wires)),
    groups,
  };
}

function cutSelected() { copySelected(); delSel(); }

// クリップボード要素のBBox左上座標を返す
function clipboardOrigin() {
  const allPts = [];
  (state.clipboard?.els || []).forEach(el => {
    if (el.x  != null) allPts.push({x: el.x,  y: el.y});
    if (el.x1 != null) allPts.push({x: el.x1, y: el.y1}, {x: el.x2, y: el.y2});
  });
  (state.clipboard?.wires || []).forEach(w => (w.pts||[]).forEach(p => allPts.push(p)));
  return {
    x: allPts.length ? Math.min(...allPts.map(p=>p.x)) : 0,
    y: allPts.length ? Math.min(...allPts.map(p=>p.y)) : 0,
  };
}

// Ctrl+V → 基準点指定モードへ移行
function pasteSelected() {
  if (!state.clipboard?.els) return;
  // pasteモードに入る：1クリック目=基準点、2クリック目=貼付け先
  state.mode = 'paste';
  state.pasteStep = 'base';   // 'base' → 'dest'
  state.pasteBaseWorld = null; // 基準点（ワールド座標）
  document.getElementById('s-hint').textContent = '基準点をクリック（コピー元図形上の点を選択）  [ESC] キャンセル';
  draw();
}

// 実際に貼り付けを確定する（dx/dy = クリップボード原点からのオフセット）
function commitPaste(dx, dy) {
  pushH();
  const idMap = {};
  function offsetEl(el) {
    const ne = JSON.parse(JSON.stringify(el));
    const newId = genId('el');
    idMap[el.id] = newId;
    ne.id = newId;
    moveEntity(ne, dx, dy);
    return ne;
  }
  const newEls = state.clipboard.els.map(offsetEl);
  const newWires = state.clipboard.wires.map(w => {
    const nw = JSON.parse(JSON.stringify(w));
    const newId = genId('w');
    idMap[w.id] = newId;
    nw.id  = newId;
    nw.pts = (nw.pts||[]).map(p => ({ x: p.x+dx, y: p.y+dy }));
    nw.x1  = nw.pts[0]?.x; nw.y1 = nw.pts[0]?.y;
    nw.x2  = nw.pts[nw.pts.length-1]?.x; nw.y2 = nw.pts[nw.pts.length-1]?.y;
    return nw;
  });
  state.elements.push(...newEls);
  state.wires.push(...newWires);
  state.page.groups = state.page.groups || [];
  (state.clipboard.groups || []).forEach(g => {
    const elIds   = g.elIds.map(id => idMap[id]).filter(Boolean);
    const wireIds = g.wireIds.map(id => idMap[id]).filter(Boolean);
    if (elIds.length + wireIds.length > 0) {
      state.page.groups.push({ id: genId('g'), elIds, wireIds });
    }
  });
  state.sel.els.clear(); state.sel.wires.clear();
  newEls.forEach(el => state.sel.els.add(el.id));
  newWires.forEach(w  => state.sel.wires.add(w.id));
  // pasteモード終了
  state.mode = 'select';
  state.pasteStep = null;
  state.pasteBaseWorld = null;
  state.preview = null;
  document.getElementById('s-hint').textContent = '';
  draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// 削除・選択
// ----------------------------------------------------------------
function delSel() {
  if (!state.sel.els.size && !state.sel.wires.size) return;
  pushH();
  state.page.elements = state.elements.filter(e => !state.sel.els.has(e.id));
  state.page.wires    = state.wires.filter(w    => !state.sel.wires.has(w.id));
  // 消した要素をグループの参照からも取り除く。これをやらないと groups に
  // 存在しない要素のIDが残り続け(幽霊参照)、ファイルに不要なデータが溜まる。
  // 中身が空になったグループはグループごと削除する。
  pruneGroups(state.page);
  state.sel.els.clear(); state.sel.wires.clear();
  draw(); updateRightPanel();
}

// グループ(groups)が持つ要素ID・配線IDのうち、実際にはもう存在しないものを取り除く。
// 中身が空になったグループはグループごと捨てる。
// 要素を削除する処理の後に呼ぶこと。
function pruneGroups(pg) {
  if (!pg || !pg.groups || !pg.groups.length) return 0;
  const elIdSet   = new Set((pg.elements || []).map(e => e.id));
  const wireIdSet = new Set((pg.wires    || []).map(w => w.id));
  const before = pg.groups.length;
  pg.groups = pg.groups
    .map(g => ({
      ...g,
      elIds:   (g.elIds   || []).filter(id => elIdSet.has(id)),
      wireIds: (g.wireIds || []).filter(id => wireIdSet.has(id)),
    }))
    // 1個だけになったグループも意味を成さないので捨てる
    .filter(g => g.elIds.length + g.wireIds.length >= 2);
  return before - pg.groups.length;
}

function selectAll() {
  state.elements.forEach(el => state.sel.els.add(el.id));
  state.wires.forEach(w    => state.sel.wires.add(w.id));
  draw(); updateRightPanel();
}

function clearAll() {
  if (!confirm('全て消去しますか？')) return;
  pushH();
  state.page.elements = [];
  state.page.wires    = [];
  state.sel.els.clear(); state.sel.wires.clear();
  state.wirePoints = []; state.preview = null;
  draw(); updateRightPanel();
}

// 図面ファイル全体を白紙の状態にする（自動保存されていた前回の作業も破棄する）
// clearAll()は「現在ページの中身」だけを消すのに対し、こちらはページ構成・
// ファイル名・履歴・自動保存データまで含めて完全に新規状態へリセットする。
function newProject() {
  if (!confirm('新規作成します。保存していない変更（自動保存されたものも含む）は失われます。よろしいですか？')) return;

  state.pages = [{ name: 'Sheet1', elements: [], wires: [], groups: [], guides: [], frameObj: null }];
  state.currentPage = 0;
  state.saveFileName = '';
  state.sel.els.clear(); state.sel.wires.clear();
  state.wirePoints = []; state.preview = null;
  state.hist = []; state.redoHist = [];

  // localStorageの自動保存データも消す。これをしないと次回リロード時に
  // また元の図面が復元されてしまい「新規作成」の意味がなくなるため。
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}

  renderPageTabs(); draw(); updateRightPanel();
  const h = document.getElementById('s-hint');
  if (h) h.textContent = '新規図面を作成しました';
}

// ----------------------------------------------------------------
// 変形
// ----------------------------------------------------------------
function rotateSel(deg) {
  const targets   = state.elements.filter(el => state.sel.els.has(el.id));
  const wireTargets = state.wires.filter(w => state.sel.wires.has(w.id));
  if (!targets.length && !wireTargets.length) return;
  pushH();

  // 単体シンボル選択（ワイヤーなし）→ 従来通り位置移動なし
  if (targets.length === 1 && !wireTargets.length) {
    const el = targets[0];
    const noRotTypes = ['text','rect','circle','fline'];
    if (!noRotTypes.includes(el.type)) el.rot = ((el.rot||0) + deg) % 360;
    draw(); updateRightPanel();
    return;
  }

  // グループ回転 ─ 選択全体のバウンディングボックス中心を軸に回転
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  // 全座標点を収集してバウンディングボックス中心を求める
  const allPts = [];
  function addPt(x, y) { if (x != null && y != null) allPts.push({x, y}); }
  targets.forEach(el => {
    addPt(el.x,  el.y);
    addPt(el.x1, el.y1);
    addPt(el.x2, el.y2);
    addPt(el.x3, el.y3);
    addPt(el.cx, el.cy);
    addPt(el.bx, el.by);
    if (el.w != null) addPt(el.x + el.w, el.y + (el.h||0));
    if (el.r  != null) {
      addPt(el.x + el.r, el.y); addPt(el.x - el.r, el.y);
      addPt(el.x, el.y + el.r); addPt(el.x, el.y - el.r);
    }
    if (el.pts) el.pts.forEach(p => addPt(p.x, p.y));
  });
  wireTargets.forEach(w => { if (w.pts) w.pts.forEach(p => addPt(p.x, p.y)); });

  if (!allPts.length) return;
  const minX = Math.min(...allPts.map(p => p.x));
  const maxX = Math.max(...allPts.map(p => p.x));
  const minY = Math.min(...allPts.map(p => p.y));
  const maxY = Math.max(...allPts.map(p => p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // 点を中心回りに回転（浮動小数点誤差を丸める）
  function rotPt(x, y) {
    const dx = x - cx, dy = y - cy;
    const rx = cx + dx*cos - dy*sin;
    const ry = cy + dx*sin + dy*cos;
    return { x: Math.round(rx * 1000) / 1000, y: Math.round(ry * 1000) / 1000 };
  }

  // 各要素を回転
  targets.forEach(el => {
    if (el.type === 'rect') {
      // 4コーナーを回転してAABBを再計算
      const corners = [
        rotPt(el.x,       el.y),
        rotPt(el.x+el.w,  el.y),
        rotPt(el.x,       el.y+el.h),
        rotPt(el.x+el.w,  el.y+el.h)
      ];
      el.x = Math.min(...corners.map(c=>c.x));
      el.y = Math.min(...corners.map(c=>c.y));
      el.w = Math.max(...corners.map(c=>c.x)) - el.x;
      el.h = Math.max(...corners.map(c=>c.y)) - el.y;
    } else if (el.type === 'arc') {
      const p = rotPt(el.x, el.y);
      el.x = p.x; el.y = p.y;
      el.startA = (el.startA||0) + rad;
      el.endA   = (el.endA  ||0) + rad;
    } else {
      // 全座標を個別に回転
      if (el.x  != null) { const p=rotPt(el.x,  el.y);  el.x=p.x;  el.y=p.y;  }
      if (el.x1 != null) { const p=rotPt(el.x1, el.y1); el.x1=p.x; el.y1=p.y; }
      if (el.x2 != null) { const p=rotPt(el.x2, el.y2); el.x2=p.x; el.y2=p.y; }
      if (el.x3 != null) { const p=rotPt(el.x3, el.y3); el.x3=p.x; el.y3=p.y; }
      if (el.cx != null) { const p=rotPt(el.cx, el.cy); el.cx=p.x; el.cy=p.y; }
      if (el.bx != null) { const p=rotPt(el.bx, el.by); el.bx=p.x; el.by=p.y; }
      if (el.pts) {
        el.pts = el.pts.map(p => rotPt(p.x, p.y));
        el.x1 = el.pts[0]?.x; el.y1 = el.pts[0]?.y;
        el.x2 = el.pts[el.pts.length-1]?.x; el.y2 = el.pts[el.pts.length-1]?.y;
      }
      // シンボル系はrot（個別向き）も更新
      const noRotTypes = ['text','rect','circle','fline','triangle','dim','angle_dim','leader','bezier','junction'];
      if (!noRotTypes.includes(el.type)) el.rot = ((el.rot||0) + deg) % 360;
    }
  });

  // ワイヤーを回転
  wireTargets.forEach(w => {
    if (w.pts) {
      w.pts = w.pts.map(p => rotPt(p.x, p.y));
      w.x1 = w.pts[0]?.x; w.y1 = w.pts[0]?.y;
      w.x2 = w.pts[w.pts.length-1]?.x; w.y2 = w.pts[w.pts.length-1]?.y;
    }
  });

  draw(); updateRightPanel();
}

// ── 選択の複製(ID再付与・グループ複製・平行移動)。commitPasteと同じ流儀 ──
// 複製した配線のwireNoは新回路のためクリアする(重複線番の防止)
function duplicateSelection(dx, dy) {
  const els   = state.elements.filter(el => state.sel.els.has(el.id));
  const wires = state.wires.filter(w   => state.sel.wires.has(w.id));
  if (!els.length && !wires.length) return null;
  const elIdSet   = new Set(els.map(e => e.id));
  const wireIdSet = new Set(wires.map(w => w.id));
  const groups = (state.page.groups || [])
    .map(g => ({ elIds: g.elIds.filter(id => elIdSet.has(id)), wireIds: g.wireIds.filter(id => wireIdSet.has(id)) }))
    .filter(g => g.elIds.length + g.wireIds.length > 0);
  const idMap = {};
  const newEls = els.map(el => {
    const ne = JSON.parse(JSON.stringify(el));
    idMap[el.id] = ne.id = genId('el');
    moveEntity(ne, dx, dy);
    return ne;
  });
  const newWires = wires.map(w => {
    const nw = JSON.parse(JSON.stringify(w));
    idMap[w.id] = nw.id = genId('w');
    nw.pts = (nw.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).map(p => ({ x: p.x+dx, y: p.y+dy }));
    nw.x1 = nw.pts[0].x; nw.y1 = nw.pts[0].y;
    nw.x2 = nw.pts[nw.pts.length-1].x; nw.y2 = nw.pts[nw.pts.length-1].y;
    nw.wireNo = '';
    return nw;
  });
  state.elements.push(...newEls);
  state.wires.push(...newWires);
  state.page.groups = state.page.groups || [];
  groups.forEach(g => {
    const elIds   = g.elIds.map(id => idMap[id]).filter(Boolean);
    const wireIds = g.wireIds.map(id => idMap[id]).filter(Boolean);
    if (elIds.length + wireIds.length > 0) state.page.groups.push({ id: genId('g'), elIds, wireIds });
  });
  return { newEls, newWires };
}

// ── オフセット(平行複写): 選択図形を指定距離×本数だけ垂直方向に複写 ──
// 方向は選択中の最初の線分(配線 or 線要素)の垂直。線が無ければ真下方向。
function offsetCopySelection() {
  if (!state.sel.els.size && !state.sel.wires.size) { alert('先にオフセットしたい図形を選択してください'); return; }
  const input = prompt('オフセット距離を入力（負の値で逆側）\n「距離,本数」で等間隔に複数コピー（例: 20,5）', state._lastOffsetInput || '20,1');
  if (!input) return;
  const m = String(input).trim().split(/[,、\s]+/);
  const dist  = parseFloat(m[0]);
  const count = Math.max(1, parseInt(m[1] || '1', 10) || 1);
  if (!isFinite(dist) || dist === 0) return;
  state._lastOffsetInput = input.trim();
  let px = 0, py = 1; // デフォルト: 真下
  const refWire = state.wires.find(w => state.sel.wires.has(w.id));
  const refLineEl = refWire ? null : state.elements.find(el => state.sel.els.has(el.id) && el.x1 != null && el.x2 != null);
  const ref = refWire || refLineEl;
  if (ref) {
    const dx = ref.x2 - ref.x1, dy = ref.y2 - ref.y1, len = Math.hypot(dx, dy);
    if (len > 0.01) { px = -dy / len; py = dx / len; }
  }
  pushH();
  const origEls = new Set(state.sel.els), origWires = new Set(state.sel.wires);
  const allNewEls = [], allNewWires = [];
  for (let k = 1; k <= count; k++) {
    state.sel.els = new Set(origEls); state.sel.wires = new Set(origWires);
    const r = duplicateSelection(px * dist * k, py * dist * k);
    if (r) { allNewEls.push(...r.newEls); allNewWires.push(...r.newWires); }
  }
  state.sel.els   = new Set(allNewEls.map(e => e.id));
  state.sel.wires = new Set(allNewWires.map(w => w.id));
  draw(); updateRightPanel();
  if (typeof setHint === 'function') setHint(`${count}組をオフセット複写しました（距離${dist}）`);
}

// ── ミラー用の座標鏡映(moveEntityと同じフィールド網羅) ──
function mirrorEntity(el, axis, a) {
  const rf = v => 2 * a - v;
  if (axis === 'h') { // 垂直軸 x=a で左右鏡映
    if (el.cx != null) el.cx = rf(el.cx);
    if (el.x  != null) el.x  = rf(el.x);
    if (el.x1 != null) el.x1 = rf(el.x1);
    if (el.x2 != null) el.x2 = rf(el.x2);
    if (el.x3 != null) el.x3 = rf(el.x3);
    if (el.bx != null) el.bx = rf(el.bx);
    if (el.pts) { el.pts = el.pts.map(p => ({ x: rf(p.x), y: p.y })); el.x1 = el.pts[0]?.x; el.x2 = el.pts[el.pts.length-1]?.x; }
    if (el.sa != null && el.ea != null) { const s = el.sa, e2 = el.ea; el.sa = 180 - e2; el.ea = 180 - s; }
    if (el.type) { el.rot = (360 - (el.rot || 0)) % 360; el.flipH = !el.flipH; }
  } else { // 水平軸 y=a で上下鏡映
    if (el.cy != null) el.cy = rf(el.cy);
    if (el.y  != null) el.y  = rf(el.y);
    if (el.y1 != null) el.y1 = rf(el.y1);
    if (el.y2 != null) el.y2 = rf(el.y2);
    if (el.y3 != null) el.y3 = rf(el.y3);
    if (el.by != null) el.by = rf(el.by);
    if (el.pts) { el.pts = el.pts.map(p => ({ x: p.x, y: rf(p.y) })); el.y1 = el.pts[0]?.y; el.y2 = el.pts[el.pts.length-1]?.y; }
    if (el.sa != null && el.ea != null) { const s = el.sa, e2 = el.ea; el.sa = -e2; el.ea = -s; }
    if (el.type) { el.rot = (360 - (el.rot || 0)) % 360; el.flipV = !el.flipV; }
  }
}

// ── ミラーコピー: 選択BBoxの右端(h)/下端(v)を軸に反転複製を隣接配置 ──
function mirrorCopySelection(axis) {
  if (!state.sel.els.size && !state.sel.wires.size) { alert('先にミラーコピーしたい図形を選択してください'); return; }
  const pts = [];
  state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => {
    if (el.x  != null) pts.push({ x: el.x,  y: el.y });
    if (el.x1 != null) pts.push({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
  });
  state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w =>
    (w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}]).forEach(p => pts.push(p)));
  if (!pts.length) return;
  const a = axis === 'h' ? Math.max(...pts.map(p => p.x)) : Math.max(...pts.map(p => p.y));
  pushH();
  const r = duplicateSelection(0, 0);
  if (!r) return;
  r.newEls.forEach(el  => mirrorEntity(el, axis, a));
  r.newWires.forEach(w => mirrorEntity(w,  axis, a));
  state.sel.els   = new Set(r.newEls.map(e => e.id));
  state.sel.wires = new Set(r.newWires.map(w => w.id));
  draw(); updateRightPanel();
  if (typeof setHint === 'function') setHint(axis === 'h' ? '右側にミラーコピーしました' : '下側にミラーコピーしました');
}

function flipSel(axis) {
  const targets = state.elements.filter(el => state.sel.els.has(el.id));
  if (!targets.length) return;
  pushH();
  targets.forEach(el => {
    if (axis === 'h') el.flipH = !el.flipH;
    else              el.flipV = !el.flipV;
  });
  draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// グループ操作
// ----------------------------------------------------------------
// 選択をグループ全体に拡張（クリック・範囲選択後に呼ぶ）
// 追加した要素数を返す。範囲選択では、ドラッグした矩形の外にある要素まで黙って
// 選択に入ることがある(掛かった相手がグループなら残り全部が付いてくる)ので、
// 呼び出し側がその事実を画面に出せるようにしている。
function expandSelToGroups() {
  const groups = state.page.groups || [];
  let added = 0;
  let changed = true;
  while (changed) {
    changed = false;
    groups.forEach(g => {
      const hit = g.elIds.some(id => state.sel.els.has(id)) ||
                  g.wireIds.some(id => state.sel.wires.has(id));
      if (hit) {
        g.elIds.forEach(id => { if (!state.sel.els.has(id))    { state.sel.els.add(id);    changed = true; added++; } });
        g.wireIds.forEach(id => { if (!state.sel.wires.has(id)) { state.sel.wires.add(id); changed = true; added++; } });
      }
    });
  }
  return added;
}

function applyGroupMove() {
  const dx = +document.getElementById('gp-dx')?.value || 0;
  const dy = +document.getElementById('gp-dy')?.value || 0;
  if (dx === 0 && dy === 0) return;
  pushH();
  state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => moveEntity(el, dx, dy));
  state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w => moveEntity(w, dx, dy));
  draw(); updateRightPanel();
}

// ----------------------------------------------------------------
// 選択中のcircle要素をjunction(端子台の端子)に一括変換
// 外部DXFの円がそのまま読み込まれているケースで、座標(位置・半径)は変えずに
// 「これは端子だ」という意味情報だけを後付けする。配線の引き直しは不要。
// ----------------------------------------------------------------
function convertSelectedToJunction() {
  const targets = state.elements.filter(el => state.sel.els.has(el.id) && el.type === 'circle');
  if (!targets.length) { alert('選択範囲に円(circle)がありません。端子に変換したい円を選択してください。'); return; }
  pushH();
  // 既定は白丸(circle)。分岐点用の黒丸(dot)はこの変換の用途に合わないため既定にしない。
  // ◎(dbl)を明示的に選んでいる場合のみそれを尊重する。
  const style = (state.junctionStyle === 'dbl') ? 'dbl' : 'circle';
  targets.forEach(el => {
    el.type = 'junction';
    el.style = style;
    // 半径は元のDXF円のサイズをそのまま維持する(見た目・実寸を壊さないため)
    if (!el.r || el.r <= 0) el.r = state.junctionR || 2;
  });
  draw();
  alert(`${targets.length}個の円を端子(${style === 'dbl' ? '◎' : style === 'dot' ? '●' : '○'})に変換しました。`);
}

// グループ化すると解体されてしまう既存グループを返す。
// groupSelected() は選択に1要素でも掛かった既存グループを丸ごと捨てるので、
// 範囲選択が部品外形図グループの端に少し掛かっただけでも、その外形図グループは
// 解体され、グループが持つデバイス記号・型番(部品表にも出る値)まで消える。
// 黙って壊さないよう、ここで対象を洗い出して呼び出し側で確認を出す。
function groupsDissolvedBy(sel, groups) {
  return (groups || []).filter(g =>
    (g.elIds   || []).some(id => sel.els.has(id)) ||
    (g.wireIds || []).some(id => sel.wires.has(id))
  );
}

// 解体される既存グループの確認メッセージ。グループ名(デバイス記号・型番)が
// 付いていればそれを出す。無ければ要素数で示す。
function dissolveGroupsMessage(dissolved) {
  const names = dissolved.map(g =>
    [g.partRef, g.partModel].filter(Boolean).join(' ') ||
    `名前なし(${(g.elIds||[]).length + (g.wireIds||[]).length}要素)`
  );
  return `選択に既存グループが ${dissolved.length}個 含まれています:\n  ${names.join('\n  ')}\n\n` +
         'グループ化すると、これらは解体されて1つの新しいグループにまとまります。\n' +
         'グループが持っているデバイス記号・型番(部品表に出る値)は失われます。\n' +
         '※グループの一部が選択に掛かると、残りの要素も自動で選択に入ります。\n' +
         '  そのため、囲んだ範囲より広い範囲がグループになることがあります。\n\n' +
         '続けますか？';
}

function groupSelected() {
  const elIds   = [...state.sel.els];
  const wireIds = [...state.sel.wires];
  if (!elIds.length && !wireIds.length) return;
  state.page.groups = state.page.groups || [];
  // 既存グループを黙って解体しない。掛かっているものがあれば中身を示して確認する。
  const dissolved = groupsDissolvedBy(state.sel, state.page.groups);
  if (dissolved.length && typeof confirm === 'function' &&
      !confirm(dissolveGroupsMessage(dissolved))) return;
  pushH();
  // 既存グループに含まれるメンバーを一旦解除してから新グループを作る
  state.page.groups = state.page.groups.filter(g => !dissolved.includes(g));
  state.page.groups.push({ id: genId('g'), elIds, wireIds });
  draw();
}

function ungroupSelected() {
  if (!(state.page.groups || []).some(g =>
    g.elIds.some(id => state.sel.els.has(id)) ||
    g.wireIds.some(id => state.sel.wires.has(id))
  )) return;
  pushH();
  state.page.groups = (state.page.groups || []).filter(g =>
    !g.elIds.some(id => state.sel.els.has(id)) &&
    !g.wireIds.some(id => state.sel.wires.has(id))
  );
  draw();
}

// ----------------------------------------------------------------
// シンボル分解
// ----------------------------------------------------------------
function explodeSelected() {
  const selEls = state.elements.filter(e => state.sel.els.has(e.id));
  const targets = selEls.filter(e => {
    const cS = state.customSymbols.find(s => s.type === e.type);
    return cS && cS.shapes && cS.shapes.length;
  });
  if (!targets.length) return;
  pushH();
  const newIds = [];
  targets.forEach(el => {
    const cS = state.customSymbols.find(s => s.type === el.type);
    const sc = el.scale || 1;
    const rot = (el.rot || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const fH = el.flipH ? -1 : 1, fV = el.flipV ? -1 : 1;
    const tx = (lx, ly) => {
      const sx = lx * fH * sc, sy = ly * fV * sc;
      return { x: el.x + sx * cosR - sy * sinR, y: el.y + sx * sinR + sy * cosR };
    };
    const lay = el.layer || activeLayer();
    cS.shapes.forEach(s => {
      if (s.t === 'L') {
        const id = genId('el');
        const p1 = tx(s.x1, s.y1), p2 = tx(s.x2, s.y2);
        state.elements.push({ id, type: 'fline', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, layer: lay });
        newIds.push(id);
      } else if (s.t === 'C') {
        const id = genId('el');
        const c = tx(s.cx, s.cy);
        state.elements.push({ id, type: 'circle', x: c.x, y: c.y, r: s.r * sc, layer: lay });
        newIds.push(id);
      } else if (s.t === 'A') {
        const id = genId('el');
        const c = tx(s.cx, s.cy);
        state.elements.push({ id, type: 'arc', x: c.x, y: c.y, r: s.r * sc, startA: s.sa * Math.PI / 180 + rot, endA: s.ea * Math.PI / 180 + rot, layer: lay });
        newIds.push(id);
      } else if (s.t === 'P' && s.pts && s.pts.length >= 2) {
        const pts = s.pts.map(p => tx(p[0], p[1]));
        for (let k = 0; k < pts.length - 1; k++) {
          const id = genId('el');
          state.elements.push({ id, type: 'fline', x1: pts[k].x, y1: pts[k].y, x2: pts[k+1].x, y2: pts[k+1].y, layer: lay });
          newIds.push(id);
        }
        if (s.cl && pts.length >= 2) {
          const id = genId('el');
          state.elements.push({ id, type: 'fline', x1: pts[pts.length-1].x, y1: pts[pts.length-1].y, x2: pts[0].x, y2: pts[0].y, layer: lay });
          newIds.push(id);
        }
      }
    });
    // 元のシンボル要素を削除
    state.page.elements = state.elements.filter(e => e.id !== el.id);
  });
  // 分解で消えたシンボルがグループに入っていた場合の参照を掃除する
  pruneGroups(state.page);
  // 分解後の要素を選択状態にする
  state.sel.els.clear();
  newIds.forEach(id => state.sel.els.add(id));
  updateRightPanel();
  updateResizeHandles();
  draw();
}

// ----------------------------------------------------------------
// キーボードショートカット
// ----------------------------------------------------------------
// ================================================================
// partRef入力UI（デバイスの一括入力）
// ================================================================
// 末尾の数字をインクリメント（ゼロ埋め維持: MC01→MC02）。数字なしはそのまま返す
function incRef(s) {
  const m = String(s || '').match(/^(.*?)(\d+)$/);
  if (!m) return s || '';
  const n = String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0');
  return m[1] + n;
}

// シンボル位置にインライン入力を表示（Enter確定 / ESCキャンセル / 外側クリック確定）
function showPartRefInput(wx, wy, prefill, onConfirm, onCancel) {
  const cv = document.getElementById('cv');
  const r  = cv.getBoundingClientRect();
  const sx = wx * state.zoom + state.pan.x + r.left;
  const sy = wy * state.zoom + state.pan.y + r.top;

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:${sx - 70}px;top:${sy - 34}px;z-index:9999;display:flex;gap:4px;align-items:center;background:var(--bg2,#2a2a2a);border:1px solid var(--acc,#1d6fb5);border-radius:4px;padding:3px 5px;box-shadow:0 2px 8px rgba(0,0,0,.5)`;
  const inp = document.createElement('input');
  inp.type = 'text'; inp.placeholder = 'デバイス'; inp.value = prefill || '';
  inp.style.cssText = 'width:110px;background:transparent;border:none;outline:none;color:inherit;font-size:12px;';
  wrap.appendChild(inp);
  document.body.appendChild(wrap);
  inp.focus(); inp.select();

  let done = false;
  const safeDone = (ok) => {
    if (done) return; done = true;
    document.removeEventListener('mousedown', onOut, true);
    document.removeEventListener('pointerdown', onOut, true);
    const v = inp.value.trim();
    wrap.remove();
    if (ok) onConfirm(v); else if (onCancel) onCancel();
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); safeDone(true); }
    if (e.key === 'Escape') { e.preventDefault(); safeDone(false); }
  });
  const onOut = (e) => {
    if (!wrap.contains(e.target)) {
      document.removeEventListener('mousedown', onOut, true);
      document.removeEventListener('pointerdown', onOut, true);
      e.stopPropagation(); safeDone(true);
    }
  };
  document.addEventListener('mousedown', onOut, true);
  document.addEventListener('pointerdown', onOut, true);
}

// P: 選択中のシンボルへ順番にインライン入力（前回入力値+1を自動プリセット）
function quickPartRefEdit() {
  const els = state.elements.filter(el => state.sel.els.has(el.id) && getDef(el.type));
  if (!els.length) return false;
  state.showPartRef = true;
  if (typeof syncPartRefBtn === 'function') syncPartRefBtn();
  let i = 0, lastVal = '';
  const next = () => {
    if (i >= els.length) { draw(); updateRightPanel(); return; }
    const el = els[i++];
    const d  = getDef(el.type) || { h: 34 };
    const sc = el.scale || 1;
    const prefill = el.partRef || (lastVal ? incRef(lastVal) : '');
    showPartRefInput(el.x, el.y - (d.h * sc / 2 + 10), prefill, (v) => {
      if (v !== (el.partRef || '')) { pushH(); el.partRef = v; }
      if (v) lastVal = v;
      draw(); next();
    }, () => { draw(); updateRightPanel(); });
  };
  next();
  return true;
}

// 連続採番モード：開始番号を指定→シンボルをクリックするたびに自動採番
function startPartRefSeq() {
  const start = prompt('開始デバイスを入力（例: MC1）\nクリックしたシンボルに順番に割り当てます', state.partRefNext || 'MC1');
  if (!start || !start.trim()) return;
  state.partRefNext = start.trim();
  state.mode = 'partref'; state.symType = null;
  state.showPartRef = true;
  if (typeof syncPartRefBtn === 'function') syncPartRefBtn();
  document.querySelectorAll('.sym-item').forEach(el => el.classList.remove('on'));
  document.getElementById('rb-sel')?.classList.remove('on');
  document.getElementById('s-hint').textContent = `「${state.partRefNext}」を割り当て → シンボルをクリック  [ESC] 終了`;
  draw();
}
function exitPartRefSeq() {
  state.mode = 'select';
  document.getElementById('s-hint').textContent = '';
  document.getElementById('rb-sel')?.classList.add('on');
  updateHint(); draw();
}

// 線番 連続採番モード：開始線番を指定→配線をクリックするたびに自動採番
function startWireNoSeq() {
  const start = prompt('開始線番を入力（例: W001）\nクリックした配線に順番に割り当てます', state.wireNoNext || state.wireNoRule || 'W001');
  if (!start || !start.trim()) return;
  state.wireNoNext = start.trim();
  state.wireNoRule = start.trim(); // 採番書式として保存(一括割付のデフォルトにも使用)
  state.mode = 'wireno'; state.symType = null;
  document.querySelectorAll('.sym-item').forEach(el => el.classList.remove('on'));
  document.getElementById('rb-sel')?.classList.remove('on');
  document.getElementById('s-hint').textContent = `「${state.wireNoNext}」を割り当て → 配線をクリック  [ESC] 終了`;
  draw();
}
function exitWireNoSeq() {
  state.mode = 'select';
  document.getElementById('s-hint').textContent = '';
  document.getElementById('rb-sel')?.classList.add('on');
  updateHint(); draw();
}

document.addEventListener('keydown', e => {
  // Shiftキーで一時的に直交ON（INPUT等フォーカス中でも動作させる）
  if (e.key === 'Shift' && !e.repeat && !state.ortho) {
    state._shiftOrtho = true;
    state.ortho = true;
    document.getElementById('rb-ortho')?.classList.add('on');
    return;
  }
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;

  if (e.ctrlKey) {
    switch (e.key) {
      case 'z': case 'Z': e.preventDefault(); undo(); break;
      case 'y': case 'Y': e.preventDefault(); redo(); break;
      case 's': e.preventDefault(); saveProject(); break;
      case 'a': e.preventDefault(); selectAll(); break;
      case 'f': case 'F': e.preventDefault(); toggleSearchPanel(); break;
      case 'c': case 'C': e.preventDefault(); copySelected(); break;
      case 'x': case 'X': e.preventDefault(); cutSelected(); break;
      case 'v': case 'V': e.preventDefault(); pasteSelected(); break;
      case 'g': case 'G':
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        break;
      case 'Tab': e.preventDefault();
        switchPage((state.currentPage + (e.shiftKey ? -1 : 1) + state.pages.length) % state.pages.length);
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Delete': case 'Backspace': e.preventDefault(); delSel(); break;
    case 'Enter': case ' ':
      if (state.mode === 'bezier' && state.mouse.bezierPts?.length >= 2) {
        e.preventDefault(); currentTool().confirm();
      } else if (state.mode === 'select' && state.lastToolMode) {
        // コマンド繰り返し: 直前の作図ツールを再実行
        e.preventDefault(); setMode(state.lastToolMode, state.lastToolSym);
      }
      break;
    case 'Escape':
      if (state.mode === 'partref') {
        exitPartRefSeq(); break;
      }
      if (state.mode === 'wireno') {
        exitWireNoSeq(); break;
      }
      if (state.mode === 'paste') {
        state.mode = 'select'; state.pasteStep = null; state.pasteBaseWorld = null; state.preview = null;
        document.getElementById('s-hint').textContent = '';
        draw(); break;
      }
      if (state.mode === 'bezier') {
        state.mouse.bezierPts = null; state.preview = null;
        setMode('select'); draw(); break;
      }
      if (document.getElementById('pdf-preview-overlay')?.style.display === 'flex') { closePDFPreview(); break; }
      if (document.body.classList.contains('fullscreen')) { toggleExpand(); break; }
      state.wirePoints = []; state.preview = null; state.dimState = null; state.pendingOutline = null;
      state.angleDimState = null; state.mouse.measP1 = null;
      state.mouse.shapeStart = null; state.mouse.arcP1 = null; state.mouse.arcP2 = null; state.mouse.arc3P1 = null; state.mouse.arc3P2 = null; state.mouse.triP1 = null; state.mouse.triP2 = null;
      state.mode = 'select'; state.symType = null;
      document.querySelectorAll('.sym-item').forEach(el => el.classList.remove('on'));
      document.getElementById('rb-sel')?.classList.add('on');
      document.getElementById('rb-wire')?.classList.remove('on');
      draw(); updateHint(); break;
    case 's': setMode('select'); break;
    case 'w': setMode('wire'); break;
    case 't': setMode('text'); break;
    case 'r': rotateSel(90); break;
    case 'h': flipSel('h'); break;
    case 'v': flipSel('v'); break;
    case 'p': e.preventDefault(); if (!quickPartRefEdit()) startPartRefSeq(); break;
    case 'n': e.preventDefault(); startWireNoSeq(); break;
    case '+': case '=': doZoom(1.25); break;
    case '-': doZoom(0.8); break;
    case '0': resetView(); break;
    case 'F8': e.preventDefault(); toggleOrtho(); break;
  }

  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && (state.sel.els.size || state.sel.wires.size)) {
    e.preventDefault();
    // Ctrl+矢印: 0.001刻み / Alt+矢印: 0.1刻み / Shift+矢印: グリッド / 普通: 2
    const step = e.ctrlKey ? 0.1 : e.shiftKey ? state.G : 1;
    pushH();
    const dx = e.key==='ArrowLeft' ? -step : e.key==='ArrowRight' ? step : 0;
    const dy = e.key==='ArrowUp'   ? -step : e.key==='ArrowDown'  ? step : 0;
    state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => moveEntity(el, dx, dy));
    state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w => moveEntity(w, dx, dy));
    draw();
  }
});

// ================================================================
// 表紙ページ生成
// ================================================================
function insertCoverPage() {
  _syncCurrentPage();

  const frames = state.pages.map((p,i) => ({
    idx: i, name: p.name || ('Sheet'+(i+1)), f: p.frameObj || {},
  }));

  const base = state.pages[0]?.frameObj || state.frameObj || {};
  const title   = base.title   || '無題';
  const company = base.company || '';
  const equip   = base.equip   || '';
  const author  = base.author  || '';
  const approve = base.approve || '';
  const date    = base.date    || '';
  const drawno  = base.drawno  || '';
  const rev     = base.rev     || '';

  // キャンバス: 外枠 20-820 x 20-574
  const W = 840, H = 594;
  const mx = 20, my = 20; // 外枠左上
  const mw = 800, mh = 554; // 内部幅高さ
  const cx = mx + mw/2; // 中心X = 420

  function txt(id, x, y, text, fs=14, align='center') {
    return { id, type:'text', x, y, rot:0, flipH:false, flipV:false,
             label:'', text, fs, partRef:'', terminals:'', layer:'注記', wireNo:'', note:'' };
  }
  function fl(id, x1, y1, x2, y2, lw=1) {
    return { id, type:'fline', x1, y1, x2, y2, rot:0, flipH:false, flipV:false,
             label:'', partRef:'', terminals:'', layer:'外形', wireNo:'', note:'', lineWidth:lw };
  }
  function box(id0, x1, y1, x2, y2, lw=1) {
    return [
      fl(id0+'a', x1, y1, x2, y1, lw), fl(id0+'b', x2, y1, x2, y2, lw),
      fl(id0+'c', x2, y2, x1, y2, lw), fl(id0+'d', x1, y2, x1, y1, lw),
    ];
  }

  const els = []; let n = 0;
  const id = () => 'cv_' + (n++);

  // 外枠（太線）
  els.push(...box('outer', mx, my, mx+mw, my+mh, 2));

  // ── ロゴエリア（左上 小さめ）
  els.push(...box('logo', mx, my, mx+150, my+60));
  els.push(txt(id(), mx+75, my+33, '（ロゴ）', 9));

  // ── 下部情報欄の高さを先に計算
  const infoH = 40;
  const infoY = my + mh - infoH;

  // ── ページリストの高さを計算
  const lh = 22;
  const listH = 42 + frames.length * lh; // ヘッダ+行
  const listW = mw - 80;
  const lx = mx + 40;
  const lrx = lx + listW;

  // ── 残り高さを3分割: タイトルエリア / ページリスト / 余白
  const bodyH = infoY - my;           // 情報欄より上の高さ
  const listTop = my + bodyH / 2 - listH / 2; // ページリストを縦中央に
  const lt = Math.round(listTop);
  const lb = lt + listH;

  // タイトル位置（ページリストより上の空間の中央）
  const titleAreaMid = my + (lt - my) / 2;
  const titleY = Math.round(titleAreaMid - 10);
  els.push(txt(id(), cx, titleY, title, 36));
  if (equip) els.push(txt(id(), cx, titleY + 46, equip, 16));

  // ── ページリスト
  els.push(...box('plst', lx, lt, lrx, lb));
  // ヘッダ
  els.push(fl(id(), lx, lt+20, lrx, lt+20));
  els.push(txt(id(), cx, lt+12, 'ページリスト', 10));
  // 列位置定義（縦線なし）
  const nc = lx+60, pc = lx+Math.round(listW*0.45), dc = lx+Math.round(listW*0.75);
  // 列ヘッダ
  els.push(fl(id(), lx, lt+40, lrx, lt+40));
  els.push(txt(id(), lx+30, lt+32, 'No.', 9));
  els.push(txt(id(), (lx+nc+pc)/2, lt+32, 'ページ名', 9));
  els.push(txt(id(), (nc+pc+dc)/2, lt+32, '図面番号', 9));
  els.push(txt(id(), (dc+lrx)/2, lt+32, 'Rev', 9));

  frames.forEach((pg, i) => {
    const y = lt + 52 + i * lh;
    els.push(txt(id(), lx+30, y, String(i+1), 10));
    els.push(txt(id(), (lx+60+pc)/2, y, pg.name, 10));
    els.push(txt(id(), (pc+dc)/2, y, pg.f.drawno||'', 10));
    els.push(txt(id(), (dc+lrx)/2, y, pg.f.rev||'', 10));
    if (i < frames.length-1) els.push(fl(id(), lx, y+12, lrx, y+12));
  });

  // ── 情報欄（最下部）
  els.push(fl(id(), mx, infoY, mx+mw, infoY));
  const cols = [
    { lbl:'図面番号', val:drawno, w:150 },
    { lbl:'作成',     val:author, w:110 },
    { lbl:'承認',     val:approve,w:110 },
    { lbl:'日付',     val:date,   w:130 },
    { lbl:'Rev',      val:rev,    w:80  },
    { lbl:'会社名',   val:company,w:220 },
  ];
  let cx2 = mx;
  cols.forEach((c, i) => {
    if (i > 0) els.push(fl(id(), cx2, infoY, cx2, my+mh));
    els.push(txt(id(), cx2+6, infoY+7, c.lbl, 8));
    els.push(txt(id(), cx2+6, infoY+24, c.val, 10));
    cx2 += c.w;
  });

  pushH();
  // 表紙ページは図面枠を描画しない（isCover=trueで制御）
  const coverFrame = Object.assign({}, state.frameObj, { title, drawno, page:'表紙', isCover:true });
  state.pages.unshift({ name:'表紙', elements:els, wires:[], groups:[], frameObj:coverFrame, dirty:true });
  switchPage(0);
  alert('表紙ページを先頭に挿入しました。');
}


// ================================================================
// マスクモード
// ================================================================
const MASK_FIELDS = ['company', 'equip', 'author', 'approve', 'date'];

function toggleMask() {
  state.maskMode = !state.maskMode;
  const btn = document.getElementById('rb-mask');
  if (btn) btn.classList.toggle('on', state.maskMode);
  const status = state.maskMode ? 'ON（個人情報マスク中）' : 'OFF';
  console.log('[mask] マスクモード:', status);
}

// frameObjのマスク済みコピーを返す
function maskedFrame(frameObj) {
  if (!frameObj || !state.maskMode) return frameObj;
  const f = { ...frameObj };
  MASK_FIELDS.forEach(k => { if (f[k]) f[k] = '***'; });
  return f;
}

