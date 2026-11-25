import { afterEach, expect, test } from "vitest";
import { appOrigin, rpIdFitsHost } from "@/lib/appUrl";

// このアプリの URL。メールのリンク・ログインの Cookie・パスキーのドメインに使う

const saved = { APP_URL: process.env.APP_URL, VERCEL: process.env.VERCEL_PROJECT_PRODUCTION_URL };
afterEach(() => {
  process.env.APP_URL = saved.APP_URL;
  if (saved.VERCEL === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  else process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.VERCEL;
});

test("AU-01 APP_URL があれば、その URL（最後の / やパスは除く）", () => {
  process.env.APP_URL = "https://example.vercel.app/";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "other.vercel.app";
  expect(appOrigin()).toBe("https://example.vercel.app");
  process.env.APP_URL = "  https://example.vercel.app/login  ";
  expect(appOrigin()).toBe("https://example.vercel.app");
});

test("AU-02 APP_URL がなく Vercel で動いているときは、Vercel が教える本番の URL（https）。localhost にはしない", () => {
  delete process.env.APP_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "flashcard-app-xxxx.vercel.app";
  expect(appOrigin()).toBe("https://flashcard-app-xxxx.vercel.app");
  process.env.APP_URL = "";
  expect(appOrigin()).toBe("https://flashcard-app-xxxx.vercel.app");
});

test("AU-03 どちらもないとき（手元）は http://localhost:3000", () => {
  delete process.env.APP_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  expect(appOrigin()).toBe("http://localhost:3000");
});

test("AU-04 パスキーのドメインが、開いているページで使えるか（同じドメインか、その下のドメイン）", () => {
  expect(rpIdFitsHost("flashcard.example.com", "flashcard.example.com")).toBe(true);
  expect(rpIdFitsHost("example.com", "www.example.com")).toBe(true);
  expect(rpIdFitsHost("localhost", "flashcard-app.vercel.app")).toBe(false);
  expect(rpIdFitsHost("example.com", "badexample.com")).toBe(false);
  expect(rpIdFitsHost("", "example.com")).toBe(false);
});
