-- おすすめの動画（みんなが学んだ動画）に出すための、YouTube の動画の情報。
-- YouTube Data API の videos で取る。公開の状態（privacy_status）を確かめて、公開動画だけをおすすめに出す
-- （限定公開・非公開の動画を、ほかの人に見せないため）。YouTube の決まりで、30日より古い情報は使わない

CREATE TABLE videos (
  video_id         TEXT PRIMARY KEY,                -- YouTube の動画 ID（11文字）
  title            TEXT,                            -- 動画のタイトル（デッキ名ではない）
  channel_title    TEXT,                            -- チャンネル名
  duration_seconds INTEGER,                         -- 長さ（秒）
  privacy_status   TEXT NOT NULL,                   -- public / unlisted / private / unavailable（消された・見つからない）
  embeddable       BOOLEAN NOT NULL DEFAULT false,  -- ほかのサイトに埋め込んで再生できるか
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now() -- YouTube に確かめた日時
);
