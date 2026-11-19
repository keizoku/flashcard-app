// TOEIC・英検のレベルと、知っている単語数（語彙数）の目安。
// 数字はよく言われる値をもとにした大まかなもので、設定画面で自由に変えられる。
export const LEVELS = [
  { key: "eiken-3", group: "英検", label: "英検3級", vocabSize: 2000 },
  { key: "eiken-p2", group: "英検", label: "英検準2級", vocabSize: 3500 },
  { key: "eiken-2", group: "英検", label: "英検2級", vocabSize: 5000 },
  { key: "eiken-p1", group: "英検", label: "英検準1級", vocabSize: 8000 },
  { key: "eiken-1", group: "英検", label: "英検1級", vocabSize: 12000 },
  { key: "toeic-400", group: "TOEIC", label: "TOEIC 〜400点", vocabSize: 2000 },
  { key: "toeic-550", group: "TOEIC", label: "TOEIC 400〜550点", vocabSize: 3500 },
  { key: "toeic-750", group: "TOEIC", label: "TOEIC 550〜750点", vocabSize: 5000 },
  { key: "toeic-900", group: "TOEIC", label: "TOEIC 750〜900点", vocabSize: 8000 },
  { key: "toeic-990", group: "TOEIC", label: "TOEIC 900点〜", vocabSize: 12000 },
  { key: "custom", group: "その他", label: "語彙数を直接指定", vocabSize: null },
];

export const MIN_VOCAB_SIZE = 100;
export const MAX_VOCAB_SIZE = 30000;

export function findLevel(key) {
  return LEVELS.find((l) => l.key === key) ?? null;
}
