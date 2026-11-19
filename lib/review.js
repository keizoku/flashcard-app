// 記憶テストの間隔。「覚えている」を押すたびに段階（box）が1つ上がり、次に出すまでの日数が延びる
// box:  0    1    2    3    4     5     6
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60];
export const MAX_BOX = INTERVAL_DAYS.length - 1;

// 日付の区切り。朝4時（日本時間）に「次の日」になる。
// 夜ふかしして学習しても、朝4時までは同じ日として数える
export const TIME_ZONE = "Asia/Tokyo";
export const DAY_START_HOUR = 4;

// 次に出す日時を返す SQL の式。at = 答えた日時、days = 間隔の日数。
// days 日後の朝4時にする。0日（覚えていない）はすぐ
export function nextDueSql(at, days) {
  const start = `make_interval(hours => ${DAY_START_HOUR})`;
  return `(CASE WHEN ${days} = 0 THEN ${at}
    ELSE (date_trunc('day', (${at}) AT TIME ZONE '${TIME_ZONE}' - ${start})
          + make_interval(days => ${days}) + ${start}) AT TIME ZONE '${TIME_ZONE}' END)`;
}

// 今日学習するカード: まだ一度も学習していないか、次に出す日時を過ぎたもの
export const DUE_CONDITION = "(review_due_at IS NULL OR review_due_at <= now())";

// 覚え具合の区分。統計で使う
//   learned  … 覚えた（3回続けて「覚えている」＝ 次は1週間以上あと）
//   learning … 覚え中（1〜2回続けて「覚えている」）
//   forgot   … 覚えていない（最後に「覚えていない」を押した）
//   new      … 未学習（まだ一度も学習していない）
export const LEARNED_BOX = 3;
export const STATUS_SQL = `CASE
    WHEN review_count = 0 THEN 'new'
    WHEN review_box = 0 THEN 'forgot'
    WHEN review_box < ${LEARNED_BOX} THEN 'learning'
    ELSE 'learned'
  END`;
export const STATUSES = [
  { key: "learned", label: "覚えた" },
  { key: "learning", label: "覚え中" },
  { key: "forgot", label: "覚えていない" },
  { key: "new", label: "未学習" },
];
