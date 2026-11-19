import { beforeEach, describe, expect, test, vi } from "vitest";
import AddDeckForm from "@/app/decks/new/AddDeckForm";
import NewDeckPage from "@/app/decks/new/page";
import { Recommendations } from "@/app/search/Recommendations";
import SearchPage from "@/app/search/page";
import { getRecommendations } from "@/lib/recommend";
import { createUser, loginAs, resetDb } from "../helpers.js";

// 動画を探す画面（みんなが学んだ動画）と、そこからデッキを作る画面
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

describe("動画を探す画面", () => {
  test("VS-04 YouTube の検索（「YouTube で探す」）は出さない。API キーの案内も出さない", async () => {
    const text = textOf(await SearchPage(sp({})));
    expect(text).not.toContain("YouTube で探す");
    expect(text).not.toContain("API");
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
  test("VS-05 URL とデッキ名（動画のタイトル）を入れた状態で、新しいデッキの画面を開く。戻り先は動画を探すの画面だけ受け付ける", async () => {
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
