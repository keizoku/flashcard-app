import { describe, expect, test } from "vitest";
import { formatTime, isValidVideoId, parseVideoId, videoUrl } from "@/lib/youtube";

describe("parseVideoId", () => {
  test.each([
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  https://youtu.be/dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
  ])("YT-01 %s → %s", (input, id) => {
    expect(parseVideoId(input)).toBe(id);
  });

  test.each([
    [""],
    [null],
    ["not a url"],
    ["https://example.com/watch?v=dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/channel/UC123"],
  ])("YT-02 読み取れないもの: %s → null", (input) => {
    expect(parseVideoId(input)).toBeNull();
  });
});

test("YT-03 isValidVideoId", () => {
  expect(isValidVideoId("dQw4w9WgXcQ")).toBe(true);
  expect(isValidVideoId("dQw4w9WgXc")).toBe(false);
  expect(isValidVideoId("dQw4w9WgXc!")).toBe(false);
  expect(isValidVideoId(null)).toBe(false);
});

test("YT-04 videoUrl は秒数が正の整数のときだけ t を付ける", () => {
  expect(videoUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  expect(videoUrl("dQw4w9WgXcQ", 83)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83s");
  expect(videoUrl("dQw4w9WgXcQ", 0)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  expect(videoUrl("dQw4w9WgXcQ", 1.5)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("YT-05 formatTime", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(83)).toBe("1:23");
  expect(formatTime(3723)).toBe("1:02:03");
});
