import { expect, test } from "@playwright/test";
import { closeDb, createCard, createDeck, createUser, db, loginAs, PASSWORD, resetDb } from "./db.mjs";

// 画面のテスト（E2E）。本物のブラウザ（Chromium）でアプリを操作し、各手順のスクリーンショットを残す。
// スクリーンショットはテスト結果に添付され、テスト結果レポート（tools/report）に入る。
// 実行: docker compose run --rm e2e（詳しくは docs/testing.md）

// 手順のスクリーンショットを撮って、テスト結果に添付する
async function shot(page, testInfo, step) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // 開発サーバーの印（Next.js の左下のボタン）は写さない
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  await testInfo.attach(step, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

let me;
let other;
test.beforeEach(async () => {
  await resetDb();
  me = await createUser("me@example.com");
  other = await createUser("other@example.com");
});
test.afterAll(closeDb);

test("UI-01 ログインしていないと、ログイン画面へ。ログインすると元の画面に戻り、ヘッダーが変わる。ログアウトできる", async ({ page }, testInfo) => {
  await page.goto("/stats");
  await expect(page).toHaveURL(/\/login\?next=%2Fstats/);
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "ログイン" })).toBeVisible();
  await expect(header.getByRole("link", { name: "新規登録" })).toBeVisible();
  await shot(page, testInfo, "1. ログインしていないので、ログイン画面に移った");

  await page.getByLabel("メールアドレス").fill("me@example.com");
  await page.locator('input[name="password"]').fill(PASSWORD);
  await shot(page, testInfo, "2. メールアドレスとパスワードを入れた");
  await page.getByRole("button", { name: "ログイン" }).click();

  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("heading", { name: "統計" })).toBeVisible();
  await expect(header.getByRole("link", { name: "アカウント" })).toBeVisible();
  await expect(header.getByText("me@example.com")).toHaveCount(0);
  await expect(header.getByRole("button", { name: "ログアウト" })).toBeVisible();
  await shot(page, testInfo, "3. 元の画面（統計）に戻り、ヘッダーに「アカウント」（表示名を決めていないとき）とログアウトが出た。メールアドレスは出ない");

  await header.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/stats");
  await expect(page).toHaveURL(/\/login\?next=%2Fstats/);
  await shot(page, testInfo, "4. ログアウトしたので、統計を開くとログイン画面になる");
});

test("UI-02 他人のデッキの URL を開いても、中身は出ず 404 になる", async ({ page, context }, testInfo) => {
  const othersDeck = await createDeck(other.id, { name: "他人の秘密のデッキ" });
  await createCard(othersDeck, { front: "This is someone else's card." });
  await loginAs(context, me);

  const res = await page.goto(`/decks/${othersDeck}`);
  expect(res.status()).toBe(404);
  await expect(page.getByText("他人の秘密のデッキ")).toHaveCount(0);
  await expect(page.getByText("someone else's card")).toHaveCount(0);
  await shot(page, testInfo, "1. 他人のデッキを開くと 404");

  const study = await page.goto(`/decks/${othersDeck}/study`);
  expect(study.status()).toBe(404);
  await shot(page, testInfo, "2. 他人のデッキの学習画面も 404");
});

test("UI-03 学習画面をキーボードで進める（→ で答え、→ で覚えている、1 で覚えていない）。結果が DB に残る", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "キーボードのデッキ" });
  await createCard(deck, { front: "I was skeptical at first.", back: "最初は疑っていた", word: "skeptical" });
  await loginAs(context, me);

  await page.goto(`/decks/${deck}/study`);
  await expect(page.getByText("残り 1 枚")).toBeVisible();
  await expect(page.getByText("I was skeptical at first.")).toBeVisible();
  await shot(page, testInfo, "1. 表の面（例文）が出ている");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".study-remembered")).toBeVisible();
  await expect(page.getByText("最初は疑っていた")).toBeVisible();
  await shot(page, testInfo, "2. → を押すと、答え（裏の面）が出る");

  await page.keyboard.press("1");
  await expect(page.getByText(/やり直し 1 枚/)).toBeVisible();
  await shot(page, testInfo, "3. 1（覚えていない）を押すと、やり直しに回る");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/1 枚を学習しました/)).toBeVisible();
  await expect(page.getByText(/覚えている 1 回 \/ 覚えていない 1 回/)).toBeVisible();
  await shot(page, testInfo, "4. やり直しで → → （覚えている）を押すと、終わりの表示になる");

  // 答えは画面の裏で保存されるので、保存されるまで待って確かめる
  await expect
    .poll(async () => {
      const { rows } = await db().query("SELECT remembered FROM review_logs WHERE deck_id = $1 ORDER BY id", [deck]);
      return rows.map((r) => r.remembered);
    })
    .toEqual([false, true]);
});

