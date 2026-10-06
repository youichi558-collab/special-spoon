// 図面の履歴(世代管理)(2026-10-05 js/proj_tree.js ptreeHistSave ほか・js/edit.js saveToSrcFile)
//   node tests/test_proj_hist.js
// 盛田さん「上書きした場合、バックアップからしか戻らない」「世代管理できないな」→ おすすめで決定:
//   上書きのたびに残す / プロジェクトのフォルダの隠しフォルダ .seqzu_history / 図面ごとに20件 / 右クリック「履歴…」で開く
// このテストが守るもの:
//   1. 上書き保存の前の中身を履歴に写す。中身が同じなら残さない。20件を超えたら古い方から消す
//   2. フォルダの外のファイル(ext:)には残さない。履歴が書けなくても上書き保存はする
//   3. 履歴のフォルダはツリーにも台帳(xprojReadList)にも出さない(同じ図面が何重にも数えられるため)
//   4. 名前を変えると履歴も付いていく
//   5. 版を開くと置き換えで開き、保存先は元のファイルのまま・未保存
//   6. 【案C】ブラウザを開き直したあとも、ツリーの道筋から鍵を引き直して窓を出さずに上書き(履歴も残る)。
//      保存の窓でフォルダの中の図面を上書きしたときも履歴を残す。別のフォルダを開いたら道筋は外す
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

// 書ける作り物のフォルダ(test_proj_tree.js と同じ形。ファイルは { t: 中身, m: 更新時刻 })
let clock = new Date(2026, 9, 5, 14, 30, 0).getTime();
const W = (name, tree) => ({
  kind: 'directory', name, tree,
  async *entries() { for (const [n, v] of Object.entries(tree)) yield [n, v && v.t !== undefined ? WF(tree, n) : W(n, v)]; },
  async getDirectoryHandle(n, o) { if (!(n in tree)) { if (o && o.create) tree[n] = {}; else throw new Error('NotFound ' + n); } return W(n, tree[n]); },
  async getFileHandle(n, o) { if (!(n in tree)) { if (o && o.create) tree[n] = { t: '', m: clock }; else throw new Error('NotFound ' + n); } return WF(tree, n); },
  async removeEntry(n, o) { if (tree[n] && tree[n].t === undefined && Object.keys(tree[n]).length && !(o && o.recursive)) throw new Error('not empty'); delete tree[n]; },
  async queryPermission() { return 'granted'; },
});
const WF = (tree, n) => ({ kind: 'file', name: n, _tree: tree,
  async getFile() { const f = tree[n]; return { size: Buffer.byteLength(f.t), lastModified: f.m, async text() { return f.t; } }; },
  async createWritable() { let b = ''; return { async write(x) { b += typeof x === 'string' ? x : await x.text(); }, async close() { tree[n] = { t: b, m: clock }; } }; } });

const edit = R('js/edit.js');
const pick = re => { const m = edit.match(re); if (!m) throw new Error('見つからない ' + re); return m[0]; };
const toasts = [];
const sb = { console, window: {}, LAYERS: [], alert() {}, confirm: () => true, _stGet: async () => null, _stPut: async () => {},
  renderPageTabs() {}, usedSymbolsForSave: () => [], usedPartsForSave: () => [], usedTitleBlockTplsForSave: () => [],
  stToast: (m, k) => toasts.push([k, m]), document: { getElementById: () => null, body: { appendChild() {} }, createElement: () => ({ style: {} }) } };
vm.createContext(sb);
vm.runInContext(R('js/proj_tree.js') + '\n' + R('js/xref_project.js') + '\n' + [pick(/function _saveJSON[\s\S]*?\n\}/), pick(/function _saveData\([\s\S]*?\n\}/), pick(/async function saveToSrcFile\([\s\S]*?\n\}/), pick(/function _srcResolveThen\([\s\S]*?\n\}/),
    pick(/function _pageFileName\([\s\S]*?\n\}/), pick(/function saveProject\(asNew\)[\s\S]*?\n\}/), pick(/function saveAllProject\(\)[\s\S]*?\n\}/)].join('\n')
  + '\nthis.ptreeState = ptreeState;', sb);

const PG = n => ({ name: n, elements: [], wires: [] });
const fileText = (T, n) => T[n].t;

