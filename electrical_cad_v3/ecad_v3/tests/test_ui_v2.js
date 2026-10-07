// 新しい画面(UI v2)の段階0・1(2026-10-07 js/ui_v2.js・css/style.css body.ui-v2・index.html #v2-*)
//   node tests/test_ui_v2.js
// Claude Design の案 5a/5b。盛田さん「おすすめでいい、進めて」。設定の「画面」で切り替え、既定は今の画面。
// ボタンは作り直さず今のボタンを移す(点灯の処理を1か所のまま)。ブラウザでの動きは playwright で確認済み(HANDOFF)。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const R = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const V = R('js/ui_v2.js'), H = R('index.html'), C = R('css/style.css'), I = R('js/input.js'), S = R('js/settings.js'), U = R('js/ui.js');

console.log('【ツールの種類と名前】');
const sb = {};
vm.createContext(sb);
vm.runInContext(V.match(/const UIV2_TOOLS[\s\S]*?\nfunction uiV2ToolName[^\n]*/)[0] + '\nthis.K=uiV2ToolKind;this.N=uiV2ToolName;this.T=UIV2_TOOLS;this.M=UIV2_MORE;', sb);
ok(sb.K('wire') === 'wire' && sb.K('text') === 'text' && sb.K('junction') === 'junction', '配線・テキスト・接続点');
ok(['fline', 'rect', 'circle', 'arc', 'arc3', 'triangle', 'bezier', 'dim', 'angle_dim', 'leader', 'chain_dim', 'measure', 'guide_h', 'guide_v'].every(m => sb.K(m) === 'draw'), '作図ツールはすべて「直交・スナップ・線幅」');
ok(['select', 'sym', 'partref', 'wireno', 'paste'].every(m => sb.K(m) === 'none'), '選択・シンボル・採番は設定なし');
ok(sb.N('arc') === '半円' && sb.N('partref') === '№採番' && sb.N('wireno') === '線番クリック', 'ツールの札の名前');

console.log('\n【ツールが抜けていない】');
// リボンの作図・配線タブとクイックバーにある、ツールを切り替えるボタンが全部どこかへ移る
const ribbonDrawWire = H.slice(H.indexOf('<div id="rp-draw"'), H.indexOf('<div id="rp-reg"'));
const toolIds = [...ribbonDrawWire.matchAll(/<div [^>]*>/g)].map(m => m[0]).filter(t => /onclick="(setMode|setJunctionStyle)\(/.test(t)).map(t => (t.match(/id="([^"]+)"/) || [])[1]);
const placed = new Set([...sb.T.map(t => t[0]), ...sb.M]);
ok(toolIds.length === 18 && toolIds.every(Boolean), `作図・配線タブのツールボタンを数えた(${toolIds.length}個)`);
ok(toolIds.every(id => placed.has(id)), '★作図・配線タブのツールが全部、ツール群か「その他」にある(案で抜けていた11個を含む)');
ok(['qb-sel', 'qb-wire', 'qb-partref', 'qb-wireno'].every(id => placed.has(id) && H.includes(`id="${id}"`)), 'クイックバーの選択・配線・№採番・線番クリック');
const tset = V.match(/const UIV2_TSET = \[([^\]]*)\]/)[1];
ok(['rb-ortho', 'rb-snapend', 'rb-snapmid', 'draw-lw-wrap', 'rb-textbox', 'jst-size-wrap', 'wn-b-auto', 'wn-b-renum', 'wn-b-main'].every(id => tset.includes(`'${id}'`) && H.includes(`id="${id}"`)), 'ツール設定帯へ移すもの(直交・スナップ・線幅・枠・サイズ・線番3つ)');
const disp = V.match(/const UIV2_DISP = \[([^\]]*)\]/)[1];
ok(['rb-termno', 'rb-xref', 'qb-flines', 'qb-unchk', 'qb-unconn', 'qb-pins'].every(id => disp.includes(`'${id}'`) && H.includes(`id="${id}"`)), '下のバーの表示の切替');
ok(/_uiV2Move\('xref-scale-wrap', cr\); _uiV2Move\('rb-xref-refresh', cr\)/.test(V), 'CR倍率と更新は下のバー(右パネルのCRタブではない)');
ok(sb.T.some(t => t[0] === 'rb-junction-circle') && !sb.M.includes('rb-junction-circle'), '★端子○はツール群(盛田さん「よく使うから場所変えたい」10-07)');
ok(/>CR倍率<input type="number" id="xref-scale"/.test(H) && /id="rb-xref-refresh"[^>]*>CR更新</.test(H), '★倍率・更新がクロスリファレンスのものと分かる名前(CR倍率・CR更新)');
ok(/_uiV2Move\('active-layer-sel', lay\)/.test(V), '★今のレイヤーの選択(クイックバーにあった)も下のバーへ移す=案に無かったが消えると困る');

