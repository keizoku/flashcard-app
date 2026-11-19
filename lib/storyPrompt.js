import "server-only";
import { displayTarget } from "./format.js";

export const STORY_LENGTHS = {
  short: { label: "短め（約150語）", words: 150 },
  medium: { label: "ふつう（約300語）", words: 300 },
  long: { label: "長め（約500語）", words: 500 },
};

// 覚えた単語を使った物語を、チャット AI に書いてもらうプロンプト
export function buildStoryPrompt({ words, levelLabel, length, theme }) {
  const len = STORY_LENGTHS[length] ?? STORY_LENGTHS.medium;
  const list = words.map((w) => `- ${displayTarget(w).replace(/〜/g, "...")}`).join("\n");
  return `あなたは英語学習者のための物語を書く作家です。
学習者が最近覚えた単語・イディオムを、自然な文脈の中で何度も目にして記憶に定着させるための、短い英語の物語を書いてください。

# 条件
- 長さ: ${len.label}
- 下の「使う語句」を、できるだけすべて、物語の中で自然に使う（活用形は自由。1つの語句を2回以上使ってもよい）
- それ以外の単語は、学習者のレベル「${levelLabel}」で無理なく読めるものにする
- 会話文を入れてもよい。読んで楽しい、筋のある物語にする
${theme ? `- テーマ・設定: ${theme}\n` : ""}
# 使う語句
${list}

# 出力の形式
説明やあいさつは書かず、次の形式だけを、コードブロックの中に出力してください。
- 1行目に「タイトル:」で、物語の英語のタイトル
- その後、1文ずつ「[番号] 英文」の行。番号は 1 から順に付ける
- 各文の次の行に「訳:」で、自然な日本語訳
- その次の行に「語句:」で、その文で使った「使う語句」を、
  「文の中の形 = 品詞「この文での意味」【訳の中で対応する部分】」の形で「 / 」で区切って並べる。
  【 】の中は、「訳:」の文から、その語句に当たる部分をそのまま抜き出す。使っていなければ「語句:」の行は省く

\`\`\`
タイトル: The Last Signal
[1] Maya had always been skeptical of the rumors about the old radio tower.
訳: マヤは、古い電波塔のうわさにずっと懐疑的だった。
語句: skeptical = 形容詞「懐疑的な」【懐疑的】
[2] But one night, she decided to bite the bullet and climb it.
訳: しかしある夜、彼女は覚悟を決めて、それに登ることにした。
語句: bite the bullet = イディオム「覚悟してやる」【覚悟を決めて】
\`\`\``;
}

// 答えの「タイトル:」の行を取り出す
export function parseStoryTitle(text) {
  const m = String(text ?? "").match(/^\s*(?:タイトル|Title)\s*[:：]\s*(.+?)\s*$/im);
  return m ? m[1].replace(/^["'「]|["'」]$/g, "").trim().slice(0, 80) : "";
}
