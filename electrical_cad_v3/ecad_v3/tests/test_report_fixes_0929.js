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
vm.runInContext(R('js/devices.js'), sb);   // 部品表の入力はデバイス台帳を通る
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
  ok(/<td style="white-space:nowrap"><select[^>]*min-width:96px/.test(h), '電圧のプルダウンは幅を確保する(列が縮んで「AC100V」が途中で切れた)');
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

console.log('\n【部品表: 部品DBに無い型番でも、コイルのあるデバイスは電圧を打てる】');
{
  sb.symRole = el => (el.type === 'coil' ? 'coil' : '');
  sb.partVoltOptions = m => (m === 'MY4N' ? ['AC100V', 'AC200V'] : []);
  const els = [{ id: '1', type: 'coil', partRef: 'CR7', partModel: 'HH52P' }, { id: '2', type: 'ca', partRef: 'CR7', partModel: 'HH52P' },
    { id: '3', type: 'lamp', partRef: 'L1', partModel: 'PL-1' }, { id: '4', type: 'coil', partRef: 'CR8' }, { id: '5', type: 'lamp', partRef: 'L2', partModel: 'PL-2', partVolt: 'AC24V' }];
  setState([page(els)]);
  vm.runInContext('showBOM()', sb);
  const cell = ref => { const m = sb.htmlOut.match(new RegExp('<td style="font-weight:600">' + ref + '</td>(?:<td>.*?</td>){4}?<td[^>]*>(.*?)</td>')); return m ? m[1] : null; };
  const rowOf = ref => sb.htmlOut.split('<tr').find(t => t.includes('<td style="font-weight:600">' + ref + '</td>')) || '';
  ok(/setBOMVolt\(\d+, this\.value\)" style="width:\d+px/.test(rowOf('CR7')) && /<input[^>]*setBOMVolt/.test(rowOf('CR7')), '部品DBに無い型番(HH52P)でも、コイルのあるデバイスは電圧を打てる入力欄になる(以前は「-」だけ)');
  ok(/<input[^>]*setBOMVolt/.test(rowOf('CR8')), '型番が未入力でも、コイルがあれば打てる');
  ok(!/setBOMVolt/.test(rowOf('L1')), 'コイルの無いデバイス(ランプ)は従来どおり「-」');
  ok(/<input[^>]*value="AC24V"[^>]*setBOMVolt|<input[^>]*setBOMVolt[^>]*>/.test(rowOf('L2')) && /AC24V/.test(rowOf('L2')), 'すでに電圧が入っているデバイスは、コイルが無くても見せて直せる');
  const idx = vm.runInContext('window._bomRows', sb).findIndex(r => r.refs[0] === 'CR7');
  vm.runInContext(`setBOMVolt(${idx}, ' AC24V ')`, sb);
  ok(els[0].partVolt === 'AC24V' && els[1].partVolt === 'AC24V', '打った電圧が、そのデバイスの全要素に入る(前後の空白は落とす)');
  ok(els[2].partVolt === undefined, '別のデバイスは変わらない');
  ok(/value="AC24V"/.test(rowOf('CR7')), '表を作り直しても、打った電圧が入っている');
}

