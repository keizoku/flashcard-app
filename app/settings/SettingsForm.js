"use client";

import { useActionState, useState } from "react";
import { LEVELS, MAX_VOCAB_SIZE, MIN_VOCAB_SIZE } from "@/lib/levels";
import { saveSettings } from "./actions";

const GROUPS = [...new Set(LEVELS.map((l) => l.group))];

export default function SettingsForm({ levelKey, vocabSize }) {
  const [state, formAction, pending] = useActionState(saveSettings, { error: null, saved: false });
  const [selected, setSelected] = useState(levelKey);
  const level = LEVELS.find((l) => l.key === selected);
  const isCustom = selected === "custom";

  return (
    <form action={formAction} className="add-form">
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
    </form>
  );
}