(async () => {
  const T = { 'A.seqzu': { t: '{"v":"A0"}', m: clock - 3600e3 }, '盤外': { 'B.seqzu': { t: '{"v":"B0"}', m: clock } } };
  sb.ptreeState.root = W('案件', T);
  const hA = await sb.ptreeState.root.getFileHandle('A.seqzu');
  sb.ptreeState.files.set('/A.seqzu', hA);
  sb.state = { pages: [Object.assign(PG('A1'), { _src: '/A.seqzu', dirty: true })] };

  console.log('【上書きの前の中身を履歴に残す】');
  ok(await sb.saveToSrcFile('/A.seqzu'), '上書き保存できる');
  const H = () => T['.seqzu_history'] && T['.seqzu_history']['A_履歴'] || {};
  eq(Object.keys(H()), ['2026-10-05_133000.seqzu'], '★上書きされる前の中身を .seqzu_history/A_履歴/ に、その中身を保存した時刻の名前で残す');
  eq(H()['2026-10-05_133000.seqzu'].t, '{"v":"A0"}', '★残すのは上書き前の中身');
  ok(/"A1"/.test(fileText(T, 'A.seqzu')), 'ファイルは新しい中身');
  await sb.saveToSrcFile('/A.seqzu');
  eq(Object.keys(H()).length, 1, '★中身が変わらない上書きでは残さない');

  for (let i = 0; i < 25; i++) { clock += 60e3; sb.state.pages[0].name = 'A' + (i + 2); await sb.saveToSrcFile('/A.seqzu'); }
  const names = (await sb.ptreeHistList('/A.seqzu')).map(x => x.name);
  eq(names.length, 20, '★図面ごとに20件まで(古い方から消す)');
  ok(names[0] > names[19] && !names.includes('2026-10-05_133000.seqzu'), '一覧は新しい順・いちばん古いものから消えている');

  console.log('\n【残さないとき・残せないとき】');
  const ext = { name: 'Out.seqzu', async getFile() { return { lastModified: clock, async text() { return '{"old":1}'; } }; }, async createWritable() { return { async write() {}, async close() {} }; } };
  sb.ptreeState.files.set('ext:1:Out.seqzu', ext);
  sb.state.pages.push(Object.assign(PG('O'), { _src: 'ext:1:Out.seqzu' }));
  const before = JSON.stringify(Object.keys(T['.seqzu_history']));
  ok(await sb.saveToSrcFile('ext:1:Out.seqzu') && JSON.stringify(Object.keys(T['.seqzu_history'])) === before, '★フォルダの外のファイルには残さない(上書きはする)');
  const realHist = sb.ptreeHistSave;
  sb.ptreeHistSave = async () => { throw new Error('書けない'); };
  toasts.length = 0; sb.state.pages[0].name = 'Z';
  ok(await sb.saveToSrcFile('/A.seqzu') && /"Z"/.test(fileText(T, 'A.seqzu')), '★履歴が書けなくても上書き保存はする');
  ok(toasts.some(([k, m]) => k === 'warn' && /履歴を残せませんでした/.test(m)), '書けなかったことは知らせる');
  sb.ptreeHistSave = realHist;

  console.log('\n【ツリー・台帳には出さない】');
  eq((await sb.ptreeList(sb.ptreeState.root)).map(x => x.name), ['盤外', 'A.seqzu'], '★ツリーに .seqzu_history を出さない');
  eq(await sb.xprojReadList(sb.ptreeState.root), ['A.seqzu', '盤外/B.seqzu'], '★台帳(xprojReadList)も履歴の中の図面を数えない');

  console.log('\n【名前を変えると履歴も付いていく】');
  const n0 = Object.keys(H()).length;
  sb.prompt = () => 'A2';
  await sb.ptreeRename('/A.seqzu', 'file');
  ok(T['A2.seqzu'] && !T['.seqzu_history']['A_履歴'] && Object.keys(T['.seqzu_history']['A2_履歴']).length === n0, '★図面の名前の変更で履歴も新しい名前へ');
  sb.ptreeState.files.set('/盤外/B.seqzu', await (await sb.ptreeState.root.getDirectoryHandle('盤外')).getFileHandle('B.seqzu'));
  sb.state.pages = [Object.assign(PG('B1'), { _src: '/盤外/B.seqzu' })];
  await sb.saveToSrcFile('/盤外/B.seqzu');
  sb.prompt = () => '盤内';
  await sb.ptreeRename('/盤外', 'dir');
  ok(T['.seqzu_history']['盤内'] && T['.seqzu_history']['盤内']['B_履歴'] && !T['.seqzu_history']['盤外'], '★フォルダの名前の変更でも履歴が付いていく');

  console.log('\n【版を開く】');
  const loads = [];
  sb.loadProjectText = (text, name, mode) => { loads.push([text, name, mode]); sb.state.pages = [PG('戻した')]; return true; };
  await sb.ptreeRender();   // _ptFind 用(document は作り物なので描かないが、道筋→鍵は覚えない)
  const v = (await sb.ptreeHistList('/A2.seqzu')).pop();
  await sb.ptreeHistOpen('/A2.seqzu', v.name);
  eq(loads.map(l => [l[1], l[2]]), [['A2.seqzu', 'replace']], '★版を置き換えで開く');
  eq(loads[0][0], T['.seqzu_history']['A2_履歴'][v.name].t, '開くのはその版の中身');
  eq([sb.state.pages[0]._src, sb.state.pages[0].dirty, !!sb.ptreeSrcHandle('/A2.seqzu')], ['/A2.seqzu', true, true], '★保存先は元のファイルのまま・未保存(上書き保存でその版に戻る)');

  console.log('\n【案C: ブラウザを開き直したあと・保存の窓で上書きしたとき】');
  sb._syncCurrentPage = () => {}; sb.window.showSaveFilePicker = () => {};
  let dialog = 0; sb.dlMake = () => { dialog++; };
  sb.ptreeState.files = new Map();   // ブラウザを開き直した = 鍵は消え、ページの道筋(_src)だけ自動保存に残っている
  sb.state.pages = [Object.assign(PG('戻した'), { _src: '/A2.seqzu', dirty: true })]; sb.state.currentPage = 0;
  clock += 60e3; const oldA = fileText(T, 'A2.seqzu');
  sb.saveProject();
  await new Promise(r => setTimeout(r, 20));
  ok(dialog === 0 && /"戻した"/.test(fileText(T, 'A2.seqzu')), '★開き直したあとも、窓を出さずに開いたファイルへ上書き(道筋から鍵を引き直す)');
  { const l = await sb.ptreeHistList('/A2.seqzu'); eq(T['.seqzu_history']['A2_履歴'][l[0].name].t, oldA, '★そのときも履歴が残る(いちばん新しい版が上書き前の中身)'); }
  sb.ptreeState.files = new Map();
  sb.state.pages = [Object.assign(PG('消えた'), { _src: '/無い.seqzu', dirty: true })];
  sb.saveProject();
  await new Promise(r => setTimeout(r, 20));
  ok(dialog === 1 && sb.state.pages[0]._src === undefined && !('無い.seqzu' in T), '★ファイルが無くなっていたら道筋を外して保存の窓(作らない)');
  sb.ptreeState.files = new Map();
  sb.state.pages = [Object.assign(PG('全1'), { _src: '/A2.seqzu', dirty: true })];
  sb.saveAllProject();
  await new Promise(r => setTimeout(r, 20));
  ok(dialog === 1 && /"全1"/.test(fileText(T, 'A2.seqzu')), '★全ページ保存も開き直したあと窓を出さずに上書き');

  // 保存の窓(js/settings.js stWriteOut)で書く直前
  const findPath = (dir, tree, pre) => { for (const [n, v] of Object.entries(dir)) { if (v === tree) return pre.concat(n); if (v && v.t === undefined) { const r = findPath(v, tree, pre.concat(n)); if (r) return r; } } return null; };
  sb.ptreeState.root.resolve = async fh => fh._tree === T ? [fh.name] : (findPath(T, fh._tree, []) || []).concat(fh.name);
  const hB = await (await sb.ptreeState.root.getDirectoryHandle('盤内')).getFileHandle('B.seqzu');
  const before2 = (await sb.ptreeHistList('/盤内/B.seqzu')).length, oldB = fileText(T['盤内'], 'B.seqzu');
  clock += 60e3;
  await sb.ptreeHistBeforeWrite(hB, { async text() { return '{"new":1}'; } });
  const lb = await sb.ptreeHistList('/盤内/B.seqzu');
  ok(lb.length === before2 + 1 && T['.seqzu_history']['盤内']['B_履歴'][lb[0].name].t === oldB, '★保存の窓でフォルダの中の図面を上書きするときも、上書きの前の中身を履歴に残す');
  eq(await sb.ptreeHistBeforeWrite({ name: 'Out.seqzu', _tree: {} }, { async text() { return 'x'; } }), '', 'フォルダの外は残さない');
  ok(/await ptreeHistBeforeWrite\(fh, blob\)[\s\S]{0,200}\n  try \{\n    const w = await fh\.createWritable\(\)/.test(R('js/settings.js')), '★保存の窓で書く直前に呼んでいる');

  // 別のフォルダを開いたら道筋は外す(同じ道筋の別ファイルに上書きしないため)
  const other = W('別案件', { 'A2.seqzu': { t: '{"other":1}', m: clock } });
  other.isSameEntry = async o => o === other;
  sb.ptreeState.root.isSameEntry = async () => false;
  sb.window.showDirectoryPicker = async () => other;
  sb.state.pages = [Object.assign(PG('P'), { _src: '/A2.seqzu' })];
  await sb.ptreeChooseRoot();
  eq(sb.state.pages[0]._src, undefined, '★別のフォルダを開いたら、ページが覚えている道筋を外す');

  console.log('\n【履歴のフォルダ名は「図面名_履歴」・最初の作りの名前から移す】');
  sb.ptreeState.root = W('案件', T);   // 上で別のフォルダを開いたので戻す
  T['.seqzu_history']['旧.seqzu'] = { '2026-10-01_090000.seqzu': { t: '{"old":1}', m: clock } };
  T['旧.seqzu'] = { t: '{"cur":1}', m: clock };
  eq((await sb.ptreeHistList('/旧.seqzu')).map(x => x.name), ['2026-10-01_090000.seqzu'], '★最初の作りの名前(旧.seqzu)の履歴も読める');
  ok(T['.seqzu_history']['旧_履歴'] && !('旧.seqzu' in T['.seqzu_history']), '★そのとき「旧_履歴」へ移す');

  console.log('\n【右クリック】');
  ok(/\['履歴…', \(\) => ptreeHistShow\(path\)\]/.test(R('js/proj_tree.js')), '★図面の右クリックに「履歴…」');

  console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
