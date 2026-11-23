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
