import "server-only";
import { findIdioms } from "./idioms.js";
import { allBaseForms, lemmaCandidates } from "./vocab.js";

export const MAX_TRANSCRIPT_LENGTH = 200_000;
const MIN_WORDS = 4;
// 1文の最大語数。これより長い文は、カードに向かないので候補から外す（途中で切ることはしない）
const MAX_WORDS = 40;
// 句読点のない字幕を、接続詞などで仮に区切るときの最大語数
const MAX_CHUNK_WORDS = 30;
// 句読点がほとんどない字幕（自動生成など）とみなす、1文あたりの平均語数
const NO_PUNCTUATION_THRESHOLD = 40;

// ---- 1. 貼り付けられたテキストを「区間」に分ける -------------------------
// YouTube の「文字起こしを表示」からコピーしたテキストは、次のどちらかの形になる。
//   (a) 時刻と文が別の行:   0:03 / hello everyone
//   (b) 1行にくっついている: 0:066 secondsnew youtube account
//       （時刻 "0:06" ＋ 読み上げ用の "6 seconds" ＋ 本文）
// "[0:06]" のように角かっこで囲まれた形（チャット AI で整えた字幕）も受け付ける
const TIME_PREFIX = /^\[?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]?/;
// 時刻の読み上げ用テキストだけの行（(a) の形で混ざることがある）
const DURATION_LINE = /^(?:\d+\s*(?:hours?|minutes?|seconds?|時間|分|秒),?\s*)+$/i;
// 日本語表示の YouTube からコピーしたときの読み上げ用テキスト（"6 秒" "1 分 11 秒" "1 時間 2 分"）
const JA_DURATION_PREFIX = /^\s*(?:\d+\s*(?:時間|分|秒)\s*)+/;
// チャプター名（"Chapter 1: Create a new youtube account"）
const CHAPTER_LINE = /^(?:chapter|チャプター)\s*\d+\s*[:：]/i;

// 秒数から、YouTube が付ける読み上げ用テキストを作る（64 → "1 minute, 4 seconds"）
function spokenDuration(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [];
  if (h) parts.push(unit(h, "hour"));
  if (m) parts.push(unit(m, "minute"));
  if (sec || parts.length === 0) parts.push(unit(sec, "second"));
  return parts.join(", ");
}

// 文字起こしの後ろにくっついてくる YouTube の画面の文字（"Sync to video time" 以降）
// （日本語表示では "動画の時間と同期" 以降）
const PAGE_UI_TAIL = /\s*(?:Sync to video time\b|動画の時間と同期)[\s\S]*$/;

export function parseSegments(text) {
  const segments = [];
  let currentStart = null;
  for (const rawLine of text.replace(PAGE_UI_TAIL, "").split(/\r?\n/)) {
    let line = cleanLine(rawLine);
    if (!line || DURATION_LINE.test(line) || CHAPTER_LINE.test(line)) continue;

    const m = line.match(TIME_PREFIX);
    if (m) {
      const [whole, h, mm, ss] = m;
      currentStart = Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
      line = line.slice(whole.length);
      // 読み上げ用テキストがくっついていれば取り除く
      const spoken = spokenDuration(currentStart);
      if (line.toLowerCase().startsWith(spoken)) line = line.slice(spoken.length);
      else line = line.replace(JA_DURATION_PREFIX, "");
      line = line.trim();
      if (!line) continue;
    }
    segments.push({ start: currentStart, text: line });
  }
  return segments;
}

function cleanLine(line) {
  return line
    // [Music] [Applause] など（[0:06] のような時刻は残す）
    .replace(/\[(?!\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*\])[^\]]*\]/g, " ")
    .replace(/&gt;&gt;|>>/g, " ") // 話者の切り替え記号
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const TOKEN = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
const countWords = (text) => (text.match(TOKEN) ?? []).length;

// ---- 2. 区間をつなげて「文」に分ける ------------------------------------
function joinSegments(segments) {
  // 全文をつなげつつ、各区間が何文字目から始まるかを覚えておく
  let full = "";
  const offsets = [];
  for (const seg of segments) {
    if (full) full += " ";
    offsets.push({ pos: full.length, start: seg.start });
    full += seg.text;
  }
  const startAt = (pos) => {
    let start = null;
    for (const o of offsets) {
      if (o.pos > pos) break;
      start = o.start;
    }
    return start;
  };
  return { full, startAt };
}

const SENTENCE = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;

// 句読点がほとんどない字幕（自動生成など）かどうか
export function lacksPunctuation(segments) {
  const { full } = joinSegments(segments);
  const sentences = matchPieces(full, SENTENCE, 0);
  const words = sentences.reduce((n, s) => n + countWords(s.text), 0);
  return sentences.length === 0 || words / sentences.length > NO_PUNCTUATION_THRESHOLD;
}

