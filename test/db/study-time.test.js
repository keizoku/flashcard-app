import { beforeEach, describe, expect, test } from "vitest";
import { POST } from "@/app/api/study-time/route";
import { addStudyTime, removeStudyTime } from "@/app/stats/actions";
import { pool } from "@/lib/db";
import {
  addManualStudyTime,
  deleteManualStudyTime,
  getStudyTimeStats,
  recordStudyTime,
} from "@/lib/studyTime";
import { createDeck, createUser, loginAs, resetDb } from "../helpers.js";

// 勉強時間（単語を覚えた時間・リスニングの時間）の記録と集計

let me;
let other;
let myDeck;
let theirDeck;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  myDeck = await createDeck(me.id, { name: "my deck" });
  theirDeck = await createDeck(other.id, { name: "their deck" });
});

const rowsOf = async (userId) =>
  (await pool.query("SELECT user_id, deck_id, kind, source, seconds FROM study_time WHERE user_id = $1 ORDER BY id", [userId]))
    .rows;

// 日本時間の日時を入れる（集計の確認用）
async function insertAt(userId, kind, seconds, at, deckId = null, source = "auto") {
  await pool.query(
    "INSERT INTO study_time (user_id, deck_id, kind, source, seconds, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [userId, deckId, kind, source, seconds, at]
  );
}

describe("自動の記録", () => {
  test("TM-05 単語・リスニングの秒数を記録する。種類・秒数（1〜600 の整数）がおかしいものは記録しない", async () => {
    expect(await recordStudyTime(me.id, { kind: "vocab", seconds: 30, deckId: myDeck })).toEqual({ ok: true });
    expect(await recordStudyTime(me.id, { kind: "listening", seconds: 600, deckId: null })).toEqual({ ok: true });
    for (const bad of [
      { kind: "sleep", seconds: 30 },
      { kind: "vocab", seconds: 0 },
      { kind: "vocab", seconds: 601 },
      { kind: "vocab", seconds: 1.5 },
      { kind: "vocab", seconds: "30" },
      { kind: "vocab", seconds: 30, deckId: "x" },
    ]) {
      expect((await recordStudyTime(me.id, bad)).error).toBeTruthy();
    }
    expect(await rowsOf(me.id)).toEqual([
      { user_id: me.id, deck_id: myDeck, kind: "vocab", source: "auto", seconds: 30 },
      { user_id: me.id, deck_id: null, kind: "listening", source: "auto", seconds: 600 },
    ]);
  });

  test("TM-06 他人の単語帳には記録しない。単語帳を消しても、時間の記録は残る（単語帳は空になる）", async () => {
    expect((await recordStudyTime(me.id, { kind: "vocab", seconds: 30, deckId: theirDeck })).error).toBe("単語帳が見つかりません");
    expect(await rowsOf(me.id)).toEqual([]);
    expect(await rowsOf(other.id)).toEqual([]);

    await recordStudyTime(me.id, { kind: "listening", seconds: 40, deckId: myDeck });
    await pool.query("DELETE FROM decks WHERE id = $1", [myDeck]);
    expect(await rowsOf(me.id)).toEqual([{ user_id: me.id, deck_id: null, kind: "listening", source: "auto", seconds: 40 }]);
  });
});

describe("記録を受け取る（/api/study-time）", () => {
  const req = (body, headers = {}) =>
    new Request("http://localhost:3000/api/study-time", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "text/plain", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  test("TM-07 ログインしていないと 401、ほかのサイトからは 403、中身がおかしいと 400。正しければ 204 で記録する", async () => {
    expect((await POST(req({ kind: "vocab", seconds: 30 }))).status).toBe(401);
    await loginAs(me);
    expect((await POST(req({ kind: "vocab", seconds: 30 }, { origin: "https://evil.example.com" }))).status).toBe(403);
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ kind: "vocab", seconds: 9999 }))).status).toBe(400);
    expect((await POST(req({ kind: "vocab", seconds: 30, deckId: theirDeck }))).status).toBe(400);
    expect((await POST(req({ kind: "vocab", seconds: 30, deckId: myDeck }))).status).toBe(204);
    expect(await rowsOf(me.id)).toEqual([{ user_id: me.id, deck_id: myDeck, kind: "vocab", source: "auto", seconds: 30 }]);
    expect(await rowsOf(other.id)).toEqual([]);
  });
});

