import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

// data/idioms.tsv を読み込んで、照合しやすい形にする
const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their", "one's"]);
const MAX_WILDCARD = 3;

let cache = null;

function load() {
  if (cache) return cache;
  const lines = readFileSync(path.join(process.cwd(), "data", "idioms.tsv"), "utf8").split("\n");
  const byFirstWord = new Map();
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [key, level, meaning] = line.split("\t");
    const parts = key.split(" ").map((w) =>
      w === "sth" || w === "sb" ? { type: "wild" } : w === "one's" ? { type: "poss" } : { type: "word", word: w }
    );
    // 先頭と末尾の sth/sb は照合に使わない（take care of sb など）
    while (parts.length && parts[0].type === "wild") parts.shift();
    while (parts.length && parts.at(-1).type === "wild") parts.pop();
    if (parts.length < 2 || parts[0].type !== "word") continue;

    const idiom = { key, level: Number(level), meaning, parts };
    const first = parts[0].word;
    if (!byFirstWord.has(first)) byFirstWord.set(first, []);
    byFirstWord.get(first).push(idiom);
  }
  cache = { byFirstWord };
  return cache;
}

// tokens: [{ forms: Set<小文字の形と原形> }]
// 戻り値: 重ならないように選んだ一致 [{ idiom, first, last, matched: Set<トークン番号> }]
export function findIdioms(tokens) {
  const { byFirstWord } = load();
  const found = [];
  tokens.forEach((token, i) => {
    for (const form of token.forms) {
      for (const idiom of byFirstWord.get(form) ?? []) {
        const matched = matchFrom(idiom.parts, 0, tokens, i, []);
        if (matched) found.push({ idiom, first: i, last: matched.at(-1), matched: new Set(matched) });
      }
    }
  });

  // 長い表現を優先して、重ならないものを選ぶ
  found.sort((a, b) => b.matched.size - a.matched.size || a.first - b.first);
  const used = new Set();
  const chosen = [];
  for (const m of found) {
    let overlap = false;
    for (let k = m.first; k <= m.last; k++) if (used.has(k)) overlap = true;
    if (overlap) continue;
    for (let k = m.first; k <= m.last; k++) used.add(k);
    chosen.push(m);
  }
  return chosen;
}

function matchFrom(parts, p, tokens, t, acc) {
  if (p === parts.length) return acc;
  const part = parts[p];
  if (part.type === "wild") {
    for (let skip = 0; skip <= MAX_WILDCARD; skip++) {
      const r = matchFrom(parts, p + 1, tokens, t + skip, acc);
      if (r) return r;
    }
    return null;
  }
  const token = tokens[t];
  if (!token) return null;
  const ok = part.type === "poss" ? [...token.forms].some((f) => POSSESSIVES.has(f)) : token.forms.has(part.word);
  return ok ? matchFrom(parts, p + 1, tokens, t + 1, [...acc, t]) : null;
}
