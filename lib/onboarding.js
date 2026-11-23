import "server-only";
import { pool } from "./db.js";

// トップの「はじめの4ステップ」。新しく登録した人を、使い方の順に案内する。
// 終わったかどうかは、そのユーザーのデータを見て決める（利用者がチェックを付ける必要はない）。
// 4つとも終わるか、「閉じる」を押したら出さない
//   steps: [{ key, done, href }]。href が null のステップは、前のステップが終わるまで行き先がない
export async function getOnboarding(userId) {
  const { rows } = await pool.query(
    `SELECT
       u.onboarding_dismissed_at IS NOT NULL AS dismissed,
       EXISTS (SELECT 1 FROM settings s WHERE s.user_id = u.id) AS level,
       EXISTS (SELECT 1 FROM decks d WHERE d.user_id = u.id) AS deck,
       EXISTS (SELECT 1 FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.user_id = u.id) AS cards,
       EXISTS (SELECT 1 FROM review_logs r JOIN decks d ON d.id = r.deck_id WHERE d.user_id = u.id) AS study,
       -- 字幕を貼る先: 動画のデッキのうち、最初に作ったもの（物語のデッキは字幕を貼らない）
       (SELECT d.id FROM decks d WHERE d.user_id = u.id AND d.kind <> 'story' ORDER BY d.id LIMIT 1) AS import_deck,
       -- 記憶テストをする先: カードのあるデッキのうち、最初に作ったもの
       (SELECT d.id FROM decks d WHERE d.user_id = u.id AND EXISTS (SELECT 1 FROM cards c WHERE c.deck_id = d.id)
        ORDER BY d.id LIMIT 1) AS study_deck
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  const r = rows[0];
  if (!r) return { show: false, doneCount: 0, steps: [] };
  const steps = [
    { key: "level", done: r.level, href: "/settings" },
    // 最初は YouTube の URL を貼って単語帳を作ってもらう
    { key: "deck", done: r.deck, href: "/decks/new" },
    { key: "cards", done: r.cards, href: r.import_deck ? `/decks/${r.import_deck}/import` : null },
    { key: "study", done: r.study, href: r.study_deck ? `/decks/${r.study_deck}/study` : null },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { show: !r.dismissed && doneCount < steps.length, doneCount, steps };
}

// 「閉じる」を押した。そのユーザーの分だけ記録する
export async function dismissOnboardingFor(userId) {
  await pool.query("UPDATE users SET onboarding_dismissed_at = now() WHERE id = $1 AND onboarding_dismissed_at IS NULL", [userId]);
}
