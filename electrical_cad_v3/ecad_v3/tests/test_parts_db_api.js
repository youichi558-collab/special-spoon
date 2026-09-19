// 部品DBを他ソフトから読めるようにした仕組みのテスト
//   node tests/test_parts_db_api.js
//
// 【背景・2026-09-02】
// 部品DBの実体(parts_db.json)の場所はブラウザだけが知っていた。
// File System Access API は絶対パスをJSに渡さないため、CAD以外のソフトからは
// 部品DBを見つけようが無かった。
//
// そこで catalog_db と同じ形で tools/parts_db/ を置き、
//   ・CADが保存に成功したら、その中身の控えをローカルサーバーへ送る
//   ・サーバー(server.py / parts_db_server.py)が読み取りAPIで公開する
// という構成にした。
//
// このテストが守るのは主に1つ:
//   parts_db.json の書き手が増えていないこと
//   (2つ以上が書くと、どちらかの書き込みが黙って失われる)
//
// 【2026-09-02 追記】2の「書き手」がCAD(ブラウザ)からサーバーへ移った。
// 【2026-09-03 追記】CADはもう部品DBを書かない(読むだけ)。書き手は
// 部品DB単独画面(parts.html / js/parts_page.js)だけになった
// (経路そのものは tests/test_parts_page_save.js が見ている)。
// このファイルでは
//   ・他ソフト向けの parts_db_server.py は今まで通り読み取り専用であること
//   ・server.py の書き込み口が保存・退避・控えの3つだけであること
//   ・parts_db.json を上書きするときは必ず tmp 経由(書きかけが残らない)であること
// を見る。

const fs = require('fs');
const path = require('path');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

(async () => {
    // --------------------------------------------------------------
    console.log('【書き手が増えていない・書きかけが残らない】');
    const lib = read('tools/parts_db/parts_db.py');
    const srv = read('tools/parts_db/parts_db_server.py');
    const cad = read('server.py');

    // コメント行は除いてから見る(説明文に 'w' が出てくるため)。
    const libCode = lib.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

    // parts_db.py が書きモードで open するのは、設定ファイルと「.tmp」だけ。
    // 本番のファイル(parts_db.json・控え・退避)は必ず tmp に書いてから
    // os.replace で置き換える。途中で落ちても、読む側が半端なJSONを見ることはない。
    // ——「開いた瞬間に中身が消える」FSAのcreateWritableを避けたのがこの形。
    const writeOpens = [...libCode.matchAll(/open\(\s*([A-Za-z_][\w.()\[\] +]*?)\s*,\s*'w'/g)]
      .map(m => m[1]);
    eq(writeOpens.length, 4, '書きモードで open するのは4箇所(設定＋tmp×3)');
    ok(writeOpens.some(v => /config_path/.test(v)), '設定ファイルへの書き込みがある');
    eq(writeOpens.filter(v => /tmp/.test(v)).length, 3,
       '★残り3つ(控え・退避・部品DB本体)はすべて tmp に書く');
    eq((libCode.match(/os\.replace\(/g) || []).length, 3,
       '★tmpに書いたものは os.replace で置き換える(3箇所)');

    // 実ファイルを直接 'w'/'a' で開く経路が無いこと。
    // load() は open(path) を読みモードでしか呼ばない。
    ok(!/open\(\s*path\s*,\s*['"][wa]/.test(libCode),
       '★ parts_db.json を書き・追記モードで直接開かない(必ず tmp 経由)');
    ok(!/os\.remove|shutil\.|\.unlink\(/.test(libCode),
       'parts_db.py にファイルを消す経路が無い');

    // 保存先は「setpath で設定されたファイル」だけ。控え(mirror)には保存しない。
    // resolve() は控えも返すので、save() がそれを書き先にすると
    // 「原本は古いまま、他ソフトだけ新しい」という一番分かりにくい形になる。
    // save() の本体だけを切り出す(次のメソッド定義の手前まで)。
    // libCode はコメントを落としてあるので、区切りの見出しは目印に使えない。
    const saveStart = libCode.indexOf('    def save(self');
    ok(saveStart > 0, 'parts_db.py に save() がある');
    const after = libCode.slice(saveStart + 10);
    const saveEnd = saveStart + 10 + Math.min(
      ...[/\n    def /, /\n    @/].map(re => {
        const i = after.search(re);
        return i < 0 ? after.length : i;
      }));
    const saveBody = libCode.slice(saveStart, saveEnd);
    ok(/writable_path\(\)/.test(saveBody), 'save() は writable_path() を書き先にする');
    ok(!/\bself\.resolve\(\)/.test(saveBody),
       '★save() は resolve() を使わない(控えに保存してしまわないため)');

    // 独立サーバー(他ソフト向け)は今まで通り読み取り専用のまま。
    // 書き込みが要るのはCAD自身だけなので、こちらに口を開ける理由が無い。
    ok(/do_PUT\s*=\s*do_DELETE\s*=\s*do_PATCH\s*=\s*do_POST/.test(srv),
       'POST以外の書き込みメソッドもまとめて塞いである');
    ok(/405/.test(srv), '書き込みは405で返す(実装漏れではないと分かる形)');
    ok(!/\.save\(|\.backup\(/.test(srv),
       '★他ソフト向けサーバーは save()/backup() を呼ばない');

    // server.py の /api/parts/ で受ける書き込みは、保存・退避・控えの3つだけ。
    const partsPost = cad.match(/def do_POST[\s\S]*?self\.send_error\(404\)/)[0];
    const partsRoutes = [...partsPost.matchAll(/'(\/api\/parts\/[a-z]+)'/g)].map(m => m[1]);
    eq(partsRoutes, ['/api/parts/mirror', '/api/parts/save', '/api/parts/backup'],
       'POSTで受けるのは控え・保存・退避の3つだけ');

    // 控えの書き先が parts_db.json ではないこと
    ok(/mirror_path/.test(lib.slice(lib.indexOf('def write_mirror'))),
       '控えは mirror_path() に書く(部品DB本体ではない)');

    // --------------------------------------------------------------
    console.log('\n【外に出さない・巨大なDXFを検索結果に混ぜない】');
    ok(/DEFAULT_HOST\s*=\s*'127\.0\.0\.1'/.test(srv), '待ち受けは既定で 127.0.0.1');
    ok(/ALLOWED_ORIGIN_PREFIXES/.test(srv) && !/'\*'/.test(srv.match(/ALLOWED_ORIGIN_PREFIXES[\s\S]*?\)/)[0]),
       'CORSは localhost のみ(ワイルドカードでない)');
    // タプルの中身そのものを取り出して見る(近くのコメントに引っかからないよう)
    const tuple = name => {
      const m = libCode.match(new RegExp(name + "\\s*=\\s*([^=]*?\\))\\n"));
      return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : null;
    };
    const search = tuple('SEARCH_FIELDS');
    ok(search && search.includes('ref') && search.includes('maker'),
       '検索対象に型番・メーカーが入っている');
    ok(search && !search.includes('outlineDxf'),
       '★検索対象にDXF本文を入れない(数百KBの図形データが備考扱いで一致しない)');
    ok(!/'outlineDxf'/.test(libCode.match(/PUBLIC_FIELDS[\s\S]*?\n\n/)[0]),
       '★検索結果に外形図DXFの本文を含めない(has_outline だけ返す)');

    console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
    process.exit(ng ? 1 : 0);
})();
