import "server-only";
import { pool } from "./db.js";
import { fetchGeneratedImage } from "./imageGen.js";
import { defaultScenePrompt, detectImageType, MAX_PROMPT_LENGTH, splitScenes } from "./sceneUtils.js";

// 物語の場面と、場面の絵（取り込む・自動で作る・見る・消す）。自分の物語のデッキの場面だけ扱う

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const NOT_FOUND = { error: "場面が見つかりません" };

// 自分の物語のデッキの場面。まだなければ作る。自分の物語のデッキでなければ null。
// [{ id, position, first, last, prompt, hasImage, source, version（絵を変えた時刻。画像の URL に付ける） }]
export async function ensureScenes(userId, deckId) {
  if (!Number.isSafeInteger(deckId)) return null;
  const { rows: decks } = await pool.query(
    "SELECT sentences FROM decks WHERE id = $1 AND user_id = $2 AND kind = 'story'",
    [deckId, userId]
  );
  if (!decks[0]) return null;
  let scenes = await listScenes(deckId);
  if (scenes.length === 0) {
    const sentences = decks[0].sentences ?? [];
    for (const [position, [first, last]] of splitScenes(sentences.length).entries()) {
      const prompt = defaultScenePrompt(sentences.slice(first, last + 1).map((s) => s.text));
      await pool.query(
        `INSERT INTO story_scenes (deck_id, position, first_sentence, last_sentence, prompt)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (deck_id, position) DO NOTHING`,
        [deckId, position, first, last, prompt]
      );
    }
    scenes = await listScenes(deckId);
  }
  return scenes;
}

async function listScenes(deckId) {
  const { rows } = await pool.query(
    `SELECT id, position, first_sentence, last_sentence, prompt, image IS NOT NULL AS has_image, image_source,
            image_updated_at
       FROM story_scenes WHERE deck_id = $1 ORDER BY position`,
    [deckId]
  );
  return rows.map((r) => ({
    id: r.id,
    position: r.position,
    first: r.first_sentence,
    last: r.last_sentence,
    prompt: r.prompt,
    hasImage: r.has_image,
    source: r.has_image ? r.image_source : null,
    version: r.image_updated_at ? r.image_updated_at.getTime() : 0,
  }));
}

// 自分の場面か（自分の物語のデッキの場面）。そうなら場面の行を返す
async function ownScene(userId, sceneId) {
  if (!Number.isSafeInteger(sceneId)) return null;
  const { rows } = await pool.query(
    `SELECT s.id, s.prompt FROM story_scenes s JOIN decks d ON d.id = s.deck_id
      WHERE s.id = $1 AND d.user_id = $2`,
    [sceneId, userId]
  );
  return rows[0] ?? null;
}

export async function updateScenePrompt(userId, sceneId, raw) {
  const prompt = String(raw ?? "").trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return { error: `指示文は 1〜${MAX_PROMPT_LENGTH} 文字にしてください` };
  if (!(await ownScene(userId, sceneId))) return NOT_FOUND;
  await pool.query("UPDATE story_scenes SET prompt = $2 WHERE id = $1", [sceneId, prompt]);
  return { ok: true };
}

// 絵を保存する。source: upload（取り込んだ）/ generated（自動で作った）
export async function saveSceneImage(userId, sceneId, bytes, source) {
  if (!(await ownScene(userId, sceneId))) return NOT_FOUND;
  if (bytes.length > MAX_IMAGE_BYTES) return { error: "画像が大きすぎます（5MB まで）" };
  const type = detectImageType(bytes);
  if (!type) return { error: "画像（PNG・JPEG・WebP・GIF）を選んでください" };
  await pool.query(
    `UPDATE story_scenes SET image = $2, image_type = $3, image_source = $4, image_updated_at = now() WHERE id = $1`,
    [sceneId, bytes, type, source]
  );
  return { ok: true };
}

export async function deleteSceneImage(userId, sceneId) {
  if (!(await ownScene(userId, sceneId))) return NOT_FOUND;
  await pool.query(
    "UPDATE story_scenes SET image = NULL, image_type = NULL, image_source = NULL, image_updated_at = now() WHERE id = $1",
    [sceneId]
  );
  return { ok: true };
}

// 自分の場面の絵。{ bytes, type, updatedAt }。なければ null
export async function getSceneImage(userId, sceneId) {
  if (!Number.isSafeInteger(sceneId)) return null;
  const { rows } = await pool.query(
    `SELECT s.image, s.image_type, s.image_updated_at FROM story_scenes s JOIN decks d ON d.id = s.deck_id
      WHERE s.id = $1 AND d.user_id = $2 AND s.image IS NOT NULL`,
    [sceneId, userId]
  );
  const r = rows[0];
  return r ? { bytes: r.image, type: r.image_type, updatedAt: r.image_updated_at } : null;
}

// 無料の画像生成サービスで絵を作って保存する。seed は場面の ID（同じ指示文なら同じ絵）
export async function generateSceneImage(userId, sceneId, { fetchImage = fetchGeneratedImage } = {}) {
  const scene = await ownScene(userId, sceneId);
  if (!scene) return NOT_FOUND;
  let bytes;
  try {
    bytes = await fetchImage(scene.prompt, scene.id);
  } catch {
    return { error: "絵を作れませんでした。少し待ってからもう一度試すか、画像を取り込んでください" };
  }
  const result = await saveSceneImage(userId, sceneId, bytes, "generated");
  if (result.error) return { error: "絵を作れませんでした（画像が返ってきませんでした）。画像を取り込んでください" };
  return result;
}
