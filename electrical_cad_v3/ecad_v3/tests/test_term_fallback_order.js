// 端子点が未定義のシンボルのフォールバックが、4箇所とも同じ順番であることのテスト
//   node tests/test_term_fallback_order.js
//
// 【背景・2026-09-20】盛田さん「端子番号、既に書いてあるシンボルも対応してるか？」。
// 調べると、端子点(cS.terminals)が定義されていないシンボル —— ライブラリ(Newcom DXF)
// 取り込みの14本と、標準シンボル全部 —— は「本体の左右端2点」にフォールバックする。
// その並びが [+hw, -hw](右が1番目)だったため、端子番号欄に「A1,A2」と入れると
// 図面では A2 が左・A1 が右に出ていた。盛田さんの判断で「左が1番目」に直した。
//
// 【このテストが要る理由】
// 同じフォールバックの式が **4ファイルに写されている**:
//   snap.js(スナップ) / conn_table.js(接続表・端子台表) /
//   conn_check.js(未接続検出) / draw.js(端子番号の表示)
// 順番がズレると、**図面に出る端子番号と帳票の端子番号が食い違う**。
// これはHANDOFFに繰り返し出てくる失敗(「同じ性質の処理が複数経路にあるとき、
// 1つ直したら残りを数え上げる」)そのもので、実際2026-09-01にも起きている。
//
// 人間の数え上げに頼らず、ファイルを直接読んで4箇所の一致を見る。

const fs = require('fs');
const path = require('path');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const root = path.join(__dirname, '..');
// 端子点フォールバックを持つファイル。増やしたらここにも足すこと。
const FILES = ['js/snap.js', 'js/conn_table.js', 'js/conn_check.js', 'js/draw.js'];

console.log('【4箇所とも「左が1番目」で揃っている】');
const found = {};
FILES.forEach(f => {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  // コメント行は除いて、実際のコードだけを見る
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const good = (code.match(/\[-hw,\s*\+hw\]/g) || []).length;
  const bad  = (code.match(/\[\+hw,\s*-hw\]/g) || []).length;
  found[f] = { 左が1番目: good, 右が1番目: bad };
  ok(good === 1, `${f}: 左が1番目の式が1つある（実際 ${good}）`);
  ok(bad === 0,  `${f}: 右が1番目の古い式が残っていない（実際 ${bad}）`);
});

console.log('【数え上げ漏れが無い】');
{
  // 4ファイル以外に同じ式が紛れ込んでいないか（新しい写しが増えていないか）
  const all = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
  const others = all.map(f => 'js/' + f).filter(f => !FILES.includes(f));
  const strays = others.filter(f => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    return /\[[-+]hw,\s*[-+]hw\]/.test(code);
  });
  ok(strays.length === 0,
     strays.length ? `4箇所以外に同じ式がある: ${strays.join(', ')}（このテストのFILESに足すこと）`
                   : '4箇所以外に同じ式のコピーは無い');
}

console.log('\n' + FILES.map(f => `  ${f}: ${JSON.stringify(found[f])}`).join('\n'));
console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