describe("手で足す", () => {
  test("TM-08 種類と分（1〜600 の整数）で足す。消せるのは、自分が手で足した記録だけ", async () => {
    const added = await addManualStudyTime(me.id, { kind: "listening", minutes: 25 });
    expect(added).toEqual({ ok: true });
    for (const bad of [{ kind: "listening", minutes: 0 }, { kind: "listening", minutes: 601 }, { kind: "x", minutes: 10 }, { kind: "vocab", minutes: 2.5 }]) {
      expect((await addManualStudyTime(me.id, bad)).error).toBeTruthy();
    }
    expect(await rowsOf(me.id)).toEqual([{ user_id: me.id, deck_id: null, kind: "listening", source: "manual", seconds: 1500 }]);

    await recordStudyTime(me.id, { kind: "vocab", seconds: 30, deckId: myDeck });
    await addManualStudyTime(other.id, { kind: "vocab", minutes: 10 });
    const ids = Object.fromEntries(
      (await pool.query("SELECT id, user_id, source FROM study_time")).rows.map((r) => [`${r.user_id}-${r.source}`, r.id])
    );
    // 他人の記録・自動の記録は消せない
    expect((await deleteManualStudyTime(me.id, ids[`${other.id}-manual`])).error).toBeTruthy();
    expect((await deleteManualStudyTime(me.id, ids[`${me.id}-auto`])).error).toBeTruthy();
    expect(await deleteManualStudyTime(me.id, ids[`${me.id}-manual`])).toEqual({ ok: true });
    expect((await rowsOf(me.id)).map((r) => r.source)).toEqual(["auto"]);
    expect(await rowsOf(other.id)).toHaveLength(1);
  });

  test("TM-09 統計の画面のフォーム: 足す・消す。ログインしているユーザーの分だけ", async () => {
    await loginAs(me);
    const form = new FormData();
    form.set("kind", "vocab");
    form.set("minutes", "15");
    expect(await addStudyTime({ error: null }, form)).toMatchObject({ error: null, saved: true });
    form.set("minutes", "abc");
    expect((await addStudyTime({ error: null }, form)).error).toBeTruthy();
    const { rows } = await pool.query("SELECT id FROM study_time WHERE user_id = $1", [me.id]);
    expect(rows).toHaveLength(1);
    expect(await removeStudyTime(rows[0].id)).toEqual({ ok: true });
    expect(await rowsOf(me.id)).toEqual([]);
  });
});

describe("集計", () => {
  test("TM-10 日本時間の日ごと（直近14日）・今日・直近7日・単語帳別に、種類ごとの秒数を出す。他人の記録は数えない", async () => {
    const now = new Date("2026-11-20T03:00:00Z"); // 日本時間 11/20 12:00
    await insertAt(me.id, "vocab", 600, "2026-11-20T01:00:00Z", myDeck); // 11/20
    await insertAt(me.id, "listening", 900, "2026-11-19T15:30:00Z", myDeck); // 日本時間 11/20 0:30
    await insertAt(me.id, "listening", 1200, "2026-11-19T14:30:00Z"); // 日本時間 11/19 23:30（手入力など、単語帳なし）
    await insertAt(me.id, "vocab", 300, "2026-11-14T03:00:00Z", myDeck); // 11/14（直近7日に入る）
    await insertAt(me.id, "vocab", 120, "2026-11-13T03:00:00Z", myDeck); // 11/13（14日には入るが7日には入らない）
    await insertAt(me.id, "vocab", 999, "2026-11-01T03:00:00Z", myDeck); // 14日より前
    await insertAt(other.id, "vocab", 5000, "2026-11-20T01:00:00Z", theirDeck);

    const s = await getStudyTimeStats(me.id, { now });
    expect(s.days).toHaveLength(14);
    expect(s.days[0].day).toBe("2026-11-07");
    expect(s.days.at(-1)).toEqual({ day: "2026-11-20", vocab: 600, listening: 900 });
    expect(s.days.at(-2)).toEqual({ day: "2026-11-19", vocab: 0, listening: 1200 });
    expect(s.today).toEqual({ vocab: 600, listening: 900 });
    expect(s.week).toEqual({ vocab: 900, listening: 2100 });
    expect(s.total).toEqual({ vocab: 600 + 300 + 120 + 999, listening: 2100 });
    expect(s.byDeck).toEqual([{ id: myDeck, name: "my deck", vocab: 2019, listening: 900 }]);
  });

  test("TM-11 手で足した記録は、新しい順に10件まで出す（消すため）", async () => {
    for (let i = 1; i <= 12; i++) await addManualStudyTime(me.id, { kind: "vocab", minutes: i });
    await addManualStudyTime(other.id, { kind: "vocab", minutes: 50 });
    const s = await getStudyTimeStats(me.id);
    expect(s.manual.map((m) => m.seconds / 60)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(Object.keys(s.manual[0]).sort()).toEqual(["id", "kind", "recorded_at", "seconds"]);
  });
});
