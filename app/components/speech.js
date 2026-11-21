"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// ブラウザの読み上げ機能（Web Speech API）で英文を読み上げる。
// 声と速さは、端末ごとに使える声が違うので、ブラウザ（localStorage）に保存する

const KEY = "flashcard-speech";
// autoReadFront: 記憶テストで、カードが出たら（答えを考える表の面で）読み上げる。初めは する
// （前の設定 autoRead は使わない。初めは しない だったので、この設定で初めから読み上げるように名前を変えた）
const DEFAULTS = { voice: "", rate: 1, autoReadFront: true };

export function isSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

// ---- 設定 ----------------------------------------------------------------
let listeners = new Set();
let cached = null;

function readSettings() {
  if (cached) return cached;
  try {
    cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

// 今の設定（このブラウザに保存したもの）。画面の最初の表示では useSpeechSettings が初めの値を返すので、
// 読み上げるかどうかを決めるときは、こちらで本当の値を見る
export function getSpeechSettings() {
  return readSettings();
}

export function saveSpeechSettings(patch) {
  cached = { ...readSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // 保存できない環境（プライベートモードなど）では、この画面の間だけ使う
  }
  listeners.forEach((l) => l());
}

export function useSpeechSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readSettings,
    () => DEFAULTS
  );
}

// ---- 声の一覧 -------------------------------------------------------------
// macOS の効果音のような声（学習に向かない）は除く
const NOVELTY = new Set([
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester", "Organ",
  "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Fred", "Junior", "Kathy", "Ralph",
]);
const isUsableEnglish = (v) => v.lang?.toLowerCase().startsWith("en") && !NOVELTY.has(v.name);
const rank = (v) => {
  const i = PREFERRED.findIndex((p) => v.name.includes(p));
  return i < 0 ? PREFERRED.length : i;
};

// 英語の声だけ（自然な声を先に）。読み込みが遅れる環境があるので voiceschanged を待つ
export function useEnglishVoices() {
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (!isSpeechSupported()) return;
    const load = () => {
      // 同じ名前の声が複数返ることがある（端末内の声とオンラインの声など）。
      // 設定は名前で保存するので、名前ごとに1つ（端末内の声を優先）にまとめる
      const byName = new Map();
      for (const v of window.speechSynthesis.getVoices().filter(isUsableEnglish)) {
        const prev = byName.get(v.name);
        if (!prev || (!prev.localService && v.localService)) byName.set(v.name, v);
      }
      setVoices([...byName.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)));
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

// 保存した声、なければ自然な声を優先して選ぶ
const PREFERRED = ["Samantha", "Alex", "Ava", "Google US English", "Microsoft Aria", "Daniel", "Karen"];
function pickVoice(name) {
  const voices = window.speechSynthesis.getVoices().filter(isUsableEnglish);
  if (name) {
    const saved = voices.find((v) => v.name === name && v.localService) ?? voices.find((v) => v.name === name);
    if (saved) return saved;
  }
  for (const p of PREFERRED) {
    const v = voices.find((x) => x.name.includes(p));
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-US") ?? voices[0] ?? null;
}

// ---- 読み上げ -------------------------------------------------------------
// Chrome では、読み上げ中に止めた（cancel）直後に読み上げる（speak）と、その読み上げが消えることがある。
// 止めたあとは少し待ってから読み上げる。待っている間に別の読み上げ・停止が来たら、待っていた方はやめる
const AFTER_CANCEL_MS = 80;
let waiting = null;
let stoppedAt = -Infinity; // 読み上げ中のものを最後に止めた時刻

// 前の読み上げを止める。止めたあと少し待つ必要があるか
// （読み上げ中だった・待ちがあった・少し前に読み上げ中のものを止めたばかり）を返す
function cancelAll() {
  const synth = window.speechSynthesis;
  const now = Date.now();
  const busy = synth.speaking || synth.pending || waiting !== null;
  if (busy) stoppedAt = now;
  clearTimeout(waiting);
  waiting = null;
  synth.cancel();
  return busy || now - stoppedAt < AFTER_CANCEL_MS;
}

function startAfterCancel(busy, start) {
  if (!busy) return start();
  waiting = setTimeout(() => {
    waiting = null;
    start();
  }, AFTER_CANCEL_MS);
}

// onEnd: 読み終わったとき（止めたときは呼ばないことがあるので、呼ぶ側で確かめる）
export function speak(text, { rate, onEnd } = {}) {
  if (!isSpeechSupported() || !text) return;
  const settings = readSettings();
  const synth = window.speechSynthesis;
  const busy = cancelAll(); // 前の読み上げは止める
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(settings.voice);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = rate ?? settings.rate;
  if (onEnd) u.onend = onEnd;
  startAfterCancel(busy, () => {
    synth.resume?.(); // 一時停止のまま止まっていることがある（Chrome）
    synth.speak(u);
  });
}

// 複数の文を順に読み上げる（物語の全文など）。onSentence(i) は i 番目を読み始めたとき、onDone は最後まで読んだとき
export function speakSequence(texts, { onSentence, onDone } = {}) {
  if (!isSpeechSupported() || texts.length === 0) return;
  const settings = readSettings();
  const synth = window.speechSynthesis;
  const busy = cancelAll();
  const voice = pickVoice(settings.voice);
  startAfterCancel(busy, () => {
    synth.resume?.();
    texts.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-US";
      u.rate = settings.rate;
      u.onstart = () => onSentence?.(i);
      if (i === texts.length - 1) u.onend = () => onDone?.();
      synth.speak(u);
    });
  });
}

// 読み上げを止める（待っている読み上げもやめる）
export function stopSpeaking() {
  if (isSpeechSupported()) cancelAll();
}
