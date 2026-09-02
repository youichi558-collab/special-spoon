#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
try_classify.py — ローカルLLM(Ollama)が使い物になるかを、実データで測る。

【これは実験用。本番の処理経路には一切入っていない。】
部品DBにも図面にも**書き込まない**。読むだけ。消しても何も壊れない。

■ なぜ「種別の分類」で試すのか

いきなりカタログPDFを読ませてCSVを作らせると、**正解が無いので採点できない。**
「それらしいCSVが出てきた」で終わり、使えるかどうかが分からない。
これはこのプロジェクトが何度も踏んだ形(それらしい数字を出して判断を仰ぐ)そのもの。

一方、部品DBには**盛田さんが付けた種別が605件ぶん入っている**。これは人が
決めた答えなので、採点に使える。同じ問題をモデルに解かせて突き合わせれば、
「このモデルが電気部品の型番を理解しているか」が1回で数字になる。

ここで落ちるモデルは、カタログの表を読ませても確実に落ちる(表の読み取りは
こちらより難しい)。**安く早く見切りをつけるための試験。**

■ 使い方

  1) 部品DBの場所を教える(まだなら。1回だけ)
       py ..\\parts_db\\parts_db.py setpath "<parts_db.jsonのパス>"
  2) Ollamaを起動して、そのまま走らせる
       py try_classify.py

     --model を付けなければ、**Ollamaに入っているモデルを一覧表示する**
     (`ollama list` のNAME列と同じもの)。1つしか入っていなければそれを使う。
     何も入っていなければ、入れ方を案内する。

  3) モデルを選んで走らせる
       py try_classify.py --model qwen2.5:7b --n 50

  --n は問題数(既定50)。まず50で様子を見て、良さそうなら増やす。
  --model を変えて何度か回せば、モデルごとの比較になる
  (--seed が固定なので同じ問題が出る)。

■ 結果の読み方

  正答率だけを見ない。**外し方**を見ること。出力の後半に、間違えた行を
  「型番 / 正解 / 回答」の形で全部出している。

  - contactor と starter を混ぜる → サーマル一体かどうかを見ていない。
    実務では別部品なので、この間違いは高い
  - pb 系(押ボタン)の中で細かく外す → 照光か非常停止かの区別が付いていない。
    型番からは読めないこともあるので、人でも間違える部類
  - breaker を plc と答えるような外し方 → 型番を理解していない。見切ってよい

  **正答率が高くても、そのまま部品DBに書かせる用途には使わないこと。**
  このプロジェクトで一番高くつく間違いは「静かに間違ったデータが残る」ことで、
  9割当たるモデルは1割を静かに間違える。
"""
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'parts_db'))
import parts_db  # noqa: E402

DEFAULT_HOST = 'http://127.0.0.1:11434'

# js/ui.js の PART_TYPE_LABELS と同じ内容。
# 【注意】種別コードの定義は元々4箇所(PART_TYPE_CODES/LABELS/ORDER、index.htmlの
# プルダウンとCSVヘルプ)にあり、増やすときは全部を揃える決まりになっている。
# ここはそのどれでもない5箇所目なので、**実験が終わったらこのフォルダごと消す**。
# 残すことになった場合は、サーバー経由でJSから取る形に変えること。
TYPE_LABELS = {
    'contactor': '電磁接触器', 'starter': '電磁開閉器(サーマル一体)',
    'coil': 'リレーコイル', 'timer': 'タイマ', 'thermal': 'サーマルリレー',
    'pb': '押ボタン', 'pb_lamp': '照光押ボタン', 'pb_estop': '非常停止',
    'selector': 'セレクタ', 'selector_key': '鍵付セレクタ',
    'selector_lamp': '照光セレクタ', 'selector_pb': 'セレクタ押ボタン',
    'lever': 'モノレバー', 'contact_unit': 'コンタクトユニット',
    'lamp': 'ランプ・表示灯', 'breaker': 'ブレーカ', 'fuse': 'ヒューズ',
    'transformer': 'トランス', 'terminal': '端子台', 'inverter': 'インバータ',
    'servo': 'サーボアンプ', 'servo_motor': 'サーボモータ', 'motor': 'モーター',
    'plc': 'PLC(シーケンサ)', 'plc_unit': 'PLC増設ユニット',
    'hmi': 'タッチパネル・表示器', 'option': '増設ユニット等(付属品)',
}

PROMPT = """あなたは制御盤の設計者です。部品の情報から、種別コードを1つ選んでください。

