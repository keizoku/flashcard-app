-- トップの「はじめの4ステップ」を、利用者が「閉じる」で消した日時。NULL = まだ閉じていない
ALTER TABLE users ADD COLUMN onboarding_dismissed_at TIMESTAMPTZ;
