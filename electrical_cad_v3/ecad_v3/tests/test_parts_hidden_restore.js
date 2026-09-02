// 非表示にした標準部品を戻せるかのテスト
//   node tests/test_parts_hidden_restore.js
//
// 【背景・2026-09-02】
// 標準部品(BUILTIN_PARTS)はコードに埋め込まれていて削除できないので、
// 一覧から消したいときは「非表示」にする。戻す入口は元々
// **部品DB一覧の一番下**にある小さなリンク1つだけだった。
// 部品DBが605件になった今、そこに辿り着くには全部スクロールし切る必要があり、
// しかも押すと別のパネル(カスタム部品登録)が開いて、その中ほどの
// 見出しの無い箱に一覧が出ていた。実機で「復元できない」と言われた。
//
// 隠したものを戻す操作は、隠した場所の隣に無ければ見つからない。
// 一覧の**先頭**に畳めるブロックとして出す形に変えた。
//
// このテストが守るもの:
//   1. 戻す入口が一覧の先頭にある(末尾ではない・スクロールが要らない)
//   2. 非表示にした直後は開いていて、行き先がその場で見える
//   3. 「再表示する」で本当に戻り、保存もされる
//   4. 1件も非表示が無いときは何も出さない(常時出ていると邪魔なだけ)

const fs = require('fs');
const vm = require('vm');
const { escH } = require('./_esch.js');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const UI = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
// 種別コードの定義(PART_TYPE_LABELS等)は2026-09-02にjs/part_types.jsへ切り出した
// (部品DB単独画面と共有するため)。
const TYPES = fs.readFileSync(__dirname + '/../js/part_types.js', 'utf8');

// ui.js から関数を名前で取り出す(丸ごと評価するとDOM依存が多すぎるため)。
// 実ソースから取るので、本体を直せばテストも自動で追従する。
function fn(name) {
  const start = UI.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`js/ui.js に ${name}() が見つかりません`);
  const end = UI.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`${name}() の終わりが見つかりません`);
  return UI.slice(start, end + 3);
}
function decl(re, label, src = UI) {
  const m = src.match(re);
  if (!m) throw new Error(`ソースに ${label} が見つかりません`);
  return m[0];
}

function build(hiddenRefs, parts) {
  const table = { innerHTML: '' };
  const sandbox = {
    console, escH,
    document: { getElementById: id => (id === 'parts-table2' ? table : null) },
    state: { hiddenBuiltinRefs: hiddenRefs.slice(), customParts: [], partsCollapsed: {} },
    confirm: () => true,
    // 保存が呼ばれたかを数える。非表示・再表示は部品DBに書く操作なので、
    // ここが呼ばれないと変更が次の起動で消える。
    partsDb: { scheduleSave: () => { sandbox.saves++; } },
    saves: 0,
    renderPartsAll: () => sandbox.renderPartsTable2(parts),
    _lastPartsQuery: '',
    _lastPartsList: null,
  };
  vm.createContext(sandbox);
  [decl(/const PART_TYPE_LABELS = \{[\s\S]*?\n\};/, 'PART_TYPE_LABELS', TYPES),
   decl(/const PART_TYPE_ORDER = \[[^\]]*\];/, 'PART_TYPE_ORDER', TYPES),
   decl(/const LEGACY_PART_TYPES = \{[^}]*\};/, 'LEGACY_PART_TYPES', TYPES),
   decl(/let _partsHiddenOpen = [^;]*;/, '_partsHiddenOpen'),
   fn('_escAttr'), fn('_isCollapsed'), fn('hiddenPartsBlockHtml'),
   fn('togglePartsHidden'), fn('hideBuiltinPart'), fn('unhideBuiltinPart'),
   fn('renderPartsTable2'),
  ].forEach(src => vm.runInContext(src, sandbox));
  ['renderPartsTable2', 'hideBuiltinPart', 'unhideBuiltinPart', 'togglePartsHidden']
    .forEach(n => { sandbox[n] = vm.runInContext(n, sandbox); });
  sandbox.table = table;
  return sandbox;
}

