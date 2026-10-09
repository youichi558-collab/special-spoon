// 明るい表示の白い文字・読込のプロジェクト(2026-10-08)
//   node tests/test_light_text_and_load.js
// 盛田さん「２と４かな」→「はい」。
//   4: 明るい表示では白(とほぼ白)の文字を黒で描く(図面のデータの色は変えない)。PDF の 'color' と同じ決まり
//   2: 読込はファイルの窓で選び、今のプロジェクトの中の図面ならプロジェクトのまま・外ならそのフォルダをプロジェクトにするか聞く
// ブラウザでの動きは playwright で確認済み(HANDOFF)
const fs = require('fs');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const D = R('js/draw.js'), E = R('js/edit.js'), P = R('js/proj_tree.js'), H = R('index.html');

console.log('【4 明るい表示の白い文字】');
const lf = D.match(/function _lightTextFix\(c\) \{[\s\S]*?\n\}/)[0];
ok(/const on = !state\.pdfMode && !state\.darkMode/.test(lf) && /pdfWrapCtx\(c, 'color'\)/.test(lf), '★明るい表示(と紙に描くとき以外)だけ、PDF の「白い文字は黒」と同じ差し替えを掛ける');
ok(/else if \(!on && c\._lightFix\) \{ delete c\.fillText;/.test(lf), 'ダーク表示に戻したら外す(白のまま)');
ok(/function draw\(\) \{\s*_lightTextFix\(ctx\);/.test(D), '描くたびに今の表示に合わせる');
ok(!/devColor\s*=/.test(lf), '図面のデータの色は変えない');

console.log('\n【2 読込とプロジェクト】');
ok(/<div class="rb rb-sm" onclick="loadPick\(\)">/.test(H) && /showOpenFilePicker\(/.test(E.match(/async function loadPick\(\) \{[\s\S]*?\n\}/)[0]), '★読込はファイルの窓(選んだ図面の場所が分かる)');
ok(/if \(!window\.showOpenFilePicker\) \{ document\.getElementById\('load-in'\)\.click\(\); return; \}/.test(E), '窓が使えないブラウザは今までの選び方');
ok(/if \(!mode0 && opts && opts\.fh && typeof ptreeAfterLoadFile === 'function'\) ptreeAfterLoadFile\(opts\.fh\);\s*else if \(!mode0 && typeof ptreeDetach === 'function'\) ptreeDetach\(\);/.test(E), '置き換えで開いたら、ファイルの鍵があればプロジェクトの判定へ・無ければ今まで通り外す');
const al = P.match(/async function ptreeAfterLoadFile\(fh\) \{[\s\S]*?\n\}/)[0];
ok(/rel = await root\.resolve\(fh\)/.test(al) && /_ptAdoptLoaded\(fh, rel\)/.test(al), '★今のプロジェクトの中の図面なら聞かずにプロジェクトのまま(上書き保存も効く)');
ok(/await ptreeDetach\(\);[\s\S]*_ptAskAdopt\(fh\);/.test(al), '外の図面はひとまず外して、プロジェクトにするか聞く');
const ask = P.match(/function _ptAskAdopt\(fh\) \{[\s\S]*?\n\}/)[0];
ok(/showDirectoryPicker\(\{ id: 'ecad-ptree', mode: 'readwrite', startIn: fh \}\)/.test(ask) && /dir\.resolve\(fh\)/.test(ask), '「する」→ フォルダの窓をその図面のフォルダで開き、入っているか確かめる');
ok(/id="pt-adopt-yes"/.test(ask) && /id="pt-adopt-no"/.test(ask), '聞くのは画面の中のボタン(押した直後に窓を出すため)');
console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
