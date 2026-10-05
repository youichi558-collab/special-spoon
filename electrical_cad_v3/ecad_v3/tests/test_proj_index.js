// プロジェクト台帳(2026-10-04 js/proj_index.js。設計は HANDOFF「1-1」、盛田さん承認)
//   node tests/test_proj_index.js
// このテストが守るもの:
//   1. 1ページ分の中身(ページ・デバイス・デバイス未設定・端子台の端子・線番・矢印)を盛田さんの図面(Sheet3)から抜き出せる。
//      数は今の帳票(端子台表 buildTerminalBlockRows・線番 groupWiresByNet)と同じ
//   2. 変わったファイルだけ読み直す(更新日時・サイズ)。一覧から外れたファイルは消す。読めないファイルは記録して続ける
//   3. 台帳を作っても開いている図面(state)は元のまま
//   4. 対象はプロジェクトのフォルダ(左パネルのツリーの根)の図面(.seqzu)全部。台帳もそこに作る(2026-10-05)
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ng++; console.log('  NG', m, '期待', JSON.stringify(b), '実際', JSON.stringify(a)); } else console.log('  OK', m); };
const ok = (c, m) => eq(!!c, true, m);
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');

const DEFS = {};
const sb = { console, DEFS, pushH() {}, draw() {}, window: {}, document: { getElementById: () => null }, stToast() {},
  escH: require('./_esch.js').escH, getDef: t => DEFS[t] || null };
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
vm.runInContext(R('js/devices.js'), sb);
vm.runInContext(R('js/xref_project.js') + '\nthis.xprojState = xprojState; this.xprojBase = xprojBase; this.xprojPages = xprojPages;', sb);
vm.runInContext(R('js/proj_index.js') + '\nthis.pidxState = pidxState;', sb);

const sheet3Text = R('drawings/仕様２1002_Sheet3.json');
const sheet3 = JSON.parse(sheet3Text);
const openPage = { name: '開いている', elements: [{ id: 'mine', type: 'x', partRef: 'Z9' }], wires: [] };
sb.state = { pages: [openPage], currentPage: 0, customSymbols: [], customParts: [] };

console.log('【Sheet3 から1ページ分を抜き出す】');
const recs = sb.pidxExtractFile('仕様２1002_Sheet3.json', sheet3);
const pg = recs[0];
{
  eq(recs.length, 1, '1ページ');
  eq(pg.name, sheet3.pages[0].name, 'ページ名');
  const fr = sheet3.pages[0].frameObj || {};
  eq([pg.pno, pg.drawno, pg.title, pg.rev], [fr.page || '', fr.drawno || '', fr.title || '', fr.rev || ''].map(s => String(s).trim()), '表題欄のページ番号・図面番号・図面名称・改訂');
  eq(sb.state.pages, [openPage], '★抜き出したあと、開いている図面は元のまま');
  ok(Object.keys(DEFS).length === 0, '★別ファイルのシンボル定義を残さない');

  // 今の帳票と同じ数になること(同じ図面を開いているときの値と比べる)
  const syms = sheet3.customSymbols || [];
  syms.forEach(s => { DEFS[s.type] = s; });
  sb.state = { pages: sheet3.pages.map(p => Object.assign({}, p, { _file: '仕様２1002_Sheet3', _pno: 1 })), currentPage: 0, customSymbols: syms, customParts: [] };
  const tbRows = sb.buildTerminalBlockRows();
  eq(pg.terms.length, tbRows.length, `端子台の端子の数は端子台表と同じ(${tbRows.length})`);
  const byId = (a, b) => String(a[0]).localeCompare(String(b[0]));
  eq(pg.terms.map(t => [t.id, t.no, t.conns.slice().sort()]).sort(byId), tbRows.map(r => [r.el.id, r.termNo === '-' ? '' : r.termNo, r.conns.slice().sort()]).sort(byId),
     '★端子ごとの番号・つながる線番が端子台表と同じ');
  const nets = sb.groupWiresByNet(sheet3.pages[0].wires, null, sheet3.pages[0].elements);
  eq(pg.nets.length, nets.length, `ネットの数(${nets.length})`);
  eq(pg.nets.filter(n => !n.no).length, nets.filter(g => !g.some(i => sheet3.pages[0].wires[i].wireNo)).length, '未採番のネットの数');
  const led = sb.deviceLedger();
  const refs = new Set(pg.devs.map(d => sb.devKey(d.ref)).concat(pg.groups.map(g => sb.devKey(g.ref))));
  eq([...refs].sort(), [...led.keys()].sort(), '★デバイスはデバイス台帳(deviceLedger)と同じ');
  const cr1 = pg.devs.filter(d => d.ref === 'CR1');
  ok(cr1.length && cr1.every(d => d.loc && d.sym && d.role !== undefined), 'デバイスの記号は位置・記号の名前・役割を持つ');
  ok(pg.devs.some(d => d.f.partModel), '型番などの値(f)が入っている');
  Object.keys(DEFS).forEach(k => delete DEFS[k]);
  sb.state = { pages: [openPage], currentPage: 0, customSymbols: [], customParts: [] };
  const kb = Buffer.byteLength(JSON.stringify(pg)) / 1024;
  console.log(`  (参考) Sheet3 1ページの台帳 ${kb.toFixed(1)}KB`);
}

