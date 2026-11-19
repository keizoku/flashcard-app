import { beforeEach, describe, expect, test } from "vitest";
import { recordReview, undoReview } from "@/app/decks/[id]/study/actions";
import { pool } from "@/lib/db";
import { nextDueSql } from "@/lib/review";
import { createCard, createDeck, createUser, getCard, loginAs, resetDb } from "../helpers.js";

let me;
let deck;
beforeEach(async () => {
  await resetDb();
  me = await createUser();
  await loginAs(me);
  deck = await createDeck(me.id);
});

// 日本時間の「学習日」（朝4時に日付が変わる）を YYYY-MM-DD で返す
const studyDay = (date) => new Date(date.getTime() + (9 - 4) * 3600000).toISOString().slice(0, 10);
const dueInDays = (card) =>
  Math.round((Date.parse(studyDay(card.review_due_at)) - Date.parse(studyDay(new Date()))) / 86400000);
// 日本時間の時刻 HH:MM
const jstTime = (date) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(11, 16);

describe("次に出す日時（朝4時に日付が変わる）", () => {
  const nextDue = async (at, days) =>
    (await pool.query(`SELECT ${nextDueSql("$1::timestamptz", "$2::int")} AS due`, [at, days])).rows[0].due;

  test.each([
    ["夜 21:00 に 1日 → 翌日の朝 4:00", "2026-11-16T21:00:00+09:00", 1, "2026-11-17T04:00:00+09:00"],
    ["夜 23:50 に 1日 → 翌日の朝 4:00", "2026-11-16T23:50:00+09:00", 1, "2026-11-17T04:00:00+09:00"],
    ["深夜 1:00 は前の日の続き → その日の朝 4:00", "2026-11-17T01:00:00+09:00", 1, "2026-11-17T04:00:00+09:00"],
    ["朝 4:00 ちょうどは新しい日 → 翌日の朝 4:00", "2026-11-17T04:00:00+09:00", 1, "2026-11-18T04:00:00+09:00"],
    ["昼 12:00 に 7日 → 7日後の朝 4:00", "2026-11-16T12:00:00+09:00", 7, "2026-11-23T04:00:00+09:00"],
    ["月をまたぐ 30日", "2026-11-16T12:00:00+09:00", 30, "2026-12-16T04:00:00+09:00"],
  ])("ST-01 %s", async (_, at, days, expected) => {
    expect((await nextDue(at, days)).toISOString()).toBe(new Date(expected).toISOString());
  });

  test("ST-02 0日（覚えていない）はすぐ", async () => {
    const at = "2026-11-16T21:00:00+09:00";
    expect((await nextDue(at, 0)).toISOString()).toBe(new Date(at).toISOString());
  });
});

describe("recordReview（覚えている / 覚えていない）", () => {
  test("ST-03 覚えていると段階が上がり、間隔が 1 → 3 → 7 … 60 日と延びる（60 日で止まる）", async () => {
    const card = await createCard(deck);
    const expected = [[1, 1], [2, 3], [3, 7], [4, 14], [5, 30], [6, 60], [6, 60]];
    for (const [box, days] of expected) {
      expect(await recordReview(card, true)).toMatchObject({ error: null, box, days });
      const c = await getCard(card);
      expect(dueInDays(c)).toBe(days);
      expect(jstTime(c.review_due_at)).toBe("04:00");
    }
    expect(await getCard(card)).toMatchObject({ review_count: 7, lapse_count: 0 });
  });

  test("ST-04 覚えていないと段階 0 に戻り、今日のうちにまた出る", async () => {
    const card = await createCard(deck, { reviewBox: 4 });
    expect(await recordReview(card, false)).toMatchObject({ box: 0, days: 0 });
    const c = await getCard(card);
    expect(c).toMatchObject({ review_box: 0, review_count: 1, lapse_count: 1 });
    expect(c.review_due_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("ST-05 記録を残す（統計・取り消し用）", async () => {
    const card = await createCard(deck, { reviewBox: 2 });
    const { logId } = await recordReview(card, true);
    const log = (await pool.query("SELECT * FROM review_logs WHERE id = $1", [logId])).rows[0];
    expect(log).toMatchObject({ card_id: card, deck_id: deck, remembered: true, prev_box: 2 });
  });

  test("ST-06 他人のカード・でたらめな ID は記録できない", async () => {
    const other = await createUser({ email: "other@example.com" });
    const theirs = await createCard(await createDeck(other.id));
    expect(await recordReview(theirs, true)).toEqual({ error: "カードが見つかりません" });
    expect(await recordReview("abc", true)).toEqual({ error: "カードが見つかりません" });
    expect((await pool.query("SELECT 1 FROM review_logs")).rowCount).toBe(0);
  });
});

describe("undoReview（前のカードに戻って答え直す）", () => {
  test("ST-07 答える前の状態に戻し、記録を消す", async () => {
    const card = await createCard(deck, { reviewBox: 2 });
    const before = await getCard(card);
    const { logId } = await recordReview(card, false);
    expect(await undoReview(logId)).toEqual({ error: null });
    const after = await getCard(card);
    expect(after).toMatchObject({
      review_box: 2, review_count: 0, lapse_count: 0,
      review_due_at: before.review_due_at, last_reviewed_at: before.last_reviewed_at,
    });
    expect((await pool.query("SELECT 1 FROM review_logs")).rowCount).toBe(0);
  });

  test("ST-08 そのカードの最新の記録だけ取り消せる", async () => {
    const card = await createCard(deck);
    const first = await recordReview(card, true);
    const second = await recordReview(card, true);
    expect(await undoReview(first.logId)).toEqual({ error: "この答えは取り消せません" });
    expect(await undoReview(second.logId)).toEqual({ error: null });
    expect(await undoReview(first.logId)).toEqual({ error: null });
    expect(await getCard(card)).toMatchObject({ review_box: 0, review_count: 0 });
  });

  test("ST-09 他人の記録は取り消せない", async () => {
    const card = await createCard(deck);
    const { logId } = await recordReview(card, true);
    const other = await createUser({ email: "other@example.com" });
    await loginAs(other);
    expect(await undoReview(logId)).toEqual({ error: "この答えは取り消せません" });
  });

  test("ST-11 でたらめな記録の ID は取り消せない", async () => {
    expect(await undoReview("abc")).toEqual({ error: "取り消す記録が見つかりません" });
    expect(await undoReview(99999)).toEqual({ error: "この答えは取り消せません" });
  });
});
