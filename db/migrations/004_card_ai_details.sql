-- AI（Claude）が作るカードの解説
ALTER TABLE cards
  ADD COLUMN ai_translation  TEXT,   -- 例文の和訳
  ADD COLUMN ai_meaning      TEXT,   -- 対象の単語・イディオムの、この文での意味
  ADD COLUMN ai_examples     JSONB,  -- ほかの例文 [{ "en": ..., "ja": ... }]
  ADD COLUMN ai_trivia       TEXT,   -- 語源・ニュアンス・使い分けなどの豆知識
  ADD COLUMN ai_generated_at TIMESTAMPTZ;
