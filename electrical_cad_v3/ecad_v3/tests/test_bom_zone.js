// 手配区分(盤内/盤外)の部品表(BOM)集計テスト
//   node tests/test_bom_zone.js
//
// 【背景】盛田さんの「盤内外の区別」は設置場所の一般的な括りではなく単純な
// 盤内/盤外の2値でよく、単位はデバイス(部品全般)。目的は「部品手配の範囲が
// わかる」こと。プロパティに「手配区分」を追加し、BOMで盤内/盤外を分けて
// 集計するようにした。
//
// el.panelZone: 未設定(undefined/'')=盤内(既定)、'外'=盤外。
// 型番が同じでも手配区分が違えば別部品として行を分ける(コイル電圧と同じ扱い)。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const domEls = {};
const stub = () => ({ innerHTML:'', textContent:'', style:{}, onclick:null, classList:{ add(){}, remove(){} } });
['report-tabs','report-title','report-body','report-csv-btn'].forEach(id => { domEls[id] = stub(); });

let lastCsv = null;
const sandbox = {
  document: { getElementById: id => domEls[id] || null },
  console,
  window: {},
  openFP: () => {}, closeFP: () => {},
  draw: () => {}, pushH: () => {},
  dl: (content, name) => { lastCsv = { content, name }; },
  getDef: () => ({}),
  partVoltOptions: () => [],
  updateRightPanel: () => {},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/report.js', 'utf8'), sandbox);

sandbox.state = {
  pages: [{
    name: 'P1',
    elements: [
      // 盤内(既定=panelZone未設定)のコンタクタ2台、同型番
      { id:1, type:'coil', partRef:'MC1', partModel:'S-T10', partVolt:'AC200V' },
      { id:2, type:'coil', partRef:'MC2', partModel:'S-T10', partVolt:'AC200V' },
      // 盤外の押しボタン(現地操作箱)1台
      { id:3, type:'sw_no', partRef:'PB1', partModel:'HW1B-M1P10B', panelZone:'外' },
      // 手配区分が食い違うデバイス(同じPB2で盤内要素と盤外要素が混在=設定ミス)
      { id:4, type:'sw_no', partRef:'PB2', partModel:'HW1B-M1P10B', panelZone:'外' },
      { id:5, type:'lamp',  partRef:'PB2', partModel:'HW1B-M1P10B' },  // panelZoneが空=盤内
    ],
    groups: [],
  }],
};
sandbox.state.elements = sandbox.state.pages[0].elements;

// ------------------------------------------------------------------
console.log('【collectBOMRows: 手配区分ごとに行が分かれる】');
const rows = sandbox.collectBOMRows();
const s_t10Rows = rows.filter(r => r.model === 'S-T10');
eq(s_t10Rows.length, 1, '盤内のMC1/MC2は同じ行にまとまる(zone未設定=盤内で一致)');
eq(s_t10Rows[0].count, 2, 'その行の台数は2');
eq(s_t10Rows[0].zone, '', '盤内の行はzoneが空文字');

const hw1bRows = rows.filter(r => r.model === 'HW1B-M1P10B');
// PB1(盤外のみ)とPB2(盤外要素+盤内要素が混在)は、どちらも代表zoneが'外'に
// なる(Setは追加順を保持し、PB2は外→空の順で追加されるため代表は'外')。
// そのため型番+zoneのキーが一致し同じ行にまとまる。これはコイル電圧の
// 食い違いと同じ既存の挙動(代表値でキー化し、食い違いは警告で示す)を踏襲する。
eq(hw1bRows.length, 1, 'PB1とPB2は代表zoneが一致するため同じ行にまとまる');
const hw1bRow = hw1bRows[0];
eq(hw1bRow.count, 2, '合算した台数は2');
eq(hw1bRow.zone, '外', '代表zoneは外');
ok(hw1bRow.warn.includes('手配区分が複数'), 'PB2側の手配区分の食い違いが警告として出る');
ok(hw1bRow.warn.includes('PB2'), '警告にどのデバイス(PB2)の話かが分かる');

// ------------------------------------------------------------------
console.log('【showBOM: 盤内/盤外でセクション分けして表示】');
sandbox.showBOM();
const body = domEls['report-body'].innerHTML;
ok(body.includes('盤内'), '盤内セクションの見出しがある');
ok(body.includes('盤外'), '盤外セクションの見出しがある');
ok(body.indexOf('盤内') < body.indexOf('盤外'), '盤内セクションが盤外より先に出る');

// ------------------------------------------------------------------
console.log('【CSV出力: 手配区分列がある】');
domEls['report-csv-btn'].onclick();
const header = lastCsv.content.split('\n')[0];
ok(header.includes('手配区分'), 'CSVヘッダーに手配区分列がある');
ok(lastCsv.content.includes('盤外'), 'CSV本文に「盤外」が出力される');
ok(lastCsv.content.includes('盤内'), 'CSV本文に「盤内」が出力される(zone未設定の行)');

// ------------------------------------------------------------------
console.log('【デバイス未設定行は手配区分の対象外】');
sandbox.state.pages[0].elements.push({ id:6, type:'coil', partModel:'謎の部品' }); // partRefなし
const rows2 = sandbox.collectBOMRows();
const noRefRow = rows2.find(r => r.noRef);
ok(noRefRow, 'デバイス未設定の行が存在する');
ok(noRefRow.zone === undefined, 'デバイス未設定の行にzoneフィールドは無い');

// ------------------------------------------------------------------
// 表示区分の絞り込み(2026-08-23)
// 盛田さん「部品表を作った場合対象外は書かない選択肢が取れるかだな」への対応。
// 盤外品を別途手配する場合など、盤内だけの部品表を出したい場面がある。
// 【重要】画面とCSVの両方に効かなければならない。片方だけだと、画面で絞ったのに
// CSVには全部入っている(またはその逆)という状態になり、出力を信用できなくなる。
console.log('【表示区分の絞り込み: 盤外を外す】');
{
  sandbox.setBOMZone('out', false);
  const body = domEls['report-body'].innerHTML;
  // 絞り込みのチェックボックスにも「盤内」「盤外」の文字が入るので、
  // セクション見出し(margin:10px 0 3px)に限定して判定する
  const hasSection = (b, name) => b.includes(`margin:10px 0 3px">${name}`);
  ok(hasSection(body, '盤内'),  '盤内セクションは残る');
  ok(!hasSection(body, '盤外'), '盤外セクションが出なくなる');
  ok(body.includes('非表示中'), '非表示にした台数が画面に出る(黙って減らさない)');

  domEls['report-csv-btn'].onclick();
  ok(!lastCsv.content.includes('盤外'), 'CSVからも盤外が消える');
  ok(lastCsv.content.includes('盤内'),  'CSVに盤内は残る');
}

console.log('【表示区分の絞り込み: 盤内を外す】');
{
  sandbox.setBOMZone('out', true);
  sandbox.setBOMZone('in', false);
  const body = domEls['report-body'].innerHTML;
  const hasSection = (b, name) => b.includes(`margin:10px 0 3px">${name}`);
  ok(!hasSection(body, '盤内'), '盤内セクションが出なくなる');
  ok(hasSection(body, '盤外'),  '盤外セクションは残る');

  domEls['report-csv-btn'].onclick();
  ok(lastCsv.content.includes('盤外'),  'CSVに盤外は残る');
  const lines = lastCsv.content.split('\n').slice(1).filter(l => l.trim());
  ok(lines.every(l => !l.includes(',盤内,')), 'CSV本文に盤内の行が1件も無い');
}

console.log('【表示区分の絞り込み: デバイス未設定を外す】');
{
  sandbox.setBOMZone('in', true);
  sandbox.setBOMZone('noRef', false);
  const body = domEls['report-body'].innerHTML;
  ok(!body.includes('margin:10px 0 3px">デバイス未設定'),
     'デバイス未設定セクションが出なくなる');

  domEls['report-csv-btn'].onclick();
  ok(!lastCsv.content.includes('謎の部品'), 'CSVからもデバイス未設定の行が消える');
}

console.log('【既定は全部表示】');
{
  sandbox.setBOMZone('noRef', true);
  const body = domEls['report-body'].innerHTML;
  const hasSection = (b, name) => b.includes(`margin:10px 0 3px">${name}`);
  ok(hasSection(body, '盤内') && hasSection(body, '盤外'), '既定では盤内・盤外とも出る');
  ok(!body.includes('非表示中'), '全部表示のときは非表示の注記が出ない');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