// mode:
//   "punctuated" … 字幕に句読点があるので、そのまま文に分けた
//   "heuristic"  … 句読点がないので、接続詞などの前で仮に区切った（文として完結しないことがある）
function splitUnits(segments) {
  const { full, startAt } = joinSegments(segments);
  if (lacksPunctuation(segments)) {
    const units = splitAtMarkers(full).map((p) => ({ text: p.text, start: startAt(p.pos) }));
    return { units, mode: "heuristic" };
  }
  const units = matchPieces(full, SENTENCE, 0).map((p) => ({ text: p.text, start: startAt(p.pos) }));
  return { units, mode: "punctuated" };
}

function matchPieces(text, re, base) {
  const pieces = [];
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    pieces.push({ text: trimmed, pos: base + m.index + (raw.length - raw.trimStart().length) });
  }
  return pieces;
}

// 句読点のないテキストを、接続詞などの直前で区切る。
// 1かたまりが MIN_CHUNK 語以上になってから区切り、長くなりすぎたら次の区切り候補で必ず切る
const MARKERS = new Set([
  "so", "and", "but", "or", "now", "because", "which", "then", "if", "when", "while",
  "where", "although", "though", "okay", "anyway", "also", "like",
]);
const MIN_CHUNK = 6;
const SOFT_MAX_CHUNK = 18;

