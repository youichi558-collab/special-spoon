// PLC・インバータ・サーボアンプ等の「装置の端子」の扱いのテスト
//   node tests/test_device_terminal.js
//
// 【背景】2026-08-23、盛田さんの指摘:
//   「端子台記号は同じだがPLC,インバーター,サーボアンプは部品要素だが
//     端子番号をどう扱うのかが疑問」
//   「端子台表には出さないな、端子台ではないから」
//
// 図面上は端子台と同じ○/◎で描くが意味が違う。
//   端子台TB1の○ = 端子台という部品の端子1個
//   PLC1の○      = PLC1という1台の装置の接続点(X0等)
//
// 【2026-09-21 方式変更】当初は部品DBの種別から自動判定していた
// (isDeviceTerminal / DEVICE_PART_TYPES)。これをやめ、**デバイス単位で人が
// 1回決める**形にした(盛田さん「おれはデバイスで読めと言ってる」)。
//
// 変えた理由:
//   ・帳票を開くたびに部品DBを引き直すため、部品DBが読めないと答えが変わり、
//     しかも行が増えるだけなので間違いに気付けなかった
//   ・端子の型式欄は手入力で、部品DBの型番と一致する保証が無い
//   ・除外リストは終わりが無く、新種別を足し忘れると黙って混ざる
//
// 「端子台の種別(terminal)だけ拾う」案は**不採用**。盛田さん「端子台の選定は
// 一番最後にだいたい決まる、図面全部書いてから」——作図中の端子台は型式が
// 空なのが普通で、拾う側にすると端子台表が一番使いたい時期に空になる。
//
// 【後方互換が最重要】既定は「端子台として集計する」。型式が空でも部品DBが
// 空でも端子台は消えてはならない。既存図面の端子台が黙って端子台表から
// 消えると実害が大きいため、そのケースを重点的に検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

const reportSrc = fs.readFileSync(__dirname + '/../js/report.js', 'utf8');
const uiSrc     = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
// 種別コードの定義(PART_TYPE_CODES等)は2026-09-02にjs/part_types.jsへ切り出した
// (部品DB単独画面と共有するため)。ui.js側は今でも LEGACY_PART_TYPES[type] 等を
// 「使って」いるので uiSrc は引き続き要るが、「定義」はこちらから読む。
const typesSrc  = fs.readFileSync(__dirname + '/../js/part_types.js', 'utf8');

const grab = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
};
const grabConst = (src, name) => {
  const start = src.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`定数 ${name} が見つかりません`);
  const end = src.indexOf('\n', start);
  return src.slice(start, end + 1);
};

function makeSandbox(customParts, pages) {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    [grab(reportSrc, 'isTBExcluded'),
     grab(reportSrc, 'collectTerminals'),
     grab(reportSrc, 'groupTerminalsByDevice'),
     grab(uiSrc, 'parseTerminalGroups'),
     grab(uiSrc, 'junctionTermOptionsHtml')].join('\n'),
    sandbox
  );
  sandbox.state = { customParts, pages };
  sandbox.elLocation = () => '1/A1';
  sandbox._escAttr = s => String(s);
  return sandbox;
}

const PARTS = [
  { ref: 'FX3U-32MR', type: 'plc',       terminals: '入力:X0,X1,X2,COM/出力:Y0,Y1,COM' },
  { ref: 'MR-J5-10G', type: 'servo',     terminals: 'L1,L2,L3,U,V,W' },
  { ref: 'FRN0.4E3S', type: 'inverter',  terminals: '主回路:L1,L2,L3,U,V,W/制御:FWD,REV,CM' },
  { ref: 'GT2103',    type: 'hmi',       terminals: 'SD,RD,SG' },
  { ref: 'FX3U-16EX', type: 'plc_unit',  terminals: 'X20,X21,COM' },
  { ref: '端子台 M4',  type: 'terminal',  terminals: '' },
  { ref: 'S-T21',     type: 'contactor', terminals: 'A1,A2,1,3,5,2,4,6' },
];

const J = (partRef, partModel, label) =>
  ({ type: 'junction', style: 'circle', partRef, partModel, label, id: partRef + '-' + label });

