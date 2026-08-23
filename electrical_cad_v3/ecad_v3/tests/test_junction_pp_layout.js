// 端子(junction)プロパティのHTML構造テスト
//   node tests/test_junction_pp_layout.js
//
// 【背景】盛田さん「その辺の項目はシンボルプロパティと合わせた方が良さそうだが
// どう思う？」「はい」。端子(○/◎)のプロパティが、デバイス名・型式・端子番号
// (中身)と文字色/サイズ/位置補正(見た目調整)が混在して並んでいたのを、一般要素
// (シンボル)側と同じ pp-group(常時表示) + pp-details(折りたたみ)構造に揃えた。
//
// このテストは updateRightPanel 全体をevalするのではなく、対象箇所(isTermブロック)
// を含む生成ロジックをそのまま切り出して検証する。IDはすべて既存のまま
// (pp-jref/pp-jdfs/pp-jlabel等)なので、保存側(applyRightPanel)は変更していない。

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

const domEls = {};
const stub = () => ({ innerHTML: '', style: {}, addEventListener(){} });
const sandbox = {
  document: {
    getElementById: id => domEls[id] || null,
    createElement: () => stub(),
  },
  console,
  state: {
    sel: { els: new Set([1]), wires: new Set() },
    wires: [],
    darkMode: false,
    page: { groups: [] },
    pages: [{ elements: [
      { id:1, type:'junction', style:'circle', x:0, y:0, r:2,
        partRef:'TB1', partModel:'端子台 M4', label:'1', showDev:true,
        devFs:12, devColor:'#123456', devOffX:1, devOffY:2,
        labelFs:10, labelColor:'#abcdef', labelOffX:3, labelOffY:4 },
    ], currentPage: 'p1', name: 'p1' }],
    elements: [],   // get element経由で使う想定だが、ここでは直接pages[0].elementsを使う
  },
  LAYERS: [{ name: '1' }],
  partRefOptionsHtml: () => '',
  junctionTermOptionsHtml: () => '',
  colorCodeBtns: () => '',
  _escAttr: s => String(s),
  junctionClipboard: null,
};
sandbox.state.elements = sandbox.state.pages[0].elements;
sandbox.state.page = sandbox.state.pages[0];
sandbox.state.element = null;
vm.createContext(sandbox);

// updateRightPanel は巨大な関数だが、目的の部分(isTermブロック)を含めて
// 丸ごと切り出して評価する。rpスタブにHTMLが書き込まれる形。
domEls['rp-body'] = { innerHTML: '', _el: null, _wire: null, addEventListener(){}, removeEventListener(){} };
domEls['rp-apply-btn'] = { style: {} };

vm.runInContext(grab('updateRightPanel'), sandbox);
sandbox.updateRightPanel();
const html = domEls['rp-body'].innerHTML;

// ------------------------------------------------------------------
console.log('【端子プロパティが pp-group + pp-details 構造になっている】');
ok(html.includes('◆ デバイス'), '◆デバイスの見出しがある');
ok(html.includes('◆ 型式'),     '◆型式の見出しがある');
ok(html.includes('◆ 端子番号'), '◆端子番号の見出しがある');

const groupCount = (html.match(/class="pp-group"/g) || []).length;
ok(groupCount >= 3, `pp-groupが3つ以上ある(実際${groupCount})`);
const detailsCount = (html.match(/class="pp-details"/g) || []).length;
ok(detailsCount === 2, `pp-detailsが2つ(デバイス用・端子番号用)ある(実際${detailsCount})`);

console.log('【既存IDがすべて残っている(保存側は無修正で動く)】');
['pp-jref','pp-jrefshow','pp-jzone','pp-jdfs','pp-jdcolor','pp-jdox','pp-jdoy',
 'pp-jmodel','pp-jlabel','pp-jlfs','pp-jlcolor','pp-jlox','pp-jloy']
  .forEach(id => ok(html.includes(`id="${id}"`), `${id} が存在する`));

