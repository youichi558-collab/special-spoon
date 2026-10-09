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

// 【2026-10-03 再設計の段階1】図面には「図面で使っている型式の部品だけ」を、いつも写しとして入れる。
// CADは開いた後も型式で部品DBを引く(コイル電圧・極数/電流の選択肢、端子番号の候補、部品表のメーカー/名称、
// クロスリファレンスの空き接点の枠、端子台表で装置端子を除く判定)。ライブラリが無いPCで図面を開いても
// これらが効くよう、使った分の写しを持たせる(EPLANのプロジェクトと同じ考え方)。
// 外形図DXF(1件で数百KBある)は入れない(引く処理はどれも使わない。配置はライブラリから)。
// 以前は「サーバーに繋がらないときだけ部品DBを丸ごと」入れていた。
function usedPartsForSave(pages) {
  const refs = new Set();
  const add = m => { if (m) { refs.add(String(m)); refs.add(String(m).trim()); } };
  (pages || []).forEach(pg => {
    (pg.elements || []).forEach(e => add(e.partModel));
    (pg.groups || []).forEach(g => add(g.partModel));
  });
  return (state.customParts || []).filter(p => p && refs.has(p.ref))
    .map(({ outlineDxf, outlineDxfName, ...rest }) => {
      Object.keys(rest).forEach(k => { if (k.startsWith('_')) delete rest[k]; });   // 画面用の印(_origin 等。段階4)は入れない
      return rest;
    });
}

// 図面に入れる表題欄様式の写し(2026-10-03 段階2)。表題欄は描くときに様式を引く(js/data.js titleBlockCells)ので、
// ライブラリが無いPC・ライブラリに無い様式でも同じ表題欄で描けるよう、使った様式(組み込み以外)の写しを入れる。
function usedTitleBlockTplsForSave(pages) {
  const user = (typeof userTitleBlockTpls === 'function') ? userTitleBlockTpls() : {};
  const out = {};
  (pages || []).forEach(pg => {
    const k = pg && pg.frameObj && pg.frameObj.tbTpl;
    if (k && user[k]) out[k] = user[k];
  });
  return out;
}

