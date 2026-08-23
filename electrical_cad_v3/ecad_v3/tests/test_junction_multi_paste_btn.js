// 端子(junction)を複数選択したときの「見た目を貼り付け」ボタンのテスト
//   node tests/test_junction_multi_paste_btn.js
//
// 【背景】盛田さん「コピーはどうなった？」。
// 端子の見た目コピー・貼り付けボタンは、当初「単一の端子を選んだときのパネル」
// (isTermブロック、◆デバイスの前)にしか置いていなかった。複数選択すると
// updateRightPanel は totalSel>=2 の別パネル(バウンディングボックス編集UI)に
// 切り替わるため、コピーした後に複数の端子を選んで貼り付けようとしても、
// 貼り付けボタンがどこにも表示されない状態になっていた。
//
// 一般要素の pasteDeviceProps は totalSel>=2 のパネルにもボタンがあり
// (「選択中のN個へデバイス/型式/仕様を貼り付け」)、端子側にも同じ場所に
// 対応するボタンを追加した。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const src = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
};

function makeSandbox(elements, selIds, opts = {}) {
  const domEls = {};
  const stub = () => ({ innerHTML: '', style: {}, addEventListener(){}, value: '' });
  const sandbox = {
    document: { getElementById: id => domEls[id] || (domEls[id] = stub()), createElement: () => stub() },
    console,
    state: {
      sel: { els: new Set(selIds), wires: new Set() },
      wires: [], darkMode: false,
      page: { groups: [] },
      pages: [{ elements, currentPage: 'p1', name: 'p1' }],
      elements: [],
    },
    LAYERS: [{ name: '1' }],
    partRefOptionsHtml: () => '', junctionTermOptionsHtml: () => '', colorCodeBtns: () => '',
    _escAttr: s => String(s),
    junctionClipboard: opts.junctionClipboard ?? null,
    deviceClipboard: opts.deviceClipboard ?? null,
    groupDevicePropsHtml: () => '',
  };
  sandbox.state.elements = sandbox.state.pages[0].elements;
  sandbox.state.page = sandbox.state.pages[0];
  vm.createContext(sandbox);
  domEls['rp-body'] = { innerHTML: '', _el: null, _wire: null, addEventListener(){}, removeEventListener(){} };
  domEls['rp-apply-btn'] = { style: {} };
  domEls['gp-x'] = stub(); domEls['gp-y'] = stub();
  vm.runInContext(grab('updateRightPanel'), sandbox);
  sandbox.updateRightPanel();
  return { html: domEls['rp-body'].innerHTML, domEls };
}

const J = (id, over) => Object.assign({ id, type:'junction', style:'circle', x:id*10, y:0, r:2, label:String(id) }, over);
const SYM = (id) => ({ id, type:'coil', x:id*10, y:0 });

// ------------------------------------------------------------------
console.log('【端子を複数選択・コピー済み: 貼り付けボタンが出る】');
{
  const { html } = makeSandbox([J(1), J(2)], [1, 2], { junctionClipboard: { devColor:'#f00' } });
  ok(html.includes('pasteJunctionProps()'), '複数選択パネルにpasteJunctionPropsのボタンがある');
  ok(html.includes('端子2個へ見た目を貼り付け'), '選択件数(2個)が表示される');
}

console.log('【端子を複数選択・コピーしていない: ボタンは出ない】');
{
  const { html } = makeSandbox([J(1), J(2)], [1, 2], {});
  ok(!html.includes('pasteJunctionProps()'), 'コピーしていなければボタンは出ない');
}

console.log('【端子以外を複数選択: コピー済みでもボタンは出ない】');
{
  const { html } = makeSandbox([SYM(1), SYM(2)], [1, 2], { junctionClipboard: { devColor:'#f00' } });
  ok(!html.includes('pasteJunctionProps()'), '端子が選択に含まれないのでボタンは出ない');
}

console.log('【端子と一般要素が混在: 端子の数だけボタンに出る】');
{
  const { html } = makeSandbox([J(1), SYM(2), J(3)], [1, 2, 3], { junctionClipboard: { devColor:'#f00' } });
  ok(html.includes('pasteJunctionProps()'), '端子が1つでも含まれればボタンが出る');
  ok(html.includes('端子2個へ見た目を貼り付け'), '端子の数だけ(2個、一般要素は数えない)表示される');
}

console.log('【一般要素のpasteDevicePropsボタンと共存する】');
{
  const { html } = makeSandbox([J(1), SYM(2)], [1, 2],
    { junctionClipboard: { devColor:'#f00' }, deviceClipboard: { devColor:'#0f0' } });
  ok(html.includes('pasteDeviceProps()'),  '一般要素用の貼り付けボタンも出る');
  ok(html.includes('pasteJunctionProps()'), '端子用の貼り付けボタンも出る(両方並ぶ)');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
