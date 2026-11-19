import { beforeEach, describe, expect, test, vi } from "vitest";
import AddDeckForm from "@/app/decks/new/AddDeckForm";
import NewDeckPage from "@/app/decks/new/page";
import { Recommendations } from "@/app/search/Recommendations";
import SearchPage from "@/app/search/page";
import { GET as openYoutube } from "@/app/search/youtube/route";
import { getRecommendations } from "@/lib/recommend";
import { createUser, loginAs, resetDb } from "../helpers.js";

// 動画を探す画面（「YouTube で探す」とおすすめ）と、おすすめの動画からデッキを作る画面
vi.mock("@/lib/recommend", () => ({ getRecommendations: vi.fn() }));

let me;
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  await loginAs(me);
  getRecommendations.mockReset();
  getRecommendations.mockResolvedValue({ videos: [] });
});

const sp = (q) => ({ searchParams: Promise.resolve(q) });

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.props?.children);
}

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

describe("YouTube で探す", () => {
  test("VS-04 条件を受け取り、YouTube の検索結果のページへ移す。キーワードが空なら、動画を探すの画面に戻す。ログインが要る", async () => {
    const res = await openYoutube(new Request("http://localhost:3000/search/youtube?q=travel+vlog&duration=short&captions=1"));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location"));
    expect(to.origin + to.pathname).toBe("https://www.youtube.com/results");
    expect(to.searchParams.get("search_query")).toBe("travel vlog");
    expect(to.searchParams.get("sp")).toBeTruthy();

    const empty = await openYoutube(new Request("http://localhost:3000/search/youtube?q=+"));
    expect(new URL(empty.headers.get("location")).pathname).toBe("/search");

    globalThis.testCookies.clear();
    await expect(openYoutube(new Request("http://localhost:3000/search/youtube?q=x"))).rejects.toMatchObject({ redirectTo: expect.stringMatching(/^\/login/) });
  });

  test("VS-05 動画を探す画面に、API キーの案内は出さない。「YouTube で探す」の入力欄を出す", async () => {
    const page = await SearchPage(sp({}));
    const text = textOf(page);
    expect(text).not.toContain("API");
    expect(text).toContain("YouTube で探す");
  });
});

describe("おすすめの動画（動画を探す画面）", () => {
  test("RC-08 開くと、自分へのおすすめを出す", async () => {
    const recs = [{ id: "aaaaaaaaaaa", title: "A", percent: 70, fit: "good", iPlus1: 3, learners: 2 }];
    getRecommendations.mockResolvedValue({ videos: recs });
    const page = await SearchPage(sp({}));
    expect(getRecommendations).toHaveBeenCalledWith(me.id);
    expect(propsOf(page, Recommendations).videos).toEqual(recs);
  });
});

describe("おすすめの動画からデッキを作る", () => {
  test("VS-06 URL とデッキ名（動画のタイトル）を入れた状態で、新しいデッキの画面を開く。戻り先は動画を探すの画面だけ受け付ける", async () => {
    let page = await NewDeckPage(sp({ video: "aaaaaaaaaaa", name: "A trip to the sea", back: "/search" }));
    let form = propsOf(page, AddDeckForm);
    expect(form.initial).toEqual({ url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", name: "A trip to the sea" });
    expect(textOf(page)).toContain("動画を探すに戻る");

    page = await NewDeckPage(sp({ video: "not-an-id", name: "x".repeat(150), back: "https://evil.example.com/" }));
    form = propsOf(page, AddDeckForm);
    expect(form.initial).toEqual({ url: "", name: "x".repeat(100) });
    expect(textOf(page)).not.toContain("動画を探すに戻る");

    page = await NewDeckPage(sp({}));
    expect(propsOf(page, AddDeckForm).initial).toEqual({ url: "", name: "" });
  });
});
