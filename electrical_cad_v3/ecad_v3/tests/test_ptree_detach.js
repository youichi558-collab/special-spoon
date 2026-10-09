// 「読込」で図面を置き換えて開いたら、プロジェクトのフォルダを外す(2026-10-06 js/proj_tree.js ptreeDetach・js/edit.js loadProjectText)
//   node tests/test_ptree_detach.js
// 盛田さん: 仕様１－１を読込で開いたら、ツリーが仕様２のフォルダのままで、部品表が仕様２の別ファイルまで集計して食い違いが出た。
// 「フォルダは元々分けているが読込から読んだせいだな」「読込したらプロジェクト側をリセットはできんのか？」→ これで決定。
// このテストが守るもの:
//   1. 読込(置き換え)でプロジェクトのフォルダを外す。別ファイルの集計(xprojState)も空にする。覚えたフォルダも消す(開き直しても戻らない)
//   2. 前のフォルダは覚えておき、ツリーの「前のフォルダに戻す」で戻せる
//   3. ツリーから開く(mode0 あり)・読込の「追加」では外さない
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const D = (name, files) => ({ kind: 'directory', name, async *entries() { for (const n of files) yield [n, { kind: 'file', name: n }]; }, async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; } });
const idb = new Map();
const body = { innerHTML: '' };
const sb = { console, window: {}, alert() {}, confirm: () => true,
  document: { getElementById: id => (id === 'prj-float-body' ? body : null) },
  _stGet: async k => idb.get(k) || null, _stPut: async (k, v) => { if (v == null) idb.delete(k); else idb.set(k, v); },
  xprojState: { files: [{ name: 'B.seqzu' }], problems: [], dirName: '仕様２' } };
vm.createContext(sb);
vm.runInContext(R('js/proj_tree.js') + '\nthis.ptreeState = ptreeState;', sb);
sb.state = { pages: [] };
const tick = () => new Promise(r => setTimeout(r, 10));

(async () => {
  const dir2 = D('仕様２', ['A.seqzu', 'B.seqzu']);
  sb.ptreeState.root = dir2; idb.set('ptree', dir2);

  console.log('【読込(置き換え)でプロジェクトを外す】');
  await sb.ptreeDetach();
  eq([sb.ptreeState.root, sb.ptreeState.detached, sb.xprojState.files.length], [null, true, 0], '★フォルダを外し、別ファイルの集計も空にする');
  eq([idb.has('ptree'), idb.get('ptree_prev') === dir2], [false, true], '★覚えたフォルダを消し(開き直しても戻らない)、前のフォルダとして覚える');
  await sb.ptreeRender(); await tick();
  eq(/読込で開いた図面はプロジェクトの外です/.test(body.innerHTML) && /ptreeRestorePrev\(\)">前のフォルダ\(仕様２\)に戻す/.test(body.innerHTML), true, '★ツリーに「プロジェクトの外」と「前のフォルダ(仕様２)に戻す」');

  console.log('\n【開き直したあと(ブラウザを読み直した)も外れたまま】');
  sb.ptreeState.detached = false; sb.ptreeState.root = null;   // 読み直した直後の状態
  await sb.ptreeRender(); await tick();
  eq([sb.ptreeState.root, /前のフォルダ/.test(body.innerHTML)], [null, true], '★覚えたフォルダが消えているので、外れたまま');

  console.log('\n【前のフォルダに戻す】');
  await sb.ptreeRestorePrev(); await tick();
  eq([sb.ptreeState.root === dir2, sb.ptreeState.detached, idb.get('ptree') === dir2, idb.has('ptree_prev')], [true, false, true, false], '★前のフォルダに戻し、次からもそのフォルダ');
  eq(/A<span/.test(body.innerHTML) || /📄 A/.test(body.innerHTML), true, 'ツリーに図面が出る');

  console.log('\n【外すのは読込(置き換え)だけ】');
  const E = R('js/edit.js');
  const run = E.slice(E.indexOf('function loadProjectText('), E.indexOf('function dl('));
  eq(/applyProjectData\(d\);[\s\S]{0,400}if \(!mode0 && typeof ptreeDetach === 'function'\) ptreeDetach\(\);/.test(run), true, '★置き換えのときだけ、ツリーからでない(mode0 なし=読込)ときに外す');
  eq(run.slice(run.indexOf("if (mode === 'append')"), run.indexOf('pushH();\n        const { fixedIds')).includes('ptreeDetach'), false, '★読込の「追加」では外さない');

  console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
