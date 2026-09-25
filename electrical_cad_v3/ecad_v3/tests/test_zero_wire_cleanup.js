// ================================================================
// 読み込み時に長さ0の配線を取り除く(removeZeroLengthWires)
//
// 【2026-09-25】盛田さん「長さ０は目視できん」。Sheet3に4本あり、線番表で
// 未採番の行になったり●に乗ってネットに紛れ込んだりしていた。見えないので
// 手で探して消せないため、読み込み時に自動で消す(盛田さん了承)。
// 呼び出し元(読込・バックアップ復元=applyProjectData／リロード=restoreAutosave)の
// 配線も合わせて確認する。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const R = f => fs.readFileSync(__dirname + '/../js/' + f, 'utf8').replace(/\r\n/g, '\n');
const edit = R('edit.js');
const s = edit.indexOf('function removeZeroLengthWires(');
const e = edit.indexOf('\n}\n', s);
if (s < 0 || e < 0) throw new Error('removeZeroLengthWires が見つかりません');
const sb = {};
vm.createContext(sb);
vm.runInContext(edit.slice(s, e + 3), sb);

console.log('【長さ0の配線だけ消す】');
const pages = [
  { wires: [
    { id: 'z1', x1: 575, y1: 270, x2: 575, y2: 270 },                               // 長さ0
    { id: 'ok', x1: 0, y1: 0, x2: 7, y2: 0 },                                       // 短いが本物
    { id: 'z2', pts: [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }], x1: 5, y1: 5, x2: 5, y2: 5 },
    { id: 'loop', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }], x1: 0, y1: 0, x2: 0, y2: 0 }, // 行って戻る
  ] },
  { wires: [{ id: 'z3', x1: 1, y1: 1, x2: 1.05, y2: 1 }] },                           // 0.1未満
  { elements: [] },                                                                    // wires無し
];
const n = sb.removeZeroLengthWires(pages);
ok(n === 3, `消した本数を返す(3本、実際 ${n})`);
ok(pages[0].wires.map(w => w.id).join() === 'ok,loop', '本物の配線は残る(始点=終点でも途中があれば残す)');
ok(pages[1].wires.length === 0, '別ページの分も消す');

console.log('\n【読み込みの3経路すべてで呼ぶ】');
ok(/removeZeroLengthWires\(state\.pages\)/.test(edit.slice(edit.indexOf('function applyProjectData('))),
   '読込・バックアップ復元(applyProjectData)で呼ぶ');
ok(/removeZeroLengthWires\(state\.pages\)/.test(R('autosave.js')), 'リロード(restoreAutosave)で呼ぶ');
ok(/zeroWires/.test(R('backup.js')), 'バックアップ復元で本数を知らせる');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
