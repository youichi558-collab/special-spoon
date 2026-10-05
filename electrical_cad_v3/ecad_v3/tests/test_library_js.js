// 図面枠テンプレート・表題欄様式をライブラリから読み書きする画面側のテスト
//   node tests/test_library_js.js
//
// 【背景・2026-10-03 再設計の段階2】
// 置き場所をブラウザの中(localStorage)からライブラリフォルダ(frames.json / titleblocks.json)へ移した(js/library.js)。
// 表題欄の様式は図面を描くときに引くので、図面にも使った様式の写しを入れる(js/edit.js usedTitleBlockTplsForSave)。
//
// このテストが守るもの:
//   1. 起動直後は前回読めた内容(キャッシュ)で表示し、ライブラリが読めたら置き換える
//   2. 保存は読んだ時点の版を送る。conflict なら読み直す
//   3. ライブラリが読めていない間は保存しない(案内を返す)
//   4. ブラウザに残っている旧データは消さず、ライブラリに無いものだけ移す
//   5. 表題欄の様式は 組み込み → 図面の写し → ライブラリ の順に重ねる(ライブラリが正)
//   6. 図面には使った様式(組み込み以外)の写しだけ入れ、保存4経路とも入れる

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const read = p => fs.readFileSync(__dirname + '/../' + p, 'utf8').replace(/\r\n/g, '\n');

function mkStorage(init) {
  const m = Object.assign({}, init);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m };
}

function load({ storage = {}, server }) {
  const calls = [];
  const els = {};
  const sb = {
    console, JSON, Object, Promise,
    localStorage: mkStorage(storage),
    escH: s => String(s == null ? '' : s),
    alert: () => {},
    document: {
      body: { appendChild: el => { els[el.id] = el; } },
      createElement: () => ({ style: {}, remove() { delete els[this.id]; } }),
      getElementById: id => els[id] || (els[id] = { set onclick(f) { this._click = f; } }),
    },
    fetch: async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      calls.push({ url, method: (opts && opts.method) || 'GET', body });
      return { json: async () => server(url, body) };
    },
    _els: els,
  };
  vm.createContext(sb);
  vm.runInContext(read('js/library.js'), sb);
  sb.ecadLib = vm.runInContext('ecadLib', sb);
  sb.calls = calls;
  return sb;
}

