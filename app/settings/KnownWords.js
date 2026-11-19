"use client";

import { useTransition } from "react";
import { displayTarget } from "@/lib/format";
import { forgetKnownWord } from "./actions";

export default function KnownWords({ words }) {
  const [pending, startTransition] = useTransition();
  if (words.length === 0) {
    return <p className="note small">まだありません。例文の候補で「知ってる」を押すと、ここに並びます。</p>;
  }
  return (
    <ul className="known-words">
      {words.map((w) => (
        <li key={w}>
          <span>{displayTarget(w)}</span>
          <button
            type="button"
            className="link-button"
            disabled={pending}
            onClick={() => startTransition(async () => void (await forgetKnownWord(w)))}
            aria-label={`${w} を取り消す`}
          >
            取り消す
          </button>
        </li>
      ))}
    </ul>
  );
}
