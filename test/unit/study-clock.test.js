import { expect, test } from "vitest";
import { createStudyClock, formatDuration, splitSeconds } from "@/lib/studyClock";

// 勉強時間の時計。操作（単語）や再生（リスニング）があった間だけ数える
const S = 1000;

test("TM-01 単語: 操作の間を数える。最後の操作から2分を超えた分は数えない（席を外したとき）", () => {
  const clock = createStudyClock({ idleMs: 120 * S });
  clock.activity(0);
  clock.activity(30 * S);
  expect(clock.take(50 * S)).toBe(50);
  // 50秒から10分間なにもしない → 最後の操作（30秒）から2分の 150秒までしか数えない
  expect(clock.take(650 * S)).toBe(100);
  // 戻ってきて操作すると、そこからまた数える（空いた時間は数えない）
  clock.activity(700 * S);
  expect(clock.take(710 * S)).toBe(10);
});

test("TM-02 止めると数えない。また動かすと、そこから数える。1秒に満たない分は次に持ち越す", () => {
  const clock = createStudyClock({ idleMs: 120 * S });
  clock.activity(0);
  clock.pause(20.6 * S);
  expect(clock.running).toBe(false);
  expect(clock.take(100 * S)).toBe(20);
  clock.activity(200 * S);
  expect(clock.running).toBe(true);
  expect(clock.take(209.5 * S)).toBe(10); // 0.6 + 9.5 = 10.1 秒
  expect(clock.take(209.5 * S)).toBe(0);
  // 止めているときに止めても、何も起きない
  clock.pause(210 * S);
  clock.pause(300 * S);
  expect(clock.take(400 * S)).toBe(0);
});

test("TM-03 リスニング: 上限なし。再生している間はずっと数え、止めたら数えない", () => {
  const clock = createStudyClock();
  clock.activity(0);
  expect(clock.take(30 * 60 * S)).toBe(1800);
  clock.pause(31 * 60 * S);
  expect(clock.take(60 * 60 * S)).toBe(60);
});

test("TM-04 送るときは、1回 600 秒までに分ける。時間は「1時間5分」「12分」のように出す", () => {
  expect(splitSeconds(0)).toEqual([]);
  expect(splitSeconds(45)).toEqual([45]);
  expect(splitSeconds(1500)).toEqual([600, 600, 300]);
  expect(formatDuration(0)).toBe("0分");
  expect(formatDuration(59)).toBe("0分");
  expect(formatDuration(12 * 60 + 30)).toBe("12分");
  expect(formatDuration(3600)).toBe("1時間0分");
  expect(formatDuration(3900)).toBe("1時間5分");
});
