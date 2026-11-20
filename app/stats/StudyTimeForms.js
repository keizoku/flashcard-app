"use client";

import { useActionState, useState, useTransition } from "react";
import { STUDY_KINDS } from "@/lib/studyClock";
import { addStudyTime, removeStudyTime } from "./actions";

// 勉強時間を手で足す（スマホの YouTube アプリで聞いた時間など、アプリの外で勉強した分）
export function ManualTimeForm({ maxMinutes }) {
  const [state, action, pending] = useActionState(addStudyTime, { error: null, saved: false });
  return (
    <form action={action} className="manual-time-form">
      <label>
        種類
        <select name="kind" defaultValue="listening">
          {Object.entries(STUDY_KINDS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        時間（分）
        <input type="number" name="minutes" min={1} max={maxMinutes} step={1} required inputMode="numeric" />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "足しています…" : "今日に足す"}
      </button>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && !pending && (
        <p className="success" role="status">
          足しました
        </p>
      )}
    </form>
  );
}

// 手で足した記録（新しい順）。まちがえたときに取り消せる
export function ManualTimeList({ entries }) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  if (entries.length === 0) return null;
  return (
    <>
      <ul className="manual-time-list">
        {entries.map((e) => (
          <li key={e.id}>
            <span>
              {e.when} · {e.label}
            </span>
            <button
              type="button"
              className="link-button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await removeStudyTime(e.id);
                  setError(r.error ?? null);
                })
              }
              aria-label={`${e.when} の ${e.label} を取り消す`}
            >
              取り消す
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
