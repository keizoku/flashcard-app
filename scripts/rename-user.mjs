// アカウントの ID を変える道具。メールアドレスから ID に切り替えたとき（025）、今までのアカウントは
// メールアドレスがそのまま ID になる。それを好きな ID に変えるときに使う。使い方は docs/deploy.md。
//
//   docker compose exec app node scripts/rename-user.mjs
//
// はじめに、アカウントの一覧（ID・登録日・単語帳とカードの数）を出す。変えるアカウントを確かめるため。
// データ・パスワード・ログインはそのまま。接続の文字列は画面に出さない
import { ask, connectDb } from "./prompt.mjs";

// lib/ のファイルを ES モジュールとして読むときの、node の注意書き（動きには関係ない）を出さない
process.removeAllListeners("warning");
const { listAccounts, renameUser } = await import("../lib/userAdmin.js");

const client = await connectDb();
try {
  const accounts = await listAccounts(client);
  console.log("\nID / 登録した日 / 単語帳 / カード");
  for (const a of accounts) console.log(`  ${a.username} / ${a.created} / ${a.decks}冊 / ${a.cards}枚`);
  const from = await ask("\n変えるアカウントの、今の ID（やめるときは Enter）: ");
  if (!from) {
    console.log("何も変えませんでした。");
    process.exit(0);
  }
  const to = await ask("新しい ID: ");
  const r = await renameUser(client, from, to);
  if (r.error) {
    console.log(`できませんでした: ${r.error}`);
    process.exit(1);
  }
  console.log(`ID を変えました: ${r.from} → ${r.to}（パスワードはそのまま。次から ${r.to} でログインします）`);
} finally {
  await client.end();
}
