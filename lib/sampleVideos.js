// おためしユーザーに「この動画で試してみてください」と出す、サンプルの動画。画面の部品からも使う。
// 選んだ条件（2026年11月に確かめた）:
// - 2〜4分くらい・ほかのサイトに埋め込める
// - 字幕は英語だけ（人が付けたもの）。日本語の字幕がある動画は、日本語の画面で「文字起こし」を開くと
//   日本語で出てしまうので、選ばない
// 動画が消えたり、埋め込めなくなったり、日本語の字幕が付いたりしたら、差し替える
export const SAMPLE_VIDEOS = [
  {
    id: "jKi2SvWOCXc",
    url: "https://www.youtube.com/watch?v=jKi2SvWOCXc",
    title: "The Bear and the Bee（The Fable Cottage）",
    seconds: 218,
    note: "英語を学ぶ人向けの短いお話。ゆっくり、はっきり話す",
  },
  {
    id: "rLXcLBfDwvE",
    url: "https://www.youtube.com/watch?v=rLXcLBfDwvE",
    title: "Self Motivation | Brendan Clark（TEDx）",
    seconds: 190,
    note: "高校生の短いスピーチ。やる気の出し方の話",
  },
];
