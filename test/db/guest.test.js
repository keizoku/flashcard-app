import { beforeEach, describe, expect, test } from "vitest";
import { GET as cleanupRoute } from "@/app/api/cron/cleanup-guests/route";
import { addCard, addDeck } from "@/app/actions";
import { updateDisplayName } from "@/app/account/actions";
import { changePassword, login } from "@/app/auth/actions";
import { completePasskeyRegistration, startPasskeyRegistration } from "@/app/auth/passkeyActions";
import { registerCards } from "@/app/decks/[id]/import/actions";
import { endGuest, startGuest } from "@/app/try/actions";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  createGuest,
  deleteExpiredGuests,
  GUEST_BLOCKED,
  GUEST_HOURS,
  GUEST_LIMITS,
  guestHoursLeft,
  MAX_ACTIVE_GUESTS,
  MAX_STARTS_PER_IP,
} from "@/lib/guest";
import { ensureScenes, saveSceneImage } from "@/lib/scenes";
import { copyPublicDeck, setDeckPublished, setDisplayName } from "@/lib/sharing";
import { createStoryDeck } from "@/lib/story";
import { createCard, createDeck, createUser, formData, loginAs, logoutCookie, PASSWORD, resetDb, runAction } from "../helpers.js";

// おためしユーザー（新規登録をせずに、1日だけ全機能を試せるアカウント）

let other;
beforeEach(async () => {
  await resetDb();
  delete process.env.ALLOWED_EMAILS;
  other = await createUser({ email: "other@example.com" });
});

const count = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;

// 画面の「おためしを始める」を押したのと同じ（接続元の IP を決めて）
async function start(ip = "203.0.113.1", agree = true) {
  globalThis.testHeaders = { "x-forwarded-for": `${ip}, 10.0.0.1` };
  return runAction(startGuest({ error: null }, formData(agree ? { agree: "on" } : {})));
}

// おためしユーザーを作って、ログインした状態にする。
// 最初から入っているお試しの単語帳は、数を確かめやすいよう消しておく（keepStarter で残す）
async function guestLogin(ip = "203.0.113.1", { keepStarter = false } = {}) {
  const { redirectTo } = await start(ip);
  expect(redirectTo).toBe("/");
  const user = await getCurrentUser();
  if (!keepStarter) await pool.query("DELETE FROM decks WHERE user_id = $1", [user.id]);
  return user;
}

// 自分のカードを n 枚にする（1つの単語帳に入れる）
async function fillCards(userId, n) {
  const deck = await createDeck(userId, { name: "filled" });
  await pool.query(
    "INSERT INTO cards (deck_id, front, back) SELECT $1, 'Hello ' || g, 'こんにちは' FROM generate_series(1, $2) g",
    [deck, n]
  );
  return deck;
}

