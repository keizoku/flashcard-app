import "server-only";
import { createStoryDeck } from "./story.js";

// おためしユーザーに、最初から入れておく単語帳。始めてすぐに、記憶テスト・物語のスライド・読み上げを試せるように。
// 物語は、このアプリのために書いたもの（動画の字幕などは使っていない）。
// 形は、物語を作るときに AI が返す答えと同じ（lib/storyPrompt.js）

export const STARTER_WORDS = ["nervous", "give up", "figure sth out", "eventually", "confident", "look forward to sth"];

export const STARTER_STORY = `タイトル: The First Pancake
[1] Ken was nervous about cooking breakfast for his family.
訳: ケンは、家族の朝ごはんを作ることに緊張していた。
語句: nervous = 形容詞「緊張して」【緊張していた】
[2] His first pancake was burnt, and he almost gave up.
訳: 最初のパンケーキは焦げてしまい、彼はもう少しであきらめるところだった。
語句: gave up = 句動詞「あきらめる」【あきらめる】
[3] Then he watched the pan closely and tried again.
訳: それから彼はフライパンをよく見て、もう一度やってみた。
[4] Slowly, he figured out the right heat.
訳: 少しずつ、彼はちょうどいい火加減がわかってきた。
語句: figured out = 句動詞「（考えて）わかる」【わかってきた】
[5] Eventually, the pancakes turned golden and soft.
訳: やがて、パンケーキはきつね色でふわふわになった。
語句: Eventually = 副詞「やがて、最終的に」【やがて】
[6] His little sister tasted one and smiled.
訳: 妹がひとつ食べて、にっこりした。
[7] Now Ken feels confident in the kitchen.
訳: 今では、ケンは台所で自信を持っている。
語句: confident = 形容詞「自信がある」【自信を持っている】
[8] He is already looking forward to next Sunday.
訳: 彼はもう、次の日曜日を楽しみにしている。
語句: looking forward to = 句動詞「〜を楽しみにする」【楽しみにしている】`;

// → { deckId, cardCount } か { error }
export function createStarterDeck(userId) {
  return createStoryDeck(userId, { answer: STARTER_STORY, words: STARTER_WORDS });
}
