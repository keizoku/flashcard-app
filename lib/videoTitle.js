import "server-only";
import { videoUrl } from "./youtube.js";

// YouTube の公開 oEmbed で動画の情報を取る（API キー不要、5秒で打ち切り）
//   { status: "ok", title, channel } … 取れた
//   { status: "missing" }            … 非公開・消された・見つからない（YouTube が 401 / 403 / 404 を返した）
//   { status: "error" }              … つながらないなど（あとでもう一度試す）
export async function fetchVideoInfo(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl(videoId))}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if ([400, 401, 403, 404].includes(res.status)) return { status: "missing" };
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    const title = typeof data?.title === "string" ? data.title.trim().slice(0, 200) : "";
    if (!title) return { status: "error" };
    const channel = typeof data?.author_name === "string" ? data.author_name.trim().slice(0, 200) : "";
    return { status: "ok", title, channel };
  } catch {
    return { status: "error" };
  }
}

// 動画のタイトル（デッキ名の自動入力用）。取れなければ null
export async function fetchVideoTitle(videoId) {
  const info = await fetchVideoInfo(videoId);
  return info.status === "ok" ? info.title.slice(0, 100) : null;
}
