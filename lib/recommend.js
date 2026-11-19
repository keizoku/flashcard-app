import "server-only";
import { loadContext } from "./comprehension.js";
import { pool } from "./db.js";
import { analyzeTranscript, parseSegments } from "./transcript.js";
import { fetchVideoInfo } from "./videoTitle.js";

// おすすめの動画（みんなが学んだ動画）。
// ほかの人が字幕付きでデッキにした動画を、自分のレベル・知っている語で解析して、理解度の合う順に並べる。
// - YouTube の API キーは使わない。タイトルは oEmbed（キー不要）で取る
// - 誰のデッキか・デッキ名は出さない（タイトルは YouTube のもの）
// - 非公開・消された動画は oEmbed で取れないので出さない。限定公開の動画は、公開動画と見分けられない

const RECHECK_DAYS = 7; // これより前に取った情報は、取り直す
const MIN_SENTENCES = 10; // 文がこれより少ない字幕は、理解度があてにならないので出さない
const MAX_CANDIDATES = 100; // 解析する動画の数の上限（学んだ人の多い順・新しい順）
const PARALLEL = 8; // oEmbed に同時に問い合わせる数
const DAY = 86_400_000;

// 全部わかる文の割合 → やさしい（85%以上）/ ちょうどいい（50〜84%）/ むずかしい（50%未満）
export function fitOf(percent) {
  if (percent >= 85) return "easy";
  if (percent >= 50) return "good";
  return "hard";
}

// ちょうどいい（i+1 の文が多い順）→ やさしい（むずかしめの順）→ むずかしい（やさしめの順）
export function rankRecommendations(items) {
  const group = { good: 0, easy: 1, hard: 2 };
  return [...items].sort((a, b) => {
    if (a.fit !== b.fit) return group[a.fit] - group[b.fit];
    if (a.fit === "good") return b.iPlus1 - a.iPlus1 || b.percent - a.percent;
    if (a.fit === "easy") return a.percent - b.percent;
    return b.percent - a.percent;
  });
}

// ほかの人が字幕付きでデッキにした動画（自分のデッキにある動画は除く）。
// { videoId, learners（学んだ人数）, transcript（いちばん長い字幕） }
export async function listCandidateVideos(userId, limit = MAX_CANDIDATES) {
  const { rows } = await pool.query(
    `WITH v AS (
       SELECT video_id, count(DISTINCT user_id)::int AS learners, max(created_at) AS last_at
         FROM decks
        WHERE kind = 'video' AND video_id IS NOT NULL AND transcript IS NOT NULL AND user_id <> $1
        GROUP BY video_id
     )
     SELECT v.video_id, v.learners, t.transcript
       FROM v
       JOIN LATERAL (
         SELECT transcript FROM decks d
          WHERE d.video_id = v.video_id AND d.kind = 'video' AND d.transcript IS NOT NULL AND d.user_id <> $1
          ORDER BY length(d.transcript) DESC, d.id
          LIMIT 1
       ) t ON true
      WHERE NOT EXISTS (SELECT 1 FROM decks m WHERE m.user_id = $1 AND m.video_id = v.video_id)
      ORDER BY v.learners DESC, v.last_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map((r) => ({ videoId: r.video_id, learners: r.learners, transcript: r.transcript }));
}

// まだ取っていない・古い動画の情報を oEmbed で取って、videos テーブルに入れる。
// 取れなかった（つながらない）ときは、前の情報をそのまま残す
export async function refreshVideoInfo(videoIds, { fetchInfo = fetchVideoInfo, now = new Date() } = {}) {
  if (!videoIds.length) return;
  const { rows } = await pool.query(
    "SELECT video_id FROM videos WHERE video_id = ANY($1::text[]) AND checked_at > $2",
    [videoIds, new Date(now.getTime() - RECHECK_DAYS * DAY)]
  );
  const fresh = new Set(rows.map((r) => r.video_id));
  const stale = videoIds.filter((id) => !fresh.has(id));

  for (let i = 0; i < stale.length; i += PARALLEL) {
    const ids = stale.slice(i, i + PARALLEL);
    const infos = await Promise.all(ids.map((id) => fetchInfo(id)));
    for (const [k, id] of ids.entries()) {
      const info = infos[k];
      if (info.status === "error") continue;
      const ok = info.status === "ok";
      await pool.query(
        `INSERT INTO videos (video_id, title, channel_title, available, checked_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (video_id) DO UPDATE SET title = EXCLUDED.title, channel_title = EXCLUDED.channel_title,
           available = EXCLUDED.available, checked_at = EXCLUDED.checked_at`,
        [id, ok ? info.title : null, ok ? info.channel : null, ok, now]
      );
    }
  }
}

// 字幕の最後の時刻（動画の長さの目安、秒）。時刻がなければ null
function lastTime(transcript) {
  const starts = parseSegments(transcript).map((s) => s.start).filter((s) => Number.isFinite(s));
  return starts.length ? Math.max(...starts) : null;
}

// 自分へのおすすめ。{ videos: [{ id, title, channel, seconds, learners, percent, understood, total, iPlus1, fit }] }
export async function getRecommendations(userId, opts = {}) {
  const candidates = await listCandidateVideos(userId);
  if (!candidates.length) return { videos: [] };
  const ids = candidates.map((c) => c.videoId);
  await refreshVideoInfo(ids, opts);

  const { rows } = await pool.query(
    "SELECT video_id, title, channel_title FROM videos WHERE video_id = ANY($1::text[]) AND available AND title IS NOT NULL",
    [ids]
  );
  const info = new Map(rows.map((r) => [r.video_id, r]));

  const ctx = await loadContext(userId);
  const known = { vocabSize: ctx.settings.vocabSize, ...ctx.words };
  const videos = [];
  for (const c of candidates) {
    const v = info.get(c.videoId);
    if (!v) continue;
    const { comprehension, stages } = analyzeTranscript(c.transcript, known);
    if (comprehension.total < MIN_SENTENCES) continue;
    videos.push({
      id: c.videoId,
      title: v.title,
      channel: v.channel_title ?? "",
      seconds: lastTime(c.transcript),
      learners: c.learners,
      percent: comprehension.percent,
      understood: comprehension.understood,
      total: comprehension.total,
      iPlus1: stages[1].length,
      fit: fitOf(comprehension.percent),
    });
  }
  return { videos: rankRecommendations(videos) };
}
