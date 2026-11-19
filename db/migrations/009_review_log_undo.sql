-- 学習で「前のカードに戻る」ときに、答える前の状態に戻せるよう、答える前の値を記録しておく
ALTER TABLE review_logs
  ADD COLUMN prev_box              SMALLINT,
  ADD COLUMN prev_due_at           TIMESTAMPTZ,
  ADD COLUMN prev_last_reviewed_at TIMESTAMPTZ;
