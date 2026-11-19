// みんなが学んだ動画（おすすめ）の中から探す。画面の中で絞り込む（サーバーにも YouTube にも問い合わせない）

export const FITS = [
  { value: "all", label: "指定なし" },
  { value: "good", label: "ちょうどいい" },
  { value: "easy", label: "やさしい" },
  { value: "hard", label: "むずかしい" },
];
export const LENGTHS = [
  { value: "any", label: "指定なし" },
  { value: "short", label: "短い（3分未満）", min: 0, max: 180 },
  { value: "medium", label: "ふつう（3〜20分）", min: 180, max: 1200 },
  { value: "long", label: "長い（20分より長い）", min: 1200, max: Infinity },
];

// q: キーワード（タイトル・チャンネル名。空白で区切ると全部を含むもの）、fit: レベル、length: 長さ。並び順は変えない
export function filterVideos(videos, { q = "", fit = "all", length = "any" } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const range = LENGTHS.find((l) => l.value === length && l.max);
  return videos.filter((v) => {
    const text = `${v.title} ${v.channel}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) return false;
    if (fit !== "all" && v.fit !== fit) return false;
    if (range && !(v.seconds != null && v.seconds >= range.min && v.seconds < range.max)) return false;
    return true;
  });
}
