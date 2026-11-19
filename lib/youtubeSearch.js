// 「YouTube で探す」。API は使わず、条件を入れた YouTube の検索結果のページの URL を作る
// （検索は YouTube 自身がするので、API キーも回数の上限もいらない）

// 画面の選択肢。sp は YouTube の絞り込みの番号（YouTube の検索フィルタのリンクで確かめたもの。2026年11月）
export const DURATIONS = [
  { value: "any", label: "指定なし" },
  { value: "short", label: "短い（3分未満）", sp: 4 },
  { value: "medium", label: "ふつう（3〜20分）", sp: 5 },
  { value: "long", label: "長い（20分以上）", sp: 2 },
];
export const CAPTIONS = [
  { value: "1", label: "字幕のある動画だけ" },
  { value: "0", label: "問わない" },
];
export const ORDERS = [
  { value: "relevance", label: "関連の高い順" },
  { value: "viewCount", label: "人気の順", sp: 3 },
];
export const PERIODS = [
  { value: "any", label: "指定なし" },
  { value: "week", label: "1週間以内", sp: 3 },
  { value: "month", label: "1か月以内", sp: 4 },
  { value: "year", label: "1年以内", sp: 5 },
];

const pick = (list, value, fallback) => (list.some((o) => o.value === value) ? value : fallback);
const one = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
const spOf = (list, value) => list.find((o) => o.value === value)?.sp;

// 画面から来た条件を、決まった形に整える。おかしな値は決まった値にする
export function normalizeFilters(raw = {}) {
  const s = (k) => String(one(raw[k]) ?? "").trim();
  return {
    q: s("q").slice(0, 100),
    duration: pick(DURATIONS, s("duration"), "any"),
    captions: s("captions") !== "0",
    order: pick(ORDERS, s("order"), "relevance"),
    period: pick(PERIODS, s("period"), "any"),
  };
}

// YouTube の絞り込み（URL の sp）。YouTube が中で使っている形（protobuf を base64 にしたもの）で、
// 公式に決まったものではないので、YouTube が変えると絞り込みが効かなくなることがある（検索はできる）。
//   いちばん外: 1 = 並び順（3 = 人気）。2 = 絞り込み（1 公開時期・2 種類（1 = 動画）・3 長さ・5 字幕）
function encodeSp(f) {
  const filter = [0x10, 1]; // 動画だけ
  const period = spOf(PERIODS, f.period);
  const duration = spOf(DURATIONS, f.duration);
  if (period) filter.unshift(0x08, period);
  if (duration) filter.push(0x18, duration);
  if (f.captions) filter.push(0x28, 1);
  const order = spOf(ORDERS, f.order);
  const bytes = [...(order ? [0x08, order] : []), 0x12, filter.length, ...filter];
  return btoa(String.fromCharCode(...bytes));
}

export function youtubeSearchUrl(f) {
  return `https://www.youtube.com/results?${new URLSearchParams({ search_query: f.q, sp: encodeSp(f) })}`;
}
