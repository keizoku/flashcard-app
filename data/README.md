# data/

## en-words.txt

英語の単語を、よく使われる順に並べたリスト（1行1語、上ほど頻出）。
`scripts/generate_wordlist.py` で生成しています。

- 出典: [wordfreq](https://github.com/rspeer/wordfreq) v3.1.1（Robyn Speer ほか）
- ライセンス: wordfreq のデータは [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) で提供されています。
  このファイルはそこから上位の語を抜き出したものなので、同じく CC BY-SA 4.0 です。

## idioms.tsv

よく使われるイディオム・句動詞と、その目安のレベル・意味のリスト。このアプリ用に作成したもので、
書式はファイル先頭のコメントを参照してください。行を足せば、判定の対象に加わります。
レベルは大まかな目安です。
