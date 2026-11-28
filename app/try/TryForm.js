"use client";

import { useActionState } from "react";
import { TermsCheckbox } from "@/app/agree/AgreeForm";
import { startGuest } from "./actions";

export default function TryForm() {
  const [state, action, pending] = useActionState(startGuest, { error: null });
  return (
    <form action={action} className="add-form auth-form">
      <label className="check-label">
        <input type="checkbox" name="agree" required />
        1日たつと、アカウントも作ったものもすべて削除されることを確かめました
      </label>
      <TermsCheckbox />
      <button type="submit" disabled={pending}>
        {pending ? "準備中…" : "同意して、おためしを始める"}
      </button>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
