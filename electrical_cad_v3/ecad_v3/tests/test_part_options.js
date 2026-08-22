// 構成子（型式ビルダー）方式のテスト
//   node tests/test_part_options.js
//
// 富士電機のブレーカ BW32AAG-3P を実例にする。カタログ(オートブレーカ・
// 漏電遮断器総合カタログ 2-18ページ「形式説明」)では
//     BW 32 AFC - 2P 030 B W K F□ R□ A T
// のように基本型式の末尾に付属装置の記号を並べる方式で、
//   W=補助スイッチ1個 / V=同2個 / K=警報スイッチ1個 / F□=電圧引外し
// 端子番号は 6-20ページ「スイッチの動作と定格」より
//   補助スイッチ 左側 11/12/14・右側 21/22/24、警報スイッチ 左側 91/92/94

const assert = require('assert');
const M = require('../js/part_options.js');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};

// カタログから起こした構成子つき部品（1系列を手作りして形を検証する）
const fujiBreaker = {
  maker: '富士電機', ref: 'BW32AAG-3P', type: 'breaker',
  volt: 'AC(絶縁電圧690V)',
  terminals: '主回路:1,2,3,4,5,6',
  options: [
    { name: '定格電流', required: true, items: [
      { code: '005', label: '5A',  amp: '5A' },
      { code: '010', label: '10A', amp: '10A' },
      { code: '015', label: '15A', amp: '15A' },
      { code: '020', label: '20A', amp: '20A' },
      { code: '030', label: '30A', amp: '30A' },
    ]},
    { name: '補助スイッチ', items: [
      { code: '',  label: 'なし' },
      { code: 'W', label: '1個', terminals: '補助:11,12,14' },
      { code: 'V', label: '2個', terminals: '補助1:11,12,14 / 補助2:21,22,24' },
    ]},
    { name: '警報スイッチ', items: [
      { code: '',  label: 'なし' },
      { code: 'K', label: '1個', terminals: '警報:91,92,94' },
    ]},
  ],
};

// 構成子を持たない従来の部品（後方互換の確認用）
const flatPart = {
  maker: '三菱電機', ref: 'S-T21', type: 'contactor',
  amp: '18A', contacts: '2a2b', terminals: 'コイル:A1,A2 / 主回路:1,3,5,2,4,6',
};

console.log('【hasPartOptions / defaultPartOpts】');
eq(M.hasPartOptions(fujiBreaker), true, '構成子を持つ部品を判別できる');
eq(M.hasPartOptions(flatPart), false, '従来の部品は構成子なしと判別される');
eq(M.hasPartOptions(null), false, 'nullでも落ちない');
eq(M.defaultPartOpts(fujiBreaker),
   { '定格電流': '005', '補助スイッチ': '', '警報スイッチ': '' },
   '既定は各軸の先頭(付属装置は「なし」)');
eq(M.defaultPartOpts(flatPart), {}, '構成子なしなら空');

console.log('\n【buildPartModel: 完成型式の組み立て】');
eq(M.buildPartModel(fujiBreaker, { '定格電流': '005' }),
   'BW32AAG-3P005', '付属装置なし → BW32AAG-3P005');
eq(M.buildPartModel(fujiBreaker, { '定格電流': '005', '補助スイッチ': 'W' }),
   'BW32AAG-3P005W', '補助スイッチ1個 → 末尾にW');
eq(M.buildPartModel(fujiBreaker, { '定格電流': '030', '補助スイッチ': 'W', '警報スイッチ': 'K' }),
   'BW32AAG-3P030WK', '補助+警報 → WKの順に連結(options定義順)');
eq(M.buildPartModel(fujiBreaker, { '定格電流': '020', '警報スイッチ': 'K' }),
   'BW32AAG-3P020K', '間の軸が「なし」なら何も連結しない');
eq(M.buildPartModel(fujiBreaker, { '定格電流': '010', '補助スイッチ': 'V' }),
   'BW32AAG-3P010V', '補助2個はV');
eq(M.buildPartModel(fujiBreaker, {}),
   'BW32AAG-3P', '未選択なら基本型式のまま(定格電流は必須なので実運用では選ばせる)');
eq(M.buildPartModel(flatPart, {}), 'S-T21', '構成子なしの部品は型番そのまま');

console.log('\n【resolvePartSpec: 選択に応じた仕様と端子】');
const s1 = M.resolvePartSpec(fujiBreaker, { '定格電流': '005' });
eq(s1.amp, '5A', '定格電流コードから電流が決まる');
eq(s1.terminals, '主回路:1,2,3,4,5,6', '付属装置なしなら主回路のみ');

const s2 = M.resolvePartSpec(fujiBreaker, { '定格電流': '030', '補助スイッチ': 'W', '警報スイッチ': 'K' });
eq(s2.amp, '30A', '別のコードなら別の電流');
eq(s2.terminals, '主回路:1,2,3,4,5,6 / 補助:11,12,14 / 警報:91,92,94',
   '選んだ付属装置の端子グループが積み上がる');

const s3 = M.resolvePartSpec(fujiBreaker, { '定格電流': '010', '補助スイッチ': 'V' });
eq(s3.terminals, '主回路:1,2,3,4,5,6 / 補助1:11,12,14 / 補助2:21,22,24',
   '補助2個なら左右2グループになる');

eq(M.resolvePartSpec(flatPart, {}).terminals, 'コイル:A1,A2 / 主回路:1,3,5,2,4,6',
   '構成子なしの部品は端子欄がそのまま返る');

console.log('\n【端子グループ形式との接続】');
// resolvePartSpec が返す terminals は、既に実装済みの parseTerminalGroups が
// そのまま読める形式であること（割り当て時にグループ選択が効く）
const src = require('fs').readFileSync(__dirname + '/../js/ui.js', 'utf8');
const m = src.match(/function parseTerminalGroups\([\s\S]*?\n\}/);
eq(!!m, true, 'ui.jsからparseTerminalGroupsを取り出せる');
const parseTerminalGroups = eval(`(${m[0]})`);
const gs = parseTerminalGroups(s2.terminals);
eq(gs.map(g => g.name), ['主回路', '補助', '警報'], '3グループとして解析できる');
eq(gs.map(g => g.list.length), [6, 3, 3], '各グループの端子点数も正しい');

console.log('\n【elPartModel: 図面要素からの型式取得(後方互換)】');
const parts = [fujiBreaker, flatPart];
eq(M.elPartModel({ partModel: 'S-T21' }, parts), 'S-T21',
   '既存図面(構成子なし・partOptsなし)は値が変わらない');
eq(M.elPartModel({ partModel: 'BW32AAG-3P', partOpts: { '定格電流': '005', '補助スイッチ': 'W' } }, parts),
   'BW32AAG-3P005W', '構成子つきは選択を反映した完成型式になる');
eq(M.elPartModel({ partModel: 'BW32AAG-3P' }, parts), 'BW32AAG-3P005',
   'partOptsが無ければ既定選択で組み立てる');
eq(M.elPartModel({}, parts), '', '型番が無ければ空');
eq(M.elPartModel({ partModel: '未登録品' }, parts), '未登録品',
   '部品DBに無い型番はそのまま返す(壊さない)');

console.log(ng === 0 ? '\n全て成功' : `\n${ng}件失敗`);
process.exit(ng === 0 ? 0 : 1);
