// 全体レビュー(2026-09-29)で見つけた3件の回帰テスト
//   1) 保留CSVの一括登録が、備考に「型番」を含む行を見出しと誤認して捨てない
//   2) バックアップの「開く」が、図面名に ' があっても動く
//   3) backup/ を作れなくても、本当のエラー文が返る(UnboundLocalErrorにならない)
const fs = require('fs'), vm = require('vm'), cp = require('child_process');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const pick = (src, re) => { const m = src.match(re); if (!m) throw new Error('見つかりません: ' + re); return m[0]; };

// 1) bulkImportParts の実コードを動かす
{
  const src = R('js/parts_page.js');
  const els = { 'pp-csv': { value: '' } };
  const sb = { console, state: { customParts: [] }, PART_TYPE_CODES: ['option'], LEGACY_PART_TYPES: {},
    $: id => els[id], renderAll() {}, saveAll: async () => true, alert() {} };
  vm.createContext(sb);
  vm.runInContext(pick(src, /function parseCSVLine\([\s\S]*?\n\}/) + pick(src, /function carryOutlineDxf\([\s\S]*?\n\}/)
    + pick(src, /async function bulkImportParts\([\s\S]*?\n\}/), sb);
  els['pp-csv'].value = [
    'メーカー,型番,種別,定格電圧,定格電流,端子番号,接点構成,備考',
    '三菱電機,UT-RR,option,-,-,-,-,末尾の□で区別(型番の注文仕様確認)',
    'オムロン,MY2N,option,,,,,通常行',
  ].join('\n');
  sb.bulkImportParts().then(() => {
    const refs = sb.state.customParts.map(p => p.ref);
    ok(refs.includes('UT-RR'), '備考に「型番」を含む行(UT-RR)が登録される');
    ok(refs.includes('MY2N') && refs.length === 2, '見出し行だけが飛ばされる');
    if (ng) process.exit(1);
  });
}
// 2) 属性に名前を直接埋めていない
{
  const s = R('js/backup.js');
  ok(!/bkRestore\('\$\{/.test(s), "bkRestore に名前を文字列リテラルで埋めていない");
  ok(/data-name="\$\{escH\(f\.name\)\}"[^>]*bkRestore\(this\.dataset\.name\)/.test(s), 'data属性経由で渡している');
}
// 3) backup_store
{
  const py = `
import sys, os
sys.path.insert(0, ${JSON.stringify(__dirname + '/../tools/backup')})
import backup_store
def boom(*a, **k): raise PermissionError('cannot create dir')
os.makedirs = boom
r = backup_store.BackupStore('/nonexistent_dir_x/bk').save({'pages':[{'elements':[1]}]}, name='x')
print(r.get('ok'), r.get('error'))
`;
  let out = '';
  for (const c of ['py', 'python3', 'python']) {
    const r = cp.spawnSync(c, ['-c', py], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { out = r.stdout.trim(); break; }
  }
  ok(out.startsWith('False') && out.includes('cannot create dir'), 'makedirs失敗で本当のエラー文が返る: ' + out);
}
if (ng) process.exit(1);
