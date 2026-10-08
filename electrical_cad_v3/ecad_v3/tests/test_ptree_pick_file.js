// 「フォルダを開く」は図面を先に選ぶ(2026-10-08 js/proj_tree.js ptreeChooseRoot)
//   node tests/test_ptree_pick_file.js
// 盛田さん「フォルダを開くでファイル名が見えない状態を選択するのが問題」「ファイルそのものを選んでそのフォルダをプロジェクトとする方がいい」→「一旦試す」。
// ブラウザでの動き(図面→フォルダ・違うフォルダを選んだとき・図面を選ばずフォルダだけ)は playwright で窓を差し替えて確認済み(HANDOFF)
const fs = require('fs');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const P = fs.readFileSync(__dirname + '/../js/proj_tree.js', 'utf8');
const f = P.match(/async function ptreeChooseRoot\(\) \{[\s\S]*?\n\}/)[0];
ok(/showOpenFilePicker\(fopt\)/.test(f) && f.indexOf('showOpenFilePicker') < f.indexOf('showDirectoryPicker(opt)'), '★まず図面(ファイル)の窓、続いてフォルダの窓');
ok(/if \(fh\) opt\.startIn = fh;/.test(f), '★フォルダの窓は選んだ図面のフォルダの中で開く(押すのは「フォルダーの選択」だけ)');
ok(/rel = await dir\.resolve\(fh\)/.test(f) && /は入っていません/.test(f), '選んだフォルダに図面が入っていなければ知らせて変えない');
ok(/フォルダだけ選びますか/.test(f), '図面の窓を取りやめたら、フォルダだけ選ぶ(図面の無い新しいフォルダ)か聞く');
ok(/loadProjectText\(text, fh\.name, 'replace'\)/.test(f) && /p\._src = path;/.test(f), '選んだ図面を開き、ツリーの図面として覚える(読込のようにプロジェクトを外さない=mode0 を渡す)');
ok(/ptreeState\.open\.add\(/.test(f), 'サブフォルダの図面なら、ツリーでそのフォルダを開いておく');
console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
