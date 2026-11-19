-- おすすめの動画の情報を、API キーのいらない YouTube の oEmbed で取るようにする。
-- oEmbed では公開の状態・長さ・埋め込みの可否はわからないので、その列を消し、「見られるか」だけを持つ
-- （非公開・消された動画は oEmbed で取れないので、見られないにする。限定公開は公開と見分けられない）

ALTER TABLE videos DROP COLUMN duration_seconds;
ALTER TABLE videos DROP COLUMN privacy_status;
ALTER TABLE videos DROP COLUMN embeddable;
ALTER TABLE videos ADD COLUMN available BOOLEAN NOT NULL DEFAULT true; -- oEmbed で取れたか（false = 非公開・消された）
