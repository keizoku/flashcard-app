-- おためしユーザー（新規登録をせずに、1日だけ全機能を試せるアカウント）。
-- guest_expires_at が入っているユーザーが、おためしユーザー。この日時を過ぎたら、アカウントごと削除する
ALTER TABLE users ADD COLUMN guest_expires_at TIMESTAMPTZ;
CREATE INDEX users_guest_expires_idx ON users (guest_expires_at) WHERE guest_expires_at IS NOT NULL;

-- おためしを始めた記録（いたずらで大量に作られないように、同じ接続元から始めた回数を数える）。
-- 接続元（IP アドレス）はそのまま保存せず、ハッシュにする。1日たったら消す
CREATE TABLE guest_starts (
  id         BIGSERIAL PRIMARY KEY,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX guest_starts_ip_idx ON guest_starts (ip_hash, created_at);
