import { describe, expect, test } from "vitest";
import { filterVideos } from "@/lib/videoFilter";

// みんなが学んだ動画（おすすめ）の中から探す。画面の中で、キーワード・レベル・長さで絞り込む

const V = [
  { id: "a", title: "A Walk in the Park", channel: "Daily English", fit: "good", seconds: 120 },
  { id: "b", title: "Cooking Pasta at Home", channel: "Kitchen Life", fit: "easy", seconds: 600 },
  { id: "c", title: "London Travel Vlog", channel: "Walk With Me", fit: "hard", seconds: 1500 },
  { id: "d", title: "Morning Routine", channel: "Daily English", fit: "good", seconds: null },
];
const ids = (list) => list.map((v) => v.id);

describe("みんなが学んだ動画から探す", () => {
  test("VS-01 キーワード: タイトルかチャンネル名に入っている動画。大文字・小文字は区別しない。空白で区切ると、全部が入っているもの", () => {
    expect(ids(filterVideos(V, { q: "walk" }))).toEqual(["a", "c"]);
    expect(ids(filterVideos(V, { q: "DAILY" }))).toEqual(["a", "d"]);
    expect(ids(filterVideos(V, { q: "daily  morning " }))).toEqual(["d"]);
    expect(ids(filterVideos(V, { q: "   " }))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filterVideos(V, { q: "zzz" }))).toEqual([]);
  });

  test("VS-02 レベル: ちょうどいい / やさしい / むずかしい のどれか。指定なしなら全部", () => {
    expect(ids(filterVideos(V, { fit: "good" }))).toEqual(["a", "d"]);
    expect(ids(filterVideos(V, { fit: "easy" }))).toEqual(["b"]);
    expect(ids(filterVideos(V, { fit: "hard" }))).toEqual(["c"]);
    expect(ids(filterVideos(V, { fit: "all" }))).toEqual(["a", "b", "c", "d"]);
  });

  test("VS-03 長さ: 3分未満 / 3〜20分 / 20分より長い。長さのわからない動画は、長さを指定したときは出さない。条件はいっしょに使える。並び順は変えない", () => {
    expect(ids(filterVideos(V, { length: "short" }))).toEqual(["a"]);
    expect(ids(filterVideos(V, { length: "medium" }))).toEqual(["b"]);
    expect(ids(filterVideos(V, { length: "long" }))).toEqual(["c"]);
    expect(ids(filterVideos(V, { length: "any" }))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filterVideos(V, { q: "daily", fit: "good", length: "short" }))).toEqual(["a"]);
    expect(ids(filterVideos(V, {}))).toEqual(["a", "b", "c", "d"]);
  });
});
