// 左パネルの「プロジェクト」= フォルダのツリー(2026-10-04 js/proj_tree.js)
//   node tests/test_proj_tree.js
// 盛田さん「ツリーはエクスプローラそのままで構わん」「図面でないファイルはファイル形式で見えないように」「基本は置き換え」。
// このテストが守るもの:
//   1. フォルダと図面(.seqzu)だけを出す。フォルダが先・名前の自然順。以前の .json・台帳(.seqzuidx)・ほかのファイルは出さない
//   2. フォルダは押して開閉(中身は開いたときだけ読む)
//   3. 図面を押すと置き換えで開く(方法を聞かない)。未保存のページがあれば確認し、やめたら開かない
//   4. 左パネルのタブ・固定(ドッキング)に入っている
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

// 作り物のフォルダ: { 名前: 文字列(ファイル) | オブジェクト(フォルダ) }
const listed = [];
function D(name, tree) {
  return {
    kind: 'directory', name,
    async *entries() { listed.push(name); for (const [n, v] of Object.entries(tree)) yield [n, typeof v === 'string' ? F(n, v) : D(n, v)]; },
    async queryPermission() { return 'granted'; },
  };
}
function F(name, text) { return { kind: 'file', name, async getFile() { return { async text() { return text; } }; } }; }

const body = { innerHTML: '' }, rootName = { textContent: '' };
const loads = [];
let confirmAns = true, confirms = 0;
const sb = { console, window: {}, document: { getElementById: id => ({ 'prj-float-body': body, 'prj-float-root': rootName }[id] || null) },
  confirm: () => { confirms++; return confirmAns; }, alert() {}, _stGet: async () => null, _stPut: async () => {},
  loadProjectText: (text, name, mode) => loads.push([text, name, mode]) };
vm.createContext(sb);
vm.runInContext(R('js/proj_tree.js') + '\nthis.ptreeState = ptreeState;', sb);
sb.stToast = () => {};
sb.state = { pages: [{ name: 'P', dirty: false }] };

const rows = () => [...body.innerHTML.matchAll(/class="pt-row ([^"]*)"[^>]*data-path="([^"]*)"[^>]*>([^<]*)</g)].map(m => [m[1], m[2], m[3].trim()]);

