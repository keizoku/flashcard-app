// 復旧コード。パスワードを忘れたときに、パスワードを作り直すための合言葉（メールの代わり）。
// 登録したときなどに一度だけ画面に出し、DB にはハッシュだけを保存する。1回使ったら新しいコードに変わる。
// Next.js の外（scripts/）からも使うので、server-only にしない
import { createHash, randomInt } from "node:crypto";

// 読み間違えやすい文字（0/O、1/I/L、U）は使わない
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const GROUPS = 4;
const GROUP_LENGTH = 4;

// 例: K7QM-3XWP-9TZD-H2RB（約78ビット。当てずっぽうでは当たらない）
export function newRecoveryCode() {
  const groups = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = "";
    for (let i = 0; i < GROUP_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join("-");
}

// 入れ方のゆれ（小文字・空白・「-」の有無）をなくしてからハッシュにする
export function normalizeRecoveryCode(raw) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(raw) {
  return createHash("sha256").update(`flashcard-recovery:${normalizeRecoveryCode(raw)}`).digest("hex");
}
