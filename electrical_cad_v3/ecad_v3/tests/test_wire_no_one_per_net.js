// ================================================================
// 線番は「1ネットに1か所」(2026-09-25 盛田さんの決定A)
//
// 盛田さん「(線番割付を)押したら壊れる」。線番割付がネット内の空の線すべてに同じ番号を
// 写し、線番の文字は線ごとに描かれるので、図面に L1 が9か所…と並んだ。
//   ・線番割付: 番号のあるネットには触らない／無いネットは一番長い線1本にだけ入れる
//   ・線番表の編集・▲▼入れ替え: 今文字が出ている線だけを書き換える
//   ・接続チェック・端子台表・配線番号CSV: 配線自身でなくネットの番号を出す
// report.js / conn_table.js を丸ごと実行して確かめる。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};

const domEls = {};
['report-tabs', 'report-title', 'report-body', 'report-csv-btn'].forEach(id => { domEls[id] = { innerHTML: '', textContent: '', style: {} }; });
let lastCsv = null;
const sb = {
  document: { getElementById: id => domEls[id] || null },
  console, window: {},
  escH: require('./_esch.js').escH,
  prompt: (m, d) => d, confirm: () => true, alert: () => {},
  openFP: () => {}, closeFP: () => {}, draw: () => {}, pushH: () => {},
  dl: c => { lastCsv = c; }, _csvName: p => p + '.csv',
  getDef: () => ({ w: 20 }),
  incRef: s => s.replace(/(\d+)$/, m => String(+m + 1).padStart(m.length, '0')),
};
vm.createContext(sb);
// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const R = f => fs.readFileSync(__dirname + '/../js/' + f, 'utf8').replace(/\r\n/g, '\n');
vm.runInContext(R('report.js'), sb);
vm.runInContext(R('conn_table.js'), sb);

function setup() {
  sb.state = {
    wireNoRule: 'W001', customSymbols: [],
    pages: [{
      name: 'P1',
      elements: [
        { id: 'j', type: 'junction', x: 50, y: 0, style: 'dot' },
        { id: 't', type: 'junction', x: 0, y: 100, r: 3, style: 'circle', partRef: 'TB1', label: '1' },
      ],
      wires: [
        // ネット1: 幹線(番号あり) + ●で分岐した枝(番号なし)
        { id: 'a', x1: 0, y1: 0, x2: 100, y2: 0, wireNo: 'W010' },
        { id: 'b', x1: 50, y1: 0, x2: 50, y2: 40, wireNo: '' },
        // ネット2: 端子TB1-1の上下(どちらも番号なし)。下が長い
        { id: 'c', x1: 0, y1: 80, x2: 0, y2: 97, wireNo: '' },
        { id: 'd', x1: 0, y1: 103, x2: 0, y2: 160, wireNo: '' },
      ],
    }],
  };
  return sb.state.pages[0].wires;
}
const nos = w => w.map(x => x.wireNo);

console.log('【線番割付】');
{
  const w = setup();
  sb.autoWireNumber();
  eq(nos(w), ['W010', '', '', 'W001'], '番号のあるネットには書き込まず、無いネットは一番長い線1本だけ');
}

console.log('\n【線番表の編集・入れ替え】');
{
  const w = setup();
  sb.applyNetWireNo(0, [0, 1], 'W020');
  eq(nos(w), ['W020', '', '', ''], '編集は今文字が出ている線だけを書き換える');
  sb.applyNetWireNo(0, [2, 3], 'W030');
  eq(nos(w), ['W020', '', '', 'W030'], '番号が無いネットは一番長い線1本に入れる');
  sb.swapNetWireNo(0, [0, 1], 'W020', 0, [2, 3], 'W030');
  eq(nos(w), ['W030', '', '', 'W020'], '入れ替えても文字の位置(線)は変わらない');
}

console.log('\n【読む側はネットの番号を出す】');
{
  const w = setup();
  eq(sb.netWireNoOf(sb.state.pages[0]), ['W010', 'W010', '', ''], 'netWireNoOf: 枝も幹線の番号');
  const rows = sb.buildConnectionRows();
  eq(rows.map(r => r.wireNo), ['W010', 'W010', '', ''], '接続チェックの線番もネットの番号');
  sb.applyNetWireNo(0, [2, 3], 'W030');
  eq(sb._tbConnsOf(sb.state.pages[0].elements[1], sb.state.pages[0]), ['W030'],
     '端子台表: 端子の上下とも同じ線番(片側が未採番と出ない)');
  sb.exportWireCSV();
  eq(lastCsv.split('\n').slice(1).map(l => l.split(',')[0]), ['W010', 'W010', 'W030', 'W030'],
     '配線番号CSVもネットの番号');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