describe("おためしを始める", () => {
  test("GU-01 削除されることに同意しないと始められない。同意すると、1日で消えるアカウントができ、ログインしてトップへ移る", async () => {
    const before = await count("SELECT count(*)::int AS n FROM users");
    expect((await start("203.0.113.1", false)).result.error).toContain("チェック");
    expect(await count("SELECT count(*)::int AS n FROM users")).toBe(before);
    expect(await getCurrentUser()).toBeNull();

    const user = await guestLogin();
    expect(user.email).toMatch(/^guest-[a-z0-9_-]+@guest\.invalid$/);
    const hours = (new Date(user.guestExpiresAt) - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(GUEST_HOURS - 0.1);
    expect(hours).toBeLessThanOrEqual(GUEST_HOURS);
    // セッションも、アカウントと同じときに切れる
    const { rows } = await pool.query("SELECT expires_at FROM user_sessions WHERE user_id = $1", [user.id]);
    expect(rows[0].expires_at.getTime()).toBe(new Date(user.guestExpiresAt).getTime());
    // 接続元の IP は、そのまま保存しない
    const { rows: starts } = await pool.query("SELECT ip_hash FROM guest_starts");
    expect(starts).toHaveLength(1);
    expect(starts[0].ip_hash).not.toContain("203.0.113.1");
    // ログイン中にもう一度開いても、新しく作らない
    expect((await start()).redirectTo).toBe("/");
    expect(await count("SELECT count(*)::int AS n FROM users WHERE guest_expires_at IS NOT NULL")).toBe(1);
  });

  test("GU-02 おためしユーザーには、パスワードでログインできない", async () => {
    const user = await guestLogin();
    logoutCookie();
    for (const password of ["", PASSWORD, "guest-no-password"]) {
      const r = await runAction(login({}, formData({ email: user.email, password })));
      expect(r.redirectTo).toBeNull();
      expect(r.result.error).toBeTruthy();
    }
    expect(await getCurrentUser()).toBeNull();
  });

  test("GU-03 使える人を決めていても（招待制）、おためしユーザーは期限まで使える。期限が過ぎたら、消える前でもログインしていない扱い", async () => {
    process.env.ALLOWED_EMAILS = "owner@example.com";
    const user = await guestLogin();
    expect((await getCurrentUser())?.id).toBe(user.id);

    await pool.query("UPDATE users SET guest_expires_at = now() - interval '1 second' WHERE id = $1", [user.id]);
    expect(await getCurrentUser()).toBeNull();
    // ふつうのユーザーは、今までどおり使える人だけ
    await loginAs(other);
    expect(await getCurrentUser()).toBeNull();
  });

  test("GU-04 同じ接続元からは、1日に3回まで（MAX_STARTS_PER_IP）。おためしを終えても回数は戻らない。ほかの接続元からは始められる", async () => {
    for (let i = 0; i < MAX_STARTS_PER_IP; i++) {
      await guestLogin("198.51.100.7");
      await runAction(endGuest());
    }
    const r = await start("198.51.100.7");
    expect(r.redirectTo).toBeNull();
    expect(r.result.error).toContain(`${MAX_STARTS_PER_IP}回まで`);
    expect(await getCurrentUser()).toBeNull();
    expect((await start("198.51.100.8")).redirectTo).toBe("/");

    // 1日たった記録は数えない（片付けで消える）
    await pool.query("UPDATE guest_starts SET created_at = now() - interval '25 hours'");
    expect((await createGuest({ ip: "198.51.100.7" })).user).toBeTruthy();
  });

  test("GU-16 手元の開発サーバー（next dev）では、同じ接続元・1日の回数の制限をかけない（動作確認のため）。本番ではかける", async () => {
    const saved = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      for (let i = 0; i < MAX_STARTS_PER_IP + 2; i++) {
        expect((await createGuest({ ip: "198.51.100.9" })).user).toBeTruthy();
      }
      process.env.NODE_ENV = "production";
      expect((await createGuest({ ip: "198.51.100.9" })).error).toContain(`${MAX_STARTS_PER_IP}回まで`);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  test("GU-05 同時に使えるおためしユーザーは30人まで（MAX_ACTIVE_GUESTS。いっぱいなら始められない）", async () => {
    await pool.query(
      `INSERT INTO users (email, password_hash, verified_at, guest_expires_at)
       SELECT 'guest-' || g || '@guest.invalid', 'x', now(), now() + interval '1 hour' FROM generate_series(1, $1) g`,
      [MAX_ACTIVE_GUESTS]
    );
    const r = await createGuest({ ip: "192.0.2.1" });
    expect(r.error).toContain("いっぱい");
    // 期限の過ぎた人は数えない（始めるときに片付ける）
    await pool.query("UPDATE users SET guest_expires_at = now() - interval '1 second' WHERE email = 'guest-1@guest.invalid'");
    expect((await createGuest({ ip: "192.0.2.1" })).user).toBeTruthy();
  });
});

describe("おためしで作れる量", () => {
  test("GU-06 単語帳は5冊まで（画面から作る・物語・みんなの単語帳の取り込み）。ふつうのユーザーには制限がない", async () => {
    const guest = await guestLogin();
    for (let i = 0; i < GUEST_LIMITS.decks; i++) {
      const { redirectTo } = await runAction(addDeck({}, formData({ name: `Deck ${i}` })));
      expect(redirectTo).toMatch(/^\/decks\/\d+/);
    }
    const r = await runAction(addDeck({}, formData({ name: "one more" })));
    expect(r.result.error).toBe(`おためしでは、単語帳は${GUEST_LIMITS.decks}冊までです`);

    const story = await createStoryDeck(guest.id, { answer: "タイトル: T\n[1] I was skeptical.\n訳: 疑っていた。", words: ["skeptical"] });
    expect(story.error).toContain("冊まで");

    const shared = await createDeck(other.id, { name: "shared" });
    await createCard(shared);
    await pool.query("UPDATE decks SET published_at = now() WHERE id = $1", [shared]);
    expect((await copyPublicDeck(guest.id, shared)).error).toContain("冊まで");
    expect(await count("SELECT count(*)::int AS n FROM decks WHERE user_id = $1", [guest.id])).toBe(GUEST_LIMITS.decks);

    // ふつうのユーザー
    await loginAs(other);
    for (let i = 0; i < GUEST_LIMITS.decks + 1; i++) {
      expect((await runAction(addDeck({}, formData({ name: `Mine ${i}` })))).redirectTo).toMatch(/^\/decks\//);
    }
  });

  test("GU-07 カードは全部で200枚まで（1枚ずつ追加・文を選んで登録・取り込み・物語）", async () => {
    const guest = await guestLogin();
    const deck = await fillCards(guest.id, GUEST_LIMITS.cards - 1);
    expect((await addCard(deck, {}, formData({ front: "Last one.", back: "最後" }))).error).toBeNull();
    const r = await addCard(deck, {}, formData({ front: "Too many.", back: "多すぎ" }));
    expect(r.error).toContain(`${GUEST_LIMITS.cards}枚まで`);

    await pool.query("DELETE FROM cards WHERE id IN (SELECT id FROM cards WHERE deck_id = $1 LIMIT 1)", [deck]);
    const item = (s) => ({ sentence: s, back: "", start: null, translation: "", targets: [{ form: "skeptical", lemma: "skeptical" }] });
    const two = await registerCards({ deckId: deck, items: [item("I am skeptical."), item("You are skeptical.")] });
    expect(two.error).toContain(`${GUEST_LIMITS.cards}枚まで`);
    expect((await registerCards({ deckId: deck, items: [item("I am skeptical.")] })).error).toBeNull();
    expect(await count("SELECT count(*)::int AS n FROM cards WHERE deck_id = $1", [deck])).toBe(GUEST_LIMITS.cards);

    const shared = await createDeck(other.id, { name: "shared" });
    await createCard(shared);
    await pool.query("UPDATE decks SET published_at = now() WHERE id = $1", [shared]);
    expect((await copyPublicDeck(guest.id, shared)).error).toContain("枚まで");
    const story = await createStoryDeck(guest.id, { answer: "タイトル: T\n[1] I was skeptical.\n訳: 疑っていた。", words: ["skeptical"] });
    expect(story.error).toContain("枚まで");
    expect(await count("SELECT count(*)::int AS n FROM decks WHERE user_id = $1", [guest.id])).toBe(1);
  });

  test("GU-08 物語の絵は全部で 10MB まで。同じ場面の絵の差し替えは、前の絵を数えない", async () => {
    const guest = await guestLogin();
    const sentences = Array.from({ length: 12 }, (_, i) => ({ text: `Sentence ${i}.`, translation: `文 ${i}` }));
    const { rows } = await pool.query(
      "INSERT INTO decks (user_id, name, kind, sentences) VALUES ($1, '物語: T', 'story', $2) RETURNING id",
      [guest.id, JSON.stringify(sentences)]
    );
    const scenes = await ensureScenes(guest.id, rows[0].id);
    const PNG_HEADER = Buffer.from("89504e470d0a1a0a", "hex");
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(4 * 1024 * 1024)]); // 約 4MB
    expect(await saveSceneImage(guest.id, scenes[0].id, big, "upload")).toEqual({ ok: true });
    expect(await saveSceneImage(guest.id, scenes[1].id, big, "upload")).toEqual({ ok: true });
    expect((await saveSceneImage(guest.id, scenes[2].id, big, "upload")).error).toContain("MB まで");
    expect(await saveSceneImage(guest.id, scenes[1].id, big, "upload")).toEqual({ ok: true });
  });

  test("GU-09 単語帳の公開・表示名・パスワードの変更・パスキーの登録は、おためしでは使えない", async () => {
    const guest = await guestLogin();
    const deck = await createDeck(guest.id);
    await createCard(deck);
    expect(await setDeckPublished(guest.id, deck, true)).toEqual({ error: GUEST_BLOCKED });
    expect(await setDisplayName(guest.id, "Guest")).toEqual({ error: GUEST_BLOCKED });
    expect((await updateDisplayName({}, formData({ displayName: "Guest" }))).error).toBe(GUEST_BLOCKED);
    const pw = await changePassword({}, formData({ current: "", password: "newpassword1", password2: "newpassword1" }));
    expect(pw.error).toBe(GUEST_BLOCKED);
    expect(await startPasskeyRegistration()).toEqual({ error: GUEST_BLOCKED });
    expect(await completePasskeyRegistration({}, "x")).toEqual({ error: GUEST_BLOCKED });
    const { rows } = await pool.query("SELECT display_name, password_hash FROM users WHERE id = $1", [guest.id]);
    expect(rows[0]).toEqual({ display_name: null, password_hash: "guest-no-password" });
    expect(await count("SELECT count(*)::int AS n FROM decks WHERE published_at IS NOT NULL")).toBe(0);
  });
});

describe("おためしユーザーの削除", () => {
  // おためしユーザーに、いろいろなデータを作っておく
  async function withData(userId) {
    const deck = await createDeck(userId);
    await createCard(deck, { targets: [{ word: "hello", form: "Hello" }] });
    await pool.query("INSERT INTO known_words (user_id, word) VALUES ($1, 'apple')", [userId]);
    return deck;
  }

  test("GU-10 期限の過ぎたおためしユーザーを、アカウントごと（単語帳・カード・セッションも）削除する。期限内の人・ふつうのユーザーは消さない", async () => {
    const expired = await guestLogin("192.0.2.10");
    await withData(expired.id);
    logoutCookie();
    const active = await guestLogin("192.0.2.11");
    await withData(active.id);
    const otherDeck = await withData(other.id);
    await pool.query("UPDATE users SET guest_expires_at = now() - interval '1 minute' WHERE id = $1", [expired.id]);

    expect(await deleteExpiredGuests()).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM users WHERE id = $1", [expired.id])).toBe(0);
    for (const table of ["decks", "known_words", "user_sessions"]) {
      expect(await count(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [expired.id])).toBe(0);
    }
    expect(await count("SELECT count(*)::int AS n FROM decks WHERE user_id = $1", [active.id])).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM cards WHERE deck_id = $1", [otherDeck])).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM known_words WHERE user_id = $1", [other.id])).toBe(1);
  });

  test("GU-11 1日1回の片付け（/api/cron/cleanup-guests）は、消した人数を返す。何度呼んでも、期限内の人は消えない", async () => {
    const g = await createGuest({ ip: "192.0.2.20" });
    await createGuest({ ip: "192.0.2.21" });
    await pool.query("UPDATE users SET guest_expires_at = now() - interval '1 minute' WHERE id = $1", [g.user.id]);
    let res = await cleanupRoute();
    expect(await res.json()).toEqual({ deleted: 1 });
    res = await cleanupRoute();
    expect(await res.json()).toEqual({ deleted: 0 });
    expect(await count("SELECT count(*)::int AS n FROM users WHERE guest_expires_at IS NOT NULL")).toBe(1);
  });

  test("GU-12 「おためしを終える」で、すぐにアカウントごと削除してログアウトする。ふつうのユーザーが押しても、何も消さない", async () => {
    const guest = await guestLogin();
    await withData(guest.id);
    expect((await runAction(endGuest())).redirectTo).toBe("/");
    expect(await count("SELECT count(*)::int AS n FROM users WHERE id = $1", [guest.id])).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM decks WHERE user_id = $1", [guest.id])).toBe(0);
    expect(await getCurrentUser()).toBeNull();

    await loginAs(other);
    expect((await runAction(endGuest())).redirectTo).toBe("/");
    expect(await count("SELECT count(*)::int AS n FROM users WHERE id = $1", [other.id])).toBe(1);
    expect((await getCurrentUser())?.id).toBe(other.id);
  });

  test("GU-13 ログインするたびに、期限の過ぎたおためしユーザーも片付ける", async () => {
    const g = await createGuest({ ip: "192.0.2.30" });
    await pool.query("UPDATE users SET guest_expires_at = now() - interval '1 minute' WHERE id = $1", [g.user.id]);
    const { redirectTo } = await runAction(login({}, formData({ email: other.email, password: PASSWORD })));
    expect(redirectTo).toBe("/");
    expect(await count("SELECT count(*)::int AS n FROM users WHERE id = $1", [g.user.id])).toBe(0);
  });
});

