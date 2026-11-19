-- 「覚えている / 覚えていない」を押した記録（統計の、日ごとの学習回数に使う）
CREATE TABLE review_logs (
  id          BIGSERIAL PRIMARY KEY,
  card_id     INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  deck_id     INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  remembered  BOOLEAN NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX review_logs_reviewed_at_idx ON review_logs (reviewed_at);
