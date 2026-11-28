"use client";

import { useActionState } from "react";
import { agreeToTerms } from "./actions";

export default function AgreeForm() {
  const [state, action, pending] = useActionState(agreeToTerms, { error: null });
  return (
    <form action={action} className="add-form auth-form">
      <TermsCheckbox />
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "記録中…" : "同意して使う"}
      </button>
    </form>
  );
}

// 新規登録・おためし・同意の画面で使う、利用規約に同意するチェック（name="terms"）
export function TermsCheckbox() {
  return (
    <label className="check-label">
      <input type="checkbox" name="terms" required />
      <span>
        <a href="/terms" target="_blank" rel="noopener">
          利用規約
        </a>
        を読み、同意します（無料の実験中のサービスで、何も保証されず、損害について運営者が責任を負わないことを含みます）
      </span>
    </label>
  );
}