const TRANSCRIPT = "0:00 I think this is a very good day for us.\n0:05 I was skeptical about the whole plan at first.";

test("UI-04 字幕の取り込み: 保存した字幕から i+1 の文を探し、選んでカードに登録する", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "取り込みのデッキ", transcript: TRANSCRIPT });
  await loginAs(context, me);

  await page.goto(`/decks/${deck}/import`);
  const candidate = page.locator("ul.candidates > li").filter({ hasText: "skeptical" });
  await expect(candidate).toBeVisible();
  await expect(page.getByRole("tab", { name: /i\+1/ })).toHaveAttribute("aria-selected", "true");
  await shot(page, testInfo, "1. 保存した字幕を自動で解析し、i+1（知らない語が1つ）の文が出た");

  await candidate.locator('input[type="checkbox"]').check();
  const registerButton = page.getByRole("button", { name: "選んだ 1 文をカードに登録" });
  await expect(registerButton).toBeVisible();
  await shot(page, testInfo, "2. 文を選ぶと、登録のボタンが出る");

  await registerButton.click();
  await expect(page).toHaveURL(new RegExp(`/decks/${deck}$`));
  await expect(page.getByText("I was skeptical about the whole plan at first.")).toBeVisible();
  await shot(page, testInfo, "3. 登録すると、デッキの画面にカードが並ぶ");

  const { rows } = await db().query(
    "SELECT c.front, t.word FROM cards c JOIN card_targets t ON t.card_id = c.id WHERE c.deck_id = $1",
    [deck]
  );
  expect(rows).toEqual([{ front: "I was skeptical about the whole plan at first.", word: "skeptical" }]);
});

test("UI-05 統計画面: 覚え具合の数と割合が、カードの状態どおりに出る。他人のカードは数えない", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "統計のデッキ" });
  await createCard(deck, { front: "Learned one.", word: "learned", review: { box: 3, count: 3 } });
  await createCard(deck, { front: "Learning one.", word: "learning", review: { box: 1, count: 1 } });
  await createCard(deck, { front: "Forgot one.", word: "forgot", review: { box: 0, count: 2, lapses: 1 } });
  await createCard(deck, { front: "New one.", word: "new" });
  const othersDeck = await createDeck(other.id, { name: "他人のデッキ" });
  await createCard(othersDeck, { front: "Others.", review: { box: 3, count: 3 } });
  await loginAs(context, me);

  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "覚え具合（全 4 枚）" })).toBeVisible();
  const tiles = page.locator(".stat-tile");
  for (const [label, value] of [["覚えた", "1"], ["覚え中", "1"], ["覚えていない", "1"], ["未学習", "1"]]) {
    const tile = tiles.filter({ has: page.locator(".stat-label", { hasText: new RegExp(`^${label}$`) }) });
    await expect(tile.locator(".stat-value")).toHaveText(value);
    await expect(tile.locator(".stat-sub")).toHaveText("25%");
  }
  await expect(page.getByText("他人のデッキ")).toHaveCount(0);
  await shot(page, testInfo, "1. 覚えた・覚え中・覚えていない・未学習が 1 枚ずつ（25%）。他人のデッキは出ない");
});

test("UI-06 トップ画面: デッキごとに、今日のカードの数と動画の理解度が出る", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "理解度のデッキ", transcript: TRANSCRIPT });
  await createCard(deck, { front: "Due today.", word: "due" });
  await createCard(deck, { front: "Tomorrow.", word: "tomorrow", review: { box: 1, count: 1 } });
  await loginAs(context, me);

  await page.goto("/");
  const item = page.locator("li").filter({ hasText: "理解度のデッキ" });
  await expect(item.getByText(/今日 1 枚/)).toBeVisible();
  await expect(item.getByText(/2 枚/)).toBeVisible();
  await expect(item.getByText("理解度 50%")).toBeVisible();
  await shot(page, testInfo, "1. 今日のカード 1 枚（全 2 枚）、理解度 50%（2文のうち1文がわかる）");
});