console.log('\n【矢印・デバイス未設定・グループ(作った図面)】');
{
  DEFS.out = { type: 'out', role: 'sig_out', w: 10, h: 10 };
  const d = { customSymbols: [{ type: 'out', role: 'sig_out', terminals: [{ x: 0, y: 0, label: '' }] }], pages: [{ name: 'S1', frameObj: { page: '7', drawno: 'D-1', title: '制御', rev: 'B' },
    elements: [{ id: 'a1', type: 'out', x: 100, y: 0, label: 'X1' }, { id: 'l1', type: 'lamp', x: 0, y: 50, partModel: 'APN' }],
    wires: [{ id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0, wireNo: '101' }], groups: [{ id: 'g1', partRef: 'MC1', partModel: 'S-T10' }] }] };
  delete DEFS.out;
  const p = sb.pidxExtractFile('A.json', d)[0];
  eq([p.pno, p.drawno, p.title, p.rev], ['7', 'D-1', '制御', 'B'], '表題欄の値');
  eq(p.arrows.map(a => [a.label, a.out, a.no]), [['X1', true, '101']], '★矢印は名前・送り/受け・触れている線の線番(そのファイルのシンボル定義で役割を読む)');
  eq(p.noRef.map(n => [n.type, n.f.partModel]), [['lamp', 'APN']], 'デバイス未設定の記号');
  eq(p.groups.map(g => [g.ref, g.f.partModel]), [['MC1', 'S-T10']], '外形図のグループのデバイス');
  eq(p.devs.length, 0, '矢印はデバイスに入れない');
  ok(!('out' in DEFS), 'シンボル定義を元に戻す');
}

// ---- フォルダ(ブラウザのフォルダの鍵)の作り物 ----
function fakeDir(files) {
  const reads = [];
  const dir = {
    name: 'proj', files, reads,
    async getFileHandle(name, opt) {
      if (!(name in files)) { if (opt && opt.create) files[name] = { text: '', lastModified: 0 }; else throw new Error('NotFound'); }
      return {
        name,
        async getFile() { const f = files[name]; return { lastModified: f.lastModified, size: Buffer.byteLength(f.text), async text() { if (name !== 'project.seqzuidx') reads.push(name); return f.text; } }; },
        async createWritable() { let buf = ''; return { async write(s) { buf += s; }, async close() { files[name] = { text: buf, lastModified: Date.now() }; } }; },
      };
    },
  };
  return dir;
}

