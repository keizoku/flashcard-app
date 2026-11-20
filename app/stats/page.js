import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getComprehensionByDeck } from "@/lib/comprehension";
import { pool } from "@/lib/db";
import { displayTarget } from "@/lib/format";
import { STATUS_SQL, STATUSES } from "@/lib/review";
import { formatDuration, STUDY_KINDS } from "@/lib/studyClock";
import { getStudyTimeStats, MAX_MANUAL_MINUTES } from "@/lib/studyTime";
import { ManualTimeForm, ManualTimeList } from "./StudyTimeForms";

export const dynamic = "force-dynamic";

const DAYS = 14;
const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

export default async function StatsPage() {
  const user = await requireUser();
  const time = await getStudyTimeStats(user.id, { days: DAYS });
  // デッキごとの、覚え具合の内訳
  const { rows: deckRows } = await pool.query(
    `
    SELECT d.id, d.name,
           COUNT(c.id)::int AS total,
           COUNT(c.id) FILTER (WHERE ${STATUS_SQL} = 'learned')::int  AS learned,
           COUNT(c.id) FILTER (WHERE ${STATUS_SQL} = 'learning')::int AS learning,
           COUNT(c.id) FILTER (WHERE ${STATUS_SQL} = 'forgot')::int   AS forgot,
           COUNT(c.id) FILTER (WHERE ${STATUS_SQL} = 'new')::int      AS new
    FROM decks d LEFT JOIN cards c ON c.deck_id = d.id
    WHERE d.user_id = $1
    GROUP BY d.id ORDER BY d.id`,
    [user.id]
  );
  const comprehensionByDeck = await getComprehensionByDeck(user.id);
  const overall = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s.key]: deckRows.reduce((n, d) => n + d[s.key], 0) }),
    { total: deckRows.reduce((n, d) => n + d.total, 0) }
  );

  // 日ごとの学習回数（日本時間で、直近14日）
  const { rows: dayRows } = await pool.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            COUNT(l.id) FILTER (WHERE l.remembered)::int     AS remembered,
            COUNT(l.id) FILTER (WHERE NOT l.remembered)::int AS forgot
     FROM generate_series((now() AT TIME ZONE 'Asia/Tokyo')::date - ($1::int - 1), (now() AT TIME ZONE 'Asia/Tokyo')::date, '1 day') AS day
     LEFT JOIN review_logs l ON (l.reviewed_at AT TIME ZONE 'Asia/Tokyo')::date = day
       AND l.deck_id IN (SELECT id FROM decks WHERE user_id = $2)
     GROUP BY day ORDER BY day`,
    [DAYS, user.id]
  );
  const today = dayRows.at(-1);
  const week = dayRows.slice(-7).reduce(
    (acc, d) => ({ remembered: acc.remembered + d.remembered, forgot: acc.forgot + d.forgot }),
    { remembered: 0, forgot: 0 }
  );

  // 苦手な語（「覚えていない」を押した回数が多い順）
  const { rows: hard } = await pool.query(
    `SELECT c.id, c.front, c.lapse_count, c.review_count, d.name AS deck_name,
           (SELECT string_agg(t.word, ' / ' ORDER BY t.position) FROM card_targets t WHERE t.card_id = c.id) AS target_word
    FROM cards c JOIN decks d ON d.id = c.deck_id
    WHERE c.lapse_count > 0 AND d.user_id = $1
    ORDER BY c.lapse_count DESC, c.review_count ASC, c.id
    LIMIT 15`,
    [user.id]
  );

  // 区分ごとの語の一覧
  const { rows: words } = await pool.query(
    `SELECT c.id, COALESCE(t.word, c.front) AS word, ${STATUS_SQL} AS status
     FROM cards c JOIN decks d ON d.id = c.deck_id LEFT JOIN card_targets t ON t.card_id = c.id
     WHERE d.user_id = $1
     ORDER BY COALESCE(t.word, c.front)`,
    [user.id]
  );

  return (
    <main className="stats-page">
      <h1>統計</h1>

      <StudyTimeSection time={time} />

      {overall.total === 0 ? (
        <p className="note">まだカードがありません。</p>
      ) : (
        <>
          <section aria-labelledby="overall">
            <h2 id="overall">覚え具合（全 {overall.total} 枚）</h2>
            <div className="stat-tiles">
              {STATUSES.map((s) => (
                <div key={s.key} className="stat-tile">
                  <span className={`swatch status-${s.key}`} aria-hidden="true" />
                  <span className="stat-label">{s.label}</span>
                  <span className="stat-value">{overall[s.key]}</span>
                  <span className="stat-sub">{pct(overall[s.key], overall.total)}%</span>
                </div>
              ))}
            </div>
            <p className="note small">
              覚えた = 3回続けて「覚えている」（次は1週間以上あと）、覚え中 = 1〜2回続けて「覚えている」、
              覚えていない = 最後に「覚えていない」を押したカード。
            </p>
          </section>

          <section aria-labelledby="by-deck">
            <h2 id="by-deck">デッキ別</h2>
            <Legend />
            <ul className="deck-bars">
              {deckRows.map((d) => (
                <li key={d.id}>
                  <div className="deck-bar-head">
                    <Link href={`/decks/${d.id}`}>{d.name}</Link>
                    <span className="note small">
                      覚えた {d.learned} / {d.total} 枚（{pct(d.learned, d.total)}%）
                      {comprehensionByDeck.has(d.id) && ` · 動画の理解度 ${comprehensionByDeck.get(d.id).percent}%`}
                    </span>
                  </div>
                  <StackedBar row={d} />
                </li>
              ))}
            </ul>
            <details className="table-view">
              <summary>表で見る</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">デッキ</th>
                    {STATUSES.map((s) => (
                      <th key={s.key} scope="col">{s.label}</th>
                    ))}
                    <th scope="col">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {deckRows.map((d) => (
                    <tr key={d.id}>
                      <th scope="row">{d.name}</th>
                      {STATUSES.map((s) => (
                        <td key={s.key}>{d[s.key]}</td>
                      ))}
                      <td>{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <section aria-labelledby="daily">
            <h2 id="daily">学習の記録（直近 {DAYS} 日）</h2>
            <p className="note small">
              今日 {today.remembered + today.forgot} 回（覚えている {today.remembered} / 覚えていない {today.forgot}）・
              直近7日 {week.remembered + week.forgot} 回
              {week.remembered + week.forgot > 0 &&
                `（覚えている率 ${pct(week.remembered, week.remembered + week.forgot)}%）`}
            </p>
            <DailyChart days={dayRows} />
          </section>

          <section aria-labelledby="hard">
            <h2 id="hard">苦手な語</h2>
            {hard.length === 0 ? (
              <p className="note small">まだありません。学習で「覚えていない」を押した語が、多い順に並びます。</p>
            ) : (
              <ol className="hard-list">
                {hard.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cards/${c.id}/edit`} className="hard-word">
                      {c.target_word ? displayTarget(c.target_word) : c.front}
                    </Link>
                    <span className="note small">
                      覚えていない {c.lapse_count} 回 / 学習 {c.review_count} 回 · {c.deck_name}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="words">
            <h2 id="words">区分ごとの語</h2>
            {STATUSES.map((s) => {
              const list = words.filter((w) => w.status === s.key);
              return (
                <details key={s.key} className="word-group">
                  <summary>
                    <span className={`swatch status-${s.key}`} aria-hidden="true" /> {s.label}（{list.length}）
                  </summary>
                  {list.length === 0 ? (
                    <p className="note small">ありません。</p>
                  ) : (
                    <ul className="known-words">
                      {list.map((w) => (
                        <li key={`${w.id}-${w.word}`}>
                          <Link href={`/cards/${w.id}/edit`}>{displayTarget(w.word)}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

function Legend() {
  return (
    <ul className="legend" aria-label="凡例">
      {STATUSES.map((s) => (
        <li key={s.key}>
          <span className={`swatch status-${s.key}`} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// 1本の横棒を、区分ごとの枚数で区切る
function StackedBar({ row }) {
  if (row.total === 0) return <div className="stacked-bar empty">カードなし</div>;
  return (
    <div className="stacked-bar" role="img" aria-label={STATUSES.map((s) => `${s.label} ${row[s.key]}枚`).join("、")}>
      {STATUSES.filter((s) => row[s.key] > 0).map((s) => (
        <span
          key={s.key}
          className={`seg status-${s.key}`}
          style={{ flexGrow: row[s.key] }}
          data-tip={`${s.label} ${row[s.key]} 枚（${pct(row[s.key], row.total)}%）`}
        />
      ))}
    </div>
  );
}

// 日ごとの「覚えている / 覚えていない」の積み上げ縦棒
function DailyChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.remembered + d.forgot));
  return (
    <>
      <ul className="legend" aria-label="凡例">
        <li>
          <span className="swatch status-learned" aria-hidden="true" />
          覚えている
        </li>
        <li>
          <span className="swatch status-forgot" aria-hidden="true" />
          覚えていない
        </li>
      </ul>
      <div className="daily-chart" role="img" aria-label="日ごとの学習回数">
        {days.map((d) => {
          const [, m, day] = d.day.split("-");
          const total = d.remembered + d.forgot;
          return (
            <div
              key={d.day}
              className="day"
              data-tip={`${Number(m)}/${Number(day)}: 覚えている ${d.remembered} / 覚えていない ${d.forgot}`}
            >
              <div className="day-plot">
                {total > 0 && <small className="day-total">{total}</small>}
                {d.forgot > 0 && (
                  <span className="col status-forgot" style={{ height: `${(d.forgot / max) * 100}%` }} />
                )}
                {d.remembered > 0 && (
                  <span className="col status-learned" style={{ height: `${(d.remembered / max) * 100}%` }} />
                )}
              </div>
              <span className="day-label">{Number(day)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// 勉強時間（単語を覚えた時間・リスニングの時間）
const KIND_KEYS = ["vocab", "listening"];
const whenText = (d) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

function StudyTimeSection({ time }) {
  const tiles = [
    { label: "今日の単語", seconds: time.today.vocab, kind: "vocab" },
    { label: "今日のリスニング", seconds: time.today.listening, kind: "listening" },
    { label: "7日間の単語", seconds: time.week.vocab, kind: "vocab" },
    { label: "7日間のリスニング", seconds: time.week.listening, kind: "listening" },
  ];
  return (
    <section aria-labelledby="study-time">
      <h2 id="study-time">勉強時間</h2>
      <div className="stat-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="stat-tile">
            <span className={`swatch time-${t.kind}`} aria-hidden="true" />
            <span className="stat-label">{t.label}</span>
            <span className="stat-value">{formatDuration(t.seconds)}</span>
          </div>
        ))}
      </div>
      <p className="note small">
        単語 = 記憶テストの画面で操作していた時間（2分なにもしなければ止まる）。リスニング = アプリの中で動画を再生していた時間。
        これまでの合計: 単語 {formatDuration(time.total.vocab)}・リスニング {formatDuration(time.total.listening)}
      </p>
      <TimeChart days={time.days} />

      {time.byDeck.length > 0 && (
        <details className="table-view">
          <summary>デッキ別の時間</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">デッキ</th>
                <th scope="col">単語</th>
                <th scope="col">リスニング</th>
              </tr>
            </thead>
            <tbody>
              {time.byDeck.map((d) => (
                <tr key={d.id}>
                  <th scope="row">
                    <Link href={`/decks/${d.id}`}>{d.name}</Link>
                  </th>
                  <td>{formatDuration(d.vocab)}</td>
                  <td>{formatDuration(d.listening)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <h3 className="manual-time-head">アプリの外で勉強した時間を足す</h3>
      <p className="note small">スマホの YouTube アプリで聞いた時間などは、ここで足してください。</p>
      <ManualTimeForm maxMinutes={MAX_MANUAL_MINUTES} />
      <ManualTimeList
        entries={time.manual.map((m) => ({
          id: m.id,
          when: whenText(m.recorded_at),
          label: `${STUDY_KINDS[m.kind]} ${formatDuration(m.seconds)}`,
        }))}
      />
    </section>
  );
}

// 日ごとの勉強時間（分）。単語とリスニングの積み上げ縦棒
function TimeChart({ days }) {
  const minutes = (s) => Math.round(s / 60);
  const max = Math.max(1, ...days.map((d) => d.vocab + d.listening));
  return (
    <>
      <ul className="legend" aria-label="凡例">
        {KIND_KEYS.map((k) => (
          <li key={k}>
            <span className={`swatch time-${k}`} aria-hidden="true" />
            {STUDY_KINDS[k]}
          </li>
        ))}
      </ul>
      <div className="daily-chart" role="img" aria-label="日ごとの勉強時間">
        {days.map((d) => {
          const [, m, day] = d.day.split("-");
          const total = d.vocab + d.listening;
          return (
            <div
              key={d.day}
              className="day"
              data-tip={`${Number(m)}/${Number(day)}: 単語 ${minutes(d.vocab)}分 / リスニング ${minutes(d.listening)}分`}
            >
              <div className="day-plot">
                {total >= 60 && <small className="day-total">{minutes(total)}</small>}
                {d.listening > 0 && <span className="col time-listening" style={{ height: `${(d.listening / max) * 100}%` }} />}
                {d.vocab > 0 && <span className="col time-vocab" style={{ height: `${(d.vocab / max) * 100}%` }} />}
              </div>
              <span className="day-label">{Number(day)}</span>
            </div>
          );
        })}
      </div>
      <details className="table-view">
        <summary>表で見る</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">日</th>
              <th scope="col">単語（分）</th>
              <th scope="col">リスニング（分）</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <th scope="row">{d.day}</th>
                <td>{minutes(d.vocab)}</td>
                <td>{minutes(d.listening)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
