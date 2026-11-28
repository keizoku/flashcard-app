// 公開した DB（Neon など）に、アカウントを作る道具（画面から登録しなくても、すぐ使えるアカウントを用意するとき）。
// 登録済みの ID なら、パスワードを作り直すかを聞く。使い方は docs/deploy.md。
//
//   docker compose exec app node scripts/create-user.mjs
//
// 接続の文字列とパスワードは、打っても画面に出さない。コマンドの履歴にも残らない。
// 手元の DB（DATABASE_URL）は使わない。毎回、つなぐ先の文字列を聞く。
import { ask, connectDb } from "./prompt.mjs";

// lib/ のファイルを ES モジュールとして読むときの、node の注意書き（動きには関係ない）を出さない
process.removeAllListeners("warning");
const { createAccountByAdmin, setUserPassword } = await import("../lib/userAdmin.js");

async function askPassword() {
  for (;;) {
    const p1 = await ask("パスワード（8文字以上。画面には出ません）: ", { hidden: true });
    const p2 = await ask("もう一度（確認）: ", { hidden: true });
    if (p1 === p2) return p1;
    console.log("2つが一致しません。もう一度入れてください。");
  }
}

const client = await connectDb();
try {
  const username = await ask("作るアカウントの ID: ");
  const password = await askPassword();
  let r = await createAccountByAdmin(client, username, password);
  if (r.exists) {
    const yes = await ask(`${r.username} はもうあります。パスワードを、いま入れたものに作り直しますか？（y / n）: `);
    if (yes.toLowerCase() !== "y") {
      console.log("何も変えませんでした。");
      process.exit(0);
    }
    r = await setUserPassword(client, username, password);
    if (!r.error) console.log(`パスワードを作り直しました: ${r.username}（この人のログインはすべて切りました）`);
  } else if (!r.error) {
    console.log(`アカウントを作りました: ${r.username}`);
    console.log(`復旧コード: ${r.recoveryCode}（パスワードを忘れたときに使う。使う人に渡してください。もう一度は出ません）`);
  }
  if (r.error) {
    console.log(`できませんでした: ${r.error}`);
    process.exit(1);
  }
} finally {
  await client.end();
}
