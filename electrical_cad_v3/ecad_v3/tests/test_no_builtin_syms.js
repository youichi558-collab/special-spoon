// ================================================================
// 標準シンボル(内蔵20種)を削除したことの確認テスト
//
// 【2026-09-21】盛田さんの指示で、内蔵の標準シンボル20種
// (battery / ac / ground / resistor / capacitor / inductor / diode /
//  sw_no / sw_nc / timer_no / timer_nc / push_no / coil / timer_coil /
//  motor / lamp / fuse / breaker / transformer / terminal)
// を全て削除した。
//
// 削除した理由(盛田さんの言葉):
//   「標準シンボルは全く役に立ってない、そもそも形が存在しないから使えない」
//   「だから標準シンボル使ったことないとずっと前から言ってるんだが」
// 実際、20種とも端子点(terminals)が1つも定義されておらず、部品DBの
// 端子番号割り当ても接点リファレンスも通らなかった。
//
// 代替表示(不明な種別に四角を描く等)は入れないこと。
//   「だからシンボルが図形として使えないのに何を書くんだよ」
//
// 消し残しがあると、パネルから消えているのにDXFには空のBLOCKが出る、
// 帳票だけ古い判定で動く、といった食い違いが起きるので、各ファイルを
// 個別に確認する。
// ================================================================
const fs = require('fs');
let ng = 0;
function ok(cond, msg) { console.log((cond ? '  OK  ' : '  NG  ') + msg); if (!cond) ng++; }
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');

const STD = ['battery','ac','ground','resistor','capacitor','inductor','diode',
  'sw_no','sw_nc','timer_no','timer_nc','push_no','coil','timer_coil','motor',
  'lamp','fuse','breaker','transformer','terminal'];

// ------------------------------------------------------------------
console.log('【js/data.js: DEFS と BUILTIN_SYMS】');
{
  const src = R('js/data.js');
  ok(!/const BUILTIN_SYMS\s*=/.test(src), 'BUILTIN_SYMS の定義が無い');

  const defs = src.match(/const DEFS = \{([\s\S]*?)\n\};/);
  ok(!!defs, 'DEFS の定義は残っている(作図プリミティブ用)');
  const body = defs ? defs[1] : '';
  const keys = [...body.matchAll(/^\s*([a-z_]+)\s*:/gm)].map(m => m[1]);
  STD.forEach(t => ok(!keys.includes(t), `DEFS から ${t} が消えている`));
  ['text','rect','circle','fline'].forEach(t =>
    ok(keys.includes(t), `作図プリミティブ ${t} は DEFS に残っている`));
}

// ------------------------------------------------------------------
console.log('\n【js/symbols.js: drawSym】');
{
  const src = R('js/symbols.js');
  ok(/function drawSym\(/.test(src), 'drawSym 自体は残っている(登録シンボルを描く)');
  ok(src.includes('state.customSymbols.find'), '登録シンボルの描画経路が残っている');
  // 標準シンボルの分岐(type==='xxx')が消えていること
  STD.forEach(t => ok(!new RegExp(`type\\s*===\\s*'${t}'`).test(src),
    `標準シンボル ${t} の描画分岐が無い`));
  // 代替表示を入れていないこと(盛田さんが明確に不要と言っている)。
  // 「---- 標準シンボル ----」以降にコメント以外の描画呼び出しが残っていないか
  // で見る(文言ではなく実際のコードで判定する)。
  const tailSrc = (src.split('---- 標準シンボル ----')[1] || '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(!/ctx\.(stroke|fill|beginPath|arc|moveTo|lineTo|strokeRect|fillText)/.test(tailSrc),
     '未知の種別に代替の図形を描いていない(ctx.restore()して戻るだけ)');
  ok(/ctx\.restore\(\);/.test(tailSrc), 'save()と対で必ずrestore()している');
}

// ------------------------------------------------------------------
console.log('\n【js/ui.js / js/report.js: 種別判定】');
{
  const ui = R('js/ui.js'), rep = R('js/report.js');
  // コメントを除いた実コードに isCoil/isContact が無いこと
  const strip = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/isCoil/.test(strip(ui)),    'ui.js の symTermRole が isCoil を見ていない');
  ok(!/isContact/.test(strip(ui)), 'ui.js の symTermRole が isContact を見ていない');
  ok(!/isCoil/.test(strip(rep)),   'report.js の symRole が isCoil を見ていない');
  ok(!/isContact/.test(strip(rep)),'report.js の symRole が isContact を見ていない');
  ok(/function symTermRole/.test(ui), 'symTermRole は残っている(roleで判定する)');
  ok(/function symRole/.test(rep),    'symRole は残っている(roleで判定する)');
  ok(!/function recordRecentSym/.test(ui), 'recordRecentSym(BUILTIN_SYMS専用)が消えている');
  ok(!/recordRecentSym\(/.test(strip(ui)), 'recordRecentSym の呼び出しも残っていない');
}

// ------------------------------------------------------------------
console.log('\n【js/dxf_export.js: 標準シンボルのBLOCKを出さない】');
{
  const src = R('js/dxf_export.js');
  const strip = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/SYM_NAMES/.test(strip), 'SYM_NAMES が無い');
  ok(!/symDefs/.test(strip),   'symDefs(標準シンボルのBLOCK定義表)が無い');
  ok(/customSyms\.forEach/.test(strip), '登録シンボルのBLOCK出力は残っている');
  // BLOCK_RECORD の件数が *MODEL_SPACE + *PAPER_SPACE + 登録シンボル になっていること。
  // ここがズレるとTrueViewがテーブル構造を追えなくなる(過去に事故あり)。
  ok(/70,\s*2\+customSyms\.length/.test(strip),
     'BLOCK_RECORDの件数が 2+登録シンボル数 に合っている');
}

// ------------------------------------------------------------------
console.log('\n【js/dxf_import.js: ブロックは図形として展開する】');
{
  const src = R('js/dxf_import.js');
  const strip = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/function mapBlock/.test(strip), 'mapBlock(ブロック名→標準シンボル)が無い');
  ok(!/mapBlock\(/.test(strip),        'mapBlock の呼び出しも残っていない');
  // 展開経路(blockDefs)が生きていること。これが無いと取込んだシンボルが消える。
  ok(/blockDefs\.get\(bname\)/.test(strip),
     'INSERTはブロック定義の図形展開で取り込む(座標情報を失わない)');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
