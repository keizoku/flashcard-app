// 公開した DB（Neon など）で、指定したアカウントのデータを消して、登録した直後の状態に戻す道具。
// テスト用のアカウントを、また最初から（はじめの4ステップから）試してもらうときに使う。使い方は docs/deploy.md。
//
//   docker compose exec app node scripts/reset-user.mjs
//
// 消すもの: デッキ・カード・学習の記録・レベル設定・「知ってる」の語・勉強時間。アカウントとパスワードは残す。
// 消す前に、ID をもう一度入れてもらう（まちがって自分のデータを消さないように）。
// 接続の文字列は画面に出さない。手元の DB（DATABASE_URL）は使わない
import { ask, connectDb } from "./prompt.mjs";

// lib/ のファイルを ES モジュールとして読むときの、node の注意書き（動きには関係ない）を出さない
process.removeAllListeners("warning");
const { resetUserData } = await import("../lib/userAdmin.js");

const client = await connectDb();
try {
  const username = await ask("最初の状態に戻すアカウントの ID: ");
  console.log(`\n${username} のデッキ・カード・学習の記録・レベル設定・「知ってる」の語・勉強時間を、すべて消します（元に戻せません）。`);
  console.log("アカウントとパスワードは残ります。");
  const again = await ask("よければ、同じ ID をもう一度入れてください（やめるときは Enter）: ");
  if (!again || again.toLowerCase() !== username.toLowerCase()) {
    console.log("何も消しませんでした。");
    process.exit(0);
  }
  const r = await resetUserData(client, username);
  if (r.error) {
    console.log(`できませんでした: ${r.error}`);
    process.exit(1);
  }
  const d = r.deleted;
  console.log(
    `最初の状態に戻しました: ${r.username}（消したもの: デッキ ${d.decks}・レベル設定 ${d.settings}・「知ってる」の語 ${d.knownWords}・勉強時間 ${d.studyTime}）`
  );
  console.log("ログインし直すと、トップに「はじめの4ステップ」が出ます。");
} finally {
  await client.end();
}