test("GU-14 削除までの残り時間は、切り上げた時間（最低1時間）", () => {
  const now = Date.parse("2026-11-26T00:00:00Z");
  expect(guestHoursLeft(new Date(now + 24 * 3600000), now)).toBe(24);
  expect(guestHoursLeft(new Date(now + 90 * 60000), now)).toBe(2);
  expect(guestHoursLeft(new Date(now + 60000), now)).toBe(1);
  expect(guestHoursLeft(new Date(now - 60000), now)).toBe(1);
});

describe("おためし用のサンプル動画", () => {
  // JSX の中から、ある部品に渡した props を探す
  function propsOf(node, component) {
    if (node == null || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const found = propsOf(n, component);
        if (found) return found;
      }
      return null;
    }
    if (node.type === component) return node.props;
    return propsOf(node.props?.children, component);
  }

  test("GU-15 新しい単語帳の画面: おためしユーザーには、すぐ試せるサンプルの動画（3分前後・英語の字幕あり）を出す。ふつうのユーザーには出さない", async () => {
    const { default: NewDeckPage } = await import("@/app/decks/new/page");
    const { default: AddDeckForm } = await import("@/app/decks/new/AddDeckForm");
    const { SAMPLE_VIDEOS } = await import("@/lib/sampleVideos");
    const { parseVideoId } = await import("@/lib/youtube");

    expect(SAMPLE_VIDEOS.length).toBeGreaterThanOrEqual(2);
    for (const v of SAMPLE_VIDEOS) {
      expect(parseVideoId(v.url)).toBe(v.id);
      expect(v.title).toBeTruthy();
      expect(v.seconds).toBeLessThanOrEqual(4 * 60);
    }

    await guestLogin();
    let page = await NewDeckPage({ searchParams: Promise.resolve({}) });
    expect(propsOf(page, AddDeckForm).samples).toEqual(SAMPLE_VIDEOS);

    logoutCookie();
    await loginAs(other);
    page = await NewDeckPage({ searchParams: Promise.resolve({}) });
    expect(propsOf(page, AddDeckForm).samples ?? null).toBeNull();
  });
});