console.log('\n【切り替えの仕組み】');
ok(/stSetPref\('uiV2', on \? true : null\)/.test(V) && /uiV2Apply\(p\.uiV2 === true\)/.test(S), '★設定に覚え、起動時に戻す。既定は今の画面');
ok(/id="ui-v2-on"[^>]*uiV2Set\(true\)/.test(H) && /id="ui-v2-off"[^>]*uiV2Set\(false\)/.test(H) && /data-sec="set-sec-ui"/.test(H), '設定パネルの「画面」タブ');
ok(/body:not\(\.ui-v2\) \.v2-only\{display:none!important;\}/.test(C), '今の画面では新しいバーを隠す');
ok(/body\.ui-v2 #ribbon, body\.ui-v2 #quickbar, body\.ui-v2 #page-bar\{display:none!important;\}/.test(C), '新しい画面ではリボン・クイックバーを隠す(消さない)');
const v2css = C.slice(C.indexOf('新しい画面(UI v2) 2026-10-07'));
const outside = v2css.split('\n').filter(l => /^[#.a-z]/i.test(l) && !/^(body\.ui-v2|body:not\(\.ui-v2\)|body\.fullscreen|#v2-|#rp-v2|\.v2-)/.test(l));
ok(outside.length === 0, '★新しい見た目の CSS は body.ui-v2 か新しい部品(#v2-・.v2-)だけ=今の画面に効かない' + (outside.length ? ' ' + outside.join(' / ') : ''));
ok(/function _uiV2RestoreAll\(\)/.test(V) && /ph\.parentNode\.insertBefore\(el, ph\)/.test(V), '今の画面に戻すときは移した位置へ全部戻す');

console.log('\n【点灯は1か所(2026-09-19 の不具合と同じ失敗をしない)】');
ok(/qbSel\?\.classList\.toggle\('on', m === 'select'\)/.test(I) && /if \(typeof uiV2SyncTool === 'function'\) uiV2SyncTool\(m\)/.test(I), '★選択・配線の点灯とツール設定帯の切替は syncModeButtons の中から');
ok(/getElementById\('qb-partref'\)\?\.classList\.toggle\('on', m === 'partref'\)/.test(I), '採番中は№採番を点ける');
ok(!/classList\.(add|remove|toggle)\('on'/.test(V.replace(/more\.classList\.toggle\('on'[^;]*;/, '').replace(/btn\.classList\.(add|remove)\('on'\)/g, '')), 'ui_v2.js は今のボタンの点灯を自分で触らない(その他ボタンとメニューだけ)');
ok(/classList\.toggle\('on', !!state\.showFlineMark\)/.test(U) && /classList\.toggle\('on', !!state\.showSymPins\)/.test(U) && /classList\.toggle\('on', !!state\.showUnconnected\)/.test(R('js/conn_check.js')), '作図線・端子(仮)・未接続の点灯はそれぞれの切替関数が .on も付ける');
ok(/if \(state\.mode !== 'junction'\) return;/.test(U.slice(U.indexOf('function syncJunctionStyleBtns'))), '分岐点の形のボタンは接続点モードのときだけ点く(起動時に「選択」と2つ点いていた)');

console.log('\n【レイアウト】');
ok(/getElementById\(v2 \? 'v2-tbar' : 'ribbon'\)/.test(U), '右パネルの上端(--ribbon-h)は新しい画面ではツール設定帯の下端');
ok(/body\.ui-v2 #rp\{bottom:34px;\}/.test(C), '右パネルの下端は下のバー(34px)の上');
ok(/#v2-top\{height:46px;/.test(C) && /#v2-tbar\{height:36px;/.test(C) && /#v2-bottom\{height:34px;/.test(C), 'バーの高さ(46・36・34)は数値で固定');
ok(/\['ui_v2\.js'\] = 1;\s*$/.test(V), 'JS読み込み確認の目印(無いと起動時に警告が出る)');

console.log('\n【段階2 右パネル】');
ok(/id="rp-v2head" class="v2-only"/.test(H) && /_uiV2Move\('rp-toggle', document\.getElementById\('rp-v2head'\)\)/.test(V), '見出し(アイコン・デバイス名・補足)。畳むボタンは今のものを見出しへ移す');
ok(/new MutationObserver\(\(\) => \{ if \(_uiV2On\) uiV2SyncRpHead\(\); \}\)\.observe\(rpb/.test(V) && !/uiV2SyncRpHead/.test(U), '★右パネルの中身・処理(ui.js)は変えず、描き直されたら見出しだけ付け直す');
ok(/const UIV2_RP_W = 272;/.test(V) && /if \(!prefs\.rpWidth && typeof rpSetWidth === 'function'\) rpSetWidth\(on \? UIV2_RP_W : RP_W_DEF, false\)/.test(V), '幅の既定は 272(自分で幅を変えていればそのまま)');
ok(/rpSetWidth\(p\.rpWidth \|\| \(p\.uiV2 === true && typeof UIV2_RP_W !== 'undefined' \? UIV2_RP_W : RP_W_DEF\), false\)/.test(S), '起動時も同じ(前回値が無ければ新しい画面は 272)');
ok(/body\.ui-v2 #rp \.rp-tab\.on\{[^}]*font-weight:600/.test(C) && /body\.ui-v2 #rp > h4\{display:none;\}/.test(C), 'タブの見た目・今の見出し(プロパティ)は隠す');
ok(/body\.ui-v2 #rp \.pp-zone:has\(input:checked\)\{border-color:var\(--red\);\}/.test(C), '部品表の対象外のチェック時の赤はそのまま');

console.log('\n【段階3 左パネル】');
ok(['sym', 'lay', 'prt', 'prj'].every(k => new RegExp(`id="lt-${k}" title="[^"]+" onclick="switchLTab\\('${k}',this\\)"><svg class="v2-only"`).test(H)), '★4つのタブは今の switchLTab のまま、アイコン(新しい画面だけ)を足しただけ');
ok(/body\.ui-v2 #lt-prj\{order:-1;\}/.test(C), '並びはプロジェクト・シンボル・レイヤー・部品DB(順番は CSS だけで変える)');
ok(/class="lt-v2set v2-only" onclick="openSettingsPanel\(\)"/.test(H), 'いちばん下に設定');
ok(/body\.ui-v2 #lp\{width:48px;/.test(C) && /width:32px;height:32px;[^}]*border-radius:8px;[^}]*font-size:0;/.test(C), 'アイコンの列 48px・ボタン 32×32 角丸8(文字は隠して title に出す)');

console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
