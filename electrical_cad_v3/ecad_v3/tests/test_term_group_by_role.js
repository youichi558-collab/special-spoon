// シンボルの種別から端子グループを選ぶ処理のテスト
//   node tests/test_term_group_by_role.js
//
// 【背景・2026-09-20】盛田さん「このシンボルは主接点、コイル、補助で選べれて
// 図面のシンボルは自動で入ったほうが修正入れるにしても端子番号を調べなくていいから
// 都合がいい」。
//
// 部品DBの端子番号は1台ぶんの全端子(富士SC09XAなら
// A1,A2,L1,L2,L3,T1,T2,T3,13,14 の10個)で、展開接続図では
// コイル・主接点・補助接点の別々のシンボルに分かれて描かれる。
// 従来は「端子点の順に頭から詰める」だけだったので、主接点シンボル(端子6点)に
// A1,A2,L1,L2,L3,T1 が入っていた(コイル端子が主接点に出る)。
//
// 端子点数での判定もあるが、
//   ・数がたまたま一致すると外す
//   ・端子点が未設定のシンボル(数が0)では一切効かない
// ため、種別で選べるならそちらが確実。
//
// このテストが守るもの:
//   1. 種別に対応するグループが1つに決まるときだけ自動で選ぶ
//   2. 決まらないとき(該当0個/2個以上)は null を返し、聞く側へ落とす
//   3. CSVの書き方の揺れ(コイル/操作コイル、主接点/主回路)を吸収する
//   4. 「主接点」と「補助接点」を取り違えない（どちらも「接点」を含む）

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
// 定数はブロックごと取り出す
const constBlock = (name) => {
  const start = src.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`定数 ${name} が見つかりません`);
  const end = src.indexOf('\n};', start);
  return 'var ' + src.slice(start + 6, end + 3);
};

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([
  constBlock('TERM_GROUP_PATTERNS'),
  grab('pickGroupByRole'),
  grab('parseTerminalGroups'),
].join('\n'), sandbox);
const { pickGroupByRole, parseTerminalGroups } = sandbox;

// 富士SC09XAをグループ形式で書いた場合
const FUJI = 'コイル:A1,A2 / 主接点:L1,L2,L3,T1,T2,T3 / 補助:13,14';
const groups = parseTerminalGroups(FUJI);

console.log('【グループ形式が読める】');
{
  ok(groups.length === 3, `3グループに分かれる（実際 ${groups.length}）`);
  ok(groups[0].name === 'コイル' && groups[0].list.join(',') === 'A1,A2', 'コイル:A1,A2');
  ok(groups[1].list.length === 6, '主接点は6端子');
  ok(groups[2].list.join(',') === '13,14', '補助:13,14');
}

console.log('【種別から正しいグループを選ぶ】');
{
  const pick = r => { const g = pickGroupByRole(groups, r); return g ? g.list.join(',') : null; };
  ok(pick('coil') === 'A1,A2', 'コイル → A1,A2');
  ok(pick('contact_main') === 'L1,L2,L3,T1,T2,T3', '主接点 → L1,L2,L3,T1,T2,T3');
  ok(pick('contact_a') === '13,14', '補助接点(a) → 13,14');
  ok(pick('contact_b') === '13,14', '補助接点(b) → 13,14');
}

console.log('【「主接点」と「補助接点」を取り違えない】');
console.log('  ← どちらも「接点」を含むので、素朴な部分一致だと必ず壊れる');
{
  const g2 = parseTerminalGroups('主接点:1,2,3,4,5,6 / 補助接点:13,14');
  const pick = r => { const g = pickGroupByRole(g2, r); return g ? g.list.join(',') : null; };
  ok(pick('contact_main') === '1,2,3,4,5,6', '主接点 → 主接点グループ');
  ok(pick('contact_a') === '13,14', '補助接点 → 補助接点グループ');
}

console.log('【書き方の揺れを吸収する】');
{
  const g3 = parseTerminalGroups('操作コイル:A1,A2 / 主回路:1,2,3,4,5,6 / 補助:13,14');
  const pick = r => { const g = pickGroupByRole(g3, r); return g ? g.list.join(',') : null; };
  ok(pick('coil') === 'A1,A2', '「操作コイル」でもコイルとして拾う');
  ok(pick('contact_main') === '1,2,3,4,5,6', '「主回路」でも主接点として拾う');
}