(async () => {

console.log('【起動直後はキャッシュ、読めたらライブラリ】');
{
  const s = load({
    storage: { ecad_lib_cache_titleblocks: JSON.stringify({ old: { label: '前回' } }) },
    server: url => ({ ok: true, data: url.endsWith('titleblocks') ? { lib: { label: 'ライブラリ' } } : {}, version: 'v1' }),
  });
  eq(Object.keys(s.ecadLib.get('titleblocks')), ['old'], '起動直後は前回読めた内容(キャッシュ)で描ける');
  ok(!s.ecadLib.isReady('titleblocks'), 'まだ保存はできない(ライブラリを読んでいない)');
  await s.ecadLib.load();
  eq(Object.keys(s.ecadLib.get('titleblocks')), ['lib'], '★読めたらライブラリの内容に置き換わる');
  eq(JSON.parse(s.localStorage.getItem('ecad_lib_cache_titleblocks')), { lib: { label: 'ライブラリ' } }, 'キャッシュも更新');
}

console.log('\n【保存は版を送る・conflict なら読み直す】');
{
  let ver = 'v1', data = { a: { label: 'A' } };
  const s = load({ server: (url, body) => {
    if (!body) return { ok: true, data, version: ver };
    if (body.version !== ver) return { ok: false, reason: 'conflict', error: '別の画面か別のPCで保存されています' };
    data = body.data; ver = 'v' + (Number(ver.slice(1)) + 1); return { ok: true, version: ver };
  } });
  await s.ecadLib.load();
  let r = await s.ecadLib.save('frames', { x: { w: '1' } });
  ok(r.ok, '保存できる');
  eq(s.calls[s.calls.length - 1].body.version, 'v1', '★読んだ時点の版を送る');
  r = await s.ecadLib.save('frames', { y: { w: '2' } });
  eq(s.calls[s.calls.length - 1].body.version, 'v2', '★2回目は1回目の保存で返った版');
  ver = 'v9'; data = { other: { w: '3' } };   // 別のPCが保存した
  r = await s.ecadLib.save('frames', { z: { w: '4' } });
  ok(!r.ok && /別の画面か別のPC/.test(r.error), 'conflict は失敗を返す');
  eq(Object.keys(s.ecadLib.get('frames')), ['other'], '★読み直して相手の内容を表示する');
  ok((await s.ecadLib.save('frames', { z: { w: '4' } })).ok, '読み直した後なら保存できる');
}

console.log('\n【ライブラリが読めていない間は保存しない】');
{
  const s = load({ server: () => ({ ok: false, source: 'unset', error: '部品DBの場所(ライブラリフォルダ)が未設定です' }) });
  await s.ecadLib.load();
  const n = s.calls.length;
  const r = await s.ecadLib.save('titleblocks', { a: {} });
  ok(!r.ok && /設定タブの「部品DB」/.test(r.error), '★設定のしかたを案内する');
  eq(s.calls.length, n, 'サーバーへ送らない');
}

console.log('\n【ブラウザに残っている旧データは消さず、ライブラリに無いものだけ移す】');
{
  const saved = {};
  const s = load({
    storage: {
      ecad_frame_tpls: JSON.stringify({ 旧A3: { w: '420' }, 共通: { w: '1' } }),
      ecad_titleblock_tpls: JSON.stringify({ custA: { label: '客先A', cells: [] } }),
    },
    server: (url, body) => {
      const k = url.split('/').pop();
      if (body) { saved[k] = body.data; return { ok: true, version: 'v2' }; }
      return { ok: true, data: k === 'frames' ? { 共通: { w: '1' } } : {}, version: 'v1' };
    },
  });
  await s.ecadLib.load();
  const ov = s._els['lib-migrate'];
  ok(ov && /旧A3/.test(ov.innerHTML) && /客先A/.test(ov.innerHTML) && !/共通/.test(ov.innerHTML),
     '★ライブラリに無いもの(旧A3・客先A)だけを挙げて聞く');
  await s._els['lib-migrate-go']._click();
  eq(Object.keys(saved.frames).sort(), ['共通', '旧A3'].sort(), '★ライブラリの内容に足して保存する(上書きで消さない)');
  eq(Object.keys(saved.titleblocks), ['custA'], '表題欄の様式も移す');
  ok(s.localStorage.getItem('ecad_frame_tpls') && s.localStorage.getItem('ecad_titleblock_tpls'), '★ブラウザの中の旧データは消さない');
}
{
  const s = load({
    storage: { ecad_frame_tpls: JSON.stringify({ 旧A3: {} }), ecad_lib_migrate_skip: '1' },
    server: () => ({ ok: true, data: {}, version: '' }),
  });
  await s.ecadLib.load();
  ok(!s._els['lib-migrate'], '「今後聞かない」を選んでいたら聞かない');
}

console.log('\n【表題欄の様式の重ね方・図面に入れる写し】');
{
  const sb = { state: { drawingTbTpls: {}, pages: [] }, ecadLib: { get: () => ({}) }, console };
  vm.createContext(sb);
  const data = read('js/data.js');
  vm.runInContext(data.match(/const TITLE_BLOCK_TPLS = \{[\s\S]*?\n\};/)[0].replace('const TITLE_BLOCK_TPLS', 'var TITLE_BLOCK_TPLS'), sb);
  ['libTitleBlockTpls', 'userTitleBlockTpls', 'allTitleBlockTpls', 'titleBlockCells'].forEach(fn =>
    vm.runInContext(data.match(new RegExp('function ' + fn + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0], sb));
  vm.runInContext(read('js/edit.js').match(/function usedTitleBlockTplsForSave\(pages\) \{[\s\S]*?\n\}/)[0], sb);
  const C = lbl => ({ label: lbl, cells: [{ x: 0, y: 0, w: 1, h: 1, key: 'title', lbl }] });
  sb.state.drawingTbTpls = { custA: C('図面の写し'), onlyDrawing: C('図面だけ') };
  sb.ecadLib = { get: () => ({ custA: C('ライブラリ') }) };
  const cells = k => vm.runInContext('titleBlockCells', sb)({ tbTpl: k })[0].lbl;
  eq(cells('custA'), 'ライブラリ', '★同じ様式ならライブラリが正');
  eq(cells('onlyDrawing'), '図面だけ', '★ライブラリに無い様式は図面の写しで描ける(別のPCで作った図面)');
  eq(cells('無い様式'), vm.runInContext('TITLE_BLOCK_TPLS.standard.cells[0].lbl', sb), 'どちらにも無ければ標準様式');
  const used = vm.runInContext('usedTitleBlockTplsForSave', sb)([
    { frameObj: { tbTpl: 'custA' } }, { frameObj: { tbTpl: 'standard' } }, { frameObj: null }, { frameObj: { tbTpl: 'onlyDrawing' } }]);
  eq(Object.keys(used).sort(), ['custA', 'onlyDrawing'], '★使った様式(組み込み以外)だけを図面に入れる');
  eq(used.custA.label, 'ライブラリ', '入れるのは今使っている定義(ライブラリが正)');
}
const saves = [
  ['js/edit.js(1ページ保存)', /titleBlockTpls:\s*usedTitleBlockTplsForSave\(pages\)/.test(read('js/edit.js')) && /_saveData\(pages, state\.saveFileName\)/.test(read('js/edit.js'))],
  ['js/edit.js(全ページ保存)', /titleBlockTpls:\s*usedTitleBlockTplsForSave\(pages\)/.test(read('js/edit.js')) && /_saveData\(state\.pages/.test(read('js/edit.js'))],
  ['js/autosave.js(自動保存)', /titleBlockTpls:[^\n]*usedTitleBlockTplsForSave\(state\.pages\)/.test(read('js/autosave.js'))],
  ['js/backup.js(バックアップ)', /titleBlockTpls:[^\n]*usedTitleBlockTplsForSave\(state\.pages\)/.test(read('js/backup.js'))],
];
saves.forEach(([n, hit]) => ok(hit, '保存の経路: ' + n));
ok(!/localStorage\.(get|set)Item\(\s*['"]ecad_frame_tpls|TB_TPL_STORE/.test(read('js/frame.js') + read('js/data.js')),
   '★図面枠・表題欄の様式をブラウザの中(旧キー)へ書く・から読む経路が残っていない');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
})();
