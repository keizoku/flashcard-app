-- おためしユーザーに最初から入れた単語帳（サンプル）の印。
-- はじめのステップで「サンプルで試す」と「自分で動画を選んで作る」を分けて数えるのに使う
ALTER TABLE decks ADD COLUMN is_sample BOOLEAN NOT NULL DEFAULT false;