console.log('\n【変わったファイルだけ読み直す】');
(async () => {
  const small = JSON.stringify({ pages: [{ name: 'P2', elements: [{ id: 'c', type: 'x', partRef: 'CR5' }], wires: [] }] });
  const dir = fakeDir({ 'Sheet3.json': { text: sheet3Text, lastModified: 1000 }, 'P2.json': { text: small, lastModified: 1000 }, 'bad.json': { text: '{壊れ', lastModified: 1000 } });
  let r = await sb.pidxUpdate(dir, ['Sheet3.json', 'P2.json', 'bad.json']);
  eq(r.read, 3, '最初は全部読む');
  ok('project.seqzuidx' in dir.files, '★台帳ファイルをフォルダに書く');
  const saved = JSON.parse(dir.files['project.seqzuidx'].text);
  eq(Object.keys(saved.files).sort(), ['P2.json', 'Sheet3.json', 'bad.json'], '台帳にファイルごとの記録');
  ok(saved.files['bad.json'].error && r.problems.length === 1, '読めないファイルは印を付けて、ほかは続ける');
  eq(saved.files['P2.json'].pages[0].devs.map(x => x.ref), ['CR5'], 'P2 のデバイス');

  dir.reads.length = 0;
  const before = dir.files['project.seqzuidx'].text;
  r = await sb.pidxUpdate(dir, ['Sheet3.json', 'P2.json', 'bad.json']);
  eq([r.read - 1, dir.reads], [0, ['bad.json']], '★変わっていなければ読まない(読めなかったファイルだけ読み直す)');

  dir.files['P2.json'] = { text: small.replace('CR5', 'CR6'), lastModified: 2000 };
  dir.reads.length = 0;
  r = await sb.pidxUpdate(dir, ['Sheet3.json', 'P2.json']);
  eq(dir.reads, ['P2.json'], '★変わったファイル(更新日時)だけ読み直す');
  const s2 = JSON.parse(dir.files['project.seqzuidx'].text);
  eq(s2.files['P2.json'].pages[0].devs.map(x => x.ref), ['CR6'], '読み直した中身になる');
  eq(Object.keys(s2.files).sort(), ['P2.json', 'Sheet3.json'], '★一覧から外れたファイルは台帳から消す');
  eq(JSON.stringify(s2.files['Sheet3.json']), JSON.stringify(JSON.parse(before).files['Sheet3.json']), '読み直さなかったファイルの記録はそのまま');

  // 既に読んだ中身(参照図面の読み直し)があれば使う
  dir.files['P2.json'] = { text: small, lastModified: 3000 };
  dir.reads.length = 0;
  await sb.pidxUpdate(dir, ['Sheet3.json', 'P2.json'], new Map([['P2.json', { lastModified: 3000, size: Buffer.byteLength(small), data: JSON.parse(small) }]]));
  eq(dir.reads, [], '★参照図面で読んだ中身を使い、もう一度読まない');

  // 抜き出し方が古い台帳・壊れた台帳は作り直す
  dir.files['project.seqzuidx'] = { text: JSON.stringify({ version: 0, files: {} }), lastModified: 1 };
  dir.reads.length = 0;
  await sb.pidxUpdate(dir, ['Sheet3.json', 'P2.json']);
  eq(dir.reads.sort(), ['P2.json', 'Sheet3.json'], '★版の違う台帳は全部読み直す');

  console.log('\n【プロジェクトのフォルダ(ツリーの根)の図面を全部・サブフォルダも(2026-10-05)】');
  // 入れ子のフォルダの作り物: { 名前: {text,lastModified}(ファイル) | { sub: {...} }(フォルダ) }
  const reads2 = [];
  const ND = (name, tree) => ({
    kind: 'directory', name,
    async *entries() { for (const [n, v] of Object.entries(tree)) yield [n, v.sub ? ND(n, v.sub) : { kind: 'file', name: n }]; },
    async getDirectoryHandle(n) { if (!tree[n] || !tree[n].sub) throw new Error('NotFound'); return ND(n, tree[n].sub); },
    async getFileHandle(n, opt) {
      if (!tree[n]) { if (opt && opt.create) tree[n] = { text: '', lastModified: 0 }; else throw new Error('NotFound ' + n); }
      const f = tree[n];
      return { name: n, async getFile() { return { lastModified: f.lastModified, size: Buffer.byteLength(f.text), async text() { reads2.push(n); return f.text; } }; },
        async createWritable() { let buf = ''; return { async write(x) { buf += x; }, async close() { f.text = buf; f.lastModified = Date.now(); } }; } };
    },
  });
  const t2 = { 'P2.seqzu': { text: small, lastModified: 5 }, '古い.json': { text: small, lastModified: 5 }, 'ecad_project.json': { text: '{}', lastModified: 1 },
    '盤外': { sub: { 'S1.seqzu': { text: small.replace('CR5', 'CR7'), lastModified: 5 } } } };
  const dir2 = ND('案件', t2);
  sb.xprojDirHandle = async () => dir2;
  eq(await sb.xprojReadList(dir2), ['P2.seqzu', '盤外/S1.seqzu'], '★対象はフォルダの図面(.seqzu)全部・サブフォルダも(.json・一覧ファイルは対象外)');
  await sb.xprojReload();
  eq(sb.xprojState.files.map(f => f.name), ['P2.seqzu', '盤外/S1.seqzu'], '「更新」(xprojReload)でフォルダの図面を読む');
  ok('project.seqzuidx' in t2, '★台帳はフォルダ(ツリーの根)に作る');
  const idx2 = JSON.parse(t2['project.seqzuidx'].text);
  eq(Object.keys(idx2.files).sort(), ['P2.seqzu', '盤外/S1.seqzu'], '台帳もサブフォルダの図面を道筋で持つ');
  eq(idx2.files['盤外/S1.seqzu'].pages[0].devs[0].loc, '盤外/S1/1', '位置は道筋(拡張子なし)/ページ');
  eq(reads2.filter(n => n.endsWith('.seqzu')).length, 2, '図面は1回だけ読む(参照図面の計算と台帳で読んだ中身を共用)');
  ok(!('data' in sb.xprojState.files[0]), '参照図面の状態に読んだ中身の丸ごとを残さない');
  sb.state.pages = [{ name: 'P', _src: '/盤外/S1.seqzu', elements: [], wires: [] }];
  eq(sb.xprojPages().map(e => e.f.name), ['P2.seqzu'], '★ツリーから開いているファイルは別ファイルとして数えない(二重に数えない)');
  sb.state.pages = [openPage];
  sb.xprojDirHandle = async () => null;
  await sb.xprojReload();
  eq(sb.xprojState.files.length, 0, 'フォルダを開いていなければ別ファイルは無し');
  ok(!/xprojSetup|rb-xproj/.test(R('index.html') + R('js/xref_project.js')), '★「参照図面」ボタンと選ぶ窓は無い');
  eq(sb.xprojBase('A.seqzu') + '|' + sb.xprojBase('B.json'), 'A|B', 'ファイル名から拡張子(.seqzu・.json)を外す');
  eq(sb.pidxExtractFile('C.seqzu', { pages: [{ name: 'X', elements: [{ id: 'q', type: 'x', partRef: 'K1', x: 0, y: 0 }], wires: [] }] })[0].devs[0].loc, 'C/1', '.seqzu の図面も位置はファイル名(拡張子なし)');

  console.log('\n【図面の拡張子 .seqzu(2026-10-04)】');
  const E = R('js/edit.js');
  ok(/fname0 \+ '\.seqzu'/.test(E) && /base0 \+ '_all\.seqzu'/.test(E), '★保存・全ページ保存は .seqzu');
  ok(/replace\(\/\\\.\(seqzu\|json\)\$\/i, ''\)/.test(E), '保存の窓で選んだ名前から .seqzu(.json)を外す');
  ok(/id="load-in" accept="\.seqzu,\.json"/.test(R('index.html')), '★読込は .seqzu と以前の .json');
  ok(/seqzu: \['図面データ', 'application\/x-seqzu'\]/.test(R('js/settings.js')), '保存の窓のファイルの種類は「図面データ(.seqzu)」');
  ok(/pidxAfterSave\(\)/.test(R('js/edit.js')), '保存のあとに台帳を更新する');
  ok(/<script src="js\/proj_index.js"><\/script>/.test(R('index.html')), 'index.html で読み込む');

  console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
  process.exit(ng ? 1 : 0);
})().catch(e => { console.log('例外', e); process.exit(1); });
