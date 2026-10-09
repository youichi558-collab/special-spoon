// シンボルの大きさの焼き込み(2026-10-07 js/sym_store.js symBakeDef・symCommonScale・symBakeFixElements)
//   node tests/test_sym_bake.js
// 盛田さん「ほかのCADと合わせたい」: シンボルは図面で使う大きさで登録し、置くときは等倍。
// 「登録シンボルと比べる」で足すと元の大きさ(79×75)で入り、パネルから置くと図面で 0.3 倍に縮めた記号の3倍で出ていた。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const S = R('js/sym_store.js');
const pick = n => S.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'))[0];
const sb = { state: {}, renderPageTabs: () => {} };
vm.createContext(sb);
vm.runInContext(['symBakeDef', 'symCommonScale', 'symBakeFixList', 'symBakeFixElements', 'symTidyCandidates', 'symTidyApplyToData', '_symCopyAtLibSize'].map(pick).join('\n'), sb);

const orig = { type: 'lib_mc', name: '電磁接触器', w: 80, h: 60,
  shapes: [{ t: 'L', x1: -40, y1: 0, x2: 40, y2: 0, lineWidth: 0.5 }, { t: 'C', cx: 0, cy: 0, r: 10 }, { t: 'R', x: -20, y: -10, w: 40, h: 20 },
    { t: 'P', pts: [[0, 0], [10, 20]] }, { t: 'A', cx: 0, cy: 0, r: 20, sa: 0, ea: 90 }, { t: 'T', text: 'MC', x: 5, y: 5, fs: 20 }],
  terminals: [{ x: -40, y: 0, label: '1' }, { x: 40, y: 0, label: '2' }] };

console.log('【形に倍率を掛ける】');
const b = sb.symBakeDef(orig, 0.3);
ok(near(b.w, 24) && near(b.h, 18), '幅・高さ 80×60 → 24×18');
ok(near(b.shapes[0].x1, -12) && near(b.shapes[0].x2, 12) && b.shapes[0].lineWidth === 0.5, '線の端は 0.3 倍・線の太さはそのまま(描くときに倍率で変わらない)');
ok(near(b.shapes[1].r, 3) && near(b.shapes[2].w, 12) && near(b.shapes[3].pts[1][1], 6) && near(b.shapes[4].r, 6) && b.shapes[4].ea === 90, '円・矩形・折れ線・弧(角度は変えない)');
ok(near(b.shapes[5].fs, 6) && near(b.shapes[5].x, 1.5), '文字の大きさと位置');
ok(near(b.terminals[0].x, -12) && b.terminals[0].label === '1', '端子の位置(番号はそのまま)');
ok(near(b.baked, 0.3) && orig.w === 80 && !orig.baked, '何倍にしたか(baked)を持つ・元の定義は変えない');
ok(near(sb.symBakeDef(b, 0.5).baked, 0.15), '重ねて焼き込んだら掛け算');

console.log('\n【図面で使っている倍率(いちばん多いもの)】');
sb.state.pages = [{ elements: [{ type: 'lib_mc', scale: 0.3 }, { type: 'lib_mc', scale: 0.3 }, { type: 'lib_mc', scale: 0.5 }, { type: 'x', scale: 2 }] },
  { elements: [{ type: 'lib_mc', scale: 0.3 }] }];
ok(near(sb.symCommonScale('lib_mc'), 0.3), '0.3 が3個・0.5 が1個 → 0.3(全ページを見る)');
sb.state.pages = [{ elements: [{ type: 'cp' }, { type: 'cp', scale: 1 }] }];
ok(sb.symCommonScale('cp') === null && sb.symCommonScale('none') === null, '等倍で使っている・置いていない → 焼き込まない');

