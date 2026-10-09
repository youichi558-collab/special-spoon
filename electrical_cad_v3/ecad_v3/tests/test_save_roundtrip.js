// 実際の図面で「保存 → 開き直す」「バックアップを取る → 戻す」を回し、中身が変わらないかを見る
//   node tests/test_save_roundtrip.js
//
// 【背景・2026-10-09】外部のレビューで「保存・復旧で中身が保たれるかを確かめる」が挙がった。
// 保存・読込の部品(dirty・ID の重複・レイヤーの修復・読込の追加など)ごとのテストはあったが、
// 実際の図面を丸ごと回して比べるテストが無かった。盛田さん「aでいい、進めて」。
//
// 見るもの(開いた直後の状態と、回したあとの状態を丸ごと比べる):
//   ページ(要素・配線・端子・グループ・ガイド・図枠)・図面のシンボル・部品の写し・
//   表題欄様式の写し・レイヤー・線番の規則と書式・保存ファイル名
// 部品表・端子台表・線番表などの帳票は、すべてページの中身から作るので、ページが同じなら同じになる。
//
// 通る道:
//   保存     : saveProject / saveAllProject と同じ _saveData → _saveJSON(ファイルの文字) → JSON.parse → applyProjectData
//   バックアップ: bkBuildData → JSON(ブラウザが送る) → server と同じ tools/backup/backup_store.py で書いて読む → applyProjectData
//              (Python の json で書き直されるので、数値などの形が変わらないかも見る)
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const edit = R('js/edit.js'), backup = R('js/backup.js');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

// ---- アプリの関数を読み込む(画面を描く関数は空にする) ---------------------------------
let seq = 0;
const sb = {
  console, JSON, Object, Array, Set, Math, String, Number,
  genId: p => p + '_rt' + (++seq),
  renderSymFloat() {}, renderPartsAll() {}, renderPageTabs() {}, draw() {}, updateRightPanel() {},
  setTimeout() {},   // 開いたあとの「端子の位置が違う」の知らせ(画面の隅)は出さない
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },   // ブラウザの中の旧シンボルは無い
  LAYERS: [], DEFS: {},
};
vm.createContext(sb);
vm.runInContext(R('js/sym_store.js'), sb);   // usedSymbolsForSave・setDrawingSymbols・rebuildSymbolPalette(シンボルの倍率合わせも)
vm.runInContext([
  /function _syncCurrentPage\(\)[\s\S]*?\n\}/, /function usedPartsForSave\([\s\S]*?\n\}/, /function usedTitleBlockTplsForSave\([\s\S]*?\n\}/,
  /function _mergeOrSetCustomParts\([\s\S]*?\n\}/, /function stripLegacyColors\([\s\S]*?\n\}/, /function repairLayers\([\s\S]*?\n\}/,
  /function removeZeroLengthWires\([\s\S]*?\n\}/, /function dedupeIds\([\s\S]*?\n\}/, /function pruneGroups\([\s\S]*?\n\}/,
  /function _legacyProjectPages\([\s\S]*?\n\}/, /function _saveJSON\([^\n]*/, /function _saveData\([\s\S]*?\n\}/,
  /function applyProjectData\([\s\S]*?\n\}/,
].map(re => pick(edit, re)).join('\n'), sb);
vm.runInContext(pick(backup, /function bkBuildData\(\)[\s\S]*?\n\}/), sb);

