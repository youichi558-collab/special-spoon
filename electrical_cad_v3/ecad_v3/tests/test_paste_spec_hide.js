// 2026-09-24 盛田さん指摘の3件の回帰テスト
//   node tests/test_paste_spec_hide.js
//
// 1. 「仕様を図面に表示」(specHide)がコピー貼り付けに乗らず、毎回チェックを
//    外し直していた → DEVICE_PROP_KEYSに追加
// 2. 仕様表示OFFでもDXFに仕様が出ていた → dxf_export.jsでspecHideを判定
// 3. 貼り付け後に別の値が上書きされる → 複数選択パネルがコピー元を rp._el に
//    指したまま残り、貼り付けで画面を作り直した瞬間の focusout で
//    applyRightPanel() がコピー元のデバイス名・仕様を空で上書きしていた。
//    (Playwrightの実ブラウザで再現・修正確認済み。ここではコード上の対策が
//     消えていないことを確かめる)
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const ui  = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const dxf = fs.readFileSync(__dirname + '/../js/dxf_export.js', 'utf8');
const grab = (name) => {
  const s = ui.indexOf(`function ${name}(`);
  return ui.slice(s, ui.indexOf('\n}', s) + 2);
};
const grabConst = (name) => {
  const s = ui.indexOf(`const ${name} = [`);
  return ui.slice(s, ui.indexOf('];', s) + 2);
};

console.log('【1. 仕様の表示チェックが貼り付けに乗る】');
{
  const rp = { _el: null };
  const sb = {
    document: { getElementById: id => (id === 'rp-body' ? rp : null) },
    applyRightPanel() {}, updateRightPanel() {}, draw() {}, pushH() {}, alert() {},
    deviceClipboard: null,
  };
  vm.createContext(sb);
  vm.runInContext([grabConst('DEVICE_PROP_KEYS'), grab('copyDeviceProps'), grab('pasteDeviceProps')].join('\n'), sb);
  const src = { id: 1, label: 'AC200V', specHide: true };
  const t1 = { id: 2 }, t2 = { id: 3, specHide: false };
  sb.state = { elements: [src, t1, t2], sel: { els: new Set([1]) } };
  rp._el = src; vm.runInContext('copyDeviceProps()', sb);
  sb.state.sel.els = new Set([2, 3]);
  vm.runInContext('pasteDeviceProps()', sb);
  ok(t1.specHide === true && t2.specHide === true, 'OFF(specHide=true)が貼り付け先へ反映される');
  // ONのシンボルからコピーしたら、OFFだった貼り付け先もONに戻る
  const on = { id: 4, label: 'x' };
  sb.state.elements.push(on); rp._el = on;
  vm.runInContext('copyDeviceProps()', sb);
  vm.runInContext('pasteDeviceProps()', sb);
  ok(t1.specHide === undefined && t2.specHide === undefined, 'ON(未設定)のコピーでOFFが解除される');
}

console.log('\n【2. 仕様表示OFFはDXFに出さない】');
ok(/if\(el\.label && !el\.specHide\)\{\s*const lox=el\.labelOffX/.test(dxf), 'dxf_export.jsのシンボル仕様出力がspecHideを判定している');

console.log('\n【3. 複数選択パネルはコピー元を掴んだままにしない】');
{
  const f = grab('updateRightPanel');
  const multi = f.slice(f.indexOf('if (totalSel >= 2'), f.indexOf('\n    return;\n  }', f.indexOf('if (totalSel >= 2')));
  const clr = multi.indexOf('rp._el = null');
  const inner = multi.indexOf('rp.innerHTML');
  ok(clr >= 0 && inner >= 0 && clr < inner, '複数選択パネルを描く前に rp._el を空にしている');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
