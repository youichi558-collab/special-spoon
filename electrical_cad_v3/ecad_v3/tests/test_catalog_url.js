// カタログURL(CSV 10列目)の取り込みと表示のテスト
//   node tests/test_catalog_url.js
//
// 【背景・2026-09-20】盛田さん「カタログのリンクを追加してほしい。どのカタログを
// 見たか判ると使いやすい。リンク情報はcad側も見えるようにできるか」。
//
// 出典列(9列目)は2026-09-03に追加済みだったが、実データは605行すべて8列で
// 出典は0件だった。そこへ10列目としてカタログURLを足した。
//
// 分割済みカタログ(三菱・富士・IDEC=498件)ならリンクがページを直接指せる。
// 未分割(キーエンス・オムロン=107件)は同じリンクになるが、出典テキストの
// ページ番号で追える。
//
// このテストが守るもの:
//   1. 9列までの古いCSVが従来どおり読める(列数は「8列以上」が仕様)
//   2. 10列目があれば catalogUrl として取り込まれる
//   3. http/https 以外はリンクにしない(javascript: 等を図面側で開かせない)
//   4. 実際に置いたCSVが仕様どおりであること(価格禁止・生カンマ禁止・列数)

const fs = require('fs');
const path = require('path');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const root = path.join(__dirname, '..');

// ---- ui.js のリンク化条件を実ファイルから取り出して確かめる ----
console.log('【http/https 以外はリンクにしない】');
console.log('  ← 部品DBは外から来るCSVを読む。javascript: を図面側で開かせない');
{
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  const hasGuard = /\/\^https\?:\\\/\\\/\/\.test\(p\.catalogUrl/.test(ui);
  ok(hasGuard, 'ui.js が catalogUrl を http/https で絞っている');
  ok(/rel="noopener noreferrer"/.test(ui), 'リンクに rel="noopener noreferrer" が付いている');

  // 条件式そのものを実行して確かめる
  const re = /^https?:\/\//;
  ok(re.test('https://drive.google.com/file/d/xxx/view'), 'https は通る');
  ok(re.test('http://localhost:8080/x.pdf'), 'http も通る');
  ok(!re.test('javascript:alert(1)'), 'javascript: は弾く');
  ok(!re.test('file:///C:/x.pdf'), 'file: は弾く');
  ok(!re.test('三菱電磁開閉器 p.41'), 'ただの出典テキストはリンクにしない');
  ok(!re.test(''), '空は弾く');
}

// ---- CSV取り込み側 ----
console.log('【CSVの列の読み方】');
{
  const pp = fs.readFileSync(path.join(root, 'js/parts_page.js'), 'utf8');
  ok(/const \[maker, ref, type, volt, amp, terminals, contacts, note, source, catalogUrl\]/.test(pp),
     '10列目を catalogUrl として受けている');
  const n = (pp.match(/catalogUrl:/g) || []).length;
  ok(n >= 4, `部品オブジェクトを組む箇所すべてに catalogUrl がある（${n}箇所）`);
}

// ---- INDEX生成スクリプトの列数検証 ----
console.log('【列数の検証が「8列以上」になっている】');
console.log('  ← 仕様は2026-09-03に「ちょうど8列」から変わったのに、生成側が追随していなかった');
{
  const g = fs.readFileSync(path.join(root, 'tools/generate_catalog_index.py'), 'utf8');
  ok(/len\(r\) < 8/.test(g), '8列未満だけを異常として扱う');
  ok(!/len\(r\) != 8/.test(g), '「ちょうど8列」の判定が残っていない');
}

// ---- 実際に置いたCSV ----
console.log('【mitsubishi_inverter_batch1.csv が仕様どおり】');
{
  const p = path.join(root, 'catalog_pending/mitsubishi_inverter_batch1.csv');
  ok(fs.existsSync(p), 'ファイルがある');
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim());
  ok(lines.length === 30, `30型番ある（実際 ${lines.length}）`);

  // csvの素朴なパース(クォート対応)
  const parse = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out;
  };

  let bad = 0, priced = 0, noUrl = 0, badType = 0;
  const refs = new Set();
  lines.forEach(l => {
    const c = parse(l);
    if (c.length !== 10) bad++;
    if (/円|価格/.test(l)) priced++;
    if (!/^https?:\/\//.test(c[9] || '')) noUrl++;
    if (c[2] !== 'inverter') badType++;
    refs.add(c[1]);
  });
  ok(bad === 0, `全行10列（違反 ${bad}）`);
  ok(priced === 0, `価格情報が入っていない（違反 ${priced}）`);
  ok(noUrl === 0, `全行にカタログURLがある（欠け ${noUrl}）`);
  ok(badType === 0, `種別が全行 inverter（違反 ${badType}）`);
  ok(refs.size === 30, `型番が重複していない（${refs.size}種）`);

  // 種別コードが CAD 側に存在すること
  const pt = fs.readFileSync(path.join(root, 'js/part_types.js'), 'utf8');
  ok(/'inverter'/.test(pt), 'inverter が PART_TYPE_CODES にある');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
