// 公開した DB（Neon など）に、テスト用のアカウントを作る道具。メールは送らない（最初から確認済みにする）。
// 登録済みのアドレスなら、パスワードを作り直すかを聞く。使い方は docs/deploy.md。
//
//   docker compose exec app node scripts/create-user.mjs
//
// 接続の文字列とパスワードは、打っても画面に出さない。コマンドの履歴にも残らない。
// 手元の DB（DATABASE_URL）は使わない。毎回、つなぐ先の文字列を聞く。
import { createInterface } from "node:readline";
import pg from "pg";

// lib/ のファイルを ES モジュールとして読むときの、node の注意書き（動きには関係ない）を出さない
process.removeAllListeners("warning");
const { createVerifiedUser, setUserPassword } = await import("../lib/userAdmin.js");

// 1行を聞く。hidden なら、打った文字を画面に出さない
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        // 質問の文だけは出す。打った文字は出さない
        if (s.startsWith(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function askPassword() {
  for (;;) {
    const p1 = await ask("パスワード（8文字以上。画面には出ません）: ", { hidden: true });
    const p2 = await ask("もう一度（確認）: ", { hidden: true });
    if (p1 === p2) return p1;
    console.log("2つが一致しません。もう一度入れてください。");
  }
}

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
  const email = await ask("作るアカウントのメールアドレス: ");
  const password = await askPassword();
  let r = await createVerifiedUser(client, email, password);
  if (r.exists) {
    const yes = await ask(`${r.email} はもうあります。パスワードを、いま入れたものに作り直しますか？（y / n）: `);
    if (yes.toLowerCase() !== "y") {
      console.log("何も変えませんでした。");
      process.exit(0);
    }
    r = await setUserPassword(client, email, password);
    if (!r.error) console.log(`パスワードを作り直しました: ${r.email}（この人のログインはすべて切りました）`);
  } else if (!r.error) {
    console.log(`アカウントを作りました: ${r.email}`);
  }
  if (r.error) {
    console.log(`できませんでした: ${r.error}`);
    process.exit(1);
  }
  console.log("ログインできるようにするには、Vercel の ALLOWED_EMAILS にこのアドレスを足して、Redeploy してください。");
} finally {
  await client.end();
}
