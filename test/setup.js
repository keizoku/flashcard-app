import { afterAll, vi } from "vitest";
import { testDatabaseUrl } from "./dbUrl.js";

// 各テストファイルの前に実行する。
// - lib/db.js がテスト用 DB につなぐよう、DATABASE_URL を差し替える
// - Next.js の Cookie・画面遷移・キャッシュ、メール送信、YouTube への通信を、テスト用の偽物にする
// （vi.mock はファイルの先頭に移されるので、中では globalThis 経由で値を共有する）
process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_URL = "http://localhost:3000";
delete globalThis.pgPool;

// Cookie（ブラウザの代わりに、ここに保存する）
globalThis.testCookies = new Map();
vi.mock("next/headers", () => ({
  cookies: async () => {
    const jar = globalThis.testCookies;
    return {
      get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      has: (name) => jar.has(name),
      set: (name, value) => jar.set(name, value),
      delete: (name) => jar.delete(name),
    };
  },
}));

// redirect() は例外を投げて処理を止める（Next.js と同じ）。テストでは行き先を確かめられるようにする
vi.mock("next/navigation", () => ({
  redirect: (to) => {
    const err = new Error(`NEXT_REDIRECT ${to}`);
    err.redirectTo = to;
    throw err;
  },
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND");
    err.notFound = true;
    throw err;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

// メールは送らずに、送った内容を覚えておく
globalThis.sentMails = [];
vi.mock("@/lib/mail", () => ({
  appUrl: (p = "/") => new URL(p, process.env.APP_URL).toString(),
  sendMail: async (mail) => {
    globalThis.sentMails.push(mail);
    return true;
  },
}));

// YouTube には問い合わせない
vi.mock("@/lib/videoTitle", () => ({
  fetchVideoTitle: async (id) => `Video ${id}`,
  fetchVideoInfo: async (id) => ({ status: "ok", title: `Video ${id}`, channel: "Channel" }),
}));

afterAll(async () => {
  if (globalThis.pgPool) {
    await globalThis.pgPool.end();
    delete globalThis.pgPool;
  }
});