test("UI-07 デッキの共有: 表示名を決めて公開すると、ほかの人がみんなのデッキから取り込める", async ({ page, context, browser }, testInfo) => {
  const deck = await createDeck(me.id, { name: "共有するデッキ" });
  await createCard(deck, { front: "I was skeptical at first.", back: "最初は疑っていた", word: "skeptical" });
  await createCard(deck, { front: "We figured it out.", word: "figure out" });
  await loginAs(context, me);

  await page.goto("/account");
  await page.getByLabel("表示名").fill("はなこ");
  await page.getByRole("button", { name: "表示名を保存" }).click();
  await expect(page.getByText("表示名を「はなこ」にしました。")).toBeVisible();
  await shot(page, testInfo, "1. アカウントの画面で、表示名を決める");

  await page.goto(`/decks/${deck}/edit`);
  await page.getByRole("button", { name: "このデッキを公開する" }).click();
  await expect(page.getByRole("button", { name: "公開をやめる" })).toBeVisible();
  await expect(page.locator(".publish-panel")).toContainText("作った人: はなこ");
  await shot(page, testInfo, "2. デッキの編集の画面で公開する");

  // ほかのユーザーとしてログインした、別のブラウザ
  const otherContext = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo", viewport: { width: 1100, height: 800 } });
  const otherPage = await otherContext.newPage();
  await loginAs(otherContext, other);
  await otherPage.goto("/");
  await otherPage.locator("header").getByRole("link", { name: "みんなのデッキ" }).click();
  await expect(otherPage).toHaveURL(/\/shared$/);
  const item = otherPage.locator(".shared-decks li").filter({ hasText: "共有するデッキ" });
  await expect(item).toContainText("はなこ");
  await expect(item).toContainText("2 枚");
  await expect(otherPage.getByText("me@example.com")).toHaveCount(0);
  await shot(otherPage, testInfo, "3. ほかの人の「みんなのデッキ」に出る（表示名だけで、メールアドレスは出ない）");

  await item.getByRole("link").click();
  await expect(otherPage.getByText("I was skeptical at first.")).toBeVisible();
  await shot(otherPage, testInfo, "4. 開くと、カードの中身が見られる");

  await otherPage.getByRole("button", { name: "自分のデッキに取り込む（2 枚）" }).click();
  await expect(otherPage.getByText("みんなのデッキから取り込みました")).toBeVisible();
  await expect(otherPage.getByRole("heading", { name: "共有するデッキ" })).toBeVisible();
  await expect(otherPage.getByText("We figured it out.")).toBeVisible();
  await shot(otherPage, testInfo, "5. 取り込むと、自分のデッキになる");

  await otherPage.goto("/shared");
  await expect(otherPage.locator(".shared-decks li").filter({ hasText: "共有するデッキ" })).toContainText("取り込みずみ");
  await shot(otherPage, testInfo, "6. 一覧に「取り込みずみ」と出る");
  await otherContext.close();

  const { rows } = await db().query(
    "SELECT d.user_id, d.source_deck_id, COUNT(c.id)::int AS cards FROM decks d JOIN cards c ON c.deck_id = d.id WHERE d.user_id = $1 GROUP BY d.id",
    [other.id]
  );
  expect(rows).toEqual([{ user_id: other.id, source_deck_id: deck, cards: 2 }]);
});

test("UI-08 ホームページ: ログインしていない人がトップを開くと、アプリの紹介が出る。見本のカードをさわれて、登録へ進める", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("好きな動画が");
  await expect(page.getByText("私のデッキ")).toHaveCount(0);
  await shot(page, testInfo, "1. ログインしていないと、トップにホームページが出る（全体）");

  const demo = page.locator(".lp-demo");
  await demo.getByRole("button", { name: "答えを見る" }).click();
  await expect(demo).toContainText("最初は、その計画に懐疑的だった。");
  await demo.screenshot().then((body) => testInfo.attach("2. 見本のカードで「答えを見る」を押すと、和訳と意味が出る", { body, contentType: "image/png" }));
  await demo.getByRole("button", { name: "覚えている" }).click();
  await demo.getByRole("button", { name: "答えを見る" }).click();
  await demo.getByRole("button", { name: "覚えていない" }).click();
  await demo.getByRole("button", { name: "答えを見る" }).click();
  await demo.getByRole("button", { name: "覚えている" }).click();
  await expect(demo).toContainText("3 枚を学習しました");
  await expect(demo).toContainText("覚えている 2 / 覚えていない 1");
  await demo.screenshot().then((body) => testInfo.attach("3. 3 枚に答えると、終わりの表示になる", { body, contentType: "image/png" }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await testInfo.attach("4. スマートフォンの幅（はじめの画面）", { body: await page.screenshot(), contentType: "image/png" });
  await page.setViewportSize({ width: 1100, height: 800 });

  await page.locator(".lp-hero").getByRole("link", { name: "無料で始める" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await shot(page, testInfo, "5. 「無料で始める」で、新規登録の画面へ");
});

test("UI-09 ログインしているときのトップは、今までどおりデッキの一覧", async ({ page, context }, testInfo) => {
  await createDeck(me.id, { name: "わたしのデッキ" });
  await loginAs(context, me);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "デッキ" })).toBeVisible();
  await expect(page.getByText("わたしのデッキ")).toBeVisible();
  await expect(page.locator(".lp")).toHaveCount(0);
  await shot(page, testInfo, "1. ログインしていると、デッキの一覧が出る");
});

