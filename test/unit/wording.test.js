import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

// 画面の言葉。カードのまとまりは、画面では「単語帳」と呼ぶ（Anki の「デッキ」はなじみがないため）。
// コードと設計書の中では今までどおり deck / デッキ（テーブル名 decks など）。docs/README.md の「言葉」
const root = path.join(__dirname, "..", "..");

function jsFiles(dir) {
  const out = [];
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// コメント（// … ・ /* … ・ * … ・ {/* … ・ SQL の -- …）を除いた行
function codeLines(file) {
  return readFileSync(path.join(root, file), "utf8")
    .split("\n")
    .map((line, i) => ({ line: line.replace(/\s\/\/\s.*$/, ""), no: i + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\/\*|\*|\{\/\*|--)/.test(line));
}

test("NM-01 画面に出る言葉に「デッキ」を使わない（「単語帳」と呼ぶ）", () => {
  const found = [];
  for (const file of [...jsFiles("app"), ...jsFiles("lib")]) {
    for (const { line, no } of codeLines(file)) {
      if (line.includes("デッキ")) found.push(`${file}:${no}: ${line.trim()}`);
    }
  }
  expect(found).toEqual([]);
});
