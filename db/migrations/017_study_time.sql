-- 勉強時間。単語を覚えた時間（記憶テストの画面）と、リスニングの時間（アプリの中で動画を再生した時間）。
-- 画面から少しずつ（1回 600 秒まで）送られてくるので、1行は「その間に勉強した秒数」。手で足した分も入る
CREATE TABLE study_time (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- どのデッキで勉強したか。手で足した分・デッキを消したあとは NULL
  deck_id     INTEGER REFERENCES decks(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('vocab', 'listening')),
  source      TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  seconds     INTEGER NOT NULL CHECK (seconds > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX study_time_user_recorded_at_idx ON study_time (user_id, recorded_at);
CREATE INDEX study_time_deck_id_idx ON study_time (deck_id);
