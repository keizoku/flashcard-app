-- パスキー（パスワードの代わりに、端末の指紋・顔・PIN でログインする）
-- 1人が複数の端末に登録できる。公開鍵だけを保存する（秘密の鍵は端末から出ない）
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,                -- 端末が決めた ID（credential ID、base64url）
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,          -- 公開鍵（COSE の形）
  counter BIGINT NOT NULL DEFAULT 0,  -- 使った回数（端末が数える。0 のままの端末もある）
  transports TEXT[] NOT NULL DEFAULT '{}',
  name TEXT NOT NULL,                 -- 利用者が付けた名前（「iPhone」など）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX passkeys_user_idx ON passkeys (user_id);

-- 登録・ログインのときに出した「合言葉」（challenge）。1回だけ、5分まで使える
CREATE TABLE passkey_challenges (
  token_hash TEXT PRIMARY KEY,        -- Cookie に入れた値のハッシュ
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- 登録のときだけ
  expires_at TIMESTAMPTZ NOT NULL
);
