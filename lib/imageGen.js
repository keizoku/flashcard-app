import "server-only";
import { generatedImageUrl } from "./sceneUtils.js";

// 無料の画像生成サービス（Pollinations、キー不要）で絵を作る。画像のバイト列（Buffer）を返す。
// 物語の場面の英文がサービスに送られる。無料のサービスなので、混んでいると遅い・失敗することがある
const TIMEOUT_MS = 90_000;
const MAX_BYTES = 5 * 1024 * 1024;

export async function fetchGeneratedImage(prompt, seed) {
  const res = await fetch(generatedImageUrl(prompt, seed), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("too large");
  return bytes;
}
