import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { middleware } from "@/middleware";

const req = (path, cookie) =>
  new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie: `flashcard_session=${cookie}` } } : {});

test("MW-01 ログイン不要の画面はそのまま通す", () => {
  for (const p of ["/login", "/signup", "/forgot-password"]) {
    expect(middleware(req(p)).headers.get("location")).toBeNull();
  }
});

test("MW-02 Cookie がなければ、元の画面を next に付けてログイン画面へ", () => {
  const res = middleware(req("/decks/3/study?all=1"));
  const loc = new URL(res.headers.get("location"));
  expect(loc.pathname).toBe("/login");
  expect(loc.searchParams.get("next")).toBe("/decks/3/study?all=1");
});

test("MW-03 トップ（/）はログインしていなくても通す（ホームページを出す）。/?x=1 も同じ", () => {
  expect(middleware(req("/")).headers.get("location")).toBeNull();
  expect(middleware(req("/?notice=welcome")).headers.get("location")).toBeNull();
});

test("MW-04 Cookie があれば通す（有効かどうかは各画面で確かめる）", () => {
  expect(middleware(req("/stats", "anything")).headers.get("location")).toBeNull();
});

test("MW-05 /loginx のような似た名前や、なくした画面（/verify など）は公開しない", () => {
  for (const p of ["/loginx", "/verify?token=x", "/reset-password?token=x"]) {
    expect(middleware(req(p)).headers.get("location")).toContain("/login?next=");
  }
});

test("MW-06 おためしの説明（/try）と、期限の過ぎたおためしユーザーを消す処理（/api/cron/...）は、ログインしていなくても通す", () => {
  expect(middleware(req("/try")).headers.get("location")).toBeNull();
  expect(middleware(req("/api/cron/cleanup-guests")).headers.get("location")).toBeNull();
  expect(middleware(req("/tryx")).headers.get("location")).toContain("/login?next=");
});
