// 保存・出力の窓(js/settings.js の stWriteOut)のテスト
//   node tests/test_settings_outdir.js
//
// 経緯: 2026-09-24 保存先フォルダを選べるように → 2026-09-29 出力のたびにフォルダ選択の窓(案1)
//   → 2026-10-01 「名前を付けて保存」の窓(showSaveFilePicker)に変更(盛田さん「保存押しても、選択はでない」→「直して」)。
//   「保存」はファイル名の入力窓を先に出していたため、ブラウザが窓を開かせる「押した直後」が過ぎて窓が開けなかった。
// 最優先は「保存そのものが失われないこと」。開けない/書けないときは必ずダウンロードに落ちる。
// 窓を閉じた(キャンセル)ときだけは、取りやめてダウンロードにも落とさない。
// 上書きの確認は窓(ブラウザ)の中で出るので、こちらでは聞かない。
// (窓そのものは自動化できないので、実機で確認してもらう)
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);

const hintEl = { textContent: '' };
let confirmAsked = 0;
const sb = { console, window: {}, document: { getElementById: id => (id === 's-hint' ? hintEl : null) },
  confirm: () => { confirmAsked++; return true; } };
vm.createContext(sb);
const SRC = fs.readFileSync(__dirname + '/../js/settings.js', 'utf8');
vm.runInContext(SRC + '\nthis.__setLast = h => { _stLastHandle = h; }; this.__getLast = () => _stLastHandle;', sb);

// ファイルの鍵の偽物
function fakeFile(name, { failWrite = false } = {}) {
  const f = { name, kind: 'file', data: undefined,
    createWritable: async () => { if (failWrite) throw new Error('使用中'); let buf; return { write: async b => { buf = b; }, close: async () => { f.data = buf; } }; } };
  return f;
}
// picker: 窓の偽物。ファイルの鍵を返す / 例外 / 未対応(null)
async function run(picker, { make = 'DATA', last = null } = {}) {
  const opts = [], remembered = [], done = [];
  sb.window = picker === null ? {} : { showSaveFilePicker: async o => { opts.push(Object.assign({}, o)); return picker(o); } };
  sb._stPut = async (k, v) => { remembered.push([k, v]); };
  sb.__setLast(last);
  let fell = [];
  await sb.stWriteOut('盤A_部品表.csv', make, n => { fell.push(n); }, n => done.push(n));
  return { fell, opts, remembered, done };
}
const abort = () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };

(async () => {
  console.log('【窓で保存先と名前を選んだ】');
  { const f = fakeFile('盤A_部品表_v2.csv'); const r = await run(() => f);
    eq(r.fell.length, 0, 'ダウンロードしない');
    eq(f.data, 'DATA', '選んだファイルに書かれる');
    eq(r.opts[0].suggestedName, '盤A_部品表.csv', '最初の名前を窓に出す');
    eq(Object.keys(r.opts[0].types[0].accept)[0], 'text/csv', '種類(CSV)を窓に渡す');
    eq(r.remembered.length, 1, '保存した場所を次回の開始位置に覚える');
    eq(sb.__getLast() === f, true, '覚えた場所はメモリにも持つ(次は待たずに窓を開ける)');
    eq(r.done, ['盤A_部品表_v2.csv'], '書けたら知らせる(選んだ名前で)');
    eq(confirmAsked, 0, '上書きの確認はこちらでは聞かない(窓の中で出る)'); }

  console.log('\n【中身は名前が決まってから作る】');
  { const f = fakeFile('別名.csv'); let got = null; await run(() => f, { make: n => { got = n; return 'X:' + n; } });
    eq([got, f.data], ['別名.csv', 'X:別名.csv'], '選んだ名前で中身を作る(図面の保存名を中身に入れるため)'); }

  console.log('\n【前回の場所から窓を開く】');
  { const prev = fakeFile('前回.csv'); const r = await run(() => fakeFile('a.csv'), { last: prev });
    eq(r.opts[0].startIn === prev, true, '前回の場所を startIn に渡す'); }

  console.log('\n【前回の場所が消えて開けない → 場所の指定なしでもう一度】');
  { const prev = fakeFile('消えた.csv'); const f = fakeFile('a.csv');
    const r = await run(o => { if (o.startIn) throw new Error('NotFound'); return f; }, { last: prev });
    eq([r.opts.length, r.fell.length, f.data], [2, 0, 'DATA'], '2回目で開けて書ける'); }

  console.log('\n【窓を閉じた(キャンセル)】');
  { const r = await run(abort);
    eq(r.fell.length, 0, 'ダウンロードにも落とさない(取りやめ)');
    ok(/取りやめ/.test(hintEl.textContent), '取りやめたことを知らせる');
    eq(r.remembered.length, 0, '何も覚えない'); }

  console.log('\n【窓が開けない(押した直後でない等)】');
  { const r = await run(() => { throw new Error('Must be handling a user gesture'); });
    eq(r.fell.length, 1, 'ダウンロードに落ちる(保存は失われない)');
    ok(/開けませんでした/.test(hintEl.textContent), 'ヒント欄に理由が出る'); }

  console.log('\n【このブラウザは窓に非対応】');
  { const r = await run(null); eq([r.fell, r.done], [['盤A_部品表.csv'], ['盤A_部品表.csv']], '今までどおりダウンロード'); }

  console.log('\n【書き込みに失敗(ExcelでCSVを開いたまま等)】');
  { const r = await run(() => fakeFile('盤A_部品表.csv', { failWrite: true }));
    eq(r.fell.length, 1, 'ダウンロードに落ちる');
    ok(/書けませんでした/.test(hintEl.textContent), 'ヒント欄に理由が出る'); }

  console.log('\n【窓を開くまで待たない(押した直後に開く)】');
  { const body = SRC.slice(SRC.indexOf('async function stWriteOut('), SRC.indexOf('fh = await window.showSaveFilePicker(opt)'));
    eq((body.match(/await /g) || []).length, 0, 'stWriteOut は窓を開く前に await しない');
    const edit = fs.readFileSync(__dirname + '/../js/edit.js', 'utf8');
    const sp = edit.slice(edit.indexOf('function saveProject()'), edit.indexOf('function saveAllProject()'));
    ok(/if \(!window\.showSaveFilePicker\) \{\s*const name = prompt\(/.test(sp), '保存: 窓が使えるときは名前の入力窓を先に出さない');
    const pdf = fs.readFileSync(__dirname + '/../js/pdf_export.js', 'utf8');
    ok(/stWriteOut\(filename, \(\) => \{ const p = make\(\)/.test(pdf), 'PDF: 窓を先に開き、選んでから描く'); }

  console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
  process.exit(ng ? 1 : 0);
})();
