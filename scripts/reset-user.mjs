// 公開した DB（Neon など）で、指定したアカウントのデータを消して、登録した直後の状態に戻す道具。
// テスト用のアカウントを、また最初から（はじめの4ステップから）試してもらうときに使う。使い方は docs/deploy.md。
//
//   docker compose exec app node scripts/reset-user.mjs
//
// 消すもの: デッキ・カード・学習の記録・レベル設定・「知ってる」の語・勉強時間。アカウントとパスワードは残す。
// 消す前に、メールアドレスをもう一度入れてもらう（まちがって自分のデータを消さないように）。
// 接続の文字列は画面に出さない。手元の DB（DATABASE_URL）は使わない
import pg from "pg";
import { ask } from "./prompt.mjs";

// lib/ のファイルを ES モジュールとして読むときの、node の注意書き（動きには関係ない）を出さない
process.removeAllListeners("warning");
const { resetUserData } = await import("../lib/userAdmin.js");

const url = await ask("つなぐ DB の接続の文字列（Neon の Connect でコピー。画面には出ません）: ", { hidden: true });
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.log("接続の文字列は postgresql:// で始まります。やり直してください。");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (err) {
  console.log(`DB につなげませんでした: ${err.message}`);
  process.exit(1);
}

try {
  const email = await ask("最初の状態に戻すアカウントのメールアドレス: ");
  console.log(`\n${email} のデッキ・カード・学習の記録・レベル設定・「知ってる」の語・勉強時間を、すべて消します（元に戻せません）。`);
  console.log("アカウントとパスワードは残ります。");
  const again = await ask("よければ、同じメールアドレスをもう一度入れてください（やめるときは Enter）: ");
  if (!again || again.toLowerCase() !== email.toLowerCase()) {
    console.log("何も消しませんでした。");
    process.exit(0);
  }
  const r = await resetUserData(client, email);
  if (r.error) {
    console.log(`できませんでした: ${r.error}`);
    process.exit(1);
  }
  const d = r.deleted;
  console.log(
    `最初の状態に戻しました: ${r.email}（消したもの: デッキ ${d.decks}・レベル設定 ${d.settings}・「知ってる」の語 ${d.knownWords}・勉強時間 ${d.studyTime}）`
  );
  console.log("ログインし直すと、トップに「はじめの4ステップ」が出ます。");
} finally {
  await client.end();
}
