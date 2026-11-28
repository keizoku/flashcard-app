// 管理用: アカウントを作る・パスワードを作り直す・ID を変える・データを最初の状態に戻す（scripts/ の道具から使う）。
// 公開した DB に、テスト用のアカウントを用意するときなどに使う（docs/deploy.md）。
// Next.js の外の node で動かすので、server-only の部品や "@/" の読み込みは使わない。
// db: pg の Client か Pool（query が使えるもの）
import { checkPasswordRule, hashPassword } from "./passwordHash.js";
import { hashRecoveryCode, newRecoveryCode } from "./recovery.js";
import { checkUsernameRule, normalizeUsername } from "./username.js";

const NOT_FOUND = "その ID のアカウントが見つかりません";

// アカウントを作る → { created: true, id, username, recoveryCode } / { exists: true, username } / { error }。
// 作ったときは、復旧コードを返す（道具が画面に出す）
export async function createAccountByAdmin(db, rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  const ruleU = checkUsernameRule(username);
  if (ruleU) return { error: ruleU };
  const rule = checkPasswordRule(String(password ?? ""));
  if (rule) return { error: rule };
  const code = newRecoveryCode();
  const { rows } = await db.query(
    `INSERT INTO users (username, password_hash, recovery_code_hash) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING id`,
    [username, await hashPassword(password), hashRecoveryCode(code)]
  );
  if (!rows[0]) return { created: false, exists: true, username };
  return { created: true, id: rows[0].id, username, recoveryCode: code };
}

// パスワードを作り直す。その人のログインはすべて切る（おためしユーザーには使えない）
export async function setUserPassword(db, rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  const rule = checkPasswordRule(String(password ?? ""));
  if (rule) return { error: rule };
  const { rows } = await db.query(
    "UPDATE users SET password_hash = $2 WHERE username = $1 AND guest_expires_at IS NULL RETURNING id",
    [username, await hashPassword(password)]
  );
  if (!rows[0]) return { error: NOT_FOUND };
  await db.query("DELETE FROM user_sessions WHERE user_id = $1", [rows[0].id]);
  return { updated: true, id: rows[0].id, username };
}

// ID を変える（前からのアカウントの ID〈メールアドレス〉を、好きな ID にするときなど）。
// データ・パスワード・ログインはそのまま
export async function renameUser(db, rawFrom, rawTo) {
  const from = normalizeUsername(rawFrom);
  const to = normalizeUsername(rawTo);
  const rule = checkUsernameRule(to);
  if (rule) return { error: rule };
  const { rows: taken } = await db.query("SELECT 1 FROM users WHERE username = $1", [to]);
  if (taken[0]) return { error: "その ID はほかの人が使っています" };
  const { rows } = await db.query(
    "UPDATE users SET username = $2 WHERE username = $1 AND guest_expires_at IS NULL RETURNING id",
    [from, to]
  );
  if (!rows[0]) return { error: NOT_FOUND };
  return { renamed: true, id: rows[0].id, from, to };
}

// おためしでないアカウントの一覧（ID・登録日・単語帳の数・カードの数）。だれのものか見分けるため。個人情報は持っていない
export async function listAccounts(db) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, to_char(u.created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS created,
            (SELECT COUNT(*)::int FROM decks d WHERE d.user_id = u.id) AS decks,
            (SELECT COUNT(*)::int FROM cards c JOIN decks d ON d.id = c.deck_id WHERE d.user_id = u.id) AS cards
     FROM users u WHERE u.guest_expires_at IS NULL ORDER BY u.id`
  );
  return rows;
}

// そのユーザーのデータを消して、登録した直後の状態に戻す（テスト用のアカウントを、また最初から試してもらうため）。
// 消すもの: デッキ（カード・記録・タグの対応・場面の絵もいっしょに消える）、レベル設定、「知ってる」の語、勉強時間。
// 「はじめの4ステップ」を閉じた印も消す（また出るように）。アカウント・パスワード・ログインは残す。
// 1つの SQL で行うので、途中で失敗したら何も消えない
export async function resetUserData(db, rawUsername) {
  const username = normalizeUsername(rawUsername);
  const { rows } = await db.query(
    `WITH u AS (SELECT id FROM users WHERE username = $1 AND guest_expires_at IS NULL),
          d AS (DELETE FROM decks WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          s AS (DELETE FROM settings WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          k AS (DELETE FROM known_words WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          t AS (DELETE FROM study_time WHERE user_id IN (SELECT id FROM u) RETURNING 1),
          o AS (UPDATE users SET onboarding_dismissed_at = NULL WHERE id IN (SELECT id FROM u) RETURNING id)
     SELECT (SELECT id FROM u) AS id,
            (SELECT count(*) FROM d)::int AS decks,
            (SELECT count(*) FROM s)::int AS settings,
            (SELECT count(*) FROM k)::int AS known_words,
            (SELECT count(*) FROM t)::int AS study_time,
            (SELECT count(*) FROM o)::int AS onboarding`,
    [username]
  );
  const r = rows[0];
  if (!r?.id) return { error: NOT_FOUND };
  return {
    reset: true,
    id: r.id,
    username,
    deleted: { decks: r.decks, settings: r.settings, knownWords: r.known_words, studyTime: r.study_time },
  };
}