// 605件規模の一覧を作る(入口が末尾にあると埋もれる、という状況そのもの)
const PARTS = Array.from({ length: 605 }, (_, i) => ({
  ref: 'P' + i, maker: 'メーカー' + (i % 12), type: 'breaker', custom: false,
}));

// ------------------------------------------------------------------
console.log('【戻す入口は一覧の先頭にある】');
{
  const s = build(['S-T21'], PARTS);
  s.renderPartsTable2(PARTS);
  const html = s.table.innerHTML;
  const entry = html.indexOf('非表示にした標準部品');
  const firstMaker = html.indexOf('class="parts-maker"');
  ok(entry >= 0, '入口が出ている');
  ok(entry < firstMaker,
     '★最初のメーカー欄より前にある(605件をスクロールし切らなくても届く)');
  ok(!/unhideBuiltinPart/.test(html), '畳んでいるときは中身を出さない');
  ok(!/showHiddenBuiltinParts/.test(html),
     '★別パネルへ飛ばす古い導線が残っていない');
}

// ------------------------------------------------------------------
console.log('\n【非表示にした直後は開いていて、行き先が見える】');
{
  const s = build([], PARTS);
  s.renderPartsTable2(PARTS);
  ok(!/非表示にした標準部品/.test(s.table.innerHTML),
     '1件も無ければ何も出さない');

  s.hideBuiltinPart('S-T21');
  const html = s.table.innerHTML;
  ok(/非表示にした標準部品（1）/.test(html), '件数が出る');
  ok(html.indexOf('S-T21') < html.indexOf('class="parts-maker"'),
     '★隠した型番がその場に見えている(どこへ行ったか分かる)');
  ok(/再表示する/.test(html), '★戻すリンクがすぐ横にある');
  eq(s.saves, 1, '非表示は部品DBに保存される');
}

// ------------------------------------------------------------------
console.log('\n【再表示で本当に戻る】');
{
  const s = build([], PARTS);
  s.renderPartsTable2(PARTS);
  s.hideBuiltinPart('S-T21');
  s.hideBuiltinPart('MY2N');
  eq(s.state.hiddenBuiltinRefs, ['S-T21', 'MY2N'], '2件が非表示になっている');

  s.unhideBuiltinPart('S-T21');
  eq(s.state.hiddenBuiltinRefs, ['MY2N'], '★指定した1件だけが戻る');
  eq(s.saves, 3, '再表示も保存される(戻したことが次の起動で消えない)');
  const html = s.table.innerHTML;
  ok(/非表示にした標準部品（1）/.test(html), '一覧の件数もその場で更新される');
  ok(!/S-T21/.test(html), '戻した分は消えている');

  s.unhideBuiltinPart('MY2N');
  eq(s.state.hiddenBuiltinRefs, [], '全部戻せる');
  ok(!/非表示にした標準部品/.test(s.table.innerHTML), '0件になったら出なくなる');
}

// ------------------------------------------------------------------
console.log('\n【畳める】');
{
  const s = build(['S-T21'], PARTS);
  s.renderPartsTable2(PARTS);
  ok(!/再表示する/.test(s.table.innerHTML), '既定は畳んだ状態');
  s.togglePartsHidden();
  ok(/再表示する/.test(s.table.innerHTML), '押すと開く');
  s.togglePartsHidden();
  ok(!/再表示する/.test(s.table.innerHTML), 'もう一度押すと閉じる');
}

// ------------------------------------------------------------------
console.log('\n【型番に危ない文字が入っていても生のHTMLにしない】');
{
  const evil = '<img src=x onerror=alert(1)>';
  const s = build([evil], PARTS);
  s.togglePartsHidden();            // 開いた状態で描く
  const html = s.table.innerHTML;
  ok(!html.includes('<img src=x'), '★エスケープされている');
  ok(html.includes(escH(evil)), 'escH を通した形で入っている');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
