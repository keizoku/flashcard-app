"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { LEVELS, MAX_VOCAB_SIZE, MIN_VOCAB_SIZE } from "@/lib/levels";
import { saveSettings } from "./actions";

const GROUPS = [...new Set(LEVELS.map((l) => l.group))];

// nextHref: はじめの4ステップの途中なら "/"。保存したあとに「次へ」のボタンを出す
export default function SettingsForm({ levelKey, vocabSize, nextHref = null }) {
  const [state, formAction, pending] = useActionState(saveSettings, { error: null, saved: false });
  const [selected, setSelected] = useState(levelKey);
  const level = LEVELS.find((l) => l.key === selected);
  const isCustom = selected === "custom";

  return (
    // action={formAction} にすると、送ったあとに React がフォームを元に戻し、
    // 選んだレベル・入れた数が、画面を開いたときの値に見えてしまう。onSubmit で送って、元に戻させない
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="add-form"
    >
      <label>
        あなたのレベル
        <select name="level" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {LEVELS.filter((l) => l.group === group).map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                  {l.vocabSize ? `（約 ${l.vocabSize.toLocaleString()} 語）` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {isCustom && (
        <label>
          知っている単語の数
          <input
            type="number"
            name="vocabSize"
            min={MIN_VOCAB_SIZE}
            max={MAX_VOCAB_SIZE}
            step={100}
            defaultValue={vocabSize}
            required
          />
        </label>
      )}
      <p className="note small">
        よく使われる順に、上から{isCustom ? "指定した数" : ` ${level?.vocabSize?.toLocaleString()} 語`}
        の単語を「知っている」とみなして、知らない単語がちょうど1つの文を探します。
      </p>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.saved && !pending && <p className="success" role="status">保存しました</p>}
      <button type="submit" disabled={pending}>
        {pending ? "保存中…" : "保存"}
      </button>
      {state.saved && !pending && nextHref && (
        <p className="next-step">
          <Link href={nextHref} className="button-link study-link">
            次へ：動画を選んで、単語帳を作る →
          </Link>
        </p>
      )}
    </form>
  );
}
