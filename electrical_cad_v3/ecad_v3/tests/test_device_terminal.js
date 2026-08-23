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
// 部品DBの種別(plc/plc_unit/hmi/servo)から自動判定する方式を採用した。
// 新しい入力項目もフラグ操作も増やさず、既存の型式欄だけで判定する。
//
// 【後方互換が最重要】型式が空、または部品DBに無い型式のときは従来どおり
// 端子台として扱わなければならない。既存図面の端子台が黙って端子台表から
// 消えると実害が大きいため、そのケースを重点的に検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

const reportSrc = fs.readFileSync(__dirname + '/../js/report.js', 'utf8');
const uiSrc     = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');

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
    [grabConst(reportSrc, 'DEVICE_PART_TYPES'),
     grab(reportSrc, 'isDeviceTerminal'),
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
console.log('【装置(PLC等)の端子は端子台表に出さない】');
{
  const pages = [{ elements: [
    J('TB1',  '端子台 M4', '1'),
    J('TB1',  '端子台 M4', '2'),
    J('PLC1', 'FX3U-32MR', 'X0'),
    J('PLC1', 'FX3U-32MR', 'Y0'),
    J('SV1',  'MR-J5-10G', 'U'),
    J('GOT1', 'GT2103',    'SD'),
    J('PLC1', 'FX3U-16EX', 'X20'),
    J('INV1', 'FRN0.4E3S', 'U'),
  ] }];
  const s = makeSandbox(PARTS, pages);
  const devs = [...s.groupTerminalsByDevice(s.collectTerminals()).keys()];
  eq(devs, ['TB1'], '端子台TB1だけが残り、PLC1/SV1/GOT1/INV1は除外される');
  eq(s.collectTerminals().length, 2, '端子数はTB1の2件のみ');

  ok(s.isDeviceTerminal(J('PLC1','FX3U-32MR','X0')),  'plc は装置端子');
  ok(s.isDeviceTerminal(J('PLC1','FX3U-16EX','X20')), 'plc_unit は装置端子');
  ok(s.isDeviceTerminal(J('SV1','MR-J5-10G','U')),    'servo は装置端子');
  ok(s.isDeviceTerminal(J('GOT1','GT2103','SD')),     'hmi は装置端子');
  ok(s.isDeviceTerminal(J('INV1','FRN0.4E3S','U')),   'inverter は装置端子');
  ok(!s.isDeviceTerminal(J('TB1','端子台 M4','1')),    'terminal は端子台(除外しない)');
  ok(!s.isDeviceTerminal(J('MC1','S-T21','A1')),       'contactor は端子台扱いのまま');
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
console.log('【種別コードが4箇所すべてで揃っている】');
console.log('  種別を1つ足すとPART_TYPE_CODES / PART_TYPE_LABELS / PART_TYPE_ORDER /');
console.log('  index.html(セレクタ・CSVヘルプ)を直す必要がある。過去に漏れの前例あり');
{
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

  const codes = JSON.parse('[' +
    uiSrc.match(/const PART_TYPE_CODES = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  const order = JSON.parse('[' +
    uiSrc.match(/const PART_TYPE_ORDER = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  const labelsBlock = uiSrc.match(/const PART_TYPE_LABELS = \{[\s\S]*?\n\};/)[0];
  const labelKeys = [...labelsBlock.matchAll(/(\w+):\s*'/g)].map(m => m[1]);

  const missing = (list, name) => codes.filter(c => !list.includes(c))
    .forEach(c => { ng++; console.log(`  NG ${name} に ${c} が無い`); });

  missing(labelKeys, 'PART_TYPE_LABELS');
  missing(order,     'PART_TYPE_ORDER');
  ok(codes.every(c => labelKeys.includes(c)), 'PART_TYPE_LABELS が全コードを網羅');
  ok(codes.every(c => order.includes(c)),     'PART_TYPE_ORDER が全コードを網羅');
  eq(order.length, codes.length, 'PART_TYPE_ORDER の件数が PART_TYPE_CODES と一致');

  codes.forEach(c => {
    if (!html.includes(`<option value="${c}">`)) {
      ng++; console.log(`  NG index.html のセレクタに ${c} が無い`);
    }
    if (!html.includes(`${c}(`)) {
      ng++; console.log(`  NG index.html のCSVヘルプ文言に ${c} が無い`);
    }
  });
  ok(true, `index.html のセレクタ・ヘルプ文言を全${codes.length}コードについて確認`);

  // 装置系は必ず正規のコードであること(綴り間違いの検出)
  const devTypes = JSON.parse('[' +
    reportSrc.match(/const DEVICE_PART_TYPES = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  devTypes.forEach(t => ok(codes.includes(t),
    `DEVICE_PART_TYPES の ${t} は正規の種別コード`));
  ok(devTypes.includes('inverter'), 'インバータが装置端子の対象に入っている');
}

// ------------------------------------------------------------------
console.log('【廃止した種別(sw_no/sw_nc)の扱い】');
{
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const codes = JSON.parse('[' +
    uiSrc.match(/const PART_TYPE_CODES = \[([^\]]*)\]/)[1].replace(/'/g, '"') + ']');
  const legacyBlock = uiSrc.match(/const LEGACY_PART_TYPES = \{[^}]*\}/)[0];

  ok(!codes.includes('sw_no'), 'sw_no は部品DBの種別から外れている');
  ok(!codes.includes('sw_nc'), 'sw_nc は部品DBの種別から外れている');
  ok(codes.includes('contact_unit'), 'contact_unit が種別に入っている');
  ok(!html.includes('value="sw_no"'), 'index.htmlのセレクタからsw_noが消えている');
  ok(!html.includes('value="sw_nc"'), 'index.htmlのセレクタからsw_ncが消えている');

  ok(legacyBlock.includes('sw_no') && legacyBlock.includes('sw_nc'),
     'LEGACY_PART_TYPES に旧コードが登録され、取込は通る(既存CSVが再取込できなくならない)');
  ok(uiSrc.includes('LEGACY_PART_TYPES[type]'),
     'CSV取込で旧コードを弾かずに要再分類として扱う');
  ok(uiSrc.includes('要再分類'), '旧コードの部品は「要再分類」と表示される');

  // 自動変換していないこと(IDECのsw_noは実際には押ボタン等なので、機械的に
  // contact_unitへ変換すると誤分類になる)
  ok(!/sw_no'?\s*:\s*'contact_unit/.test(uiSrc) && !/sw_no.*→.*contact_unit/.test(uiSrc),
     'sw_no→contact_unit の自動変換はしていない(誤分類防止)');

  // 図面側のシンボル種別としては残っていること(既存図面の接点が壊れないため)
  const dataSrc = fs.readFileSync(__dirname + '/../js/data.js', 'utf8');
  ok(dataSrc.includes('sw_no:') && dataSrc.includes('sw_nc:'),
     '図面のシンボル種別としてのsw_no/sw_ncは残っている(既存図面の互換)');
  ok(dataSrc.includes("contactType:'a'") || dataSrc.includes('contactType: \'a\''),
     'contactType(接点Refが使う)も残っている');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
