import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import lemmatizer from "wink-lemmatizer";

// ---- 頻出度ランキング ----------------------------------------------------
// data/en-words.txt は「単語の形」の頻出順（running, ran などが別々に並ぶ）。
// 語彙数は「原形の数」で数えたいので、原形ごとの順位を作り直す。

let cache = null;

function load() {
  if (cache) return cache;
  const forms = readFileSync(path.join(process.cwd(), "data", "en-words.txt"), "utf8")
    .split("\n")
    .filter(Boolean);
  const formIndex = new Map(forms.map((f, i) => [f, i]));

  const lemmaRank = new Map(); // 原形 → 順位（1始まり）
  for (const form of forms) {
    for (const lemma of baseForms(form, formIndex)) {
      if (!lemmaRank.has(lemma)) lemmaRank.set(lemma, lemmaRank.size + 1);
    }
  }
  cache = { formIndex, lemmaRank };
  return cache;
}

// 単語の原形として考えられるものを返す。
// - 実在しない原形（変換ミス）は除く
// - 自分より頻出の原形があれば、それだけを返す（abandons → abandon、ran → run）
// - なければ自分自身を原形とする（dive を diva の複数形とみなす誤変換などを防ぐ）
function baseForms(word, formIndex) {
  const own = formIndex.get(word);
  const others = [...rawLemmas(word)].filter((l) => {
    if (l === word || !formIndex.has(l)) return false;
    return own === undefined || formIndex.get(l) < own;
  });
  return others.length > 0 ? others : [word];
}

function rawLemmas(word) {
  const set = new Set([word]);
  if (/^[a-z]+$/.test(word)) {
    set.add(lemmatizer.verb(word));
    set.add(lemmatizer.noun(word));
    set.add(lemmatizer.adjective(word));
  }
  return set;
}

// 短縮形（don't, it's, I'll など）を元の単語に分ける
const CONTRACTION_BASES = { "can't": "can", "won't": "will", "shan't": "shall", "ain't": "be" };
function contractionBase(word) {
  if (CONTRACTION_BASES[word]) return CONTRACTION_BASES[word];
  const m = word.match(/^([a-z]+)(?:n't|'s|'re|'ve|'ll|'d|'m)$/);
  return m ? m[1] : null;
}

// 単語（小文字）の原形の候補を、頻出順位とともに返す
export function lemmaCandidates(word) {
  const { formIndex, lemmaRank } = load();
  const base = word.includes("'") ? contractionBase(word) : null;
  const result = baseForms(base ?? word, formIndex).map((lemma) => ({
    lemma,
    rank: lemmaRank.get(lemma) ?? null,
  }));
  // 順位の高い（数字の小さい）ものを先に
  result.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return result;
}

// イディオムの照合用: 頻度に関係なく、考えられる原形をすべて返す（bit → bite も含める）
export function allBaseForms(word) {
  const base = word.includes("'") ? contractionBase(word) : null;
  return [...rawLemmas(base ?? word)];
}

export function totalLemmas() {
  return load().lemmaRank.size;
}
