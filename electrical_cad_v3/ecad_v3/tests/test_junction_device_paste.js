// 端子(junction)がシンボルと完全に同じ copyDeviceProps/pasteDeviceProps を
// 使うことのテスト
//   node tests/test_junction_device_paste.js
//
// 【経緯】盛田さん「端子台プロパティにもコピー貼付けがいる」→ Claudeが端子専用の
// 別実装(フィールドを絞ったもの)を作った → 盛田さん「コピーはどうなった？」
// (複数選択パネルにボタンが無かった不具合) → 修正 → 盛田さん「コピーは見た目
// だけじゃ使えんぞ」(型式・対象外も対象にすべきという指摘、対応) →
// 盛田さん「おいシンボルと同じにしろと言ったはずだが？」。
//
// 最終的に、端子専用の実装(JUNCTION_PROP_KEYS/copyJunctionProps/
// pasteJunctionProps)は全て撤廃し、一般要素(シンボル)と完全に同じ
// copyDeviceProps/pasteDeviceProps をそのまま使うことになった。
//
// 【重要な仕様】DEVICE_PROP_KEYSには label(シンボルでは仕様、端子では端子番号)も
// 含まれる。これは意図的な選択で、端子どうしの貼り付けでは端子番号も
// コピーされる(=複数の端子に貼り付けると全て同じ番号になる)。これは把握した
// 上での仕様であり、端子番号の重複は別途ある重複警告機能で検出できる。
// このテストは「同じであること」を検証するもので、labelが対象外になって
// いないことも確認する(専用実装への先祖返りを防ぐ)。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (期待 ${JSON.stringify(b)}, 実際 ${JSON.stringify(a)})`);

const src = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const grab = (name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`関数 ${name} が見つかりません`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
};
const grabConst = (name) => {
  const start = src.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`定数 ${name} が見つかりません`);
  const end = src.indexOf('];', start) + 2;
  return src.slice(start, end);
};

function makeSandbox() {
  const rp = { _el: null };
  const sandbox = {
    console,
    document: { getElementById: id => (id === 'rp-body' ? rp : null) },
    applyRightPanel: () => {},
    updateRightPanel: () => {},
    draw: () => {},
    pushH: () => { sandbox._pushed = (sandbox._pushed || 0) + 1; },
    deviceClipboard: null,
    alert: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [grabConst('DEVICE_PROP_KEYS'), grab('copyDeviceProps'), grab('pasteDeviceProps'),
     'this.DEVICE_PROP_KEYS = DEVICE_PROP_KEYS;'].join('\n'),
    sandbox
  );
  sandbox._rp = rp;
  return sandbox;
}

const TERM = (over) => Object.assign({
  id: Math.random(), type: 'junction', style: 'circle',
  partRef: 'TB1', partModel: '端子台 M4', label: '1',
}, over);

// ------------------------------------------------------------------
console.log('【DEVICE_PROP_KEYSに端子専用の除外は無い(labelもpartRefも含まれる)】');
{
  const s = makeSandbox();
  ok(s.DEVICE_PROP_KEYS.includes('label'),    'label(端子では端子番号)が含まれる');
  ok(s.DEVICE_PROP_KEYS.includes('partRef'),  'partRef(デバイス名)が含まれる');
  ok(s.DEVICE_PROP_KEYS.includes('partModel'),'partModel(型式)が含まれる');
}

console.log('【DEVICE_PROP_KEYSの項目自体は変更していない(2026-08-03時点のまま)】');
console.log('  ← 盛田さん「項目を変えろとは一言も言ってないぞ？」。統一の過程で');
console.log('    panelZoneを一度足してしまったが、シンボル側の挙動まで意図せず');
console.log('    変えてしまう誤りだったので撤回した。');
{
  const s = makeSandbox();
  ok(!s.DEVICE_PROP_KEYS.includes('panelZone'),
     'panelZone(対象外)は含まれない(足すのは指示されていなかった)');
  eq(s.DEVICE_PROP_KEYS, [
    'label','labelAlign','labelColor','labelFs','labelOffX','labelOffY',
    'partRef','devHide','showDev','devFs','devColor','devOffX','devOffY',
    'partModel','partVolt','showModel','modelFs','modelColor','modelOffX','modelOffY',
    'textRot',
  ], 'DEVICE_PROP_KEYSが2026-08-03時点と完全に同じ項目・同じ順序');
}

console.log('【copyDeviceProps: 端子からもコピーできる(以前は明示的に弾いていた)】');
{
  const s = makeSandbox();
  s._rp._el = TERM({ label: '5', partRef: 'TB1', devColor: '#ff0000' });
  s.copyDeviceProps();
  ok(s.deviceClipboard !== null, '端子を選んでいてもコピーできる');
  eq(s.deviceClipboard.label, '5', '端子番号もコピーされる(シンボルの仕様と同じ扱い)');
  eq(s.deviceClipboard.partRef, 'TB1', 'デバイス名もコピーされる');
}

console.log('【pasteDeviceProps: 端子どうしの貼り付けで端子番号も貼り付く(仕様どおり)】');
{
  const s = makeSandbox();
  s._rp._el = TERM({ label: '5', partRef: 'TB1', devColor: '#ff0000' });
  s.copyDeviceProps();

  const t1 = TERM({ id:'t1', label:'A', partRef:'TB2' });
  const t2 = TERM({ id:'t2', label:'B', partRef:'TB3' });
  s.state = { sel: { els: new Set(['t1','t2']) }, elements: [t1, t2] };
  s.pasteDeviceProps();

  eq(t1.label, '5', 't1: 端子番号がコピー元と同じになる(シンボルと同じ挙動)');
  eq(t2.label, '5', 't2: 端子番号がコピー元と同じになる(=t1と重複する。重複警告で検出する想定)');
  eq(t1.partRef, 'TB1', 't1: デバイス名もコピー元と同じになる');
  eq(t1.devColor, '#ff0000', 't1: 見た目もコピーされる');
}

console.log('【貼り付け対象に端子が混ざっていても除外されない(以前は明示的に除外していた)】');
{
  const s = makeSandbox();
  s._rp._el = TERM({ devFs: 20 });
  s.copyDeviceProps();

  const junctionTarget = TERM({ id:'j1' });
  const symbolTarget   = { id:'s1', type:'coil', devFs:11 };
  s.state = { sel: { els: new Set(['j1','s1']) }, elements: [junctionTarget, symbolTarget] };
  s.pasteDeviceProps();

  eq(junctionTarget.devFs, 20, '端子にも貼り付く(以前はここが除外されていた)');
  eq(symbolTarget.devFs, 20, 'シンボルにも貼り付く');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
