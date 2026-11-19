import "server-only";
import { displayTarget } from "./format.js";

// ---- チャット AI に渡すプロンプト（カードの解説） --------------------------
export const MAX_CARDS_PER_PROMPT = 20;

// 解説が足りないカード: 例文・豆知識がない、または覚えたい語のどれかに和訳の対応部分がない
export const NEEDS_EXPLANATION = `((ai_examples IS NULL AND ai_trivia IS NULL)
  OR EXISTS (SELECT 1 FROM card_targets t WHERE t.card_id = cards.id AND t.translation_form IS NULL))`;
export const needsExplanation = (c) =>
  (!c.ai_examples && !c.ai_trivia) || (c.targets ?? []).some((t) => !t.translation_form);

const CARD_INSTRUCTIONS = `あなたは日本人の英語学習者を手伝う英語教師です。
学習者は YouTube の字幕から「知らない語句が1〜3つだけの英文」を集めて、暗記カードにしています。
以下のカードそれぞれについて、カードの裏面に載せる解説を日本語で作ってください。

# 各項目の書き方
- 和訳: 例文全体の自然な日本語訳
- 対応: 和訳の中で、対象の語句に当たる部分（和訳の文字をそのまま抜き出す）
- 意味: 対象の語句の、この例文の中での意味（品詞も添える）。辞書の全部の意味ではなく、この文での意味を中心に
- 例文: 対象の語句を使った、日常会話で使える短い英文と日本語訳を「英文 | 日本語訳」の形で2つ
- 対象の語句が2つ以上あるカードでは、「対応:」と「意味:」を語句ごとに1行ずつ、「語句 = 内容」の形で書く。
  例文と豆知識は、全部の語句についてまとめて書いてよい
- 豆知識: 語源・イメージ・似た語との違い・よくある使われ方など、覚えやすくなる話を1〜3文で。不確かなことは書かない

# 出力の形式
説明やあいさつは書かず、カードごとに次の形式で、コードブロックの中に出力してください。
「### 」の後ろの番号は、下のカードの番号をそのまま使ってください。

\`\`\`
### 12
和訳: 最初は半信半疑だった。
対応: 半信半疑
意味: 形容詞「懐疑的な、疑い深い」
例文: She is skeptical of the plan. | 彼女はその計画に懐疑的だ。
例文: I'm skeptical about that claim. | その主張には疑問を感じる。
豆知識: 「よく調べる」という意味のギリシャ語が語源。
### 15
和訳: 思い切って、ひたすら練習した。
対応: bit the bullet = 思い切って
対応: solely = ひたすら
意味: bit the bullet = イディオム「（嫌なことを）覚悟してやる」
意味: solely = 副詞「もっぱら、ひたすら」
例文: I bit the bullet and called her. | 思い切って彼女に電話した。
例文: The money is solely for food. | そのお金は食費専用だ。
豆知識: bite the bullet は、昔の戦場で麻酔の代わりに弾丸をかんで痛みに耐えたことから。
\`\`\``;

// cards: [{ id, front, targets: [{ word, form }] }]
export function buildCardPrompt(cards) {
  const list = cards
    .map((c) => {
      const targets = c.targets?.length ? c.targets : [{ form: c.front, word: null }];
      const lines = targets.map((t) => {
        const head = t.word && t.word !== t.form ? `（見出し: ${displayTarget(t.word)}）` : "";
        return `対象の語句: ${t.form}${head}`;
      });
      return `### ${c.id}\n例文: ${c.front}\n${lines.join("\n")}`;
    })
    .join("\n\n");
  return `${CARD_INSTRUCTIONS}\n\n# カード\n${list}`;
}

// ---- チャット AI の答えを読み取る ----------------------------------------
// 戻り値: Map<カードID, { translation, meaning, examples: [{en, ja}], trivia }>
const KEYS = { 和訳: "translation", 対応: "translationForm", 意味: "meaning", 例文: "examples", 豆知識: "trivia" };

export function parseCardExplanations(text) {
  const result = new Map();
  let current = null;
  let lastKey = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("```")) continue;
    const head = line.match(/^#{1,4}\s*(\d+)\s*$/);
    if (head) {
      current = { translation: "", translationForm: "", meaning: "", examples: [], trivia: "", perTarget: [] };
      result.set(Number(head[1]), current);
      lastKey = null;
      continue;
    }
    if (!current) continue;
    const m = line.match(/^[-*]?\s*(和訳|対応|意味|例文|豆知識)\s*[:：]\s*(.*)$/);
    if (m) {
      lastKey = KEYS[m[1]];
      if (lastKey === "examples") {
        const [en, ...ja] = m[2].split(/\s*[|｜]\s*/);
        if (en.trim()) current.examples.push({ en: en.trim(), ja: ja.join(" | ").trim() });
      } else if ((lastKey === "meaning" || lastKey === "translationForm") && /\s[=＝]\s/.test(m[2])) {
        // 「語句 = 内容」の形（対象の語句が複数あるカード）
        const [phrase, ...rest] = m[2].split(/\s[=＝]\s/);
        current.perTarget.push({ key: lastKey, phrase: phrase.trim(), value: rest.join(" = ").trim() });
        if (!current[lastKey]) current[lastKey] = rest.join(" = ").trim();
      } else {
        current[lastKey] = m[2].trim();
      }
    } else if (lastKey && lastKey !== "examples" && lastKey !== "translationForm") {
      // 複数行にわたる説明は、前の項目の続きとみなす
      current[lastKey] += ` ${line}`;
    }
  }
  return result;
}