console.log('\n【置いてある記号の倍率を合わせる=見た目は変わらない】');
const els = [{ type: 'lib_mc', scale: 0.3 }, { type: 'lib_mc', scale: 0.5 }, { type: 'other', scale: 0.4 }];
sb.state.pages = [{ elements: els }];
sb.state.customSymbols = [b, { type: 'other' }];
ok(sb.symBakeFixElements() === 2, '焼き込んだシンボルの記号だけ直す');
ok(near(els[0].scale, 1) && near(els[0].symBaked, 0.3), '★0.3 で縮めていた記号は等倍に(0.3 × 形の大きさ が同じ)');
ok(near(els[1].scale * 0.3, 0.5), '0.5 だった記号も見た目は同じ大きさ(0.5/0.3)');
ok(els[2].scale === 0.4 && !('symBaked' in els[2]), 'ほかのシンボルは触らない');
ok(sb.state.pages[0].dirty === true, '直したページは保存の対象');
ok(sb.symBakeFixElements() === 0 && near(els[0].scale, 1), '何度呼んでも同じ');
const oldDrawing = [{ type: 'lib_mc', scale: 0.3 }];   // プロジェクトの外の古い図面(焼き込む前に保存)
sb.state.pages = [{ elements: oldDrawing }];
sb.symBakeFixElements();
ok(near(oldDrawing[0].scale, 1), '★古い図面を開いても、置いてある記号は小さくならない(倍率を直す)');
const placed = [{ type: 'lib_mc', symBaked: 0.3, symLbl: 0.3 }];   // パネルから新しく置いたもの
sb.state.pages = [{ elements: placed }];
ok(sb.symBakeFixElements() === 0 && placed[0].scale === undefined, 'パネルから置いた記号(等倍)はそのまま');
sb.state.customSymbols = [{ type: 'lib_mc', w: 80 }];   // 焼き込んでいない写ししか読めない PC(ライブラリ無し)
const back = [{ type: 'lib_mc', scale: 1, symBaked: 0.3 }];
sb.state.pages = [{ elements: back }];
sb.symBakeFixElements();
ok(near(back[0].scale, 0.3) && !('symBaked' in back[0]), '焼き込む前の形で描くときは、元の倍率に戻す');

console.log('\n【端子番号の位置は変えない(位置補正に足す)】');
{
  // 端子番号の文字の基準点は「定義の端子の座標(倍率を掛けない)」(draw.js symTermPoints)。縮めると基準点も縮むので、ズレた分を termOff に足す
  sb.state.customSymbols = [b];
  const e1 = { type: 'lib_mc', scale: 0.3, termOff: [[1, 2]] };
  const e2 = { type: 'lib_mc', scale: 0.3, rot: 90 };
  sb.state.pages = [{ elements: [e1, e2] }];
  sb.symBakeFixElements();
  const base = (t, e) => { const a = (e.rot || 0) * Math.PI / 180; return [t.x * Math.cos(a) - t.y * Math.sin(a), t.x * Math.sin(a) + t.y * Math.cos(a)]; };
  const pos = (e, def, i, off) => { const p = base(def.terminals[i], e); const o = (off || [])[i] || [0, 0]; return [p[0] + o[0], p[1] + o[1]]; };
  const before0 = pos({}, orig, 0, [[1, 2]]), after0 = pos(e1, b, 0, e1.termOff);
  ok(near(before0[0], after0[0]) && near(before0[1], after0[1]), '★端子番号の文字の位置は整理の前と同じ(位置補正 1,2 を入れていた端子)');
  const b1 = pos({}, orig, 1, null), a1 = pos(e1, b, 1, e1.termOff);
  ok(near(b1[0], a1[0]) && near(b1[1], a1[1]), '位置補正を入れていなかった端子も同じ位置');
  const br = pos({ rot: 90 }, orig, 0, null), ar = pos(e2, b, 0, e2.termOff);
  ok(Math.abs(br[0] - ar[0]) < 1e-3 && Math.abs(br[1] - ar[1]) < 1e-3, '回したシンボルも同じ位置');
  ok(near(e1.symLbl, 0.3) && sb.symBakeFixElements() === 0, '直したら印(symLbl)を付ける・何度呼んでも同じ');
  const old1 = { type: 'lib_mc', scale: 1, symBaked: 0.3, termOff: [[1, 2]] };   // 10-08 より前に整理した記号(倍率だけ直っている)
  sb.state.pages = [{ elements: [old1] }];
  ok(sb.symBakeFixElements() === 1 && old1.scale === 1, '★前の版で整理した記号は、倍率はそのまま・位置補正だけ直す');
  const a2 = pos(old1, b, 0, old1.termOff);
  ok(near(a2[0], before0[0]) && near(a2[1], before0[1]), '端子番号が整理の前の位置に戻る');
}