test("UI-10 動画を探す: ほかの人が学んだ動画が、理解度とレベルに合うかの印つきで出る。デッキ名・見られない動画は出ない。絞り込めて、選ぶとデッキを作れる", async ({ page, context }, testInfo) => {
  const lines = [
    "I like to walk in the park every morning.", "We had a nice dinner with my family.", "The weather is very good today.",
    "She bought a new book at the store.", "My brother plays soccer after school.", "They went to the beach last summer.",
    "He drinks coffee before work every day.", "The children are playing in the garden.", "We watched a movie on Friday night.",
    "A quaint little house sat on the corner.", "Her singing was mesmerizing to everyone.", "She is a meticulous planner at work.",
  ];
  const transcript = lines.map((l, i) => `0:${String(i * 3).padStart(2, "0")} ${l}`).join("\n");
  await createDeck(other.id, { name: "ほかの人の秘密のデッキ名", videoId: "pubAAAAAAAA", transcript });
  await createDeck(other.id, { name: "消された動画のデッキ", videoId: "delBBBBBBBB", transcript });
  // タイトルは取りずみにしておく（oEmbed には問い合わせない）
  for (const [id, title, available] of [["pubAAAAAAAA", "A Walk in the Park", true], ["delBBBBBBBB", null, false]]) {
    await db().query(
      "INSERT INTO videos (video_id, title, channel_title, available, checked_at) VALUES ($1, $2, 'Some Channel', $3, now())",
      [id, title, available]
    );
  }
  await loginAs(context, me);

  await page.goto("/search");
  await expect(page.getByText("YouTube で探す")).toHaveCount(0);
  const recs = page.locator(".recommendations");
  await expect(recs.locator("li")).toHaveCount(1);
  const item = recs.locator("li").filter({ hasText: "A Walk in the Park" });
  await expect(item.getByText("ちょうどいい")).toBeVisible();
  await expect(item.getByText(/理解度 75%/)).toBeVisible();
  await expect(item.getByText(/1人が学習/)).toBeVisible();
  await expect(page.getByText("ほかの人の秘密のデッキ名")).toHaveCount(0);
  await shot(page, testInfo, "1. みんなが学んだ動画が「ちょうどいい・理解度 75%・1人が学習」で出る。消された動画とデッキ名は出ない");

  // 絞り込み（その場で）
  await page.getByLabel("キーワード").fill("cooking");
  await expect(recs.locator("li")).toHaveCount(0);
  await expect(page.getByText("条件に合う動画がありません")).toBeVisible();
  await page.getByLabel("キーワード").fill("park");
  await page.getByLabel("レベル").selectOption("easy");
  await expect(recs.locator("li")).toHaveCount(0);
  await page.getByLabel("レベル").selectOption("good");
  await expect(recs.locator("li")).toHaveCount(1);
  await shot(page, testInfo, "2. キーワード「park」・レベル「ちょうどいい」で絞り込むと出る（「cooking」や「やさしい」では出ない）");

  await item.getByRole("link", { name: "この動画でデッキを作る" }).click();
  await expect(page).toHaveURL(/\/decks\/new\?/);
  await expect(page.locator('input[name="url"]')).toHaveValue("https://www.youtube.com/watch?v=pubAAAAAAAA");
  await expect(page.locator('input[name="name"]')).toHaveValue("A Walk in the Park");
  await shot(page, testInfo, "3. 新しいデッキの画面に、動画の URL とタイトルが入っている");
});

