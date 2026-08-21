// 線幅のテスト。
//   node tests/test_line_width.js
//
// 線幅はJIS/ISO 128の標準9種(0.13/0.18/0.25/0.35/0.5/0.7/1.0/1.4/2.0)のみ使う。
// 中途半端な太さが図面に混ざると、線同士を繋いだときに段差が出るため、
// DXFから読み込んだ値も推測値も必ず規格値に丸める。
const fs=require('fs');
const ui=fs.readFileSync(__dirname+'/../js/ui.js','utf8');
const di=fs.readFileSync(__dirname+'/../js/dxf_import.js','utf8');
const pick=(src,re)=>{const m=src.match(re);if(!m)throw new Error('見つからない:'+re);return m[0];};
// constはevalのスコープから出ないのでvarに置き換えて読み込む(実コードは変えない)
eval([
  pick(ui,/const LINE_WIDTHS = \[[\s\S]*?\];/).replace('const','var'),
  pick(ui,/const DEFAULT_LINE_WIDTH = [\d.]+;/).replace('const','var'),
  pick(ui,/function snapLineWidth\([\s\S]*?\n\}/),
  pick(ui,/function lineWidthOptions\([\s\S]*?\n\}/),
  pick(di,/function lineweightToMm\([\s\S]*?\n\}/),
].join('\n'));
let ng=0;
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){ng++;console.log('  NG',m,'期待',JSON.stringify(b),'実際',JSON.stringify(a));}else console.log('  OK',m);};

console.log('【JIS標準の9種】');
eq(LINE_WIDTHS,[0.13,0.18,0.25,0.35,0.5,0.7,1,1.4,2],'0.13〜2.0の9種');
eq(DEFAULT_LINE_WIDTH,0.5,'既定は0.5');

console.log('\n【規格値に丸める】');
eq(snapLineWidth(0.56),0.5,  '0.56 → 0.5');
eq(snapLineWidth(0.4),0.35,  '0.4 → 0.35');
eq(snapLineWidth(0.044),0.13,'0.044 → 0.13(最細)');
eq(snapLineWidth(5),2,       '5 → 2.0(最太)');
eq(snapLineWidth(0.35),0.35, '規格値はそのまま');
eq(snapLineWidth(0),0.5,     '0や不正値は既定の0.5');
eq(snapLineWidth('abc'),0.5, '文字列も既定');

console.log('\n【DXFの370も規格値に丸まる】');
eq(lineweightToMm('35'),0.35, '35 → 0.35(規格一致)');
eq(lineweightToMm('53'),0.5,  '53 → 0.5(DXF固有値を丸める)');
eq(lineweightToMm('211'),2,   '211 → 2.0');
eq(lineweightToMm('9'),0.13,  '9(0.09mm) → 0.13');
eq(lineweightToMm('-1'),null, '-1(レイヤー従属)は指定なしのまま');

console.log('\n【旧データ(規格外)の扱い】');
const html=lineWidthOptions(1.5);
eq(html.includes('value="1.5"'),true,'旧データの1.5は選択肢に残る');
eq(html.includes('1.5（規格外）'),true,'規格外と分かる表示');
eq(html.includes('selected'),true,'現在値が選択済みになる');
eq(lineWidthOptions(0.5).includes('0.5（標準）'),true,'0.5は標準と表示');
console.log(ng?`\n失敗 ${ng}件`:'\n全て成功');
process.exit(ng?1:0);
