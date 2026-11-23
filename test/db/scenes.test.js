import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET, POST } from "@/app/api/scenes/[id]/image/route";
import { generateImage, removeImage, updatePrompt } from "@/app/decks/[id]/sceneActions";
import { pool } from "@/lib/db";
import { fetchGeneratedImage } from "@/lib/imageGen";
import {
  deleteSceneImage,
  ensureScenes,
  generateSceneImage,
  getSceneImage,
  MAX_IMAGE_BYTES,
  saveSceneImage,
  updateScenePrompt,
} from "@/lib/scenes";
import { STYLE } from "@/lib/sceneUtils";
import { createDeck, createUser, loginAs, resetDb } from "../helpers.js";

// 物語の場面の絵（取り込む・自動で作る・見る）。自動で作るサービスには、テストでは問い合わせない
vi.mock("@/lib/imageGen", () => ({ fetchGeneratedImage: vi.fn() }));

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const JPEG = Buffer.from("ffd8ffe000104a464946", "hex");

let me;
let other;
let story;
let theirStory;
async function createStory(userId, n) {
  const sentences = Array.from({ length: n }, (_, i) => ({ text: `Sentence number ${i + 1}.`, translation: `文 ${i + 1}` }));
  const { rows } = await pool.query(
    "INSERT INTO decks (user_id, name, kind, sentences) VALUES ($1, '物語: T', 'story', $2) RETURNING id",
    [userId, JSON.stringify(sentences)]
  );
  return rows[0].id;
}
beforeEach(async () => {
  await resetDb();
  me = await createUser({ email: "me@example.com" });
  other = await createUser({ email: "other@example.com" });
  story = await createStory(me.id, 9);
  theirStory = await createStory(other.id, 4);
  fetchGeneratedImage.mockReset();
});

describe("場面", () => {
  test("SC-05 自分の物語の単語帳に、初めて開いたときに場面を作る（2回目からは同じもの）。他人の単語帳・動画の単語帳・ない単語帳は null。単語帳を消すと場面も消える", async () => {
    const scenes = await ensureScenes(me.id, story);
    expect(scenes.map((s) => [s.position, s.first, s.last])).toEqual([[0, 0, 2], [1, 3, 5], [2, 6, 8]]);
    expect(scenes[0].prompt).toBe(`${STYLE} Sentence number 1. Sentence number 2. Sentence number 3.`);
    expect(scenes[0]).toMatchObject({ hasImage: false, source: null });
    expect((await ensureScenes(me.id, story)).map((s) => s.id)).toEqual(scenes.map((s) => s.id));

    expect(await ensureScenes(me.id, theirStory)).toBeNull();
    expect(await ensureScenes(me.id, await createDeck(me.id, { name: "video" }))).toBeNull();
    expect(await ensureScenes(me.id, 999999)).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM story_scenes WHERE deck_id = $1", [theirStory])).rows[0].n).toBe(0);

    await pool.query("DELETE FROM decks WHERE id = $1", [story]);
    expect((await pool.query("SELECT count(*)::int AS n FROM story_scenes")).rows[0].n).toBe(0);
  });

  test("SC-06 絵の指示文を直せる（前後の空白を除き、1〜1000文字）。他人の場面は直せない", async () => {
    const [scene] = await ensureScenes(me.id, story);
    const [theirs] = await ensureScenes(other.id, theirStory);
    expect(await updateScenePrompt(me.id, scene.id, "  a fox in a forest  ")).toEqual({ ok: true });
    expect((await ensureScenes(me.id, story))[0].prompt).toBe("a fox in a forest");
    expect((await updateScenePrompt(me.id, scene.id, "   ")).error).toBeTruthy();
    expect((await updateScenePrompt(me.id, scene.id, "x".repeat(1001))).error).toBeTruthy();
    expect((await updateScenePrompt(me.id, theirs.id, "hacked")).error).toBe("場面が見つかりません");
    expect((await ensureScenes(other.id, theirStory))[0].prompt).not.toBe("hacked");
  });
});

describe("絵を取り込む", () => {
  test("SC-07 画像を保存する（種類は中身で見分ける）。5MB を超える・画像でない・他人の場面はだめ。消せる（自分のものだけ）", async () => {
    const [scene] = await ensureScenes(me.id, story);
    const [theirs] = await ensureScenes(other.id, theirStory);
    expect(await saveSceneImage(me.id, scene.id, PNG, "upload")).toEqual({ ok: true });
    expect(await getSceneImage(me.id, scene.id)).toMatchObject({ type: "image/png" });
    expect((await getSceneImage(me.id, scene.id)).bytes.equals(PNG)).toBe(true);
    expect((await ensureScenes(me.id, story))[0]).toMatchObject({ hasImage: true, source: "upload" });

    expect((await saveSceneImage(me.id, scene.id, Buffer.from("<svg/>"), "upload")).error).toBeTruthy();
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect((await saveSceneImage(me.id, scene.id, big, "upload")).error).toBeTruthy();
    expect((await saveSceneImage(me.id, theirs.id, PNG, "upload")).error).toBe("場面が見つかりません");
    expect(await getSceneImage(me.id, theirs.id)).toBeNull();
    expect(await getSceneImage(other.id, scene.id)).toBeNull();

    expect((await deleteSceneImage(other.id, scene.id)).error).toBeTruthy();
    expect(await deleteSceneImage(me.id, scene.id)).toEqual({ ok: true });
    expect(await getSceneImage(me.id, scene.id)).toBeNull();
    expect((await ensureScenes(me.id, story))[0]).toMatchObject({ hasImage: false, source: null });
  });
});

