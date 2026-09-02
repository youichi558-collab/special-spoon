// テストを全部流す
//   node tests/run_all.js
//
// 【なぜ置いたか・2026-09-02】
// tests/ の中身を1本ずつ node で叩いていたため、
//   ・新しく足したテストが流し忘れられる
//   ・Pythonで書いたテスト(test_*.py)は、そもそも .js を探す流し方だと拾われない
// という抜けができた。「全部流した」と言うためには、全部を1回で流せる必要がある。
//
// 終了コードは、1本でも落ちたら 1。push前にこれが 0 であることを確認する。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(f => /^test_.*\.(js|py)$/.test(f))
  .sort();

// Pythonの呼び名は環境で違う(Windowsは py、Linuxは python3)。
// 見つからないときは黙って飛ばさない —— 「流せていない」ことは失敗として扱う。
function findPython() {
  for (const cmd of ['py', 'python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'print(1)'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}
const python = files.some(f => f.endsWith('.py')) ? findPython() : null;

let failed = [];
for (const f of files) {
  const isPy = f.endsWith('.py');
  if (isPy && !python) {
    console.log(`NG   ${f}  (Pythonが見つからず流せませんでした)`);
    failed.push(f);
    continue;
  }
  const r = spawnSync(isPy ? python : process.execPath, [path.join(dir, f)],
                      { encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    console.log(`ok   ${f}`);
  } else {
    console.log(`NG   ${f}`);
    // 落ちた行と、その周辺だけ出す(全部出すと本当の失敗が埋もれる)
    out.split('\n').filter(l => /NG|Error|失敗/.test(l)).slice(0, 12)
       .forEach(l => console.log('       ' + l.trim()));
    failed.push(f);
  }
}

console.log(failed.length
  ? `\n${files.length}本中 ${failed.length}本が失敗: ${failed.join(', ')}`
  : `\n${files.length}本すべて通過`);
process.exit(failed.length ? 1 : 0);
