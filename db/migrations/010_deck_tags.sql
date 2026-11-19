-- デッキの分類タグ（1つのデッキに複数のタグを付けられる）
CREATE TABLE tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE deck_tags (
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (deck_id, tag_id)
);
CREATE INDEX deck_tags_tag_id_idx ON deck_tags (tag_id);