// ------------------------------------------------------------------
console.log('【端子は全部拾う。除外はデバイス単位のフラグだけ】');
{
  const pages = [{ elements: [
    J('TB1',  '端子台 M4', '1'),
    J('TB1',  '端子台 M4', '2'),
    J('PLC1', 'FX3U-32MR', 'X0'),
    J('PLC1', 'FX3U-32MR', 'Y0'),
    J('SV1',  'MR-J5-10G', 'U'),
    J('GOT1', 'GT2103',    'SD'),
    J('INV1', 'FRN0.4E3S', 'U'),
  ] }];
  const s = makeSandbox(PARTS, pages);
  const devs = [...s.groupTerminalsByDevice(s.collectTerminals()).keys()].sort();
  eq(devs, ['GOT1','INV1','PLC1','SV1','TB1'],
     '部品DBの種別では除外しない(全デバイスが拾われる)');
  eq(s.collectTerminals().length, 7, '端子は7点すべて拾う');

  // 部品DBを空にしても結果が変わらないこと。ここが今回の眼目
  // ——帳票が部品DBの状態に左右されないようにするための変更だった。
  const s2 = makeSandbox([], pages);
  eq(s2.collectTerminals().length, 7, '部品DBが空でも結果が同じ');
  eq([...s2.groupTerminalsByDevice(s2.collectTerminals()).keys()].sort(),
     ['GOT1','INV1','PLC1','SV1','TB1'], '部品DBが空でもデバイス一覧が同じ');
}

console.log('【デバイス単位のフラグ(el.tbExclude)】');
{
  const ex = (partRef, label) => ({ ...J(partRef, '', label), tbExclude: true });
  const pages = [{ elements: [
    J('TB1', '', '1'), J('TB1', '', '2'),
    ex('PLC1', 'X0'), ex('PLC1', 'Y0'),
  ] }];
  const s = makeSandbox(PARTS, pages);
  // collectTerminals は全部返す(表には出すため)。分けるのは表示側。
  eq(s.collectTerminals().length, 4, '集計対象外の端子も collectTerminals は返す(表に出すため)');
  const rows = s.collectTerminals();
  eq(rows.filter(r => !s.isTBExcluded(r.el)).length, 2, '集計対象はTB1の2点');
  eq(rows.filter(r =>  s.isTBExcluded(r.el)).length, 2, '集計対象外はPLC1の2点');

  ok(s.isTBExcluded({ tbExclude: true }),  'tbExclude:true は集計対象外');
  ok(!s.isTBExcluded({ tbExclude: false }),'tbExclude:false は集計対象');
  ok(!s.isTBExcluded({}),                  '印が無ければ集計対象(既定)');
  ok(!s.isTBExcluded(undefined),           'undefined を渡しても落ちない');
}

console.log('【後方互換: 既存図面の端子台が黙って消えないこと】');
{
  // 型式が空・部品DBに無い型式・部品DB自体が空、のいずれでも端子台として残る
  const pages = [{ elements: [
    J('TB1', '',            '1'),   // 型式未設定(既存図面で最も多い)
    J('TB2', '知らない型番',  '1'),   // 部品DBに無い型式
    J('TB3', undefined,     '1'),   // 型式フィールド自体が無い
  ] }];
  const s = makeSandbox(PARTS, pages);
  const devs = [...s.groupTerminalsByDevice(s.collectTerminals()).keys()].sort();
  eq(devs, ['TB1','TB2','TB3'], '型式が空/不明/未定義でも端子台として残る');

  const s2 = makeSandbox([], pages);   // 部品DBが空
  eq(s2.collectTerminals().length, 3, '部品DBが空でも端子台は消えない');

  // 既存図面には tbExclude が無い。既定で端子台として集計されること。
  pages[0].elements.forEach(el => {
    ok(!s.isTBExcluded(el), `${el.partRef}: 印の無い既存要素は端子台として集計される`);
  });
}

console.log('【●分岐点は従来どおり端子ではない】');
{
  const pages = [{ elements: [
    { type:'junction', style:'dot', partRef:'', label:'', id:'d1' },
    J('TB1', '端子台 M4', '1'),
  ] }];
  const s = makeSandbox(PARTS, pages);
  eq(s.collectTerminals().length, 1, '●分岐点は除外され、端子台のみ残る');
}

