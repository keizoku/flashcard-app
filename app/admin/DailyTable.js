import { formatDuration } from "@/lib/studyClock";

// 管理者の画面の「日ごとの推移」。使った人の数の棒グラフと、日ごとの数の表。
// days: getAdminDaily() の値（古い順）
export default function DailyTable({ days }) {
  const max = Math.max(1, ...days.map((d) => d.activeUsers));
  const label = (day) => {
    const [, m, d] = day.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return (
    <>
      <h3>使った人（登録ユーザー）</h3>
      <div
        className="daily-chart admin-chart"
        style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
        role="img"
        aria-label="日ごとの使った人の数"
      >
        {days.map((d, i) => (
          <div key={d.day} className="day" data-tip={`${label(d.day)}: ${d.activeUsers}人`}>
            <div className="day-plot">
              {d.activeUsers > 0 && <small className="day-total">{d.activeUsers}</small>}
              {d.activeUsers > 0 && (
                <span className="col admin-col" style={{ height: `${(d.activeUsers / max) * 100}%` }} />
              )}
            </div>
            {/* 30日ぶんの日付は詰まるので、5日ごとと今日だけ出す */}
            <span className="day-label">{i % 5 === 0 || i === days.length - 1 ? Number(d.day.slice(8)) : ""}</span>
          </div>
        ))}
      </div>

      <div className="table-view">
        <table>
          <thead>
            <tr>
              <th scope="col">日付</th>
              <th scope="col">新規登録</th>
              <th scope="col">おためし開始</th>
              <th scope="col">使った人</th>
              <th scope="col">回答数</th>
              <th scope="col">勉強時間</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <th scope="row">{label(d.day)}</th>
                <td>{d.signups}</td>
                <td>{d.guestStarts}</td>
                <td>{d.activeUsers}</td>
                <td>{d.reviews}</td>
                <td>{formatDuration(d.studySeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
