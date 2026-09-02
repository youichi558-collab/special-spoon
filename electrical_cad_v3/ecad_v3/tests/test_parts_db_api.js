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
// このテストが守るのは主に2つ:
//   1. 控えの送信が「保存できたとき」だけ起きること
//      (保存に失敗しているのに控えだけ新しくなると、他ソフトが
//       「保存されている」と誤解する。今年ここで繰り返した事故と同じ形)
//   2. 公開経路に書き込み手段が無いこと
//      (parts_db.json の書き手はCAD1つに保つ。2つになると、
//       どちらかの書き込みが黙って失われる)

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

// ------------------------------------------------------------------
// 1. 控えの送信は「ファイルに書けたとき」だけ
//
// js/parts_db.js の writeNow() を実際に動かす。ソースの見た目ではなく挙動で見る。
// ------------------------------------------------------------------
console.log('【控えの送信は保存に成功したときだけ】');
{
  // writeNow() の中身だけを取り出して動かす。IIFE全体を評価するのは
  // indexedDB や document への依存が多く、テストの本題から離れるため。
  const src = read('js/parts_db.js');
  const start = src.indexOf('  async function writeNow() {');
  ok(start >= 0, 'writeNow() をソースから取り出せる');
  const end = src.indexOf('\n  }\n', start) + 4;
  const body = src.slice(start, end);

  // writeNow が使う周辺を最小限だけ用意する
  function makeEnv({ writeThrows = false, permission = true, locked = false } = {}) {
    const calls = { mirror: 0, written: 0 };
    const env = {
      fileHandle: {
        name: 'parts_db.json',
        createWritable: async () => {
          if (writeThrows) throw new Error('書けません');
          return { write: async () => { calls.written++; }, close: async () => {} };
        },
      },
      saveLocked: locked,
      lastGoodCount: 3,
      state: { customParts: [{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }], hiddenBuiltinRefs: [] },
      ensurePermission: async () => permission,
      isSuspiciousDrop: () => false,
      setStatus: () => {},
      lockSaving: () => { env.saveLocked = true; },
      pushMirror: () => { calls.mirror++; },
      calls,
    };
    return env;
  }

  async function run(env) {
    // 関数本体を env のスコープで組み立てて呼ぶ
    const names = ['fileHandle', 'saveLocked', 'lastGoodCount', 'state',
                   'ensurePermission', 'isSuspiciousDrop', 'setStatus',
                   'lockSaving', 'pushMirror'];
    const fn = new Function(...names, `${body}; return writeNow();`);
    return await fn(...names.map(n => env[n]));
  }

  (async () => {
    let env = makeEnv();
    let r = await run(env);
    eq(r, true, '正常に書けたら true');
    eq(env.calls.written, 1, 'ファイルに書いている');
    eq(env.calls.mirror, 1, '書けたときは控えを送る');

    env = makeEnv({ writeThrows: true });
    r = await run(env);
    eq(r, false, '書き込みが失敗したら false');
    eq(env.calls.mirror, 0, '★書き込みが失敗したら控えを送らない');

    env = makeEnv({ permission: false });
    r = await run(env);
    eq(r, false, '書込み許可が無ければ false');
    eq(env.calls.mirror, 0, '★許可が無いときは控えを送らない');

    env = makeEnv({ locked: true });
    r = await run(env);
    eq(r, false, '保存ロック中は false');
    eq(env.calls.mirror, 0, '★ロック中は控えを送らない');

    // --------------------------------------------------------------
    console.log('\n【控えの送信が保存の成否を左右しない】');
    // 控えが送れないことと、部品DBが保存できていないことは別の話。
    // pushMirror が失敗しても writeNow は true を返さなければならない
    // (ここが逆になると、サーバーを立てずにCADを開いている人の部品DBが
    //  「保存できていない」扱いになって赤い帯が出続ける)。
    // (a) 控えの送信が終わるのを writeNow が待たない。
    //     待つ実装だと、サーバーが落ちている環境でタイムアウトするまで
    //     「保存できた」の返答が遅れる。
    env = makeEnv();
    let settled = false;
    env.pushMirror = async () => { await new Promise(() => {}); settled = true; };
    // await を付けた実装だと writeNow が永久に返らない。
    // そのまま await するとテスト全体が終わらず、Nodeが終了コード0で
    // 抜けてしまう(= 落ちたことにならない)ので、必ず時間で打ち切る。
    r = await Promise.race([run(env),
                            new Promise(res => setTimeout(() => res('TIMEOUT'), 300))]);
    eq(r, true, '★控えの送信を待たずに「保存できた」を返す(TIMEOUTならawaitしている)');
    eq(settled, false, '控えの送信はまだ終わっていない');

    // (b) 控えの送信が失敗しても、保存の成否は覆らない。
    env = makeEnv();
    env.pushMirror = async () => { throw new Error('サーバーがいません'); };
    r = await run(env);
    eq(r, true, '控えが送れなくても「保存できた」を返す');
    eq(env.saveLocked, false, '控えの失敗で自動保存をロックしない');

    // (b') 控えの送信を try/catch の外で呼ぶ。
    //      今の pushMirror は async なので、中に置いても失敗は
    //      rejected promise になるだけで catch には落ちない
    //      (= 上の (b) は中に置いても通ってしまう)。
    //      ただし将来 pushMirror が同期関数になったり await を付けたりすると、
    //      控えが送れないだけで lockSaving() が走り、ファイルには書けているのに
    //      「保存できませんでした」の赤い帯が出るようになる。
    //      挙動では差が出ない不変条件なので、ここだけ構造で見る。
    const wn = body;
    const catchEnd = wn.indexOf('return false;\n    }');
    ok(catchEnd > 0, 'writeNow の catch 節が見つかる');
    ok(wn.indexOf('pushMirror()') > catchEnd,
       '★控えの送信は try/catch を抜けた後で呼ぶ');

    // (c) 実物の pushMirror は、通信に失敗しても投げずに false を返す。
    {
      const src2 = read('js/parts_db.js');
      const st = src2.indexOf('  async function pushMirror() {');
      const en = src2.indexOf('\n  }\n', st) + 4;
      const fn = new Function('state', 'fetch', 'mirrorState',
        `${src2.slice(st, en)}; return pushMirror();`);
      const ms = { at: null, ok: true, count: 0, error: '' };
      let bad = false;
      const out = await fn({ customParts: [], hiddenBuiltinRefs: [] },
                           async () => { throw new Error('接続できません'); }, ms)
        .catch(() => { bad = true; });
      ok(!bad, '★通信に失敗しても pushMirror は例外を投げない');
      eq(out, false, '通信に失敗したら false を返す');
    }

    // --------------------------------------------------------------
    console.log('\n【公開経路に書き込み手段が無い】');
    const lib = read('tools/parts_db/parts_db.py');
    const srv = read('tools/parts_db/parts_db_server.py');
    const cad = read('server.py');

    // parts_db.py が書きモードで open するのは、設定ファイルと控えの2つだけ。
    // parts_db.json 本体(= resolve() が返すパス)は read でしか開かない。
    // コメント行は除いてから見る(説明文に 'w' が出てくるため)。
    const libCode = lib.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    const writeOpens = [...libCode.matchAll(/open\(\s*([A-Za-z_][\w.()\[\] +]*?)\s*,\s*'w'/g)]
      .map(m => m[1]);
    eq(writeOpens.length, 2, '書きモードで open するのは2箇所だけ');
    ok(writeOpens.some(v => /config_path/.test(v)), '1つ目は設定ファイル');
    ok(writeOpens.some(v => /tmp/.test(v)), '2つ目は控え(tmp経由で置き換え)');

    // resolve() が返した実ファイルへ書く経路が無いこと。
    // load() は open(path) を読みモードでしか呼ばない。
    ok(!/open\(\s*path\s*,\s*['"][wa]/.test(libCode),
       '★ resolve() が返したパス(parts_db.json)を書き・追記モードで開かない');
    ok(!/os\.remove|shutil\.|\.unlink\(/.test(libCode),
       'parts_db.py にファイルを消す経路が無い');

    // 独立サーバーは POST/PUT/DELETE/PATCH を 405 で拒む
    ok(/do_PUT\s*=\s*do_DELETE\s*=\s*do_PATCH\s*=\s*do_POST/.test(srv),
       'POST以外の書き込みメソッドもまとめて塞いである');
    ok(/405/.test(srv), '書き込みは405で返す(実装漏れではないと分かる形)');

    // server.py の /api/parts/ に控え以外の書き込み経路が無い
    const partsPost = cad.match(/def do_POST[\s\S]*?self\.send_error\(404\)/)[0];
    const partsRoutes = [...partsPost.matchAll(/'(\/api\/parts\/[a-z]+)'/g)].map(m => m[1]);
    eq(partsRoutes, ['/api/parts/mirror'], 'POSTで受けるのは控えの受け取りだけ');

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
}
