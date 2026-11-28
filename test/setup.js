import { afterAll, vi } from "vitest";
import { testDatabaseUrl } from "./dbUrl.js";

// 各テストファイルの前に実行する。
// - lib/db.js がテスト用 DB につなぐよう、DATABASE_URL を差し替える
// - Next.js の Cookie・画面遷移・キャッシュ、YouTube への通信を、テスト用の偽物にする
// （vi.mock はファイルの先頭に移されるので、中では globalThis 経由で値を共有する）
process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_URL = "http://localhost:3000";
// 手元で管理者を決めていても（.env の ADMIN_USERNAMES）、テストは決めていない状態で始める
delete process.env.ADMIN_USERNAMES;
delete globalThis.pgPool;

// Cookie（ブラウザの代わりに、ここに保存する）
globalThis.testCookies = new Map();
// リクエストのヘッダー（接続元の IP など）。テストの中で globalThis.testHeaders に入れる
globalThis.testHeaders = {};
vi.mock("next/headers", () => ({
  headers: async () => new Headers(globalThis.testHeaders),
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
