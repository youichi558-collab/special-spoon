// 他のページに選択ボックス(リサイズハンドル)が残る不具合のテスト
//   node tests/test_handle_stale.js
//
// 【背景】盛田さん報告(2026-08-30): 複数ページの図面で、あるページでグループ選択して
// 削除し、他のページに移ると、そのページに選択ボックスだけが出ていることがある。
//
// 【原因】ハンドルは state.resizeHandles に入ったまま、draw() から毎フレーム
// 無条件に描かれる。この配列は updateResizeHandles() を呼んだときしか更新されず、
// switchPage(ui.js) は state.sel を空にするだけでハンドルを消していなかった。
// delSel(edit.js、削除)も同じ。結果、前のページのハンドルが残って描かれ続ける。
//
// 【修正】switchPage と delSel で updateResizeHandles() を呼ぶ。あわせて、
// 描画側・当たり判定側でも「選択が空ならハンドルは無い」と見るようにして、
// 他の経路で呼び忘れがあっても残らないようにした。

const fs = require('fs');
const vm = require('vm');

let ng = 0;
const ok = (cond, m) => { if (!cond) { ng++; console.log('  NG', m); } else console.log('  OK', m); };

function cut(src, head) {
  const s = src.indexOf(head);
  if (s < 0) throw new Error('関数が見つからない: ' + head);
  return src.slice(s, src.indexOf('\n}', s) + 2);
}
const resizeSrc = fs.readFileSync(__dirname + '/../js/resize.js', 'utf8');
const uiSrc     = fs.readFileSync(__dirname + '/../js/ui.js', 'utf8');
const editSrc   = fs.readFileSync(__dirname + '/../js/edit.js', 'utf8');

function makeSandbox(selCount) {
  const drawn = [];
  const sandbox = {
    console,
    ctx: { save(){}, restore(){}, fillRect(x,y,w,h){ drawn.push({x,y,w,h}); }, strokeRect(){},
           set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){} },
    tc: (x,y) => ({x,y}),
    state: {
      zoom: 1,
      sel: { els:new Set(selCount ? ['a1'] : []), wires:new Set() },
      // 前のページで作られたまま残っているハンドル
      resizeHandles: [
        { wx:10, wy:10, hid:'nw', group:true }, { wx:90, wy:10, hid:'ne', group:true },
        { wx:10, wy:90, hid:'sw', group:true }, { wx:90, wy:90, hid:'se', group:true },
      ],
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    cut(resizeSrc, 'function hasSelection('),
    cut(resizeSrc, 'function drawResizeHandlesOnCanvas('),
    cut(resizeSrc, 'function hitResizeHandle('),
  ].join('\n'), sandbox);
  sandbox._drawn = drawn;
  return sandbox;
}

console.log('【選択が空ならハンドルは描かない】');
{
  const sb = makeSandbox(0);
  sb.drawResizeHandlesOnCanvas();
  ok(sb._drawn.length === 0, '選択が空なら、配列にハンドルが残っていても描かない');
  ok(sb.hitResizeHandle(10, 10) === null, '見えないハンドルに当たり判定も残さない');
}
{
  const sb = makeSandbox(1);
  sb.drawResizeHandlesOnCanvas();
  ok(sb._drawn.length === 4, '選択があれば従来どおり4隅を描く');
  ok(sb.hitResizeHandle(10, 10) !== null, '選択があればハンドルを掴める');
}

console.log('\n【呼び出し側でもハンドルを消す】');
{
  const sw = cut(uiSrc, 'function switchPage(');
  ok(sw.includes('updateResizeHandles()'),
     'switchPage: ページ切り替えでハンドルを消す(選択を消すだけでは残る)');
  const del = cut(editSrc, 'function delSel(');
  ok(del.includes('updateResizeHandles()'),
     'delSel: 削除した要素のハンドルを消す');
  ok(del.indexOf('updateResizeHandles()') > del.indexOf('state.sel.els.clear()'),
     '選択を空にした後に呼ぶ(順序が逆だと消えない)');
}

console.log(ng ? `\n失敗 ${ng}件` : '\n全て成功');
process.exit(ng ? 1 : 0);
