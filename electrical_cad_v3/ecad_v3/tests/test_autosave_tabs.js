// CADを2つのタブで開いたとき、古いタブが新しいタブの作業を自動保存で上書きしないかのテスト(2026-10-10)
//   node tests/test_autosave_tabs.js
//
// 【背景】全体レビューで再現した: サーバーの窓を閉じてしまい start.bat を叩き直すと新しいタブ(B)が開き、
// 古いタブ(A)も残る。B で作業したあと A を閉じると、A の古い図面で自動保存が上書きされ、次に開くと B の作業が無かった
// (自動保存の置き場所 localStorage はタブどうしで共有。以前はタブを隠す・閉じるたびに、変わっていなくても必ず書いていた)。
// 直したこと(js/autosave.js): 中身(ページ)を変えて書くたびに印を置き、別のタブの印に変わっていたら書かずに赤い帯で知らせる。
// 中身が同じなら書いても失うものが無いので書く(印は変えない=開いただけのタブを閉じても、ほかのタブを止めない)。
//
// タブは「同じ localStorage を共有する別々のサンドボックス」で作る。本物の js/autosave.js を読み込む。
// ブラウザと同じく、あるタブが setItem したら、ほかのタブに storage の知らせを送る。
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const src = fs.readFileSync(__dirname + '/../js/autosave.js', 'utf8').replace(/\r\n/g, '\n');

const PAGE = n => ({
  elements: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, type: 'fline' })),
  wires: [], guides: [], groups: [],
});
const count = raw => raw ? JSON.parse(raw).pages.reduce((n, p) => n + p.elements.length + p.wires.length, 0) : null;

function makeBrowser(init) {
  const store = Object.assign({}, init);
  const tabs = [];
  function openTab() {
    const tab = { banners: {}, listeners: {}, hint: { textContent: '' } };
    const ls = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => {
        const old = k in store ? store[k] : null;
        store[k] = String(v);
        tabs.filter(t => t !== tab && !t.closed).forEach(t => (t.listeners.storage || []).forEach(f => f({ key: k, oldValue: old, newValue: String(v) })));
      },
      removeItem: k => { delete store[k]; },
    };
    const on = (t, f) => { (tab.listeners[t] = tab.listeners[t] || []).push(f); };
    const sb = {
      console: { ...console, error: () => {} }, localStorage: ls,
      state: { pages: [PAGE(0)], currentPage: 0, zoom: 1, pan: { x: 0, y: 0 }, darkMode: false,
        saveFileName: '', customSymbols: [], customParts: [], wireNoRule: {} },
      LAYERS: [], DEFS: {},
      _syncCurrentPage: () => {},
      setTimeout: fn => fn(), clearTimeout: () => {},
      showTopBanner: (id, msg) => { tab.banners[id] = msg; },
      document: { getElementById: () => tab.hint, addEventListener: on, visibilityState: 'visible' },
      window: { addEventListener: on },
    };
    vm.createContext(sb);
    vm.runInContext(src, sb);
    sb.restoreAutosave();   // 起動時の復元(boot.js と同じ)
    tab.sb = sb;
    tab.count = () => sb.state.pages.reduce((n, p) => n + p.elements.length + p.wires.length, 0);
    tab.edit = n => { sb.state.pages = [PAGE(n)]; sb.doAutosave(); };          // 編集して自動保存が走る
    tab.hide = () => (tab.listeners.visibilitychange || []).forEach(f => { sb.document.visibilityState = 'hidden'; f(); sb.document.visibilityState = 'visible'; });
    tab.close = () => { (tab.listeners.pagehide || []).forEach(f => f()); tab.closed = true; };
    tab.stopped = () => !!tab.banners['autosave-othertab-banner'];
    tabs.push(tab);
    return tab;
  }
  return { store, openTab };
}

console.log('【レビューで再現した流れ: B で作業 → B を閉じる → 古い A を閉じる】');
{
  const br = makeBrowser({});
  const A = br.openTab();
  A.edit(158);
  const B = br.openTab();
  ok(B.count() === 158, 'B は A の自動保存から復元される');
  A.hide();   // B を開くと A は隠れる
  B.edit(148);
  ok(count(br.store.ecad_autosave) === 148, 'B の作業(148)が自動保存される');
  ok(A.stopped(), 'B が書いた時点で、A に赤い帯が出る(このタブは自動保存しない)');
  B.close();
  A.close();
  ok(count(br.store.ecad_autosave) === 148, 'A を閉じても B の作業(148)が残る(以前は A の 158 で上書きされた)');
  const C = br.openTab();
  ok(C.count() === 148, '開き直すと B の作業のあとの図面になる');
}

console.log('【古いタブで作業しても、新しいタブの分を上書きしない】');
{
  const br = makeBrowser({});
  const A = br.openTab(); A.edit(10);
  const B = br.openTab(); B.edit(20);
  A.edit(11);
  ok(count(br.store.ecad_autosave) === 20, 'A の変更は書かない(B の 20 が残る)');
  ok(A.stopped() && /別のタブ/.test(A.banners['autosave-othertab-banner']), 'A には「別のタブ」の帯が出る');
  ok(/別のタブ/.test(A.hint.textContent), '下のバーの案内にも出る');
  ok(!B.stopped(), 'B には帯は出ない');
  B.edit(21);
  ok(count(br.store.ecad_autosave) === 21, 'B は続けて自動保存できる');
}

console.log('【開いただけで何もしていないタブを閉じても、残った方のタブを止めない】');
{
  const br = makeBrowser({});
  const A = br.openTab(); A.edit(30);
  const stamp = br.store.ecad_autosave_stamp;
  const B = br.openTab();
  B.hide(); B.close();
  ok(br.store.ecad_autosave_stamp === stamp, '何もしていない B は「書いた」印を変えない(中身が同じなので)');
  ok(!A.stopped(), 'A は止まらない');
  A.edit(31);
  ok(count(br.store.ecad_autosave) === 31, 'A は続けて自動保存できる');
  const stamp2 = br.store.ecad_autosave_stamp;
  A.hide();
  ok(br.store.ecad_autosave_stamp === stamp2, '変わっていなければ A を隠しても書かない');
}

console.log('【1つのタブだけなら今まで通り】');
{
  const br = makeBrowser({});
  const A = br.openTab();
  A.edit(5); A.edit(6); A.edit(7);
  ok(count(br.store.ecad_autosave) === 7, '編集のたびに自動保存される');
  ok(count(br.store.ecad_autosave_prev) === 6, '1世代前も残る');
  ok(!A.stopped(), '帯は出ない');
  A.sb.state.pan = { x: 50, y: 0 };   // 表示だけ動かしてリロード(盛田さんの Ctrl+Shift+R)
  A.close();
  ok(JSON.parse(br.store.ecad_autosave).pan.x === 50, '表示の位置だけ変えても、閉じるときに書く(リロードで位置が戻る)');
  const A2 = br.openTab();
  ok(A2.count() === 7 && !A2.stopped(), 'リロードすると復元され、そのまま自動保存できる');
  A2.edit(8);
  ok(count(br.store.ecad_autosave) === 8, 'リロード後も自動保存される');
}

console.log('【印の無い前のデータ(直す前に保存したもの)からでも動く】');
{
  const old = JSON.stringify({ version: 2, savedAt: 1, pages: [PAGE(9)] });
  const br = makeBrowser({ ecad_autosave: old });
  const A = br.openTab();
  ok(A.count() === 9, '復元される');
  A.edit(10);
  ok(count(br.store.ecad_autosave) === 10 && !A.stopped(), '自動保存される');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
