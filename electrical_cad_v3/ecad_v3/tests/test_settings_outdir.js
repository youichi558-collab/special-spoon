// 保存先フォルダ(js/settings.js の stWriteOut)のテスト(2026-09-24、2026-09-29に「出力のたびに選ぶ」へ変更)
//   node tests/test_settings_outdir.js
//
// 盛田さん「保存先を選べるようにしたい、選んだあと記憶できるか？」。
// 2026-09-29: 盛田さん「保存先選択は全部出す必要がある」→ 出力のたびにフォルダ選択の窓を開く(案1)。
// 最優先は「保存そのものが失われないこと」。選べない/書けないときは必ずダウンロードに落ちる。
// 窓を閉じた(キャンセル)ときだけは、取りやめてダウンロードにも落とさない。
// (フォルダ選択ダイアログ自体は自動化できないので、実機で確認してもらう)
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };

const hintEl = { textContent: '' };
let confirmAns = true, confirmAsked = 0;
const sb = { console, window: {}, document: { getElementById: id => (id === 's-hint' ? hintEl : null) },
  confirm: () => { confirmAsked++; return confirmAns; } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(__dirname + '/../js/settings.js', 'utf8'), sb);

// フォルダの鍵の偽物。written に書いた中身が溜まる
function fakeDir({ failWrite = false, existing = {} } = {}) {
  const written = Object.assign({}, existing);
  return { written, name: '図面置き場',
    getFileHandle: async (n, opt) => {
      if (!(opt && opt.create) && !(n in written)) throw new Error('NotFound');
      return { createWritable: async () => {
      if (failWrite) throw new Error('使用中');
      let buf = ''; return { write: async b => { buf = b; }, close: async () => { written[n] = buf; } };
    } }; } };
}
// picker: 窓の偽物。dir を返す / 例外を投げる / 未対応(null)
async function run(picker, prev) {
  const opts = [];
  const remembered = [];
  sb.window = picker === null ? {} : { showDirectoryPicker: async o => { opts.push(o); return picker(); } };
  sb.stOutDirStatus = async () => ({ handle: prev || null, state: prev ? 'granted' : 'none' });
  sb._stPut = async (k, v) => { remembered.push([k, v]); };
  let fell = 0;
  await sb.stWriteOut('盤A_部品表.csv', 'DATA', () => { fell++; });
  return { fell, opts, remembered };
}
const abort = () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };

(async () => {
  console.log('【窓でフォルダを選んだ】');
  { const d = fakeDir(); const r = await run(() => d);
    eq(r.fell, 0, 'ダウンロードしない');
    eq(d.written['盤A_部品表.csv'], 'DATA', '選んだフォルダに書かれる');
    eq(r.opts[0].mode, 'readwrite', '書き込みで開く');
    eq(r.remembered.length, 1, '選んだフォルダを次回の開始位置に覚える'); }

  console.log('\n【前回のフォルダから窓を開く】');
  { const prev = fakeDir(); const r = await run(() => fakeDir(), prev);
    eq(r.opts[0].startIn === prev, true, '前回のフォルダを startIn に渡す'); }

  console.log('\n【窓を閉じた(キャンセル)】');
  { const r = await run(abort);
    eq(r.fell, 0, 'ダウンロードにも落とさない(取りやめ)');
    eq(/取りやめ/.test(hintEl.textContent), true, '取りやめたことを知らせる');
    eq(r.remembered.length, 0, '何も覚えない'); }

  console.log('\n【窓が開けない(操作の直後でない・システムフォルダ等)】');
  { const r = await run(() => { throw new Error('システムフォルダは選べません'); });
    eq(r.fell, 1, 'ダウンロードに落ちる(保存は失われない)');
    eq(/選べませんでした/.test(hintEl.textContent), true, 'ヒント欄に理由が出る'); }

  console.log('\n【このブラウザは窓に非対応】');
  { const r = await run(null); eq(r.fell, 1, '今までどおりダウンロード'); }

  console.log('\n【同じ名前が既にある → 確認で「はい」】(無言で上書きしない)');
  { const d = fakeDir({ existing: { '盤A_部品表.csv': 'OLD' } }); confirmAns = true; confirmAsked = 0;
    const r = await run(() => d);
    eq(r.fell, 0, 'ダウンロードしない');
    eq(confirmAsked, 1, '上書きしてよいか聞く');
    eq(d.written['盤A_部品表.csv'], 'DATA', '上書きされる'); }

  console.log('\n【同じ名前が既にある → 確認で「いいえ」】');
  { const d = fakeDir({ existing: { '盤A_部品表.csv': 'OLD' } }); confirmAns = false;
    const r = await run(() => d);
    eq(r.fell, 0, 'ダウンロードもしない(取りやめ)');
    eq(d.written['盤A_部品表.csv'], 'OLD', '元のファイルはそのまま');
    eq(/取りやめ/.test(hintEl.textContent), true, '取りやめたことを知らせる'); }

  console.log('\n【新しい名前 → 聞かずに書く】');
  { const d = fakeDir(); confirmAsked = 0; await run(() => d);
    eq(confirmAsked, 0, '確認は出さない');
    eq(/保存しました/.test(hintEl.textContent), true, '保存したことを知らせる'); }

  console.log('\n【書き込みに失敗(ExcelでCSVを開いたまま等)】');
  { const d = fakeDir({ failWrite: true }); const r = await run(() => d);
    eq(r.fell, 1, 'ダウンロードに落ちる');
    eq(/書けませんでした/.test(hintEl.textContent), true, 'ヒント欄に理由が出る'); }

  console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
  process.exit(ng ? 1 : 0);
})();
