// 物語の場面と絵の、小さな道具（画面の部品からも使う）

export const SCENE_SIZE = 4; // 1つの場面の文の数のめやす
export const MAX_PROMPT_LENGTH = 1000;
const DEFAULT_PROMPT_LENGTH = 600;
// 絵のスタイル。場面ごとに絵の雰囲気がそろうよう、全部の場面の指示文の先頭に付ける
export const STYLE = "Warm picture-book illustration, soft watercolor, no text, no letters.";

// n 文を、SCENE_SIZE 文くらいずつの場面に分ける。文の数はなるべく同じに。[[最初の文, 最後の文], ...]
export function splitScenes(n) {
  if (n <= 0) return [];
  const count = Math.ceil(n / SCENE_SIZE);
  const base = Math.floor(n / count);
  const extra = n % count;
  const scenes = [];
  let first = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    scenes.push([first, first + size - 1]);
    first += size;
  }
  return scenes;
}

// 文の番号（0から）が入っている場面。なければ null
export function sceneForSentence(scenes, index) {
  return scenes.find((s) => s.first <= index && index <= s.last) ?? null;
}

// 場面の絵の指示文の初め: スタイル ＋ 場面の英文（長ければ単語の切れ目で切る）
export function defaultScenePrompt(texts) {
  const text = texts.join(" ").replace(/\s+/g, " ").trim();
  const full = `${STYLE} ${text}`;
  if (full.length <= DEFAULT_PROMPT_LENGTH) return full;
  const cut = full.slice(0, DEFAULT_PROMPT_LENGTH - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

// 自動で作るときの URL（Pollinations。キー不要・無料）。横長 16:9、ロゴなし。seed を同じにすると同じ絵になる
export function generatedImageUrl(prompt, seed) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&nologo=true&seed=${seed}`;
}

// 画像の種類を、中身の先頭のバイトで見分ける（ファイル名や送られてきた種類は信じない）
export function detectImageType(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const hex = (start, end) => Buffer.from(bytes.subarray(start, end)).toString("hex");
  if (hex(0, 8) === "89504e470d0a1a0a") return "image/png";
  if (hex(0, 3) === "ffd8ff") return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP") {
    return "image/webp";
  }
  const head = Buffer.from(bytes.subarray(0, 6)).toString();
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  return null;
}
