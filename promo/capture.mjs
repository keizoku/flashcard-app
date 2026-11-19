import { test } from "@playwright/test";
import { closeDb, createDeck, createUser, db, loginAs, resetDb } from "../e2e/db.mjs";

// 販売促進用 PDF（promo/brochure.html）に入れる、アプリの画面写真を撮る。
// テスト用の DB（flashcard_e2e）に見本のデータを入れて撮る。開発用の DB には触れない。

const OUT = "promo/images";

// 見本の字幕（このために書いた文。実在の動画ではない）
const TRANSCRIPT = [
  "0:00 Hi everyone, welcome back to my channel.",
  "0:04 Today we are going on a trip to a small town by the sea.",
  "0:09 I was skeptical about this place at first.",
  "0:13 But the view from the hill was absolutely breathtaking.",
  "0:18 We made a detailed itinerary the night before.",
  "0:22 The local market was full of people.",
  "0:26 I bought a small souvenir for my sister.",
  "0:30 The old man at the shop was very generous.",
  "0:35 We were exhausted after walking all day.",
  "0:39 So we found a nice place to eat dinner.",
  "0:41 A quaint little cafe sat on the corner.",
  "0:45 The sunset over the harbor was mesmerizing.",
  "0:47 We wandered through the narrow alleys after dinner.",
  "0:50 The old lighthouse looked a bit dilapidated.",
  "0:43 The fish was fresh and the price was reasonable.",
  "0:48 I would love to come back here next year.",
  "0:52 Thank you for watching, and see you next time.",
].join("\n");

// （exhausted・reasonable などはカードにしない。取り込みの画面で候補として出すため）
const CARDS = [
  { front: "I was skeptical about this place at first.", word: "skeptical", ja: "最初は、この場所に懐疑的だった。", meaning: "疑い深い、懐疑的な", form_ja: "懐疑的", box: 3, count: 4 },
  { front: "But the view from the hill was absolutely breathtaking.", word: "breathtaking", ja: "でも、丘からの眺めは本当に息をのむほどだった。", meaning: "息をのむような", form_ja: "息をのむほど", examples: [{ en: "The mountains were breathtaking in the morning light.", ja: "朝の光の中の山々は、息をのむほど美しかった。" }], box: 2, count: 2 },
  { front: "We made a detailed itinerary the night before.", word: "itinerary", ja: "前の晩に、くわしい旅程を立てた。", meaning: "旅程", form_ja: "旅程", box: 0, count: 2, lapses: 1 },
  { front: "I bought a small souvenir for my sister.", word: "souvenir", ja: "妹に小さなおみやげを買った。", meaning: "おみやげ、記念品", form_ja: "おみやげ", box: 4, count: 5 },
  { front: "The old man at the shop was very generous.", word: "generous", ja: "店のおじいさんは、とても気前がよかった。", meaning: "気前のよい", form_ja: "気前がよかった", box: 1, count: 1 },
];

