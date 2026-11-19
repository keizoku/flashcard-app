import "server-only";
import { createHash } from "node:crypto";
import { pool } from "./db.js";
import { attachTargets, replaceCardTargets } from "./targets.js";
import { findGloss, sameWord } from "./transcript.js";
import { formatTime } from "./youtube.js";

// ---- チャット AI に渡すプロンプト（字幕 → 完結した文） --------------------
// 長い字幕は、チャット AI が一度に返せる長さに収まるよう、いくつかに分ける
// （和訳と語句の意味も書いてもらうので、答えは字幕の3倍ほどの長さになる）
const WORDS_PER_PART = 1200;

const words = (text) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) ?? [];

const sentenceInstructions = (levelLabel) => `以下は YouTube の字幕です。自動生成のことが多く、句読点がなかったり、行の区切りが文の区切りと一致していなかったり、
話し言葉ならではの言い直しや言葉の重なりが入っていたりします。
英語学習用の例文として使うので、文に整え、和訳と語句の意味を付けてください。
学習者は YouTube の音声を聞きながらリスニングも練習するので、文は実際に話された言葉のままにすることが大切です。
学習者のレベルは「${levelLabel}」です。

# ルール
- 句読点（. , ? ! ' など）と大文字・小文字を整え、完結した文に分ける
- 話された言葉は変えない。言い換え・言葉の追加・文法の修正はしない（文法的に崩れた話し言葉でも、そのまま残す）
- してよいのは次のことだけ
  - "um" "uh" などのフィラー（言いよどみ）を消す
  - "this this" "and and and" のような言葉の重なりや、言いかけてやめた言い直しを消す
  - 明らかな聞き間違い（字幕の誤り）を、実際に話された言葉に直す（例: "why'd a variety" → "wide variety"）
- 言葉を消したり直したりした文には、「訳:」の前の行に「元:」で、元の字幕の文をそのまま書く
- 話し言葉で and や so が延々と続く場合は、意味の切れ目で文を分ける（1文はおおむね40語以内）
- 文の先頭には、その文が始まる行の時刻を [分:秒] の形で付ける
- 各文の次の行に「訳:」で、自然な日本語訳を付ける
- その次の行に「語句:」で、学習者のレベルでは難しそうな単語と、文の中のイディオム・句動詞を、
  「文の中の形 = 品詞「この文での意味」【訳の中で対応する部分】」の形で「 / 」で区切って並べる。
  【 】の中には、「訳:」の文から、その語句に当たる部分をそのまま抜き出して書く（訳の文字と完全に同じにする）。
  該当がなければ「語句:」の行は省く
- 説明やあいさつは書かず、次の形式だけを、コードブロックの中に出力する

# 出力の形式
\`\`\`
[0:00] Hey guys, so today I'm gonna be sharing a simple yet extremely powerful immersion tip.
訳: みなさん、今日はシンプルだけどとても効果的なイマージョンのコツを紹介します。
語句: immersion = 名詞「没入、イマージョン（外国語漬けの学習法）」【イマージョン】
[0:06] It's simply creating a new YouTube account solely for immersion.
訳: それは、イマージョン専用の YouTube アカウントを新しく作ることです。
語句: solely = 副詞「もっぱら、〜だけのために」【専用】 / immersion = 名詞「没入、イマージョン」【イマージョン】
[0:14] I just kind of bit the bullet and tried it.
訳: 思い切って試してみました。
語句: bit the bullet = イディオム「（嫌なことを）覚悟してやる」【思い切って】
[0:20] And it turned out a really good decision for my Japanese.
元: and uh it it turned out a really good decision for for my Japanese
訳: そしてそれは、私の日本語にとって本当にいい決断になりました。
語句: turned out = 句動詞「結果的に〜になる」【になりました】
\`\`\``;

// segments: [{ start, text }] → プロンプトの配列（1つのことが多い）
export function buildSentencePrompts(segments, levelLabel = "英検2級（約5,000語）") {
  const parts = [];
  let current = [];
  let count = 0;
  for (const seg of segments) {
    current.push(seg);
    count += words(seg.text).length;
    if (count >= WORDS_PER_PART) {
      parts.push(current);
      current = [];
      count = 0;
    }
  }
  if (current.length) parts.push(current);

  return parts.map((part, i) => {
    const header =
      parts.length > 1
        ? `（全 ${parts.length} 回のうち ${i + 1} 回目です。${i > 0 ? "前の回の続きです。" : ""}${
            i < parts.length - 1 ? "最後の文が途中で終わっている場合は、そこまでで止めてください。" : ""
          }）\n\n`
        : "";
    const lines = part.map((s) => `${s.start !== null ? `[${formatTime(s.start)}] ` : ""}${s.text}`).join("\n");
    return `${sentenceInstructions(levelLabel)}\n\n${header}# 字幕\n${lines}`;
  });
}

// ---- チャット AI の答えを読み取る ----------------------------------------
const AI_LINE = /^\s*(?:[-*]\s*)?\[?\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*\]?\s+(.+?)\s*$/;
// 物語など、時刻のない文は "[1] 文" のように番号で始まる
const NUMBERED_LINE = /^\s*(?:[-*]\s*)?\[(\d{1,3})\]\s+(.+?)\s*$/;

