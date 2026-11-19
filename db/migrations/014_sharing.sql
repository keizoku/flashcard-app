-- デッキの共有。公開したデッキは、ほかのユーザーが「みんなのデッキ」から自分のデッキとして取り込める
-- （取り込むと、その時点のデッキとカードがコピーされる。元のデッキとはつながらない）

-- 表示名。公開したデッキに、作った人として出す（メールアドレスはほかの人に見せない）
ALTER TABLE users ADD COLUMN display_name TEXT;

-- 公開した日時。NULL = 公開していない
ALTER TABLE decks ADD COLUMN published_at TIMESTAMPTZ;
-- 取り込み元のデッキ（「取り込みずみ」の表示に使う）。元のデッキを消すと NULL になる
ALTER TABLE decks ADD COLUMN source_deck_id INTEGER REFERENCES decks(id) ON DELETE SET NULL;

CREATE INDEX decks_published_at_idx ON decks (published_at) WHERE published_at IS NOT NULL;
CREATE INDEX decks_source_deck_id_idx ON decks (source_deck_id);
