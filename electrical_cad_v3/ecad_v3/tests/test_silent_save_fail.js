// 「無言で保存できていない」箇所のテスト
//   node tests/test_silent_save_fail.js
//
// 【背景・2026-09-01】
// 部品DBが605件→168件に巻き戻った事故の原因は、保存の失敗を誰にも伝えない
// コードだった。同じ性質の箇所を横断で探したところ、localStorage側に2つ残っていた:
//
//   A. saveSymbolsToStorage() が catch(e) {} で握りつぶしていた(2026-10-03 段階3で js/sym_store.js へ移った)。
//      localStorageが容量超過すると、登録したカスタムシンボルが無言で保存されず、
//      タブを閉じた時点で消える。図面の自動保存と同じlocalStorageを共有するため、
//      図面が育つほど起こりやすい。
//   B. symbol_lib.js が localStorage の中身を try/catch 無しで JSON.parse していた。
//      保存データが壊れているとIIFEのトップレベルで例外が出て、symbolLib 自体が
//      undefined になり、シンボルライブラリ機能が丸ごと起動しなくなる。
//
// このテストは実ソースを実行して、A=知らせる／B=落ちない ことを確認する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const stateSrc = fs.readFileSync(__dirname + '/../js/state.js', 'utf8');
const uiSrc    = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const libSrc   = fs.readFileSync(__dirname + '/../js/symbol_lib.js', 'utf8');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つからない:' + re); return m[0]; };

// 画面上の帯を受け取れる最小限のDOM
function makeDom() {
  const els = {};
  return {
    els,
    document: {
      getElementById: id => els[id] || null,
      querySelectorAll: () => Object.values(els).filter(e => e._banner),
      createElement: () => ({ style: {}, id: '', textContent: '', _banner: false,
                              setAttribute(k) { if (k === 'data-topbanner') this._banner = true; },
                              remove() { delete els[this.id]; } }),
      body: { appendChild: el => { els[el.id] = el; } },
    },
  };
}

// ------------------------------------------------------------------
// 【2026-10-03 段階3】登録シンボルの保存先はライブラリになり、ブラウザの中(localStorage)へ書くのは
// ライブラリが読めていない間だけになった(js/sym_store.js _symLegacyWrite)。そこで容量超過したら知らせることを見る。
console.log('【A: 容量超過を知らせる(登録シンボル・ライブラリが読めていない間の保存)】');
const aDone = (async () => {
  const dom = makeDom();
  let quotaFull = true;
  const alerts = [];
  const store = {};
  const sandbox = {
    console, state: { customSymbols: [], pages: [], drawingSymbols: {} },
    document: dom.document,
    alert: m => alerts.push(String(m)),
    ecadLib: { isReady: () => false, get: () => ({}), resetMigrationSkip() {}, unmarkMigrated() {}, migrated: () => new Set() },
    localStorage: {
      setItem(k, v) { if (quotaFull) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store[k] = v; },
      getItem: k => (k in store ? store[k] : null),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(pick(stateSrc, /function showTopBanner\([\s\S]*?\n\}/), sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/sym_store.js', 'utf8'), sandbox);

  eq(await vm.runInContext('symStorePut', sandbox)([{ type: 'sym1' }]), false, '保存できなければ false を返す');
  ok(alerts.some(m => /保存できませんでした/.test(m) && /容量が一杯/.test(m)), '★保存できなかったこと・容量超過だと知らせる');
  ok(alerts.some(m => /ライブラリフォルダ/.test(m)), 'ライブラリフォルダを設定すれば保存できると案内する');

  quotaFull = false;
  eq(await vm.runInContext('symStorePut', sandbox)([{ type: 'sym1' }]), true, '保存できたら true');
  ok(/sym1/.test(store.ecad_customSymbols || ''), 'ブラウザの中に保存された');
  const banner = dom.els['sym-save-banner'];
  ok(banner && /ライブラリ/.test(banner.textContent), '★ライブラリではなくブラウザの中に保存したことを帯で知らせる');
})();

// ------------------------------------------------------------------
console.log('\n【B: 保存データが壊れていても機能が死なない】');
{
  const store = { symLibFav: '{壊れたJSON', symLibRecent: '[[[' };
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild(){}, addEventListener(){} }),
                body: { appendChild(){} }, querySelectorAll: () => [] },
    window: {}, fetch: async () => ({ json: async () => [] }),
    state: { customSymbols: [] }, JSZip: undefined,
  };
  vm.createContext(sandbox);
  let threw = null;
  try { vm.runInContext(libSrc, sandbox); } catch (e) { threw = e; }
  ok(!threw, `壊れたデータでも読み込みで例外を投げない${threw ? '（実際: ' + threw.message + '）' : ''}`);
  ok(vm.runInContext('typeof symLib', sandbox) === 'object',
     'symLib が生きている（機能が丸ごと死なない）');
}

// ------------------------------------------------------------------
console.log('\n【帯の実装が1箇所にまとまっている】');
{
  const partsSrc = fs.readFileSync(__dirname + '/../js/parts_db.js', 'utf8');
  ok(/showTopBanner\('parts-db-banner'/.test(partsSrc),
     'parts_db.js は state.js の showTopBanner を使う（帯を自前で作らない）');
  ok(!/createElement\('div'\)[\s\S]{0,200}parts-db-banner/.test(partsSrc),
     'parts_db.js に帯のDOM生成が残っていない');
}

aDone.then(() => {
  console.log(ng === 0 ? '\n=== 全て OK ===' : `\n=== NG ${ng}件 ===`);
  process.exit(ng === 0 ? 0 : 1);
});
