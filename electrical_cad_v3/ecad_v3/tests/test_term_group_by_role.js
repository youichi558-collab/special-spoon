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
//
// 【2026-09-20追記・Coworkのカタログ整備を取り込んだ後の実測】
// 実データで数えたら、問題は「パターンに当たらない」ではなく
// 「2つ以上当たって決められない」だった（該当64行）。
//   コイル   34件: 正転コイル と 逆転コイル（可逆電磁接触器）
//   補助接点 34件: 正転補助 と 逆転補助（6件はインタロック補助も）
//   主接点   30件: 主回路 と 主回路オプション（三菱インバータFR-D700）
// このうちインバータ側はこちらの誤判定なので除外パターンで直した。
// 可逆形は「どちらも正しい」ので、当たったものだけ出して人に選んでもらう。
//
//   5. 「主回路オプション」を主接点として拾わない
//   6. 2つ以上当たったときは matchGroupsByRole が両方返す（選択肢として出すため）

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
  constBlock('TERM_GROUP_EXCLUDE'),
  grab('matchGroupsByRole'),
  grab('pickGroupByRole'),
  grab('parseTerminalGroups'),
].join('\n'), sandbox);
const { matchGroupsByRole, pickGroupByRole, parseTerminalGroups } = sandbox;

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

console.log('【インバータの「主回路オプション」を主接点として拾わない】');
console.log('  ← P/+,PR,N/- は回生抵抗器やDCリアクトルの端子で、主接点ではない');
{
  // 三菱インバータFR-D700の実データ（catalog_pending/mitsubishi_inverter_batch1.csv）
  const inv = parseTerminalGroups(
    '主回路:R/L1,S/L2,T/L3,U,V,W / 制御入力:STF,STR,RH,RM,RL,SD,PC'
    + ' / 周波数設定:10,2,4,5 / 出力:A,B,C,RUN,SE,FM'
    + ' / セーフティ:S1,S2,SC,SO / 主回路オプション:P/+,PR,N/-,P1');
  ok(inv.length === 6, `6グループに分かれる（実際 ${inv.length}）`);
  const hit = matchGroupsByRole(inv, 'contact_main');
  ok(hit.length === 1, `主接点に当たるのは1つだけ（実際 ${hit.length}: ${hit.map(g => g.name).join('/')}）`);
  ok(hit.length === 1 && hit[0].name === '主回路', '当たるのは「主回路」の方');
  const g = pickGroupByRole(inv, 'contact_main');
  ok(g && g.list.join(',') === 'R/L1,S/L2,T/L3,U,V,W', '主接点 → R/L1,S/L2,T/L3,U,V,W');
  ok(matchGroupsByRole(inv, 'coil').length === 0, 'インバータにコイルグループは無い');
}

console.log('【2つ以上当たるときは、当たったものを全部返す】');
console.log('  ← 可逆電磁接触器は正転・逆転でコイルが2つある。どちらも正しいので人が選ぶ');
{
  // 三菱可逆電磁接触器 S-2×T10 相当（catalog_pending/mitsubishi_mc_batch2.csv）
  const rev = parseTerminalGroups(
    '正転コイル:A1,A2 / 逆転コイル:A1,A2 / 主接点:1,3,5,2,4,6'
    + ' / 正転補助:13,14 / 逆転補助:13,14 / インタロック補助:21,22');
  const coils = matchGroupsByRole(rev, 'coil');
  ok(coils.length === 2, `コイルは2つ当たる（実際 ${coils.length}）`);
  ok(coils.map(g => g.name).join('/') === '正転コイル/逆転コイル', '正転コイルと逆転コイルの両方');
  ok(pickGroupByRole(rev, 'coil') === null, '1つに決まらないので自動では入れない');

  const aux = matchGroupsByRole(rev, 'contact_a');
  ok(aux.length === 3, `補助は3つ当たる（実際 ${aux.length}）`);
  ok(aux.map(g => g.name).join('/') === '正転補助/逆転補助/インタロック補助', '3つとも返る');

  // 主接点は1つしかないので、可逆形でも自動で決まる
  const main = pickGroupByRole(rev, 'contact_main');
  ok(main && main.list.join(',') === '1,3,5,2,4,6', '主接点は1つなので自動で決まる');
}