function freshState() {
  sb.LAYERS.length = 0;
  sb.DEFS = {};
  sb.state = {
    pages: [{ name: 'Sheet1', elements: [], wires: [], groups: [], guides: [], frameObj: null }], currentPage: 0,
    customSymbols: [], customParts: [], wireNoRule: 'W001', wireNoFmt: { pageDigits: 0, seqDigits: 2 }, saveFileName: '',
    sel: { els: new Set(), wires: new Set() },
    get page() { return this.pages[this.currentPage]; },
    get elements() { return this.page.elements; }, get wires() { return this.page.wires; }, get frameObj() { return this.page.frameObj; },
  };
}
// 開いたファイルを、アプリと同じ道で画面(state)に入れる
function open(data) { freshState(); return sb.applyProjectData(JSON.parse(JSON.stringify(data))); }
// 比べる中身。未保存の印(dirty)は「開いた直後は付かない」を別に見るので、ここでは比べない。
// シンボルは図面で使っているものの定義だけ比べる。図面に入れるのは使っているシンボルだけ(2026-10-03 段階3・usedSymbolsForSave)なので、
// 10-03 より前の図面が持っていた使っていない写しは、保存すると落ちる(決めたとおり。下で「落ちるのは使っていないものだけ」を別に見る)
const usedTypes = s => new Set(s.pages.flatMap(pg => pg.elements.map(e => e.type)));
function snap() {
  const s = sb.state, used = usedTypes(s);
  return JSON.parse(JSON.stringify({
    pages: s.pages.map(({ dirty, ...pg }) => pg), customSymbols: s.customSymbols.filter(x => used.has(x.type)), customParts: s.customParts,
    drawingTbTpls: s.drawingTbTpls, layers: sb.LAYERS, wireNoRule: s.wireNoRule, wireNoFmt: s.wireNoFmt, saveFileName: s.saveFileName,
  }));
}
// 違うときに、どこが違うかを1か所だけ出す(全部出すと読めない)
function firstDiff(a, b, p) {
  p = p || '';
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], p + '.' + k); if (d) return d; }
  }
  return `${p || '(全体)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`.slice(0, 300);
}
// same(回したあと, 開いた直後)。違いは「開いた直後 → 回したあと」の向きで出す
function same(after, before, msg) { const d = firstDiff(before, after); ok(!d, msg + (d ? `\n       違い(前 → 後) ${d}` : '')); }
const counts = s => s.pages.map(pg => ({
  name: pg.name, el: pg.elements.length, w: pg.wires.length, g: (pg.groups || []).length,
  term: pg.elements.filter(e => e.terminals != null && String(e.terminals) !== '').length,   // 端子番号の欄(文字)が入っている要素の数
}));