test("UI-11 レベル設定: 選んだレベルを保存すると、保存したあとも選んだレベルが出ている。開き直しても同じ", async ({ page, context }, testInfo) => {
  await loginAs(context, me);
  await page.goto("/settings");
  const level = page.getByLabel("あなたのレベル");
  await level.selectOption("eiken-p1");
  await shot(page, testInfo, "1. 英検準1級を選んだ");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("status")).toHaveText("保存しました");
  await expect(level).toHaveValue("eiken-p1");
  await expect(page.locator("main")).toContainText("いまの設定: 英検準1級");
  await shot(page, testInfo, "2. 保存したあとも、英検準1級のまま");

  await page.reload();
  await expect(level).toHaveValue("eiken-p1");
  await shot(page, testInfo, "3. 開き直しても英検準1級");

  // 語彙数を直接指定したときも、保存したあとに入れた数が残る
  await level.selectOption("custom");
  await page.getByLabel("知っている単語の数").fill("6400");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("status")).toHaveText("保存しました");
  await expect(level).toHaveValue("custom");
  await expect(page.getByLabel("知っている単語の数")).toHaveValue("6400");
  await expect(page.locator("main")).toContainText("上位 6,400 語");
  await shot(page, testInfo, "4. 語彙数を直接指定して保存しても、入れた数のまま");
});

test("UI-12 デッキの一覧: 覚えた単語で作った物語のデッキは、淡い色と「物語」の印で、ほかのデッキと区別できる", async ({ page, context }, testInfo) => {
  await createDeck(me.id, { name: "動画のデッキ" });
  await createDeck(me.id, { name: "森の物語", kind: "story" });
  await loginAs(context, me);
  await page.goto("/");

  const storyRow = page.locator(".decks li", { hasText: "森の物語" });
  const videoRow = page.locator(".decks li", { hasText: "動画のデッキ" });
  await expect(storyRow.getByText("物語", { exact: true })).toBeVisible();
  await expect(videoRow.getByText("物語", { exact: true })).toHaveCount(0);
  const bg = (row) => row.locator("a").evaluate((a) => getComputedStyle(a).backgroundColor);
  expect(await bg(storyRow)).not.toBe(await bg(videoRow));
  await shot(page, testInfo, "1. 物語のデッキだけ、淡い色と「物語」の印が付いている");
});

// 勉強時間の合計（秒）。送られてくるまで少し待つことがあるので、expect.poll で使う
const studySeconds = async (userId, kind) =>
  (await db().query("SELECT COALESCE(SUM(seconds), 0)::int AS s FROM study_time WHERE user_id = $1 AND kind = $2", [userId, kind]))
    .rows[0].s;

test("UI-13 勉強時間（単語）: 記憶テストの画面で操作していた時間が記録される。2分を超えて何もしない分は数えない", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "時間のデッキ" });
  await createCard(deck, { front: "I like to walk in the park.", word: "walk" });
  await loginAs(context, me);
  await page.clock.install({ time: new Date("2026-11-20T03:00:00Z") });
  await page.goto(`/decks/${deck}/study`);
  await expect(page.locator(".study-card")).toBeVisible();

  const touch = () => page.locator(".study-progress").click();
  await page.clock.runFor(20_000);
  await touch(); // 20秒
  await page.clock.runFor(20_000);
  await touch(); // 40秒
  await page.clock.runFor(300_000); // 5分何もしない → 2分（120秒）だけ数える
  await touch(); // 160秒
  await page.clock.runFor(10_000); // 170秒
  await shot(page, testInfo, "1. 記憶テストの画面で、操作しながら学習した");
  await page.goto("/stats");

  await expect.poll(() => studySeconds(me.id, "vocab")).toBeGreaterThanOrEqual(169);
  expect(await studySeconds(me.id, "vocab")).toBeLessThanOrEqual(171);
  expect(await studySeconds(me.id, "listening")).toBe(0);
  expect(await studySeconds(other.id, "vocab")).toBe(0);
  await expect(page.locator(".stat-tile", { hasText: "今日の単語" })).toContainText("2分");
  await shot(page, testInfo, "2. 統計の画面の「今日の単語」に出た（5分何もしなかった分は2分までしか数えない）");
});

