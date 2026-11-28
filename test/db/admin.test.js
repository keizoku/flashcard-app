import { afterEach, beforeEach, describe, expect, test } from "vitest";
import DailyTable from "@/app/admin/DailyTable";
import AdminPage from "@/app/admin/page";
import RootLayout from "@/app/layout";
import { endGuest, startGuest } from "@/app/try/actions";
import { isAdmin } from "@/lib/admin";
import { getAdminDaily, getAdminSummary } from "@/lib/adminStats";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createCard, createDeck, createUser, formData, loginAs, logoutCookie, resetDb, runAction } from "../helpers.js";

// 管理者の画面（/admin）。ユーザーの数と、どのくらい使われているかを、全体の数と日ごとの推移で見る。
// 管理者は環境変数 ADMIN_EMAILS（カンマ区切り）で決める

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
}

function hrefsOf(node, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => hrefsOf(n, out));
    return out;
  }
  if (typeof node.props?.href === "string") out.push(node.props.href);
  hrefsOf(node.props?.children, out);
  return out;
}

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

const isNotFound = (promise) =>
  promise.then(
    () => false,
    (err) => {
      if (err.notFound) return true;
      throw err;
    }
  );

// 日本時間の「今日から n 日前」の日付（YYYY-MM-DD）
async function jstDay(daysAgo) {
  const { rows } = await pool.query(
    "SELECT to_char((now() AT TIME ZONE 'Asia/Tokyo')::date - $1::int, 'YYYY-MM-DD') AS d",
    [daysAgo]
  );
  return rows[0].d;
}

// n 日前の、日本時間の正午（日の変わり目にかからないように）
const ago = (days) =>
  `(((now() AT TIME ZONE 'Asia/Tokyo')::date - ${Number(days)}) + time '12:00') AT TIME ZONE 'Asia/Tokyo'`;

async function review(deckId, cardId, daysAgo) {
  await pool.query(`INSERT INTO review_logs (card_id, deck_id, remembered, reviewed_at) VALUES ($1, $2, true, ${ago(daysAgo)})`, [
    cardId,
    deckId,
  ]);
}

async function study(userId, seconds, daysAgo) {
  await pool.query(
    `INSERT INTO study_time (user_id, kind, source, seconds, recorded_at) VALUES ($1, 'vocab', 'auto', $2, ${ago(daysAgo)})`,
    [userId, seconds]
  );
}

const setCreated = (userId, daysAgo) => pool.query(`UPDATE users SET created_at = ${ago(daysAgo)} WHERE id = $1`, [userId]);

async function makeGuest(ip = "203.0.113.9") {
  globalThis.testHeaders = { "x-forwarded-for": ip };
  const { redirectTo } = await runAction(startGuest({ error: null }, formData({ agree: "on" })));
  expect(redirectTo).toBe("/");
  return getCurrentUser();
}

let admin;
let other;
beforeEach(async () => {
  await resetDb();
  delete process.env.ALLOWED_EMAILS;
  process.env.ADMIN_EMAILS = "Admin@Example.com, boss@example.com";
  admin = await createUser({ email: "admin@example.com" });
  other = await createUser({ email: "other@example.com" });
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
});

