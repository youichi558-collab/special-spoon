// 保存先フォルダ(js/settings.js の stWriteOut)のテスト(2026-09-24)
//   node tests/test_settings_outdir.js
//
// 盛田さん「保存先を選べるようにしたい、選んだあと記憶できるか？」。
// 最優先は「保存そのものが失われないこと」。フォルダに書けないときは
// 必ず今までどおりのダウンロードに落ちることを確かめる。
// (フォルダ選択ダイアログ自体は自動化できないので、実機で確認してもらう)
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };

const hintEl = { textContent: '' };
const sb = { console, window: {}, document: { getElementById: id => (id === 's-hint' ? hintEl : null) } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(__dirname + '/../js/settings.js', 'utf8'), sb);

// フォルダの鍵の偽物。written に書いた中身が溜まる
function fakeDir({ perm = 'granted', grant = 'granted', failWrite = false } = {}) {
  const written = {};
  return { written, name: '図面置き場',
    requestPermission: async () => grant,
    getFileHandle: async (n) => ({ createWritable: async () => {
      if (failWrite) throw new Error('使用中');
      let buf = ''; return { write: async b => { buf = b; }, close: async () => { written[n] = buf; } };
    } }),
    _perm: perm };
}
async function run(dir, state) {
  sb.stOutDirStatus = async () => ({ handle: dir, state: dir ? state : 'none' });
  let fell = 0;
  await sb.stWriteOut('盤A_部品表.csv', 'DATA', () => { fell++; });
  return fell;
}

(async () => {
  console.log('【未設定】');
  eq(await run(null), 1, '今までどおりダウンロード');

  console.log('\n【許可あり】');
  { const d = fakeDir(); eq(await run(d, 'granted'), 0, 'ダウンロードしない');
    eq(d.written['盤A_部品表.csv'], 'DATA', 'フォルダに書かれる'); }

  console.log('\n【許可が外れている → 聞き直して許可された】');
  { const d = fakeDir({ grant: 'granted' }); eq(await run(d, 'prompt'), 0, 'フォルダに書く');
    eq(d.written['盤A_部品表.csv'], 'DATA', '書かれている'); }

  console.log('\n【許可が外れている → 許可されなかった】');
  { const d = fakeDir({ grant: 'prompt' }); eq(await run(d, 'prompt'), 1, 'ダウンロードに落ちる(保存は失われない)');
    eq(/許可が外れています/.test(hintEl.textContent), true, 'ヒント欄に理由が出る'); }

  console.log('\n【書き込みに失敗(ExcelでCSVを開いたまま等)】');
  { const d = fakeDir({ failWrite: true }); eq(await run(d, 'granted'), 1, 'ダウンロードに落ちる');
    eq(/書けませんでした/.test(hintEl.textContent), true, 'ヒント欄に理由が出る'); }

  console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
  process.exit(ng ? 1 : 0);
})();