// YouTube の IFrame Player API の偽物。再生・一時停止を、テストから起こせる
const FAKE_YT_API = `
window.YT = {
  Player: function (el, opts) {
    const self = this;
    window.__yt = { opts, seeks: [], setState: (s) => opts.events.onStateChange({ data: s, target: self }) };
    this.seekTo = (t) => window.__yt.seeks.push(t);
    this.playVideo = () => window.__yt.setState(1);
    this.destroy = () => {};
    const frame = document.createElement("iframe");
    el.replaceWith(frame);
    setTimeout(() => opts.events.onReady({ target: self }), 0);
  },
};
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

test("UI-14 勉強時間（リスニング）: デッキの画面の動画を再生していた時間が記録される。カードの「動画のこの場面」はその時刻から再生する", async ({ page, context }, testInfo) => {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_YT_API })
  );
  const deck = await createDeck(me.id, { name: "動画のデッキ", videoId: "aaaaaaaaaaa" });
  const card = await createCard(deck, { front: "I like to walk in the park.", word: "walk" });
  await db().query("UPDATE cards SET video_id = 'aaaaaaaaaaa', start_seconds = 42 WHERE id = $1", [card]);
  await loginAs(context, me);
  await page.clock.install({ time: new Date("2026-11-20T03:00:00Z") });
  await page.goto(`/decks/${deck}`);
  await expect(page.locator(".deck-video iframe")).toBeAttached();
  await expect(page.locator(".deck-video")).toContainText("リスニングの時間として記録します");

  await page.locator(".cards summary").first().click();
  await page.getByRole("link", { name: /動画のこの場面/ }).click();
  expect(await page.evaluate(() => window.__yt.seeks)).toEqual([42]);
  await expect(page).toHaveURL(new RegExp(`/decks/${deck}$`)); // 別のタブ・画面には移らない
  await page.clock.runFor(45_000); // 45秒再生
  await page.evaluate(() => window.__yt.setState(2)); // 一時停止
  await page.clock.runFor(60_000); // 止めている間は数えない
  await shot(page, testInfo, "1. デッキの画面で、カードの場面から動画を再生した");
  await page.goto("/stats");

  await expect.poll(() => studySeconds(me.id, "listening")).toBeGreaterThanOrEqual(44);
  expect(await studySeconds(me.id, "listening")).toBeLessThanOrEqual(46);
  const { rows } = await db().query("SELECT DISTINCT deck_id FROM study_time WHERE user_id = $1 AND kind = 'listening'", [me.id]);
  expect(rows).toEqual([{ deck_id: deck }]);
});

test("UI-15 勉強時間を手で足す: 統計の画面で足すと今日の時間に出る。取り消すと戻る", async ({ page, context }, testInfo) => {
  await loginAs(context, me);
  await page.goto("/stats");
  const tile = page.locator(".stat-tile", { hasText: "今日のリスニング" });
  await expect(tile).toContainText("0分");

  await page.getByLabel("種類").selectOption("listening");
  await page.getByLabel("時間（分）").fill("25");
  await page.getByRole("button", { name: "今日に足す" }).click();
  await expect(tile).toContainText("25分");
  await expect(page.locator(".manual-time-list")).toContainText("リスニング 25分");
  await shot(page, testInfo, "1. リスニング 25分を足した");

  await page.getByRole("button", { name: /を取り消す/ }).click();
  await expect(tile).toContainText("0分");
  await expect(page.locator(".manual-time-list")).toHaveCount(0);
  await shot(page, testInfo, "2. 取り消すと 0分に戻った");
});

// 読み上げ（Web Speech API）の偽物。読み上げた文と、止めた回数を残す
const FAKE_SPEECH = `
window.__spoken = [];
window.__speaking = false;
window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
Object.defineProperty(window, "speechSynthesis", {
  value: {
    speak(u) { window.__spoken.push(u.text); window.__speaking = true; },
    cancel() { window.__speaking = false; },
    getVoices() { return []; },
    addEventListener() {},
    removeEventListener() {},
  },
});
`;

test("UI-16 記憶テスト: カードが出たら（答えを考える表の面で）英文を自動で読み上げる。→ でめくると読み上げを止める。答えの面では読み上げない。設定で止められる", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "読み上げのデッキ" });
  await createCard(deck, { front: "I like to walk in the park.", word: "walk" });
  await createCard(deck, { front: "The weather is very good today.", word: "weather" });
  await loginAs(context, me);
  await page.addInitScript(FAKE_SPEECH);
  await page.goto(`/decks/${deck}/study`);
  const spoken = () => page.evaluate(() => window.__spoken);
  await expect(page.locator(".study-front")).toHaveText("I like to walk in the park.");
  await expect.poll(spoken).toEqual(["I like to walk in the park."]); // 初めの設定で読み上げる
  expect(await page.evaluate(() => window.__speaking)).toBe(true);
  await shot(page, testInfo, "1. カードが出ると、英文を読み上げた");

  await page.keyboard.press("ArrowRight"); // わかった → めくる
  await expect(page.locator(".study-back")).toBeVisible();
  expect(await page.evaluate(() => window.__speaking)).toBe(false); // 止めた
  await page.waitForTimeout(300);
  expect(await spoken()).toEqual(["I like to walk in the park."]); // 答えの面では読み上げない

  await page.keyboard.press("ArrowRight"); // 覚えている → 次のカード
  await expect(page.locator(".study-front")).toHaveText("The weather is very good today.");
  await expect.poll(spoken).toEqual(["I like to walk in the park.", "The weather is very good today."]);

  // 設定で「カードが出たら読み上げる」を外すと、読み上げない
  await page.addInitScript(() => localStorage.setItem("flashcard-speech", JSON.stringify({ autoReadFront: false })));
  await page.goto(`/decks/${deck}/study`);
  await expect(page.locator(".study-front")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await spoken()).toEqual([]);
});

// Chrome と同じ癖を持つ読み上げの偽物: 読み上げ中に止めた直後（同じ処理の中）に読み上げると、その読み上げは消える
const FAKE_SPEECH_CHROME = `
window.__spoken = [];
let speaking = false;
let justCancelled = false;
window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
Object.defineProperty(window, "speechSynthesis", {
  value: {
    get speaking() { return speaking; },
    get pending() { return false; },
    get paused() { return false; },
    speak(u) {
      if (justCancelled) return; // 消える
      window.__spoken.push(u.text);
      speaking = true;
    },
    cancel() {
      if (speaking) {
        justCancelled = true;
        setTimeout(() => { justCancelled = false; }, 0);
      }
      speaking = false;
    },
    resume() {},
    getVoices() { return []; },
    addEventListener() {},
    removeEventListener() {},
  },
});
`;

test("UI-17 記憶テスト: 次のカードが出ると必ず読み上げる（読み上げ中に前のカードに戻っても・同じカードがもう一度出ても）", async ({ page, context }, testInfo) => {
  const deck = await createDeck(me.id, { name: "読み上げのデッキ" });
  await createCard(deck, { front: "I like to walk in the park.", word: "walk" });
  await createCard(deck, { front: "The weather is very good today.", word: "weather" });
  await loginAs(context, me);
  await page.addInitScript(FAKE_SPEECH_CHROME);
  await page.goto(`/decks/${deck}/study`);
  const spoken = () => page.evaluate(() => window.__spoken);
  await expect.poll(spoken).toEqual(["I like to walk in the park."]);

  await page.keyboard.press("ArrowRight"); // めくる（読み上げを止める）
  await page.keyboard.press("ArrowRight"); // 覚えている → 次のカードを読み上げる
  await expect.poll(spoken).toEqual(["I like to walk in the park.", "The weather is very good today."]);

  // 読み上げ中に ← で前のカードに戻る（止めた直後に読み上げると消える Chrome の癖があっても、読み上げる）
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".study-front")).toHaveText("I like to walk in the park.");
  await expect.poll(spoken).toEqual([
    "I like to walk in the park.",
    "The weather is very good today.",
    "I like to walk in the park.",
  ]);

  // 最後のカードで ← を続けると、同じカードが「もう一度」で何度も出る。出るたびに読み上げる
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight"); // 1枚目は覚えている → 残りは2枚目だけ
  await expect(page.locator(".study-front")).toHaveText("The weather is very good today.");
  for (let i = 0; i < 2; i++) {
    const before = (await spoken()).length;
    await page.keyboard.press("ArrowRight"); // めくる
    await page.keyboard.press("ArrowLeft"); // 覚えていない
    await expect(page.locator(".study-card .tag")).toHaveText("もう一度");
    await expect.poll(spoken).toHaveLength(before + 1);
  }
  await shot(page, testInfo, "1. 同じカードがもう一度出ても、そのたびに読み上げた");
});