describe("最初から入っている単語帳", () => {
  test("GU-17 おためしを始めると、すぐ試せる単語帳が2冊入っている: 動画の単語帳（字幕・AI で整えた文・カードつき）と、物語の単語帳。ほかの人には入らない", async () => {
    const { STARTER_WORDS } = await import("@/lib/starterDeck");
    const { default: snapshot } = await import("@/data/starter/grand-train-tour.json");
    const guest = await guestLogin("203.0.113.5", { keepStarter: true });
    const { rows: decks } = await pool.query(
      "SELECT id, name, kind, video_id, transcript, sentences, sentences_hash FROM decks WHERE user_id = $1 ORDER BY id",
      [guest.id]
    );
    expect(decks.map((d) => d.kind)).toEqual(["video", "story"]);
    // どちらもサンプルの印が付いている（はじめのステップで、自分で作った単語帳と分けて数える）
    expect((await pool.query("SELECT bool_and(is_sample) AS all FROM decks WHERE user_id = $1", [guest.id])).rows[0].all).toBe(true);

    // 動画の単語帳: 書き出したファイルのとおり
    const video = decks[0];
    expect(video).toMatchObject({ name: snapshot.name, video_id: "5JK7vjVaIvo", transcript: snapshot.transcript });
    expect(video.sentences).toEqual(snapshot.sentences);
    expect(video.sentences_hash).toBeTruthy(); // 字幕を変えていないので、整えた文がそのまま使われる
    const { getDeckTags } = await import("@/lib/tags");
    expect(await getDeckTags(video.id)).toEqual(snapshot.tags);
    const { rows: vcards } = await pool.query(
      `SELECT c.front, c.video_id, c.start_seconds, c.ai_translation, c.review_box, t.word, t.meaning
       FROM cards c JOIN card_targets t ON t.card_id = c.id WHERE c.deck_id = $1 ORDER BY c.id, t.position`,
      [video.id]
    );
    expect(vcards.map((c) => c.front)).toEqual(snapshot.cards.flatMap((c) => c.targets.map(() => c.front)));
    expect(vcards.map((c) => c.word)).toEqual(snapshot.cards.flatMap((c) => c.targets.map((t) => t.word)));
    for (const c of vcards) {
      expect(c).toMatchObject({ video_id: "5JK7vjVaIvo", review_box: 0 });
      expect(c.ai_translation).toBeTruthy();
    }

    // 物語の単語帳
    expect(decks[1].name).toBe("物語: The First Pancake");
    const { rows: scards } = await pool.query(
      "SELECT c.ai_translation, t.word, t.meaning FROM cards c JOIN card_targets t ON t.card_id = c.id WHERE c.deck_id = $1",
      [decks[1].id]
    );
    expect(new Set(scards.map((c) => c.word))).toEqual(new Set(STARTER_WORDS));
    for (const c of scards) {
      expect(c.ai_translation).toBeTruthy();
      expect(c.meaning).toBeTruthy();
    }
    // ほかの人には入らない
    expect(await count("SELECT count(*)::int AS n FROM decks WHERE user_id = $1", [other.id])).toBe(0);
  });
});
