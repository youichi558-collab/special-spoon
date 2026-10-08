// 交点スナップの位置(2026-10-08 js/snap.js segIntersect)
//   node tests/test_snap_intersect.js
// 交点をグリッドに丸めていたため、グリッドから半目ずれた分岐点(Sheet3 の x=575 等)で印が横に 5 ずれ、
// そこへ配線が吸い付いてつながらない配線ができた(盛田さん「これなに？」→「いい方向ならそれで直して」)。
const fs = require('fs');
const vm = require('vm');
let ng = 0;
const ok = (c, m) => { if (!c) { ng++; console.log('  NG', m); } else console.log('  OK', m); };
const S = fs.readFileSync(__dirname + '/../js/snap.js', 'utf8');
const sb = { snap: v => Math.round(v / 10) * 10 };
vm.createContext(sb);
vm.runInContext(S.match(/function segIntersect\([\s\S]*?\n\}/)[0], sb);
const p = sb.segIntersect(500, 130, 700, 130, 575, 130, 575, 300);   // 横の配線に縦の配線が x=575 でぶつかる(T)
ok(p && p.x === 575 && p.y === 130, '★グリッドから半目ずれた所(575)でも、ぶつかっている点そのもの(以前は 580 に丸めていた)');
const q = sb.segIntersect(0, 0, 10, 10, 0, 10, 10, 0);
ok(q && q.x === 5 && q.y === 5, '斜めの交点もそのまま');
const r = sb.segIntersect(0, 0, 3, 0, 1 / 3, -1, 1 / 3, 1);
ok(r && r.x === 0.333333, '浮動小数点の誤差は消す(1e-6 で丸める)');
ok(sb.segIntersect(0, 0, 10, 0, 0, 5, 10, 5) === null, '平行は交点なし');
console.log(ng ? `\nNG ${ng} 件` : '\nすべてOK');
process.exit(ng ? 1 : 0);
