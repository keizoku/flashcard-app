import { expect, test } from "vitest";
import { MAX_TAG_LENGTH, MAX_TAGS_PER_DECK, parseTags } from "@/lib/tags";

test("TG-01 カンマ区切り（全角・読点も）を配列にする", () => {
  expect(parseTags("英語, ビジネス、ニュース，会話")).toEqual(["英語", "ビジネス", "ニュース", "会話"]);
});

test("TG-02 JSON の配列も受け付ける", () => {
  expect(parseTags('["a", "b"]')).toEqual(["a", "b"]);
  expect(parseTags("[broken")).toEqual([]);
  expect(parseTags('{"a":1}')).toEqual(["{\"a\":1}"]);
});

test("TG-03 空・重複（大文字小文字を区別しない）を除き、空白をまとめる", () => {
  expect(parseTags("News, news,  ,  big   word ")).toEqual(["News", "big word"]);
  expect(parseTags(null)).toEqual([]);
});

test("TG-04 長さと個数の上限", () => {
  expect(parseTags("x".repeat(50))[0]).toHaveLength(MAX_TAG_LENGTH);
  const many = Array.from({ length: 15 }, (_, i) => `t${i}`).join(",");
  expect(parseTags(many)).toHaveLength(MAX_TAGS_PER_DECK);
});