console.log('【端子番号の候補リストが部品DBから出る】');
{
  const el = J('PLC1', 'FX3U-32MR', '');
  const s = makeSandbox(PARTS, [{ elements: [el] }]);
  const html = s.junctionTermOptionsHtml(el);
  ['X0','X1','X2','COM','Y0','Y1'].forEach(t =>
    ok(html.includes(`value="${t}"`), `候補に ${t} が出る`));
  ok(html.includes('入力'), 'グループ名(入力)が説明として付く');
  ok(html.includes('出力'), 'グループ名(出力)が説明として付く');
}

console.log('【使用済みの端子番号に印が付く】');
{
  const target = J('PLC1', 'FX3U-32MR', '');
  const pages = [{ elements: [
    J('PLC1', 'FX3U-32MR', 'X0'),   // 既に使用済み
    target,
  ] }];
  const s = makeSandbox(PARTS, pages);
  const html = s.junctionTermOptionsHtml(target);
  const x0 = html.match(/value="X0">([^<]*)</);
  const x1 = html.match(/value="X1">([^<]*)</);
  ok(x0 && x0[1].includes('使用済み'), 'X0は使用済みと表示される');
  ok(x1 && !x1[1].includes('使用済み'), 'X1は未使用なので印が付かない');
}

console.log('【型式が無ければ候補は空(従来どおり自由入力)】');
{
  const el = J('TB1', '', '');
  const s = makeSandbox(PARTS, [{ elements: [el] }]);
  eq(s.junctionTermOptionsHtml(el), '', '型式未設定なら候補は空');

  const el2 = J('TB1', '端子台 M4', '');
  const s2 = makeSandbox(PARTS, [{ elements: [el2] }]);
  eq(s2.junctionTermOptionsHtml(el2), '', '端子番号を持たない部品なら候補は空');
}

