-- 記憶テスト（学習）の記録
--   review_box: 覚えている段階（0 = まだ・忘れた、数字が大きいほど長い間隔で出す）
--   review_due_at: 次に出す日時（NULL = まだ一度も学習していない）
ALTER TABLE cards
  ADD COLUMN review_box       SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN review_due_at    TIMESTAMPTZ,
  ADD COLUMN last_reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN lapse_count      INTEGER NOT NULL DEFAULT 0;

CREATE INDEX cards_review_due_idx ON cards (deck_id, review_due_at);
