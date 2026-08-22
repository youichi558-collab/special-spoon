// ================================================================
// 構成子（型式ビルダー）方式  ── 2026-08-22 段階1: ロジックのみ
// ================================================================
// 【背景】盛田さんの指摘から出てきた話。
// メーカーのカタログは「完成型式の一覧」ではなく「基本型式＋記号表」という
// 組み立て式で書かれている。例えば富士のブレーカは
//     BW 32 AAG - 3P 005 W K F□ …
//                      ↑   ↑ ↑ ↑
//                   定格電流 補助 警報 電圧引外し
// のように末尾に記号を並べる方式で、組み合わせは掛け算になる。
// 「補助スイッチ付き」は BW32AAG-3P005W という別型式であり、部品表に出して
// 発注するにはこの完成型式が要る。しかし全組み合わせを展開して登録するのは
// 現実的でない（1電流値あたり数十通り）。
//
// そこで部品DBのレコードに options（記号表）を持たせ、図面側で選ばせて
// 完成型式をその場で組み立てる。これは既に動いているコイル電圧
// （el.partVolt = 「型番は同じだが図面ごとに1つ選ぶ」）と同じ考え方で、
// 選択結果は el.partOpts に持たせる。
//
// 【この段階でやること】データ構造・型式組み立て・仕様解決のみ。
// 画面には出さないので既存の動作には影響しない。
//
// --- データ構造 ---------------------------------------------------
// 部品レコード（parts_db.json）に options を足すだけ。無い部品は従来どおり。
//
//   {
//     maker: '富士電機', ref: 'BW32AAG-3P', type: 'breaker',
//     terminals: '主回路:1,2,3,4,5,6',        // 基本部の端子（常に付く）
//     options: [
//       { name:'定格電流', required:true, items:[
//           { code:'005', label:'5A',  amp:'5A' },
//           { code:'010', label:'10A', amp:'10A' } ] },
//       { name:'補助スイッチ', items:[
//           { code:'',  label:'なし' },
//           { code:'W', label:'1個', terminals:'補助:11,12,14' },
//           { code:'V', label:'2個', terminals:'補助1:11,12,14 / 補助2:21,22,24' } ] },
//     ]
//   }
//
// 選択結果（図面の要素側）:
//   el.partOpts = { '定格電流':'005', '補助スイッチ':'W' }
//
// items の各項目は code（型式に連結する記号）と label（人が読む名前）を持ち、
// さらに amp/contacts/volt/terminals を上書き値として持てる。
// 「その記号を選んだことで仕様や端子が増える」ことを表現するため。
// ================================================================

// 構成子を持つ部品かどうか
function hasPartOptions(p) {
  return !!(p && Array.isArray(p.options) && p.options.length);
}

// 既定の選択（各軸の先頭 items[0]）を返す。
// required でない軸は「なし」(code:'') が先頭に来る想定。
function defaultPartOpts(p) {
  const sel = {};
  if (!hasPartOptions(p)) return sel;
  p.options.forEach(opt => {
    if (opt.items && opt.items.length) sel[opt.name] = opt.items[0].code ?? '';
  });
  return sel;
}

// 選択された item を取り出す（見つからなければ null）
function findOptItem(opt, code) {
  if (!opt || !opt.items) return null;
  const c = code ?? '';
  return opt.items.find(it => (it.code ?? '') === c) || null;
}

// 完成型式を組み立てる。
//   buildPartModel(part, {'定格電流':'005','補助スイッチ':'W'}) → 'BW32AAG-3P005W'
// options の並び順がそのまま記号の並び順になる（カタログの形式説明の順に
// 定義しておくこと）。未選択・「なし」の軸は何も連結しない。
function buildPartModel(p, sel) {
  if (!p) return '';
  let s = p.ref || '';
  if (!hasPartOptions(p)) return s;
  const chosen = sel || {};
  p.options.forEach(opt => {
    const it = findOptItem(opt, chosen[opt.name]);
    if (it && (it.code ?? '') !== '') s += it.code;
  });
  return s;
}

// 選択内容を反映した仕様を返す。
// 基本部の値を土台に、選ばれた item が持つ値で上書き／端子は追記する。
//   → { amp, contacts, volt, terminals }
// terminals は「名前付きグループ」形式（parseTerminalGroups が読む形）で
// 連結する。基本部の主回路に、選んだ付属装置の端子が足されていくイメージ。
function resolvePartSpec(p, sel) {
  const out = {
    amp: p?.amp || '', contacts: p?.contacts || '',
    volt: p?.volt || '', terminals: p?.terminals || '',
  };
  if (!hasPartOptions(p)) return out;
  const chosen = sel || {};
  p.options.forEach(opt => {
    const it = findOptItem(opt, chosen[opt.name]);
    if (!it) return;
    if (it.amp)      out.amp = it.amp;
    if (it.contacts) out.contacts = it.contacts;
    if (it.volt)     out.volt = it.volt;
    if (it.terminals) {
      out.terminals = out.terminals ? `${out.terminals} / ${it.terminals}` : it.terminals;
    }
  });
  return out;
}

// 図面の要素から「部品表に出す型式」を得る。
// 構成子を持たない部品は従来どおり el.partModel をそのまま返すので、
// 既存データ・既存図面はこの関数を通しても値が変わらない（後方互換）。
function elPartModel(el, parts) {
  if (!el || !el.partModel) return '';
  const p = (parts || []).find(x => x.ref === el.partModel);
  if (!hasPartOptions(p)) return el.partModel;
  return buildPartModel(p, el.partOpts || defaultPartOpts(p));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasPartOptions, defaultPartOpts, findOptItem,
    buildPartModel, resolvePartSpec, elPartModel,
  };
}
