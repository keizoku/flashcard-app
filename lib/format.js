// 画面表示用の小さな関数（サーバー・クライアントどちらでも使える）

// イディオムのキー（figure sth out）を表示用に（figure 〜 out）
export function displayTarget(key) {
  return String(key ?? "").replace(/\b(?:sth|sb)\b/g, "〜");
}

export function isIdiomKey(key) {
  return String(key ?? "").includes(" ");
}

const LEVEL_LABELS = [
  [2000, "英検3級"],
  [3500, "英検準2級"],
  [5000, "英検2級"],
  [8000, "英検準1級"],
  [12000, "英検1級"],
];

export function levelLabel(vocabSize) {
  for (const [size, label] of LEVEL_LABELS) if (vocabSize <= size) return label;
  return "英検1級以上";
}
