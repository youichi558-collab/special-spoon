// 帳票の確認で見つかった不具合の修正(2026-09-29)。各項目は修正前のコードでは落ちる。
//   node tests/test_report_fixes_0929.js
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8').replace(/\r\n/g, '\n');
const escH = require('./_esch.js').escH;

const stub = () => ({ innerHTML: '', textContent: '', style: {}, onclick: null, classList: { add() {}, remove() {} } });
const domEls = {}; ['report-tabs', 'report-title', 'report-body', 'report-csv-btn'].forEach(id => { domEls[id] = stub(); });
const sb = { console, escH, window: {}, alert: () => {}, confirm: () => true, dl: () => {}, draw: () => {}, pushH: () => {}, updateRightPanel: () => {},
  openFP: () => {}, closeFP: () => {}, document: { getElementById: id => domEls[id] || null }, getDef: () => ({ w: 20 }) };
Object.defineProperty(sb, 'htmlOut', { get: () => domEls['report-body'].innerHTML });
vm.createContext(sb);
vm.runInContext(R('js/report.js'), sb);
vm.runInContext(R('js/conn_table.js'), sb);
const page = (els, wires) => ({ name: 'P', elements: els, wires: wires || [] });
const setState = (pages) => { sb.state = { pages, currentPage: 0, customParts: [], customSymbols: [] }; };

console.log('【部品表: コイル電圧は図面に入っている値をそのまま見せる】');
{
  sb.partVoltOptions = () => ['AC12V', 'AC100V'];
  const bom = v => { setState([page([{ id: 'a', type: 't', partRef: 'CR1', partModel: 'M1', partVolt: v }])]); vm.runInContext('showBOM()', sb); return sb.htmlOut; };
  let h = bom(undefined);
  ok(/<option value="" selected>\(未設定\)<\/option>/.test(h) && !/value="AC12V" selected/.test(h), '電圧が空なら「(未設定)」を選択済みにする(以前は先頭のAC12Vが選択済みに見えた)');
  h = bom('AC100V');
  ok(/value="AC100V" selected/.test(h) && !/<option value="" selected>/.test(h), '入っている電圧はそのまま選択済み');
  h = bom('DC5V');
  ok(/DC5V \(選択肢に無い\)/.test(h), '選択肢に無い値は、そのまま見せて印を付ける');
  sb.partVoltOptions = () => ['AC100V'];
  h = bom(undefined);
  ok(/<option value="" selected>\(未設定\)/.test(h), '選択肢が1つでも、図面が空なら「(未設定)」(以前はその1つを入っているように見せた)');
  h = bom('AC100V');
  ok(/<td style="color:var\(--fg2\)">AC100V<\/td>/.test(h), '選択肢が1つで、入っているなら読み取り専用の表示');
}