console.log('\n【部品表: 仕様(図面の仕様欄)を、型番とは別の列に出す】');
{
  sb.symRole = el => (el.type === 'coil' ? 'coil' : '');
  sb.partVoltOptions = () => [];
  const mk = (id, type, ref, label, o) => Object.assign({ id, type, partRef: ref, partModel: 'CP30-BA', label }, o);
  const els = [mk('1', 'brk', 'CP1', '2P 5A\n動作特性D'), mk('2', 'brk', 'CP1', ''), mk('3', 'brk', 'CP2', 'AC200V 3.7kW'),
    mk('4', 'brk', 'CP3', 'A'), mk('5', 'brk', 'CP3', 'B'),
    { id: '6', type: 'junction', style: 'circle', partRef: 'TB1', label: '5' }];
  setState([page(els)]);
  const rows = vm.runInContext('collectBOMRows()', sb);
  const row = ref => rows.find(r => r.refs[0] === ref);
  ok(row('CP1').spec === '2P 5A 動作特性D', `仕様を出す(改行は空白に)。デバイス内の空の記号は無視(実際 ${row('CP1').spec})`);
  ok(row('CP1').label === 'CP30-BA', '型番欄は型番のまま(仕様を混ぜない)');
  ok(row('CP2').spec === 'AC200V 3.7kW', '別のデバイスは別の仕様');
  ok(row('TB1').spec === '', '端子台の端子のlabel(端子番号)は仕様として出さない');
  ok(/CP3に仕様が複数\(A \/ B\)/.test(row('CP3').warn), '同じデバイスで仕様が食い違っていたら警告(仕様はデバイスで1つのはず)');
  vm.runInContext('showBOM()', sb);
  ok(/<th[^>]*>仕様<\/th>/.test(sb.htmlOut) && /<input type="text" value="2P 5A 動作特性D"[^>]*setBOMSpec\(\d+, this\.value\)/.test(sb.htmlOut), '画面に「仕様」列が出て、打てる入力欄になっている');
  ok(/<tr[^>]*><td style="font-weight:600">TB1<\/td>(?:(?!<\/tr>).)*?<td style="color:var\(--fg3\)">-<\/td>/.test(sb.htmlOut.replace(/\n/g, '')), '端子台だけのデバイスは「-」(書き戻す先が無い)');
  let csv = ''; sb.dl = (c) => { csv = c; }; sb._csvName = n => n + '.csv';
  vm.runInContext('exportBOMCSV()', sb);
  const lines = csv.split('\n');
  ok(lines[0].startsWith('デバイス,名称,型番/名称,仕様,メーカー'), 'CSVの見出しにも「仕様」');
  ok(lines.some(l => l.startsWith('"CP1","","CP30-BA","2P 5A 動作特性D"')), 'CSVの行にも仕様が入る');

  // 部品表から仕様を打つ
  const idx = ref => vm.runInContext('window._bomRows', sb).findIndex(r => r.refs[0] === ref);
  let pushed = 0; sb.pushH = () => { pushed++; };
  vm.runInContext(`setBOMSpec(${idx('CP1')}, ' 2P 10A ')`, sb);
  ok(els[0].label === '2P 10A', 'もともと仕様が入っている記号に、打った仕様が入る(前後の空白は落とす)');
  ok(els[1].label === '2P 10A' && els[1].specHide === true, '仕様はデバイスに1つ: 空だった記号にも入るが「図面に表示」はOFF(図面に仕様が増えない)(2026-09-30 デバイス台帳②)');
  ok(pushed === 1, '取り消せる(pushH)');
  vm.runInContext(`setBOMSpec(${idx('CP3')}, 'C')`, sb);
  ok(els[3].label === 'C' && els[4].label === 'C', '食い違っていた仕様が、打った値に揃う');
  ok(!/CP3に仕様が複数/.test(sb.htmlOut), '揃ったら警告が消える(表が作り直される)');
  ok(els[5].label === '5', '端子台の端子の番号(label)は触らない');
  // どの記号にも仕様が無いデバイス: コイル(無ければ最初)だけに入れる
  const e2 = [{ id: 'a', type: 'brk', partRef: 'K1' }, { id: 'b', type: 'coil', partRef: 'K1' }, { id: 'c', type: 'brk', partRef: 'K1' }];
  setState([page(e2)]); vm.runInContext('showBOM()', sb);
  vm.runInContext(`setBOMSpec(${vm.runInContext('window._bomRows', sb).findIndex(r => r.refs[0] === 'K1')}, 'AC100V')`, sb);
  ok(e2.every(e => e.label === 'AC100V') && !e2[1].specHide && e2[0].specHide && e2[2].specHide, '仕様が無いデバイスは、全記号に入り、図面に出るのはコイル1つだけ');
  vm.runInContext(`setBOMSpec(${vm.runInContext('window._bomRows', sb).findIndex(r => r.refs[0] === 'K1')}, '')`, sb);
  ok(e2.every(e => e.label === undefined), '空にすると、全記号の仕様が消える');
}

