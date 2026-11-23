import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  fitOf,
  getRecommendations,
  listCandidateVideos,
  rankRecommendations,
  refreshVideoInfo,
} from "@/lib/recommend";
import { pool } from "@/lib/db";
import { createDeck, createUser, resetDb } from "../helpers.js";

// おすすめの動画（みんなが学んだ動画を、自分のレベルに合う順に）。API キーは使わない。
// 動画のタイトルは YouTube の oEmbed で取る（テストでは問い合わせず、偽物を渡す）

const NOW = new Date("2026-11-19T00:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);

const EASY = [
  "I like to walk in the park every morning.",
  "We had a nice dinner with my family.",
  "The weather is very good today.",
  "She bought a new book at the store.",
  "My brother plays soccer after school.",
  "They went to the beach last summer.",
  "He drinks coffee before work every day.",
  "The children are playing in the garden.",
  "We watched a movie on Friday night.",
  "I want to learn how to cook.",
  "Our teacher gave us a lot of homework.",
  "The train was late this morning.",
];
const RARE = [
  "A quaint little house sat on the corner.",
  "Her singing was mesmerizing to everyone.",
  "The old house looked dilapidated and sad.",
  "Phones are ubiquitous in the city now.",
  "Their joy was ephemeral but very real.",
  "She is a meticulous planner at work.",
  "It was pure serendipity that we met there.",
];
// 字幕の形（時刻 + 文）にする
const transcript = (lines) => lines.map((l, i) => `0:${String(i * 3).padStart(2, "0")} ${l}`).join("\n");

const A = "aaaaaaaaaaa";
const B = "bbbbbbbbbbb";
const C = "ccccccccccc";

let me;
let u1;
let u2;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  u1 = await createUser({ email: "u1@example.com" });
  u2 = await createUser({ email: "u2@example.com" });
});

// oEmbed の偽物。info: { 動画ID: "ok" | "missing" | "error" }。書いていない ID は "ok"
function fakeInfo(info = {}) {
  return vi.fn(async (id) => {
    const status = info[id] ?? "ok";
    return status === "ok" ? { status, title: `Title ${id}`, channel: `Channel ${id}` } : { status };
  });
}

async function storeVideo(id, available, checkedAt = NOW) {
  await pool.query(
    "INSERT INTO videos (video_id, title, channel_title, available, checked_at) VALUES ($1, $2, 'ch', $3, $4)",
    [id, available ? `Title ${id}` : null, available, checkedAt]
  );
}

describe("レベルに合うか", () => {
  test.each([
    [100, "easy"],
    [85, "easy"],
    [84, "good"],
    [50, "good"],
    [49, "hard"],
    [0, "hard"],
  ])("RC-01 全部わかる文が %s%% → %s（85%%以上はやさしい、50〜84%%はちょうどいい、50%%未満はむずかしい）", (percent, fit) => {
    expect(fitOf(percent)).toBe(fit);
  });

  test("RC-02 ちょうどいい（i+1 の文が多い順）→ やさしい（むずかしめの順）→ むずかしい（やさしめの順）に並べる", () => {
    const items = [
      { id: "e1", fit: "easy", percent: 95, iPlus1: 1 },
      { id: "h1", fit: "hard", percent: 20, iPlus1: 9 },
      { id: "g1", fit: "good", percent: 60, iPlus1: 2 },
      { id: "e2", fit: "easy", percent: 88, iPlus1: 1 },
      { id: "g2", fit: "good", percent: 80, iPlus1: 5 },
      { id: "h2", fit: "hard", percent: 45, iPlus1: 0 },
    ];
    expect(rankRecommendations(items).map((i) => i.id)).toEqual(["g2", "g1", "e2", "e1", "h2", "h1"]);
  });
});

describe("おすすめの候補", () => {
  test("RC-03 ほかの人が字幕付きで単語帳にした動画。学んだ人数を数え、いちばん長い字幕を使う。自分の単語帳にある動画・字幕のない・物語の単語帳は除く", async () => {
    await createDeck(u1.id, { name: "u1 A", videoId: A, transcript: transcript(EASY.slice(0, 10)) });
    await createDeck(u2.id, { name: "u2 A", videoId: A, transcript: transcript(EASY) });
    await createDeck(u1.id, { name: "u1 A again", videoId: A, transcript: transcript(EASY.slice(0, 3)) });
    await createDeck(u1.id, { name: "u1 B", videoId: B, transcript: transcript(EASY) });
    await createDeck(me.id, { name: "my B", videoId: B, transcript: transcript(EASY) });
    await createDeck(u1.id, { name: "no transcript", videoId: C });
    await createDeck(u2.id, { name: "story", videoId: C, transcript: transcript(EASY), kind: "story" });
    await createDeck(u2.id, { name: "no video", transcript: transcript(EASY) });

    const list = await listCandidateVideos(me.id);
    expect(list.map((v) => v.videoId)).toEqual([A]);
    expect(list[0].learners).toBe(2);
    expect(list[0].transcript).toBe(transcript(EASY));
    // 単語帳の名前・ユーザーは返さない
    expect(Object.keys(list[0]).sort()).toEqual(["learners", "transcript", "videoId"]);
  });
});

