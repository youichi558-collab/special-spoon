// テスト用ヘルパー: 本物の escH(js/state.js)をテスト側に持ち込む。
//
// テストは「実ソースを実際に実行して検証する」方針なので、ここでも
// エスケープ処理をコピーせず state.js から抜き出して使う。
// (コピーを置くと、本体を直したときにテストだけ古い挙動を検証し続ける)
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/state.js', 'utf8');
const m = src.match(/function escH\([\s\S]*?\n\}/);
if (!m) throw new Error('js/state.js に escH が見つかりません');
module.exports = { escHSrc: m[0], escH: eval('(' + m[0] + ')') };