// バックアップを、server と同じ backup_store.py で書いて読み戻す
function findPython() {
  for (const cmd of ['py', 'python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'print(1)'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}
function throughBackupStore(data) {
  const py = findPython();
  if (!py) throw new Error('Pythonが見つからず、バックアップの書き読みを試せません');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecad_rt_'));
  try {
    const code = [
      'import json, sys',
      'sys.path.insert(0, sys.argv[1])',
      'import backup_store',
      'p = json.loads(sys.stdin.buffer.read().decode("utf-8"))',
      'st = backup_store.BackupStore(sys.argv[2])',
      'r = st.save(p["data"], name=p["name"], keep=30)',
      'assert r.get("ok"), r',
      'g = st.get(st.list()["files"][0]["name"])',
      'assert g.get("ok"), g',
      'sys.stdout.buffer.write(json.dumps(g["data"], ensure_ascii=False).encode("utf-8"))',
    ].join('\n');
    // ブラウザが送るのと同じ形({ name, keep, data } を JSON で)
    const body = JSON.stringify({ name: sb.state.saveFileName || '図面', keep: 30, data });
    const r = spawnSync(py, ['-c', code, path.join(ROOT, 'tools', 'backup'), dir], { input: Buffer.from(body, 'utf8'), maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error('backup_store で失敗: ' + String(r.stderr));
    return JSON.parse(r.stdout.toString('utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 盛田さんの実際の図面で回す ----------------------------------------------------
const DRAWINGS = fs.readdirSync(path.join(ROOT, 'drawings')).filter(f => /\.(json|seqzu)$/i.test(f)).sort();
ok(DRAWINGS.length > 0, `drawings/ に図面がある(${DRAWINGS.join('、')})`);

for (const f of DRAWINGS) {
  console.log(`\n【${f}】`);
  const file = JSON.parse(R('drawings/' + f));
  open(file);
  const s0 = snap();
  const c0 = counts(sb.state);
  console.log('  開いた直後:', c0.map(c => `${c.name} 要素${c.el} 配線${c.w} 端子番号の入った要素${c.term} グループ${c.g}`).join(' / '),
    `・シンボル${s0.customSymbols.length} 部品の写し${s0.customParts.length} レイヤー${s0.layers.length}`);
  ok(c0.some(c => c.el > 0 && c.w > 0), '図面に要素と配線がある(空の図面で比べても意味がない)');
  ok(sb.state.pages.every(p => p.dirty === false), '開いた直後は未保存の印(●)が付かない');

  // 1) 保存 → 開き直す
  {
    const text1 = sb._saveJSON(sb._saveData(sb.state.pages, sb.state.saveFileName));
    open(JSON.parse(text1));
    same(snap(), s0, '保存して開き直すと、中身がすべて同じ');
    ok(JSON.stringify(counts(sb.state)) === JSON.stringify(c0), '要素・配線・端子番号の入った要素・グループの数が同じ');
    ok(sb.state.pages.every(p => p.dirty === false), '開き直した直後も未保存の印が付かない');
    const text2 = sb._saveJSON(sb._saveData(sb.state.pages, sb.state.saveFileName));
    ok(text1 === text2, 'もう一度保存すると、ファイルの文字がまったく同じ(保存のたびに中身がずれていかない)');
    ok(!/"dirty":\s*true/.test(text1) && !/"_src"/.test(text1), 'ファイルに未保存の印・開いたファイルの道筋が入らない');
    const used = usedTypes(sb.state), saved = JSON.parse(text1).customSymbols.map(x => x.type);
    const dropped = (file.customSymbols || []).map(x => x.type).filter(t => !saved.includes(t));
    ok(dropped.every(t => !used.has(t)) && (file.customSymbols || []).filter(x => used.has(x.type)).every(x => saved.includes(x.type)),
      `ファイルのシンボルの写しで保存から落ちるのは、図面で使っていないものだけ(落ちたもの ${dropped.length} 個)`);
  }

  // 2) 全ページ保存(saveAllProject と同じ渡し方)→ 開き直す
  {
    open(file);
    const text = sb._saveJSON(sb._saveData(sb.state.pages, sb.state.saveFileName));
    open(JSON.parse(text));
    open(JSON.parse(sb._saveJSON(sb._saveData(sb.state.pages, sb.state.saveFileName))));
    same(snap(), s0, '保存と開き直しを2回くり返しても、中身がすべて同じ');
  }

  // 3) バックアップを取る → 戻す
  {
    open(file);
    const sent = JSON.parse(JSON.stringify(sb.bkBuildData()));   // ブラウザが送る中身
    const back = throughBackupStore(sent);
    same(back, sent, 'バックアップのファイルに書いて読み戻しても、送った中身と同じ(Python で書き直しても数値などが変わらない)');
    open(back);
    same(snap(), s0, 'バックアップから戻すと、中身がすべて同じ');
    ok(sb.state.pages.every(p => p.dirty === false), '戻した直後は未保存の印が付かない');
  }
}

// ---- 読み込み時の修復が入ったあとも、回して変わらないこと ---------------------------------
// (修復は1回目の読込で済み、保存したものを開き直しても、もう一度何かが変わることはない)
console.log('\n【修復が入る図面(ID の重複・長さ0の配線・消えたレイヤー)】');
{
  const file = {
    version: 2, saveFileName: '修復', wireNoRule: 'W001',
    layers: [{ name: '回路', color: '#fff', visible: true }],
    pages: [{
      name: 'A',
      elements: [{ id: 'e1', type: 'k', x: 0, y: 0, layer: '回路' }, { id: 'e1', type: 'k', x: 20, y: 0, layer: '無いレイヤー', color: '#f00' }],
      wires: [{ id: 'w1', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, { id: 'w2', pts: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }],
      groups: [{ id: 'g1', elIds: ['e1'] }], guides: [],
    }],
  };
  const r = open(file);
  ok(r.fixedIds >= 1 && r.zeroWires === 1, `1回目の読込で修復が入る(ID ${r.fixedIds} 件・長さ0の配線 ${r.zeroWires} 本)`);
  const s0 = snap();
  const r2 = open(JSON.parse(sb._saveJSON(sb._saveData(sb.state.pages, sb.state.saveFileName))));
  ok(r2.fixedIds === 0 && r2.zeroWires === 0, '保存して開き直すと、もう修復は入らない');
  same(snap(), s0, '修復したあとの中身のまま変わらない');
}

console.log(ng ? `\nNG ${ng} 件` : '\nすべて OK');
process.exit(ng ? 1 : 0);
