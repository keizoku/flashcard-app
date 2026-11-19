import { describe, expect, test } from "vitest";
import { normalizeFilters, youtubeSearchUrl } from "@/lib/youtubeSearch";

// 「YouTube で探す」。API は使わず、条件を入れた YouTube の検索結果のページの URL を作る

describe("検索の条件を整える", () => {
  test("VS-01 何も入れなければ決まった値。おかしな値（YouTube になくなった並び順も）は決まった値に戻す。キーワードは前後の空白を除き100文字まで", () => {
    expect(normalizeFilters({ order: "date" }).order).toBe("relevance");
    expect(normalizeFilters({ order: "rating" }).order).toBe("relevance");
    expect(normalizeFilters({})).toEqual({ q: "", duration: "any", captions: true, order: "relevance", period: "any" });
    expect(normalizeFilters({ q: "  travel vlog  ", duration: "huge", captions: "0", order: "x", period: "?" })).toEqual({
      q: "travel vlog", duration: "any", captions: false, order: "relevance", period: "any",
    });
    expect(normalizeFilters({ q: "a".repeat(150) }).q).toHaveLength(100);
    expect(normalizeFilters({ duration: "medium", captions: "1", order: "viewCount", period: "year" })).toEqual({
      q: "", duration: "medium", captions: true, order: "viewCount", period: "year",
    });
  });
});

// YouTube の sp（絞り込み）を読む: 並び順はいちばん外の 1番、絞り込みは 2番の中（1 公開時期・2 種類・3 長さ・5 字幕）
function readSp(url) {
  const sp = new URL(url).searchParams.get("sp");
  const bytes = [...Buffer.from(sp, "base64")];
  const read = (arr) => {
    const out = {};
    for (let i = 0; i < arr.length; ) {
      const field = arr[i] >> 3;
      const wire = arr[i] & 7;
      if (wire === 0) {
        out[field] = arr[i + 1];
        i += 2;
      } else {
        const len = arr[i + 1];
        out[field] = read(arr.slice(i + 2, i + 2 + len));
        i += 2 + len;
      }
    }
    return out;
  };
  return read(bytes);
}

describe("YouTube の検索結果のページの URL", () => {
  test("VS-02 キーワードを入れ、動画だけ・字幕あり（既定）で絞る", () => {
    const url = youtubeSearchUrl(normalizeFilters({ q: "travel vlog" }));
    expect(url.startsWith("https://www.youtube.com/results?")).toBe(true);
    expect(new URL(url).searchParams.get("search_query")).toBe("travel vlog");
    expect(readSp(url)).toEqual({ 2: { 2: 1, 5: 1 } });
  });

  test.each([
    // 番号は、YouTube の検索フィルタのリンクで確かめたもの（2026年11月）
    [{ duration: "short" }, { 2: { 2: 1, 3: 4, 5: 1 } }],
    [{ duration: "medium" }, { 2: { 2: 1, 3: 5, 5: 1 } }],
    [{ duration: "long" }, { 2: { 2: 1, 3: 2, 5: 1 } }],
    [{ captions: "0" }, { 2: { 2: 1 } }],
    [{ order: "viewCount" }, { 1: 3, 2: { 2: 1, 5: 1 } }],
    [{ period: "week" }, { 2: { 1: 3, 2: 1, 5: 1 } }],
    [{ period: "month" }, { 2: { 1: 4, 2: 1, 5: 1 } }],
    [{ period: "year" }, { 2: { 1: 5, 2: 1, 5: 1 } }],
    [{ duration: "medium", captions: "1", order: "viewCount", period: "year" }, { 1: 3, 2: { 1: 5, 2: 1, 3: 5, 5: 1 } }],
  ])("VS-03 %o の条件を、YouTube の絞り込みにする", (raw, sp) => {
    expect(readSp(youtubeSearchUrl(normalizeFilters({ q: "x", ...raw })))).toEqual(sp);
  });
});