describe("管理者かどうか", () => {
  test("AD-01 ADMIN_EMAILS にあるアドレスの人だけが管理者（大文字・小文字は同じとみなす）。空なら、だれも管理者でない。おためしユーザーは管理者にしない", () => {
    expect(isAdmin({ email: "admin@example.com", guestExpiresAt: null })).toBe(true);
    expect(isAdmin({ email: "BOSS@example.com", guestExpiresAt: null })).toBe(true);
    expect(isAdmin({ email: "other@example.com", guestExpiresAt: null })).toBe(false);
    expect(isAdmin({ email: "admin@example.com", guestExpiresAt: new Date() })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    process.env.ADMIN_EMAILS = "";
    expect(isAdmin({ email: "admin@example.com", guestExpiresAt: null })).toBe(false);
  });
});

describe("管理者の画面", () => {
  test("AD-02 管理者でない人が開くと「見つかりません」。ログインしていなければログイン画面へ", async () => {
    await expect(runAction(AdminPage())).resolves.toEqual({ result: null, redirectTo: "/login" });
    await loginAs(other);
    expect(await isNotFound(AdminPage())).toBe(true);
  });

  test("AD-03 管理者が開くと、全体の数と日ごとの推移を出す。数だけを出し、ユーザーのメールアドレスは出さない", async () => {
    await loginAs(admin);
    const page = await AdminPage();
    const text = textOf(page);
    expect(text).toContain("全体の数");
    expect(text).toContain("日ごとの推移");
    expect(text).not.toContain("other@example.com");
    expect(text).not.toContain("admin@example.com");
  });

  test("AD-04 ヘッダーの「管理」のリンクは、管理者にだけ出す", async () => {
    await loginAs(other);
    expect(hrefsOf(await RootLayout({ children: null }))).not.toContain("/admin");
    logoutCookie();
    await loginAs(admin);
    expect(hrefsOf(await RootLayout({ children: null }))).toContain("/admin");
  });
});

describe("全体の数", () => {
  test("AD-05 登録ユーザー（確認済み）・確認待ち・いまのおためしユーザー・最近登録した人を数える。おためしユーザーは登録ユーザーに数えない", async () => {
    await createUser({ email: "pending@example.com", verified: false });
    const old = await createUser({ email: "old@example.com" });
    await setCreated(old.id, 40);
    const week = await createUser({ email: "week@example.com" });
    await setCreated(week.id, 3);
    await makeGuest();

    const s = await getAdminSummary();
    expect(s.users).toEqual({ registered: 4, unverified: 1, new7: 3, new30: 3 });
    expect(s.guests.active).toBe(1);
    expect(s.guests.startsToday).toBe(1);
    expect(s.guests.starts30).toBe(1);
  });

  test("AD-06 使った人は、記憶テストに答えた・勉強時間がある・カードか単語帳を作った登録ユーザーを、1人1回で数える（今日・7日・30日）", async () => {
    const a = await createUser({ email: "a@example.com" });
    const b = await createUser({ email: "b@example.com" });
    const c = await createUser({ email: "c@example.com" });
    // a: 今日、答えて勉強もした（1人と数える）
    const deckA = await createDeck(a.id);
    const cardA = await createCard(deckA);
    await pool.query(`UPDATE decks SET created_at = ${ago(60)} WHERE id = $1`, [deckA]);
    await pool.query(`UPDATE cards SET created_at = ${ago(60)} WHERE id = $1`, [cardA]);
    await review(deckA, cardA, 0);
    await study(a.id, 120, 0);
    // b: 5日前に勉強した
    await study(b.id, 300, 5);
    // c: 20日前にカードを作った
    const deckC = await createDeck(c.id);
    await pool.query(`UPDATE decks SET created_at = ${ago(20)} WHERE id = $1`, [deckC]);
    const cardC = await createCard(deckC);
    await pool.query(`UPDATE cards SET created_at = ${ago(20)} WHERE id = $1`, [cardC]);
    // おためしユーザーが今日使っても、使った人には数えない
    const guest = await makeGuest();
    await study(guest.id, 60, 0);

    const s = await getAdminSummary();
    expect(s.active).toEqual({ today: 1, days7: 2, days30: 3 });
    // 単語帳・カードの数と、この30日の回答数・勉強時間（登録ユーザーの分）
    expect(s.content).toEqual({ decks: 2, cards: 2, reviews30: 1, studySeconds30: 420 });
  });
});

describe("日ごとの推移", () => {
  test("AD-07 直近30日を古い順に1日1行で返す。日本時間の日ごとに、新規登録・おためし開始・使った人・回答数・勉強時間を数える", async () => {
    await setCreated(other.id, 2);
    const deck = await createDeck(other.id);
    const card = await createCard(deck);
    await pool.query(`UPDATE decks SET created_at = ${ago(60)} WHERE id = $1`, [deck]);
    await pool.query(`UPDATE cards SET created_at = ${ago(60)} WHERE id = $1`, [card]);
    await review(deck, card, 2);
    await review(deck, card, 2);
    await study(other.id, 90, 2);
    await study(admin.id, 30, 2);
    await makeGuest();

    const days = await getAdminDaily({ days: 30 });
    expect(days).toHaveLength(30);
    expect(days[0].day).toBe(await jstDay(29));
    expect(days.at(-1).day).toBe(await jstDay(0));

    expect(days.at(-3)).toEqual({ day: await jstDay(2), signups: 1, guestStarts: 0, activeUsers: 2, reviews: 2, studySeconds: 120 });
    // 今日: admin が登録した日（beforeEach）、おためし開始が1回
    expect(days.at(-1)).toMatchObject({ signups: 1, guestStarts: 1, activeUsers: 0 });
    // ほかの日は 0
    expect(days.at(-2)).toEqual({ day: await jstDay(1), signups: 0, guestStarts: 0, activeUsers: 0, reviews: 0, studySeconds: 0 });
  });

  test("AD-08 おためしを始めた回数は、おためしユーザーを消しても残る（だれが始めたかは残さない）", async () => {
    await makeGuest("203.0.113.10");
    await runAction(endGuest());
    await makeGuest("203.0.113.11");
    await pool.query("DELETE FROM users WHERE guest_expires_at IS NOT NULL");
    const { rows } = await pool.query("SELECT * FROM guest_daily");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["day", "starts"]);
    expect(rows[0].starts).toBe(2);
    expect((await getAdminDaily({ days: 30 })).at(-1).guestStarts).toBe(2);
  });

  test("AD-09 画面の日ごとの推移には、30日ぶんの数を渡す", async () => {
    await loginAs(admin);
    const page = await AdminPage();
    const props = propsOf(page, DailyTable);
    expect(props.days).toHaveLength(30);
  });
});