describe("絵を自動で作る", () => {
  test("SC-08 指示文と場面ごとの seed でサービスに頼み、できた絵を保存する。失敗したら前の絵を残す", async () => {
    const [scene] = await ensureScenes(me.id, story);
    const fetchImage = vi.fn(async () => PNG);
    expect(await generateSceneImage(me.id, scene.id, { fetchImage })).toEqual({ ok: true });
    expect(fetchImage).toHaveBeenCalledWith(scene.prompt, scene.id);
    expect((await ensureScenes(me.id, story))[0]).toMatchObject({ hasImage: true, source: "generated" });

    const before = (await getSceneImage(me.id, scene.id)).bytes;
    const failing = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect((await generateSceneImage(me.id, scene.id, { fetchImage: failing })).error).toMatch(/作れませんでした/);
    expect((await generateSceneImage(me.id, scene.id, { fetchImage: async () => Buffer.from("<html>") })).error).toBeTruthy();
    expect((await getSceneImage(me.id, scene.id)).bytes.equals(before)).toBe(true);

    const [theirs] = await ensureScenes(other.id, theirStory);
    expect((await generateSceneImage(me.id, theirs.id, { fetchImage })).error).toBe("場面が見つかりません");
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });
});

describe("画面から使う", () => {
  const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

  test("SC-09 絵を見る（GET /api/scenes/[id]/image）: ログインしていないと 401、他人の・絵のない場面は 404、自分のものは画像を返す", async () => {
    const [scene] = await ensureScenes(me.id, story);
    const [theirs] = await ensureScenes(other.id, theirStory);
    await saveSceneImage(me.id, scene.id, PNG, "upload");
    await saveSceneImage(other.id, theirs.id, PNG, "upload");
    const req = (id) => new Request(`http://localhost:3000/api/scenes/${id}/image`);

    expect((await GET(req(scene.id), params(scene.id))).status).toBe(401);
    await loginAs(me);
    const ok = await GET(req(scene.id), params(scene.id));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await ok.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await GET(req(theirs.id), params(theirs.id))).status).toBe(404);
    expect((await GET(req("abc"), params("abc"))).status).toBe(404);
    const [, second] = await ensureScenes(me.id, story);
    expect((await GET(req(second.id), params(second.id))).status).toBe(404);
  });

  test("SC-10 絵を取り込む（POST /api/scenes/[id]/image、フォームの image）: 自分の場面だけ。画像でないと 400", async () => {
    const [scene] = await ensureScenes(me.id, story);
    const [theirs] = await ensureScenes(other.id, theirStory);
    const upload = (id, bytes, origin = "http://localhost:3000") => {
      const form = new FormData();
      form.set("image", new Blob([bytes], { type: "image/png" }), "a.png");
      return POST(
        new Request(`http://localhost:3000/api/scenes/${id}/image`, { method: "POST", body: form, headers: { host: "localhost:3000", origin } }),
        params(id)
      );
    };
    expect((await upload(scene.id, PNG)).status).toBe(401);
    await loginAs(me);
    expect((await upload(scene.id, PNG, "https://evil.example.com")).status).toBe(403);
    expect((await upload(scene.id, Buffer.from("not an image"))).status).toBe(400);
    expect((await upload(theirs.id, PNG)).status).toBe(404);
    expect((await upload(scene.id, PNG)).status).toBe(204);
    expect((await getSceneImage(me.id, scene.id)).type).toBe("image/png");
    expect(await getSceneImage(other.id, theirs.id)).toBeNull();
  });

  test("SC-11 画面の操作（指示文を保存・自動で作る・絵を消す）。ログインしているユーザーの場面だけ", async () => {
    const [scene] = await ensureScenes(me.id, story);
    const [theirs] = await ensureScenes(other.id, theirStory);
    await loginAs(me);
    expect(await updatePrompt(scene.id, "a quiet forest")).toEqual({ ok: true });
    fetchGeneratedImage.mockResolvedValue(PNG);
    expect(await generateImage(scene.id)).toEqual({ ok: true });
    expect(fetchGeneratedImage).toHaveBeenCalledWith("a quiet forest", scene.id);
    expect(await removeImage(scene.id)).toEqual({ ok: true });
    expect(await getSceneImage(me.id, scene.id)).toBeNull();
    expect((await generateImage(theirs.id)).error).toBe("場面が見つかりません");
  });
});
