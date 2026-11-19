"""wordfreq の英語頻出度リストから、上位の単語を data/en-words.txt に書き出す。

使い方（Mac に Python を入れなくても Docker で実行できる）:
  docker run --rm -v "$PWD":/work -w /work python:3.12-slim \
    sh -c "pip install -q wordfreq==3.1.1 && python scripts/generate_wordlist.py"
"""
import re
from wordfreq import top_n_list

N = 50000
WORD = re.compile(r"^[a-z]+(?:'[a-z]+)*$")

words = [w for w in top_n_list("en", N) if WORD.match(w)]

with open("data/en-words.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(words) + "\n")

print(f"wrote {len(words)} words")