種別コードの一覧:
{types}

部品:
  メーカー: {maker}
  型番: {ref}
  定格電圧: {volt}
  定格電流: {amp}
  備考: {note}

種別コードだけを1行で答えてください。説明は不要です。"""


def list_models(host, timeout=10):
    """Ollamaに入っているモデル名の一覧。`ollama list` のNAME列と同じもの。

    盛田さんが「モデル名とは？」で詰まったので、こちらから見に行く。
    調べさせるより、選択肢を並べて選んでもらう方が早い。
    """
    with urllib.request.urlopen(f'{host}/api/tags', timeout=timeout) as res:
        data = json.loads(res.read().decode('utf-8'))
    return [m.get('name', '') for m in data.get('models', []) if m.get('name')]


def ask(host, model, prompt, timeout=120):
    """Ollamaに1問投げる。標準ライブラリだけで書く(pip不要)。"""
    body = json.dumps({
        'model': model,
        'prompt': prompt,
        'stream': False,
        # 分類なので毎回同じ答えが出てほしい。温度を上げる理由が無い。
        'options': {'temperature': 0},
    }).encode('utf-8')
    req = urllib.request.Request(f'{host}/api/generate', data=body,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode('utf-8')).get('response', '')


def normalize(answer):
    """モデルの返事から種別コードを取り出す。

    素直に返さないモデルが多い(「答え: contactor です」「**breaker**」等)ので、
    既知のコードが含まれていればそれを採る。複数含まれていたら最初の1つ。
    ここを厳しくすると「書式が違うだけ」を不正解に数えてしまい、
    モデルの理解力ではなく指示追従を測ることになる。
    """
    a = (answer or '').strip().lower()
    hits = [(a.find(c), c) for c in TYPE_LABELS if c in a]
    if not hits:
        return ''
    # 長いコードを優先する(selector_lamp が selector にも一致するため)
    pos = min(p for p, _ in hits)
    cands = [c for p, c in hits if p == pos]
    return max(cands, key=len)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', help='Ollamaのモデル名(例: qwen2.5:7b)。'
                                    '省略すると入っているものを一覧表示する')
    ap.add_argument('--n', type=int, default=50, help='問題数(既定50)')
    ap.add_argument('--host', default=DEFAULT_HOST)
    ap.add_argument('--seed', type=int, default=1, help='出題の再現用')
    args = ap.parse_args()

    # モデル名の解決。--model が無ければ、Ollamaに入っているものを見に行く。
    # 「モデル名とは？」で止まらないようにするため。
    try:
        installed = list_models(args.host)
    except urllib.error.URLError as e:
        print(f'Ollamaに繋がりません({args.host}): {e}', file=sys.stderr)
        print('  Ollamaを起動してから、もう一度実行してください', file=sys.stderr)
        return 1
    except Exception as e:
        print(f'モデル一覧を取れませんでした: {e}', file=sys.stderr)
        return 1

    if not installed:
        print('Ollamaにモデルが1つも入っていません。', file=sys.stderr)
        print('  まず1つ入れてください。軽い順の例:', file=sys.stderr)
        print('    ollama pull qwen2.5:3b     (約2GB・一番軽い。まず動くか見る用)',
              file=sys.stderr)
        print('    ollama pull qwen2.5:7b     (約5GB・日本語がまとも。本命)',
              file=sys.stderr)
        print('    ollama pull llama3.1:8b    (約5GB・比較用)', file=sys.stderr)
        return 1

    if not args.model:
        print('Ollamaに入っているモデル:')
        for m in installed:
            print(f'  {m}')
        print()
        if len(installed) == 1:
            args.model = installed[0]
            print(f'1つだけなので {args.model} で実行します。')
        else:
            print('どれかを --model に指定してください。例:')
            print(f'  py try_classify.py --model {installed[0]} --n 50')
            print('\n迷ったら、まず全部を順に試して比べるのが早いです'
                  '(--seed が固定なので同じ問題が出ます)。')
            return 0
    elif args.model not in installed:
        # タグ省略(`qwen2.5` と打って `qwen2.5:7b` が入っている)はよくあるので拾う
        cand = [m for m in installed if m.split(':')[0] == args.model]
        if len(cand) == 1:
            print(f'{args.model} → {cand[0]} として実行します。')
            args.model = cand[0]
        else:
            print(f'「{args.model}」はOllamaに入っていません。'
                  f'入っているのは:', file=sys.stderr)
            for m in installed:
                print(f'  {m}', file=sys.stderr)
            print(f'\n入れるなら: ollama pull {args.model}', file=sys.stderr)
            return 1

    db = parts_db.PartsDB()
    st = db.stats()
    if not st['ok']:
        print(f'部品DBを読めません: {st["error"]}', file=sys.stderr)
        print('  py ..\\parts_db\\parts_db.py setpath "<parts_db.jsonのパス>"',
              file=sys.stderr)
        return 1

    # 種別が入っている部品だけが採点できる(空欄は正解が無い)
    parts = [p for p in db.search('', '', '', limit=0) if p.get('type') in TYPE_LABELS]
    if not parts:
        print('種別が入った部品が1件もありません', file=sys.stderr)
        return 1
    random.Random(args.seed).shuffle(parts)
    parts = parts[:args.n]

    types_block = '\n'.join(f'  {c} = {l}' for c, l in TYPE_LABELS.items())
    print(f'モデル: {args.model} / 出題 {len(parts)}件 '
          f'(部品DB {st["count"]}件から抽出)')
    print('-' * 60)

    ok = 0
    wrong = []
    t0 = time.time()
    for i, p in enumerate(parts, 1):
        prompt = PROMPT.format(types=types_block, maker=p.get('maker', ''),
                               ref=p.get('ref', ''), volt=p.get('volt', ''),
                               amp=p.get('amp', ''), note=p.get('note', ''))
        try:
            raw = ask(args.host, args.model, prompt)
        except urllib.error.URLError as e:
            print(f'\nOllamaに繋がりません({args.host}): {e}', file=sys.stderr)
            print('  ollama serve が動いているか確認してください', file=sys.stderr)
            return 1
        except Exception as e:
            print(f'\n{p.get("ref")}: 失敗 {e}', file=sys.stderr)
            wrong.append((p.get('ref', ''), p['type'], f'(エラー) {e}'))
            continue

        got = normalize(raw)
        if got == p['type']:
            ok += 1
        else:
            wrong.append((p.get('ref', ''), p['type'], got or f'(解釈不能) {raw[:40]}'))
        sys.stdout.write(f'\r  {i}/{len(parts)}  正解 {ok}')
        sys.stdout.flush()

    dt = time.time() - t0
    n = len(parts)
    print(f'\n\n正答率: {ok}/{n} = {ok / n * 100:.0f}%'
          f'   ({dt:.0f}秒 / 1件あたり {dt / n:.1f}秒)')

    if wrong:
        print(f'\n外した {len(wrong)}件 —— 正答率より、こちらの中身を見ること')
        print(f'  {"型番":<22}{"正解":<14}回答')
        for ref, exp, got in wrong:
            print(f'  {ref:<22}{TYPE_LABELS.get(exp, exp):<14}'
                  f'{TYPE_LABELS.get(got, got)}')
        # 混同の傾向をまとめる。個別の行より、どの区別が付いていないかが効く。
        pairs = {}
        for _, exp, got in wrong:
            if got in TYPE_LABELS:
                pairs[(exp, got)] = pairs.get((exp, got), 0) + 1
        rep = sorted(pairs.items(), key=lambda kv: -kv[1])[:5]
        if rep:
            print('\n多い取り違え:')
            for (exp, got), c in rep:
                print(f'  {TYPE_LABELS[exp]} → {TYPE_LABELS[got]}  ({c}件)')

    print('\n※ 正答率が高くても、そのまま部品DBに書かせないこと。')
    print('  9割当たるモデルは、1割を静かに間違える。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
