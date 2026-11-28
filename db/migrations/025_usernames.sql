-- メールアドレスをやめて、ID（文字列）とパスワードでログインする。新しく登録する人の個人情報（メールアドレス）を持たないため。
-- パスワードを忘れたときは、登録のときに渡す「復旧コード」で作り直す（メールは送らない）。

-- 登録を完了していない（確認メールのリンクを開いていない）ユーザーは、ログインもできず、データもないので消す
DELETE FROM users WHERE verified_at IS NULL AND guest_expires_at IS NULL;

-- ID。今までのユーザーは、今までどおりログインできるよう、メールアドレス（小文字）をそのまま ID にする。
-- 新しく登録する人の ID には「@」は使えないので、ぶつからない。ID を変えるときは scripts/rename-user.mjs
ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = CASE WHEN guest_expires_at IS NOT NULL THEN 'guest-' || id ELSE lower(trim(email)) END;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX users_username_idx ON users (username);

-- 復旧コードのハッシュ（コードそのものは保存しない）。NULL = まだ作っていない
ALTER TABLE users ADD COLUMN recovery_code_hash TEXT;

-- メールアドレスと、メールの確認・再設定のしくみを消す
DROP INDEX users_email_idx;
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN verified_at;
DROP TABLE email_tokens;

-- 新規登録をした記録（いたずらで大量に作られないように、同じ接続元から登録した回数を数える）。
-- 接続元はハッシュにする。1日たったら消す
CREATE TABLE signup_starts (
  id         BIGSERIAL PRIMARY KEY,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signup_starts_ip_idx ON signup_starts (ip_hash, created_at);