console.log('\n【大きさの整理(今ある登録シンボル)】');
{
  const lib = { relay: { type: 'relay', name: '補助継電器', w: 96, h: 80, shapes: [], terminals: [] },
    motor: { type: 'motor', name: '電動機', w: 90, h: 64 }, unused: { type: 'unused', w: 10, h: 10 },
    done: { type: 'done', name: '焼き込み済み', w: 30, h: 30, baked: 0.3 } };
  const files = [
    { name: 'A.seqzu', pages: [{ elements: [{ type: 'relay', scale: 0.29 }, { type: 'relay', scale: 0.29 }, { type: 'motor' }] }] },
    { name: '盤外/B.seqzu', pages: [{ elements: [{ type: 'relay', scale: 0.5 }, { type: 'done', scale: 1, symBaked: 0.3 }] }] },
  ];
  const open = [{ elements: [{ type: 'relay', scale: 0.29 }] }];
  const c = sb.symTidyCandidates(lib, files, open);
  ok(c.length === 1 && c[0].type === 'relay', '★縮めて使っているもの(補助継電器)だけ。等倍の電動機・使っていない・焼き込み済みで等倍のものは出ない');
  ok(near(c[0].k, 0.29) && c[0].mixed === true, 'いちばん多い倍率 0.29(0.5 の記号もある印)');
  ok(c[0].perFile.length === 2 && c[0].perFile[0].n === 2 && c[0].openN === 1, '図面ごとの記号の数・開いている図面の数');
  const newDefs = { relay: sb.symBakeDef(lib.relay, c[0].k) };
  const d = { pages: files[0].pages, customSymbols: [lib.relay, lib.motor] };
  ok(sb.symTidyApplyToData(d, newDefs) === 2, 'ファイルの記号を書き換える(補助継電器 2 個)');
  ok(near(d.pages[0].elements[0].scale, 1) && d.pages[0].elements[2].scale === undefined, '★倍率 1 に(見た目は同じ)・ほかのシンボルは触らない');
  ok(d.customSymbols[0] === newDefs.relay && d.customSymbols[1] === lib.motor, '図面に入っている写しも新しい形に');
  const d2 = { pages: [{ elements: [{ type: 'motor' }] }], customSymbols: [lib.motor] };
  ok(sb.symTidyApplyToData(d2, newDefs) === 0 && d2.customSymbols[0] === lib.motor, '関係ない図面は書き換えない(0 を返す)');
  const c2 = sb.symTidyCandidates({ relay: newDefs.relay }, [{ name: 'A', pages: d.pages }], []);
  ok(c2.length === 0, '整理したあとは候補に出ない(何度押しても同じ)');
}

console.log('\n【整理の前の写しと比べるときは大きさをそろえる】');
{
  const L = sb.symBakeDef(orig, 0.3);
  const same = sb._symCopyAtLibSize(orig, L);
  ok(JSON.stringify(same.terminals) === JSON.stringify(L.terminals) && JSON.stringify(same.shapes) === JSON.stringify(L.shapes), '★古い図面の写し(縮める前)をそろえると登録シンボルと同じ=「端子の位置が変わった」と出ない・比べるで違いに出ない');
  ok(sb._symCopyAtLibSize(L, L) === L && sb._symCopyAtLibSize(orig, orig) === orig, '大きさが同じならそのまま');
}
ok(/_symTermPos\(_symCopyAtLibSize\(copies\[t\], lib\[t\]\)\)/.test(S) && /d = _symCopyAtLibSize\(drawing\[t\], L\)/.test(S), '開いたときの知らせ(symMovedNotice)と「比べる」(symDiffList)の両方でそろえる');

console.log('\n【つなぎ込み】');
ok(/const k = !\(t in lib\) \? symCommonScale\(t\) : null;\s*o\[t\] = k \? symBakeDef\(drawing\[t\], k\) : drawing\[t\];/.test(S), '★「比べる」で足すとき(登録シンボルに無いもの)だけ焼き込む。「図面の写しに戻す」は焼き込まない');
ok(/DEFS\[s\.type\] = s; \}\);\s*symBakeFixElements\(\);/.test(S), 'シンボル一覧を組み直すたびに記号の倍率を合わせる(図面を開いたとき・登録シンボルに書いたとき)');
ok(/ne\.symBaked = d\.baked; ne\.symLbl = d\.baked;/.test(R('js/tools.js')), 'パネルから置いた記号は焼き込んだ大きさの等倍と覚える(端子番号の位置も新しい形に合っている)');
ok(/if \(repOld && repOld\.baked\) sym\.baked = repOld\.baked;/.test(R('js/ui.js')), '登録画面で置き換えたときは baked を引き継ぐ(形は見えている大きさなので)');

const H = R('index.html');
ok(/onclick="symSizeTidyDialog\(\)"/.test(H), 'シンボルパネルの下に「大きさの整理」');
ok(/if \(!symTidyApplyToData\(d, newDefs\)\) continue;/.test(S) && /ptreeHistSave\('\/' \+ f\.name, fh, text\)/.test(S), '★書き換える図面だけ書き、前の中身は履歴に残す');
ok(/filter\(n => !open\.has\(n\)\)/.test(S), '開いている図面のファイルは書き換えない(画面の中で直して保存)');
ok(/symBakeFixList\(pg\.elements, defOf\)/.test(R('js/xref_project.js')), '別ファイルを読む計算(参照図面)でも倍率を合わせる');
console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
