// DXF出力: カスタムシンボルの弧(A)の角度・ccw変換のテスト
//   node tests/test_dxf_custom_arc.js
//
// 【背景】js/dxf_export.js のカスタムシンボルBLOCK定義で、弧(A)の座標をそのまま
// bA(sa,ea)に渡していたため、canvas角度(Y下向き・ccw任意)がDXF規約(Y上向き・
// ARCは常にCCW)に変換されずに出力されていた。単体arc要素の出力(同ファイル
// 603〜608行目、dxfAng()でY反転しccw=falseならswap)と同じ規則を、カスタム
// シンボルのshapes配列(角度は既に度数法で保持)向けに適用した。
//
// このテストは js/dxf_export.js から customSyms.forEach の該当ブロックを
// そのまま切り出してevalし、bA()に渡される最終的なsa/eaを検証する。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const eq = (a, b, m) => {
  if (Math.abs(a - b) > 1e-9) { ng++; console.log('  NG', m, '期待', b, '実際', a); }
  else console.log('  OK', m);
};

const src = fs.readFileSync(__dirname + '/../js/dxf_export.js', 'utf8');
const start = src.indexOf('  customSyms.forEach((s,i)=>{', src.indexOf('  customSyms.forEach((s,i)=>{') + 1);
if (start < 0) throw new Error('該当ブロックが見つかりません');
const end = src.indexOf('\n  });', start) + 6;
const block = src.slice(start, end);

// 単体arc要素の出力(603〜608行目)と同じ規則を、度数法版として再実装した参照実装。
// (ラジアン版dxfAngをそのまま流用できないため、テスト側でも度数法版を用意して
// 「同じ規則になっているか」を検証する)
const refConvert = (saDeg, eaDeg, ccw) => {
  const dxfAngDeg = a => ((-a) % 360 + 360) % 360;
  let sa = dxfAngDeg(saDeg), ea = dxfAngDeg(eaDeg);
  if (!ccw) { const t = sa; sa = ea; ea = t; }
  return { sa, ea };
};

function run(sh) {
  const calls = [];
  const sandbox = {
    console,
    p: () => {},
    bL: () => {}, bC: () => {}, bR: () => {}, bP: () => {}, bT: () => {},
    bA: (cx, cy, r, sa, ea) => { calls.push({ sa, ea }); },
    custBlkH: [{ b: 1, e: 2 }],
    customSyms: [{ type: 'test', shapes: [sh] }],
  };
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return calls[0];
}

// ------------------------------------------------------------------
console.log('【カスタムシンボルの弧: 単体arc要素と同じ変換規則になっているか】');
const cases = [
  { name:'半円・ccw=true (-90→90)',  sa:-90, ea:90,  ccw:true  },
  { name:'半円・ccw=false(-90→90)',  sa:-90, ea:90,  ccw:false },
  { name:'1/4円・ccw=true (0→90)',   sa:0,   ea:90,  ccw:true  },
  { name:'1/4円・ccw=false(0→90)',   sa:0,   ea:90,  ccw:false },
  { name:'0°跨ぎ・ccw=true(-45→45)', sa:-45, ea:45,  ccw:true  },
  { name:'優弧・ccw=true(0→270)',    sa:0,   ea:270, ccw:true  },
  { name:'優弧・ccw=false(0→270)',   sa:0,   ea:270, ccw:false },
  { name:'狭角・ccw=true(10→20)',    sa:10,  ea:20,  ccw:true  },
];

cases.forEach(c => {
  const got = run({ t:'A', cx:0, cy:0, r:5, sa:c.sa, ea:c.ea, ccw:c.ccw });
  const ref = refConvert(c.sa, c.ea, c.ccw);
  eq(got.sa, ref.sa, `${c.name}: sa`);
  eq(got.ea, ref.ea, `${c.name}: ea`);
});

// ccw未設定(旧データ、登録済みだが今回の修正前に作られたシンボル)は
// falseとして扱う(=時計回りとしてswapされる)ことを確認
console.log('【ccw未設定の後方互換】');
{
  const got = run({ t:'A', cx:0, cy:0, r:5, sa:-90, ea:90 });
  const ref = refConvert(-90, 90, false);
  eq(got.sa, ref.sa, 'ccw未設定はfalse扱い: sa');
  eq(got.ea, ref.ea, 'ccw未設定はfalse扱い: ea');
}

console.log(ng ? `\n${ng}件失敗` : '\n全て成功');
process.exit(ng ? 1 : 0);