// "[0:06] It's simply ..." の行を [{ start, text, translation, glosses }] にする。
//   訳: の行 → translation、語句: の行 → glosses [{ phrase, meaning }]
//   時刻のない英語の行は、前の文の続きとみなす
export function parseAiSentences(text) {
  const result = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').trim();
    if (!line || line.startsWith("```")) continue;
    const m = line.match(AI_LINE);
    const num = m ? null : line.match(NUMBERED_LINE);
    if (m || num) {
      const start = m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
      result.push({ start, text: m ? m[4] : num[2], translation: "", glosses: [], original: "" });
      continue;
    }
    const current = result.at(-1);
    if (!current) continue;
    const orig = line.match(/^[-*]?\s*元\s*[:：]\s*(.*)$/);
    if (orig) {
      current.original = orig[1].trim();
      continue;
    }
    const tr = line.match(/^[-*]?\s*(?:訳|和訳)\s*[:：]\s*(.*)$/);
    const gl = line.match(/^[-*]?\s*語句\s*[:：]\s*(.*)$/);
    if (tr) {
      current.translation = tr[1].trim();
    } else if (gl) {
      for (const item of gl[1].split(/\s+[/／]\s+/)) {
        const [phrase, ...rest] = item.split(/\s*[=＝]\s*/);
        if (phrase?.trim() && rest.length) {
          // 末尾の【…】は、和訳の中で対応する部分
          let meaning = rest.join(" = ").trim();
          const ja = meaning.match(/[【\[]([^】\]]+)[】\]]\s*$/);
          if (ja) meaning = meaning.slice(0, ja.index).trim();
          current.glosses.push({ phrase: phrase.trim(), meaning, ja: ja ? ja[1].trim() : "" });
        }
      }
    } else if (!/^#/.test(line) && /^[\x00-\x7F]+$/.test(line)) {
      current.text += ` ${line}`;
    }
  }
  return result.filter((s) => words(s.text).length > 0);
}

// ---- デッキへの保存 -------------------------------------------------------
export function transcriptHash(text) {
  return createHash("sha256").update(String(text ?? "")).digest("hex");
}

// 保存済みの整えた文。字幕があとから変わっていたら使わない
export async function getSavedSentences(deckId, transcript) {
  const { rows } = await pool.query("SELECT sentences, sentences_hash FROM decks WHERE id = $1", [deckId]);
  const row = rows[0];
  if (!row?.sentences || row.sentences_hash !== transcriptHash(transcript)) return null;
  return row.sentences;
}

export async function saveSentences(deckId, transcript, sentences) {
  await pool.query("UPDATE decks SET sentences = $2, sentences_hash = $3 WHERE id = $1", [
    deckId,
    JSON.stringify(sentences),
    transcriptHash(transcript),
  ]);
  return completeCardSentences(deckId, sentences);
}

// AI で整えた文で、このデッキの例文カードを上書きする。
// 各カードを、時刻と言葉の重なりで一番近い新しい文に結びつけ、
// 例文・時刻・和訳・語句の意味・和訳の強調部分を、新しい文のものに置き換える
const MIN_OVERLAP = 0.6; // カードの言葉のうち、新しい文に含まれている割合がこれ以上なら同じ文とみなす
const NEAR_SECONDS = 15; // 時刻がこれ以内なら、近い文として優先する

export async function completeCardSentences(deckId, sentences) {
  const prepared = sentences.map((s) => ({ ...s, wordList: words(s.text) }));
  const { rows } = await pool.query(
    `SELECT id, front, start_seconds, target_word, target_form, ai_meaning, ai_translation_form
     FROM cards WHERE deck_id = $1 AND target_form IS NOT NULL`,
    [deckId]
  );
  const cards = await attachTargets(rows);
  let updated = 0;

  for (const card of cards) {
    const cardWords = words(card.front);
    if (cardWords.length === 0) continue;

    // 一番よく合う文を探す
    let best = null;
    for (const s of prepared) {
      const bag = new Set(s.wordList);
      const overlap = cardWords.filter((w) => bag.has(w)).length / cardWords.length;
      if (overlap < MIN_OVERLAP) continue;
      const near =
        card.start_seconds !== null && s.start !== null && Math.abs(s.start - card.start_seconds) <= NEAR_SECONDS;
      const score = overlap + (near ? 0.5 : 0);
      if (!best || score > best.score) best = { s, score };
    }
    if (!best) continue;
    const sentence = best.s;

    // 覚えたい語を、新しい文の中で探し直す（見つからない語があれば、このカードは上書きしない）
    const targets = card.targets.map((t) => {
      const form = findForm(sentence.text, t);
      if (!form) return null;
      const gloss = findGloss(sentence.glosses, { form, lemma: t.word });
      const translation = sentence.translation || "";
      return {
        word: t.word,
        form,
        meaning: gloss?.meaning || t.meaning || null,
        translation_form: gloss?.ja && translation.includes(gloss.ja) ? gloss.ja : null,
      };
    });
    if (targets.length === 0 || targets.some((t) => !t)) continue;

    await pool.query(
      `UPDATE cards SET front = $2, start_seconds = COALESCE($3, start_seconds),
         ai_translation = $4, ai_generated_at = now()
       WHERE id = $1`,
      [card.id, sentence.text, sentence.start, sentence.translation || null]
    );
    await replaceCardTargets(pool, card.id, targets);
    updated += 1;
  }
  return updated;
}

// 新しい文の中から、覚えたい語の形を探す（大文字・小文字の違いや、活用形の違いも見る）
export function findForm(text, target) {
  const exact = text.match(new RegExp(`(?<![A-Za-z'])${escapeRegExp(target.form)}(?![A-Za-z'])`, "i"));
  if (exact) return exact[0];
  if (target.word.includes(" ")) return null; // イディオムは、そのままの形で見つからなければあきらめる
  for (const m of text.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)*/g)) {
    if (sameWord(m[0].toLowerCase(), target.word)) return m[0];
  }
  return null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
