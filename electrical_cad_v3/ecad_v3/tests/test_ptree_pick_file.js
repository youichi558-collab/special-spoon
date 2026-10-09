// 「フォルダを開く」は図面を先に選ぶ(2026-10-08 js/proj_tree.js ptreeChooseRoot)
//   node tests/test_ptree_pick_file.js
// 盛田さん「フォルダを開くでファイル名が見えない状態を選択するのが問題」「ファイルそのものを選んでそのフォルダをプロジェクトとする方がいい」→「一旦試す」。
// ブラウザでの動き(図面→フォルダ・違うフォルダを選んだとき・図面を選ばずフォルダだけ)は playwright で窓を差し替えて確認済み(HANDOFF)
const fs = require('fs');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const P = fs.readFileSync(__dirname + '/../js/proj_tree.js', 'utf8').replace(/\r\n/g, '\n');
const f = P.match(/async function ptreeChooseRoot\(\) \{[\s\S]*?\n\}/)[0];
ok(/showOpenFilePicker\(fopt\)/.test(f) && f.indexOf('showOpenFilePicker') < f.indexOf('showDirectoryPicker(opt)'), '★まず図面(ファイル)の窓、続いてフォルダの窓');
ok(/if \(fh\) opt\.startIn = fh;/.test(f), '★フォルダの窓は選んだ図面のフォルダの中で開く(押すのは「フォルダーの選択」だけ)');
ok(/rel = await dir\.resolve\(fh\)/.test(f) && /は入っていません/.test(f), '選んだフォルダに図面が入っていなければ知らせて変えない');
ok(/フォルダだけ選びますか/.test(f), '図面の窓を取りやめたら、フォルダだけ選ぶ(図面の無い新しいフォルダ)か聞く');
ok(/loadProjectText\(text, fh\.name, 'replace'\)/.test(f) && /p\._src = path;/.test(f), '選んだ図面を開き、ツリーの図面として覚える(読込のようにプロジェクトを外さない=mode0 を渡す)');
ok(/ptreeState\.open\.add\(/.test(f), 'サブフォルダの図面なら、ツリーでそのフォルダを開いておく');
console.log('\n【最近のプロジェクト(案A)】');
ok(/await ptreeRecentAdd\(dir\);/.test(P.match(/async function _ptSetRoot\([\s\S]*?\n\}/)[0]), '★フォルダを替えるたびに最近のプロジェクトに入れる(同じものは先頭へ・最大 PTREE_RECENT_MAX)');
ok(/await _ptSetRoot\(dir\);/.test(f), 'フォルダを開くもプロジェクトを替える処理は共通(_ptSetRoot)');
const ro = P.match(/async function ptreeRecentOpen\([\s\S]*?\n\}/)[0];
ok(/_ptPerm\(dir, true\)/.test(ro) && /await _ptSetRoot\(dir\);/.test(ro) && !/showDirectoryPicker|showOpenFilePicker/.test(ro), '★▾ から選ぶと窓を出さずに替える(許可だけ聞くことがある)');
ok(/id="pt-recent-btn" onclick="ptreeRecentMenu\(event\)"/.test(fs.readFileSync(__dirname + '/../index.html', 'utf8').replace(/\r\n/g, '\n')), '「フォルダを開く」の横に ▾');
ok(/ptreeRecentRemove\(\$\{i\}\)/.test(P), '一覧から外せる(フォルダは消えない)');
ok(/if \(_ptRecentSeen !== root\) \{ _ptRecentSeen = root; ptreeRecentAdd\(root\); \}/.test(P), '前から開いていたフォルダも一覧に入る');
console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
