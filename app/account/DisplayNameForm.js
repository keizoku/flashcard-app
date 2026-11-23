"use client";

import { useActionState } from "react";
import { updateDisplayName } from "./actions";

// 表示名の入力欄。公開したデッキに、作った人として出る
export default function DisplayNameForm({ initialName, maxLength }) {
  const [state, action, pending] = useActionState(updateDisplayName, { error: null, saved: false });
  return (
    <form action={action} className="add-form auth-form">
      <label>
        表示名
        <input name="displayName" defaultValue={initialName ?? ""} maxLength={maxLength} placeholder="例: たろう" />
      </label>
      <p className="note small">公開した単語帳に、作った人として出ます（メールアドレスはほかの人には見えません）。</p>
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="success" role="status">
          {state.name ? `表示名を「${state.name}」にしました。` : "表示名を消しました。"}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "保存中…" : "表示名を保存"}
      </button>
    </form>
  );
}
