"""
normalize.py
--------------
find_spec.py / find_spec_list.py で共通して使う「表記ゆれを吸収した比較用文字列」
を作るための正規化関数。

吸収する表記ゆれ:
  - 全角英数字 → 半角（例: "Ｓ－Ｔ２０" → "s-t20"）
  - 大文字・小文字の違い
  - ハイフン類の違い（－ ー − ‐ ‑ ‒ – — をすべて "-" に統一）
  - 空白の有無

注意: あくまで「検索条件に一致するかどうかの判定」にのみ使う。
表示や出力には元の文字列（正規化前）を使うこと。
"""
import re
import unicodedata

_DASH_CHARS = 'ー−‐‑‒–—'  # NFKCで変換されない長音符・各種ダッシュ類


def norm(s):
    if s is None:
        return ''
    s = str(s)
    s = unicodedata.normalize('NFKC', s)  # 全角→半角、－(全角ハイフン)→-等
    for d in _DASH_CHARS:
        s = s.replace(d, '-')
    s = s.lower()
    s = re.sub(r'\s+', '', s)
    return s


def contains(haystack, needle):
    """表記ゆれを吸収した「部分一致」判定"""
    if not needle:
        return False
    return norm(needle) in norm(haystack)
