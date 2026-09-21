// ================================================================
// 帳票から要素を書き換えたら、プロパティ欄も追随させることの確認
//   node tests/test_report_writes_refresh.js
//
// 【2026-09-21】renumberTerminals() が updateRightPanel() を呼んで
// いなかった。端子を1つ選んだまま端子台表の「この順で番号を振り直す」を
// 押すと、図面とデータの端子番号は変わるのに**プロパティの「端子番号」欄
// (pp-jlabel)だけ古い値が残る**。その状態で欄の値が要素へ書き戻されると
// (applyRightPanel が pp-jlabel を el.label に入れる)、振り直した番号が
// 古い番号に戻る。
//
// 実機で再現させた(端子3つを 7,8,9 → 振り直し → 適用):
//     修正前: ["7","2","3"]   ← 選んでいた端子だけ古い番号に戻った
//     修正後: ["1","2","3"]
//
// 帳票から要素を書き換える経路は他にもあり(setBOMVolt / setTBExcluded)、
// そちらは最初から呼んでいた。**ここだけ抜けていた。**
// 同じ穴を新しく作らないよう、経路ごとに見張る。
//
// 【対象外】tbDrop は el.tbOrder しか書かず、tbOrder はプロパティ欄に
// 出ないので updateRightPanel() は要らない。
// ================================================================
const fs = require('fs');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG ' + m); } else console.log('  OK ' + m); };

const rep = fs.readFileSync(__dirname + '/../js/report.js', 'utf8');
const ct  = fs.readFileSync(__dirname + '/../js/conn_table.js', 'utf8');
const ui  = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');

// 関数の中身だけを取り出す(次の function 宣言まで)
function body(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`${name} が見つかりません`);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

console.log('【要素の表示値を書き換える経路は updateRightPanel を呼ぶ】');
// name, ソース, その関数が書き換える「プロパティ欄に出る値」
const WRITERS = [
  ['renumberTerminals', rep, 'el.label(端子番号)'],
  ['setBOMVolt',        rep, 'el.partVolt(コイル電圧)'],
  ['setTBExcluded',     rep, 'el.tbExclude(端子台として集計)'],
  ['setBOMMaker',       rep, 'el.partMaker(メーカー)'],
];
WRITERS.forEach(([name, src, what]) => {
  const b = body(src, name);
  ok(/updateRightPanel\(\)/.test(b), `${name} が updateRightPanel を呼ぶ（${what} を書くため）`);
  ok(/pushH\(\)/.test(b),            `${name} が pushH を呼ぶ（取り消せるように）`);
});

console.log('\n【プロパティ欄が実際にその値を書き戻すこと(この網が要る根拠)】');
{
  const apply = body(ui, 'applyRightPanel');
  ok(/el\.label\s*=\s*v\('pp-jlabel'\)/.test(apply),
     '★applyRightPanel が pp-jlabel を el.label に書き戻す'
     + '（だから欄が古いままだと番号が戻る）');
}

console.log('\n【tbDrop は対象外(tbOrder はプロパティ欄に出ない)】');
{
  const b = body(rep, 'tbDrop');
  ok(/reorderTerminal\(/.test(b), 'tbDrop は並び順(tbOrder)だけを変える');
  ok(!/pp-jorder|pp-tborder/.test(ui), 'tbOrder を出すプロパティ欄が存在しない');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