async function seed() {
  await resetDb();
  const user = await createUser("you@example.com");
  await db().query("UPDATE users SET display_name = 'たろう' WHERE id = $1", [user.id]);
  const deck = await createDeck(user.id, { name: "海辺の町を歩く旅 Vlog（見本）", transcript: TRANSCRIPT });
  const deck2 = await createDeck(user.id, { name: "朝のニュースで英語（見本）" });
  const deck3 = await createDeck(user.id, { name: "料理チャンネル（見本）" });
  for (const [name, id] of [["旅行", deck], ["ニュース", deck2], ["料理", deck3]]) {
    const { rows } = await db().query("INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [name]);
    await db().query("INSERT INTO deck_tags (deck_id, tag_id) VALUES ($1, $2)", [id, rows[0].id]);
  }

  const cardIds = [];
  for (const c of CARDS) {
    const { rows } = await db().query(
      `INSERT INTO cards (deck_id, front, back, target_word, target_form, ai_translation, ai_meaning, ai_translation_form,
                          ai_examples, ai_trivia, ai_generated_at, review_box, review_count, lapse_count, review_due_at, last_reviewed_at)
       VALUES ($1, $2, '', $3, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11,
               CASE WHEN $10 > 0 THEN now() + interval '2 days' END, CASE WHEN $10 > 0 THEN now() - interval '1 day' END)
       RETURNING id`,
      [
        deck, c.front, c.word, c.ja, c.meaning, c.form_ja,
        JSON.stringify(c.examples ?? []),
        null, c.box, c.count, c.lapses ?? 0,
      ]
    );
    cardIds.push(rows[0].id);
    await db().query(
      "INSERT INTO card_targets (card_id, position, word, form, meaning, translation_form) VALUES ($1, 0, $2, $2, $3, $4)",
      [rows[0].id, c.word, c.meaning, c.form_ja]
    );
  }
  // 学習した単語を「知っている」側に入れるため、ほかのデッキにもカードを入れる
  for (const [d, words] of [[deck2, ["announce", "economy", "forecast", "policy", "election", "survey"]], [deck3, ["ingredient", "simmer", "recipe", "chop"]]]) {
    for (const [i, w] of words.entries()) {
      const { rows } = await db().query(
        `INSERT INTO cards (deck_id, front, back, target_word, target_form, review_box, review_count, review_due_at, last_reviewed_at)
         VALUES ($1, $2, '', $3, $3, $4, $5, CASE WHEN $5 > 0 THEN now() + interval '1 day' END, CASE WHEN $5 > 0 THEN now() END) RETURNING id`,
        [d, `This is about the ${w}.`, w, i % 3 === 0 ? 3 : i % 3, i % 4 === 0 ? 0 : 3]
      );
      await db().query("INSERT INTO card_targets (card_id, word, form) VALUES ($1, $2, $2)", [rows[0].id, w]);
    }
  }
  // 直近2週間の学習の記録（日ごとに少しずつ）
  const perDay = [6, 9, 4, 0, 8, 11, 7, 5, 10, 12, 6, 9, 13, 8];
  for (const [i, n] of perDay.entries()) {
    for (let k = 0; k < n; k++) {
      await db().query(
        `INSERT INTO review_logs (card_id, deck_id, remembered, reviewed_at)
         VALUES ($1, $2, $3, now() - make_interval(days => $4) - make_interval(mins => $5))`,
        [cardIds[k % cardIds.length], deck, k % 4 !== 0, 13 - i, k * 3]
      );
    }
  }
  return { user, deck };
}

test.afterAll(closeDb);

test("画面写真を撮る", async ({ page, context }) => {
  test.setTimeout(180_000);
  const { user, deck } = await seed();
  await loginAs(context, user);
  const hideDevBadge = () => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const snap = async (name, opts = {}) => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await hideDevBadge();
    await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  };
  await page.setViewportSize({ width: 900, height: 760 });

  await page.goto("/");
  await snap("top");

  await page.goto(`/decks/${deck}/import`);
  await page.locator("ul.candidates > li").first().waitFor({ timeout: 30_000 });
  const candidates = page.locator("ul.candidates > li");
  await candidates.nth(0).locator('input[type="checkbox"]').check();
  await page.evaluate(() => {
    const top = document.querySelector(".stage-tabs").getBoundingClientRect().top;
    window.scrollTo(0, window.scrollY + top - 160);
  });
  await snap("import");

  // 学習の画面（答えを出したところ）。今日のカードが出るように、1枚だけ期限にする
  await db().query("UPDATE cards SET review_due_at = now() - interval '1 hour' WHERE deck_id = $1 AND target_word = 'breathtaking'", [deck]);
  await page.goto(`/decks/${deck}/study`);
  await page.locator(".study-card, main").first().waitFor();
  await page.keyboard.press("ArrowRight");
  await page.locator(".study-remembered").waitFor();
  await snap("study");

  await page.goto("/stats");
  await snap("stats", { fullPage: false });
});