// 図面ファイルに入っていた部品(写し)を読み込むときの扱い。
// ライブラリ(部品DB)が読めていれば、ライブラリに無い型式だけ足す(ライブラリが正。読込のたびに上書きしない)。
// 読めていなければ写しを使う(後でライブラリが読めたら js/parts_db.js の mergeEmbedded がライブラリを正にして重ねる)。
function _mergeOrSetCustomParts(dParts) {
  if (!dParts || !dParts.length) return; // 何もしない＝現状維持
  if (typeof partsDb !== 'undefined' && partsDb.hasFile()) {
    dParts.forEach(p => { if (!state.customParts.find(cp => cp.ref === p.ref)) state.customParts.push(p); });
  } else {
    state.customParts = dParts;
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

// 長さ0の配線(始点と終点が同じ)を取り除く。取り除いた本数を返す。
// 【2026-09-25】配線ツールで同じ点を2回押すと長さ0の配線ができていた(tools.js は同日修正)。
// 描いても見えず、どこともつながらないが、線番の判定では別の線として「未採番」の行に
// 出たり、●の上に乗ってネットに紛れ込んだりする。盛田さん「長さ０は目視できん」で、
// 手で探して消せないため、読み込み時に自動で消すことにした(盛田さん了承)。
// 盛田さんのSheet3には4本あった。見た目と接続は変わらない。
function removeZeroLengthWires(pages) {
  let n = 0;
  (pages || []).forEach(pg => {
    if (!pg.wires) return;
    const keep = pg.wires.filter(w => {
      const pts = w.pts || [{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
      return !(len < 0.1);
    });
    n += pg.wires.length - keep.length;
    pg.wires = keep;
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

// CSVのファイル名は「図面名_用途.csv」(2026-09-24、盛田さん「図面名+用途で出ないと
// 判らん」)。以前は wire_numbers.csv 等の固定名で、保存先フォルダに直接書くと
// 別の図面のCSVを上書きしてしまうため。
function _csvName(purpose) {
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  return `${base}_${purpose}.csv`;
}

function _pageFileName(pg, idx) {
  const base = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  const name = (pg.name || ('Sheet'+(idx+1))).replace(/[\\/:*?"<>|]/g, '_');
  return `${base}_${name}`;
}

// 【2026-10-04】図面の拡張子は .seqzu(このCADの名前 Sequenzu(仮)から。盛田さん)。中身は今までどおりの JSON。
// 図面かどうかを拡張子で見分けるため(プロジェクトのツリーで図面だけを出す)。以前の .json の図面も読込で開ける(保存し直すと .seqzu)
// 【2026-10-04】プロジェクトのツリー(js/proj_tree.js)から開いたページは、開いたファイルを覚えている(pg._src=ツリーの道筋)。
// 盛田さん「開いたファイル全部書き換え出来ていい、普通そうだろ」→ そのページの「保存」は窓を出さずに開いたファイルへ上書きする。
// 同じファイルから開いたページ(全ページ保存のファイル等)はまとめて書く。_src はファイルには書かない(_saveJSON)
function _saveJSON(data) { return JSON.stringify(data, (k, v) => k === '_src' ? undefined : v, 2); }
function _saveData(pages, saveFileName) {
  return {
    version: 2,
    saveFileName,
    customSymbols: usedSymbolsForSave(pages),   // 使ったシンボルだけ(2026-10-03 段階3。以前はパレット丸ごと)
    customParts:   usedPartsForSave(pages),   // 使った型式の写しだけ(2026-10-03)
    titleBlockTpls: usedTitleBlockTplsForSave(pages),   // 使った表題欄様式の写し(2026-10-03 段階2)
    wireNoRule:    state.wireNoRule,
    wireNoFmt:    state.wireNoFmt,   // 線番の書式(2026-10-04 js/report.js wnFmt)
    layers:        LAYERS,
    pages,
  };
}
// 開いたファイルへ上書き。戻り値: 書けたら true
async function saveToSrcFile(src) {
  const h = (typeof ptreeSrcHandle === 'function') ? ptreeSrcHandle(src) : null;
  if (!h) return false;
  const pages = state.pages.filter(p => p._src === src);
  const was = pages.map(p => p.dirty);
  pages.forEach(p => { p.dirty = false; });   // 書き出す「前」に落とす(saveProject のコメント参照)
  const base = h.name.replace(/\.(seqzu|json)$/i, '');
  const text = _saveJSON(_saveData(pages, pages.length > 1 ? base.replace(/_all$/, '') : base.replace(/_[^_]+$/, '')));
  // 【2026-10-05】上書きされる前の中身を履歴に残す(js/proj_tree.js ptreeHistSave・盛田さん「世代管理できないな」)。残せなくても上書きは続ける
  try { if (typeof ptreeHistSave === 'function') await ptreeHistSave(src, h, text); }
  catch (e) { if (typeof stToast === 'function') stToast(`履歴を残せませんでした（${e && e.message || e}）。上書き保存は続けます`, 'warn'); }
  try {
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
  } catch (e) {
    pages.forEach((p, i) => { p.dirty = was[i]; });
    renderPageTabs();
    if (typeof stToast === 'function') stToast(`「${h.name}」に書けませんでした（${e && e.message || e}）`, 'ng'); else alert(`「${h.name}」に書けませんでした`);
    return false;
  }
  renderPageTabs();
  if (typeof stToast === 'function') stToast(`上書き保存しました: ${h.name}`, 'ok');
  if (typeof pidxAfterSave === 'function') pidxAfterSave();
  if (typeof ptreeRender === 'function') ptreeRender();
  return true;
}

// 【2026-10-05】ブラウザを開き直すとファイルの鍵は消えるが、ページはツリーの道筋(_src。自動保存に入っている)を覚えている。
// 保存の前にプロジェクトのフォルダから鍵を引き直す(js/proj_tree.js ptreeSrcResolve)→ 窓を出さずに上書き・履歴も残る
// (盛田さん「履歴のこらない」「窓が出た」→ 案C)。引けなかった道筋は外す(=保存の窓)。引き直しを始めたら true(済んだら again をもう一度呼ぶ)
function _srcResolveThen(pages, again) {
  const has = s => typeof ptreeSrcHandle === 'function' && !!ptreeSrcHandle(s);
  const need = [...new Set(pages.filter(p => p._src && p._src[0] === '/' && !has(p._src)).map(p => p._src))];
  if (!need.length) return false;
  const res = typeof ptreeSrcResolve === 'function' ? ptreeSrcResolve : async () => null;
  Promise.all(need.map(s => res(s).catch(() => null))).then(() => {
    state.pages.forEach(p => { if (need.includes(p._src) && !has(p._src)) delete p._src; });
    again();
  });
  return true;
}

// 「名前を付けて保存」ボタン(2026-10-05 盛田さん。保存先が決まったページは「保存」が必ず上書きになるので、別の名前で保存する口)
function saveAsProject() { saveProject(true); }

// asNew: 名前を付けて保存(保存先が決まっていても窓を出す)。保存先が決まったページは、同じファイルのページ(全ページ保存のファイル等)をまとめて書く
function saveProject(asNew) {
  // 現在ページのみ保存
  _syncCurrentPage();
  const pg = state.pages[state.currentPage];
  if (_srcResolveThen([pg], () => saveProject(asNew))) return;   // ブラウザを開き直したあとはファイルの鍵を引き直してから
  const srcH = pg._src && typeof ptreeSrcHandle === 'function' ? ptreeSrcHandle(pg._src) : null;
  if (srcH && asNew !== true) { saveToSrcFile(pg._src); return; }   // 開いたファイルへ上書き
  const pages = srcH ? state.pages.filter(p => p._src === pg._src) : [pg];
  const defaultName = srcH ? srcH.name.replace(/\.(seqzu|json)$/i, '') : _pageFileName(pg, state.currentPage);
  // 【2026-10-01】「名前を付けて保存」の窓が使えるときは、ファイル名はその窓で決める(先に名前の入力窓を出すと、
  // 入力中に「押した直後」が過ぎて窓が開けなかった=盛田さん「保存押しても、選択はでない」)。使えないときは従来どおり入力窓
  let fname0 = defaultName;
  if (!window.showSaveFilePicker) {
    const name = prompt('保存ファイル名を入力してください', defaultName);
    if (name === null) return; // キャンセル
    fname0 = (name.trim() || defaultName).replace(/[\\/:*?"<>|]/g, '_');
  }
  dlMake(fileName => {
    const fname = String(fileName).replace(/\.(seqzu|json)$/i, '');
    // saveFileNameを更新
    state.saveFileName = pages.length > 1 ? fname.replace(/_all$/, '') : fname.replace(/_[^_]+$/, ''); // ページ名部分を除いた部分を保存
    const data = _saveData(pages, state.saveFileName);
    // 書き出す「前」にdirtyを落とすこと。あとで落とすと data.pages が同じオブジェクトを
    // 参照しているため、保存ファイルに dirty:true が焼き込まれてしまう。
    // その状態で読み込むと、開いた直後なのにシートタブへ未保存マーク(●)が出る。
    pages.forEach(p => { p.dirty = false; });
    return _saveJSON(data);
  }, fname0 + '.seqzu', 'application/x-seqzu', (n, fh) => { renderPageTabs(); if (fh && typeof ptreeAdopt === 'function') ptreeAdopt(fh, pages); if (typeof pidxAfterSave === 'function') pidxAfterSave(); });   // 名前を付けて保存したファイルを次から上書きの先に(2026-10-05)   // 参照図面のフォルダならプロジェクト台帳も更新
}

function saveAllProject() {
  // 全ページまとめて保存
  _syncCurrentPage();
  if (_srcResolveThen(state.pages, saveAllProject)) return;   // ブラウザを開き直したあとはファイルの鍵を引き直してから
  // 【2026-10-04】ツリーから開いたページがあれば、ページごとに開いたファイルへ上書きする(1つのファイルにまとめない)。
  // 開いたファイルの無いページ(新しく作った等)は書かずに知らせる(そのページで「保存」=名前を付けて保存)
  const srcs = [...new Set(state.pages.filter(p => p._src && typeof ptreeSrcHandle === 'function' && ptreeSrcHandle(p._src)).map(p => p._src))];
  if (srcs.length) {
    const rest = state.pages.filter(p => !srcs.includes(p._src)).map(p => p.name);
    (async () => {
      let n = 0;
      for (const src of srcs) if (await saveToSrcFile(src)) n++;
      if (rest.length) alert(`開いたファイルへ ${n} 件上書き保存しました。\n\nファイルの無いページは保存していません: ${rest.join('、')}\nそのページで「保存」を押して名前を付けてください。`);
    })();
    return;
  }
  const defaultBase = (state.saveFileName || '図面').replace(/[\\/:*?"<>|]/g, '_');
  // 【2026-10-01】saveProject と同じく、名前は「名前を付けて保存」の窓で決める(使えないときだけ入力窓)
  let base0 = defaultBase;
  if (!window.showSaveFilePicker) {
    const name = prompt('保存ファイル名を入力してください', defaultBase);
    if (name === null) return; // キャンセル
    base0 = (name.trim() || defaultBase).replace(/[\\/:*?"<>|]/g, '_');
  }
  dlMake(fileName => {
    state.saveFileName = String(fileName).replace(/\.(seqzu|json)$/i, '').replace(/_all$/, '');
    const data = _saveData(state.pages, state.saveFileName);
    // 書き出す「前」にdirtyを落とす（理由はsaveProject()のコメント参照）
    state.pages.forEach(p => p.dirty = false);
    return _saveJSON(data);
  }, base0 + '_all.seqzu', 'application/x-seqzu', (n, fh) => { renderPageTabs(); if (fh && typeof ptreeAdopt === 'function') ptreeAdopt(fh, state.pages.slice()); if (typeof pidxAfterSave === 'function') pidxAfterSave(); });
}

// v1以前(旧形式)のファイルのページを、今の形に直す(groupsをpages内に移動・idを付与)。
// 置き換え読込(applyProjectData)と、消さない読込(appendProjectData)の両方で使う。
function _legacyProjectPages(d) {
  const pages = d.pages || [{ name:'Sheet1', elements: d.elements||[], wires: d.wires||[], frameObj: d.frameObj||null }];
  return pages.map(pg => ({
    ...pg,
    groups: [],
    elements: (pg.elements||[]).map(el => el.id ? el : { ...el, id: genId('el') }),
    wires:    (pg.wires||[]).map(w  => w.id  ? w  : { ...w,  id: genId('w'), wireNoAuto: true }),
  }));
}

// 読み込んだプロジェクトデータ(保存ファイルと同じ形)を、実際に画面へ反映する。
//
// 【2026-09-20】ファイルからの読込(loadProject)とバックアップからの復元
// (js/backup.js)で同じ処理が要るため、ここに切り出した。
// マイグレーション・ID重複修復・レイヤー修復は、どちらの経路でも同じものが
// 掛からないと「ファイルから開くと直るのに、バックアップから戻すと直らない」
// という食い違いが出る(同じ性質の処理を複数経路に写さない)。
//
// 戻り値: { fixedIds } — 修復した重複IDの件数(呼び出し側が知らせるのに使う)
function applyProjectData(d) {
      if (typeof xrefReset === 'function') xrefReset();   // 別の図面に置き換わるので、クロスリファレンスの結果は捨てる(自動では出し直さない)
      if (typeof showTopBanner === 'function') showTopBanner('autosave-broken-banner', '');   // 「自動保存データが壊れていた」の帯は、図面を開いたら役目を終える(js/autosave.js)
      // バージョン別マイグレーション
      if (d.version === 2) {
        state.pages        = d.pages || [{ name:'Sheet1', elements:[], wires:[], groups:[], guides:[], frameObj:null }];
        state.wireNoRule   = d.wireNoRule || state.wireNoRule;
        state.wireNoFmt   = d.wireNoFmt || { pageDigits: 0, seqDigits: 2 };   // 書式の無い図面は「ページ番号なし・連番2桁」(Sheet3の 01〜16 の形)
        state.customSymbols= d.customSymbols || [];
        _mergeOrSetCustomParts(d.customParts);
        // 旧フォーマット互換：トップレベルのguides → page[0].guides に移行
        if (d.guides && d.guides.length) state.pages[0].guides = d.guides;
        // 各ページにguidesがなければ初期化
        state.pages.forEach(pg => { if (!pg.guides) pg.guides = []; });
        if (d.layers && d.layers.length) { LAYERS.length = 0; d.layers.forEach(l => LAYERS.push(l)); }
      } else {
        // v1以前（旧形式）からのマイグレーション
        state.pages = _legacyProjectPages(d);
        state.customSymbols = d.customSymbols || [];
        _mergeOrSetCustomParts(d.customParts);
      }

      state.drawingTbTpls = (d.titleBlockTpls && typeof d.titleBlockTpls === 'object') ? d.titleBlockTpls : {};   // 図面の表題欄様式の写し(段階2)
      state.currentPage = 0;
      state.customSymbols.forEach(s => { DEFS[s.type] = s; });
      // 図面のシンボル＋ライブラリでパレットを組み直す(段階3・決定(3)。js/sym_store.js)。
      // 【2026-10-05】登録シンボルと違っても開いたときには聞かない(窓がループした)。シンボルは1つ(登録シンボルが正)なので、
      // 図面ファイルの写しと端子の位置が違う記号だけ画面の隅で知らせる(symMovedNotice)
      if (typeof setDrawingSymbols === 'function') {
        setDrawingSymbols(state.customSymbols);
        rebuildSymbolPalette();
        setTimeout(() => { if (typeof symMovedNotice === 'function') symMovedNotice(state.drawingSymbols); }, 0);
      }
      state.saveFileName = d.saveFileName || '';
      state.sel.els.clear(); state.sel.wires.clear();
      stripLegacyColors(state.pages);
      const fixedLayers = repairLayers(state.pages);
      if (fixedLayers) console.log(`レイヤーが失われた要素を${fixedLayers}件修復しました`);
      const fixedIds = dedupeIds(state.pages);
      const zeroWires = removeZeroLengthWires(state.pages);
      state.pages.forEach(pg => pruneGroups(pg));
      // 読み込んだ直後は「保存済みの状態」なので未保存マークを消す。
      // 上の修正以前に保存されたファイルには dirty:true が焼き込まれているため、
      // ここでも落としておかないと開いた瞬間に●が出たままになる。
      state.pages.forEach(pg => { pg.dirty = false; });
      renderSymFloat(); renderPartsAll(); renderPageTabs(); draw(); updateRightPanel();
      return { fixedIds, zeroWires };
}

// 【2026-09-29】「消さない読込」。今の図面をそのままにして、読み込んだファイルのページを**最後に足す**
// (盛田さん「保存データ読込で今のデータを全部消して読み込んでるのを、消す場合と消さない場合に選べるか」)。
// 置き換え(applyProjectData)との違い:
//   ・今のページ・要素・配線・現在のページ・保存ファイル名・線番の規則は変えない
//   ・レイヤー: 今のレイヤーはそのまま(色・表示も)。ファイルにあって今に無い名前だけ足す
//     (足さないと、追加したページの要素が「レイヤー不明」で最初のレイヤーに戻される)
//   ・カスタムシンボル: type が今に無いものだけ足す。同じ type が既にあれば**今のものを使う**
//   ・部品(customParts。図面に入っている写し): 今に無い ref だけ足す(外部の部品DBの有無に関わらず足すだけ)
//   ・ページ名が今のページと同じなら、末尾に (2) (3)… を付ける(出力のファイル名がぶつからないように)
//   ・図形・配線のIDが今のものと重複したら、追加した側のIDを付け替える(dedupeIds は先に出てきた方=今のものを残す)
//   ・追加したページは未保存マーク(●)にする。取り消し(Ctrl+Z)で元に戻せる(呼び出し側の pushH)
// 戻り値: { added, names, fixedIds, zeroWires, symAdded, symKept, partsAdded, layersAdded }
function appendProjectData(d) {
  _syncCurrentPage();
  const newPages = (d.version === 2 ? (d.pages || []) : _legacyProjectPages(d));
  if (!newPages.length) throw new Error('ファイルにページがありません');
  // 旧フォーマット互換: v2のトップレベルの guides は先頭ページへ(applyProjectData と同じ)
  if (d.version === 2 && d.guides && d.guides.length) newPages[0].guides = d.guides;

  // レイヤー: 無い名前だけ足す(今のものは変えない)
  let layersAdded = 0;
  (d.layers || []).forEach(l => {
    if (l && l.name && !LAYERS.some(x => x.name === l.name)) { LAYERS.push(l); layersAdded++; }
  });
  // カスタムシンボル: type が無いものだけ足す。2026-10-05 シンボルは1つ(登録シンボルが正)なので、足したページも登録シンボルで描く。
  // 足したファイルの写しと登録シンボルで端子の位置が違う記号は知らせる(下の symMovedNotice)
  const fileSyms = {};
  (d.customSymbols || []).forEach(sym => { if (sym && sym.type) fileSyms[sym.type] = sym; });
  let symAdded = 0, symKept = 0;
  (d.customSymbols || []).forEach(sym => {
    if (state.customSymbols.some(x => x.type === sym.type)) { symKept++; return; }
    state.customSymbols.push(sym); DEFS[sym.type] = sym; symAdded++;
    if (state.drawingSymbols && !(sym.type in state.drawingSymbols)) state.drawingSymbols[sym.type] = sym;   // 段階3
  });
  // 表題欄様式の写し: 無いキーだけ足す(2026-10-03 段階2)
  state.drawingTbTpls = state.drawingTbTpls || {};
  Object.entries((d.titleBlockTpls && typeof d.titleBlockTpls === 'object') ? d.titleBlockTpls : {})
    .forEach(([k, v]) => { if (!(k in state.drawingTbTpls)) state.drawingTbTpls[k] = v; });
  // 部品(図面に入っている写し): 無い ref だけ足す
  let partsAdded = 0;
  state.customParts = state.customParts || [];
  (d.customParts || []).forEach(pt => {
    if (!state.customParts.some(x => x.ref === pt.ref)) { state.customParts.push(pt); partsAdded++; }
  });

  // ページ名: 今と同じなら (2)(3)… を付ける
  const used = new Set(state.pages.map(pg => pg.name));
  const names = [];
  newPages.forEach((pg, i) => {
    let n = pg.name || ('Sheet' + (state.pages.length + i + 1));
    if (used.has(n)) { let k = 2; while (used.has(`${n}(${k})`)) k++; n = `${n}(${k})`; }
    pg.name = n; used.add(n); names.push(n);
    if (!pg.guides) pg.guides = [];
  });

  state.pages.push(...newPages);
  stripLegacyColors(newPages);
  const fixedLayers = repairLayers(newPages);
  if (fixedLayers) console.log(`レイヤーが失われた要素を${fixedLayers}件修復しました`);
  const fixedIds = dedupeIds(state.pages);      // 先に出てくる今のページのIDを残し、追加側を付け替える
  const zeroWires = removeZeroLengthWires(newPages);
  newPages.forEach(pg => pruneGroups(pg));
  newPages.forEach(pg => { pg.dirty = true; });
  renderSymFloat(); renderPartsAll(); renderPageTabs(); draw(); updateRightPanel();
  if (typeof symMovedNotice === 'function') setTimeout(() => symMovedNotice(fileSyms, pg => newPages.includes(pg)), 0);
  return { added: newPages.length, names, fixedIds, zeroWires, symAdded, symKept, partsAdded, layersAdded };
}

// 読込後のデバイスの点検(js/devices.js devAfterLoad)の結果を、読込完了の知らせに足す文
function _devLoadMsg(dm) {
  if (!dm) return '';
  return (dm.filled ? `\n\nデバイスの値をそろえました：同じデバイスの記号の空欄 ${dm.filled} か所に、そのデバイスの値を入れました（図面の見た目は変わりません）。` : '')
    + (dm.conflicts && dm.conflicts.length ? `\n\n同じデバイスで値が食い違っている所が ${dm.conflicts.length} 件あります。このあと出る画面で正しい方を選んでください。` : '');
}

// 読込の方法を聞く小さなダイアログ(置き換え / 消さずに追加 / キャンセル)。
// Escape・背景クリックはキャンセル。選ばれたら cb('replace'|'append') を呼ぶ。
function _askLoadMode(info, cb) {
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const ov = document.createElement('div');
  ov.id = 'load-mode-dlg';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center';
  const btn = 'padding:6px 12px;font-size:12px;cursor:pointer;border:1px solid var(--bd2);border-radius:4px;background:var(--bg2);color:var(--fg);text-align:left';
  ov.innerHTML = `<div role="dialog" style="background:var(--bg2);color:var(--fg);border:1px solid var(--bd);border-radius:6px;padding:16px 18px;max-width:480px;box-shadow:0 4px 24px var(--sh);font-size:12px;line-height:1.6">
    <div style="font-size:13px;font-weight:600;margin-bottom:6px">読込の方法を選んでください</div>
    <div style="color:var(--fg3);margin-bottom:10px">${esc(info.name)}（${info.filePages}ページ）／ 今の図面：${info.curPages}ページ</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button id="lm-replace" style="${btn}"><b>置き換える</b><br><span style="color:var(--fg3)">今の図面は全部消えて、このファイルになります（取り消しで戻せます）</span></button>
      <button id="lm-append" style="${btn}"><b>今の図面の後ろにページとして追加する</b><br><span style="color:var(--fg3)">今の図面は変わりません。ファイルの${info.filePages}ページを最後に足します</span></button>
      <button id="lm-cancel" style="${btn}">キャンセル</button>
    </div></div>`;
  const close = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  ov.querySelector('#lm-replace').onclick = () => { close(); cb('replace'); };
  ov.querySelector('#lm-append').onclick  = () => { close(); cb('append'); };
  ov.querySelector('#lm-cancel').onclick  = close;
  ov.querySelector('#lm-replace').focus();
}

// 【2026-10-08】「読込」はファイルの窓(showOpenFilePicker)で選ぶ。選んだ図面の場所(ファイルの鍵)が分かるので、
// 置き換えで開いたあと、今のプロジェクトの中の図面ならプロジェクトのまま・外ならそのフォルダをプロジェクトにするか聞く
// (js/proj_tree.js ptreeAfterLoadFile。盛田さん「２と４かな」→「はい」)。窓が使えないブラウザは今までの選び方
async function loadPick() {
  if (!window.showOpenFilePicker) { document.getElementById('load-in').click(); return; }
  let fh;
  try {
    [fh] = await window.showOpenFilePicker({ id: 'ecad-load', multiple: false,
      types: [{ description: '図面データ', accept: { 'application/x-seqzu': ['.seqzu'], 'application/json': ['.json'] } }] });
  } catch (e) { return; }   // 取りやめ
  let text;
  try { text = await (await fh.getFile()).text(); }
  catch (e) { alert(`「${fh.name}」を読めませんでした（${e && e.message || e}）`); return; }
  loadProjectText(text, fh.name, undefined, { fh });
}
function loadProject(input) {
  const f = input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = e => loadProjectText(e.target.result, f.name);
  rd.readAsText(f);
  input.value = '';
}

// 図面ファイルの中身(文字列)を読み込む。mode0 を渡せば方法を聞かずにそれで読む
// (左パネルのプロジェクトのツリー js/proj_tree.js から。2026-10-04)。渡さなければ置き換え/追加を聞く
function loadProjectText(text, name, mode0, opts) {
    let d;
    try { d = JSON.parse(text); }
    catch(err) { alert('読込失敗: ' + err.message); return false; }
    const filePages = d.version === 2 ? (d.pages || []).length : (d.pages ? d.pages.length : 1);
    const run = mode => {
      try {
        if (mode === 'append') {
          // pushH は今のページに未保存マーク(●)を付けるが、追加読込は今のページを変えないので、付けない
          const cur = state.page, wasDirty = cur.dirty;
          pushH();
          cur.dirty = wasDirty;
          const r = appendProjectData(d);
          const dm = (typeof devAfterLoad === 'function') ? devAfterLoad({ defer: true }) : { filled: 0, conflicts: [] };
          const warn = _devLoadMsg(dm)
            + (r.fixedIds > 0 ? `\n重複していた図形IDを ${r.fixedIds} 件付け替えました。` : '')
            + (r.zeroWires > 0 ? `\n長さ0の配線(見えない配線)を ${r.zeroWires} 本削除しました。` : '');
          // ツリーから(mode0)で知らせることが無ければ、窓を出さずに小さく知らせる
          if (mode0 && !warn && typeof stToast === 'function') stToast(`ページとして足しました: ${r.names.join('、')}(取り消し Ctrl+Z で戻せます)`, 'ok');
          else alert(`追加しました（${r.added}ページ）\n${r.names.join('、')}\n\n今の図面は変わっていません。`
            + warn
            + (r.symAdded || r.symKept ? `\nシンボル：追加 ${r.symAdded} 件` + (r.symKept ? `、同じ種類が既にあったので今のものを使用 ${r.symKept} 件` : '') : '')
            + (r.layersAdded ? `\nレイヤー：追加 ${r.layersAdded} 件` : '')
            + `\n取り消し(Ctrl+Z)で元に戻せます。`);
          return true;
        }
        pushH();
        const { fixedIds, zeroWires } = applyProjectData(d);
        // 【2026-10-06】「読込」で置き換えて開いたら、プロジェクトのフォルダを外す(js/proj_tree.js ptreeDetach)。
        // ツリーから開いたとき(mode0 あり)は外さない。読込の図面がどのフォルダのものか分からず、別のフォルダの図面まで集計していたため(盛田さん)
        // 【2026-10-08】読込のファイルの鍵があれば(loadPick)、今のプロジェクトの中の図面ならプロジェクトのまま・外ならそのフォルダをプロジェクトにするか聞く
        if (!mode0 && opts && opts.fh && typeof ptreeAfterLoadFile === 'function') ptreeAfterLoadFile(opts.fh);
        else if (!mode0 && typeof ptreeDetach === 'function') ptreeDetach();
        const dm = (typeof devAfterLoad === 'function') ? devAfterLoad({ defer: true }) : { filled: 0, conflicts: [] };
        if (mode0 && !(fixedIds > 0 || zeroWires > 0) && !_devLoadMsg(dm) && typeof stToast === 'function') { stToast(`開きました: ${name}`, 'ok'); return true; }
        alert((fixedIds > 0 || zeroWires > 0
          ? `読込完了\n`
            + (fixedIds > 0 ? `\n重複していた図形IDを ${fixedIds} 件修復しました。\n`
              + `(このファイルは、図形が勝手に一緒に動く・消える不具合が起きうる状態でした)\n` : '')
            + (zeroWires > 0 ? `\n長さ0の配線(見えない配線)を ${zeroWires} 本削除しました。\n` : '')
            + `上書き保存すると修復後の状態になります。`
          : '読込完了') + _devLoadMsg(dm));
        return true;
      } catch(err) {
        alert('読込失敗: ' + err.message);
        return false;
      }
    };
    if (mode0) return run(mode0); else _askLoadMode({ name, filePages, curPages: state.pages.length }, run);
}

function dl(text, fname, mime, onDone) { dlMake(() => text, fname, mime, onDone); }
// 中身を「保存の窓で名前が決まってから」作る版。makeText(選んだファイル名) → 文字列かバイト列
// (図面の保存は、選んだ名前を中身の saveFileName に入れるため。js/settings.js stWriteOut の説明)
function dlMake(makeText, fname, mime, onDone) {
  const download = (name) => {
    const nm = name || fname;
    const blob = new Blob([makeText(nm)], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nm;
    a.click();
    // 保存先フォルダ経由(非同期)から落ちてきたときは、すぐ解放するとファイル名が
    // 失われて「download」になることがあった(Chromiumで確認)。少し待って解放する。
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // 保存・出力のたびに「名前を付けて保存」の窓を開く(settings.js)。使えない・書けないときはダウンロード。
  if (typeof stWriteOut === 'function') stWriteOut(fname, name => new Blob([makeText(name)], { type: mime }), download, onDone);
  else { download(fname); if (onDone) onDone(fname); }
}

// ----------------------------------------------------------------
// クリップボード
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// 共通移動関数
// ----------------------------------------------------------------
// 【2026-09-19・撤去】ここにあった snapNearGrid()(リボンの「整列」)を削除した。
// 座標を1つずつ最寄りグリッドへ丸める方式で、グリッド線の中間をまたぐ2点が
// 反対方向へ引き離される(実測: 端子104・配線端106 の差2 → 100と110 の差10)。
// 繋がりを直すつもりが壊すため、方式として救えないと判断した。
// 代わりは alignByBasePoint()(基準点合わせ)。経緯は HANDOFF.md 参照。

// 独立テキストの「揃え」機能（AutoCAD TEXTALIGNに準拠した方式）
// 選択したテキストのうち、最初に選んだもの(=Set挿入順の先頭)を基準にし、
// 左揃え/右揃え/上揃え/下揃え/中央揃え(横)/中央揃え(縦)のいずれかで他のテキストを移動する。
// 手順: ①基準・対象数を確認 → ②揃え方向を選択 → ③実行(Undo対応)＋結果を数秒ハイライト
// ----------------------------------------------------------------
// 【2026-10-06】シンボルの文字(デバイス名・型式・仕様)を縦一列に揃える(盛田さん)
// 「文字揃えは型式・仕様・線番・端子番号が揃うなら意味がある、テキストだけだとあまり意味がない」
// 「xyの数値をそろえるとかだが、シンボルによって違うよな」「デバイスと型式、仕様の文字を縦列できれいに並べるとかはかなり使える」(縦に並んだ ELB1・MCCB2・MC1・M の画面)
// → 補正の数値は「シンボルの中心から」で、シンボルの大きさで初期位置も変わるので、数値を揃えても揃わない。
//   **図面の上の実際の位置**(文字の左端。文字幅はこのPCのフォントで測る)を計算し、基準の左端に来るように各シンボルの補正を逆算して入れる。
//   ・基準: 最初に選んだシンボルのデバイス名の左端(出ていなければ型式→仕様の左端)
//   ・動かすのは左右だけ(行の高さは今のまま)。図面に出ていない文字・回転させた文字は動かさない
//   ・仕様は「左揃え」にする(2行以上で中央揃えだと行ごとに左端が違い、短い行がへこむため。盛田さん「それでいい」)。表示しているメモも同じ左端
//   ・実行前に移る先(縦の線と文字の枠)を図面に出して確認。Ctrl+Z で戻せる
//   ・プロパティの仕様の「文字揃え」(1つのシンボルの中で起点のどちら側へ伸ばすか)は残す(盛田さん「残して」)
// 端子台(junction)・線番・端子番号・横一列は今回は対象外(使いたくなったら足す)
// ----------------------------------------------------------------
const _ALIGN_SKIP = ['text','dim','leader','fline','rect','circle','arc','junction','bezier','angle_dim','triangle'];
// シンボルの、図面に出ている文字(デバイス名・型式・仕様・メモ)。draw.js drawElements の位置の式と同じ
function _symTextItems(el) {
  if (!el || _ALIGN_SKIP.includes(el.type) || el.x == null || state.pdfSkipText) return [];
  if (el.textRot) return [];   // 回転させた文字は揃えない
  const d = getDef(el.type) || { w: 64, h: 34 };
  const sc = el.scale || 1;
  const meas = (font, t) => { ctx.font = font; return ctx.measureText(t).width; };
  const base = el.labelOffY || (d.h * sc / 2 + 15 * sc);
  const out = [];
  if (state.showPartRef && el.partRef && !el.devHide) {
    const fs = Math.round(el.devFs || 11), w = meas(`bold ${fs}px sans-serif`, el.partRef);
    const ax = el.x + (el.devOffX || 0), y = el.y + (el.devOffY !== undefined ? el.devOffY : -(d.h * sc / 2 + 6));
    // 【2026-10-06】記号の中に置いたデバイス名(コイル・モーター等)は動かさない(盛田さん「リレーのコイルとモーターのデバイスまで引っ張る」→(1)
    //  =デバイス名だけ動かさず、型式・仕様は揃える)。文字の中心が記号の枠(回転を考えた幅・高さ)の内側なら「中に置いた名前」
    const rq = Math.abs(Math.round((el.rot || 0) / 90)) % 2 === 1;
    const hw = (rq ? d.h : d.w) * sc / 2, hh = (rq ? d.w : d.h) * sc / 2;
    const inside = Math.abs(ax - el.x) < hw && Math.abs(y - fs / 2 - el.y) < hh;
    if (!inside) out.push({ kind: 'dev', left: ax - w / 2, w, top: y - fs, h: fs + 2, apply: L => { el.devOffX = L + w / 2 - el.x; } });
  }
  if (el.showModel && el.partModel) {
    const fs = Math.round(el.modelFs || el.labelFs || 11), w = meas(`${fs}px sans-serif`, el.partModel);
    const ax = el.x + (el.modelOffX !== undefined ? el.modelOffX : (el.labelOffX || 0));
    const lblLines = el.label ? String(el.label).split('\n').length : 0, lblFs = Math.round(el.labelFs || 11);
    const y = el.y + (el.modelOffY !== undefined ? el.modelOffY : base + (lblLines ? (lblLines - 1) * Math.round(lblFs * 1.25) + fs + 3 : 0));
    out.push({ kind: 'model', left: ax - w / 2, w, top: y - fs, h: fs + 2, apply: L => { el.modelOffX = L + w / 2 - el.x; } });
  }
  const lines = s => String(s).split('\n');
  if (el.label && !el.specHide) {
    const fs = Math.round(el.labelFs || 11), ls = lines(el.label), lh = Math.round(fs * 1.25);
    const w = Math.max(...ls.map(t => meas(`${fs}px sans-serif`, t)));
    const ax = el.x + (el.labelOffX || 0), al = el.labelAlign || 'center';
    const left = al === 'left' ? ax : al === 'right' ? ax - w : ax - w / 2;
    out.push({ kind: 'spec', left, w, top: el.y + base - fs, h: (ls.length - 1) * lh + fs + 2, apply: L => { el.labelOffX = L - el.x; el.labelAlign = 'left'; } });
  }
  if (el.showNote && el.note) {
    const fs = Math.round(el.noteFs || el.labelFs || 11), ls = lines(el.note), lh = Math.round(fs * 1.25);
    const w = Math.max(...ls.map(t => meas(`${fs}px sans-serif`, t)));
    let auto = base;
    if (el.label && !el.specHide) auto += lines(el.label).length * lh;
    if (el.showModel && el.partModel) auto += lh;
    const ax = el.x + (el.noteOffX !== undefined ? el.noteOffX : (el.labelOffX || 0)), al = el.labelAlign || 'center';
    const left = al === 'left' ? ax : al === 'right' ? ax - w : ax - w / 2;
    const y = el.y + (el.noteOffY !== undefined ? el.noteOffY : auto);
    out.push({ kind: 'note', left, w, top: y - fs, h: (ls.length - 1) * lh + fs + 2, apply: L => { el.noteOffX = L - el.x; el.labelAlign = 'left'; } });
  }
  return out;
}

// 選んだシンボルの文字の左端を揃える。syms: 選んだ順のシンボル。戻り値は実行の約束(テスト用)
function alignSymTexts(syms) {
  const order = [...state.sel.els];
  syms = syms.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const items = syms.map(el => ({ el, it: _symTextItems(el) })).filter(o => o.it.length);
  if (!items.length) { alert('揃える文字がありません(デバイス名・型式・仕様を図面に出しているシンボルを選んでください)。'); return null; }
  const b0 = items[0].it;
  const ref = b0.find(t => t.kind === 'dev') || b0.find(t => t.kind === 'model') || b0[0];
  const L = ref.left;
  const moves = [];
  items.forEach(o => o.it.forEach(t => { if (Math.abs(t.left - L) > 0.05 || (t.kind === 'spec' && (o.el.labelAlign || 'center') !== 'left')) moves.push(t); }));
  const nSym = items.length, refName = items[0].el.partRef || '(デバイス名なし)';
  if (!moves.length) { alert(`選んだ${nSym}個のシンボルの文字は、もう左端が揃っています。`); return null; }
  // 移る先を図面に出してから聞く(移る先の縦の線と、文字の枠)
  const top = Math.min(...items.flatMap(o => o.it.map(t => t.top))), bot = Math.max(...items.flatMap(o => o.it.map(t => t.top + t.h)));
  state.alignPreview = { x: L, y1: top - 10, y2: bot + 10, boxes: moves.map(t => ({ x: L, y: t.top, w: t.w, h: t.h })) };
  draw();
  return new Promise(res => setTimeout(() => {
    const ok = confirm(`選んだ${nSym}個のシンボルの文字(デバイス名・型式・仕様)の左端を、「${refName}」のデバイス名の左端にそろえます(オレンジの線と枠が移る先)。\n`
      + `動かす文字: ${moves.length}個(左右だけ。行の高さは今のまま。仕様は左揃えにします)\n\nよろしいですか？(実行後は Ctrl+Z で戻せます)`);
    state.alignPreview = null;
    if (!ok) { draw(); res(false); return; }
    pushH();
    moves.forEach(t => t.apply(L));
    state.snapFlash = { pts: moves.map(t => ({ x: L, y: t.top + t.h / 2 })), t0: Date.now() };
    const anim = () => { if (!state.snapFlash) return; if (Date.now() - state.snapFlash.t0 > 3000) { state.snapFlash = null; draw(); return; } draw(); requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
    draw(); if (typeof updateRightPanel === 'function') updateRightPanel();
    res(true);
  }, 30));
}

function alignTexts() {
  // シンボルを選んでいれば、シンボルの文字を縦一列に揃える(2026-10-06 上の alignSymTexts)。独立テキストだけなら今までどおり
  const syms = state.elements.filter(el => state.sel.els.has(el.id) && _symTextItems(el).length);
  if (syms.length) { alignSymTexts(syms); return; }
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

  // 移動したテキストを数秒間オレンジでハイライト（state.snapFlash を draw.js が描く）
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

// ----------------------------------------------------------------
// 基準点合わせ — 人が指した1点を最寄りグリッドに乗せ、選択物を丸ごと平行移動する
//
// 【2026-09-19・なぜこの形なのか】
// 「グリッドに乗っていない図形は編集できない」(スナップで狙えない)を直す機能。
// かつてあった snapNearGrid(リボンの「整列」) は座標を1つずつ最寄りグリッドへ
// 丸めるため、グリッド線の中間をまたぐ2点が反対方向へ引き離される。端子と配線端の
// 距離が2から10に広がる例を実測で確認し、**直したいものが壊れる**ため撤去した
// (2026-09-19)。
//
// かといって選択物を剛体として動かす場合、決められるのは dx,dy の1組だけで、
// 「塊の中のどこがグリッドに乗るか」は選べない(軸あたり自由度1)。
// そこで**乗せる点を人に指してもらう**。貼り付け(pasteSelected)が既に
// 「基準点をクリック→そこを基準に動かす」方式で動いているので、それに倣った。
//
// 平行移動なので図形同士の位置関係は一切変わらない(端子と配線の距離も、
// 配線の直交も保たれる)。移動量は必ずグリッドの半分以内になる。
function alignByBasePoint() {
  const n = state.sel.els.size + state.sel.wires.size;
  if (!n) {
    alert('先に対象を選択してください。\n\n'
        + '選択したものを「丸ごと」動かすので、繋がっている配線ごと選ぶと関係が保たれます。');
    return;
  }
  state.mode = 'gridbase';
  document.getElementById('s-hint').textContent =
    `基準点をクリック（この点が最寄りグリッドに乗ります。選択中の${n}個が一緒に動きます）  [ESC] キャンセル`;
  draw();
}

// 基準点が決まった時点で呼ぶ。pt は getAllSnapPoints() の戻り値。
function commitAlignByBasePoint(pt) {
  const g = state.G;
  const dx = Math.round(pt.x / g) * g - pt.x;
  const dy = Math.round(pt.y / g) * g - pt.y;
  const exitMode = () => {
    state.mode = 'select';
    document.getElementById('s-hint').textContent = '';
    syncModeButtons('select');
    updateHint(); draw();
  };
  const r = v => Math.round(v * 1000) / 1000;   // 表示用(浮動小数のゴミを出さない)

  if (dx === 0 && dy === 0) {
    alert(`基準点 (${r(pt.x)}, ${r(pt.y)}) は既にグリッドに乗っています。移動しません。`);
    exitMode();
    return;
  }
  const nEl = state.sel.els.size, nW = state.sel.wires.size;
  if (!confirm(
      `基準点 (${r(pt.x)}, ${r(pt.y)}) を (${r(pt.x + dx)}, ${r(pt.y + dy)}) へ移動します。\n\n`
      + `選択中の 図形${nEl}個・配線${nW}本 が、まとめて (${r(dx)}, ${r(dy)}) 動きます。\n`
      + `図形どうしの位置関係は変わりません。\n（実行後はCtrl+Zで戻せます）`)) {
    exitMode();
    return;
  }
  pushH();
  state.elements.filter(el => state.sel.els.has(el.id)).forEach(el => moveEntity(el, dx, dy));
  state.wires.filter(w => state.sel.wires.has(w.id)).forEach(w => moveEntity(w, dx, dy));
  exitMode();
  document.getElementById('s-hint').textContent =
    `基準点をグリッドに乗せました（${r(dx)}, ${r(dy)} 移動）`;
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
  updateResizeHandles();   // 消した要素のハンドルが残らないようにする
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

  if (typeof xrefReset === 'function') xrefReset();   // 別の図面になるので、クロスリファレンスの結果は捨てる
  state.pages = [{ name: 'Sheet1', elements: [], wires: [], groups: [], guides: [], frameObj: null }];
  state.currentPage = 0;
  state.saveFileName = '';
  state.drawingTbTpls = {};   // 前の図面の表題欄様式の写しは持ち越さない(段階2)
  state.drawingSymbols = {};  // 前の図面のシンボルも持ち越さない(段階3。パレットはライブラリ＋ブラウザの旧データになる)
  state.sel.els.clear(); state.sel.wires.clear();
  state.wirePoints = []; state.preview = null;
  state.hist = []; state.redoHist = [];

  // localStorageの自動保存データも消す。これをしないと次回リロード時に
  // また元の図面が復元されてしまい「新規作成」の意味がなくなるため。
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}

  if (typeof rebuildSymbolPalette === 'function') rebuildSymbolPalette();
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

// 選択がグループに合わせて広がったことを画面に出す。
// ステータスバーの文字は小さく見落としやすいので、広がったときだけ色と太字で
// 目立たせ、件数も残す(グループ化の確認メッセージでも使う)。
// 自分が出したヒント以外(自動保存の警告など)は消さない。
// 通知の文面。「範囲外 +N要素」では何が起きたのか伝わらないので、
// 起きたことをそのまま書く。グループ名(デバイス記号・型番)があれば出す。
function selExpandMessage(added, dissolved, total) {
  const names = (dissolved || [])
    .map(g => [g.partRef, g.partModel].filter(Boolean).join(' '))
    .filter(Boolean);
  const who = names.length === 1 ? `グループ「${names[0]}」`
            : (dissolved || []).length === 1 ? 'グループ'
            : `${(dissolved || []).length}個のグループ`;
  return `▲ ${who}の一部を選んだので、同じグループの残り${added}要素も一緒に選ばれました`
       + `（選択は合計${total}要素）`;
}

function noteSelExpand(added) {
  state.selExpanded = added || 0;
  const h = (typeof document === 'undefined') ? null : document.getElementById('s-hint');
  if (!h) return;
  if (added) {
    h.textContent = selExpandMessage(added,
      groupsDissolvedBy(state.sel, state.page.groups),
      state.sel.els.size + state.sel.wires.size);
    // ステータスバー(#sb)の地色は --acc(ライト:濃い青 / ダーク:明るい水色)で、
    // テーマによって明暗が逆転する。その上に文字色だけ変えても読めないので、
    // 自前の地色を持つ白いチップにする(色はテーマ変数を使わず固定)。
    h.style.background = '#fff8e8';
    h.style.color = '#6d3410';
    h.style.padding = '1px 8px';
    h.style.borderRadius = '3px';
    h.style.opacity = '1';
    h.style.fontSize = '12px';
    h.style.fontWeight = 'bold';
    state._selExpandHint = true;
  } else if (state._selExpandHint) {
    h.textContent = '';
    h.style.background = ''; h.style.color = ''; h.style.padding = '';
    h.style.borderRadius = ''; h.style.opacity = ''; h.style.fontSize = '';
    h.style.fontWeight = '';
    state._selExpandHint = false;
  }
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
function dissolveGroupsMessage(dissolved, expanded) {
  const names = dissolved.map(g =>
    [g.partRef, g.partModel].filter(Boolean).join(' ') ||
    `名前なし(${(g.elIds||[]).length + (g.wireIds||[]).length}要素)`
  );
  const exp = expanded
    ? `※グループの一部を選んだため、同じグループの残り ${expanded}要素 も\n` +
      '  一緒に選ばれています。そのため、新しいグループの枠は\n' +
      '  マウスで囲んだ範囲より大きくなります。\n'
    : '';
  return `選択に既存グループが ${dissolved.length}個 含まれています:\n  ${names.join('\n  ')}\n\n` +
         'グループ化すると、これらは解体されて1つの新しいグループにまとまります。\n' +
         'グループが持っているデバイス記号・型番(部品表に出る値)は失われます。\n' +
         exp + '\n続けますか？';
}

function groupSelected() {
  const elIds   = [...state.sel.els];
  const wireIds = [...state.sel.wires];
  if (!elIds.length && !wireIds.length) return;
  state.page.groups = state.page.groups || [];
  // 既存グループを黙って解体しない。掛かっているものがあれば中身を示して確認する。
  const dissolved = groupsDissolvedBy(state.sel, state.page.groups);
  if (dissolved.length && typeof confirm === 'function' &&
      !confirm(dissolveGroupsMessage(dissolved, state.selExpanded))) return;
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
        // 【2026-10-05】弧の向き(ccw)と反転を入れる。以前は ccw を落とし反転も見ていなかったので、分解すると弧が反対側になった
        // (盛田さん「シンボル分解しても弧の向きが変わる」)。描くとき(symbols.js)は 反転→回転 の順で、角度 a の点は
        // (cos a·fH, sin a·fV) を rot だけ回した所。反転が奇数回なら回る向きが逆になる
        const xa = deg => Math.atan2(Math.sin(deg * Math.PI / 180) * fV, Math.cos(deg * Math.PI / 180) * fH) + rot;
        const ccw = (fH * fV < 0) ? !s.ccw : !!s.ccw;
        state.elements.push({ id, type: 'arc', x: c.x, y: c.y, r: s.r * sc, startA: xa(s.sa || 0), endA: xa(s.ea || 0), ccw, layer: lay });
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
  // ボタンの点灯は syncModeButtons() に任せる(個別のidを触ると、リボンと
  // クイックバーのどちらかを直し忘れる。2026-09-19 に実際に起きた)
  syncModeButtons('partref');
  document.getElementById('s-hint').textContent = `「${state.partRefNext}」を割り当て → シンボルをクリック  [ESC] 終了`;
  draw();
}
function exitPartRefSeq() {
  state.mode = 'select';
  document.getElementById('s-hint').textContent = '';
  syncModeButtons('select');
  updateHint(); draw();
}

// 線番 連続採番モード：開始線番を指定→配線をクリックするたびに自動採番
// 【2026-10-04】開始番号の入力窓をやめ、線番の書式(js/report.js wnFmt)で、このページの空いている番号から順に入れる
function startWireNoSeq() {
  if (typeof _syncCurrentPage === 'function') _syncCurrentPage();
  const pp = wnPagePart(state.currentPage || 0);
  if (pp.err) { alert(pp.err); return; }
  state.wireNoNext = wnNextFree(pp.part, wnUsedNos());
  if (!state.wireNoNext) { alert(`このページの連番が${wnFmt().seqDigits}桁で使い切られています。線番の設定で連番の桁数を増やしてください。`); return; }
  state.mode = 'wireno'; state.symType = null;
  document.querySelectorAll('.sym-item').forEach(el => el.classList.remove('on'));
  syncModeButtons('wireno');
  document.getElementById('s-hint').textContent = `「${state.wireNoNext}」を割り当て → 配線をクリック  [ESC] 終了`;
  draw();
}
function exitWireNoSeq() {
  state.mode = 'select';
  document.getElementById('s-hint').textContent = '';
  syncModeButtons('select');
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
      // 【2026-10-04】フロートパネルが開いていれば、まず一番手前のパネルを閉じる(js/ui.js fpCloseTop)
      if (typeof fpCloseTop === 'function' && fpCloseTop()) { e.preventDefault(); break; }
      if (state.mode === 'partref') {
        exitPartRefSeq(); break;
      }
      if (state.mode === 'wireno') {
        exitWireNoSeq(); break;
      }
      if (state.mode === 'gridbase') {
        state.mode = 'select';
        document.getElementById('s-hint').textContent = '';
        syncModeButtons('select');
        updateHint(); draw(); break;
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
      syncModeButtons('select');
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
  if (typeof xrefReset === 'function') xrefReset();   // ページ番号がずれるので、クロスリファレンスの結果は捨てる

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


// ================================================================
// 【2026-09-19】読み込めたことの目印。
// サーバーが落ちた状態でCADを開くとJSが虫食いで落ち(ERR_CONNECTION_REFUSED)、
// 一部の関数が無いまま起動して図面が真っ白になる事故が起きた。その状態のまま
// 自動保存が走ると、欠けた状態のデータで上書きされかねない。
// autosave.js の _asMissingScripts() が、index.html の <script> タグと
// この目印を突き合わせて「読み込めていないファイル」を検出する。
// 目印はファイル末尾に置く(先頭だと、途中で落ちたファイルも「読めた」ことになる)。
// ================================================================
if (typeof window !== 'undefined') (window.__ecadLoaded = window.__ecadLoaded || {})['edit.js'] = 1;
