// バックアップを「いつ取るか／取らないか」の判定のテスト
//   node tests/test_backup_decide.js
//
// 【背景・2026-09-20】盛田さんの「自動保存とは別に、件数ある程度たまったら
// 削除していくようなファイル保存が要るかもな」で新設した js/backup.js の判定部分。
//
// 取らない理由はどれも意図があるもので、間違えると実害が出る:
//   empty     … 空の図面で世代を埋めると、中身のある古い控えを押し出してしまう。
//               2026-08-23の事故(空で上書き → 復旧不能)と同じ形になる
//   missingjs … JSが虫食いで読み込めていない状態のstateは信用できない
//               (2026-09-19の事故。autosave.js の保護と同じ判断)
//   same      … 触っていない間も書き続けると、同じ図面が何十件も並んで
//               肝心の「変わる前」が押し出される
//
// 設定の正規化も見る。おかしな値が入っても落ちない・暴走しないこと。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const src = fs.readFileSync(__dirname + '/../js/backup.js', 'utf8');
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
};
const grabConst = (name) => {
  const m = src.match(new RegExp(`^const ${name}\\s*=\\s*([^;]+);`, 'm'));
  if (!m) throw new Error(`定数 ${name} が見つかりません`);
  return `var ${name} = ${m[1]};`;
};

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([
  grabConst('BK_DEFAULT'), grabConst('BK_MIN_INTERVAL'), grabConst('BK_MAX_INTERVAL'),
  grabConst('BK_MIN_KEEP'), grabConst('BK_MAX_KEEP'),
  grab('bkShouldSave'), grab('bkNormalizeConf'), grab('bkContentCount'),
].join('\n'), sandbox);
const { bkShouldSave, bkNormalizeConf, bkContentCount, BK_DEFAULT, BK_MAX_KEEP, BK_MAX_INTERVAL } = sandbox;

const base = {
  enabled: true, force: false, elapsedMs: 99 * 60 * 1000, intervalMin: 10,
  contentCount: 400, missingJs: [], sameAsLast: false,
};
const decide = (o) => bkShouldSave(Object.assign({}, base, o));

console.log('【通常は取る】');
{
  const r = decide({});
  ok(r.save === true && r.reason === 'ok', '間隔が経っていて中身があれば取る');
}

console.log('【空の図面では取らない】');
console.log('  ← 空で世代を埋めると、中身のある古い控えを押し出してしまう');
{
  ok(decide({ contentCount: 0 }).reason === 'empty', '要素も配線も0なら取らない');
  ok(decide({ contentCount: 1 }).save === true, '1個でもあれば取る');
}

console.log('【JSが読み込めていないときは取らない】');
console.log('  ← 欠けた状態のstateは信用できない(2026-09-19の事故)');
{
  const r = decide({ missingJs: ['frame.js', 'snap.js'] });
  ok(r.save === false && r.reason === 'missingjs', 'JSが欠けていたら取らない');
  ok(decide({ missingJs: ['frame.js'], force: true }).save === false,
     '「今すぐ取る」を押してもJSが欠けていれば取らない');
}

console.log('【前回から変わっていなければ取らない】');
console.log('  ← 触っていない間も書き続けると、肝心の「変わる前」が押し出される');
{
  ok(decide({ sameAsLast: true }).reason === 'same', '中身が同じなら取らない');
  ok(decide({ sameAsLast: true, force: true }).reason === 'same',
     '「今すぐ取る」でも中身が同じなら取らない');
}

console.log('【間隔】');
{
  ok(decide({ elapsedMs: 9 * 60 * 1000, intervalMin: 10 }).reason === 'notyet', '9分では取らない');
  ok(decide({ elapsedMs: 10 * 60 * 1000, intervalMin: 10 }).save === true, 'ちょうど10分で取る');
  ok(decide({ elapsedMs: 0, force: true }).save === true, '「今すぐ取る」は間隔を無視する');
}

console.log('【設定で切ってあれば取らない】');
{
  ok(decide({ enabled: false }).reason === 'off', 'OFFなら取らない');
  ok(decide({ enabled: false, force: true }).reason === 'off',
     'OFFのときは force を渡す側(bkRun)が enabled を立てる約束なので、ここではOFF扱い');
}

console.log('【設定の正規化】');
{
  const d = bkNormalizeConf({});
  ok(d.enabled === true && d.intervalMin === 10 && d.keep === 30,
     `既定は ON・10分・30件 (実際 ${JSON.stringify(d)})`);

  ok(bkNormalizeConf({ intervalMin: 0 }).intervalMin === 1, '0分は1分に切り上げ（毎分書き続けない）');
  ok(bkNormalizeConf({ intervalMin: -5 }).intervalMin === 1, 'マイナスも1分');
  ok(bkNormalizeConf({ intervalMin: 99999 }).intervalMin === BK_MAX_INTERVAL, '大きすぎる値は上限で止まる');
  ok(bkNormalizeConf({ intervalMin: 'あ' }).intervalMin === 10, '数字でなければ既定に戻る');

  ok(bkNormalizeConf({ keep: 0 }).keep === 1, '0件は1件に（全部消えるのを防ぐ）');
  ok(bkNormalizeConf({ keep: -1 }).keep === 1, 'マイナスも1件');
  ok(bkNormalizeConf({ keep: 10 ** 9 }).keep === BK_MAX_KEEP, '大きすぎる件数は上限で止まる');
  ok(bkNormalizeConf({ keep: null }).keep === 30, 'nullは既定に戻る');

  ok(bkNormalizeConf({ enabled: false }).enabled === false, 'OFFはOFFのまま');
  ok(bkNormalizeConf({ enabled: 0 }).enabled === false, '0はOFF');
}

console.log('【中身の数え方】');
{
  ok(bkContentCount([{ elements: [1,2], wires: [1] }, { elements: [1], wires: [] }]) === 4,
     '全ページの要素＋配線を数える');
  ok(bkContentCount([]) === 0, '空の配列は0');
  ok(bkContentCount(null) === 0, 'nullでも落ちない');
  ok(bkContentCount([null, {}, { elements: null }]) === 0, '壊れたページが混ざっても落ちない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