describe("動画のタイトルを取る", () => {
  test("RC-04 まだ取っていない・7日より前に取った動画だけを問い合わせる。見られない動画（非公開・消された）は、見られないにする。問い合わせに失敗したら、前の情報を残す", async () => {
    await storeVideo(A, true, daysAgo(1));
    await storeVideo(B, true, daysAgo(8));
    await storeVideo(C, true, daysAgo(8));
    const fetchInfo = fakeInfo({ [B]: "missing", [C]: "error" });

    await refreshVideoInfo([A, B, C, "ddddddddddd"], { fetchInfo, now: NOW });
    expect(fetchInfo.mock.calls.map((c) => c[0]).sort()).toEqual([B, C, "ddddddddddd"]);

    const { rows } = await pool.query("SELECT video_id, title, channel_title, available, checked_at FROM videos ORDER BY video_id");
    const byId = Object.fromEntries(rows.map((r) => [r.video_id, r]));
    expect(byId[B]).toMatchObject({ available: false });
    expect(byId[C]).toMatchObject({ available: true, title: `Title ${C}`, checked_at: daysAgo(8) });
    expect(byId.ddddddddddd).toMatchObject({ available: true, title: "Title ddddddddddd", channel_title: "Channel ddddddddddd", checked_at: NOW });
  });
});

describe("おすすめの動画", () => {
  test("RC-05 タイトルは YouTube のもの（単語帳の名前ではない）。見られない動画・タイトルを取れなかった動画は出さない。長さは字幕の最後の時刻", async () => {
    await createDeck(u1.id, { name: "u1 の秘密の名前", videoId: A, transcript: transcript(EASY) });
    await createDeck(u1.id, { videoId: B, transcript: transcript(EASY) });
    await createDeck(u1.id, { videoId: C, transcript: transcript(EASY) });
    await storeVideo(B, false);
    const fetchInfo = fakeInfo({ [C]: "error" });

    const result = await getRecommendations(me.id, { fetchInfo, now: NOW });
    expect(result.videos.map((v) => v.id)).toEqual([A]);
    expect(result.videos[0]).toMatchObject({ title: `Title ${A}`, channel: `Channel ${A}`, seconds: 33, learners: 1 });
    expect(JSON.stringify(result)).not.toContain("秘密");
  });

  test("RC-06 自分のレベル・知っている語で理解度を出し、レベルに合うかを付ける。人によって変わる", async () => {
    await createDeck(u1.id, { videoId: A, transcript: transcript([...EASY.slice(0, 8), ...RARE.slice(0, 2)]) });
    await createDeck(u1.id, { videoId: B, transcript: transcript(EASY) });
    await createDeck(u2.id, { videoId: C, transcript: transcript([...EASY.slice(0, 3), ...RARE]) });

    const mine = await getRecommendations(me.id, { fetchInfo: fakeInfo(), now: NOW });
    const byId = Object.fromEntries(mine.videos.map((v) => [v.id, v]));
    expect(byId[B].percent).toBe(100);
    expect(byId[A].percent).toBeLessThan(byId[B].percent);
    expect(byId[C].percent).toBeLessThan(byId[A].percent);
    for (const v of mine.videos) expect(v.fit).toBe(fitOf(v.percent));
    expect(mine.videos.map((v) => v.id)).toEqual(rankRecommendations(mine.videos).map((v) => v.id));

    // むずかしい語を知っている人には、C がやさしくなる
    for (const w of ["quaint", "mesmerizing", "dilapidated", "ubiquitous", "ephemeral", "meticulous", "serendipity"]) {
      await pool.query("INSERT INTO known_words (user_id, word) VALUES ($1, $2)", [u1.id, w]);
    }
    const theirs = await getRecommendations(u1.id, { fetchInfo: fakeInfo(), now: NOW });
    expect(theirs.videos.find((v) => v.id === C).percent).toBeGreaterThan(byId[C].percent);
  });

  test("RC-07 文が10より少ない字幕の動画は出さない", async () => {
    await createDeck(u1.id, { videoId: A, transcript: transcript(EASY.slice(0, 9)) });
    expect((await getRecommendations(me.id, { fetchInfo: fakeInfo(), now: NOW })).videos).toEqual([]);
  });
});