(async () => {
  console.log('【フォルダと図面だけ・フォルダが先・自然順】');
  sb.ptreeState.root = D('案件A', {
    'Sheet10.seqzu': '{"pages":[]}', 'Sheet2.seqzu': '{"pages":[{"name":"S2"}]}', '古い.json': '{}', 'project.seqzuidx': '{}', 'メモ.txt': 'x',
    '盤外': { 'Sheet1.seqzu': '{}', 'b.json': '{}' }, '00共通': {},
  });
  await sb.ptreeRender();
  eq(rootName.textContent, '案件A', '見出しにフォルダ名');
  eq(rows().map(r => r[2]), ['▸ 📁 00共通', '▸ 📁 盤外', '📄 Sheet2', '📄 Sheet10'], '★フォルダが先・図面は .seqzu だけ(.json・台帳・txt は出さない)・Sheet2 < Sheet10・拡張子は表示しない');
  ok(!listed.includes('盤外'), '閉じているフォルダの中身は読まない');

  console.log('\n【フォルダの開閉】');
  sb.ptreeToggle('/盤外');
  await new Promise(r => setTimeout(r, 10));
  eq(rows().map(r => r[2]), ['▸ 📁 00共通', '▾ 📁 盤外', '📄 Sheet1', '📄 Sheet2', '📄 Sheet10'], '★押すと開いて中の図面を出す(中の .json は出さない)');
  sb.ptreeToggle('/00共通');
  await new Promise(r => setTimeout(r, 10));
  ok(/\(図面なし\)/.test(body.innerHTML), '空のフォルダは「(図面なし)」');
  sb.ptreeToggle('/盤外'); sb.ptreeToggle('/00共通');
  await new Promise(r => setTimeout(r, 10));
  eq(rows().length, 4, 'もう一度押すと閉じる');

  console.log('\n【図面を押すと置き換えで開く】');
  await sb.ptreeOpenFile('/Sheet2.seqzu');
  eq(loads, [['{"pages":[{"name":"S2"}]}', 'Sheet2.seqzu', 'replace']], '★中身を置き換えで読む(方法を聞かない)');
  eq(confirms, 0, '未保存が無ければ確認しない');
  await new Promise(r => setTimeout(r, 10));
  ok(rows().find(r => r[1] === '/Sheet2.seqzu')[0].includes('on'), '開いた図面に印');
  sb.state.pages[0].dirty = true; confirmAns = false; loads.length = 0;
  await sb.ptreeOpenFile('/Sheet10.seqzu');
  eq([confirms, loads.length], [1, 0], '★未保存のページがあれば確認し、やめたら開かない');
  confirmAns = true;
  await sb.ptreeOpenFile('/Sheet10.seqzu');
  eq(loads.map(l => l[1]), ['Sheet10.seqzu'], '確認で「OK」なら開く');

  console.log('\n【＋でページとして足す・開いたファイルを覚える】');
  sb.state.pages = [{ name: 'P', dirty: false }]; loads.length = 0;
  sb.loadProjectText = (text, name, mode) => { loads.push([name, mode]); if (mode === 'append') sb.state.pages.push({ name: 'S2' }); else sb.state.pages = [{ name: 'S' }]; return true; };
  await sb.ptreeAddFile('/Sheet2.seqzu');
  eq(loads, [['Sheet2.seqzu', 'append']], '★「＋」は後ろにページとして足す');
  eq(sb.state.pages.map(p => p._src || ''), ['', '/Sheet2.seqzu'], '★足したページだけが開いたファイルを覚える');
  ok(sb.ptreeSrcHandle('/Sheet2.seqzu') && !sb.ptreeSrcHandle('/x'), 'ファイルの鍵を引ける');
  let switched = -1; sb.switchPage = i => { switched = i; }; sb.stToast = () => {};
  await sb.ptreeAddFile('/Sheet2.seqzu');
  eq([loads.length, switched], [1, 1], '★同じファイルは2回足さない(そのページへ移る)');
  await sb.ptreeOpenFile('/Sheet10.seqzu');
  eq(sb.state.pages.map(p => p._src), ['/Sheet10.seqzu'], '置き換えで開いたページも開いたファイルを覚える');

  console.log('\n【保存は開いたファイルへ上書き(js/edit.js)】');
  {
    const edit = R('js/edit.js');
    const pick = re => { const m = edit.match(re); if (!m) throw new Error('見つからない ' + re); return m[0]; };
    const written = {};
    const H = name => ({ name, async createWritable() { let b = ''; return { async write(t) { b += t; }, async close() { written[name] = b; } }; } });
    const handles = { '/A.seqzu': H('A.seqzu'), '/B_all.seqzu': H('B_all.seqzu') };
    const toasts = [], alerts = [];
    const e = { console, LAYERS: [], renderPageTabs() {}, _syncCurrentPage() {}, usedSymbolsForSave: () => [], usedPartsForSave: () => [], usedTitleBlockTplsForSave: () => [],
      ptreeSrcHandle: s => handles[s] || null, stToast: (m, k) => toasts.push(k), alert: m => alerts.push(m), window: { showSaveFilePicker() {} }, dlMake: () => { e.dialog = true; } };
    vm.createContext(e);
    vm.runInContext([pick(/function _saveJSON[\s\S]*?\n\}/), pick(/function _saveData\([\s\S]*?\n\}/), pick(/async function saveToSrcFile\([\s\S]*?\n\}/), pick(/function _srcResolveThen\([\s\S]*?\n\}/),
      pick(/function _pageFileName\([\s\S]*?\n\}/), pick(/function saveAsProject\(\)[^\n]*/), pick(/function saveProject\(asNew\)[\s\S]*?\n\}/), pick(/function saveAllProject\(\)[\s\S]*?\n\}/)].join('\n'), e);
    e.state = { currentPage: 0, wireNoRule: '', saveFileName: 'x', pages: [
      { name: 'A1', _src: '/A.seqzu', dirty: true }, { name: 'B1', _src: '/B_all.seqzu', dirty: true }, { name: 'B2', _src: '/B_all.seqzu', dirty: true }, { name: '新', dirty: true }] };
    e.saveProject();
    await new Promise(r => setTimeout(r, 10));
    const a = JSON.parse(written['A.seqzu'] || '{}');
    eq((a.pages || []).map(p => p.name), ['A1'], '★「保存」は窓を出さずに開いたファイルへ上書き');
    ok(!e.dialog && !/_src/.test(written['A.seqzu']) && a.pages[0].dirty === false, '★ファイルには _src を書かない・未保存マークを落とす');
    e.state.currentPage = 1; e.saveProject();
    await new Promise(r => setTimeout(r, 10));
    eq(JSON.parse(written['B_all.seqzu']).pages.map(p => p.name), ['B1', 'B2'], '★同じファイルから開いたページはまとめて書く(全ページ保存のファイル)');
    e.state.currentPage = 3; e.saveProject();
    ok(e.dialog, '開いたファイルの無いページは今までどおり「名前を付けて保存」');
    e.dialog = false; let made = null, done = null;
    e.dlMake = (mk, fname, mime, cb) => { e.dialog = fname; made = mk; done = cb; };
    e.ptreeAdopt = (fh, pages) => { e.adopted = pages.map(p => p.name); };
    e.state.currentPage = 1; e.saveAsProject();
    eq(e.dialog, 'B_all.seqzu', '★「名前を付けて保存」は保存先があっても窓を出す(名前の初期値は今のファイル)');
    eq(JSON.parse(made('B_copy.seqzu')).pages.map(p => p.name), ['B1', 'B2'], '★同じファイルのページをまとめて書く');
    done('B_copy.seqzu', { name: 'B_copy.seqzu' });
    eq(e.adopted, ['B1', 'B2'], '書いたファイルを次から保存先にする');
    ok(/onclick="saveAsProject\(\)"[^>]*>.*名前を付けて保存<\/div>/.test(R('index.html')), '★データタブに「名前を付けて保存」ボタン');
    e.dlMake = () => { e.dialog = true; };
    e.dialog = false; delete written['A.seqzu']; delete written['B_all.seqzu'];
    e.saveAllProject();
    await new Promise(r => setTimeout(r, 20));
    ok(written['A.seqzu'] && written['B_all.seqzu'] && !e.dialog, '★全ページ保存は、ページごとに開いたファイルへ上書き(1つにまとめない)');
    ok(alerts.length === 1 && /新/.test(alerts[0]), 'ファイルの無いページは保存せずに知らせる');
    handles['/A.seqzu'].createWritable = async () => { throw new Error('ロック中'); };
    e.state.pages[0].dirty = true; e.state.currentPage = 0; e.saveProject();
    await new Promise(r => setTimeout(r, 10));
    ok(e.state.pages[0].dirty === true && toasts.includes('ng'), '書けなかったら未保存マークを戻して知らせる');
  }

  console.log('\n【作成・名前の変更・削除(2026-10-05)】');
  {
    // 書ける作り物のフォルダ(move は無い=ブラウザの代わりの道を通す)
    const W = (name, tree) => ({
      kind: 'directory', name, tree,
      async *entries() { for (const [n, v] of Object.entries(tree)) yield [n, typeof v === 'string' ? WF(tree, n) : W(n, v)]; },
      async getDirectoryHandle(n, o) { if (!(n in tree)) { if (o && o.create) tree[n] = {}; else throw new Error('NotFound ' + n); } return W(n, tree[n]); },
      async getFileHandle(n, o) { if (!(n in tree)) { if (o && o.create) tree[n] = ''; else throw new Error('NotFound ' + n); } return WF(tree, n); },
      async removeEntry(n, o) { if (typeof tree[n] === 'object' && Object.keys(tree[n]).length && !(o && o.recursive)) throw new Error('not empty'); delete tree[n]; },
      async queryPermission() { return 'granted'; },
    });
    const WF = (tree, n) => ({ kind: 'file', name: n, async getFile() { const t = tree[n]; return { size: Buffer.byteLength(t), async text() { return t; } }; },
      async createWritable() { let b = ''; return { async write(x) { b += typeof x === 'string' ? x : await x.text(); }, async close() { tree[n] = b; } }; } });
    const T = { 'A.seqzu': '{"pages":[{"name":"A"}]}', '盤外': { 'B.seqzu': '{"pages":[{"name":"B"}]}' }, 'docs': { 'x.txt': 'x' } };
    sb.ptreeState.root = W('案件', T); sb.ptreeState.open = new Set(); sb.ptreeState.files = new Map();
    const ans = []; sb.prompt = () => ans.shift(); const al = []; sb.alert = m => al.push(m); sb.confirm = () => true;
    sb.renderPageTabs = () => {};

    ans.push('S9'); await sb.ptreeNewFile('/盤外');
    ok(T['盤外']['S9.seqzu'] && JSON.parse(T['盤外']['S9.seqzu']).pages[0].name === 'S9', '★新しい図面(.seqzu・白紙1ページ)をフォルダの中に作る');
    ans.push('A'); await sb.ptreeNewFile('');
    ok(/もうあります/.test(al.pop()) && T['A.seqzu'] === '{"pages":[{"name":"A"}]}', '★同じ名前があれば作らない(上書きしない)');
    ans.push('a/b'); await sb.ptreeNewFolder('');
    ok(/使えません/.test(al.pop()) && !('a' in T), '名前に / などは使えない');
    ans.push('新'); await sb.ptreeNewFolder('');
    ok(T['新'] && typeof T['新'] === 'object', 'フォルダを作る');

    sb.state.pages = [{ name: 'A', _src: '/A.seqzu' }]; sb.ptreeState.files.set('/A.seqzu', {});
    ans.push('A2'); await sb.ptreeRename('/A.seqzu', 'file');
    ok(T['A2.seqzu'] && !('A.seqzu' in T), '★図面の名前を変える(中身はそのまま)');
    eq([sb.state.pages[0]._src, !!sb.ptreeSrcHandle('/A2.seqzu'), !!sb.ptreeSrcHandle('/A.seqzu')], ['/A2.seqzu', true, false], '★開いているページの保存先も新しい名前に');
    sb.state.pages = [{ name: 'B', _src: '/盤外/B.seqzu' }]; sb.ptreeState.files.set('/盤外/B.seqzu', {});
    ans.push('盤内'); await sb.ptreeRename('/盤外', 'dir');
    ok(T['盤内'] && T['盤内']['B.seqzu'] && !('盤外' in T), '★フォルダの名前を変える(中身を写して確かめてから元を消す)');
    eq([sb.state.pages[0]._src, !!sb.ptreeSrcHandle('/盤内/B.seqzu')], ['/盤内/B.seqzu', true], 'フォルダの中の開いているページの保存先も付け替える');

    const posts = []; let bkOk = true;
    sb.fetch = async (url, o) => { posts.push(JSON.parse(o.body)); return { async json() { return bkOk ? { ok: true } : { ok: false, error: 'down' }; } }; };
    bkOk = false; await sb.ptreeDelete('/A2.seqzu', 'file');
    ok(T['A2.seqzu'] && /控えが取れないので削除しませんでした/.test(al.pop()), '★控え(バックアップ)が取れなければ削除しない');
    bkOk = true; posts.length = 0;
    sb.state.pages = [{ name: 'A', _src: '/A2.seqzu', dirty: false }];
    await sb.ptreeDelete('/A2.seqzu', 'file');
    ok(!('A2.seqzu' in T) && posts.length === 1 && posts[0].name === '削除_A2' && posts[0].data.pages[0].name === 'A', '★削除する前に「削除_〇〇」でバックアップに控えを取る');
    eq([sb.state.pages[0]._src, sb.state.pages[0].dirty], [undefined, true], '消したファイルのページは図面に残し、未保存にする');
    await sb.ptreeDelete('/docs', 'dir');
    ok(T.docs && /図面以外のファイルがある/.test(al.pop()), '★図面以外のファイルが入ったフォルダは削除しない');
    posts.length = 0; await sb.ptreeDelete('/盤内', 'dir');
    ok(!('盤内' in T) && posts.length === 2, 'フォルダの削除は中の図面を全部控えてから');
    sb.confirm = () => false; ans.push('X'); 
    await sb.ptreeDelete('/新', 'dir');
    ok('新' in T, '確認でやめたら削除しない');
    sb.confirm = () => { confirms++; return confirmAns; };
    const html = R('index.html');
    ok(/onclick="ptreeNewFile\(''\)"/.test(html) && /onclick="ptreeNewFolder\(''\)"/.test(html) && /oncontextmenu="ptreeMenu\(event,'','root'\)"/.test(html), '上の「＋図面」「＋フォルダ」と、空いた所の右クリック');
    ok(/oncontextmenu="ptreeMenu\(event,this\.dataset\.path,'file'\)"/.test(R('js/proj_tree.js')), '行の右クリックでメニュー');
  }

  console.log('\n【名前を付けて保存したファイルを次から上書きの先に(2026-10-05)】');
  {
    const fhIn = { kind: 'file', name: 'N.seqzu', async isSameEntry(o) { return o === fhIn; } };
    const fhOut = { kind: 'file', name: 'Out.seqzu', async isSameEntry(o) { return o === fhOut; } };
    sb.ptreeState.root = { name: '案件', async resolve(h) { return h === fhIn ? ['盤外', 'N.seqzu'] : null; } };
    sb.ptreeState.files = new Map();
    const a = { name: 'A' }, b = { name: 'B', _src: '/盤外/N.seqzu' }, c = { name: 'C' };
    sb.state.pages = [a, b, c];
    await sb.ptreeAdopt(fhIn, [a]);
    eq([a._src, sb.ptreeSrcHandle('/盤外/N.seqzu') === fhIn], ['/盤外/N.seqzu', true], '★プロジェクトのフォルダの中ならツリーの道筋で保存先にする');
    eq([b._src, b.dirty], [undefined, true], '★同じファイルを保存先にしていた別のページは保存先を外して未保存に(上書きされたため)');
    await sb.ptreeAdopt(fhOut, [c]);
    ok(/^ext:\d+:Out\.seqzu$/.test(c._src) && sb.ptreeSrcHandle(c._src) === fhOut, '★フォルダの外のファイルも保存先にする(外用の印)');
    const k = c._src; await sb.ptreeAdopt(fhOut, [c]);
    eq(c._src, k, '同じ外のファイルにもう一度保存しても同じ印');
    const E = R('js/edit.js');
    ok(/\(n, fh\) => \{ renderPageTabs\(\); if \(fh && typeof ptreeAdopt === 'function'\) ptreeAdopt\(fh, pages\)/.test(E), '★「保存」(名前を付けて)のあと、そのページの保存先にする');
    ok(/ptreeAdopt\(fh, state\.pages\.slice\(\)\)/.test(E), '全ページ保存(名前を付けて)のあと、全ページの保存先にする');
    ok(/if \(onDone\) onDone\(fh\.name, fh\);/.test(R('js/settings.js')), '保存の窓で書いたファイルの鍵を渡す');
  }

  console.log('\n【フォルダ未設定】');
  sb.ptreeState.root = null;
  await sb.ptreeRender();
  ok(/フォルダを開く/.test(body.innerHTML), 'フォルダを選ぶよう案内');

  console.log('\n【左パネル・固定】');
  const html = R('index.html'), ui = R('js/ui.js');
  ok(/switchLTab\('prj',this\)">(<svg class="v2-only"[^]*?<\/svg>)?プロジェクト</.test(html), '★縦タブに「プロジェクト」(新しい画面用のアイコン svg.v2-only が前に付く。2026-10-07)');
  ok(/prj:'prj-float'/.test(ui) && /'prt-float', 'prj-float'\]/.test(ui), 'タブの切替と固定(ドッキング)の対象に入っている');
  ok(/<script src="js\/proj_tree.js"><\/script>/.test(html) && /id="prj-float"/.test(html) && /onclick="closePrj\(\)"/.test(html), '読み込み・窓・閉じる×');
  ok(/function loadProjectText\(text, name, mode0(, opts)?\)/.test(R('js/edit.js')), '読込の本体を中身から呼べる(loadProjectText)');

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
