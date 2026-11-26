// 手元の DB の単語帳を1冊、ファイル（JSON）に書き出す道具。おためしユーザーに最初から入れる単語帳（data/starter/）を作るときに使う。
// DB は読むだけで、書きかえない。
//
//   docker compose exec app node scripts/export-deck.mjs <単語帳の番号> data/starter/<ファイル名>.json
//
// 書き出すもの: 名前・動画・字幕・AI で整えた文・タグ、カードの中身と解説・覚えたい語。
// 書き出さないもの: 持ち主・記憶テストの状態・学習の記録
import { writeFileSync } from "node:fs";
import pg from "pg";

const [deckId, out] = process.argv.slice(2);
if (!/^\d+$/.test(deckId ?? "") || !out) {
  console.log("使い方: node scripts/export-deck.mjs <単語帳の番号> <書き出すファイル>");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query("SELECT * FROM decks WHERE id = $1", [Number(deckId)]);
  const d = rows[0];
  if (!d) throw new Error(`単語帳 ${deckId} が見つかりません`);
  const { rows: tags } = await client.query(
    "SELECT t.name FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.deck_id = $1 ORDER BY t.name",
    [d.id]
  );
  const { rows: cards } = await client.query("SELECT * FROM cards WHERE deck_id = $1 ORDER BY id", [d.id]);
  const snapshot = {
    name: d.name,
    kind: d.kind,
    videoId: d.video_id,
    transcript: d.transcript,
    sentences: d.sentences,
    storyWords: d.story_words,
    tags: tags.map((t) => t.name),
    cards: [],
  };
  for (const c of cards) {
    const { rows: targets } = await client.query(
      "SELECT word, form, meaning, translation_form FROM card_targets WHERE card_id = $1 ORDER BY position, id",
      [c.id]
    );
    snapshot.cards.push({
      front: c.front,
      back: c.back,
      startSeconds: c.start_seconds,
      aiTranslation: c.ai_translation,
      aiExamples: c.ai_examples,
      aiTrivia: c.ai_trivia,
      targets,
    });
  }
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`${out} に書き出しました（カード ${snapshot.cards.length} 枚）`);
} finally {
  await client.end();
}
