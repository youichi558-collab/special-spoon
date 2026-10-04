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

  console.log('\n【フォルダ未設定】');
  sb.ptreeState.root = null;
  await sb.ptreeRender();
  ok(/フォルダを開く/.test(body.innerHTML), 'フォルダを選ぶよう案内');

  console.log('\n【左パネル・固定】');
  const html = R('index.html'), ui = R('js/ui.js');
  ok(/switchLTab\('prj',this\)">プロジェクト</.test(html), '★縦タブに「プロジェクト」');
  ok(/prj:'prj-float'/.test(ui) && /'prt-float', 'prj-float'\]/.test(ui), 'タブの切替と固定(ドッキング)の対象に入っている');
  ok(/<script src="js\/proj_tree.js"><\/script>/.test(html) && /id="prj-float"/.test(html) && /onclick="closePrj\(\)"/.test(html), '読み込み・窓・閉じる×');
  ok(/function loadProjectText\(text, name, mode0\)/.test(R('js/edit.js')), '読込の本体を中身から呼べる(loadProjectText)');

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
