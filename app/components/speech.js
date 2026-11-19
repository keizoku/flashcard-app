"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// ブラウザの読み上げ機能（Web Speech API）で英文を読み上げる。
// 声と速さは、端末ごとに使える声が違うので、ブラウザ（localStorage）に保存する

const KEY = "flashcard-speech";
const DEFAULTS = { voice: "", rate: 1, autoRead: false };

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
export function speak(text, { rate } = {}) {
  if (!isSpeechSupported() || !text) return;
  const settings = readSettings();
  const synth = window.speechSynthesis;
  synth.cancel(); // 前の読み上げは止める
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(settings.voice);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = rate ?? settings.rate;
  synth.speak(u);
}

// 複数の文を順に読み上げる（物語の全文など）。onSentence(i) は i 番目を読み始めたとき、onDone は最後まで読んだとき
export function speakSequence(texts, { onSentence, onDone } = {}) {
  if (!isSpeechSupported() || texts.length === 0) return;
  const settings = readSettings();
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(settings.voice);
  texts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = settings.rate;
    u.onstart = () => onSentence?.(i);
    if (i === texts.length - 1) u.onend = () => onDone?.();
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
