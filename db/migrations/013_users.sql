-- ユーザー管理（メールアドレスとパスワードでログイン。登録はメールのリンクで有効にする）

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  verified_at   TIMESTAMPTZ,            -- メールのリンクを押して登録が有効になった日時（NULL = まだ）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 大文字・小文字の違いは同じアドレスとして扱う
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

-- ログイン中のセッション。Cookie にはランダムな値を入れ、DB にはそのハッシュだけを保存する
CREATE TABLE user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_id_idx ON user_sessions (user_id);

-- メールで送るリンクの合言葉（登録の確認 / パスワードの再設定）。使ったら消す
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_tokens_user_id_idx ON email_tokens (user_id, purpose);

-- デッキはユーザーごと。カード・学習記録・タグの付け方はデッキについてくる
-- user_id が NULL のデータ（ユーザー管理を入れる前のもの）は、最初に登録を有効にしたユーザーに引き継ぐ
ALTER TABLE decks ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX decks_user_id_idx ON decks (user_id);

-- レベル設定もユーザーごと（1人1行）
ALTER TABLE settings DROP CONSTRAINT settings_pkey, DROP CONSTRAINT settings_id_check;
ALTER TABLE settings DROP COLUMN id;
ALTER TABLE settings ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX settings_user_id_idx ON settings (user_id);

-- 「知ってる」にした単語もユーザーごと
ALTER TABLE known_words DROP CONSTRAINT known_words_pkey;
ALTER TABLE known_words ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX known_words_user_word_idx ON known_words (user_id, word);
