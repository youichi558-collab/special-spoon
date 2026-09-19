// 非表示にした標準部品を戻せるかのテスト
//   node tests/test_parts_hidden_restore.js
//
// 【背景・2026-09-02】
// 標準部品(BUILTIN_PARTS)はコードに埋め込まれていて削除できないので、
// 一覧から消したいときは「非表示」にする。戻す入口は元々
// **部品DB一覧の一番下**にある小さなリンク1つだけだった。実機で「復元できない」
// と言われ、一覧の**先頭**に出す形に変えた(当時はCADの部品DBパネルにあった)。
//
// 【2026-09-03】部品DB(customParts)の非表示・再表示はCAD(js/ui.js)から
// 部品DB単独画面(js/parts_page.js)へ移した。CADはもう部品DBを書かない。
// このテストは js/parts_page.js の hideBuiltin/unhideBuiltin/renderHiddenList
// を実ソースで動かして見る側に切り替えた。
//
// このテストが守るもの:
//   1. 非表示にすると保存(saveAll)される・一覧に反映される
//   2. 「再表示する」で本当に戻り、保存もされる
//   3. 1件も非表示が無いときは何も出さない(常時出ていると邪魔なだけ)
//   4. 型番に危ない文字が入っていてもエスケープされる(XSS対策)

const fs = require('fs');
const vm = require('vm');
const { escH } = require('./_esch.js');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const SRC = fs.readFileSync(__dirname + '/../js/parts_page.js', 'utf8');

function fn(name) {
  let start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`js/parts_page.js に ${name}() が見つかりません`);
  // async function の場合は "async " も含めて取り出す(落とすと await が構文エラーになる)
  if (start >= 6 && SRC.slice(start - 6, start) === 'async ') start -= 6;
  const end = SRC.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`${name}() の終わりが見つかりません`);
  return SRC.slice(start, end + 3);
}

function build(hiddenRefs) {
  const el = { innerHTML: '' };
  const sandbox = {
    console, escH,
    document: { getElementById: id => (id === 'pp-hidden' ? el : null) },
    state: { hiddenBuiltinRefs: hiddenRefs.slice(), customParts: [] },
    confirm: () => true,
    // 保存が呼ばれたかを数える。非表示・再表示は部品DBに書く操作なので、
    // ここが呼ばれないと変更が次の起動で消える。
    saveAll: async () => { sandbox.saves++; return true; },
    saves: 0,
    renderAll: () => sandbox.renderHiddenList(),
  };
  vm.createContext(sandbox);
  const _escAttr = SRC.slice(SRC.indexOf('function _escAttr'), SRC.indexOf('\n}\n', SRC.indexOf('function _escAttr')) + 3);
  const $ = 'const $ = id => document.getElementById(id);';
  [$, _escAttr, fn('renderHiddenList'), fn('hideBuiltin'), fn('unhideBuiltin')]
    .forEach(src => vm.runInContext(src, sandbox));
  ['renderHiddenList', 'hideBuiltin', 'unhideBuiltin']
    .forEach(n => { sandbox[n] = vm.runInContext(n, sandbox); });
  sandbox.el = el;
  return sandbox;
}

(async () => {

// ------------------------------------------------------------------
console.log('【1件も非表示が無ければ何も出さない】');
{
  const s = build([]);
  s.renderHiddenList();
  eq(s.el.innerHTML, '', '空のまま');
}

// ------------------------------------------------------------------
console.log('\n【非表示にすると一覧に出て、保存もされる】');
{
  const s = build([]);
  await s.hideBuiltin('S-T21');
  const html = s.el.innerHTML;
  ok(/非表示にした標準部品（1）/.test(html), '件数が出る');
  ok(html.includes('S-T21'), '隠した型番が出る');
  ok(/再表示する/.test(html), '★戻すリンクが出る');
  eq(s.saves, 1, '非表示は部品DBに保存される');
}

// ------------------------------------------------------------------
console.log('\n【再表示で本当に戻る】');
{
  const s = build([]);
  await s.hideBuiltin('S-T21');
  await s.hideBuiltin('MY2N');
  eq(s.state.hiddenBuiltinRefs, ['S-T21', 'MY2N'], '2件が非表示になっている');

  await s.unhideBuiltin('S-T21');
  eq(s.state.hiddenBuiltinRefs, ['MY2N'], '★指定した1件だけが戻る');
  eq(s.saves, 3, '再表示も保存される(戻したことが次の起動で消えない)');
  const html = s.el.innerHTML;
  ok(/非表示にした標準部品（1）/.test(html), '一覧の件数もその場で更新される');
  ok(!/S-T21/.test(html), '戻した分は消えている');

  await s.unhideBuiltin('MY2N');
  eq(s.state.hiddenBuiltinRefs, [], '全部戻せる');
  eq(s.el.innerHTML, '', '0件になったら出なくなる');
}

// ------------------------------------------------------------------
console.log('\n【型番に危ない文字が入っていても生のHTMLにしない】');
{
  const evil = '<img src=x onerror=alert(1)>';
  const s = build([evil]);
  s.renderHiddenList();
  const html = s.el.innerHTML;
  ok(!html.includes('<img src=x'), '★エスケープされている');
  ok(html.includes(escH(evil)), 'escH を通した形で入っている');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