console.log('【除外パターンで全部消えても落ちない】');
{
  const only = parseTerminalGroups('主回路オプション:P/+,PR');
  ok(matchGroupsByRole(only, 'contact_main').length === 0, '除外だけが残るなら該当0');
  ok(pickGroupByRole(only, 'contact_main') === null, 'nullを返す');
  ok(matchGroupsByRole([], 'contact_main').length === 0, 'グループが空でも落ちない');
  ok(matchGroupsByRole(null, 'coil').length === 0, 'null を渡しても落ちない');
  ok(matchGroupsByRole(parseTerminalGroups('コイル:A1,A2'), 'なんだこれ').length === 0,
     '知らない種別なら空');
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
console.log('  ← 2026-09-20のCowork整備後も、グループ名が付いたのは205行で残り95行は素の羅列。');
console.log('    フラットなデータは今後も混ざるので、従来どおり端子点数の判定へ落とす');
{
  const flat = parseTerminalGroups('A1,A2,L1,L2,L3,T1,T2,T3,13,14');
  ok(flat.length === 1, 'フラットなら1グループ');
  ok(flat[0].name === '', 'グループ名は空');
  ok(pickGroupByRole(flat, 'coil') === null, '名前が無いので種別では選べない');
}


// ================================================================
// 【2026-09-21】種別の追加(盛田さん「種別を増やしてくれ、仮設定を追加、
// 自動選択にのせるように」)。
//
// 登録シンボル31個中17個が種別未設定だったのは、**サーマル・限時接点・
// 接点1〜4に当たる選択肢が無かった**ため。部品DBの実データを数えて、
// 拾えていなかった上位から4つ足した:
//   サーマル接点 38 / 限時接点・限時接点1〜4 44 / 接点1〜4 38 / 制御入力 33
//
// `tentative`(仮設定)は**自動選択に乗せない**。後で決めるための目印。
// ================================================================
{
  console.log('\n【2026-09-21 追加した種別】');
  // このファイルの grab は (name) だけ取り、定数は constBlock。src はモジュール先頭で
  // 読み込み済み(js/ui.js)。他のテストと書き方が違うので混ぜないこと。
  const sandbox2 = { console };
  require('vm').createContext(sandbox2);
  require('vm').runInContext(
    [constBlock('TERM_GROUP_PATTERNS'), constBlock('TERM_GROUP_EXCLUDE'),
     grab('matchGroupsByRole'), grab('pickGroupByRole')].join('\n'),
    sandbox2);

  // このファイルには ok しか無いので、この節用に eq を用意する
  const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b),
                             `${m}（期待 ${JSON.stringify(b)} / 実際 ${JSON.stringify(a)}）`);
  const G = n => ({ name: n, list: ['1', '2'] });
  const pick = (names, role) => {
    const hit = sandbox2.matchGroupsByRole(names.map(G), role);
    return hit.map(g => g.name);
  };

  // 実データに出るグループ名をそのまま使う
  const ALL = ['主接点', 'コイル', '補助', 'サーマル接点', '限時接点1', '限時接点2',
               '接点1', '接点2', '制御入力', '主回路オプション'];

  eq(pick(ALL, 'contact_thermal'), ['サーマル接点'], 'サーマル接点が1つに決まる');
  eq(pick(ALL, 'contact_timer'), ['限時接点1', '限時接点2'], '限時接点は当たったものだけ出る');
  eq(pick(ALL, 'ctrl_in'), ['制御入力'], '制御入力が1つに決まる');

  // ★ここが肝。「接点1」だけを拾い、「主接点」「サーマル接点」「限時接点1」を
  // 巻き込まないこと。単に /接点/ で書くと全部当たって使い物にならない。
  eq(pick(ALL, 'contact_num'), ['接点1', '接点2'],
     '★接点(番号付き)は主接点・サーマル接点・限時接点を巻き込まない');

  // 仮設定は自動選択に乗らない(端子点数の判定へ落ちる)
  eq(pick(ALL, 'tentative'), [], '★仮設定は自動選択に乗らない');
  eq(pick(ALL, ''), [], 'その他も従来どおり乗らない');

  // 接点Ref側: 追加した接点は数え、仮設定と制御入力は数えない
  const rep = require('fs').readFileSync(__dirname + '/../js/report.js', 'utf8');
  const roles = JSON.parse('[' +
    rep.match(/const REF_CONTACT_ROLES = \[([\s\S]*?)\]/)[1].replace(/'/g, '"').replace(/\s+/g, ' ') + ']');
  ['contact_main', 'contact_a', 'contact_b',
   'contact_thermal', 'contact_timer', 'contact_num'].forEach(r =>
    ok(roles.includes(r), `接点数に ${r} を数える`));
  ok(!roles.includes('tentative'), '★仮設定は接点数に数えない(決めていないものを数に入れない)');
  ok(!roles.includes('ctrl_in'), '制御入力は接点ではないので数えない');

  // 画面の選択肢と実装が揃っていること(片方だけ足すと選べない/効かない)
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  ['tentative', 'contact_thermal', 'contact_timer', 'contact_num', 'ctrl_in'].forEach(v => {
    const n = (html.match(new RegExp(`value="${v}"`, 'g')) || []).length;
    ok(n === 2, `★${v} が種別の選択肢2箇所(登録・端子編集)に揃っている (実際 ${n})`);
  });
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
