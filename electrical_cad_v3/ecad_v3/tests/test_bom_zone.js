// 手配区分(盤内/盤外)の部品表(BOM)集計テスト
//   node tests/test_bom_zone.js
//
// 【背景・2026-08-23に仕様変更】
// もとは「手配区分(盤内/盤外)」という2択で、BOMも盤内・盤外のセクションに
// 分けていた。しかしこの区分自体が盛田さんの指示ではなくClaudeが勝手に立てた
// 要件だったことが一次情報で判明し、盛田さんの指摘で整理し直した:
//   「盤内、盤外と選ぶ必要があるか？盤外だけわかればいいのでは？
//     盤外という文字もいまいちだ対象外とかにならんか？」
// → 「部品表の対象外」チェック1つに変更。既定は対象外を集計しない。
//
// el.panelZone の内部表現は変えていない(未設定=通常、'外'=対象外)ので、
// 既存データはそのまま読める。

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
  escH: require('./_esch.js').escH,   // 実体は js/state.js のもの
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
ok(hw1bRow.warn.includes('対象外の設定が食い違'), 'PB2側の設定の食い違いが警告として出る');
ok(hw1bRow.warn.includes('PB2'), '警告にどのデバイス(PB2)の話かが分かる');

// ------------------------------------------------------------------
console.log('【showBOM: 盤内/盤外でセクション分けして表示】');
sandbox.showBOM();
const body = domEls['report-body'].innerHTML;
const _sec = (b, name) => b.includes(`margin:10px 0 3px">${name}`);
ok(_sec(body, '部品表'), '部品表セクションの見出しがある');
ok(!_sec(body, '部品表の対象外'), '既定では対象外セクションは出ない(集計しないため)');
ok(body.includes('非表示中'), '対象外を隠している旨が出る');

// ------------------------------------------------------------------
console.log('【CSV出力: 対象外列がある】');
domEls['report-csv-btn'].onclick();
const header = lastCsv.content.split('\n')[0];
ok(header.includes('対象外'), 'CSVヘッダーに対象外列がある');
ok(!lastCsv.content.includes('HW1B-M1P10B'), '既定では対象外の部品はCSVに出ない');
ok(lastCsv.content.includes('S-T10'), '通常の部品はCSVに出る');

// ------------------------------------------------------------------
console.log('【デバイス未設定行は区分の対象外】');
sandbox.state.pages[0].elements.push({ id:6, type:'coil', partModel:'謎の部品' }); // partRefなし
const rows2 = sandbox.collectBOMRows();
const noRefRow = rows2.find(r => r.noRef);
ok(noRefRow, 'デバイス未設定の行が存在する');
ok(noRefRow.zone === undefined, 'デバイス未設定の行にzoneフィールドは無い');

// ------------------------------------------------------------------
// 「部品表の対象外」の絞り込み(2026-08-23)
// 盛田さん「部品表を作った場合対象外は書かない選択肢が取れるかだな」への対応。
// 現地調達品など、この図面で手配しないものを部品表から外せるようにした。
// 【重要】画面とCSVの両方に効かなければならない。片方だけだと、画面で絞ったのに
// CSVには全部入っている(またはその逆)という状態になり、出力を信用できなくなる。
const _sec2 = (b, name) => b.includes(`margin:10px 0 3px">${name}`);

console.log('【既定: 対象外は集計しない】');
{
  const body = domEls['report-body'].innerHTML;
  ok(_sec2(body, '部品表'), '通常の部品は出る');
  ok(!_sec2(body, '部品表の対象外'), '対象外セクションは出ない');
  ok(body.includes('非表示中'), '隠している台数が画面に出る(黙って減らさない)');

  domEls['report-csv-btn'].onclick();
  ok(!lastCsv.content.includes('HW1B-M1P10B'), 'CSVにも対象外は出ない');
  ok(lastCsv.content.includes('S-T10'), 'CSVに通常の部品は出る');
}

console.log('【対象外も含める: 別セクションで区別できる】');
{
  sandbox.setBOMZone('excluded', true);
  const body = domEls['report-body'].innerHTML;
  ok(_sec2(body, '部品表'), '通常の部品セクションがある');
  ok(_sec2(body, '部品表の対象外'), '対象外セクションが出る');
  ok(body.indexOf('margin:10px 0 3px">部品表<') < body.indexOf('margin:10px 0 3px">部品表の対象外'),
     '通常の部品が先、対象外が後');

  domEls['report-csv-btn'].onclick();
  ok(lastCsv.content.includes('HW1B-M1P10B'), 'CSVにも対象外が出る');
  ok(lastCsv.content.includes('対象外'), 'CSVで対象外と分かる印が付く');
}

console.log('【デバイス未設定の絞り込み】');
{
  sandbox.setBOMZone('noRef', false);
  const body = domEls['report-body'].innerHTML;
  ok(!_sec2(body, 'デバイス未設定'), 'デバイス未設定セクションが出なくなる');

  domEls['report-csv-btn'].onclick();
  ok(!lastCsv.content.includes('謎の部品'), 'CSVからもデバイス未設定の行が消える');
}

console.log('【内部表現は変えていない(既存データの互換)】');
{
  sandbox.setBOMZone('noRef', true);
  const rows3 = sandbox.collectBOMRows();
  const ex = rows3.find(r => r.model === 'HW1B-M1P10B');
  eq(ex.zone, '外', "対象外は従来どおり panelZone:'外' で表現される");
  const normal = rows3.find(r => r.model === 'S-T10');
  eq(normal.zone, '', '通常の部品は空文字のまま');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