console.log('【決まらないときは自動で入れない】');
console.log('  ← 推測で入れて外すより、聞く側へ落とす方がよい');
{
  ok(pickGroupByRole(groups, '') === null, '種別が未設定(その他)なら選ばない');
  ok(pickGroupByRole(groups, 'なんだこれ') === null, '知らない種別なら選ばない');
  const none = parseTerminalGroups('入力:1,2 / 出力:3,4');
  ok(pickGroupByRole(none, 'coil') === null, '該当するグループが無ければ選ばない');
  const dup = parseTerminalGroups('補助1:13,14 / 補助2:21,22');
  ok(pickGroupByRole(dup, 'contact_a') === null, '該当が2つあるなら選ばない(どちらか決められない)');
  ok(pickGroupByRole([], 'coil') === null, 'グループが空でも落ちない');
}

console.log('【端子記号にスラッシュが入っていても割らない】');
console.log('  ← 三菱インバータの主回路は R/L1・S/L2・T/L3。素朴に / で割ると「R」と「L1」に砕ける');
{
  const g = parseTerminalGroups('主回路:R/L1,S/L2,T/L3,U,V,W / 制御入力:STF,STR,SD / 出力:A,B,C');
  ok(g.length === 3, `3グループに分かれる（実際 ${g.length}）`);
  ok(g[0].name === '主回路', '1つ目のグループ名が「主回路」');
  ok(g[0].list.join(',') === 'R/L1,S/L2,T/L3,U,V,W',
     `端子記号のスラッシュが保たれる（実際 ${g[0].list.join(',')}）`);
  ok(g[0].list.length === 6, `主回路は6端子（実際 ${g[0].list.length}）`);
  ok(g[1].list.join(',') === 'STF,STR,SD', '制御入力がそのまま');
  ok(g[2].list.join(',') === 'A,B,C', '出力がそのまま');

  // グループ名が無い従来データでも、スラッシュ入り端子は割れない
  const flat = parseTerminalGroups('R/L1,S/L2,T/L3,U,V,W');
  ok(flat.length === 1 && flat[0].list.length === 6,
     `グループ名なしでも6端子のまま（実際 ${flat[0].list.length}）`);
  ok(flat[0].list[0] === 'R/L1', '1つ目が R/L1');

  const tight = parseTerminalGroups('主回路:R/L1,S/L2');
  ok(tight.length === 1 && tight[0].list.join(',') === 'R/L1,S/L2',
     'グループが1つでも端子記号は割れない');

  // スラッシュを含む端子は主回路だけではない
  const opt = parseTerminalGroups('主回路:R/L1,S/L2 / オプション:P/+,PR,N/-,P1');
  ok(opt.length === 2, `2グループ（実際 ${opt.length}）`);
  ok(opt[1].list.join(',') === 'P/+,PR,N/-,P1',
     `P/+ や N/- も割れない（実際 ${opt[1].list.join(',')}）`);
}

console.log('【空白なしの区切りも従来どおり割れる】');
console.log('  ← 既存のPLC用データ(入力:X0,X1,X2,COM/出力:Y0,Y1,COM)を壊さない');
{
  const g = parseTerminalGroups('入力:X0,X1,X2,COM/出力:Y0,Y1,COM');
  ok(g.length === 2, `2グループに分かれる（実際 ${g.length}）`);
  ok(g[0].name === '入力' && g[0].list.join(',') === 'X0,X1,X2,COM', '入力グループ');
  ok(g[1].name === '出力' && g[1].list.join(',') === 'Y0,Y1,COM', '出力グループ');

  // 空白ありでも同じ
  const g2 = parseTerminalGroups('入力:X0,X1 / 出力:Y0,Y1');
  ok(g2.length === 2 && g2[1].list.join(',') === 'Y0,Y1', '空白ありでも同じに割れる');

  // 区切りの / と 端子記号の / が同じ文字列に混ざっていても正しく割れる
  const mix = parseTerminalGroups('主回路:R/L1,S/L2,T/L3/制御:STF,STR,SD');
  ok(mix.length === 2, `混在でも2グループ（実際 ${mix.length}）`);
  ok(mix[0].list.join(',') === 'R/L1,S/L2,T/L3', `主回路が保たれる（実際 ${mix[0].list.join(',')}）`);
  ok(mix[1].list.join(',') === 'STF,STR,SD', '制御が保たれる');
}

console.log('【グループ名が無い従来データでは選ばない】');
console.log('  ← カタログCSVは今のところ全件フラット。従来どおり端子点数の判定へ落とす');
{
  const flat = parseTerminalGroups('A1,A2,L1,L2,L3,T1,T2,T3,13,14');
  ok(flat.length === 1, 'フラットなら1グループ');
  ok(flat[0].name === '', 'グループ名は空');
  ok(pickGroupByRole(flat, 'coil') === null, '名前が無いので種別では選べない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
