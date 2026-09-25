// ================================================================
// 線番のネット判定(groupWiresByNet)で分岐点(●)をつなぐことの確認
//
// 【2026-09-25】以前は配線の「端どうし」の重なりしか見ておらず、T字の分岐
// (1本が●を通り抜け、別の1本がそこで終わる)が別ネットに割れていた。
// 盛田さんのSheet3では分岐点24個中18個がこの形で、分岐先の線が未採番の別行になった。
// 盛田さんの決定は「●がある所だけつなぐ」(B)。●の無いT字・単なる交差はつながない。
//
// report.js の実コードから groupWiresByNet を切り出して動かす。
// ================================================================
const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

// Windowsで取り出すと改行がCRLFになるのでLFにそろえる(他のテストと同じ)
const src = fs.readFileSync(__dirname + '/../js/report.js', 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('function groupWiresByNet(');
const end = src.indexOf('\n}\n', start);
if (start < 0 || end < 0) throw new Error('groupWiresByNet が見つかりません');
const sb = { WIRE_NET_TOL: 5 };
vm.createContext(sb);
vm.runInContext(src.slice(start, end + 3), sb);
const g = (wires, els) => sb.groupWiresByNet(wires, null, els);
const sameNet = (groups, a, b) => groups.some(ix => ix.includes(a) && ix.includes(b));

// 横の幹線(0,0)-(100,0) と、途中(50,0)から下へ出る枝(50,0)-(50,50)
const trunk = { x1: 0, y1: 0, x2: 100, y2: 0 };
const branch = { x1: 50, y1: 0, x2: 50, y2: 50 };

console.log('【●のあるT字はつなぐ】');
ok(sameNet(g([trunk, branch], [{ type: 'junction', x: 50, y: 0, style: 'dot' }]), 0, 1),
   '●(style:dot)のT字は同じネット');
ok(sameNet(g([trunk, branch], [{ type: 'junction', x: 50, y: 0 }]), 0, 1),
   'style未設定のjunctionも●扱いでつなぐ');
ok(sameNet(g([trunk, branch], [{ type: 'junction', x: 52, y: 2, style: 'dot' }]), 0, 1),
   '●の位置が5以内のずれでもつなぐ');
ok(sameNet(g([{ pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }, branch],
             [{ type: 'junction', x: 50, y: 0, style: 'dot' }]), 0, 1),
   '折れ線(pts)の途中の●でもつなぐ');
ok(sameNet(g([trunk, { x1: 50, y1: -50, x2: 50, y2: 50 }], [{ type: 'junction', x: 50, y: 0, style: 'dot' }]), 0, 1),
   '●の上で2本が交差(どちらも通り抜け)していてもつなぐ');

console.log('\n【●が無ければつながない(盛田さんの決定B)】');
ok(!sameNet(g([trunk, branch], []), 0, 1), '●の無いT字はつながない');
ok(!sameNet(g([trunk, branch]), 0, 1), 'elementsを渡さない呼び出しは従来どおり');
ok(!sameNet(g([trunk, branch], [{ type: 'junction', x: 50, y: 0, style: 'circle' }]), 0, 1),
   '端子台の○(circle)ではつながない');
ok(!sameNet(g([trunk, branch], [{ type: 'junction', x: 50, y: 0, style: 'dbl' }]), 0, 1),
   '端子台の◎(dbl)ではつながない');
ok(!sameNet(g([trunk, { x1: 50, y1: -50, x2: 50, y2: 50 }], []), 0, 1), '●の無い交差はつながない');
ok(!sameNet(g([trunk, branch, { x1: 200, y1: 0, x2: 300, y2: 0 }],
              [{ type: 'junction', x: 50, y: 0, style: 'dot' }]), 0, 2),
   '●に触れていない配線は巻き込まない');

console.log('\n【端どうしの重なりは従来どおり】');
ok(sameNet(g([{ x1: 0, y1: 0, x2: 10, y2: 0 }, { x1: 10, y1: 0, x2: 20, y2: 0 }], []), 0, 1),
   '端が重なる2本は●が無くても同じネット');

console.log(ng ? `\n失敗 ${ng} 件` : '\nすべて通過');
process.exit(ng ? 1 : 0);
