// 管理用の道具（scripts/*.mjs）で、ターミナルに質問して答えを受け取る
import { createInterface } from "node:readline";

// 1行を聞く。hidden なら、打った文字を画面に出さない
export function ask(question, { hidden = false } = {}) {
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

// つなぐ DB の接続の文字列を聞いて、つなぐ（文字列は画面に出さない）。つなげなければ終わる。
// 手元の Docker の DB なら postgres://flashcard:flashcard@db:5432/flashcard を入れる
export async function connectDb() {
  const { default: pg } = await import("pg");
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
  return client;
}
