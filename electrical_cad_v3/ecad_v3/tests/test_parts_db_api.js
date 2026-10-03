// 部品DBの読み書きの口(server.py ↔ tools/parts_db/parts_db.py)のテスト
//   node tests/test_parts_db_api.js
//
// 【経緯】2026-09-02 に部品DBを tools/parts_db/ 経由で読み書きする形にした(書き手をブラウザからサーバーへ)。
// 2026-09-03 にCADは読むだけになり、書くのは部品DB単独画面(parts.html)だけになった。
// 2026-10-03(再設計の段階1)で、部品DBをライブラリフォルダに置く形にし、控え(mirror)・起動時の全走査・
// 他ソフト向けの parts_db_server.py と search/get をやめた。
//
// このテストが守るのは主に:
//   ・parts_db.json の書き手が増えていないこと(2つ以上が書くと、どちらかの書き込みが黙って失われる)
//   ・server.py の書き込み口が保存・退避と場所の設定だけであること
//   ・場所の設定は画面から送られたパスを使わないこと
//   ・parts_db.json を上書きするときは必ず tmp 経由(書きかけが残らない)であること
// 実際にファイルを書いて確かめるのは tests/test_parts_db_save.py。

const fs = require('fs');
const path = require('path');

let ng = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); }
  else console.log('  OK', m);
};
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

const root = path.join(__dirname, '..');
// Windowsで取り出すと改行がCRLFになり、'\n'を目印にした切り出しが外れるのでLFにそろえる
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

(async () => {
    // --------------------------------------------------------------
    console.log('【書き手が増えていない・書きかけが残らない】');
    const lib = read('tools/parts_db/parts_db.py');
    const cad = read('server.py');
    ok(!fs.existsSync(path.join(root, 'tools/parts_db/parts_db_server.py')),
       '他ソフト向けの parts_db_server.py は無い(使っていないので2026-10-03に消した)');

    // コメント行は除いてから見る(説明文に 'w' が出てくるため)。
    const libCode = lib.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');

    // parts_db.py が書きモードで open するのは、設定ファイルと「.tmp」だけ。
    // 本番のファイル(parts_db.json・世代バックアップ)は必ず tmp に書いてから
    // os.replace で置き換える。途中で落ちても、読む側が半端なJSONを見ることはない。
    const writeOpens = [...libCode.matchAll(/open\(\s*([A-Za-z_][\w.()\[\] +]*?)\s*,\s*'w'/g)]
      .map(m => m[1]);
    eq(writeOpens.length, 3, '書きモードで open するのは3箇所(設定＋tmp×2)');
    ok(writeOpens.some(v => /config_path/.test(v)), '設定ファイルへの書き込みがある');
    eq(writeOpens.filter(v => /tmp/.test(v)).length, 2,
       '★残り2つ(部品DB本体・世代バックアップ)はすべて tmp に書く');
    eq((libCode.match(/os\.replace\(/g) || []).length, 2,
       '★tmpに書いたものは os.replace で置き換える(2箇所)');
    ok(!/open\(\s*path\s*,\s*['"][wa]/.test(libCode),
       '★ parts_db.json を書き・追記モードで直接開かない(必ず tmp 経由)');
    // ファイルを消すのは世代バックアップの整理だけ(自分の作った名前に一致するものだけ)
    const removes = libCode.match(/os\.remove\(|shutil\.|\.unlink\(/g) || [];
    eq(removes.length, 1, 'ファイルを消す経路は1つだけ');
    ok(/_BACKUP_RE\.match\(n\)[\s\S]{0,200}os\.remove/.test(libCode),
       '★消すのは世代バックアップの名前(_BACKUP_RE)に一致するものだけ');
    ok(!/def write_mirror|mirror_path|MIRROR_NAME/.test(libCode), '控え(mirror)はもう無い');

    // save() の本体だけを切り出す(次のメソッド定義の手前まで)
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
    const iConflict = saveBody.indexOf("'conflict'"), iDrop = saveBody.indexOf("'drop'"), iWrite = saveBody.indexOf('_write_json(');
    ok(iConflict > 0 && iConflict < iDrop && iDrop < iWrite,
       '★版の確認(conflict)→件数激減の確認(drop)→書き込み の順(force は drop だけを通す)');
    ok(saveBody.indexOf('_backup_file(') > 0 && saveBody.indexOf('_backup_file(') < iWrite,
       '★書く前に世代バックアップを取る');

    // server.py の /api/parts/ で受ける書き込みは、保存・退避の2つと場所の設定だけ。
    const partsPost = cad.match(/def do_POST[\s\S]*?self\.send_error\(404\)/)[0];
    const partsRoutes = [...partsPost.matchAll(/'(\/api\/parts\/[a-z]+)'/g)].map(m => m[1]);
    eq(partsRoutes, ['/api/parts/save', '/api/parts/backup',
                     '/api/parts/pick', '/api/parts/create', '/api/parts/find', '/api/parts/use'],
       'POSTで受けるのは保存・退避と、場所の設定(フォルダを選ぶ・作る・探す・候補から選ぶ)だけ');
    ok(/save\(payload, force=force, base_version=payload\.get\('version'\)\)/.test(cad),
       '★保存は画面が読んだ時点の版を渡す');
    const place = cad.match(/def handle_parts_place[\s\S]*?def handle_parts_save/)[0];
    ok(!/body\.get\('(path|folder)'/.test(place) && /Handler\._place_found\[i\]/.test(place)
       && /folder = Handler\._place_pending/.test(place),
       '★場所の設定は画面から送られたパスを使わない(候補は番号、作る先はサーバーが覚えたフォルダ)');
    ok(/self\.client_address\[0\] not in \('127\.0\.0\.1'/.test(place), '★場所の設定はこのPC自身からの要求だけ');
    const get = cad.match(/def handle_parts\(self[\s\S]*?def _tk_pick_folder/)[0];
    ok(!/'search'|'get'/.test(get), '他ソフト向けの search/get は無い');

    // --------------------------------------------------------------
    // --------------------------------------------------------------
    console.log('\n【標準部品2件と非表示機能は無い(2026-10-03)】');
    ok(!/const BUILTIN_PARTS/.test(read('js/data.js')), '標準部品(BUILTIN_PARTS)の定義が無い');
    const page = read('js/parts_page.js'), ui = read('js/ui.js');
    ok(!/BUILTIN_PARTS\./.test(page + ui), 'CAD・部品DB画面とも標準部品を一覧に混ぜない');
    ok(!/function (hideBuiltin|unhideBuiltin|renderHiddenList)/.test(page), '非表示・再表示の機能が無い');

    console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
    process.exit(ng ? 1 : 0);
})();