// ------------------------------------------------------------------
console.log('【種別コードが揃っている】');
console.log('  種別を1つ足すとPART_TYPE_CODES / PART_TYPE_LABELS / PART_TYPE_ORDER を');
console.log('  直す必要がある。過去に漏れの前例あり');
// 【2026-09-03】部品の登録フォーム(セレクタ・CSVヘルプ)は部品DB単独画面
// (parts.html)へ移した。parts.html側はPART_TYPE_ORDERから動的に<select>を
// 組み立てる(js/parts_page.js の fillTypeSelect())ので、index.htmlのように
// コードを直書きしたセレクタ・ヘルプ文言は無くなっており、この形の
// 「取りこぼし」自体が起こらない。よってここでのHTML側の突き合わせは不要になった。
{
  const codes = JSON.parse('[' +
    typesSrc.match(/const PART_TYPE_CODES = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  const order = JSON.parse('[' +
    typesSrc.match(/const PART_TYPE_ORDER = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  const labelsBlock = typesSrc.match(/const PART_TYPE_LABELS = \{[\s\S]*?\n\};/)[0];
  const labelKeys = [...labelsBlock.matchAll(/(\w+):\s*'/g)].map(m => m[1]);

  const missing = (list, name) => codes.filter(c => !list.includes(c))
    .forEach(c => { ng++; console.log(`  NG ${name} に ${c} が無い`); });

  missing(labelKeys, 'PART_TYPE_LABELS');
  missing(order,     'PART_TYPE_ORDER');
  ok(codes.every(c => labelKeys.includes(c)), 'PART_TYPE_LABELS が全コードを網羅');
  ok(codes.every(c => order.includes(c)),     'PART_TYPE_ORDER が全コードを網羅');
  eq(order.length, codes.length, 'PART_TYPE_ORDER の件数が PART_TYPE_CODES と一致');

  // 【2026-09-21】ここでは以前、DEVICE_PART_TYPES(装置系の種別リスト)の綴りが
  // 正規の種別コードと合っているかを見ていた。そのリスト自体を廃止したので、
  // 「復活していないこと」の見張りに変える。種別で自動判定する方式に戻すと、
  // 帳票の結果が部品DBの状態で変わる問題が再発する(経緯は js/report.js 参照)。
  ok(!/const DEVICE_PART_TYPES\s*=/.test(reportSrc),
     '★DEVICE_PART_TYPES が復活していない(種別による自動判定はしない)');
  ok(!/function isDeviceTerminal\s*\(/.test(reportSrc),
     '★isDeviceTerminal が復活していない');
  // 端子台表が部品DB(customParts)を引いていないこと。ここが今回の変更の要。
  {
    const ct = reportSrc.slice(reportSrc.indexOf('function collectTerminals'),
                               reportSrc.indexOf('function groupTerminalsByDevice'));
    ok(!/customParts/.test(ct), '★collectTerminals が部品DBを引いていない');
  }

  // 定義が js/ui.js に再び紛れ込んでいないこと(5箇所目を作らない、の逆側の見張り)。
  // 部品DB単独画面(parts.html)を作るとき、ここに書かず part_types.js を
  // 読み込む形を保つための歯止め。
  ok(!/const PART_TYPE_CODES\s*=/.test(uiSrc),
     '★PART_TYPE_CODES の定義が js/ui.js に無い(part_types.jsだけにある)');
  ok(!/const PART_TYPE_LABELS\s*=/.test(uiSrc),
     '★PART_TYPE_LABELS の定義が js/ui.js に無い');
  ok(!/const PART_TYPE_ORDER\s*=/.test(uiSrc),
     '★PART_TYPE_ORDER の定義が js/ui.js に無い');
  ok(!/const LEGACY_PART_TYPES\s*=/.test(uiSrc),
     '★LEGACY_PART_TYPES の定義が js/ui.js に無い');
}

// ------------------------------------------------------------------
console.log('【廃止した種別(sw_no/sw_nc)の扱い】');
{
  // 【2026-09-03】CSV一括登録は部品DB単独画面(parts.html / js/parts_page.js)
  // へ移した。CADのindex.html/js/ui.jsにはもうこの経路が無いので、
  // legacy種別の扱いはそちらのソースで確認する。
  const pageSrc = fs.readFileSync(__dirname + '/../js/parts_page.js', 'utf8');
  const codes = JSON.parse('[' +
    typesSrc.match(/const PART_TYPE_CODES = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  const legacyBlock = typesSrc.match(/const LEGACY_PART_TYPES = \{[^}]*\}/)[0];

  ok(!codes.includes('sw_no'), 'sw_no は部品DBの種別から外れている');
  ok(!codes.includes('sw_nc'), 'sw_nc は部品DBの種別から外れている');
  ok(codes.includes('contact_unit'), 'contact_unit が種別に入っている');

  ok(legacyBlock.includes('sw_no') && legacyBlock.includes('sw_nc'),
     'LEGACY_PART_TYPES に旧コードが登録され、取込は通る(既存CSVが再取込できなくならない)');
  ok(pageSrc.includes('LEGACY_PART_TYPES[type]'),
     'CSV取込で旧コードを弾かずに要再分類として扱う');
  ok(pageSrc.includes('要再分類'), '旧コードの部品は「要再分類」と表示される');

  // 自動変換していないこと(IDECのsw_noは実際には押ボタン等なので、機械的に
  // contact_unitへ変換すると誤分類になる)
  ok(!/sw_no'?\s*:\s*'contact_unit/.test(pageSrc) && !/sw_no.*→.*contact_unit/.test(pageSrc),
     'sw_no→contact_unit の自動変換はしていない(誤分類防止)');

  // 【2026-09-21】ここでは以前、図面側のシンボル種別としての sw_no / sw_nc と
  // contactType が js/data.js に残っていることを確認していた。標準シンボル20種を
  // 削除した(盛田さんの指示・一度も使っていない/端子点が無く使い物にならない)ため、
  // 確認の向きを逆にする。部品DBの LEGACY_PART_TYPES(上の確認)は別物なので残る。
  const dataSrc = fs.readFileSync(__dirname + '/../js/data.js', 'utf8');
  ok(!/^\s*sw_no:/m.test(dataSrc) && !/^\s*sw_nc:/m.test(dataSrc),
     '図面のシンボル種別としてのsw_no/sw_ncはDEFSから削除されている');
  ok(!dataSrc.includes('contactType'),
     'contactType(標準シンボル専用だった)もDEFSから消えている');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