console.log('【色欄は一般要素側と同じ構成(ピッカー+コード入力+プリセット)】');
console.log('  ← 最初はピッカーだけで移植が不完全だった(盛田さん「プロパティの');
console.log('    色の出し方違くないか？」で発覚)');
ok(html.includes('id="pp-jdcolorcode"'), 'デバイス色: 16進コード入力欄がある');
ok(html.includes('id="pp-jlcolorcode"'), '端子番号色: 16進コード入力欄がある');
ok(/id="pp-jdcolor"[^>]*type="color"/.test(html) || /type="color"[^>]*id="pp-jdcolor"/.test(html),
   'デバイス色: カラーピッカーがある');
ok(html.includes("syncColorCode('pp-jdcolor','pp-jdcolorcode')"),
   'デバイス色: ピッカー変更でコード欄に同期する');
ok(html.includes("syncColorPicker('pp-jdcolorcode','pp-jdcolor')"),
   'デバイス色: コード欄変更でピッカーに同期する');
ok(html.includes("syncColorCode('pp-jlcolor','pp-jlcolorcode')"),
   '端子番号色: ピッカー変更でコード欄に同期する');

console.log('【値が正しく反映されている】');
ok(html.includes('value="TB1"'), 'デバイス名の値');
ok(html.includes('value="端子台 M4"'), '型式の値');
ok(html.includes('value="1"') && html.includes('id="pp-jlabel"'), '端子番号の値');

console.log('【見た目調整はdetailsの中(常時は見えない)にある】');
const devDetailsStart = html.indexOf('デバイス表示の詳細');
const devFsIdx = html.indexOf('id="pp-jdfs"');
ok(devDetailsStart >= 0 && devFsIdx > devDetailsStart,
   'デバイス文字サイズはdetailsより後ろにある(=中に入っている)');

console.log('【プレビュー関数がoninputに紐づいている(色/サイズ変更が即座に反映される)】');
ok(html.includes('oninput="previewJDeviceOff()"'), 'デバイス側にプレビューが紐づく');
ok(html.includes('oninput="previewJLabelOff()"'),  '端子番号側にプレビューが紐づく');

// ------------------------------------------------------------------
console.log('【previewJDeviceOff/previewJLabelOff/リセットの動作】');
{
  const s2 = { console };
  vm.createContext(s2);
  vm.runInContext(
    [grab('_previewTextStyle'), grab('_resetTextOffset'),
     src.slice(src.indexOf('const _J_DEV_IDS'), src.indexOf('function previewDeviceOff'))].join('\n'),
    s2
  );
  const rp = { _el: { } };
  const els = {
    'pp-jdfs': { value: '14' }, 'pp-jdcolor': { value: '#ff0000' },
    'pp-jdox': { value: '5' }, 'pp-jdoy': { value: '' },
  };
  s2.document = { getElementById: id => (id === 'rp-body' ? rp : els[id]) || null };
  s2.drawWithoutSel = () => { s2._drawn = true; };
  s2.rp_body = rp;
  // getElementById('rp-body') が rp を返すようにする
  s2.document.getElementById = id => id === 'rp-body' ? rp : (els[id] || null);

  s2.previewJDeviceOff();
  ok(rp._el.devFs === 14, 'previewJDeviceOff: サイズが反映される');
  ok(rp._el.devColor === '#ff0000', 'previewJDeviceOff: 色が反映される');
  ok(rp._el.devOffX === 5, 'previewJDeviceOff: 位置Xが反映される');
  ok(rp._el.devOffY === undefined, 'previewJDeviceOff: 空欄はundefinedになる');
  ok(s2._drawn, 'previewJDeviceOff: drawWithoutSelが呼ばれる');

  s2.resetJDeviceOff();
  ok(rp._el.devOffX === undefined && rp._el.devOffY === undefined,
     'resetJDeviceOff: 位置補正がリセットされる');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
