-- 1枚のカードに、覚えたい語（単語・イディオム）を複数持たせる（i+2、i+3 の文のカード用）
-- cards.target_word / target_form などは「1つ目の語」として、これまでどおり残す
CREATE TABLE card_targets (
  id               SERIAL PRIMARY KEY,
  card_id          INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  position         SMALLINT NOT NULL DEFAULT 0,
  word             TEXT NOT NULL,   -- 原形・イディオムのキー（例: run、figure sth out）
  form             TEXT NOT NULL,   -- 例文の中での形（例: ran、figured it out）
  meaning          TEXT,            -- この文での意味
  translation_form TEXT             -- 和訳の中で対応する部分
);
CREATE INDEX card_targets_card_id_idx ON card_targets (card_id, position);
CREATE INDEX card_targets_word_idx ON card_targets (word);

-- 今までのカード（語が1つ）を移す
INSERT INTO card_targets (card_id, position, word, form, meaning, translation_form)
SELECT id, 0, target_word, target_form, ai_meaning, ai_translation_form
FROM cards
WHERE target_word IS NOT NULL AND target_form IS NOT NULL;
