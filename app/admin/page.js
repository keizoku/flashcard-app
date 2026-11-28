import { requireAdmin } from "@/lib/admin";
import { getAdminDaily, getAdminSummary } from "@/lib/adminStats";
import { formatDuration } from "@/lib/studyClock";
import DailyTable from "./DailyTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理 | フラッシュカード" };

const DAYS = 30;

// 管理者の画面。ユーザーの数と、どのくらい使われているかを、数だけで出す（だれのデータかは出さない）。
// 管理者は環境変数 ADMIN_EMAILS で決める（lib/admin.js）
export default async function AdminPage() {
  await requireAdmin();
  const [s, days] = await Promise.all([getAdminSummary(), getAdminDaily({ days: DAYS })]);

  const groups = [
    {
      title: "ユーザー",
      tiles: [
        { label: "登録ユーザー", value: s.users.registered, sub: `確認待ち ${s.users.unverified}人` },
        { label: "この7日に登録", value: s.users.new7 },
        { label: "この30日に登録", value: s.users.new30 },
        { label: "いまのおためし", value: s.guests.active, sub: `開始 今日${s.guests.startsToday}・30日${s.guests.starts30}` },
      ],
    },
    {
      title: "使った人（登録ユーザー）",
      tiles: [
        { label: "今日", value: s.active.today },
        { label: "この7日", value: s.active.days7 },
        { label: "この30日", value: s.active.days30 },
      ],
    },
    {
      title: "使われ方（登録ユーザー）",
      tiles: [
        { label: "単語帳", value: s.content.decks },
        { label: "カード", value: s.content.cards },
        { label: "30日の回答数", value: s.content.reviews30 },
        { label: "30日の勉強時間", value: formatDuration(s.content.studySeconds30) },
      ],
    },
  ];

  return (
    <main className="stats-page admin-page">
      <h1>管理</h1>
      <p className="note">
        数だけを出します（日の区切りは日本時間）。「使った人」は、記憶テストに答えた・勉強時間がある・カードか単語帳を作った人です。
        おためしユーザーは1日で消えるので、「使った人」「使われ方」には入れず、始めた回数だけを数えます。
      </p>

      <section aria-labelledby="admin-summary">
        <h2 id="admin-summary">全体の数</h2>
        {groups.map((g) => (
          <div key={g.title} className="admin-group">
            <h3>{g.title}</h3>
            <div className="stat-tiles">
              {g.tiles.map((t) => (
                <div key={t.label} className="stat-tile">
                  <span className="stat-label">{t.label}</span>
                  <span className="stat-value">{t.value}</span>
                  {t.sub && <span className="stat-sub">{t.sub}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="admin-daily">
        <h2 id="admin-daily">日ごとの推移（直近{DAYS}日）</h2>
        <DailyTable days={days} />
      </section>
    </main>
  );
}
