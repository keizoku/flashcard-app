import { expect, test } from "vitest";
import {
  defaultScenePrompt,
  detectImageType,
  generatedImageUrl,
  sceneForSentence,
  splitScenes,
  STYLE,
} from "@/lib/sceneUtils";

// 物語の場面（数文ずつのまとまり）と、場面の絵

test("SC-01 物語を、4文くらいずつの場面に分ける（文の数をなるべく同じに）。文の番号から場面を探せる", () => {
  expect(splitScenes(0)).toEqual([]);
  expect(splitScenes(3)).toEqual([[0, 2]]);
  expect(splitScenes(9)).toEqual([[0, 2], [3, 5], [6, 8]]);
  expect(splitScenes(10)).toEqual([[0, 3], [4, 6], [7, 9]]);
  expect(splitScenes(36)).toHaveLength(9);
  const scenes = [{ id: 1, first: 0, last: 2 }, { id: 2, first: 3, last: 5 }];
  expect(sceneForSentence(scenes, 0).id).toBe(1);
  expect(sceneForSentence(scenes, 4).id).toBe(2);
  expect(sceneForSentence(scenes, 9)).toBeNull();
});

test("SC-02 場面の絵の指示文: 絵のスタイル（文字なしの絵本風）＋場面の英文。長すぎる英文は単語の切れ目で切る", () => {
  const p = defaultScenePrompt(["A fox walked into the forest.", "It found a stone."]);
  expect(p.startsWith(STYLE)).toBe(true);
  expect(p).toContain("A fox walked into the forest. It found a stone.");
  const long = defaultScenePrompt(Array(40).fill("The little fox walked slowly through the deep green forest."));
  expect(long.length).toBeLessThanOrEqual(600);
  expect(long.endsWith("forest.") || long.endsWith("…")).toBe(true);
  expect(long).not.toMatch(/\s…$/);
});

test("SC-03 自動で作るときの URL（キー不要の画像生成サービス）。指示文は URL 用に変換し、横長（16:9）・ロゴなし・同じ場面は同じ絵になるよう seed を付ける", () => {
  expect(generatedImageUrl("a fox & a stone?", 42)).toBe(
    "https://image.pollinations.ai/prompt/a%20fox%20%26%20a%20stone%3F?width=1024&height=576&nologo=true&seed=42"
  );
});

test("SC-04 画像の種類は、ファイルの中身（先頭のバイト）で見分ける。PNG・JPEG・WebP・GIF 以外は受け付けない", () => {
  const b = (hex) => Buffer.from(hex.replace(/ /g, ""), "hex");
  expect(detectImageType(b("89 50 4e 47 0d 0a 1a 0a 00"))).toBe("image/png");
  expect(detectImageType(b("ff d8 ff e0 00"))).toBe("image/jpeg");
  expect(detectImageType(Buffer.concat([Buffer.from("RIFF"), b("00000000"), Buffer.from("WEBP")]))).toBe("image/webp");
  expect(detectImageType(Buffer.from("GIF89a..."))).toBe("image/gif");
  expect(detectImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  expect(detectImageType(Buffer.alloc(0))).toBeNull();
});