console.log('\n【部品表・接点Refのデバイス単位の⚠を押すと、図面のそのデバイスへ飛ぶ】');
{
  sb.symRole = el => (el.role || (el.type === 'coil' ? 'coil' : (el.type === 'ca' ? 'contact_a' : '')));
  sb.partVoltOptions = () => [];
  // 部品表: CR1は2ページにまたがり、型番が食い違う。飛び先はコイル(1ページ目の2番目の要素)
  const p1 = page([{ id: 'x1', type: 'ca', partRef: 'CR1', partModel: 'A' }, { id: 'x2', type: 'coil', partRef: 'CR1', partModel: 'B' }]);
  const p2 = page([{ id: 'y1', type: 'ca', partRef: 'CR5', partModel: 'C' }, { id: 'y2', type: 'ca', partRef: 'CR5', partModel: 'D' }]);
  setState([p1, p2]);
  vm.runInContext('showBOM()', sb);
  let h = sb.htmlOut;
  ok(/onclick="jumpToRefEl\(0,&quot;x2&quot;\)"[^>]*>⚠CR1に型番が複数/.test(h), '部品表: 型番が複数の⚠は、コイル(x2)へ飛ぶ');
  ok(/onclick="jumpToRefEl\(1,&quot;y1&quot;\)"[^>]*>⚠CR5に型番が複数/.test(h), '部品表: コイルが無いデバイスは最初の要素(2ページ目のy1)へ、そのページ番号(1)で飛ぶ');
  ok(!/jumpToRefEl\(0,&quot;y1&quot;\)/.test(h), '部品表: ページ番号を取り違えない');
  ok(/title="クリックで図面のこのデバイスへ飛ぶ"/.test(h), '押せると分かる表示');
  // 接点Ref
  setState([page([{ id: 'c1', type: 'ca', partRef: 'K1' }]), page([{ id: 'd1', type: 'coil', partRef: 'K2' }, { id: 'd2', type: 'coil', partRef: 'K2' }, { id: 'd3', type: 'ca', partRef: 'K2' }])]);
  sb.elLocation = () => '1/A1';
  vm.runInContext('showRefPanel()', sb);
  h = sb.htmlOut;
  ok(/jumpToRefEl\(0,&quot;c1&quot;\)"[^>]*>⚠ コイル未配置/.test(h), '接点Ref: コイル未配置の⚠は、そのデバイスの最初の記号へ飛ぶ');
  ok(/jumpToRefEl\(1,&quot;d1&quot;\)"[^>]*>⚠ コイルが2個/.test(h), '接点Ref: コイルが複数の⚠は、最初のコイル(2ページ目)へ飛ぶ');
}

console.log('\n【部品表: デバイス未設定の行を押すと、図面のその部品へ飛ぶ(複数なら押すたびに次へ)】');
{
  sb.symRole = () => '';
  sb.partVoltOptions = () => [];
  const p1 = page([{ id: 'l1', type: 'lamp', label: '運転' }, { id: 'z1', type: 'zz' }]);
  const p2 = page([{ id: 'l2', type: 'lamp', label: '運転' }, { id: 'l3', type: 'lamp', label: '運転' }]);
  setState([p1, p2]);
  vm.runInContext('showBOM()', sb);
  const h = sb.htmlOut;
  ok(/onclick="jumpBOMNoRef\(\d+\)"[^>]*>[^<]*<span style="color:var\(--red\)">未設定<\/span>/.test(h), '「未設定」の文字が押せる');
  ok(/onclick="jumpBOMNoRef\(\d+\)"[^>]*>運転 <span[^>]*>\(3\)<\/span>/.test(h), '型番欄の名前も押せて、3個あることが分かる');
  const rows = vm.runInContext('window._bomRows', sb);
  const idx = rows.findIndex(r => r.noRef && r.label === '運転');
  ok(rows[idx].locs.length === 3, '飛び先が3つ(ページ番号つき)');
  const calls = []; sb.jumpToRefEl = (pi, id) => calls.push(pi + ':' + id);
  for (let i = 0; i < 4; i++) vm.runInContext(`jumpBOMNoRef(${idx})`, sb);
  ok(calls.join() === '0:l1,1:l2,1:l3,0:l1', `押すたびに次の部品へ、最後まで行ったら最初に戻る(実際 ${calls.join()})`);
  const one = rows.findIndex(r => r.noRef && r.label !== '運転');
  calls.length = 0; vm.runInContext(`jumpBOMNoRef(${one})`, sb);
  ok(calls.join() === '0:z1', '1個だけの行はその部品へ飛ぶ');
  vm.runInContext('jumpBOMNoRef(999)', sb);
  ok(calls.length === 1, '存在しない行番号では何もしない');
}

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