console.log('\n【接続チェック・線番表: 表の文字をエスケープする】');
{
  const els = [{ id: 'k', type: 't', x: 0, y: 0, partRef: 'C<u>R</u>1', layer: '<b>L</b>' }];
  const wires = [{ id: 'w', pts: [{ x: 0, y: 0 }, { x: 0, y: 50 }], wireNo: '<i>X</i>"Q', layer: '<b>L</b>' }];
  setState([page(els, wires)]);
  sb.state.customSymbols = [];
  vm.runInContext('showConnTable()', sb); let html = sb.htmlOut;
  ok(!/<i>X<\/i>|<u>R<\/u>|<b>L<\/b>/.test(html), '接続チェック: 線番・デバイス名・レイヤーの<>が生で出ない');
  ok(/&lt;i&gt;X&lt;\/i&gt;/.test(html), '接続チェック: エスケープされた線番が出る');
  // 線番表の▲▼: 線番に " と ' を含んでも onclick が壊れない
  const w2 = [{ id: 'a', pts: [{ x: 0, y: 0 }, { x: 0, y: 50 }], wireNo: 'A"B\'C' }, { id: 'b', pts: [{ x: 100, y: 0 }, { x: 100, y: 50 }], wireNo: 'Z' }];
  setState([page([], w2)]);
  vm.runInContext('wireNoTable()', sb); html = sb.htmlOut;
  const attrs = [...html.matchAll(/onclick="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
  const swaps = attrs.filter(a => a.startsWith('swapNetWireNo'));
  ok(swaps.length >= 2, `▲▼のボタンが出ている(${swaps.length}個)`);
  let bad = 0; swaps.forEach(a => { try { new Function(a); } catch (e) { bad++; } });
  ok(bad === 0, '線番に " と \' を含んでも▲▼のonclickがJSとして正しい(以前は構文エラー)');
}

console.log('\n【端子台表: 綴りが違っても同じデバイスなら1つの台(部品表・接点Refと同じ判定)】');
{
  const t = (id, ref, label, y) => ({ id, type: 'junction', style: 'circle', x: 10 * label, y, partRef: ref, label: String(label) });
  const els = [t('t1', 'TB2', 1, 0), t('t2', 'TB2', 2, 0), t('t3', 'TB-2', 3, 0), t('t4', 'tb2', 4, 0), t('u1', 'TB1', 1, 50)];
  setState([page(els)]);
  const rows = vm.runInContext('buildTerminalBlockRows()', sb);
  const refs = [...new Set(rows.map(r => r.tbRef))].sort();
  ok(JSON.stringify(refs) === JSON.stringify(['TB1', 'TB2']), `TB2・TB-2・tb2 は1つの台 TB2(表示名は一番多い綴り)。実際 ${JSON.stringify(refs)}`);
  ok(rows.filter(r => r.tbRef === 'TB2').length === 4, 'TB2の端子は4点');
  const g = vm.runInContext('groupTerminalsByDevice(collectTerminals())', sb);
  ok([...g.keys()].sort().join() === 'TB1,TB2' && g.get('TB2').length === 4, 'groupTerminalsByDevice も同じ');
  vm.runInContext("setTBExcluded('TB2', true)", sb);
  ok(els.filter(e => e.partRef !== 'TB1').every(e => e.tbExclude), '「端子台として集計」を外すと、綴りの違う端子にも効く');
  ok(!els.find(e => e.partRef === 'TB1').tbExclude, '別の台(TB1)には効かない');
  sb.state.pages[0].elements.forEach(e => { delete e.tbExclude; });
  const bomTB = vm.runInContext('collectBOMRows()', sb).filter(r => /TB/.test(r.refs.join())).map(r => r.refs.join() + ':' + r.parts);
  ok(bomTB.length === 2, `部品表も同じ2台(実際 ${JSON.stringify(bomTB)})`);
}

console.log('\n【部品表: 型番が複数あるとき、一番多い型番を出す】');
{
  sb.symRole = el => (el.type === 'coil' ? 'coil' : '');
  const e = (id, type, model) => ({ id, type, partRef: 'CR2', partModel: model });
  const row = els => { setState([page(els)]); return vm.runInContext('collectBOMRows()', sb).find(r => r.refs[0] === 'CR2'); };
  // Sheet3のCR2: 最初に見つかったのが少数派(MY2N AC100V 1個)、あとにMY4Nが4個
  let r = row([e('1', 'ca', 'MY2N AC100V'), e('2', 'coil', 'MY4N'), e('3', 'ca', 'MY4N'), e('4', 'cb', 'MY4N'), e('5', 'cb', 'MY4N')]);
  ok(r.model === 'MY4N', `多数派(MY4N)を出す。以前は最初に見つかった MY2N AC100V(実際 ${r.model})`);
  ok(/型番が複数\(MY2N AC100V \/ MY4N\)/.test(r.warn), '複数あることは警告に出る');
  r = row([e('1', 'ca', 'A1'), e('2', 'coil', 'B2')]);
  ok(r.model === 'B2', '同数ならコイルの型番');
  r = row([e('1', 'ca', 'A1'), e('2', 'cb', 'B2')]);
  ok(r.model === 'A1', '同数でコイルも無ければ、先に見つかった方');
  r = row([e('1', 'ca', ''), e('2', 'cb', '')]);
  ok(r.model === '' && r.label === '(型番未設定)', '型番が無ければ従来どおり「(型番未設定)」');
}

console.log('\n【部品表: デバイス未設定の行に内部名(custom_xxx)を出さない】');
{
  setState([page([{ id: 'x', type: 'custom_ms9y_zfx' }, { id: 'y', type: 'custom_abc', label: 'ラベル' }, { id: 'z', type: 'custom_reg' }])]);
  sb.state.customSymbols = [{ type: 'custom_reg', name: '押しボタン' }];
  const rows = vm.runInContext('collectBOMRows()', sb).filter(r => r.noRef);
  const lab = t => (rows.find(r => r.type === t) || {}).label;
  ok(lab('custom_ms9y_zfx') === '(登録なし)', `登録の無いシンボルは「(登録なし)」(実際 ${lab('custom_ms9y_zfx')})`);
  ok(lab('custom_abc') === 'ラベル', '要素にラベルがあればそれを出す');
  ok(lab('custom_reg') === '押しボタン', '登録シンボルの名前を出す');
}

console.log('\n【部品表: 型番を表のセルから直せる】');
{
  sb.symRole = el => (el.type === 'coil' ? 'coil' : '');
  const mk = (id, type, model, ref) => ({ id, type, partRef: ref || 'CR2', partModel: model, partVolt: 'AC100V' });
  const els = [mk('1', 'ca', 'MY2N AC100V'), mk('2', 'coil', 'MY4N'), mk('3', 'cb', 'MY4N'), mk('4', 'ca', 'X1', 'CR9')];
  const pg = page(els); pg.groups = [{ id: 'g', partRef: 'CR-2', partModel: 'OLD' }, { id: 'h', partRef: 'CR9', partModel: 'KEEP' }];
  setState([pg]);
  vm.runInContext('showBOM()', sb);
  const h = sb.htmlOut;
  ok(/<input type="text" value="MY4N" placeholder="\(型番未設定\)" onchange="setBOMModel\(\d+, this\.value\)"/.test(h), '型番欄が入力欄になっていて、今の型番(多数派)が入っている');
  ok(/型番が複数\(/.test(h), '型番が複数あるという警告は入力欄の下に出る');
  const idx = vm.runInContext('window._bomRows', sb).findIndex(r => r.refs[0] === 'CR2');
  let pushed = 0; sb.pushH = () => { pushed++; };
  vm.runInContext(`setBOMModel(${idx}, ' MY4N ')`, sb);
  ok(els.slice(0, 3).every(e => e.partModel === 'MY4N'), 'そのデバイスの全要素に型番が入る(食い違いが揃う)');
  ok(els[3].partModel === 'X1', '別のデバイスは変わらない');
  ok(pg.groups[0].partModel === 'MY4N' && pg.groups[1].partModel === 'KEEP', '綴りが違っても同じデバイスのグループにも入り、別のデバイスのグループは変わらない');
  ok(els[0].partVolt === 'AC100V', '電圧は触らない');
  ok(pushed === 1, '取り消せる(pushH)ようにする');
  ok(!/CR2に型番が複数/.test(sb.htmlOut), '揃えたら「型番が複数」の警告が消える(表が作り直されている)');
  vm.runInContext(`setBOMModel(${idx}, '')`, sb);
  ok(els[0].partModel === undefined, '空にすれば型番を消す');
  // デバイス未設定の行は打てない
  setState([page([{ id: 'n', type: 'lamp' }])]);
  vm.runInContext('showBOM()', sb);
  const ni = vm.runInContext('window._bomRows', sb).findIndex(r => r.noRef);
  vm.runInContext(`setBOMModel(${ni}, 'ZZ')`, sb);
  ok(sb.state.pages[0].elements[0].partModel === undefined, 'デバイス未設定の行には書き戻さない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