function splitAtMarkers(text) {
  const tokens = [...text.matchAll(/\S+/g)];
  const pieces = [];
  let startIdx = 0;
  const flush = (endIdx) => {
    if (endIdx <= startIdx) return;
    const from = tokens[startIdx].index;
    const last = tokens[endIdx - 1];
    pieces.push({ text: text.slice(from, last.index + last[0].length), pos: from });
    startIdx = endIdx;
  };
  for (let i = 0; i < tokens.length; i++) {
    const len = i - startIdx;
    const word = tokens[i][0].toLowerCase().replace(/[^a-z']/g, "");
    if (MARKERS.has(word) && len >= MIN_CHUNK) flush(i);
    else if (i - startIdx >= MAX_CHUNK_WORDS) flush(i); // 区切り候補がないまま長くなったら強制的に切る
    else if (len >= SOFT_MAX_CHUNK && /^(?:i|you|we|they|he|she|it|there|this|that)$/.test(word)) flush(i);
  }
  flush(tokens.length);
  return pieces;
}

// ---- 3. 文ごとに「知らない単語・イディオム」を集める ---------------------
// known: { vocabSize, knownWords: Set<原形またはイディオムのキー> }
function unknownItems(text, known, lemmaCache) {
  const tokens = [];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    const word = m[0];
    const lower = word.toLowerCase();
    if (!lemmaCache.has(lower)) {
      const candidates = lemmaCandidates(lower);
      const forms = new Set([lower, ...candidates.map((c) => c.lemma), ...allBaseForms(lower)]);
      lemmaCache.set(lower, { candidates, forms });
    }
    const { candidates, forms } = lemmaCache.get(lower);
    tokens.push({ word, index: m.index, candidates, forms });
  }

  const items = [];
  const inIdiom = new Set();

  for (const match of findIdioms(tokens)) {
    for (const i of match.matched) inIdiom.add(i);
    const { idiom } = match;
    if (known.knownWords.has(idiom.key) || idiom.level <= known.vocabSize) continue;
    const from = tokens[match.first].index;
    const to = tokens[match.last].index + tokens[match.last].word.length;
    items.push({
      kind: "idiom",
      form: text.slice(from, to),
      lemma: idiom.key,
      level: idiom.level,
      meaning: idiom.meaning,
    });
  }

  tokens.forEach((token, i) => {
    if (inIdiom.has(i)) return;
    const item = classifyWord(token, i, known);
    if (item) items.push(item);
  });

  return { items, wordCount: tokens.length };
}

// 知らない単語なら情報を返す。知っている（とみなす）なら null
function classifyWord(token, index, known) {
  const { word, candidates } = token;
  if (word.length <= 1) return null;

  const isKnown = candidates.some(
    (c) => known.knownWords.has(c.lemma) || (c.rank !== null && c.rank <= known.vocabSize)
  );
  if (isKnown) return null;

  // 文の途中で大文字で始まる語や、全部大文字の語は、人名・地名・略語とみなして数えない。
  // 文頭の語でも、字幕のほかの所で文の途中に大文字で出てくる語（Elon など）は同じ扱いにする
  if ((/^[A-Z]/.test(word) && index > 0) || word === word.toUpperCase()) return null;
  if (/^[A-Z]/.test(word) && known.properNouns?.has(word.toLowerCase())) return null;

  const best = candidates.find((c) => c.rank !== null) ?? candidates[0];
  return { kind: "word", form: word, lemma: best.lemma, rank: best.rank };
}

// AI が付けた語句の意味から、対象の語句に当たるものを探す
const wordsOf = (t) => (String(t).toLowerCase().match(/[a-z]+(?:'[a-z]+)*/g) ?? []).filter((w) => w !== "sth" && w !== "sb");
export const sameWord = (a, b) => a === b || allBaseForms(a).some((x) => allBaseForms(b).includes(x));

export function findGloss(glosses, item) {
  if (!Array.isArray(glosses) || glosses.length === 0) return null;
  const target = wordsOf(item.form);
  const key = wordsOf(item.lemma);
  return (
    glosses.find((g) => {
      const p = wordsOf(g.phrase);
      return p.length === target.length && p.every((w, i) => sameWord(w, target[i]));
    }) ??
    glosses.find((g) => {
      const p = wordsOf(g.phrase);
      return p.length === key.length && p.every((w, i) => sameWord(w, key[i]));
    }) ??
    // 対象が1語で、AI が熟語としてまとめて説明している場合（puff → puff itself up）
    (key.length === 1 ? glosses.find((g) => wordsOf(g.phrase).some((w) => sameWord(w, key[0]))) : null) ??
    null
  );
}

// 字幕全体で、文の途中に大文字で始まって出てくる語（固有名詞らしい語）を集める
function collectProperNouns(units) {
  const set = new Set();
  for (const unit of units) {
    const tokens = unit.text.match(TOKEN) ?? [];
    tokens.forEach((t, i) => {
      if (i > 0 && /^[A-Z][a-z]/.test(t) && t !== "I") set.add(t.toLowerCase());
    });
  }
  return set;
}

// ---- 4. まとめ ----------------------------------------------------------
// 語の扱い:
//   known.knownWords … 知っている語（「知ってる」を押した語 ＋ 学習で「覚えた」語）。数えない
//   known.studyWords … カードにして学習中の語。理解度では「まだわからない語」として数えるが、
//                       その語を含む文は、新しいカードの候補にしない（覚えるまで保留）
//
// 戻り値:
//   stages      … 段階ごとの候補 { 1: [...], 2: [...], 3: [...] }。
//                 段階 n = 新しく覚える語がちょうど n 個で、学習中の語を含まない文
//   comprehension … 動画全体の理解度（短い文・長い文も含む、すべての文が対象）
//   stats       … 候補の対象になる長さの文の内訳（i+0, i+1, i+2, i+3以上）
export const MAX_STAGE = 3;

export function analyzeTranscript(text, known, options = {}) {
  const { units, mode } = options.sentences
    ? { units: options.sentences, mode: "ai" }
    : splitUnits(parseSegments(text));
  const lemmaCache = new Map();
  const ctx = {
    vocabSize: known.vocabSize,
    knownWords: known.knownWords ?? new Set(),
    properNouns: collectProperNouns(units),
  };
  const studyWords = known.studyWords ?? new Set();

  const seen = new Set();
  const stages = { 1: [], 2: [], 3: [] };
  const comprehension = { total: 0, understood: 0, waiting: 0, byUnknown: [0, 0, 0, 0] };
  const stats = { total: 0, tooShort: 0, tooLong: 0, byUnknown: [0, 0, 0, 0] };

  for (const unit of units) {
    const key = unit.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const { items } = unknownItems(unit.text, ctx, lemmaCache);
    const studying = items.filter((it) => studyWords.has(it.lemma));
    const fresh = items.filter((it) => !studyWords.has(it.lemma));

    // 理解度（すべての文）
    comprehension.total += 1;
    comprehension.byUnknown[Math.min(items.length, 3)] += 1;
    if (items.length === 0) comprehension.understood += 1;
    else if (fresh.length === 0) comprehension.waiting += 1; // 学習中の語を覚えれば、わかるようになる文

    // カードの候補（長さが合う文だけ）
    const n = countWords(unit.text);
    stats.total += 1;
    if (n < MIN_WORDS) {
      stats.tooShort += 1;
      continue;
    }
    if (n > MAX_WORDS) {
      stats.tooLong += 1;
      continue;
    }
    stats.byUnknown[Math.min(items.length, 3)] += 1;
    if (studying.length > 0 || fresh.length === 0 || fresh.length > MAX_STAGE) continue;

    stages[fresh.length].push({
      sentence: unit.text,
      start: unit.start,
      translation: unit.translation || "",
      // AI が意味の通る文に直したときの、元の字幕の文
      original: unit.original || "",
      // AI で整えた文なら、和訳と語句の意味が付いている
      items: fresh.map((item) => {
        const gloss = findGloss(unit.glosses, item);
        return {
          ...item,
          meaning: gloss?.meaning || item.meaning || "",
          // 和訳の中で対象の語句に当たる部分（和訳に実際に含まれるときだけ使う）
          translationForm: gloss?.ja && unit.translation?.includes(gloss.ja) ? gloss.ja : "",
        };
      }),
    });
  }

  comprehension.percent =
    comprehension.total > 0 ? Math.round((comprehension.understood / comprehension.total) * 100) : 0;
  return { stages, comprehension, stats, mode };
}
