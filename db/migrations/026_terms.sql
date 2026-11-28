-- 利用規約に同意した記録。規約を大きく変えたら版（terms_version）を上げ、もう一度同意してもらう。
-- NULL = まだ同意していない（このファイルより前からのアカウント・管理用の道具で作ったアカウント）。
-- 次にログインしたとき、同意の画面（/agree）を出す
ALTER TABLE users ADD COLUMN terms_version INTEGER;
ALTER TABLE users ADD COLUMN terms_agreed_at TIMESTAMPTZ;
